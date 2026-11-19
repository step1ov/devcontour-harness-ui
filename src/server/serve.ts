// Local read-only server of the standalone app: static files of the built
// app and the view document at /api/view. Loopback only, GET/HEAD only, no
// telemetry, no outbound requests. No React import: the CLI runs without it.

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { checkView } from '../model/compat.ts';

export const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'] as const;
export const DEFAULT_PORT = 4790;
/** How many consecutive ports the probe tries when no port was given. */
export const PORT_PROBE_SPAN = 20;

export interface ServeOptions {
  /** File with an operator view JSON; re-read on every request. */
  viewFile: string;
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

async function serveView(req: IncomingMessage, res: ServerResponse, file: string) {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return send(
      res,
      503,
      JSON.stringify({
        error: { code: 'VIEW_UNAVAILABLE', message: 'View file is not readable yet.' },
      }),
      types['.json']!,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return send(
      res,
      502,
      JSON.stringify({ error: { code: 'NOT_A_VIEW', message: 'View file is not JSON.' } }),
      types['.json']!,
    );
  }
  const check = checkView(parsed);
  if (!check.ok) {
    return send(
      res,
      409,
      JSON.stringify({ error: { code: check.code, message: check.message } }),
      types['.json']!,
    );
  }
  const etag = '"' + createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '"';
  const headers = { etag, 'cache-control': 'no-store' };
  if (req.headers['if-none-match'] === etag) return send(res, 304, '', types['.json']!, headers);
  return send(res, 200, bytes, types['.json']!, headers);
}

async function serveStatic(res: ServerResponse, appDir: string, pathname: string) {
  const root = resolve(appDir);
  const wanted = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = resolve(join(root, wanted));
  if (file !== root && !file.startsWith(root + sep)) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  try {
    if ((await stat(file)).isFile()) {
      return send(
        res,
        200,
        await readFile(file),
        types[extname(file)] ?? 'application/octet-stream',
      );
    }
  } catch {
    // fall through
  }
  if (wanted === '/index.html') return send(res, 200, fallbackPage, types['.html']!);
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
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
  let port = 0;
  const server = createServer((req, res) => {
    if (!hostAllowed(req, port))
      return send(res, 421, 'Misdirected request', 'text/plain; charset=utf-8');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'The panel is read-only', 'text/plain; charset=utf-8', {
        allow: 'GET, HEAD',
      });
    }
    const { pathname } = new URL(req.url ?? '/', 'http://local');
    if (pathname === '/api/view') return void serveView(req, res, options.viewFile);
    if (pathname === '/api/health') {
      return send(
        res,
        200,
        JSON.stringify({ ok: true, version: options.version, readOnly: true }),
        types['.json']!,
      );
    }
    return void serveStatic(res, options.appDir, pathname);
  });
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
