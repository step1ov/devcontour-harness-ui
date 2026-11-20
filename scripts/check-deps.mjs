// Pre-pack check: node_modules must match package-lock.json, and the lock must
// match package.json, so `npm publish` never builds from a stale install.
// Usage: node scripts/check-deps.mjs [--root <dir>]   (default: the package root)
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGE_RU =
  'Зависимости не совпадают с package-lock.json — выполните npm ci и повторите npm publish';
const MESSAGE_EN =
  'Dependencies do not match package-lock.json — run npm ci and repeat npm publish';
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const MAX_LINES = 10;

const args = process.argv.slice(2);
const at = args.indexOf('--root');
if (at !== -1 && !args[at + 1]) {
  process.stderr.write('--root needs a directory\n');
  process.exit(2);
}
const root = at === -1 ? fileURLToPath(new URL('../', import.meta.url)) : resolve(args[at + 1]);

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(join(root, file), 'utf8'));
  } catch {
    return undefined;
  }
};

const mismatches = [];
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
if (!pkg) mismatches.push('package.json: not readable');
if (!lock?.packages?.[''])
  mismatches.push('package-lock.json: not readable or has no root package');

if (pkg && lock?.packages?.['']) {
  const lockRoot = lock.packages[''];
  // The lock is stale when its root no longer declares what package.json declares.
  for (const field of FIELDS) {
    const want = pkg[field] ?? {};
    const have = lockRoot[field] ?? {};
    for (const name of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (want[name] !== have[name])
        mismatches.push(
          `${name}: ${field} in package.json ${want[name] ?? '(none)'}, lock ${have[name] ?? '(none)'}`,
        );
    }
  }
  // A required direct dependency must be resolved by the lock at all.
  const optionalPeers = new Set(
    Object.entries(pkg.peerDependenciesMeta ?? {})
      .filter(([, m]) => m?.optional)
      .map(([n]) => n),
  );
  for (const field of ['dependencies', 'devDependencies'])
    for (const name of Object.keys(pkg[field] ?? {}).sort())
      if (!lock.packages[`node_modules/${name}`])
        mismatches.push(`${name}: in ${field} of package.json, not resolved in the lock`);
  for (const name of Object.keys(pkg.peerDependencies ?? {}).sort())
    if (!optionalPeers.has(name) && !lock.packages[`node_modules/${name}`])
      mismatches.push(`${name}: required peer, not resolved in the lock`);
  // Every required dependency edge of the lock resolves to a locked package,
  // the way Node looks it up: the package's own node_modules, then each parent.
  const resolve = (from, name) => {
    let dir = from;
    for (;;) {
      const at = `${dir ? `${dir}/` : ''}node_modules/${name}`;
      if (lock.packages[at]) return at;
      if (!dir) return undefined;
      const up = dir.lastIndexOf('/node_modules/');
      dir = up < 0 ? '' : dir.slice(0, up);
    }
  };
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || entry.link) continue;
    const optionalPeers = new Set(
      Object.entries(entry.peerDependenciesMeta ?? {})
        .filter(([, m]) => m?.optional)
        .map(([n]) => n),
    );
    const required = [
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}).filter((n) => !optionalPeers.has(n)),
    ];
    for (const name of required.sort())
      if (!resolve(path, name)) mismatches.push(`${path}: needs ${name}, not resolved in the lock`);
  }
  // Every package the lock resolved — direct, transitive and nested — must be
  // installed at that version. Only an `optional` package may be absent: npm
  // leaves out what does not fit this platform.
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!path.startsWith('node_modules/') || entry.link) continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const installed = readJson(join(path, 'package.json'));
    if (!installed) {
      // Only `optional` may be absent; `peer` and `devOptional` packages are installed for a pack.
      if (!entry.optional)
        mismatches.push(
          `${path === `node_modules/${name}` ? name : path}: not installed, lock ${entry.version}`,
        );
    } else if (entry.version !== undefined && installed.version !== entry.version)
      mismatches.push(
        `${path === `node_modules/${name}` ? name : path}: installed ${installed.version}, lock ${entry.version}`,
      );
  }
}

if (mismatches.length > 0) {
  const lines = mismatches.slice(0, MAX_LINES).map((m) => `  ${m}`);
  if (mismatches.length > MAX_LINES) lines.push(`  … +${mismatches.length - MAX_LINES}`);
  process.stderr.write(`${MESSAGE_RU}\n${MESSAGE_EN}\n${lines.join('\n')}\n`);
  process.exit(1);
}
