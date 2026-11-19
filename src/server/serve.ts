// Local read-only server of the standalone app: static files of the built
// app and the view document at /api/view. Loopback only, GET/HEAD only, no
// telemetry, no outbound requests. No React import: the CLI runs without it.

import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { checkView } from '../model/compat.ts';
import { harnessView, type HarnessViewOptions, type HarnessViewResult } from './harness.ts';

export const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'] as const;
export const DEFAULT_PORT = 4790;
/** How many consecutive ports the probe tries when no port was given. */
export const PORT_PROBE_SPAN = 20;

export interface ServeOptions {
  /** File with an operator view JSON; re-read on every request. */
  viewFile?: string;
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
  /** Explicit port: used as is, busy = error. Absent: probe from DEFAULT_PORT. */
  port?: number;
  version: string;
}

export interface RunningServer {
  url: string;
  host: string;
  port: number;
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

async function serveViewFile(req: IncomingMessage, res: ServerResponse, file: string) {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return jsonError(res, 503, 'VIEW_UNAVAILABLE', 'View file is not readable yet.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return jsonError(res, 502, 'NOT_A_VIEW', 'View file is not JSON.');
  }
  if (typeof parsed === 'object' && parsed !== null && (parsed as { ok?: unknown }).ok === false) {
    return jsonError(res, 502, 'NOT_A_VIEW', 'View file holds a harness error envelope.');
  }
  return sendView(req, res, unwrapView(parsed));
}

function sendView(req: IncomingMessage, res: ServerResponse, view: unknown) {
  const check = checkView(view);
  if (!check.ok) return jsonError(res, 409, check.code, check.message);
  // The ETag is derived from the content, never from a store counter.
  const body = Buffer.from(JSON.stringify(view));
  const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0, 32) + '"';
  const headers = { etag, 'cache-control': 'no-store' };
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
  const liveView = (lang: 'ru' | 'en') => {
    const key = live!.lang ? lang : '';
    let p = inFlight.get(key);
    if (!p) {
      p = harnessView(live!, live!.lang ? lang : undefined).finally(() => inFlight.delete(key));
      inFlight.set(key, p);
    }
    return p;
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
    if (pathname === '/api/view') {
      if (live) {
        const asked = new URL(req.url ?? '/', 'http://local').searchParams.get('lang');
        const lang = asked === 'ru' || asked === 'en' ? asked : live.defaultLang;
        const r = await liveView(lang);
        return r.ok ? sendView(req, res, r.view) : jsonError(res, 503, r.code, r.message);
      }
      return serveViewFile(req, res, options.viewFile!);
    }
    if (pathname === '/api/health') {
      return send(
        res,
        200,
        JSON.stringify({ ok: true, version: options.version, readOnly: true }),
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
        close: () =>
          new Promise((ok) => {
            server.close(() => ok());
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
