// The whole scope, rough times, task cards and the process timeline
// (alpha.4): pure model code over the demo fixtures and made-up variants.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { asAlpha57, asAlpha59 } from './legacy.ts';

// The revision 3 shape (harness alpha.59) of the fixtures: revision 4 is in revision4.test.tsx.

import {
  attemptAverage,
  checkView,
  checkWorkDetail,
  formatRange,
  formatRough,
  nextSteps,
  overallProgress,
  scopeLeft,
  scopeOf,
  splitQuestions,
  stageLeft,
  taskCards,
  timelineOf,
  timelines,
  type OperatorView,
  type WorkDetailView,
} from '../src/model/index.ts';

const read = <T>(rel: string): T =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as T;
const viewOf = (rel: string): OperatorView => {
  const c = checkView(read(rel));
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const viewOf59 = (rel: string): OperatorView => {
  const c = checkView(asAlpha59(read(rel)));
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const view = viewOf59('../fixtures/view.sample.json');
const stopped = viewOf59('../fixtures/view.stopped.json');
const running = (() => {
  const c = checkWorkDetail(read('../fixtures/work.sample.json'));
  if (!c.ok) throw new Error(c.message);
  return c.detail;
})();
const at = (iso: string) => Date.parse(iso);

test('overall progress: harness counts, never the clipped list; scope tasks outside are added', () => {
  assert.deepEqual(overallProgress(view), {
    total: 4,
    done: 1,
    running: 1,
    waiting: 2,
    cancelled: 0,
    outside: undefined,
    outsideUnlisted: 0,
  });
  // A clipped works list does not change the counts: they come from `progress`.
  assert.equal(overallProgress({ ...view, works: view.works.slice(0, 1) }).total, 4);
  const withScope = {
    ...view,
    scope: {
      total: 8,
      tasks: [
        { id: 'T-1', workId: 'add-greeting', state: 'in-harness' },
        { id: 'T-7', title: 'Search page', state: 'not-handed-over' },
        { id: 'T-8', state: 'not-ready', plain: 'criteria are not written yet' },
        { id: 42, state: 'not-ready' }, // malformed: dropped
      ],
    },
  } as OperatorView;
  const s = scopeOf(withScope)!;
  assert.equal(s.tasks.length, 3);
  // Two tasks outside the harness are listed; of 8 in the snapshot, 3 are listed: 5 are
  // clipped, of unknown state — named as not shown, never counted as outside or in the total.
  assert.deepEqual(overallProgress(withScope), {
    total: 6,
    done: 1,
    running: 1,
    waiting: 2,
    cancelled: 0,
    outside: 2,
    outsideUnlisted: 5,
  });
  // `truncated.scope` (revision 4) is the clipped count when present.
  assert.equal(
    overallProgress({ ...withScope, truncated: { scope: 7 } } as OperatorView).outsideUnlisted,
    7,
  );
  // A scope section without a valid task reads as absent, not as "nothing outside".
  assert.equal(
    scopeOf({ ...view, scope: { tasks: [{ id: 1 }] } } as unknown as OperatorView),
    undefined,
  );
  assert.equal(scopeOf({ ...view, scope: 'all' } as unknown as OperatorView), undefined);
});

test('rough times: ranges from observed times, unknown never zero', () => {
  // 11 attempts, 33 000 000 ms in the window: 50 min on average.
  assert.deepEqual(attemptAverage(view), { ms: 3_000_000, samples: 11 });
  // 3 works left, 2 slots: at best 2 rounds of 50 min, at worst 3 in a row.
  assert.deepEqual(scopeLeft(view).range, { loMs: 6_000_000, hiMs: 9_000_000 });
  // The low end rounds down, the high end up: never narrower than the numbers.
  assert.equal(formatRange(scopeLeft(view).range!, 'ru'), '1,5–2,5 ч');
  // Below the sample minimum or without totals (alpha.55): no range at all.
  const few = {
    ...view,
    history: { ...view.history, totals: { ...view.history.totals!, attemptsStarted: 2 } },
  };
  assert.equal(attemptAverage(few), undefined);
  assert.equal(scopeLeft(few).range, undefined);
  const { totals: _t, ...noTotals } = view.history;
  assert.equal(scopeLeft({ ...view, history: noTotals }).range, undefined);
  // Nothing left: no range, zero works.
  assert.deepEqual(
    scopeLeft({ ...view, progress: { ...view.progress, done: 4, running: 0 } }).works,
    0,
  );
  assert.equal(formatRough(20_000, 'ru'), 'меньше минуты');
  assert.equal(formatRough(7 * 60_000 + 1, 'ru'), '8 мин');
  assert.equal(formatRough(41 * 60_000, 'en'), '45 min');
  assert.equal(formatRough(70 * 60_000, 'ru'), '1,5 ч');
  assert.equal(formatRange({ loMs: 10_000, hiMs: 4 * 60_000 }, 'ru'), 'до 4 мин');
  assert.equal(formatRange({ loMs: 5 * 60_000, hiMs: 12 * 60_000 }, 'ru'), '5–12 мин');
  assert.equal(formatRange({ loMs: 5 * 60_000, hiMs: 5 * 60_000 }, 'en'), 'about 5 min');
  assert.equal(formatRange({ loMs: 10_000, hiMs: 20_000 }, 'en'), 'under a minute');
});

test('the rest of a stage: typical minus elapsed; longer than usual is said, not a negative', () => {
  const w = view.works.find((x) => x.id === 'locale-format')!;
  // Gates since 11:52:10, usually 5–12 min.
  assert.deepEqual(stageLeft(w, at('2026-11-19T11:54:10Z')), {
    kind: 'range',
    range: { loMs: 180_000, hiMs: 600_000 },
  });
  assert.deepEqual(stageLeft(w, at('2026-11-19T12:10:00Z')), { kind: 'over', usualMaxMs: 720_000 });
  const { typical: _t, ...stage } = w.stage;
  assert.equal(stageLeft({ ...w, stage }, at('2026-11-19T11:54:10Z')), undefined);
  // Not a slot stage: nothing to count down.
  assert.equal(
    stageLeft({ ...w, stage: { ...w.stage, name: 'queued' } }, at('2026-11-19T11:54:10Z')),
    undefined,
  );
});

test('task cards: running never waits (F-J), accepted never stopped (F-AY)', () => {
  // A running work with a stale "not ready" blocker and a controller wait.
  const busy: OperatorView = {
    ...view,
    works: view.works.map((w) =>
      w.id === 'locale-format'
        ? {
            ...w,
            blockers: [{ code: 'NOT_READY', plain: 'already in work', actor: 'controller' }],
            stage: { ...w.stage, needs: { actor: 'controller', action: 'wait' } },
          }
        : w.id === 'add-greeting'
          ? {
              ...w,
              blockers: [
                { code: 'NOT_READY', plain: 'already accepted', actor: null },
                { code: 'ATTEMPTS_EXHAUSTED', plain: 'already accepted', actor: null },
              ],
            }
          : w,
    ),
  };
  const steps = nextSteps(busy);
  assert.ok(!steps.queue.some((q) => q.workId === 'locale-format'));
  assert.ok(!steps.other.some((s) => s.workIds.includes('locale-format')));
  assert.ok(!steps.queue.some((q) => q.workId === 'add-greeting'));
  const cards = taskCards(busy, steps);
  const byId = (id: string) => cards.find((c) => c.work.id === id)!;
  assert.equal(byId('locale-format').phase, 'running');
  assert.deepEqual(byId('locale-format').next, { kind: 'harness', stage: 'gates' });
  assert.equal(byId('add-greeting').phase, 'accepted');
  assert.deepEqual(byId('add-greeting').next, { kind: 'nobody' });
  assert.equal(byId('export-csv').phase, 'question');
  assert.deepEqual(byId('export-csv').next, { kind: 'actors', actors: ['operator'] });
  assert.deepEqual(byId('docs-page').next, { kind: 'dependency', on: ['export-csv'] });
  // Running first, accepted last.
  assert.equal(cards[0]!.work.id, 'locale-format');
  assert.equal(cards.at(-1)!.work.id, 'add-greeting');
  // The stopped run: a decision of the operator after the lead; the dependent waits.
  const st = taskCards(stopped, nextSteps(stopped));
  assert.equal(st[0]!.phase, 'stopped');
  assert.deepEqual(st[0]!.next, { kind: 'actors', actors: ['lead', 'operator'] });
});

test('a technical question the lead answers by the policy is not yours (F-W)', () => {
  const asking: OperatorView = {
    ...view,
    questions: view.questions.map((q) =>
      q.workId === 'locale-format' ? { ...q, state: 'awaiting-answer' } : q,
    ),
  };
  const steps = nextSteps(asking);
  const split = splitQuestions(asking, steps);
  assert.deepEqual(
    split.yours.map((q) => q.workId),
    ['export-csv'],
  );
  assert.deepEqual(
    split.lead.map((q) => q.workId),
    ['locale-format'],
  );
  // Without `leadAnswers.technical` the same question is yours.
  const strict: OperatorView = {
    ...asking,
    settings: {
      ...asking.settings,
      thresholds: { ...asking.settings.thresholds, leadAnswersTechnical: false },
    },
  };
  assert.equal(splitQuestions(strict, nextSteps(strict)).yours.length, 2);
});

test('process timeline: stages with time and outcome; review is a stage; acceptance last', () => {
  const [latest, earlier] = timelines(running);
  assert.deepEqual(
    latest!.steps.map((s) => [s.stage, s.state, s.durationMs]),
    [
      ['prepare', 'passed', 20_000],
      ['writer', 'passed', 600_000],
      // The finished check (lint, 30 s) counts; the running one (unit) has no time yet.
      ['gates', 'current', 30_000],
      ['review', 'ahead', undefined],
      ['integration', 'ahead', undefined],
      ['acceptance', 'ahead', undefined],
    ],
  );
  // The failed earlier attempt stopped at the checks: the rest was not reached.
  assert.deepEqual(
    earlier!.steps.map((s) => [s.stage, s.state]),
    [
      ['prepare', 'passed'],
      ['writer', 'passed'],
      ['gates', 'failed'],
      ['review', 'skipped'],
      ['integration', 'skipped'],
      ['acceptance', 'skipped'],
    ],
  );
  // An accepted work: acceptance passed. A newer stage name keeps its place.
  const accepted = read<WorkDetailView>('../fixtures/work.accepted.sample.json');
  const done = timelineOf(accepted.attempts[0], accepted.work, true);
  assert.equal(done.at(-1)!.state, 'passed');
  const odd = timelineOf(
    { ...running.attempts[0]!, stages: [{ stage: 'sandbox-probe', durationMs: 5_000 }] },
    running.work,
    true,
  );
  assert.ok(odd.some((s) => s.stage === 'sandbox-probe'));
  // No attempt yet: everything ahead.
  const fresh = timelineOf(
    undefined,
    { ...running.work, stage: { name: 'queued', next: [] } },
    true,
  );
  assert.ok(fresh.every((s) => s.state === 'ahead'));
});

test('review fixes: accepted works ask nothing; running works keep named actors; one current stage', () => {
  // An accepted work with stale records of the lead and you: no step, no count (F-AY).
  const stale: OperatorView = {
    ...view,
    works: view.works.map((w) =>
      w.id === 'add-greeting'
        ? {
            ...w,
            blockers: [{ code: 'APPROVAL_STALE', plain: 'approve again', actor: 'lead' }],
            stage: { ...w.stage, needs: { actor: 'operator', action: 'reset-attempts' } },
          }
        : w.id === 'locale-format'
          ? {
              ...w,
              // A running work: "not ready" is dropped, a named fix stays (F-J).
              blockers: [
                { code: 'NOT_READY', plain: 'already in work', actor: 'controller' },
                { code: 'ACCESS_DENIED', plain: 'no access to the registry', actor: 'operator' },
              ],
              stage: { ...w.stage, needs: { actor: 'operator', action: 'fix-access' } },
            }
          : w,
    ),
  };
  const steps = nextSteps(stale);
  assert.ok(![...steps.lead, ...steps.operator].some((s) => s.workIds.includes('add-greeting')));
  const access = steps.operator.filter((s) => s.workIds.includes('locale-format'));
  assert.ok(access.some((s) => s.code === 'ACCESS_DENIED'));
  assert.ok(access.some((s) => s.action === 'fix-access'));
  assert.ok(!access.some((s) => s.code === 'NOT_READY'));
  assert.ok(!steps.other.some((s) => s.workIds.includes('locale-format')));
  // The task card names the same people as the Overview.
  const card = taskCards(stale, steps).find((c) => c.work.id === 'locale-format')!;
  assert.equal(card.phase, 'running');
  assert.deepEqual(card.next, { kind: 'actors', actors: ['operator'] });

  // Stages seen without an outcome before the current one: passed, and only one runs now.
  const row = {
    ...running.attempts[0]!,
    stages: [{ stage: 'prepare' }, { stage: 'writer' }, { stage: 'gates' }],
  };
  assert.deepEqual(
    timelineOf(row, running.work, true).map((s) => s.state),
    ['passed', 'passed', 'current', 'ahead', 'ahead', 'ahead'],
  );
  // A latest attempt that failed with attempts left: the rest comes in the next attempt.
  const failedRow = {
    ...running.attempts[1]!,
  };
  const retrying = {
    ...running.work,
    stage: { name: 'queued', next: [] },
    attempts: { ...running.work.attempts, left: 1 },
  };
  assert.deepEqual(
    timelineOf(failedRow, retrying, true).map((s) => s.state),
    ['passed', 'passed', 'failed', 'next', 'next', 'next'],
  );
  // Out of attempts: not reached, no promise of a next attempt.
  const out = { ...retrying, attempts: { ...retrying.attempts, left: 0 } };
  assert.equal(timelineOf(failedRow, out, true).at(-1)!.state, 'skipped');
  // An accepted work without a review stage: «не понадобилось», not «не дошло».
  const accepted = read<WorkDetailView>('../fixtures/work.accepted.sample.json');
  const noReview = timelineOf(
    {
      ...accepted.attempts[0]!,
      stages: accepted.attempts[0]!.stages.filter((s) => s.stage !== 'candidate-review'),
    },
    accepted.work,
    true,
  );
  assert.equal(noReview.find((s) => s.stage === 'review')!.state, 'not-needed');
});

test('cancelled works are counted apart, never as waiting', () => {
  const v: OperatorView = {
    ...view,
    progress: {
      ...view.progress,
      total: 4,
      done: 3,
      running: 0,
      byStage: { done: 3, cancelled: 1 },
    },
  };
  const o = overallProgress(v);
  assert.equal(o.cancelled, 1);
  assert.equal(o.waiting, 0);
  assert.equal(scopeLeft(v).works, 0);
});

test('review round 2: a named stage need is not «just waits»; cancelled keeps its escalation', () => {
  // Stopped, its only reason names nobody, the stage names the lead: never in the queue.
  const v: OperatorView = {
    ...view,
    works: view.works.map((w) =>
      w.id === 'docs-page'
        ? {
            ...w,
            dependsOn: [],
            stage: {
              ...w.stage,
              name: 'stopped',
              needs: { actor: 'lead', action: 'diagnose-failure' },
            },
            blockers: [{ code: 'GATE_FAILED', plain: 'a check failed', actor: null }],
          }
        : w,
    ),
  };
  const steps = nextSteps(v);
  assert.ok(!steps.queue.some((q) => q.workId === 'docs-page'));
  assert.ok(steps.lead.some((s) => s.workIds.includes('docs-page')));
  // A cancelled work: blockers and needs dropped, the lead's escalation kept; its dependent says so.
  const c: OperatorView = {
    ...view,
    works: view.works.map((w) =>
      w.id === 'export-csv'
        ? {
            ...w,
            stage: { name: 'cancelled', next: [], needs: { actor: 'operator', action: 'answer' } },
            blockers: [{ code: 'INPUT_REQUIRED', plain: 'waits for you', actor: 'operator' }],
          }
        : w,
    ),
    questions: view.questions.filter((q) => q.workId !== 'export-csv'),
    escalations: [
      {
        workId: 'export-csv',
        code: 'CANCELLED',
        actor: 'lead',
        action: 'replan-dependents',
        since: view.generatedAt,
      },
    ],
  };
  const cs = nextSteps(c);
  assert.deepEqual(
    cs.lead.filter((s) => s.workIds.includes('export-csv')).map((s) => s.action),
    ['replan-dependents'],
  );
  assert.ok(!cs.operator.some((s) => s.workIds.includes('export-csv')));
  assert.deepEqual(cs.unlistedAnswers, []);
});

test('review round 2: timeline never guesses a missing record or promises a next attempt', () => {
  // Running at the checks, the row has no stage records yet: earlier stages unknown, not «впереди».
  const bare = { ...running.attempts[0]!, stages: [] };
  assert.deepEqual(
    timelineOf(bare, running.work, true).map((s) => s.state),
    ['unknown', 'unknown', 'current', 'ahead', 'ahead', 'ahead'],
  );
  // An accepted work without stage records: unknown, not «не понадобилось».
  const accepted = read<WorkDetailView>('../fixtures/work.accepted.sample.json');
  const none = timelineOf({ ...accepted.attempts[0]!, stages: [] }, accepted.work, true);
  assert.ok(none.slice(0, -1).every((s) => s.state === 'unknown'));
  assert.ok(
    timelineOf(undefined, accepted.work, true)
      .slice(0, -1)
      .every((s) => s.state === 'unknown'),
  );
  // A failed row that names no failed stage (a stall in writing): after the last seen stage, the next attempt.
  const stalled = {
    ...running.attempts[1]!,
    stages: [
      { stage: 'prepare', durationMs: 1000, outcome: 'passed' as const },
      { stage: 'writer' },
    ],
  };
  const queued = { ...running.work, stage: { name: 'queued', next: [] } };
  assert.deepEqual(
    timelineOf(stalled, queued, true).map((s) => s.state),
    ['passed', 'unknown', 'next', 'next', 'next', 'next'],
  );
  // A cancelled work is promised nothing.
  const cancelled = { ...running.work, stage: { name: 'cancelled', next: [] } };
  assert.ok(
    !timelineOf(stalled, cancelled, true).some((s) => s.state === 'next' || s.state === 'ahead'),
  );
});

test('revision 3 stages: prepare and the dependency store group into preparation; revision 2 stays readable', () => {
  const row = running.attempts[0]!;
  const [prep] = timelineOf(row, running.work, true);
  assert.equal(prep!.durationMs, 20_000);
  assert.deepEqual(
    prep!.parts!.map((p) => [p.stage, p.unused ?? false]),
    [
      ['dependency-store', true],
      ['prepare', false],
    ],
  );
  // The same attempt from alpha.57/58: preparing ran inside writing, the store is not «unused».
  const old = asAlpha57(running).attempts[0]!;
  const steps57 = timelineOf(old, running.work, true);
  assert.equal(steps57[0]!.durationMs, 2_000);
  assert.equal(steps57[1]!.durationMs, 618_000);
  assert.ok(!steps57.some((s) => s.unused || s.parts?.some((p) => p.unused)));
  // Every recorded stage lands in a process step; integration stages in integration.
  const accepted = read<WorkDetailView>('../fixtures/work.accepted.sample.json');
  const all = timelineOf(accepted.attempts[0], accepted.work, true);
  assert.deepEqual(
    all.map((s) => [s.stage, s.state, s.parts?.length ?? 0]),
    [
      ['prepare', 'passed', 2],
      ['writer', 'passed', 1],
      ['gates', 'passed', 2],
      ['review', 'passed', 1],
      ['integration', 'passed', 2],
      ['acceptance', 'passed', 0],
    ],
  );
});

test('review round 3: rechecks, the harness stage map, neutral parts, the current step between parts', () => {
  const base = running.attempts[1]!; // finished attempt row
  const accepted = read<WorkDetailView>('../fixtures/work.accepted.sample.json');
  const row = (stages: WorkDetailView['attempts'][number]['stages']) => ({
    ...base,
    status: 'succeeded',
    stages,
  });
  // A failed check that its recheck passed does not fail the step; the accepted work stays passed.
  const rechecked = timelineOf(
    row([
      { stage: 'writer-dependencies', durationMs: 4_000, outcome: 'passed' },
      { stage: 'candidate-environment:setup', durationMs: 3_000, outcome: 'passed' },
      { stage: 'implementation', durationMs: 60_000, outcome: 'passed' },
      { stage: 'generate:sdk', durationMs: 40_000, outcome: 'passed' },
      { stage: 'candidate-test:unit', durationMs: 30_000, outcome: 'failed' },
      { stage: 'candidate-recheck:unit', durationMs: 31_000, outcome: 'passed' },
      { stage: 'candidate-review', durationMs: 20_000, outcome: 'passed' },
      // Cleanup after the review and the integration queue: neither fail a step nor count as work.
      { stage: 'candidate-environment:cleanup', durationMs: 9_000, outcome: 'failed' },
      { stage: 'integration-wait', durationMs: 600_000, outcome: 'passed' },
      { stage: 'integration-test:unit', durationMs: 25_000, outcome: 'passed' },
    ]),
    accepted.work,
    true,
  );
  assert.deepEqual(
    rechecked.map((s) => [s.stage, s.state, s.durationMs]),
    [
      ['prepare', 'passed', 7_000],
      ['writer', 'passed', 60_000],
      ['gates', 'passed', 101_000],
      ['review', 'passed', 20_000],
      ['integration', 'passed', 25_000],
      ['acceptance', 'passed', undefined],
    ],
  );
  // Running between two checks (lint passed, unit not opened yet): the checks run now.
  const between = timelineOf(
    {
      ...running.attempts[0]!,
      stages: [{ stage: 'candidate-test:lint', durationMs: 5_000, outcome: 'passed' }],
    },
    running.work,
    true,
  );
  assert.equal(between.find((s) => s.stage === 'gates')!.state, 'current');
});
