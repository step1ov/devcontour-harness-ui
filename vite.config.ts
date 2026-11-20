import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The standalone app: a static bundle served by the CLI from dist/app.
// Relative base so the bundle works under any local URL prefix. The
// package stylesheet goes through Tailwind CSS (src/components/styles.css).
export default defineConfig({
  root: 'src/app',
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
    sourcemap: false,
  },
});
