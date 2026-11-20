import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/** The package stylesheet as built (Tailwind CSS, then the scoping step), into a fresh temp dir. */
function built(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hui-css-'));
  try {
    const out = join(dir, 'styles.css');
    execFileSync(process.execPath, ['scripts/build-css.mjs', out], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return readFileSync(out, 'utf8');
  } finally {
    // Only the directory this test created.
    rmSync(dir, { recursive: true, force: true });
  }
}

const css = built();
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every style rule: its selector and its declarations (at-rule preludes are skipped). */
function rules(text: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of text.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim();
    if (selector.startsWith('@')) continue;
    out.push({ selector, body: m[2]! });
  }
  return out;
}

/** A selector list split at its top-level commas (not inside `:where(…)`). */
function parts(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const tokenRoot = /^:where\(:root(?::not\(\[data-theme='light'\]\)|\[data-theme='dark'\])?\)$/;

// Theming contract (design §7): `--hui-*` defaults live on :root only, so a
// host wrapper element anywhere above the components can override them.
test('custom properties are declared only in :root rules', () => {
  let declared = 0;
  for (const { selector, body } of rules(noComments)) {
    if (!/--hui-[\w-]+\s*:/.test(body)) continue;
    declared++;
    // The panel tokens (`:where(:root…)`) and Tailwind's prefixed theme (`:root, :host`).
    if (selector === ':root, :host') continue;
    for (const part of parts(selector))
      assert.match(part, tokenRoot, `declares --hui-* outside :root: ${selector}`);
  }
  assert.ok(declared >= 3);
});

// Style isolation (design §7): nothing of the panel styles the host page.
test('every rule of the built stylesheet is scoped to the panel', () => {
  assert.match(css, /tailwindcss v4/);
  let utilities = 0;
  for (const { selector, body } of rules(noComments)) {
    for (const part of parts(selector)) {
      if (part === ':root' || part === ':host' || tokenRoot.test(part)) {
        // Root rules only carry custom properties of the panel, never a style.
        for (const decl of body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean))
          assert.match(decl, /^--hui-[\w-]+\s*:/, `${selector} sets ${decl}`);
        continue;
      }
      if (/^\.hui\\:/.test(part)) {
        utilities++;
        continue;
      }
      assert.match(part, /^\.hui(?![\w-])|^\.hui-[\w-]+/, `unscoped selector: ${part}`);
    }
  }
  assert.ok(utilities > 50, `prefixed utilities found: ${utilities}`);
  // Tailwind's custom property fallback is scoped to the panel by build-css.mjs.
  assert.doesNotMatch(noComments, /\*, ::before, ::after, ::backdrop/);
});

test('utilities read the panel tokens, so a host override of --hui-* restyles them', () => {
  assert.match(css, /\.hui\\:bg-card \{\s*background-color: var\(--hui-surface\);/);
  assert.match(css, /\.hui\\:text-muted-foreground \{\s*color: var\(--hui-muted\);/);
  // A dark theme for both the system preference and the viewer's choice.
  assert.match(
    css,
    /prefers-color-scheme: dark\) \{\s*:where\(:root:not\(\[data-theme='light'\]\)\)/,
  );
  assert.match(css, /:where\(:root\[data-theme='dark'\]\) \{/);
});
