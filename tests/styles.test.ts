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
      // Every selector in the list must be :root itself (optionally with the
      // theme attribute), not `:where(:root) .x` or `:where(:root, .x)`.
      for (const part of selector.split(','))
        assert.match(
          part.trim(),
          /^:where\(:root(?::not\(\[data-theme='light'\]\)|\[data-theme='dark'\])?\)$/,
          `declares --hui-* outside :root: ${selector}`,
        );
    }
  }
  assert.ok(declared >= 2);
});
