// Local read-only server of the standalone app: static files of the built
// app and the view document at /api/view. Loopback only, GET/HEAD only, no
// telemetry, no outbound requests. No React import: the CLI runs without it.

import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { checkView, checkWorkDetail } from '../model/compat.ts';
import { liveHub, MAX_STREAMS, type WatchSpec } from './live.ts';
import {
  harnessView,
  stopHarnessRuns,
  type HarnessViewOptions,
  type HarnessViewResult,
} from './harness.ts';

export const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'] as const;
export const DEFAULT_PORT = 4790;
/** How many consecutive ports the probe tries when no port was given. */
export const PORT_PROBE_SPAN = 20;
/** Harness processes the live route runs at once; more requests queue. */
export const MAX_RUNS = 4;
/** Requests queued behind the running ones; beyond that a request gets 503 at once. */
export const MAX_WAITING = 16;

/** Live route: first re-check interval while a page is connected; doubles while nothing changes. */
export const LIVE_MIN_MS = 2_000;
/** Backoff ceiling of the live route while no work runs. */
export const LIVE_MAX_MS = 15_000;
/** Ceiling while work runs: leases and liveness change without a store write (design §3.10). */
export const LIVE_ACTIVE_MAX_MS = 5_000;
/** A request within this time after a watch check reuses its result instead of running harness again. */
export const RECENT_MS = 1_500;

/** Most results the reuse cache holds. */
export const RECENT_MAX = 64;

/**
 * Last good result per key for `ttlMs`, at most `max` keys (oldest dropped
 * first). Expired entries go on every write and on read; `set(key,
 * undefined)` forgets a key (a refusal is never reused).
 */
export class RecentCache<V> {
  private readonly map = new Map<string, { at: number; value: V }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}
  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.now() - e.at >= this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }
  set(key: string, value: V | undefined) {
    const now = this.now();
    for (const [k, e] of this.map) if (now - e.at >= this.ttlMs) this.map.delete(k);
    this.map.delete(key);
    if (value === undefined) return;
    this.map.set(key, { at: now, value });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
  get size() {
    return this.map.size;
  }
}

export interface ServeOptions {
  /** File with an operator view JSON; re-read on every request. */
  viewFile?: string;
  /**
   * Work detail documents of a file view, by work id (the demo); re-read on
   * every request. A file view without one has no detail route (503).
   */
  workFiles?: Record<string, string>;
  /**
   * File views written in another language (the demo): a request with
   * `?lang=<lang>` gets these files instead of `viewFile` / `workFiles`.
   */
  localized?: Partial<
    Record<'ru' | 'en', { viewFile: string; workFiles?: Record<string, string> }>
  >;
  /**
   * Live route instead of a file: `harness view` runs on every request
   * (concurrent requests for one language share a run).
   */
  harness?: HarnessViewOptions & {
    /** The installed harness takes `--lang`; otherwise it is not passed. */
    lang: boolean;
    /** Language when the request has no valid `?lang=ru|en`. */
    defaultLang: 'ru' | 'en';
  };
  /** Directory of the built app (dist/app); missing = a plain fallback page. */
  appDir: string;
  host?: string;
  /** Interface language of the CLI (`--lang` or the system locale), reported by /api/health. */
  lang?: 'ru' | 'en';
  /** Live update intervals (tests shorten them); defaults: LIVE_MIN_MS, LIVE_MAX_MS, LIVE_ACTIVE_MAX_MS. */
  liveIntervals?: { minMs: number; maxMs: number; activeMaxMs: number };
  /** Explicit port: used as is, busy = error. Absent: probe from DEFAULT_PORT. */
  port?: number;
  version: string;
}

export interface RunningServer {
  url: string;
  host: string;
  port: number;
  /** Open live streams and the work they caused (tests, measurements). */
  live(): { watches: number; streams: number; checks: number; hints: number };
  close(): Promise<void>;
}

export class ServeError extends Error {
  constructor(
    readonly code: 'HOST_NOT_LOOPBACK' | 'PORT_BUSY' | 'PORT_INVALID',
    message: string,
  ) {
    super(message);
  }
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const securityHeaders = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

const fallbackPage = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Harness panel</title></head>
<body><p>The app bundle is not built. Run <code>npm run build</code>; the raw view is at
<a href="api/view">api/view</a>.</p></body></html>`;

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
  extra = {},
) {
  res.writeHead(status, { ...securityHeaders, 'content-type': type, ...extra });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

/** Host header must name this loopback listener (DNS-rebinding guard). */
function hostAllowed(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host;
  if (!host) return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host.toLowerCase());
}

const jsonError = (res: ServerResponse, status: number, code: string, message: string) =>
  send(res, status, JSON.stringify({ error: { code, message } }), types['.json']!);

/**
 * The view file holds either a bare view or the harness envelope
 * `{ ok: true, data: <view> }` exactly as `harness view` prints it.
 */
export function unwrapView(parsed: unknown): unknown {
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { ok?: unknown }).ok === true &&
    'data' in parsed
  ) {
    return (parsed as { data: unknown }).data;
  }
  return parsed;
}

/** Work ids as the harness graph schema allows them (`[A-Za-z0-9_-]{1,80}`). */
export const WORK_ID = /^[A-Za-z0-9_-]{1,80}$/;

type Gate = (v: unknown) => { ok: true } | { ok: false; code: string; message: string };
const viewGate: Gate = checkView;
const detailGate: Gate = checkWorkDetail;

type FileRead =
  | { ok: true; view: unknown; bytes: Buffer }
  | { ok: false; status: number; code: string; message: string };

async function readViewFile(file: string): Promise<FileRead> {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'VIEW_UNAVAILABLE',
      message: 'View file is not readable yet.',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, status: 502, code: 'NOT_A_VIEW', message: 'View file is not JSON.' };
  }
  if (typeof parsed === 'object' && parsed !== null && (parsed as { ok?: unknown }).ok === false) {
    return {
      ok: false,
      status: 502,
      code: 'NOT_A_VIEW',
      message: 'View file holds a harness error envelope.',
    };
  }
  return { ok: true, view: unwrapView(parsed), bytes };
}

async function serveViewFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  gate: Gate = viewGate,
) {
  const r = await readViewFile(file);
  if (!r.ok) return jsonError(res, r.status, r.code, r.message);
  return sendView(req, res, r.view, gate);
}

const hashOf = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/**
 * Change digest of a live document (`harness view`), sent in SSE events and
 * in the `x-hui-digest` header of `GET /api/view` so the page knows which
 * content it shows. The harness `source.token` cannot serve: harness
 * 0.1.0-alpha.55 hashes the history window, which ends at the projection
 * clock, so the token differs on every run of an unchanged state. The digest
 * hashes the document without `generatedAt` and `source.token`, and with
 * the window bounds cut to the minute: an unchanged state is the same digest
 * within a minute, and the window labels the screens show lag at most a
 * minute. Clock-relative fields the harness computes (ages, elapsed times)
 * do change it: the screens show them.
 */
export function digestOf(view: unknown): string {
  // The instant cut to the minute, in UTC: offsets never hide an hour.
  const minute = (v: unknown) => {
    const ms = typeof v === 'string' ? Date.parse(v) : NaN;
    return Number.isNaN(ms) ? v : new Date(ms - (ms % 60_000)).toISOString();
  };
  const strip = (v: unknown): unknown => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const o = { ...(v as Record<string, unknown>) };
    delete o.generatedAt;
    if (typeof o.source === 'object' && o.source !== null && !Array.isArray(o.source)) {
      const source = { ...(o.source as Record<string, unknown>) };
      delete source.token;
      o.source = source;
    }
    if (typeof o.history === 'object' && o.history !== null && !Array.isArray(o.history)) {
      const history = { ...(o.history as Record<string, unknown>) };
      history.from = minute(history.from);
      history.to = minute(history.to);
      o.history = history;
    }
    return o;
  };
  return hashOf(JSON.stringify(strip(view)));
}

/** Digest of a file snapshot: every byte, `generatedAt` included (the snapshot time is its content). */
export const fileDigestOf = (view: unknown): string => 'file:' + hashOf(JSON.stringify(view));

/** The document shows running work: re-check at least every LIVE_ACTIVE_MAX_MS. */
function activeWork(view: unknown): boolean {
  const v = view as {
    progress?: { running?: unknown };
    attempts?: { finishedAt?: unknown }[];
  } | null;
  if (typeof v?.progress?.running === 'number') return v.progress.running > 0;
  const a = Array.isArray(v?.attempts) ? v.attempts[0] : undefined;
  return a !== undefined && a !== null && typeof a === 'object' && a.finishedAt === undefined;
}

/** Cheap change signature of paths: mtime, size and inode; a missing path is `-`. */
async function signature(paths: string[]): Promise<string> {
  const parts = await Promise.all(
    paths.map((p) =>
      stat(p).then(
        (s) => `${s.mtimeMs}:${s.size}:${s.ino}`,
        () => '-',
      ),
    ),
  );
  return parts.join('|');
}

function sendView(
  req: IncomingMessage,
  res: ServerResponse,
  view: unknown,
  gate: Gate = viewGate,
  digest: (v: unknown) => string = fileDigestOf,
) {
  const check = gate(view);
  if (!check.ok) return jsonError(res, 409, check.code, check.message);
  // The ETag is derived from the bytes, never from a store counter; the
  // digest is the identity the live stream reports for this content.
  const body = Buffer.from(JSON.stringify(view));
  const etag = '"' + hashOf(body).slice(0, 32) + '"';
  const headers = { etag, 'cache-control': 'no-store', 'x-hui-digest': digest(view) };
  if (req.headers['if-none-match'] === etag) return send(res, 304, '', types['.json']!, headers);
  return send(res, 200, body, types['.json']!, headers);
}

const inside = (root: string, file: string) => file === root || file.startsWith(root + sep);

async function serveStatic(res: ServerResponse, appDir: string, pathname: string) {
  const notFound = () => send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const wanted = pathname === '/' ? '/index.html' : pathname;
  let root: string;
  try {
    root = await realpath(resolve(appDir));
  } catch {
    return wanted === '/index.html' ? send(res, 200, fallbackPage, types['.html']!) : notFound();
  }
  const lexical = resolve(join(root, wanted));
  if (!inside(root, lexical)) return notFound();
  try {
    // Containment is checked on the real path too: a symlink inside the app
    // directory must not reach files outside it.
    const real = await realpath(lexical);
    if (!inside(root, real) || !(await stat(real)).isFile()) return notFound();
    return send(res, 200, await readFile(real), types[extname(real)] ?? 'application/octet-stream');
  } catch {
    if (wanted === '/index.html') return send(res, 200, fallbackPage, types['.html']!);
    return notFound();
  }
}

function listen(server: Server, host: string, port: number): Promise<boolean> {
  return new Promise((ok, fail) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (err.code === 'EADDRINUSE') ok(false);
      else fail(err);
    };
    const onListening = () => {
      server.off('error', onError);
      ok(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port, exclusive: true });
  });
}

export async function startServer(options: ServeOptions): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  if (!(LOOPBACK_HOSTS as readonly string[]).includes(host)) {
    throw new ServeError(
      'HOST_NOT_LOOPBACK',
      `Refusing to listen on ${host}: the panel binds only to 127.0.0.1, ::1 or localhost.`,
    );
  }
  if (
    options.port !== undefined &&
    (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
  ) {
    throw new ServeError('PORT_INVALID', `Port ${options.port} is not in 1-65535.`);
  }
  if ((options.viewFile === undefined) === (options.harness === undefined))
    throw new TypeError('startServer: pass exactly one of viewFile and harness');
  const live = options.harness;
  // One `harness view` run per language at a time; later requests share it.
  const inFlight = new Map<string, Promise<HarnessViewResult>>();
  // At most MAX_RUNS harness processes at once and MAX_WAITING queued behind
  // them: distinct work ids cannot fan out into unbounded processes.
  let running = 0;
  const waiting: (() => void)[] = [];
  const cancelled: HarnessViewResult = {
    ok: false,
    code: 'VIEW_UNAVAILABLE',
    message: 'Nobody waits for this harness run any more.',
  };
  const limited = (
    run: () => Promise<HarnessViewResult>,
    wanted: () => boolean,
  ): Promise<HarnessViewResult> => {
    if (running >= MAX_RUNS && waiting.length >= MAX_WAITING)
      return Promise.resolve({
        ok: false,
        code: 'VIEW_UNAVAILABLE',
        message: 'The panel is busy with other harness runs; try again shortly.',
      });
    const start = () => {
      // A queued run whose callers are all gone never starts a process.
      if (!wanted()) {
        waiting.shift()?.();
        return Promise.resolve(cancelled);
      }
      running++;
      return run().finally(() => {
        running--;
        waiting.shift()?.();
      });
    };
    if (running < MAX_RUNS) return start();
    return new Promise((ok) => waiting.push(() => void start().then(ok)));
  };
  // The last good result of each live document, so that the page's GET right
  // after a pushed change does not run harness a second time. Entries expire
  // after RECENT_MS and the map holds at most RECENT_MAX: arbitrary work ids
  // cannot grow it.
  const recent = new RecentCache<HarnessViewResult>(RECENT_MS, RECENT_MAX);
  const liveKey = (lang: 'ru' | 'en', workId?: string) =>
    (live!.lang ? lang : '') + (workId !== undefined ? '\0' + workId : '');
  // A run shared by several callers is wanted while any of them still wants it.
  const inFlightWants = new Map<string, (() => boolean)[]>();
  const liveView = (
    lang: 'ru' | 'en',
    workId?: string,
    reuse = false,
    wanted: () => boolean = () => true,
  ) => {
    const key = liveKey(lang, workId);
    const r = reuse ? recent.get(key) : undefined;
    if (r) return Promise.resolve(r);
    let p = inFlight.get(key);
    if (p) {
      inFlightWants.get(key)?.push(wanted);
      return p;
    }
    const wants = [wanted];
    inFlightWants.set(key, wants);
    p = limited(
      () => harnessView(live!, live!.lang ? lang : undefined, workId),
      () => wants.some((w) => w()),
    )
      .then((result) => {
        if (result !== cancelled) recent.set(key, result.ok ? result : undefined);
        return result;
      })
      .finally(() => {
        inFlight.delete(key);
        inFlightWants.delete(key);
      });
    inFlight.set(key, p);
    return p;
  };
  const hub = liveHub();
  const intervals = options.liveIntervals ?? {
    minMs: LIVE_MIN_MS,
    maxMs: LIVE_MAX_MS,
    activeMaxMs: LIVE_ACTIVE_MAX_MS,
  };
  const liveSpec = (lang: 'ru' | 'en', workId?: string): WatchSpec => ({
    check: async (wanted) => {
      const r = await liveView(lang, workId, false, wanted);
      const checkedAt = new Date().toISOString();
      if (!r.ok) return { ok: false, code: r.code, message: r.message, checkedAt };
      return { ok: true, token: digestOf(r.view), checkedAt, activeWork: activeWork(r.view) };
    },
    hint: () =>
      signature([
        live!.state,
        join(live!.state, 'state.sqlite'),
        join(live!.state, 'state.sqlite-wal'),
        ...(live!.policy !== undefined ? [live!.policy] : []),
      ]),
    ...intervals,
    fresh: true,
  });
  const fileSpec = (file: string, gate: Gate): WatchSpec => ({
    check: async () => {
      const checkedAt = new Date().toISOString();
      const r = await readViewFile(file);
      if (!r.ok) return { ...r, checkedAt };
      // An incompatible document still gets a token: the page then reads the refusal.
      return {
        ok: true,
        token: gate(r.view).ok ? fileDigestOf(r.view) : 'refused:' + hashOf(r.bytes),
        checkedAt,
      };
    },
    hint: () => signature([file]),
    fresh: false,
  });
  /** The file view for a request: the localized files of `?lang=`, else the defaults. */
  const fileSource = (params: URLSearchParams) => {
    const asked = params.get('lang');
    const l = asked === 'ru' || asked === 'en' ? options.localized?.[asked] : undefined;
    return l ?? { viewFile: options.viewFile, workFiles: options.workFiles };
  };
  let port = 0;
  const server = createServer((req, res) => {
    const failed = () => {
      if (!res.headersSent) send(res, 500, 'Internal error', 'text/plain; charset=utf-8');
      else res.destroy();
    };
    try {
      handle(req, res).catch(failed);
    } catch {
      failed();
    }
  });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (!hostAllowed(req, port))
      return send(res, 421, 'Misdirected request', 'text/plain; charset=utf-8');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'The panel is read-only', 'text/plain; charset=utf-8', {
        allow: 'GET, HEAD',
      });
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    } catch {
      return send(res, 400, 'Bad request', 'text/plain; charset=utf-8');
    }
    if (pathname.includes('\0')) return send(res, 400, 'Bad request', 'text/plain; charset=utf-8');
    const params = new URL(req.url ?? '/', 'http://local').searchParams;
    // Work detail: `/api/work/<id>`, or `/api/view?work=<id>` as in the design contract.
    const workId = pathname.startsWith('/api/work/')
      ? pathname.slice('/api/work/'.length)
      : pathname === '/api/view' && params.has('work')
        ? (params.get('work') ?? '')
        : undefined;
    if (workId !== undefined) {
      if (!WORK_ID.test(workId))
        return jsonError(res, 404, 'VIEW_UNAVAILABLE', 'There is no such work order id.');
      if (live) {
        const asked = params.get('lang');
        const lang = asked === 'ru' || asked === 'en' ? asked : live.defaultLang;
        const r = await liveView(lang, workId, true);
        return r.ok
          ? sendView(req, res, r.view, detailGate, digestOf)
          : jsonError(res, 503, r.code, r.message);
      }
      const files = fileSource(params).workFiles;
      const file = files && Object.hasOwn(files, workId) ? files[workId] : undefined;
      if (!file)
        return jsonError(
          res,
          503,
          'VIEW_UNAVAILABLE',
          `No work detail for ${workId} in this file view; the live route (--state) computes it with \`harness view --work\`.`,
        );
      return serveViewFile(req, res, file, detailGate);
    }
    if (pathname === '/api/events') {
      const asked = params.get('lang');
      const lang = asked === 'ru' || asked === 'en' ? asked : (live?.defaultLang ?? 'en');
      const work = params.has('work') ? (params.get('work') ?? '') : undefined;
      if (work !== undefined && !WORK_ID.test(work))
        return jsonError(res, 404, 'VIEW_UNAVAILABLE', 'There is no such work order id.');
      let key: string;
      let spec: () => WatchSpec;
      if (live) {
        key = 'live\0' + liveKey(lang, work);
        spec = () => liveSpec(lang, work);
      } else {
        const src = fileSource(params);
        const file =
          work === undefined
            ? src.viewFile
            : src.workFiles && Object.hasOwn(src.workFiles, work)
              ? src.workFiles[work]
              : undefined;
        if (!file)
          return jsonError(
            res,
            503,
            'VIEW_UNAVAILABLE',
            `No work detail for ${work} in this file view.`,
          );
        key = 'file\0' + (work === undefined ? 'view' : 'work') + '\0' + file;
        spec = () => fileSpec(file, work === undefined ? viewGate : detailGate);
      }
      if (hub.stats().streams >= MAX_STREAMS)
        return jsonError(
          res,
          503,
          'VIEW_UNAVAILABLE',
          'Too many open live streams; the page polls instead.',
        );
      res.writeHead(200, {
        ...securityHeaders,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      if (req.method === 'HEAD') return void res.end();
      // The page retries a lost stream itself (it falls back to polling first).
      res.write('retry: 5000\n\n');
      hub.attach(res, key, spec);
      return;
    }
    if (pathname === '/api/view') {
      if (live) {
        const asked = params.get('lang');
        const lang = asked === 'ru' || asked === 'en' ? asked : live.defaultLang;
        const r = await liveView(lang, undefined, true);
        return r.ok
          ? sendView(req, res, r.view, viewGate, digestOf)
          : jsonError(res, 503, r.code, r.message);
      }
      return serveViewFile(req, res, fileSource(params).viewFile!);
    }
    if (pathname === '/api/health') {
      return send(
        res,
        200,
        JSON.stringify({
          ok: true,
          version: options.version,
          readOnly: true,
          // What /api/events watches: a live `harness view` or a file.
          live: live ? 'state' : 'file',
          ...(options.lang ? { lang: options.lang } : {}),
        }),
        types['.json']!,
      );
    }
    return serveStatic(res, options.appDir, pathname);
  }
  const candidates =
    options.port !== undefined
      ? [options.port]
      : Array.from({ length: PORT_PROBE_SPAN }, (_, i) => DEFAULT_PORT + i);
  for (const candidate of candidates) {
    if (await listen(server, host, candidate)) {
      port = candidate;
      const shown = host === '::1' ? '[::1]' : host;
      return {
        url: `http://${shown}:${port}/`,
        host,
        port,
        live: () => hub.stats(),
        close: () =>
          new Promise((ok) => {
            hub.close();
            // Running `harness view` processes end with the panel.
            const runs = live ? stopHarnessRuns() : Promise.resolve();
            server.close(() => void runs.then(() => ok()));
            server.closeAllConnections();
          }),
      };
    }
  }
  throw new ServeError(
    'PORT_BUSY',
    options.port !== undefined
      ? `Port ${options.port} is busy. Pick another with --port or omit it to probe.`
      : `Ports ${DEFAULT_PORT}-${DEFAULT_PORT + PORT_PROBE_SPAN - 1} are busy. Pass --port.`,
  );
}
