// View revision 10 (harness 0.1.0-alpha.70) for the tests: the demo view
// with every new field once. The values follow the harness tests of
// tests/operator-view-alpha70.test.ts: the cost breakdown of its five calls
// (two works, three attempts, a call without a price, a release closed at
// 11:00), the second pass that refuted one finding and lifted the
// rejection, a follow-up proposal and the docs step `missing`.
import { readFileSync } from 'node:fs';

type Json = Record<string, any>;

const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;

/** The cost breakdown of the harness test, on the demo works. */
export function costs(): Json {
  return {
    total: { usd: 3.75, bound: 'lower', calls: 5 },
    release: { usd: 1, bound: 'lower', calls: 2, since: '2026-11-24T11:00:00.000Z' },
    byRole: [
      { role: 'writer', usd: 3, bound: 'lower', calls: 3 },
      { role: 'reviewer', usd: 0.5, bound: 'exact', calls: 1 },
      { role: 'planner', usd: 0.25, bound: 'exact', calls: 1 },
    ],
    byModel: [
      {
        runtime: 'claude',
        vendor: 'anthropic',
        model: 'claude-x',
        usd: 3,
        bound: 'lower',
        calls: 3,
      },
      { runtime: 'codex', vendor: 'openai', model: 'gpt-x', usd: 0.75, bound: 'exact', calls: 2 },
    ],
    byWork: [
      {
        workId: 'locale-format',
        usd: 2.5,
        bound: 'lower',
        calls: 3,
        attempts: [
          { runId: 'r1', attempt: 1, usd: 2.5, bound: 'exact', calls: 2 },
          { runId: 'r2', attempt: 2, usd: 0, bound: 'lower', calls: 1 },
        ],
      },
      {
        workId: 'import-csv',
        usd: 1,
        bound: 'exact',
        calls: 1,
        attempts: [{ runId: 'r3', attempt: 1, usd: 1, bound: 'exact', calls: 1 }],
      },
    ],
  };
}

/**
 * The demo view (`lang` copy) as revision 10. `locale-format` gets the second
 * pass, a proposal of each kind and the failure reference; the release gets
 * the docs step.
 */
export function revision10View(lang: 'ru' | 'en' = 'ru'): Json {
  const v = structuredClone(
    read(lang === 'ru' ? '../fixtures/ru/view.sample.json' : '../fixtures/view.sample.json'),
  );
  v.viewRevision = 10;
  v.costs = costs();
  const w = v.works.find((x: Json) => x.id === 'locale-format');
  w.attemptReviews = [
    {
      attempt: 1,
      phase: 'candidate',
      verdict: 'approved',
      findings: 0,
      notes: 0,
      at: '2026-11-19T11:40:00.000Z',
      secondPass: { mode: 'on-reject', status: 'ran', refuted: 1, missed: 0, overturned: true },
    },
    {
      attempt: 2,
      phase: 'candidate',
      verdict: 'rejected',
      findings: 2,
      notes: 1,
      at: '2026-11-19T11:50:00.000Z',
      secondPass: { mode: 'always', status: 'failed', refuted: 0, missed: 0 },
    },
  ];
  w.proposals = [
    { id: 'p1', kind: 'follow-up', status: 'proposed', attempt: 1, title: 'Локализация' },
    { id: 'p2', kind: 'split', status: 'rejected', attempt: 2 },
  ];
  w.attempts.lastFailure.reference = 'docs/failure-causes.md#kind-gate';
  w.attempts.lastFailure.kind = 'gate';
  v.forecast.progress.release.docs = {
    mode: 'advisory',
    status: 'missing',
    works: [],
    line: 'Шаг документации выпуска: нет работы с меткой docs после корневых работ (add-greeting, locale-format)',
  };
  return v;
}

/** The same demo view as revision 9: no revision 10 field (an alpha.69 harness). */
export function revision9View(lang: 'ru' | 'en' = 'ru'): Json {
  const v = structuredClone(
    read(lang === 'ru' ? '../fixtures/ru/view.sample.json' : '../fixtures/view.sample.json'),
  );
  v.viewRevision = 9;
  return v;
}
