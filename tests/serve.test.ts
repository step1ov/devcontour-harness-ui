import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_PORT, ServeError, startServer } from '../src/server/serve.ts';

const viewFile = fileURLToPath(new URL('../fixtures/view.sample.json', import.meta.url));
// A fresh empty directory: no app bundle, so the fallback page is served.
const appDir = mkdtempSync(join(tmpdir(), 'hui-app-'));

function get(
  url: string,
  init: { method?: string; host?: string; headers?: Record<string, string> } = {},
) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (ok, fail) => {
      const u = new URL(url);
      const req = request(
        {
          host: u.hostname,
          port: u.port,
          path: u.pathname,
          method: init.method ?? 'GET',
          agent: false,
          headers: { ...(init.host ? { host: init.host } : {}), ...init.headers },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body }));
        },
      );
      req.on('error', fail);
      req.end();
    },
  );
}

test('serves the view read-only on 127.0.0.1 with a probed port', async () => {
  const s = await startServer({ viewFile, appDir, version: 'test' });
  try {
    assert.equal(s.host, '127.0.0.1');
    assert.ok(s.port >= DEFAULT_PORT && s.port < DEFAULT_PORT + 20);
    const view = await get(s.url + 'api/view');
    assert.equal(view.status, 200);
    assert.equal(JSON.parse(view.body).viewVersion, 1);
    assert.equal(view.headers['cache-control'], 'no-store');
    assert.match(String(view.headers['content-security-policy']), /default-src 'self'/);
    const again = await get(s.url + 'api/view', {
      headers: { 'if-none-match': String(view.headers.etag) },
    });
    assert.equal(again.status, 304);
    const page = await get(s.url);
    assert.equal(page.status, 200);
    assert.match(page.body, /not built/);
    assert.equal((await get(s.url + 'api/view', { method: 'POST' })).status, 405);
    assert.equal((await get(s.url + '..%2f..%2fetc%2fpasswd')).status, 404);
  } finally {
    await s.close();
  }
});

test('a foreign Host header is refused (DNS rebinding guard)', async () => {
  const s = await startServer({ viewFile, appDir, version: 'test' });
  try {
    const res = await get(s.url + 'api/view', { host: `evil.example:${s.port}` });
    assert.equal(res.status, 421);
  } finally {
    await s.close();
  }
});

test('non-loopback hosts are refused before listening', async () => {
  for (const host of ['0.0.0.0', '::', '192.168.1.10']) {
    await assert.rejects(
      startServer({ viewFile, appDir, version: 'test', host }),
      (err: unknown) => err instanceof ServeError && err.code === 'HOST_NOT_LOOPBACK',
    );
  }
});

test('an explicit busy port is an error, not a silent switch', async () => {
  const blocker = createServer();
  await new Promise<void>((ok) => blocker.listen({ host: '127.0.0.1', port: 0 }, ok));
  const port = (blocker.address() as { port: number }).port;
  try {
    await assert.rejects(
      startServer({ viewFile, appDir, version: 'test', port }),
      (err: unknown) => err instanceof ServeError && err.code === 'PORT_BUSY',
    );
  } finally {
    await new Promise<void>((ok) => blocker.close(() => ok()));
  }
});

test('an incompatible view file is reported, not served', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hui-view-'));
  const file = join(dir, 'view.json');
  writeFileSync(file, JSON.stringify({ viewVersion: 99 }));
  const s = await startServer({ viewFile: file, appDir, version: 'test' });
  try {
    const res = await get(s.url + 'api/view');
    assert.equal(res.status, 409);
    assert.equal(JSON.parse(res.body).error.code, 'VIEW_VERSION_UNSUPPORTED');
  } finally {
    await s.close();
  }
});
