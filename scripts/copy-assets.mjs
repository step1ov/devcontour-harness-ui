// Copies non-TypeScript library assets (the stylesheet) next to the emitted JS.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../src/components/styles.css', import.meta.url));
const dir = fileURLToPath(new URL('../dist/lib', import.meta.url));
mkdirSync(dir, { recursive: true });
copyFileSync(from, `${dir}/styles.css`);
