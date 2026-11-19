import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const node = (args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' });

test('--host 0.0.0.0 is refused with exit 2 and a JSON error', () => {
  const r = node(['--demo', '--host', '0.0.0.0']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'HOST_NOT_LOOPBACK');
});

test('--state is not available until harness provides `harness view`', () => {
  const r = node(['--state', '/nonexistent-state-dir']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'HARNESS_VIEW_UNAVAILABLE');
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
    const line = await new Promise<string>((ok, fail) => {
      let out = '';
      child.stdout.on('data', (c) => {
        out += c;
        if (out.includes('\n')) ok(out.split('\n')[0]!);
      });
      child.on('exit', (code) => fail(new Error(`cli exited ${code}`)));
    });
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
