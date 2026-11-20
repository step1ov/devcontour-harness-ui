// scripts/check-deps.mjs, run by prepack: node_modules must match
// package-lock.json and the lock must match package.json. Each case builds a
// minimal package in a fresh temp directory.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** A package whose lock and install are given by path (`node_modules/a/node_modules/b`). */
const withTree = (
  lock: Record<string, Record<string, unknown> & { version: string }>,
  installed: Record<string, string>,
  check: (root: string) => void,
  declared: Record<string, string> = { left: '1.0.0' },
) => {
  const root = mkdtempSync(join(tmpdir(), 'hui-deps-'));
  try {
    const json = (file: string, value: unknown) =>
      writeFileSync(join(root, file), JSON.stringify(value, null, 2));
    json('package.json', { name: 'fixture', version: '0.0.0', devDependencies: declared });
    json('package-lock.json', {
      name: 'fixture',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'fixture', version: '0.0.0', devDependencies: declared }, ...lock },
    });
    for (const [path, version] of Object.entries(installed)) {
      mkdirSync(join(root, path), { recursive: true });
      json(join(path, 'package.json'), { name: path.split('node_modules/').pop(), version });
    }
    check(root);
  } finally {
    if (root.startsWith(join(tmpdir(), 'hui-deps-')))
      rmSync(root, { recursive: true, force: true });
  }
};

test('transitive and nested packages are checked against the lock too', () => {
  const lock = {
    'node_modules/left': { version: '1.0.0' },
    'node_modules/compiler': { version: '2.0.0' },
    'node_modules/left/node_modules/inner': { version: '3.0.0' },
  };
  const good = {
    'node_modules/left': '1.0.0',
    'node_modules/compiler': '2.0.0',
    'node_modules/left/node_modules/inner': '3.0.0',
  };
  withTree(lock, good, (root) => assert.equal(run(root).status, 0, run(root).stderr));
  withTree(lock, { ...good, 'node_modules/compiler': '2.1.0' }, (root) =>
    assertMismatch(run(root), /compiler: installed 2\.1\.0, lock 2\.0\.0/),
  );
  withTree(lock, { ...good, 'node_modules/left/node_modules/inner': '3.0.1' }, (root) =>
    assertMismatch(
      run(root),
      /node_modules\/left\/node_modules\/inner: installed 3\.0\.1, lock 3\.0\.0/,
    ),
  );
  const { ['node_modules/compiler']: _gone, ...missing } = good;
  withTree(lock, missing, (root) =>
    assertMismatch(run(root), /compiler: not installed, lock 2\.0\.0/),
  );
});

test('a required direct dependency missing from the lock fails; an absent optional package passes', () => {
  withTree({}, {}, (root) =>
    assertMismatch(
      run(root),
      /left: in devDependencies of package\.json, not resolved in the lock/,
    ),
  );
  withTree(
    {
      'node_modules/left': { version: '1.0.0' },
      'node_modules/@esbuild/other-os': { version: '0.1.0', optional: true },
    },
    { 'node_modules/left': '1.0.0' },
    (root) => assert.equal(run(root).status, 0, run(root).stderr),
  );
});

test('a required edge of the lock graph must resolve; peer and devOptional packages are required', () => {
  // `left` needs `compiler`, which is neither locked nor installed.
  withTree(
    { 'node_modules/left': { version: '1.0.0', dependencies: { compiler: '^2.0.0' } } },
    { 'node_modules/left': '1.0.0' },
    (root) =>
      assertMismatch(run(root), /node_modules\/left: needs compiler, not resolved in the lock/),
  );
  // Resolved from a parent directory, as Node does: fine.
  withTree(
    {
      'node_modules/left': { version: '1.0.0' },
      'node_modules/left/node_modules/inner': { version: '1.0.0', dependencies: { compiler: '2' } },
      'node_modules/compiler': { version: '2.0.0' },
    },
    {
      'node_modules/left': '1.0.0',
      'node_modules/left/node_modules/inner': '1.0.0',
      'node_modules/compiler': '2.0.0',
    },
    (root) => assert.equal(run(root).status, 0, run(root).stderr),
  );
  // An optional peer of a package may be unresolved.
  withTree(
    {
      'node_modules/left': {
        version: '1.0.0',
        peerDependencies: { host: '*' },
        peerDependenciesMeta: { host: { optional: true } },
      },
    },
    { 'node_modules/left': '1.0.0' },
    (root) => assert.equal(run(root).status, 0, run(root).stderr),
  );
  for (const flag of ['peer', 'devOptional'])
    withTree(
      {
        'node_modules/left': { version: '1.0.0' },
        'node_modules/shared': { version: '1.0.0', [flag]: true },
      },
      { 'node_modules/left': '1.0.0' },
      (root) => assertMismatch(run(root), /shared: not installed, lock 1\.0\.0/),
    );
});

test('an absent optional direct dependency passes', () => {
  withTree(
    {
      'node_modules/left': { version: '1.0.0' },
      'node_modules/fsevents': { version: '2.3.3', optional: true },
    },
    { 'node_modules/left': '1.0.0' },
    (root) => {
      const pkg = join(root, 'package.json');
      const lockFile = join(root, 'package-lock.json');
      const p = JSON.parse(readFileSync(pkg, 'utf8'));
      p.optionalDependencies = { fsevents: '2.3.3' };
      writeFileSync(pkg, JSON.stringify(p));
      const l = JSON.parse(readFileSync(lockFile, 'utf8'));
      l.packages[''].optionalDependencies = { fsevents: '2.3.3' };
      writeFileSync(lockFile, JSON.stringify(l));
      assert.equal(run(root).status, 0, run(root).stderr);
    },
  );
});
