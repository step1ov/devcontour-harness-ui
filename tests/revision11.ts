// View revision 11 (harness 0.1.0-alpha.73) for the tests: the revision 10
// demo view in thin mode and the work detail with the writer session of each
// attempt. The values follow the harness test tests/thin-view.test.ts: a
// thin policy chosen in the policy (`default: false`) with the write guard of
// the light environment, plan review rounds without a limit, and two attempts of one work — the first a fresh
// session, the second the same session resumed (newest first).
import { readFileSync } from 'node:fs';
import { revision10View } from './revision10.ts';

type Json = Record<string, any>;

const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;

/** The revision 10 demo view in thin mode, as revision 11. */
export function revision11View(lang: 'ru' | 'en' = 'ru'): Json {
  const v = revision10View(lang);
  v.viewRevision = 11;
  v.settings.harnessMode = { mode: 'thin', default: false, writeGuard: true };
  // Thin mode lifts the plan review limit as light mode does (harness projection).
  v.settings.thresholds.reviewRoundsUnlimited = true;
  return v;
}

/** The demo work detail with the writer sessions of its two attempts. */
export function revision11Detail(lang: 'ru' | 'en' = 'ru'): Json {
  const d = structuredClone(
    read(lang === 'ru' ? '../fixtures/ru/work.sample.json' : '../fixtures/work.sample.json'),
  );
  d.viewRevision = 11;
  const sessions = ['resumed', 'fresh'];
  d.attempts.forEach((a: Json, i: number) => (a.writerSession = sessions[i] ?? 'fresh'));
  return d;
}
