import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Theming contract (design §7): `--hui-*` defaults live on :root only, so a
// host wrapper element anywhere above the components can override them.
test('custom properties are declared only in :root rules', () => {
  const css = readFileSync(new URL('../src/components/styles.css', import.meta.url), 'utf8');
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let declared = 0;
  for (const m of noComments.matchAll(rule)) {
    const selector = m[1]!.trim();
    if (/--hui-[\w-]+\s*:/.test(m[2]!)) {
      declared++;
      assert.match(selector, /^:where\(:root/, `declares --hui-* outside :root: ${selector}`);
    }
  }
  assert.ok(declared >= 2);
});
