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
  } finally {
    child.kill('SIGTERM');
  }
});
