import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The standalone app: a static bundle served by the CLI from dist/app.
// Relative base so the bundle works under any local URL prefix.
export default defineConfig({
  root: 'src/app',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
    sourcemap: false,
  },
});
