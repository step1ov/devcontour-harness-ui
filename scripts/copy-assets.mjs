// Copies non-TypeScript library assets next to the emitted JS (the stylesheet
// is built by build-css.mjs): the demo fixtures (dist/demo), so that `--demo` works from the package,
// which does not ship fixtures/.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));
mkdirSync(at('../dist/lib'), { recursive: true });
mkdirSync(at('../dist/demo/ru'), { recursive: true });
for (const f of ['view.sample.json', 'work.sample.json', 'work.accepted.sample.json']) {
  copyFileSync(at('../fixtures/' + f), at('../dist/demo/' + f));
  copyFileSync(at('../fixtures/ru/' + f), at('../dist/demo/ru/' + f));
}
