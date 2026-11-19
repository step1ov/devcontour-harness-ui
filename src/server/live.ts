// Live updates of the standalone server (slice S3). The installed harness
// has no push channel (`harness serve-view` is a proposal), so the panel
// detects changes itself and pushes them to the page over SSE
// (`GET /api/events`):
//
// - A watch exists only while at least one page holds a stream. With no
//   stream there is no timer, no stat and no harness run.
// - `check` computes the document (a `harness view` run, or a file read)
//   and its content token; `hint` is a cheap signature (file mtimes) polled
//   every second, and a changed hint checks at once.
// - Without a hint change the watch re-checks on an interval that doubles
//   while nothing changes (backoff), up to `maxMs`; a change resets it.
// - The page closes its stream while the tab is hidden, so a hidden tab
//   costs nothing either.
//
// Events (one JSON object in `data`):
//   view  {token, checkedAt}  the content token differs from the last one sent
//   fresh {token, checkedAt}  checked again, same content (live route only)
//   stale {code, message, since, checkedAt}  the check failed or timed out;
//                             `since` is the first failure of this streak
//   ping  {}                  every 15 s, so a page can tell a dead stream

import type { ServerResponse } from 'node:http';

export type CheckResult =
  | { ok: true; token: string; checkedAt: string; activeWork?: boolean }
  | { ok: false; code: string; message: string; checkedAt: string };

export interface WatchSpec {
  check(): Promise<CheckResult>;
  /** Cheap change signature, polled every `hintMs`; a different value checks at once. */
  hint?(): Promise<string>;
  /** First interval between checks without a hint change; `undefined` = only on a hint change. */
  minMs?: number;
  /** Backoff ceiling. */
  maxMs?: number;
  /** Ceiling while the last document shows running work (leases, liveness change without a write). */
  activeMaxMs?: number;
  /** Send `fresh` after an unchanged check (the live route; a file has no check time of its own). */
  fresh: boolean;
}

export const HINT_MS = 1_000;
export const PING_MS = 15_000;
/** Streams one server keeps open at once; more get 503. */
export const MAX_STREAMS = 32;

interface Watch {
  spec: WatchSpec;
  streams: Set<ServerResponse>;
  hintTimer?: NodeJS.Timeout;
  checkTimer?: NodeJS.Timeout;
  lastHint?: string;
  checking: boolean;
  /** A check was asked while one was running. */
  again: boolean;
  interval: number | undefined;
  last?: CheckResult;
  lastToken?: string;
  failingSince?: string;
  stopped: boolean;
}

function write(res: ServerResponse, event: string, data: unknown) {
  if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export interface LiveHub {
  /** Opens an SSE stream on `res` for the watch `key`, created from `spec()` if new. */
  attach(res: ServerResponse, key: string, spec: () => WatchSpec): boolean;
  /** Counts for tests and measurements. */
  stats(): { watches: number; streams: number; checks: number; hints: number };
  close(): void;
}

export function liveHub(): LiveHub {
  const watches = new Map<string, Watch>();
  let streams = 0;
  let checks = 0;
  let hints = 0;

  const event = (w: Watch, r: CheckResult): [string, unknown] | undefined => {
    if (!r.ok)
      return [
        'stale',
        { code: r.code, message: r.message, since: w.failingSince, checkedAt: r.checkedAt },
      ];
    return undefined;
  };

  const broadcast = (w: Watch, name: string, data: unknown) => {
    for (const res of w.streams) write(res, name, data);
  };

  const schedule = (w: Watch) => {
    if (w.stopped || w.interval === undefined) return;
    clearTimeout(w.checkTimer);
    w.checkTimer = setTimeout(() => void runCheck(w), w.interval);
  };

  const runCheck = async (w: Watch) => {
    if (w.stopped) return;
    if (w.checking) {
      w.again = true;
      return;
    }
    w.checking = true;
    clearTimeout(w.checkTimer);
    checks++;
    let r: CheckResult;
    try {
      r = await w.spec.check();
    } catch (err) {
      r = {
        ok: false,
        code: 'VIEW_UNAVAILABLE',
        message: (err as Error).message,
        checkedAt: new Date().toISOString(),
      };
    }
    w.checking = false;
    if (w.stopped) return;
    w.last = r;
    const { minMs, maxMs = minMs, activeMaxMs } = w.spec;
    if (r.ok) {
      w.failingSince = undefined;
      const changed = r.token !== w.lastToken;
      w.lastToken = r.token;
      if (changed) broadcast(w, 'view', { token: r.token, checkedAt: r.checkedAt });
      else if (w.spec.fresh) broadcast(w, 'fresh', { token: r.token, checkedAt: r.checkedAt });
      if (minMs !== undefined) {
        const ceiling = r.activeWork && activeMaxMs !== undefined ? activeMaxMs : maxMs!;
        w.interval = changed ? minMs : Math.min((w.interval ?? minMs) * 2, ceiling);
      }
    } else {
      w.failingSince ??= r.checkedAt;
      const [name, data] = event(w, r)!;
      broadcast(w, name, data);
      // A failing harness backs off like an idle one.
      if (minMs !== undefined) w.interval = Math.min((w.interval ?? minMs) * 2, maxMs!);
    }
    if (w.again) {
      w.again = false;
      void runCheck(w);
    } else schedule(w);
  };

  const pollHint = async (w: Watch) => {
    if (w.stopped || !w.spec.hint) return;
    hints++;
    let h: string;
    try {
      h = await w.spec.hint();
    } catch {
      h = 'unreadable';
    }
    if (w.stopped) return;
    const changed = w.lastHint !== undefined && h !== w.lastHint;
    w.lastHint = h;
    if (changed) {
      if (w.spec.minMs !== undefined) w.interval = w.spec.minMs;
      void runCheck(w);
    }
    w.hintTimer = setTimeout(() => void pollHint(w), HINT_MS);
  };

  const stop = (key: string, w: Watch) => {
    w.stopped = true;
    clearTimeout(w.hintTimer);
    clearTimeout(w.checkTimer);
    watches.delete(key);
  };

  return {
    attach(res, key, spec) {
      if (streams >= MAX_STREAMS) return false;
      let w = watches.get(key);
      const fresh = !w;
      if (!w) {
        const s = spec();
        w = {
          spec: s,
          streams: new Set(),
          checking: false,
          again: false,
          interval: s.minMs,
          stopped: false,
        };
        watches.set(key, w);
      }
      const watch = w;
      watch.streams.add(res);
      streams++;
      // Tell a late subscriber what the watch already knows.
      if (!fresh && watch.last) {
        if (watch.last.ok)
          write(res, 'view', { token: watch.last.token, checkedAt: watch.last.checkedAt });
        else {
          const [name, data] = event(watch, watch.last)!;
          write(res, name, data);
        }
      }
      const ping = setInterval(() => write(res, 'ping', {}), PING_MS);
      res.once('close', () => {
        clearInterval(ping);
        streams--;
        watch.streams.delete(res);
        if (watch.streams.size === 0) stop(key, watch);
      });
      if (fresh) {
        void runCheck(watch);
        if (watch.spec.hint) void pollHint(watch);
      }
      return true;
    },
    stats: () => ({ watches: watches.size, streams, checks, hints }),
    close() {
      for (const [key, w] of watches) {
        for (const res of w.streams) res.end();
        stop(key, w);
      }
    },
  };
}
