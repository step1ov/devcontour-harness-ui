// View revision 10 (harness 0.1.0-alpha.70) for the tests: the demo view
// with every new field once. The values follow the harness tests of
// tests/operator-view-alpha70.test.ts (commit a01903b): the cost breakdown
// of its five calls (two works, three attempts, one call without a price, a
// release closed at 11:00), the second pass that refuted «ложная» with its
// basis and lifted the rejection, a follow-up the lead accepted with its
// reason, a split waiting for the lead, the per-work cost, the reference URL
// of this harness version and the docs step `missing` with its roots.
import { readFileSync } from 'node:fs';

type Json = Record<string, any>;

const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;

const amount = (usd: number, calls: number, unpricedCalls = 0) => ({
  usd,
  bound: unpricedCalls ? 'lower' : 'exact',
  calls,
  unpricedCalls,
});

/** The attempts of `locale-format`: the second one only unpriced calls. */
const localeAttempts = () => [
  { runId: 'r1', attempt: 1, ...amount(2.5, 2) },
  { runId: 'r2', attempt: 2, ...amount(0, 1, 1) },
];

/** The cost breakdown of the harness test, on the demo works. */
export function costs(): Json {
  return {
    total: amount(3.75, 5, 1),
    release: { ...amount(1, 2, 1), since: '2026-11-24T11:00:00.000Z', sinceRelease: true },
    byRole: [
      { role: 'writer', ...amount(3, 3, 1) },
      { role: 'reviewer', ...amount(0.5, 1) },
      { role: 'planner', ...amount(0.25, 1) },
    ],
    byModel: [
      { runtime: 'claude', vendor: 'anthropic', model: 'claude-x', ...amount(3, 3, 1) },
      { runtime: 'codex', vendor: 'openai', model: 'gpt-x', ...amount(0.75, 2) },
    ],
    byModelTruncated: 0,
    byWork: [
      {
        workId: 'locale-format',
        ...amount(2.5, 3, 1),
        attempts: localeAttempts(),
        attemptsTruncated: 0,
      },
      {
        workId: 'import-csv',
        ...amount(1, 1),
        attempts: [{ runId: 'r3', attempt: 1, ...amount(1, 1) }],
        attemptsTruncated: 0,
      },
    ],
    byWorkTruncated: 0,
  };
}

/** The reference URL the harness gives: its repository at the tag of its version. */
export const REFERENCE_URL =
  'https://github.com/step1ov/devcontour-harness/blob/v0.1.0-alpha.70/docs/failure-causes.md#kind-gate';

/**
 * The demo view (`lang` copy) as revision 10. `locale-format` gets the second
 * pass, a proposal of each kind, its cost and the failure reference; the
 * release gets the docs step.
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
      secondPass: {
        mode: 'on-reject',
        status: 'ran',
        refuted: 1,
        missed: 0,
        overturned: true,
        refutedFindings: [{ finding: 'ложная', basis: 'обработано в строке 3' }],
      },
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
    {
      id: 'p1',
      kind: 'follow-up',
      status: 'accepted',
      attempt: 1,
      title: 'Локализация',
      goal: 'Строки в словарь локалей',
      reason: 'вне критериев',
      decision: { by: 'lead', at: '2026-11-19T11:45:00.000Z', reason: 'Вносим в следующий план' },
    },
    {
      id: 'p2',
      kind: 'split',
      status: 'proposed',
      attempt: 2,
      title: 'разделение на 2 части',
      parts: 2,
      reason: 'форматы дат и чисел независимы',
    },
  ];
  w.cost = { ...amount(2.5, 3, 1), byAttempt: localeAttempts(), byAttemptTruncated: 0 };
  w.attempts.lastFailure.reference = 'docs/failure-causes.md#kind-gate';
  w.attempts.lastFailure.referenceUrl = REFERENCE_URL;
  w.attempts.lastFailure.kind = 'gate';
  v.forecast.progress.release.docs = {
    mode: 'advisory',
    status: 'missing',
    works: [],
    missingRoots: ['add-greeting', 'locale-format'],
    line:
      lang === 'ru'
        ? 'Шаг документации выпуска: нет работы с меткой docs после корневых работ (add-greeting, locale-format)'
        : 'Release documentation step: no work labelled docs after the root works (add-greeting, locale-format)',
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
