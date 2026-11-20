// scripts/check-deps.mjs, run by prepack: node_modules must match
// package-lock.json and the lock must match package.json. Each case builds a
// minimal package in a fresh temp directory.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-deps.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const RU =
  'Зависимости не совпадают с package-lock.json — выполните npm ci и повторите npm publish';
const EN = 'Dependencies do not match package-lock.json — run npm ci and repeat npm publish';

type Fixture = {
  declared?: Record<string, string>;
  lockDeclared?: Record<string, string>;
  locked?: Record<string, string>;
  installed?: Record<string, string>;
};

const run = (root: string) =>
  spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });

const withPackage = (fx: Fixture, check: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), 'hui-deps-'));
  try {
    const declared = fx.declared ?? { left: '1.0.0' };
    const json = (file: string, value: unknown) =>
      writeFileSync(join(root, file), JSON.stringify(value, null, 2));
    json('package.json', { name: 'fixture', version: '0.0.0', devDependencies: declared });
    const packages: Record<string, unknown> = {
      '': { name: 'fixture', version: '0.0.0', devDependencies: fx.lockDeclared ?? declared },
    };
    for (const [name, version] of Object.entries(fx.locked ?? { left: '1.0.0' }))
      packages[`node_modules/${name}`] = { version, dev: true };
    json('package-lock.json', { name: 'fixture', lockfileVersion: 3, requires: true, packages });
    for (const [name, version] of Object.entries(fx.installed ?? { left: '1.0.0' })) {
      mkdirSync(join(root, 'node_modules', name), { recursive: true });
      json(join('node_modules', name, 'package.json'), { name, version });
    }
    check(root);
  } finally {
    // Only the directory this test created.
    if (root.startsWith(join(tmpdir(), 'hui-deps-')))
      rmSync(root, { recursive: true, force: true });
  }
};

const assertMismatch = (r: ReturnType<typeof run>, line: RegExp) => {
  assert.equal(r.status, 1, r.stderr);
  const lines = r.stderr.split('\n');
  assert.equal(lines[0], RU);
  assert.equal(lines[1], EN);
  assert.match(r.stderr, line);
};

test('a matching install passes silently', () => {
  withPackage({}, (root) => {
    const r = run(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  });
});

test('an installed version that differs from the lock fails', () => {
  withPackage({ installed: { left: '1.0.1' } }, (root) => {
    assertMismatch(run(root), /left: installed 1\.0\.1, lock 1\.0\.0/);
  });
});

test('a dependency the lock resolved but node_modules lacks fails', () => {
  withPackage({ installed: {} }, (root) => {
    assertMismatch(run(root), /left: not installed, lock 1\.0\.0/);
  });
});

test('a lock whose root ranges differ from package.json fails', () => {
  withPackage(
    { declared: { left: '1.0.0', right: '2.0.0' }, lockDeclared: { left: '1.0.0' } },
    (root) => {
      assertMismatch(run(root), /right: devDependencies in package\.json 2\.0\.0, lock \(none\)/);
    },
  );
});

test('this repository matches its package-lock.json', () => {
  const r = run(repoRoot);
  assert.equal(r.status, 0, r.stderr);
});
