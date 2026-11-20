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
  // Every direct dependency the lock resolved must be installed at that version.
  const names = new Set();
  for (const field of FIELDS)
    for (const name of Object.keys(lockRoot[field] ?? {})) names.add(name);
  for (const name of [...names].sort()) {
    const entry = lock.packages[`node_modules/${name}`];
    // An optional peer the lock does not resolve is not installed on purpose.
    if (!entry) continue;
    const installed = readJson(join('node_modules', name, 'package.json'));
    if (!installed) mismatches.push(`${name}: not installed, lock ${entry.version}`);
    else if (installed.version !== entry.version)
      mismatches.push(`${name}: installed ${installed.version}, lock ${entry.version}`);
  }
}

if (mismatches.length > 0) {
  const lines = mismatches.slice(0, MAX_LINES).map((m) => `  ${m}`);
  if (mismatches.length > MAX_LINES) lines.push(`  … +${mismatches.length - MAX_LINES}`);
  process.stderr.write(`${MESSAGE_RU}\n${MESSAGE_EN}\n${lines.join('\n')}\n`);
  process.exit(1);
}
