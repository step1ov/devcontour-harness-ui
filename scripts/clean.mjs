// Removes only this package's own build output: <package root>/dist, where the
// package root is verified by its package.json name before anything is deleted.
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (pkg.name !== 'devcontour-harness-ui') {
  throw new Error(`refusing to clean: ${fileURLToPath(root)} is not devcontour-harness-ui`);
}
rmSync(fileURLToPath(new URL('dist', root)), { recursive: true, force: true });
