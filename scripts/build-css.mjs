// Builds the package stylesheet with Tailwind CSS 4 (no preflight, `hui:`
// prefix) and scopes the one global rule Tailwind adds — the custom property
// fallback for older browsers on `*, ::before, ::after, ::backdrop` — to the
// panel root `.hui`, so that nothing of the panel reaches a host page.
// Usage: node scripts/build-css.mjs [out-file]   (default dist/lib/styles.css)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] ?? resolve(root, 'dist/lib/styles.css'));
const cli = resolve(
  dirname(createRequire(import.meta.url).resolve('@tailwindcss/cli/package.json')),
  'dist/index.mjs',
);
mkdirSync(dirname(out), { recursive: true });
execFileSync(process.execPath, [cli, '-i', 'src/components/styles.css', '-o', out], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});
// Tailwind's own `properties` layer gets a panel name too, so it never joins a host's layer order.
const css = scopeGlobals(readFileSync(out, 'utf8')).replace(
  /@layer properties\b/g,
  '@layer hui-properties',
);
// A newer Tailwind that writes the global rule differently must fail the build, not leak.
if (/(^|[\s{}])\*\s*,\s*:{1,2}before/.test(css.replace(/\.hui \*/g, ''))) {
  throw new Error('build-css: an unscoped universal rule survived; update scopeGlobals');
}
writeFileSync(out, css);

/** `*, ::before, ::after, ::backdrop` → the same inside `.hui` only. */
export function scopeGlobals(css) {
  return css.replace(
    /\*, ::before, ::after, ::backdrop \{/g,
    '.hui, .hui *, .hui ::before, .hui ::after, .hui ::backdrop {',
  );
}
