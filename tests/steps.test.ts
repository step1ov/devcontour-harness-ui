// Who acts next (src/model/steps.ts): the grouping behind the Overview's
// «Нужно от вас» and «Остальные ожидания», on the stopped-run fixture (a
// work out of attempts behind a stale plan approval, and a work that waits
// for it) and on hand-made edge cases.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkView, headerSentence, type OperatorView, type WorkView } from '../src/model/index.ts';
import {
  actorsOn,
  attemptsLineParts,
  dependencyState,
  nextSteps,
  withWorkNames,
  workName,
} from '../src/model/steps.ts';

const load = (rel: string): OperatorView => {
  const c = checkView(JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')));
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const stopped = load('../fixtures/ru/view.stopped.json');
const sample = load('../fixtures/view.sample.json');
const W1 = 'tw1a2b3c4d5e6f7a8b9c0';
const W2 = 'tw2a2b3c4d5e6f7a8b9c0';

test('stopped run: one operator decision after the lead, one lead line for both works, one dependency', () => {
  const s = nextSteps(stopped);
  assert.deepEqual(s.questions, []); // the only question is already answered by the lead
  assert.deepEqual(s.unlistedAnswers, []);

  assert.equal(s.operator.length, 1);
  const reset = s.operator[0]!;
  assert.deepEqual(reset.workIds, [W1]);
  assert.equal(reset.code, 'ATTEMPTS_EXHAUSTED');
  assert.equal(reset.action, 'reset-attempts');
  assert.match(reset.plain!, /попытки исчерпаны \(3 из 3\)/);
  // The blocker, the escalation and the stage name the same stop: one line.
  assert.deepEqual(
    reset.records.map((r) => r.source),
    ['blocker', 'escalation', 'needs'],
  );
  // The stale approval blocks the next attempt: the lead acts first.
  assert.equal(reset.after.length, 1);
  assert.equal(reset.after[0]!.code, 'APPROVAL_STALE');

  // The same stale approval on both works is one thing for the lead to do.
  assert.equal(s.lead.length, 1);
  assert.deepEqual(s.lead[0]!.workIds, [W1, W2]);
  assert.equal(s.lead[0]!.code, 'APPROVAL_STALE');
  assert.equal(reset.after[0], s.lead[0]);

  // WEB-2 waits for WEB-1; its NOT_READY blocker (operator), escalation and
  // stage (lead: diagnose-failure) all describe that wait, not an own step.
  assert.equal(s.dependencies.length, 1);
  const dep = s.dependencies[0]!;
  assert.equal(dep.workId, W2);
  assert.deepEqual(dep.on, [W1]);
  assert.equal(dep.code, 'NOT_READY');
  assert.deepEqual(
    dep.records.map((r) => `${r.source}:${r.actor}:${r.action ?? ''}`),
    ['blocker:operator:', 'escalation:lead:diagnose-failure', 'needs:lead:diagnose-failure'],
  );
  assert.deepEqual(s.other, []);
  assert.deepEqual(s.queue, []);
  // On WEB-1: first the lead, then you.
  assert.deepEqual(actorsOn(s, W1), ['lead', 'operator']);
});

test('the header counts exactly the «Нужно от вас» items, and says the lead goes first', () => {
  const s = nextSteps(stopped);
  const counts = {
    running: 0,
    queued: 0,
    stopped: 1,
    paused: false,
    questions: s.questions.length,
    decisions: s.operator.length,
    afterLead: s.operator.every((x) => x.after.length > 0),
    waitingOperator: stopped.progress.waitingOperator,
    incomplete: false,
  };
  assert.equal(
    headerSentence(counts, 'ru'),
    'Сейчас: остановлено 1. От вас: принять 1 решение (после ведущего).',
  );
  assert.equal(
    headerSentence(counts, 'en'),
    'Now: 1 stopped. From you: take 1 decision (after the lead agent).',
  );
  assert.equal(
    headerSentence({ ...counts, afterLead: false }, 'ru'),
    'Сейчас: остановлено 1. От вас: принять 1 решение.',
  );
});

test('a question is the item for a work that waits for an answer, not a decision', () => {
  const s = nextSteps(sample);
  assert.deepEqual(
    s.questions.map((q) => q.requestId),
    ['q-17'],
  );
  // export-csv: INPUT_REQUIRED (operator) and stage needs «answer» — covered by q-17.
  assert.deepEqual(s.operator, []);
  // docs-page waits for export-csv, where you act (the question).
  assert.deepEqual(
    s.dependencies.map((d) => [d.workId, d.on]),
    [['docs-page', ['export-csv']]],
  );
  assert.deepEqual(actorsOn(s, 'export-csv'), ['operator']);
  // Without the question listed, the work is named as an unlisted answer, never a decision.
  const unlisted = nextSteps({ ...sample, questions: [] });
  assert.deepEqual(unlisted.operator, []);
  assert.deepEqual(unlisted.unlistedAnswers, ['export-csv']);
});

const work = (id: string, over: Partial<WorkView>): WorkView => ({
  ...stopped.works[0]!,
  id,
  title: `${id.toUpperCase()}: t`,
  dependsOn: [],
  blockers: [],
  ...over,
});

test('edge cases: user actor, null actor, unexplained stop, subject escalation, other actors', () => {
  const v: OperatorView = {
    ...stopped,
    works: [
      // `user` is the harness diagnosis name of the operator.
      work('a', {
        blockers: [{ code: 'BUDGET_EXHAUSTED', plain: 'budget used up', actor: 'user' }],
        stage: { name: 'stopped', next: [] },
      }),
      // Just waits its turn.
      work('b', {
        blockers: [{ code: 'SLOT_BUSY', actor: null }],
        stage: { name: 'queued', next: [] },
      }),
      // Stopped without any reason or actor.
      work('c', { blockers: [], stage: { name: 'stopped', next: [] } }),
      // The controller acts; the lead diagnoses (not a lead-first code).
      work('d', {
        blockers: [
          { code: 'CONTROLLER_BUSY', plain: 'busy', actor: 'controller' },
          { code: 'GATE_FAILED', plain: 'lint failed', actor: 'lead' },
          { code: 'ATTEMPTS_EXHAUSTED', plain: 'used up', actor: 'operator' },
        ],
        stage: { name: 'stopped', next: [] },
      }),
    ],
    questions: [],
    escalations: [
      {
        subject: 'review-r1',
        code: 'REVIEW_ESCALATION',
        actor: 'operator',
        action: 'user-decision',
        since: stopped.generatedAt,
      },
      // An escalation of a work outside the (clipped) list still reaches its actor.
      {
        workId: 'zz-hidden',
        code: 'GATE_FAILED',
        actor: 'lead',
        action: 'diagnose-failure',
        since: stopped.generatedAt,
      },
    ],
  };
  const s = nextSteps(v);
  assert.deepEqual(
    s.operator.map((x) => [x.workIds.join(), x.subject ?? '', x.code, x.after.length]),
    [
      ['a', '', 'BUDGET_EXHAUSTED', 0],
      ['d', '', 'ATTEMPTS_EXHAUSTED', 0], // a lead diagnosis does not gate the reset
      ['', 'review-r1', 'REVIEW_ESCALATION', 0],
    ],
  );
  assert.equal(s.operator[0]!.actor, 'operator');
  assert.deepEqual(
    s.lead.map((x) => [x.workIds.join(), x.code, x.action ?? '']),
    [
      ['d', 'GATE_FAILED', ''],
      ['zz-hidden', 'GATE_FAILED', 'diagnose-failure'],
    ],
  );
  assert.deepEqual(
    s.other.map((x) => [x.actor, x.workIds.join()]),
    [['controller', 'd']],
  );
  assert.deepEqual(
    s.queue.map((q) => [q.workId, q.unexplained, q.blockers.map((b) => b.code).join()]),
    [
      ['b', false, 'SLOT_BUSY'],
      ['c', true, ''],
    ],
  );
  // A dependency outside the list counts as unfinished; an accepted one does not.
  const dep = nextSteps({
    ...v,
    escalations: [],
    works: [
      work('e', {
        dependsOn: ['gone', 'a'],
        blockers: [{ code: 'NOT_READY', plain: 'waits', actor: 'lead' }],
        stage: { name: 'blocked', next: [] },
      }),
      work('a', { stage: { name: 'done', next: [] } }),
    ],
  });
  assert.deepEqual(
    dep.dependencies.map((d) => d.on),
    [['gone']],
  );
  assert.deepEqual(dep.lead, []);
  // NOT_READY without unfinished dependencies is an own step of its actor.
  const own = nextSteps({
    ...v,
    escalations: [],
    works: [work('f', { blockers: [{ code: 'NOT_READY', plain: 'x', actor: 'lead' }] })],
  });
  assert.deepEqual(
    own.lead.map((x) => x.code),
    ['NOT_READY'],
  );
});

test('attempts line: failure groups are split out, everything else stays text', () => {
  const ru = stopped.works[0]!.attempts.line!;
  const parts = attemptsLineParts(ru);
  assert.deepEqual(
    parts.filter((p) => 'bucket' in p),
    [
      { bucket: 'incomplete', count: '2' },
      { bucket: 'time-limit', count: '1' },
      { bucket: 'input', count: '1' },
    ],
  );
  // Joined back, the parts are the harness line.
  const join = (ps: ReturnType<typeof attemptsLineParts>) =>
    ps.map((p) => ('text' in p ? p.text : `${p.bucket} ${p.count}`)).join('');
  assert.equal(join(parts), ru);
  const en =
    'attempts 5; failures 5 (defect 2, brand-new 1, and 2 more); time limit 0; attempts left 0 of 3';
  const enParts = attemptsLineParts(en);
  assert.equal(join(enParts), en);
  assert.deepEqual(
    enParts.filter((p) => 'bucket' in p).map((p) => ('bucket' in p ? p.bucket : '')),
    ['defect', 'brand-new'],
  );
  assert.ok(enParts.some((p) => 'text' in p && p.text === 'and 2 more'));
  // No failure list: one text part.
  assert.deepEqual(attemptsLineParts('попыток 0; отказов 0; по времени 0'), [
    { text: 'попыток 0; отказов 0; по времени 0' },
  ]);
});

test('work names: the title key, a readable id, or the title of an opaque id', () => {
  assert.equal(workName(stopped, W1), 'WEB-1');
  assert.equal(workName(sample, 'export-csv'), 'export-csv'); // title without a key
  const opaque = {
    works: [{ ...stopped.works[0]!, id: 't62c12c8100e7ce25d3e0', title: 'Order form' }],
  };
  assert.equal(workName(opaque, 't62c12c8100e7ce25d3e0'), 'Order form');
  assert.equal(workName(stopped, 'missing'), 'missing');
  assert.equal(
    withWorkNames(stopped, `ждёт зависимости ${W1} — она остановлена`),
    'ждёт зависимости WEB-1 — она остановлена',
  );
});

test('review round 1: stage needs never join an unrelated stop; plans, terminal works, answers', () => {
  // Without WEB-2's escalation (a clipped list) its stage need (lead:
  // diagnose-failure) belongs to the dependency wait, not to the plan approval.
  const clipped = nextSteps({
    ...stopped,
    escalations: stopped.escalations.filter((e) => e.workId !== W2),
  });
  assert.equal(clipped.lead.length, 1);
  assert.equal(clipped.lead[0]!.action, undefined);
  assert.deepEqual(clipped.lead[0]!.workIds, [W1, W2]);
  assert.deepEqual(
    clipped.dependencies[0]!.records.map((r) => r.source),
    ['blocker', 'needs'],
  );
  // Without WEB-1's escalation the reset still is one line: the stage need
  // joins the blocker whose code asks for that action.
  const noEsc = nextSteps({ ...stopped, escalations: [] });
  assert.equal(noEsc.operator.length, 1);
  assert.equal(noEsc.operator[0]!.action, 'reset-attempts');
  assert.equal(noEsc.operator[0]!.code, 'ATTEMPTS_EXHAUSTED');

  // The same approval text on two plans is two approvals.
  const twoPlans = nextSteps({
    ...stopped,
    works: [stopped.works[0]!, { ...stopped.works[1]!, graphId: 'g-other', dependsOn: [] }],
  });
  assert.deepEqual(
    twoPlans.lead.filter((x) => x.code === 'APPROVAL_STALE').map((x) => x.workIds),
    [[W1], [W2]],
  );

  // A finished work whose stage says "nobody, nothing" is not waiting anywhere.
  const done = nextSteps({
    ...stopped,
    escalations: [],
    works: [
      work('ok', {
        blockers: [],
        stage: { name: 'done', next: [], needs: { actor: null, action: 'none' } },
      }),
    ],
  });
  assert.deepEqual(
    [done.queue, done.operator, done.lead, done.other, done.dependencies],
    [[], [], [], [], []],
  );

  // A technical question the lead may answer is the question, not a lead line too.
  const q = { ...sample.questions[0]!, workId: 'export-csv' };
  const technical = nextSteps({
    ...sample,
    questions: [q],
    escalations: [
      {
        workId: 'export-csv',
        code: 'INPUT_REQUIRED',
        actor: 'lead',
        action: 'answer-input',
        since: sample.generatedAt,
      },
    ],
  });
  assert.deepEqual(technical.lead, []);
  assert.equal(technical.questions.length, 1);
});

test('review round 1: a dependency is never "nobody acts" when the view does not say so', () => {
  const base = { ...stopped, escalations: [] as OperatorView['escalations'], questions: [] };
  const dep = (over: Partial<WorkView>) =>
    nextSteps({
      ...base,
      works: [
        work('w', {
          dependsOn: ['d'],
          blockers: [{ code: 'NOT_READY', plain: 'waits', actor: null }],
          stage: { name: 'blocked', next: [] },
        }),
        work('d', over),
      ],
    });
  const state = (over: Partial<WorkView> | undefined) => {
    const v: OperatorView = over
      ? {
          ...base,
          works: [
            work('w', {
              dependsOn: ['d'],
              blockers: [{ code: 'NOT_READY', plain: 'waits', actor: null }],
              stage: { name: 'blocked', next: [] },
            }),
            work('d', over),
          ],
        }
      : {
          ...base,
          works: [
            work('w', {
              dependsOn: ['d'],
              blockers: [{ code: 'NOT_READY', plain: 'waits', actor: null }],
              stage: { name: 'blocked', next: [] },
            }),
          ],
        };
    return dependencyState(v, nextSteps(v), 'd');
  };
  assert.deepEqual(state(undefined), { kind: 'unknown' }); // not in the view
  assert.deepEqual(state({ stage: { name: 'writer', next: [] } }), {
    kind: 'running',
    stage: 'writer',
  });
  assert.deepEqual(state({ stage: { name: 'queued', next: [] } }), { kind: 'queue' });
  assert.deepEqual(
    state({
      stage: { name: 'input', next: [], needs: { actor: 'operator', action: 'answer' } },
      blockers: [{ code: 'INPUT_REQUIRED', actor: 'operator' }],
    }),
    { kind: 'actors', actors: ['operator'] }, // an unlisted question is still yours
  );
  assert.deepEqual(state({ stage: { name: 'stopped', next: [] } }), {
    kind: 'unknown',
    stage: 'stopped',
  });
  assert.equal(dep({ stage: { name: 'queued', next: [] } }).dependencies.length, 1);
});

test('review round 2: own stage actions stay, one stop per code, approvals merge, chains', () => {
  const base = { ...stopped, escalations: [] as OperatorView['escalations'], questions: [] };
  // A stage need the operator has to act on is never folded into a dependency wait.
  const access = nextSteps({
    ...base,
    works: [
      work('w', {
        dependsOn: ['gone'],
        blockers: [{ code: 'DEPENDENCY_INCOMPLETE', plain: 'waits', actor: null }],
        stage: { name: 'blocked', next: [], needs: { actor: 'operator', action: 'fix-access' } },
      }),
    ],
  });
  assert.deepEqual(
    access.operator.map((x) => x.action),
    ['fix-access'],
  );
  assert.equal(access.dependencies.length, 1);
  // The lead applies an answer: the INPUT_REQUIRED blocker and the stage are one line.
  const apply = nextSteps({
    ...base,
    works: [
      work('w', {
        blockers: [{ code: 'INPUT_REQUIRED', plain: 'answer given', actor: 'lead' }],
        stage: { name: 'input', next: [], needs: { actor: 'lead', action: 'apply-input' } },
      }),
    ],
  });
  assert.deepEqual(
    apply.lead.map((x) => [x.code, x.action, x.records.length]),
    [['INPUT_REQUIRED', 'apply-input', 2]],
  );
  // One plan approval named with and without its action is still one line.
  const [a, b] = stopped.works;
  const approval = nextSteps({
    ...base,
    works: [
      { ...a!, blockers: [a!.blockers[0]!], stage: { name: 'blocked', next: [] } },
      {
        ...b!,
        dependsOn: [],
        blockers: [b!.blockers[0]!],
        stage: { name: 'blocked', next: [], needs: { actor: 'lead', action: 'review-plan' } },
      },
    ],
  });
  assert.deepEqual(
    approval.lead.map((x) => [x.workIds, x.action]),
    [[[W1, W2], 'review-plan']],
  );
  // docs-page waits for export-csv itself: a work behind it is told so, not "just queued".
  const chain = nextSteps(sample);
  assert.deepEqual(dependencyState(sample, chain, 'docs-page'), { kind: 'waits' });
});
