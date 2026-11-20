// The library bundle (vite.lib.config.ts): the copied shadcn/ui pieces and
// their Radix primitives are inside the package, so a host gets no runtime
// dependency besides React (design §7). Built into a fresh temp directory.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies: Record<string, string>;
  files: string[];
};

test('the library bundle imports only React, node built-ins and its own files', () => {
  const out = mkdtempSync(join(tmpdir(), 'hui-lib-'));
  try {
    const vite = join(
      dirname(createRequire(import.meta.url).resolve('vite/package.json')),
      'bin/vite.js',
    );
    execFileSync(
      process.execPath,
      [vite, 'build', '--config', 'vite.lib.config.ts', '--outDir', out, '--logLevel', 'error'],
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    const files = readdirSync(out, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.js'));
    assert.ok(files.includes('index.js') && files.includes(join('model', 'index.js')));
    // Radix is bundled under vendor/, never imported by name.
    assert.ok(files.some((f) => f.startsWith(join('vendor', '@radix-ui'))));
    assert.ok(!files.some((f) => f.includes('node_modules')), 'npm never packs node_modules');
    const bare = new Set<string>();
    for (const f of files) {
      const src = readFileSync(join(out, f), 'utf8');
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g))
        if (!m[1]!.startsWith('.')) bare.add(m[1]!);
    }
    for (const spec of bare)
      assert.match(spec, /^(react|react-dom|react\/jsx-runtime|node:[\w/]+)$/, spec);
  } finally {
    // Only the directory this test created.
    rmSync(out, { recursive: true, force: true });
  }
});

test('new build-time dependencies are pinned exactly and stay dev-only', () => {
  assert.equal(pkg.dependencies, undefined);
  for (const name of [
    'tailwindcss',
    '@tailwindcss/cli',
    '@tailwindcss/vite',
    '@radix-ui/react-progress',
    '@radix-ui/react-radio-group',
    '@radix-ui/react-slot',
  ])
    assert.match(pkg.devDependencies[name] ?? '', /^\d+\.\d+\.\d+$/, name);
  assert.ok(pkg.files.includes('dist'));
});
