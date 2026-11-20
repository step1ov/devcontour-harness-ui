import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The library build (design §7): the components with the copied shadcn/ui
// pieces and their Radix primitives bundled in, so a host gets no runtime
// dependency besides React. Module by module (`preserveModules`) over the
// tsc output in dist/lib; third-party modules land in dist/lib/vendor (npm
// never packs a nested `node_modules`). Types stay the tsc declarations.
const external = (id: string) =>
  id === 'react' ||
  id === 'react-dom' ||
  id.startsWith('react/') ||
  id.startsWith('react-dom/') ||
  id.startsWith('node:') ||
  id === 'devcontour-harness' ||
  id.startsWith('devcontour-harness/');

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/lib',
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    copyPublicDir: false,
    lib: {
      entry: { index: 'src/index.ts', 'model/index': 'src/model/index.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: (chunk) =>
          chunk.name.replace(/^(?:.*\/)?node_modules\//, 'vendor/') + '.js',
      },
    },
  },
});
