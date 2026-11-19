import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_PORT, ServeError, startServer } from '../src/server/serve.ts';
import { fakeHarness, recordedArgs } from './fake-harness.ts';

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
          path: u.pathname + u.search,
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

test('a malformed path is a 400 and the server keeps serving', async () => {
  const s = await startServer({ viewFile, appDir, version: 'test' });
  try {
    assert.equal((await get(s.url + '%')).status, 400);
    assert.equal((await get(s.url + '%E0%A4%A')).status, 400);
    assert.equal((await get(s.url + 'a%00b')).status, 400);
    assert.equal((await get(s.url + 'api/health')).status, 200);
  } finally {
    await s.close();
  }
});

test('a symlink inside the app directory cannot reach files outside it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hui-link-'));
  const app = join(dir, 'app');
  mkdirSync(app);
  writeFileSync(join(dir, 'secret.txt'), 'outside');
  writeFileSync(join(app, 'inside.txt'), 'inside');
  symlinkSync(join(dir, 'secret.txt'), join(app, 'leak.txt'));
  symlinkSync(dir, join(app, 'up'));
  const s = await startServer({ viewFile, appDir: app, version: 'test' });
  try {
    assert.equal((await get(s.url + 'inside.txt')).body, 'inside');
    assert.equal((await get(s.url + 'leak.txt')).status, 404);
    assert.equal((await get(s.url + 'up/secret.txt')).status, 404);
  } finally {
    await s.close();
  }
});

test('a harness envelope file is unwrapped; an error envelope is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hui-env-'));
  const file = join(dir, 'envelope.json');
  const view = JSON.parse(readFileSync(viewFile, 'utf8'));
  writeFileSync(file, JSON.stringify({ ok: true, data: view }));
  const s = await startServer({ viewFile: file, appDir, version: 'test' });
  try {
    const res = await get(s.url + 'api/view');
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).viewVersion, 1);
    writeFileSync(file, JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }));
    assert.equal((await get(s.url + 'api/view')).status, 502);
  } finally {
    await s.close();
  }
});

test('live route: harness view runs per request with the page language and the policy', async () => {
  const fake = fakeHarness({ view: true, lang: true });
  const s = await startServer({
    harness: {
      bin: fake.bin,
      state: '/state-dir',
      policy: '/policy.json',
      lang: true,
      defaultLang: 'en',
    },
    appDir,
    version: 'test',
  });
  try {
    const ru = await get(s.url + 'api/view?lang=ru');
    assert.equal(ru.status, 200);
    assert.deepEqual(recordedArgs(JSON.parse(ru.body)), [
      'view',
      '--state',
      '/state-dir',
      '--policy',
      '/policy.json',
      '--lang',
      'ru',
    ]);
    // No or an unknown `lang` falls back to the CLI default.
    for (const q of ['', '?lang=de']) {
      const r = await get(s.url + 'api/view' + q);
      assert.equal(r.status, 200);
      assert.deepEqual(recordedArgs(JSON.parse(r.body)).slice(-2), ['--lang', 'en']);
    }
  } finally {
    await s.close();
    fake.remove();
  }
});

test('live route: a harness without lang gets no --lang; a refusal is VIEW_UNAVAILABLE', async () => {
  const fake = fakeHarness({ view: true, lang: false });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/state-dir', lang: false, defaultLang: 'ru' },
    appDir,
    version: 'test',
  });
  const refusing = fakeHarness({
    view: true,
    lang: true,
    refuse: { code: 'POLICY_REQUIRED', message: 'no state and no --policy' },
  });
  const s2 = await startServer({
    harness: { bin: refusing.bin, state: '/state-dir', lang: true, defaultLang: 'en' },
    appDir,
    version: 'test',
  });
  try {
    const r = await get(s.url + 'api/view?lang=ru');
    assert.equal(r.status, 200);
    assert.deepEqual(recordedArgs(JSON.parse(r.body)), ['view', '--state', '/state-dir']);
    const refused = await get(s2.url + 'api/view');
    assert.equal(refused.status, 503);
    const body = JSON.parse(refused.body);
    assert.equal(body.error.code, 'VIEW_UNAVAILABLE');
    assert.match(body.error.message, /POLICY_REQUIRED: no state and no --policy/);
  } finally {
    await s.close();
    await s2.close();
    fake.remove();
    refusing.remove();
  }
});

test('startServer needs exactly one view source', async () => {
  await assert.rejects(() => startServer({ appDir, version: 'test' }), TypeError);
});
