import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_PORT, ServeError, startServer } from '../src/server/serve.ts';
import { probeHarness } from '../src/server/harness.ts';
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

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (ok: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return ok();
};

test('live route: the deadline holds against a harness that ignores SIGTERM', async () => {
  const fake = fakeHarness({ view: true, lang: true, hang: true });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/s', lang: true, defaultLang: 'en', timeoutMs: 300 },
    appDir,
    version: 'test',
  });
  try {
    const t0 = Date.now();
    const r = await get(s.url + 'api/view');
    assert.ok(Date.now() - t0 < 2000, 'answered at the deadline, not after the child');
    assert.equal(r.status, 503);
    assert.match(JSON.parse(r.body).error.message, /timed out after 300 ms/);
    const pid = Number(readFileSync(fake.pidFile, 'utf8'));
    assert.ok(await until(() => !alive(pid), 5000), 'SIGKILL after the grace period');
    // The language slot is free again: a new run starts.
    const again = await get(s.url + 'api/view');
    assert.equal(again.status, 503);
    assert.notEqual(Number(readFileSync(fake.pidFile, 'utf8')), pid);
  } finally {
    await s.close();
    fake.remove();
  }
});

test('live route: closing the panel ends a running harness process', async () => {
  const fake = fakeHarness({ view: true, lang: true, hang: true });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/s', lang: true, defaultLang: 'en', timeoutMs: 60_000 },
    appDir,
    version: 'test',
  });
  try {
    const pending = get(s.url + 'api/view').catch(() => undefined);
    assert.ok(await until(() => existsSync(fake.pidFile), 5000));
    const pid = Number(readFileSync(fake.pidFile, 'utf8'));
    assert.ok(alive(pid));
    await s.close();
    assert.equal(alive(pid), false, 'close() waits until the run is gone');
    await pending;
  } finally {
    fake.remove();
  }
});

test('live route: a success envelope with a nonzero exit is not a view', async () => {
  const fake = fakeHarness({ view: true, lang: true, exitCode: 3 });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/s', lang: true, defaultLang: 'en' },
    appDir,
    version: 'test',
  });
  try {
    const r = await get(s.url + 'api/view');
    assert.equal(r.status, 503);
    assert.match(
      JSON.parse(r.body).error.message,
      /exit 3: a success envelope with a nonzero exit/,
    );
    await assert.rejects(probeHarness(fake.bin), /printed no capabilities catalog/);
  } finally {
    await s.close();
    fake.remove();
  }
});

const workFile = fileURLToPath(new URL('../fixtures/work.sample.json', import.meta.url));

test('work detail from files: /api/work/<id> and /api/view?work=, gated and refused honestly', async () => {
  const s = await startServer({
    viewFile,
    workFiles: { 'locale-format': workFile },
    appDir,
    version: 'test',
  });
  const plain = await startServer({ viewFile, appDir, version: 'test' });
  try {
    for (const path of ['api/work/locale-format', 'api/view?work=locale-format']) {
      const r = await get(s.url + path);
      assert.equal(r.status, 200, path);
      assert.equal(JSON.parse(r.body).work.id, 'locale-format');
      assert.equal(r.headers['cache-control'], 'no-store');
    }
    const missing = await get(s.url + 'api/work/docs-page');
    assert.equal(missing.status, 503);
    assert.equal(JSON.parse(missing.body).error.code, 'VIEW_UNAVAILABLE');
    assert.equal((await get(plain.url + 'api/work/locale-format')).status, 503);
    // Ids outside the harness id alphabet never reach a file or a process.
    for (const bad of ['..%2fview', 'a%20b', '__proto__x%00', 'x'.repeat(81)]) {
      const r = await get(s.url + 'api/work/' + bad);
      assert.ok(r.status === 404 || r.status === 400, `${bad}: ${r.status}`);
    }
    assert.equal((await get(s.url + 'api/work/locale-format', { method: 'POST' })).status, 405);
  } finally {
    await s.close();
    await plain.close();
  }
});

test('work detail file that is an overview is refused by the detail gate (409)', async () => {
  const s = await startServer({ viewFile, workFiles: { x: viewFile }, appDir, version: 'test' });
  try {
    const r = await get(s.url + 'api/work/x');
    assert.equal(r.status, 409);
    assert.equal(JSON.parse(r.body).error.code, 'NOT_A_VIEW');
  } finally {
    await s.close();
  }
});

test('live route: /api/work/<id> runs harness view --work=<id> with the language; a refusal is 503', async () => {
  const fake = fakeHarness({ view: true, lang: true });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/state-dir', lang: true, defaultLang: 'ru' },
    appDir,
    version: 'test',
  });
  try {
    const r = await get(s.url + 'api/work/locale-format?lang=en');
    assert.equal(r.status, 200);
    const detail = JSON.parse(r.body);
    assert.deepEqual(JSON.parse(detail.source.producer), [
      'view',
      '--state',
      '/state-dir',
      '--lang',
      'en',
      '--work=locale-format',
    ]);
    const def = JSON.parse((await get(s.url + 'api/work/locale-format')).body);
    assert.deepEqual(JSON.parse(def.source.producer).slice(3), [
      '--lang',
      'ru',
      '--work=locale-format',
    ]);
    const refused = await get(s.url + 'api/work/docs-page');
    assert.equal(refused.status, 503);
    assert.match(JSON.parse(refused.body).error.message, /INVALID_INPUT: no work docs-page/);
  } finally {
    await s.close();
    fake.remove();
  }
});

test('live route: the work detail shares the view deadline against a hanging harness', async () => {
  const fake = fakeHarness({ view: true, lang: true, hang: true });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/s', lang: true, defaultLang: 'en', timeoutMs: 300 },
    appDir,
    version: 'test',
  });
  try {
    const started = Date.now();
    const r = await get(s.url + 'api/work/locale-format');
    assert.equal(r.status, 503);
    assert.match(JSON.parse(r.body).error.message, /timed out after 300 ms/);
    assert.ok(Date.now() - started < 5000);
  } finally {
    await s.close();
    fake.remove();
  }
});

test('live route: distinct work ids never run more than MAX_RUNS harness processes at once', async () => {
  const { MAX_RUNS, MAX_WAITING } = await import('../src/server/serve.ts');
  const fake = fakeHarness({ view: true, lang: true, hang: true });
  const s = await startServer({
    harness: { bin: fake.bin, state: '/s', lang: true, defaultLang: 'en', timeoutMs: 400 },
    appDir,
    version: 'test',
  });
  try {
    const n = MAX_RUNS + MAX_WAITING + 3;
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) => get(s.url + 'api/work/w' + i)),
    );
    const bodies = results.map((r) => JSON.parse(r.body).error.message as string);
    // The overflow is refused at once; the rest time out in waves of MAX_RUNS.
    assert.equal(bodies.filter((m) => /busy/.test(m)).length, 3);
    assert.equal(bodies.filter((m) => /timed out/.test(m)).length, MAX_RUNS + MAX_WAITING);
  } finally {
    await s.close();
    fake.remove();
  }
});

test('health names the served app build; the page is revalidated, so a new build reaches open tabs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hui-build-'));
  const app = join(dir, 'app');
  mkdirSync(app);
  writeFileSync(
    join(app, 'index.html'),
    '<!doctype html><html><head><script src="./assets/a-1.js"></script></head></html>',
  );
  const s = await startServer({ viewFile, appDir: app, version: 'test' });
  try {
    const first = await get(s.url + 'api/health');
    assert.equal(first.headers['cache-control'], 'no-store');
    const build = JSON.parse(first.body).build as string;
    assert.match(build, /^[0-9a-f]{16}$/);
    const page = await get(s.url);
    assert.equal(page.status, 200);
    assert.equal(page.headers['cache-control'], 'no-cache');
    // The page names its own build: the tab compares what it runs, not a later health answer.
    assert.match(page.body, new RegExp(`<meta name="hui-build" content="${build}" />`));
    // A rebuilt app (new hashed bundle names): a new build id, which the open tab compares.
    writeFileSync(
      join(app, 'index.html'),
      '<!doctype html><html><head><script src="./assets/a-2.js"></script></head></html>',
    );
    const next = JSON.parse((await get(s.url + 'api/health')).body).build as string;
    assert.notEqual(next, build);
  } finally {
    await s.close();
    // Only the directory this test created.
    rmSync(dir, { recursive: true, force: true });
  }
  // Without an app bundle there is no build to name.
  const bare = await startServer({ viewFile, appDir, version: 'test' });
  try {
    assert.equal(JSON.parse((await get(bare.url + 'api/health')).body).build, undefined);
  } finally {
    await bare.close();
  }
});
