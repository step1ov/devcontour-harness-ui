// Data adapter: how a host feeds the components. The standalone app uses
// `httpViewSource` against the local CLI; DevContour implements `ViewSource`
// over its own store. Components never fetch on their own.
//
// Wire contract (docs/design.md §6): `GET <base>/api/view[?lang=ru|en]`
// returns the bare view with an ETag; `GET <base>/api/work/<id>[?lang=]`
// returns the work detail document (`harness view --work <id>`). `lang` asks
// the harness for plain strings in that language (a file view ignores it); a
// compatibility refusal is HTTP 409 and an unavailable document 503, both with
// `{ error: { code, message } }`. The UI CLI and the proposed
// `harness serve-view` serve the same routes.

import {
  checkOverview,
  checkWork,
  checkWorkDetail,
  type SetupCheck,
  type ViewCheck,
  type WorkDetailCheck,
} from './compat.ts';

/** A loaded document may carry the server digest of its content (`x-hui-digest`). */
export interface Digested {
  digest?: string;
}

export interface ViewSource {
  /**
   * Current view or a typed refusal; rejects only on transport failure.
   * Before the harness is set up (revision 5) it may be the setup document
   * (`{ ok: true, setup }`); a host without one returns `ViewCheck` only.
   */
  load(signal?: AbortSignal): Promise<(ViewCheck | SetupCheck) & Digested>;
  /** Work detail document or a typed refusal; absent = the host has no detail route. */
  loadWork?(
    workId: string,
    signal?: AbortSignal,
  ): Promise<(WorkDetailCheck | SetupCheck) & Digested>;
  /**
   * Optional push of changes; returns an unsubscribe function. `onChange()`
   * without an event means "something changed, load again". The standalone
   * server passes a `LiveEvent`, so the page can tell a change from a
   * confirmation and a failed check (design §6, S3).
   */
  subscribe?(onChange: (event?: LiveEvent) => void, options?: SubscribeOptions): () => void;
}

export interface SubscribeOptions {
  /** Watch the work detail document of this work instead of the overview. */
  workId?: string;
}

/**
 * - `view`: the content token changed (`token` of the new document);
 * - `fresh`: checked again at `checkedAt`, same content;
 * - `stale`: the last check failed (`since` = first failure of the streak);
 * - `down`: the stream is gone; the caller polls until it subscribes again.
 */
export type LiveEvent =
  | { kind: 'view'; token: string; checkedAt: string }
  | { kind: 'fresh'; token: string; checkedAt: string }
  | { kind: 'stale'; code: string; message: string; since: string; checkedAt: string }
  | { kind: 'down' };

/** The subset of the browser `EventSource` the adapter uses. */
export interface EventSourceLike {
  readonly readyState: number;
  addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
  close(): void;
  onerror: ((e: unknown) => void) | null;
}
export type EventSourceFactory = new (url: string) => EventSourceLike;

const str = (v: unknown): v is string => typeof v === 'string';

/** Parses one SSE `data` payload into a `LiveEvent`; anything malformed is `undefined`. */
export function liveEventOf(kind: string, data: unknown): LiveEvent | undefined {
  let d: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(data));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    d = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if ((kind === 'view' || kind === 'fresh') && str(d.token) && str(d.checkedAt))
    return { kind, token: d.token, checkedAt: d.checkedAt };
  if (kind === 'stale' && str(d.code) && str(d.message) && str(d.checkedAt))
    return {
      kind,
      code: d.code,
      message: d.message,
      since: str(d.since) ? d.since : d.checkedAt,
      checkedAt: d.checkedAt,
    };
  return undefined;
}

/** A fixed document (tests, previews, a host snapshot), with optional work details by id. */
export function staticViewSource(view: unknown, works: Record<string, unknown> = {}): ViewSource {
  return {
    load: async () => checkOverview(view),
    loadWork: async (id) =>
      Object.hasOwn(works, id)
        ? checkWorkDetail(works[id])
        : { ok: false, code: 'VIEW_UNAVAILABLE', message: `No work detail for ${id}.` },
  };
}

const refusalCodes = new Set(['NOT_A_VIEW', 'VIEW_VERSION_UNSUPPORTED', 'VIEW_UNAVAILABLE']);

export interface HttpViewSourceOptions {
  /** UI language, passed as `?lang=` so the harness writes plain strings in it. */
  lang?: 'ru' | 'en';
  /**
   * `EventSource` for `subscribe` (`GET <base>/api/events`); the global one
   * by default. Without one the source has no `subscribe` and the caller polls.
   */
  eventSource?: EventSourceFactory;
  /** A stream silent this long counts as lost; default STREAM_SILENCE_MS. */
  silenceMs?: number;
}

/** A stream silent for this long (no event, no ping) counts as lost. */
export const STREAM_SILENCE_MS = 45_000;

export function httpViewSource(
  base: string,
  fetchImpl: typeof fetch = fetch,
  options: HttpViewSourceOptions = {},
): ViewSource {
  const root = base.endsWith('/') ? base : base + '/';
  const urlOf = (path: string) => {
    const u = new URL(path, root);
    if (options.lang) u.searchParams.set('lang', options.lang);
    return u.toString();
  };
  async function get<T>(url: string, gate: (v: unknown) => T, signal?: AbortSignal) {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
    if (res.ok) {
      const checked = gate(await res.json());
      // The server's digest of this content (`x-hui-digest`): the identity the
      // live stream reports, so the page knows which content it shows.
      const digest = res.headers?.get?.('x-hui-digest');
      return typeof digest === 'string' && digest !== '' ? { ...checked, digest } : checked;
    }
    // A typed refusal keeps its code and fix hint instead of becoming a
    // generic transport error.
    const body = (await res.json().catch(() => undefined)) as
      { error?: { code?: unknown; message?: unknown } } | undefined;
    const code = body?.error?.code;
    if (typeof code === 'string' && refusalCodes.has(code)) {
      return {
        ok: false as const,
        code: code as 'NOT_A_VIEW',
        message: typeof body?.error?.message === 'string' ? body.error.message : code,
      };
    }
    throw new Error(`GET ${url}: ${res.status}`);
  }
  const viewUrl = urlOf('api/view');
  const ES =
    options.eventSource ?? (globalThis as { EventSource?: EventSourceFactory }).EventSource;
  const subscribe: ViewSource['subscribe'] = (onChange, opts = {}) => {
    const u = new URL(urlOf('api/events'));
    if (opts.workId !== undefined) u.searchParams.set('work', opts.workId);
    let closed = false;
    let silence: ReturnType<typeof setTimeout> | undefined;
    const es = new ES!(u.toString());
    const down = () => {
      if (closed) return;
      closed = true;
      clearTimeout(silence);
      es.close();
      onChange({ kind: 'down' });
    };
    const alive = () => {
      clearTimeout(silence);
      silence = setTimeout(down, options.silenceMs ?? STREAM_SILENCE_MS);
    };
    alive();
    for (const kind of ['view', 'fresh', 'stale'])
      es.addEventListener(kind, (e) => {
        if (closed) return;
        alive();
        const ev = liveEventOf(kind, e.data);
        if (ev) onChange(ev);
      });
    es.addEventListener('ping', () => {
      if (!closed) alive();
    });
    // Any stream error (refused, server gone, reconnecting): the caller polls
    // and subscribes again later, so a broken stream never hides staleness.
    es.onerror = down;
    return () => {
      closed = true;
      clearTimeout(silence);
      es.close();
    };
  };
  return {
    load: (signal) => get(viewUrl, checkOverview, signal),
    loadWork: (id, signal) => get(urlOf('api/work/' + encodeURIComponent(id)), checkWork, signal),
    ...(ES ? { subscribe } : {}),
  };
}
