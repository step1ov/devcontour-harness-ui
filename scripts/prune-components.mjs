// Removes the tsc-emitted component modules (dist/lib/components/**/*.js) of
// this package before the library bundle (vite.lib.config.ts) writes the
// components with their Radix pieces bundled; declarations (.d.ts) stay.
// Only inside <package root>/dist/lib/components, verified by package name.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (pkg.name !== 'devcontour-harness-ui') {
  throw new Error(`refusing to prune: ${fileURLToPath(root)} is not devcontour-harness-ui`);
}
const dir = fileURLToPath(new URL('dist/lib/components/', root));
for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) rmSync(join(entry.parentPath, entry.name));
}
