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
const withKeyframes = css.replace(/\/\*[\s\S]*?\*\//g, '');
/** `@keyframes` blocks: their `0%`/`50%` steps are not selectors. */
const KEYFRAMES = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
const noComments = withKeyframes.replace(KEYFRAMES, '');

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
  // Own layer names: a host's `base`/`utilities` layers neither merge with nor reorder ours.
  for (const m of noComments.matchAll(/@layer ([^{;]+)[{;]/g))
    for (const name of m[1]!.split(',').map((x) => x.trim()))
      assert.match(name, /^hui-[a-z]+$/, `layer ${name}`);
  // No sibling or descendant reach out of the panel: `.hui ~ p`, `.hui-x + *`.
  for (const { selector } of rules(noComments))
    for (const part of parts(selector))
      assert.doesNotMatch(part, /^\.hui[\w-]*\s*[~+](?!\s*\.hui)/, `reaches a sibling: ${part}`);
  // Animations have panel names (the path's pulse), so they never collide with a host's.
  const frames = [...withKeyframes.matchAll(KEYFRAMES)].map((m) => m[1]!);
  for (const name of frames) assert.match(name, /^hui-[a-z-]+$/, `keyframes ${name}`);
  assert.ok(frames.includes('hui-pulse'), 'the current step pulses');
  // …and stops for a viewer who asked for less motion.
  assert.match(withKeyframes, /prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/);
  // The only other global at-rule: Tailwind's `@property --tw-*` registrations.
  for (const m of noComments.matchAll(/@([a-z-]+)\s+([^{;]*)/g))
    assert.ok(
      ['layer', 'media', 'supports', 'property'].includes(m[1]!),
      `unexpected at-rule @${m[1]} ${m[2]}`,
    );
  for (const m of noComments.matchAll(/@property\s+([^\s{]+)/g)) assert.match(m[1]!, /^--tw-/);
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
