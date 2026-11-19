import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { fakeHarness, recordedArgs } from './fake-harness.ts';

const firstLine = (child: ChildProcessByStdio<null, Readable, Readable>) =>
  new Promise<string>((ok, fail) => {
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
      if (out.includes('\n')) ok(out.split('\n')[0]!);
    });
    child.on('exit', (code) => fail(new Error(`cli exited ${code}`)));
  });

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const node = (args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' });

test('--host 0.0.0.0 is refused with exit 2 and a JSON error', () => {
  const r = node(['--demo', '--host', '0.0.0.0']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'HOST_NOT_LOOPBACK');
});

test('--state with a harness that has no `view` keeps HARNESS_VIEW_UNAVAILABLE', () => {
  const old = fakeHarness({ view: false, lang: false, version: '0.1.0-alpha.54' });
  try {
    const r = node(['--state', '/nonexistent-state-dir', '--harness', old.bin]);
    assert.equal(r.status, 2);
    const error = JSON.parse(r.stdout).error;
    assert.equal(error.code, 'HARNESS_VIEW_UNAVAILABLE');
    assert.match(error.message, /0\.1\.0-alpha\.54 has no `harness view`/);
    assert.match(error.message, /--view <file>/);
  } finally {
    old.remove();
  }
});

test('--state with a harness that cannot start is HARNESS_VIEW_UNAVAILABLE', () => {
  const r = node(['--state', '/nonexistent-state-dir', '--harness', '/nonexistent/harness-bin']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'HARNESS_VIEW_UNAVAILABLE');
});

test('source flags: one source only; --policy, --harness need --state; --lang is ru or en', () => {
  for (const args of [
    ['--demo', '--state', '/s'],
    ['--demo', '--policy', '/p.json'],
    ['--demo', '--harness', '/h'],
    ['--demo', '--lang', 'de'],
  ]) {
    const r = node(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(JSON.parse(r.stdout).error.code, 'INVALID_INPUT', args.join(' '));
  }
});

test('--state serves `harness view` with --lang from the page or the CLI', async () => {
  const fake = fakeHarness({ view: true, lang: true });
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', cli, '--state', '/state-dir', '--harness', fake.bin, '--lang', 'ru'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const started = JSON.parse(await firstLine(child));
    assert.equal(started.ok, true);
    const own = await (await fetch(started.url + 'api/view')).json();
    assert.deepEqual(recordedArgs(own), ['view', '--state', '/state-dir', '--lang', 'ru']);
    const en = await (await fetch(started.url + 'api/view?lang=en')).json();
    assert.deepEqual(recordedArgs(en).slice(-2), ['--lang', 'en']);
  } finally {
    child.kill('SIGTERM');
    await new Promise((ok) => child.once('exit', ok));
    fake.remove();
  }
});

test('no source is an input error', () => {
  const r = node([]);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'INVALID_INPUT');
});

test('--demo prints one JSON line with a loopback URL and serves the view', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', cli, '--demo'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const line = await firstLine(child);
    const started = JSON.parse(line);
    assert.equal(started.ok, true);
    assert.equal(started.readOnly, true);
    assert.match(started.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(started.url + 'api/view');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).viewVersion, 1);
    for (const id of ['locale-format', 'add-greeting']) {
      const work = await fetch(started.url + 'api/work/' + id);
      assert.equal(work.status, 200, id);
      assert.equal((await work.json()).work.id, id);
    }
    assert.equal((await fetch(started.url + 'api/work/docs-page')).status, 503);
    // The demo answers ?lang=ru with Russian harness texts, like `harness view --lang ru`.
    const ru = await (await fetch(started.url + 'api/view?lang=ru')).json();
    assert.equal(ru.questions[0].title, 'Какой разделитель использовать в CSV?');
    const ruWork = await (await fetch(started.url + 'api/work/locale-format?lang=ru')).json();
    assert.match(ruWork.work.attempts.lastFailure.plain, /lint нашёл лишний импорт/);
  } finally {
    child.kill('SIGTERM');
  }
});

test('--window: 24h or 7d, only with --state, passed to a harness that takes it', async () => {
  for (const args of [
    ['--demo', '--window', '7d'],
    ['--state', '/s', '--window', '30d'],
  ]) {
    const r = node(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(JSON.parse(r.stdout).error.code, 'INVALID_INPUT', args.join(' '));
  }
  const old = fakeHarness({ view: true, lang: true, window: false });
  try {
    const r = node(['--state', '/s', '--harness', old.bin, '--window', '7d']);
    assert.equal(r.status, 2);
    assert.match(JSON.parse(r.stdout).error.message, /does not take --window/);
  } finally {
    old.remove();
  }
  const fake = fakeHarness({ view: true, lang: true, window: true });
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', cli, '--state', '/s', '--harness', fake.bin, '--window', '7d'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const started = JSON.parse(await firstLine(child));
    const view = await (await fetch(started.url + 'api/view?lang=en')).json();
    assert.deepEqual(recordedArgs(view), [
      'view',
      '--state',
      '/s',
      '--lang',
      'en',
      '--window',
      '7d',
    ]);
    const health = await (await fetch(started.url + 'api/health')).json();
    assert.equal(health.live, 'state');
  } finally {
    child.kill('SIGTERM');
    await new Promise((ok) => child.once('exit', ok));
    fake.remove();
  }
});

test('--check: compatible harness exits 0; another view version or no view exits 3 with a fix', () => {
  const good = fakeHarness({ view: true, lang: true });
  const newer = fakeHarness({ view: true, lang: true, viewVersion: 2, version: '0.2.0-alpha.1' });
  const old = fakeHarness({ view: false, lang: false, version: '0.1.0-alpha.54' });
  const silent = fakeHarness({ view: true, lang: true, viewVersion: null });
  try {
    const ok = node(['--check', '--harness', good.bin]);
    assert.equal(ok.status, 0, ok.stdout);
    const r = JSON.parse(ok.stdout);
    assert.deepEqual(
      { ok: r.ok, harness: r.harness, viewVersion: r.viewVersion, compatible: r.compatible },
      { ok: true, harness: '0.1.0-alpha.55', viewVersion: 1, compatible: true },
    );
    assert.equal(typeof r.ui, 'string');
    assert.equal(r.fix, undefined);
    // With a state, one real view is read and checked.
    const withState = JSON.parse(node(['--check', '--harness', good.bin, '--state', '/s']).stdout);
    assert.deepEqual(withState.view, { ok: true });

    const n = node(['--check', '--harness', newer.bin]);
    assert.equal(n.status, 3);
    const nr = JSON.parse(n.stdout);
    assert.equal(nr.compatible, false);
    assert.equal(nr.viewVersion, 2);
    assert.match(nr.fix, /view version 2; this panel reads 1/);

    const o = JSON.parse(node(['--check', '--harness', old.bin]).stdout);
    assert.equal(o.compatible, false);
    assert.match(o.fix, /0\.1\.0-alpha\.54 has no `harness view`/);

    const missing = node(['--check', '--harness', '/nonexistent/harness-bin']);
    assert.equal(missing.status, 3);
    assert.equal(JSON.parse(missing.stdout).harness, null);

    // An undeclared view version is unknown, not compatible, until one view is read.
    const s = JSON.parse(node(['--check', '--harness', silent.bin]).stdout);
    assert.equal(s.compatible, false);
    assert.equal(s.viewVersion, null);
    const s2 = JSON.parse(node(['--check', '--harness', silent.bin, '--state', '/s']).stdout);
    assert.equal(s2.compatible, true);
    assert.equal(s2.viewVersion, 1);

    assert.equal(node(['--check', '--demo']).status, 2);
  } finally {
    for (const f of [good, newer, old, silent]) f.remove();
  }
});
