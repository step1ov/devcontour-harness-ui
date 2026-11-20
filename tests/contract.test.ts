// Contract with devcontour-harness: the view schema is owned by the harness.
// tests/contract/harness/*.schema.json are verbatim copies of the harness
// schemas (schemas/operator-view.schema.json, schemas/work-detail-view.schema.json
// of the unreleased 0.1.0-alpha.62, view revision 4: the harness
// fix/empty-state checkout, whose package still says 0.1.0-alpha.61 — refresh
// from the published package on release); empty-state.view.json is a real
// `harness view --lang en` envelope of that checkout for a state that does not
// exist yet (examples/two-vendors policy). tests/contract/harness-0.1.0-alpha.60/
// keeps the same files of 0.1.0-alpha.60 (revision 4 without
// `progress.queue.neverRun` and `scopeReason`), harness-0.1.0-alpha.59/
// (revision 3), harness-0.1.0-alpha.57/ (revision 2, also alpha.58),
// harness-0.1.0-alpha.56/ and harness-0.1.0-alpha.55/ keep the same files of
// 0.1.0-alpha.59, .57, .56 (revision 1) and .55 (revision 0): the panel
// still supports those harnesses (peer >=0.1.0-alpha.55), so older-shaped
// documents must pass their own and every newer schema and the gate. With
// DEVCONTOUR_HARNESS_DIR pointing at a harness checkout the copies are
// compared byte for byte and a live smoke runs that checkout's
// `capabilities` and `view`.

import { strict as assert } from 'node:assert';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  checkView,
  checkWorkDetail,
  type ActivityEntry,
  type AnswerBasis,
  type AttemptRow,
  type BlockerView,
  type DecisionView,
  type DriftView,
  type Escalation,
  type FindingView,
  type ForecastView,
  type QuestionOption,
  type ScopeTaskView,
  type SourceHealth,
  type SourceQuestion,
  type UpdatesView,
  type HistoryTotals,
  type OperatorQuestion,
  type OperatorView,
  type ReviewRuleView,
  type ReviewSubjectView,
  type RoleBinding,
  type TargetView,
  type VerificationRow,
  type ViewHealth,
  type ViewHistory,
  type ViewProgress,
  type ViewSettings,
  type WorkDetailView,
  type WorkView,
} from '../src/model/index.ts';
import { validate } from './contract/json-schema.ts';
import { asAlpha55, asAlpha56, asAlpha57, asAlpha59 } from './legacy.ts';
import { instantMs } from '../src/model/compat.ts';

type Json = Record<string, any>;
const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
const overviewSchema = read('./contract/harness/operator-view.schema.json');
const detailSchema = read('./contract/harness/work-detail-view.schema.json');
const viewFixture = read('../fixtures/view.sample.json');
const workFixture = read('../fixtures/work.sample.json');
const acceptedFixture = read('../fixtures/work.accepted.sample.json');
const harnessEmpty = read('./contract/harness/empty-state.view.json');
const overviewSchema56 = read('./contract/harness-0.1.0-alpha.56/operator-view.schema.json');
const detailSchema56 = read('./contract/harness-0.1.0-alpha.56/work-detail-view.schema.json');
const harnessEmpty56 = read('./contract/harness-0.1.0-alpha.56/empty-state.view.json');
const overviewSchema57 = read('./contract/harness-0.1.0-alpha.57/operator-view.schema.json');
const detailSchema57 = read('./contract/harness-0.1.0-alpha.57/work-detail-view.schema.json');
const harnessEmpty57 = read('./contract/harness-0.1.0-alpha.57/empty-state.view.json');
const overviewSchema59 = read('./contract/harness-0.1.0-alpha.59/operator-view.schema.json');
const detailSchema59 = read('./contract/harness-0.1.0-alpha.59/work-detail-view.schema.json');
const harnessEmpty59 = read('./contract/harness-0.1.0-alpha.59/empty-state.view.json');
const overviewSchema60 = read('./contract/harness-0.1.0-alpha.60/operator-view.schema.json');
const detailSchema60 = read('./contract/harness-0.1.0-alpha.60/work-detail-view.schema.json');
const harnessEmpty60 = read('./contract/harness-0.1.0-alpha.60/empty-state.view.json');
const overviewSchema55 = read('./contract/harness-0.1.0-alpha.55/operator-view.schema.json');
const detailSchema55 = read('./contract/harness-0.1.0-alpha.55/work-detail-view.schema.json');
const harnessEmpty55 = read('./contract/harness-0.1.0-alpha.55/empty-state.view.json');

const fixtures = (): [string, Json, Json][] => [
  ['view.sample.json', viewFixture, overviewSchema],
  ['ru/view.sample.json', read('../fixtures/ru/view.sample.json'), overviewSchema],
  ['work.sample.json', workFixture, detailSchema],
  ['work.accepted.sample.json', acceptedFixture, detailSchema],
  ['ru/work.sample.json', read('../fixtures/ru/work.sample.json'), detailSchema],
  ['ru/work.accepted.sample.json', read('../fixtures/ru/work.accepted.sample.json'), detailSchema],
];

test('both fixtures and a real harness document are valid under the harness schemas', () => {
  assert.deepEqual(validate(overviewSchema, viewFixture), []);
  assert.deepEqual(validate(detailSchema, workFixture), []);
  assert.deepEqual(validate(detailSchema, acceptedFixture), []);
  // The Russian demo copies: the same documents with harness texts in Russian.
  assert.deepEqual(validate(overviewSchema, read('../fixtures/ru/view.sample.json')), []);
  for (const f of ['work.sample.json', 'work.accepted.sample.json'])
    assert.deepEqual(validate(detailSchema, read('../fixtures/ru/' + f)), [], f);
  assert.equal(harnessEmpty.ok, true);
  assert.equal(harnessEmpty.data.viewRevision, 4);
  // The unreleased alpha.62 checkout: its package version is still alpha.61.
  assert.equal(harnessEmpty.data.source.producerVersion, '0.1.0-alpha.61');
  // No state: no connector slice, no tracker questions, no forecast, no updates check.
  for (const k of ['scope', 'sourceQuestions', 'forecast', 'updates'])
    assert.equal(Object.hasOwn(harnessEmpty.data, k), false, k);
  // …and the harness says why: nothing has run, no tracker snapshot yet.
  assert.equal(harnessEmpty.data.scopeReason, 'no-snapshot');
  assert.equal(harnessEmpty.data.progress.queue.neverRun, true);
  assert.equal(Object.hasOwn(harnessEmpty.data.progress.queue, 'runner'), false);
  assert.match(harnessEmpty.data.progress.queue.line, /^Nothing has run yet/);
  assert.deepEqual(validate(overviewSchema, harnessEmpty.data), []);
  // A state that does not exist yet has a feed with nothing in it: `[]`, not a missing field.
  assert.deepEqual(harnessEmpty.data.activity, []);
});

test('the old-harness transforms drop every revision 2 field (the old schemas allow activity)', () => {
  const seeded = (doc: Json): Json => ({ ...structuredClone(doc), truncated: { activity: 3 } });
  for (const [name, doc] of fixtures())
    for (const old of [asAlpha56(seeded(doc)), asAlpha55(seeded(doc))]) {
      assert.equal(Object.hasOwn(old, 'activity'), false, name);
      assert.equal(Object.hasOwn(old.truncated ?? {}, 'activity'), false, name);
      for (const w of [...(old.works ?? []), ...(old.work ? [old.work] : [])])
        if (w.target) {
          assert.equal(w.target.remote.state, 'unknown', name);
          for (const k of ['line', 'checkedAt', 'trackingRef'])
            assert.equal(Object.hasOwn(w.target.remote, k), false, `${name}: ${k}`);
        }
    }
  // And the panel reads such a document as a harness that keeps no feed.
  const c = checkView(asAlpha56(seeded(viewFixture)));
  assert.equal(c.ok, true);
  assert.equal(c.ok && c.view.activity, undefined);
  assert.equal(c.ok && c.view.truncated?.activity, undefined);
});

test('alpha.56 documents (revision 1) stay valid under the alpha.57 schemas and pass the gate', () => {
  assert.equal(harnessEmpty56.data.viewRevision, 1);
  assert.equal(Object.hasOwn(harnessEmpty56.data, 'activity'), false, 'alpha.56 keeps no feed');
  assert.deepEqual(validate(overviewSchema56, harnessEmpty56.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty56.data), []);
  const real = checkView(harnessEmpty56.data);
  assert.equal(real.ok, true, real.ok ? '' : real.message);
  assert.equal(real.ok && real.view.activity, undefined);
  assert.equal(real.ok && real.newerRevision, false);
  for (const [name, doc, schema] of fixtures()) {
    const old = asAlpha56(doc);
    const old56 = schema === overviewSchema ? overviewSchema56 : detailSchema56;
    assert.deepEqual(validate(old56, old), [], name);
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
});

test('alpha.57/58 documents (revision 2) stay valid under the alpha.59 schemas and pass the gate', () => {
  assert.equal(harnessEmpty57.data.viewRevision, 2);
  assert.deepEqual(validate(overviewSchema57, harnessEmpty57.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty57.data), []);
  const real = checkView(harnessEmpty57.data);
  assert.equal(real.ok && real.newerRevision, false);
  for (const [name, doc, schema] of fixtures()) {
    const old = asAlpha57(doc);
    const old57 = schema === overviewSchema ? overviewSchema57 : detailSchema57;
    assert.deepEqual(validate(old57, old), [], name);
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
});

test('alpha.60 documents (revision 4 without neverRun/scopeReason) stay valid under the newer schemas and pass the gate', () => {
  assert.equal(harnessEmpty60.data.viewRevision, 4);
  assert.equal(harnessEmpty60.data.source.producerVersion, '0.1.0-alpha.60');
  for (const k of ['scopeReason', 'scope'])
    assert.equal(Object.hasOwn(harnessEmpty60.data, k), false);
  assert.equal(Object.hasOwn(harnessEmpty60.data.progress.queue, 'neverRun'), false);
  assert.deepEqual(validate(overviewSchema60, harnessEmpty60.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty60.data), []);
  const real = checkView(harnessEmpty60.data);
  assert.equal(real.ok && real.newerRevision, false);
  // The fixtures carry no alpha.62 field, so they are alpha.60 documents too.
  for (const [name, doc, schema] of fixtures()) {
    const old60 = schema === overviewSchema ? overviewSchema60 : detailSchema60;
    assert.deepEqual(validate(old60, doc), [], name);
  }
  // The alpha.62 empty state really carries the new fields: the alpha.60 schema refuses them.
  const errors = validate(overviewSchema60, harnessEmpty.data).join();
  for (const k of ['neverRun', 'scopeReason'])
    assert.match(errors, new RegExp(`unknown field ${k}`), k);
});

test('alpha.59 documents (revision 3) stay valid under the alpha.60 schemas and pass the gate', () => {
  assert.equal(harnessEmpty59.data.viewRevision, 3);
  assert.deepEqual(validate(overviewSchema59, harnessEmpty59.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty59.data), []);
  const real = checkView(harnessEmpty59.data);
  assert.equal(real.ok && real.newerRevision, false);
  for (const [name, doc, schema] of fixtures()) {
    const old = asAlpha59(doc);
    const old59 = schema === overviewSchema ? overviewSchema59 : detailSchema59;
    assert.deepEqual(validate(old59, old), [], name);
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
});

test('the 60-shaped fixtures really carry the revision 4 fields (the alpha.59 schema refuses them)', () => {
  const stopped = read('../fixtures/view.stopped.json');
  for (const doc of [viewFixture, read('../fixtures/ru/view.sample.json'), stopped]) {
    assert.equal(doc.viewRevision, 4);
    assert.deepEqual(validate(overviewSchema, doc), []);
    const errors = validate(overviewSchema59, doc).join();
    for (const k of ['forecast', 'runner'])
      assert.match(errors, new RegExp(`unknown field ${k}`), k);
    const c = checkView(doc);
    assert.equal(c.ok && c.newerRevision, false);
  }
  for (const k of ['scope', 'sourceQuestions', 'updates'])
    assert.match(
      validate(overviewSchema59, viewFixture).join(),
      new RegExp(`unknown field ${k}`),
      k,
    );
  // One known forecast (a range) and one unknown (no `remaining`): both shapes exist.
  assert.ok(viewFixture.forecast.time.remaining);
  assert.equal(stopped.forecast.time.remaining, undefined);
  assert.ok(stopped.works.some((w: Json) => w.blockers.some((b: Json) => b.step === 2)));
});

test('the 59-shaped detail fixtures carry an unused stage (the alpha.57 schema refuses it)', () => {
  for (const f of ['work.sample.json', 'ru/work.sample.json']) {
    const d = read('../fixtures/' + f);
    assert.equal(d.viewRevision, 4, f);
    assert.ok(
      d.attempts[0].stages.some((s: Json) => s.unused === true),
      f,
    );
    assert.notDeepEqual(validate(detailSchema57, d), [], f);
  }
});

test('the 57-shaped fixtures really carry the revision 2 fields (the alpha.56 schema refuses them)', () => {
  let targets = 0;
  for (const [name, doc, schema] of fixtures()) {
    assert.equal(doc.viewRevision, 4, name);
    const works: Json[] = schema === overviewSchema ? doc.works : [doc.work];
    const remotes = works.filter((w) => w.target).map((w) => w.target.remote);
    if (schema === overviewSchema) assert.ok(doc.activity.length > 0, `${name}: a feed`);
    if (!remotes.length) continue;
    targets++;
    for (const r of remotes) {
      assert.equal(typeof r.line, 'string', name);
      assert.equal(typeof r.checkedAt, 'string', name);
    }
    const old56 = schema === overviewSchema ? overviewSchema56 : detailSchema56;
    const errors = validate(old56, doc).join();
    assert.match(errors, /unknown field line/, name);
    assert.match(errors, /unknown field checkedAt/, name);
  }
  assert.ok(targets >= 4, 'overview and accepted detail fixtures, both languages');
});

/**
 * Whether the feed has the event of one verification row, as the harness
 * writes it (`activityLine` in its projection): a gate row by the controller
 * with the same verdict, gate, attempt and phase; a review row by the reviewer
 * with the same verdict, runtime and, for a read row, "read the diff".
 */
function feedHasEvidence(
  feed: ActivityEntry[],
  workId: string,
  r: VerificationRow,
  lang: 'en' | 'ru',
): boolean {
  const ru = lang === 'ru';
  const phase = r.phase
    ? ru
      ? { candidate: 'кандидат', integration: 'интеграция' }[r.phase]
      : r.phase
    : undefined;
  const attempt =
    r.attempt === undefined ? undefined : ru ? `попытка ${r.attempt}` : `attempt ${r.attempt}`;
  return feed.some((e) => {
    if (instantMs(e.at) !== instantMs(r.at!)) return false;
    // A plan or contract review row names its subject; its event has no work or attempt.
    const ofSubject = r.kind === 'review' && r.gate !== workId && e.subject === r.gate;
    if (!ofSubject && e.workId !== workId) return false;
    // A whole attempt token: «attempt 1,» or «attempt 1)», never «attempt 10».
    if (!ofSubject && attempt && !new RegExp(`${attempt}[,)]`).test(e.plain)) return false;
    if (r.kind === 'review') {
      if (e.subject !== r.gate) return false;
      const action = r.result === 'passed' ? 'review.approved' : 'review.changes-requested';
      const read = ru ? 'читал diff, ничего не запускал' : 'read the diff, ran nothing';
      return (
        e.actor === 'reviewer' &&
        e.action === action &&
        e.plain.startsWith(`reviewer ${r.by} `) &&
        // The harness says what the reviewer did only for a review inside an attempt.
        (ofSubject || r.how !== 'read' || e.plain.includes(read))
      );
    }
    const action =
      r.how === 'reused' ? 'gate.reused' : r.result === 'passed' ? 'gate.passed' : 'gate.failed';
    const where = `${phase ? `, ${phase}` : ''})`;
    return (
      e.actor === 'controller' &&
      e.action === action &&
      new RegExp(`(проверк[уа]|check) ${r.gate}[: ]`).test(e.plain) &&
      e.plain.includes(`${attempt}${where}`)
    );
  });
}

test('fixture activity follows the harness feed: newest first, its actors and event codes', () => {
  // The vocabulary harness alpha.57 emits (docs/release-notes/0.1.0-alpha.57.md);
  // the schema keeps both open strings, the panel shows an unknown one as is.
  const actors = new Set(['controller', 'writer', 'reviewer', 'lead', 'operator', 'host']);
  const actions = new Set([
    'attempt.started',
    'attempt.failed',
    'attempt.cancelled',
    'attempt.expired',
    'attempt.interrupted',
    'work.accepted',
    'gate.passed',
    'gate.failed',
    'gate.recheck',
    'gate.reused',
    'gate.not-launched',
    'review.approved',
    'review.changes-requested',
    'review.escalated',
    'question.asked',
    'question.answered',
  ]);
  for (const f of ['../fixtures/view.sample.json', '../fixtures/ru/view.sample.json']) {
    const doc = read(f);
    const feed = doc.activity as ActivityEntry[];
    const from = instantMs(doc.history.from);
    const to = instantMs(doc.history.to);
    for (const [i, e] of feed.entries()) {
      assert.ok(actors.has(e.actor), `${f}: actor ${e.actor}`);
      assert.ok(actions.has(e.action), `${f}: action ${e.action}`);
      const at = instantMs(e.at);
      assert.ok(at >= from && at <= to, `${f}: ${e.at} inside the history window`);
      if (i) assert.ok(instantMs(feed[i - 1]!.at) >= at, `${f}: newest first at ${i}`);
    }
  }
  // The feed agrees with the evidence the other documents record: every gate
  // row that ran or was reused and every review verdict has its event at the
  // same time, with the same verdict, actor, attempt and phase; every
  // question asked or answered in the window, of the overview and of the
  // work details (closed works included), has its event.
  for (const [lang, overview, details] of [
    ['en', viewFixture, [workFixture, acceptedFixture]],
    [
      'ru',
      read('../fixtures/ru/view.sample.json'),
      [read('../fixtures/ru/work.sample.json'), read('../fixtures/ru/work.accepted.sample.json')],
    ],
  ] as const) {
    const feed = overview.activity as ActivityEntry[];
    for (const d of details)
      for (const r of d.verification as VerificationRow[]) {
        if (!r.at || r.how === 'not-checked') continue;
        assert.ok(
          feedHasEvidence(feed, d.work.id, r, lang),
          `${lang}: no matching event for ${r.kind} ${r.gate} at ${r.at}`,
        );
      }
    const from = instantMs(overview.history.from);
    const questions = [
      ...(overview.questions as OperatorQuestion[]),
      ...details.flatMap((d) => d.questions as OperatorQuestion[]),
    ];
    for (const q of questions) {
      if (instantMs(q.createdAt) >= from)
        assert.ok(
          feed.some(
            (e) =>
              e.action === 'question.asked' &&
              e.actor === 'writer' &&
              e.subject === q.requestId &&
              e.workId === q.workId &&
              instantMs(e.at) === instantMs(q.createdAt),
          ),
          `${lang}: asked ${q.requestId}`,
        );
      const b = q.answerBasis;
      if (b && instantMs(b.at) >= from)
        assert.ok(
          feed.some(
            (e) =>
              e.action === 'question.answered' &&
              e.actor === b.by &&
              e.subject === q.requestId &&
              instantMs(e.at) === instantMs(b.at),
          ),
          `${lang}: answered ${q.requestId}`,
        );
    }
  }
  // The matcher refuses a contradicting event: another verdict, actor, attempt or phase.
  const row: VerificationRow = {
    gate: 'unit',
    kind: 'gate',
    phase: 'candidate',
    result: 'passed',
    how: 'executed',
    by: 'harness',
    attempt: 1,
    at: '2026-11-19T11:11:00.000Z',
  };
  const good: ActivityEntry = {
    at: row.at!,
    actor: 'controller',
    action: 'gate.passed',
    workId: 'w',
    plain: 'the controller ran check unit: passed (w, attempt 1, candidate)',
  };
  assert.ok(feedHasEvidence([good], 'w', row, 'en'));
  for (const bad of [
    { ...good, action: 'gate.failed' },
    { ...good, actor: 'operator' },
    { ...good, plain: 'the controller ran check unit: passed (w, attempt 2, candidate)' },
    { ...good, plain: 'the controller ran check unit: passed (w, attempt 10, candidate)' },
    { ...good, plain: 'the controller ran check unit: passed (w, attempt 1, integration)' },
    { ...good, plain: 'the controller ran check unitx: passed (w, attempt 1, candidate)' },
    { ...good, workId: 'v' },
    { ...good, at: '2026-11-19T11:11:01.000Z' },
  ])
    assert.equal(feedHasEvidence([bad], 'w', row, 'en'), false, JSON.stringify(bad));
  const review: VerificationRow = {
    gate: 'w',
    kind: 'review',
    result: 'passed',
    how: 'read',
    by: 'codex',
    attempt: 1,
    at: row.at!,
  };
  const verdict: ActivityEntry = {
    ...good,
    subject: 'w',
    actor: 'reviewer',
    action: 'review.approved',
    plain:
      'reviewer codex approved the changes of w (attempt 1, candidate); read the diff, ran nothing',
  };
  assert.ok(feedHasEvidence([verdict], 'w', review, 'en'));
  for (const bad of [
    { ...verdict, action: 'review.changes-requested' },
    { ...verdict, plain: verdict.plain.replace('codex', 'claude') },
    {
      ...verdict,
      plain: verdict.plain.replace('; read the diff, ran nothing', '; ran commands: 2'),
    },
    { ...verdict, plain: verdict.plain.replace('attempt 1,', 'attempt 10,') },
    { ...verdict, subject: 'other' },
    { ...verdict, subject: undefined },
  ])
    assert.equal(feedHasEvidence([bad], 'w', review, 'en'), false, JSON.stringify(bad));
  // Both languages describe the same events.
  const en = read('../fixtures/view.sample.json').activity as ActivityEntry[];
  const ru = read('../fixtures/ru/view.sample.json').activity as ActivityEntry[];
  const key = (e: ActivityEntry) => [e.at, e.actor, e.action, e.workId, e.subject].join('|');
  assert.deepEqual(ru.map(key), en.map(key));
});

test('alpha.55 documents (revision 0) stay valid under the alpha.56 and .57 schemas and pass the gate', () => {
  // The real alpha.55 envelope, under every schema version.
  assert.equal(harnessEmpty55.data.viewRevision, 0);
  assert.deepEqual(validate(overviewSchema55, harnessEmpty55.data), []);
  assert.deepEqual(validate(overviewSchema56, harnessEmpty55.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty55.data), []);
  const real = checkView(harnessEmpty55.data);
  assert.equal(real.ok, true, real.ok ? '' : real.message);
  assert.equal(real.ok && real.view.history.totals, undefined);
  for (const [name, doc, schema] of fixtures()) {
    const old = asAlpha55(doc);
    const old55 = schema === overviewSchema ? overviewSchema55 : detailSchema55;
    // A 55-shaped copy is a real alpha.55 document: valid under the alpha.55 schema…
    assert.deepEqual(validate(old55, old), [], name);
    // …and still valid under the alpha.56 and .57 ones: later fields are optional.
    assert.deepEqual(
      validate(schema === overviewSchema ? overviewSchema56 : detailSchema56, old),
      [],
      name,
    );
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
});

test('the fixtures really carry the revision 1 fields (the alpha.55 schema refuses them)', () => {
  for (const [name, full, schema] of fixtures()) {
    const doc = asAlpha56(full);
    const old55 = schema === overviewSchema ? overviewSchema55 : detailSchema55;
    const errors = validate(old55, doc).join();
    assert.match(errors, /unknown field answerBasis/, name);
    if (schema === overviewSchema) assert.match(errors, /unknown field totals/, name);
  }
  assert.match(validate(overviewSchema55, harnessEmpty.data).join(), /unknown field totals/);
});

test('fixture window totals follow the harness rules: series sums, buckets add up to failures', () => {
  for (const doc of [viewFixture, read('../fixtures/ru/view.sample.json'), harnessEmpty.data]) {
    const h = doc.history;
    const t = h.totals as HistoryTotals;
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    assert.equal(t.attemptsStarted, sum(h.attemptsStarted));
    assert.equal(t.attemptsFailed, sum(h.attemptsFailed));
    assert.equal(sum(Object.values(t.failuresByBucket)), t.attemptsFailed);
    assert.equal(t.gatesPassed, sum(h.gatesPassed));
    assert.equal(t.gatesFailed, sum(h.gatesFailed));
    assert.equal(t.gatesReused, sum(h.gatesReused));
    assert.equal(t.loadPeak, Math.max(0, ...h.load));
    assert.ok(Math.abs(t.spendUsd.value - sum(h.spendUsd)) < 1e-9);
    // The totals bound is finer: `unknown` (no known cost in the window) is
    // `lower` in spendBound; an exact window is exact in both.
    assert.ok(
      t.spendUsd.bound === h.spendBound ||
        (t.spendUsd.bound === 'unknown' && h.spendBound === 'lower'),
      `${t.spendUsd.bound} vs ${h.spendBound}`,
    );
    assert.ok(t.wallMs <= t.attemptMs, 'parallel attempts add up only in attemptMs');
    assert.ok(t.wallMs <= instantMs(h.to) - instantMs(h.from));
  }
  // Every answer basis line starts with who answered, as the harness writes it.
  for (const [name, doc] of fixtures())
    for (const q of doc.questions as OperatorQuestion[]) {
      const b = q.answerBasis;
      if (!b) continue;
      assert.equal(b.by, q.answeredBy, name);
      assert.equal(b.rule !== undefined, b.by === 'lead', `${name}: only the lead has a rule`);
      assert.match(b.line, /^(answered by|ответил) /, name);
      if (b.reason) assert.ok(b.line.endsWith(': ' + b.reason), name);
    }
});

test('every schema-valid overview passes the compatibility gate', () => {
  assert.equal(checkView(viewFixture).ok, true);
  for (const d of [workFixture, acceptedFixture]) {
    const c = checkWorkDetail(d);
    assert.equal(c.ok, true, c.ok ? '' : c.message);
  }
  const real = checkView(harnessEmpty.data);
  assert.equal(real.ok, true, real.ok ? '' : real.message);
});

test('the validator really refuses what the harness schema refuses', () => {
  const extra = { ...viewFixture, extraSection: 1 };
  assert.match(validate(overviewSchema, extra).join(), /unknown field extraSection/);
  const badRow = structuredClone(workFixture);
  badRow.verification[0].phase = 'later';
  assert.match(validate(detailSchema, badRow).join(), /verification\[0\]\.phase: not in enum/);
  const badTruncated = { ...viewFixture, truncated: { works: 0 } };
  assert.match(validate(overviewSchema, badTruncated).join(), /exclusiveMinimum/);
});

test('fixture verification rows follow the harness rules the JSON Schema cannot state', () => {
  const results = new Set(['passed', 'failed', 'reused', 'skipped', 'not-run']);
  const hows = new Set(['executed', 'reused', 'read', 'not-checked']);
  for (const r of [
    ...workFixture.verification,
    ...acceptedFixture.verification,
  ] as VerificationRow[]) {
    assert.ok(results.has(r.result), `result ${r.result}`);
    assert.ok(hows.has(r.how), `how ${r.how}`);
    if (r.how === 'executed') {
      assert.equal(r.kind, 'gate', 'a review row is never executed');
      assert.equal(r.by, 'harness', 'an executed gate is run by the harness');
      assert.notEqual(r.attempt, undefined);
    }
    if (r.how === 'reused') assert.notEqual(r.attempt, undefined);
    if (r.kind === 'gate' && r.how !== 'executed') assert.equal(r.by, undefined);
  }
});

test('settings.defaulted names view paths that exist in settings', () => {
  for (const doc of [viewFixture, harnessEmpty.data]) {
    const d = doc.settings.defaulted as string[];
    assert.deepEqual(d, [...d].sort());
    for (const path of d) {
      const value = path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), doc.settings);
      assert.notEqual(value, undefined, `settings.${path}`);
    }
  }
});

test('questions always carry impact, as the harness emits it', () => {
  for (const q of viewFixture.questions) assert.equal(typeof q.impact, 'string');
  for (const q of workFixture.questions) assert.equal(typeof q.impact, 'string');
});

// Field-by-field comparison of the TS view types with the harness schema:
// each literal below must list exactly the keys of the type, each as
// `<req|opt>:<kind>` where the kind is the leaf type (s string, n number,
// b boolean, o object, a<..> array of, |null nullable). TypeScript checks
// the literal against the type; the test checks it against the schema
// (properties, `required`, leaf kinds). Closed vocabularies are compared
// separately below.
type Base<V> = V extends string
  ? 's'
  : V extends number
    ? 'n'
    : V extends boolean
      ? 'b'
      : V extends readonly (infer E)[]
        ? `a<${Kind<E>}>`
        : V extends object
          ? 'o'
          : never;
type Kind<V> = null extends V
  ? `${Base<Exclude<V, null | undefined>>}|null`
  : Base<Exclude<V, undefined>>;
type Shape<T> = {
  [K in keyof T]-?: `${{} extends Pick<T, K> ? 'opt' : 'req'}:${Kind<T[K]>}`;
};
const shape = <T>(s: Shape<T>) => s as Record<string, string>;

/** The same `<kind>` notation, read from a JSON Schema node. */
function schemaKind(n: Json): string {
  if (n.anyOf) {
    const parts = (n.anyOf as Json[]).filter((x) => x.type !== 'null');
    assert.equal(parts.length, 1, 'one non-null anyOf branch');
    return schemaKind(parts[0]!) + (parts.length < n.anyOf.length ? '|null' : '');
  }
  const k = { string: 's', number: 'n', integer: 'n', boolean: 'b', object: 'o' }[n.type as string];
  if (k) return k;
  assert.equal(n.type, 'array', JSON.stringify(n).slice(0, 80));
  return `a<${schemaKind(n.items)}>`;
}

type Truncated = NonNullable<OperatorView['truncated']>;
type DetailTruncated = NonNullable<WorkDetailView['truncated']>;
const ov = 'properties';
const shapes: [string, Json, Record<string, string>][] = [
  [
    'OperatorView',
    overviewSchema,
    shape<OperatorView>({
      viewVersion: 'req:n',
      viewRevision: 'req:n',
      generatedAt: 'req:s',
      source: 'req:o',
      settings: 'req:o',
      works: 'req:a<o>',
      reviews: 'req:a<o>',
      questions: 'req:a<o>',
      escalations: 'req:a<o>',
      drift: 'req:a<o>',
      progress: 'req:o',
      history: 'req:o',
      health: 'req:o',
      activity: 'opt:a<o>',
      decisions: 'opt:a<o>',
      scope: 'opt:o',
      scopeReason: 'opt:s',
      sourceQuestions: 'opt:a<o>',
      forecast: 'opt:o',
      updates: 'opt:o',
      truncated: 'opt:o',
    }),
  ],
  [
    'source',
    overviewSchema[ov].source,
    shape<OperatorView['source']>({
      producer: 'req:s',
      producerVersion: 'req:s',
      stateVersion: 'req:n',
      token: 'req:s',
    }),
  ],
  [
    'settings',
    overviewSchema[ov].settings,
    shape<ViewSettings>({
      policyDigest: 'req:s',
      approvalMode: 'req:s',
      mode: 'req:s',
      concurrency: 'req:n',
      roles: 'req:a<o>',
      reviews: 'req:a<o>',
      thresholds: 'req:o',
      budgets: 'req:a<o>',
      budgetOnUnknown: 'opt:s',
      timeouts: 'req:o',
      lean: 'req:o',
      defaulted: 'req:a<s>',
    }),
  ],
  [
    'settings.roles[]',
    overviewSchema[ov].settings[ov].roles.items,
    shape<RoleBinding>({ role: 'req:s', writer: 'req:o', repositoryId: 'opt:s' }),
  ],
  [
    'settings.roles[].writer',
    overviewSchema[ov].settings[ov].roles.items[ov].writer,
    shape<RoleBinding['writer']>({ runtime: 'req:s', model: 'opt:s', effort: 'opt:s' }),
  ],
  [
    'settings.reviews[]',
    overviewSchema[ov].settings[ov].reviews.items,
    shape<ReviewRuleView>({
      kind: 'req:s',
      scope: 'req:s',
      repositoryId: 'opt:s',
      role: 'opt:s',
      reviewer: 'req:o',
      alternates: 'req:a<o>',
      vendor: 'req:s',
    }),
  ],
  [
    'settings.thresholds',
    overviewSchema[ov].settings[ov].thresholds,
    shape<ViewSettings['thresholds']>({
      inputSeverity: 'req:n',
      leadAnswersMaxSeverity: 'opt:n',
      leadAnswersTechnical: 'opt:b',
      criticalPaths: 'req:n',
      maxAttempts: 'req:n',
      repairBudget: 'req:n',
      maxNeutralFailures: 'req:n',
      reviewRoundCap: 'req:n',
      reviewEscalationRounds: 'req:n',
    }),
  ],
  [
    'settings.budgets[]',
    overviewSchema[ov].settings[ov].budgets.items,
    shape<ViewSettings['budgets'][number]>({ scope: 'req:s', usd: 'opt:n', timeMs: 'opt:n' }),
  ],
  [
    'settings.timeouts',
    overviewSchema[ov].settings[ov].timeouts,
    shape<ViewSettings['timeouts']>({
      runTimeoutMs: 'req:n',
      leaseMs: 'req:n',
      gateTimeoutFloorMs: 'opt:n',
      stall: 'req:o',
    }),
  ],
  [
    'settings.timeouts.stall',
    overviewSchema[ov].settings[ov].timeouts[ov].stall,
    shape<ViewSettings['timeouts']['stall']>({
      intervalMs: 'req:n',
      quietMs: 'req:n',
      stalledMs: 'req:n',
      action: 'req:s',
    }),
  ],
  [
    'settings.lean',
    overviewSchema[ov].settings[ov].lean,
    shape<ViewSettings['lean']>({ state: 'req:s' }),
  ],
  [
    'works[]',
    overviewSchema[ov].works.items,
    shape<WorkView>({
      id: 'req:s',
      graphId: 'req:s',
      title: 'opt:s',
      status: 'req:s',
      stage: 'req:o',
      attempts: 'req:o',
      liveness: 'opt:s',
      runtime: 'opt:s',
      model: 'opt:s',
      blockers: 'req:a<o>',
      dependsOn: 'opt:a<s>',
      target: 'opt:o',
      question: 'opt:o',
      spend: 'req:o',
      resultSha: 'opt:s',
    }),
  ],
  [
    'works[].stage',
    overviewSchema[ov].works.items[ov].stage,
    shape<WorkView['stage']>({
      name: 'req:s',
      step: 'opt:s',
      since: 'opt:s',
      next: 'req:a<s>',
      needs: 'opt:o',
      typical: 'opt:o',
    }),
  ],
  [
    'works[].stage.needs',
    overviewSchema[ov].works.items[ov].stage[ov].needs,
    shape<NonNullable<WorkView['stage']['needs']>>({ actor: 'req:s|null', action: 'req:s' }),
  ],
  [
    'works[].stage.typical',
    overviewSchema[ov].works.items[ov].stage[ov].typical,
    shape<NonNullable<WorkView['stage']['typical']>>({
      p50Ms: 'req:n',
      p90Ms: 'req:n',
      samples: 'req:n',
    }),
  ],
  [
    'works[].attempts',
    overviewSchema[ov].works.items[ov].attempts,
    shape<WorkView['attempts']>({
      used: 'req:n',
      max: 'req:n',
      left: 'req:n',
      failed: 'req:n',
      interrupted: 'req:n',
      rechecks: 'req:n',
      neutral: 'req:o',
      line: 'opt:s',
      lastFailure: 'opt:o',
    }),
  ],
  [
    'works[].attempts.lastFailure',
    overviewSchema[ov].works.items[ov].attempts[ov].lastFailure,
    shape<NonNullable<WorkView['attempts']['lastFailure']>>({
      attempt: 'req:n',
      bucket: 'req:s',
      plain: 'req:s',
      at: 'opt:s',
      kind: 'opt:s',
      counted: 'opt:b',
    }),
  ],
  [
    'works[].blockers[]',
    overviewSchema[ov].works.items[ov].blockers.items,
    shape<BlockerView>({ code: 'req:s', plain: 'opt:s', actor: 'req:s|null', step: 'opt:n' }),
  ],
  [
    'works[].target',
    overviewSchema[ov].works.items[ov].target,
    shape<TargetView>({
      repositoryId: 'req:s',
      ref: 'req:s',
      acceptedSha: 'opt:s',
      remote: 'req:o',
    }),
  ],
  [
    'works[].target.remote',
    overviewSchema[ov].works.items[ov].target[ov].remote,
    shape<TargetView['remote']>({
      state: 'req:s',
      trackingRef: 'opt:s',
      reason: 'opt:s',
      checkedAt: 'opt:s',
      line: 'opt:s',
    }),
  ],
  [
    'works[].question',
    overviewSchema[ov].works.items[ov].question,
    shape<NonNullable<WorkView['question']>>({
      requestId: 'req:s',
      state: 'req:s',
      severity: 'req:n',
      line: 'opt:s',
    }),
  ],
  [
    'works[].spend',
    overviewSchema[ov].works.items[ov].spend,
    shape<WorkView['spend']>({ calls: 'req:n', usd: 'req:o', durationMs: 'req:n' }),
  ],
  [
    'reviews[]',
    overviewSchema[ov].reviews.items,
    shape<ReviewSubjectView>({
      kind: 'req:s',
      subject: 'req:s',
      workId: 'opt:s',
      approved: 'req:b',
      rounds: 'req:o',
      open: 'req:o',
      accepted: 'req:n',
      reviewer: 'opt:o',
      sameVendor: 'opt:b',
      spend: 'req:o',
      findings: 'req:a<o>',
      escalation: 'opt:o',
      line: 'opt:s',
    }),
  ],
  [
    'reviews[].findings[]',
    overviewSchema[ov].reviews.items[ov].findings.items,
    shape<FindingView>({
      id: 'req:s',
      severity: 'req:s',
      status: 'req:s',
      rounds: 'opt:n',
      disposition: 'opt:o',
      title: 'opt:s',
    }),
  ],
  [
    'reviews[].escalation',
    overviewSchema[ov].reviews.items[ov].escalation,
    shape<NonNullable<ReviewSubjectView['escalation']>>({
      requestId: 'req:s',
      findings: 'req:a<s>',
      answered: 'req:b',
    }),
  ],
  [
    'questions[]',
    overviewSchema[ov].questions.items,
    shape<OperatorQuestion>({
      requestId: 'req:s',
      workId: 'req:s',
      state: 'req:s',
      version: 'req:n',
      severity: 'req:n',
      answerableBy: 'req:s',
      impact: 'opt:s',
      plain: 'opt:s',
      answeredBy: 'opt:s',
      answerBasis: 'opt:o',
      title: 'opt:s',
      createdAt: 'req:s',
      options: 'opt:a<o>',
      rationale: 'opt:s',
      line: 'opt:s',
    }),
  ],
  [
    'questions[].options[]',
    overviewSchema[ov].questions.items[ov].options.items,
    shape<QuestionOption>({ id: 'req:s', label: 'req:s', recommended: 'opt:b' }),
  ],
  [
    'questions[].answerBasis',
    overviewSchema[ov].questions.items[ov].answerBasis,
    shape<AnswerBasis>({
      by: 'req:s',
      rule: 'opt:s',
      reason: 'opt:s',
      impact: 'req:s',
      at: 'req:s',
      line: 'req:s',
    }),
  ],
  [
    'escalations[]',
    overviewSchema[ov].escalations.items,
    shape<Escalation>({
      workId: 'opt:s',
      subject: 'opt:s',
      code: 'req:s',
      actor: 'req:s',
      action: 'req:s',
      since: 'req:s',
    }),
  ],
  [
    'drift[]',
    overviewSchema[ov].drift.items,
    shape<DriftView>({
      workId: 'req:s',
      repositoryId: 'req:s',
      ref: 'req:s',
      acceptedSha: 'req:s',
      head: 'opt:s',
      commitsSinceAccepted: 'opt:n',
      filesSinceAccepted: 'opt:n',
      diverged: 'opt:b',
      unavailable: 'opt:s',
    }),
  ],
  [
    'progress',
    overviewSchema[ov].progress,
    shape<ViewProgress>({
      total: 'req:n',
      byStage: 'req:o',
      running: 'req:n',
      done: 'req:n',
      waitingOperator: 'req:n',
      queue: 'req:o',
    }),
  ],
  [
    'progress.queue',
    overviewSchema[ov].progress[ov].queue,
    shape<ViewProgress['queue']>({
      paused: 'req:b',
      reason: 'opt:s',
      detail: 'opt:s',
      actor: 'opt:s',
      action: 'opt:s',
      runner: 'opt:s',
      neverRun: 'opt:b',
      restartBy: 'opt:s',
      line: 'opt:s',
    }),
  ],
  [
    'history',
    overviewSchema[ov].history,
    shape<ViewHistory>({
      from: 'req:s',
      to: 'req:s',
      bucketMs: 'req:n',
      load: 'req:a<n>',
      attemptsStarted: 'req:a<n>',
      attemptsFailed: 'req:a<n>',
      gatesPassed: 'req:a<n>',
      gatesFailed: 'req:a<n>',
      gatesReused: 'req:a<n>',
      spendUsd: 'req:a<n>',
      spendBound: 'req:s',
      spendOpeningUsd: 'req:o',
      budgetUsd: 'opt:n',
      totals: 'opt:o',
    }),
  ],
  [
    'history.totals',
    overviewSchema[ov].history[ov].totals,
    shape<HistoryTotals>({
      attemptsStarted: 'req:n',
      attemptsFailed: 'req:n',
      failuresByBucket: 'req:o',
      gatesPassed: 'req:n',
      gatesFailed: 'req:n',
      gatesReused: 'req:n',
      reviewRounds: 'req:o',
      spendUsd: 'req:o',
      wallMs: 'req:n',
      attemptMs: 'req:n',
      loadPeak: 'req:n',
    }),
  ],
  [
    'history.totals.reviewRounds',
    overviewSchema[ov].history[ov].totals[ov].reviewRounds,
    shape<HistoryTotals['reviewRounds']>({
      plan: 'req:n',
      contract: 'req:n',
      code: 'req:n',
      attempt: 'req:n',
    }),
  ],
  [
    'history.totals.spendUsd',
    overviewSchema[ov].history[ov].totals[ov].spendUsd,
    shape<HistoryTotals['spendUsd']>({ value: 'req:n', bound: 'req:s' }),
  ],
  [
    'health',
    overviewSchema[ov].health,
    shape<ViewHealth>({
      controller: 'req:o',
      stalledAttempts: 'req:n',
      quietAttempts: 'req:n',
      environmentFailures: 'req:n',
      budgeting: 'req:s',
      budgets: 'req:a<o>',
      spentTotalUsd: 'req:o',
      drift: 'req:o',
      warnings: 'req:a<o>',
      sources: 'opt:a<o>',
    }),
  ],
  [
    'health.sources[]',
    overviewSchema[ov].health[ov].sources.items,
    shape<SourceHealth>({
      connector: 'req:s',
      provider: 'req:s',
      level: 'opt:s',
      taskContext: 'opt:b',
      contractVersion: 'opt:n',
      line: 'opt:s',
      checkedAt: 'req:s',
    }),
  ],
  [
    'scope',
    overviewSchema[ov].scope,
    shape<NonNullable<OperatorView['scope']>>({ total: 'opt:n', tasks: 'req:a<o>' }),
  ],
  [
    'scope.tasks[]',
    overviewSchema[ov].scope[ov].tasks.items,
    shape<ScopeTaskView>({
      id: 'req:s',
      connector: 'req:s',
      key: 'opt:s',
      title: 'opt:s',
      workId: 'opt:s',
      state: 'req:s',
      plain: 'opt:s',
    }),
  ],
  [
    'sourceQuestions[]',
    overviewSchema[ov].sourceQuestions.items,
    shape<SourceQuestion>({
      connector: 'req:s',
      provider: 'req:s',
      id: 'req:s',
      ref: 'req:s',
      title: 'opt:s',
      question: 'opt:s',
      options: 'opt:a<s>',
      recommendation: 'opt:s',
      provisional: 'opt:s',
      tasks: 'opt:a<s>',
      url: 'opt:s',
      readAt: 'req:s',
    }),
  ],
  [
    'forecast',
    overviewSchema[ov].forecast,
    shape<ForecastView>({ progress: 'req:o', time: 'req:o', assumptions: 'req:a<s>' }),
  ],
  [
    'forecast.progress',
    overviewSchema[ov].forecast[ov].progress,
    shape<ForecastView['progress']>({
      percent: 'req:n',
      weighted: 'req:n',
      total: 'req:n',
      done: 'req:n',
      inWork: 'req:n',
      left: 'req:n',
      basis: 'req:s',
      line: 'req:s',
    }),
  ],
  [
    'forecast.time',
    overviewSchema[ov].forecast[ov].time,
    shape<ForecastView['time']>({
      startedAt: 'opt:s',
      elapsedMs: 'opt:n',
      remaining: 'opt:o',
      humanWait: 'req:o',
      line: 'req:s',
    }),
  ],
  [
    'forecast.time.remaining',
    overviewSchema[ov].forecast[ov].time[ov].remaining,
    shape<NonNullable<ForecastView['time']['remaining']>>({
      loMs: 'req:n',
      hiMs: 'req:n',
      samples: 'req:n',
      attemptsPerTask: 'req:n',
    }),
  ],
  [
    'forecast.time.humanWait',
    overviewSchema[ov].forecast[ov].time[ov].humanWait,
    shape<ForecastView['time']['humanWait']>({ works: 'req:n', ms: 'req:n', since: 'opt:s' }),
  ],
  [
    'updates',
    overviewSchema[ov].updates,
    shape<UpdatesView>({
      state: 'req:s',
      mode: 'req:s',
      current: 'req:o',
      available: 'opt:o',
      checkedAt: 'opt:s',
      line: 'req:s',
      whatsNew: 'opt:a<s>',
      command: 'opt:s',
    }),
  ],
  [
    'updates.current',
    overviewSchema[ov].updates[ov].current,
    shape<UpdatesView['current']>({ harness: 'req:s', ui: 'opt:s' }),
  ],
  [
    'health.budgets[]',
    overviewSchema[ov].health[ov].budgets.items,
    shape<ViewHealth['budgets'][number]>({
      scope: 'req:s',
      id: 'opt:s',
      state: 'req:s',
      spentUsd: 'req:o',
      limitUsd: 'opt:n',
      spentMs: 'opt:n',
      limitMs: 'opt:n',
    }),
  ],
  [
    'health.warnings[]',
    overviewSchema[ov].health[ov].warnings.items,
    shape<ViewHealth['warnings'][number]>({ code: 'req:s', message: 'req:s' }),
  ],
  [
    'activity[]',
    overviewSchema[ov].activity.items,
    shape<ActivityEntry>({
      at: 'req:s',
      actor: 'req:s',
      action: 'req:s',
      workId: 'opt:s',
      subject: 'opt:s',
      plain: 'req:s',
    }),
  ],
  [
    'decisions[]',
    overviewSchema[ov].decisions.items,
    shape<DecisionView>({
      id: 'req:s',
      kind: 'req:s',
      by: 'req:s',
      at: 'req:s',
      workId: 'opt:s',
      subject: 'opt:s',
      findingId: 'opt:s',
      requestId: 'opt:s',
      temporary: 'req:b',
      revisit: 'opt:s',
      title: 'opt:s',
      reason: 'opt:s',
    }),
  ],
  [
    'truncated',
    overviewSchema[ov].truncated,
    shape<Truncated>({
      works: 'opt:n',
      reviews: 'opt:n',
      findings: 'opt:n',
      questions: 'opt:n',
      escalations: 'opt:n',
      drift: 'opt:n',
      roles: 'opt:n',
      reviewRules: 'opt:n',
      warnings: 'opt:n',
      budgets: 'opt:n',
      blockers: 'opt:n',
      dependsOn: 'opt:n',
      alternates: 'opt:n',
      activity: 'opt:n',
      decisions: 'opt:n',
      scope: 'opt:n',
      sourceQuestions: 'opt:n',
      workFields: 'opt:n',
      whatsNew: 'opt:n',
    }),
  ],
  [
    'WorkDetailView',
    detailSchema,
    shape<WorkDetailView>({
      viewVersion: 'req:n',
      viewRevision: 'req:n',
      generatedAt: 'req:s',
      source: 'req:o',
      work: 'req:o',
      attempts: 'req:a<o>',
      verification: 'opt:a<o>',
      reviews: 'req:a<o>',
      questions: 'req:a<o>',
      drift: 'opt:o',
      truncated: 'opt:o',
    }),
  ],
  [
    'detail attempts[]',
    detailSchema[ov].attempts.items,
    shape<AttemptRow>({
      attempt: 'req:n',
      status: 'req:s',
      failureBucket: 'opt:s',
      interrupted: 'opt:b',
      runtime: 'req:s',
      model: 'opt:s',
      startedAt: 'req:s',
      finishedAt: 'opt:s',
      stages: 'req:a<o>',
    }),
  ],
  [
    'detail attempts[].stages[]',
    detailSchema[ov].attempts.items[ov].stages.items,
    shape<AttemptRow['stages'][number]>({
      stage: 'req:s',
      durationMs: 'opt:n',
      outcome: 'opt:s',
      unused: 'opt:b',
    }),
  ],
  [
    'detail verification[]',
    detailSchema[ov].verification.items,
    shape<VerificationRow>({
      gate: 'req:s',
      kind: 'req:s',
      phase: 'opt:s',
      result: 'req:s',
      how: 'req:s',
      by: 'opt:s',
      attempt: 'opt:n',
      at: 'opt:s',
    }),
  ],
  [
    'detail truncated',
    detailSchema[ov].truncated,
    shape<DetailTruncated>({
      attempts: 'opt:n',
      findings: 'opt:n',
      verification: 'opt:n',
      stages: 'opt:n',
      reviews: 'opt:n',
      questions: 'opt:n',
      blockers: 'opt:n',
      dependsOn: 'opt:n',
    }),
  ],
];

test('TS view types list exactly the harness schema fields, with the same required set', () => {
  for (const [name, schema, fields] of shapes) {
    assert.ok(schema?.properties, `${name}: no object schema`);
    assert.equal(schema.additionalProperties, false, `${name}: harness objects are closed`);
    assert.deepEqual(Object.keys(fields).sort(), Object.keys(schema.properties).sort(), name);
    const required = Object.keys(fields)
      .filter((k) => fields[k]!.startsWith('req:'))
      .sort();
    assert.deepEqual(required, [...(schema.required ?? [])].sort(), `${name}: required`);
    for (const [k, v] of Object.entries(fields))
      assert.equal(v.slice(4), schemaKind(schema.properties[k]), `${name}.${k}: leaf kind`);
  }
});

// Closed vocabularies: `vocab<T>()([...])` compiles only when the list holds
// every member of the TS union and nothing else; the test compares it with
// the schema enum. Every enum in the harness schemas must be listed here.
type Missing<T, A extends readonly unknown[]> = Exclude<T, A[number]>;
const vocab =
  <T extends string>() =>
  <const A extends readonly T[]>(a: A & ([Missing<T, A>] extends [never] ? unknown : never)) =>
    [...a] as string[];
const vocabularies: [string, Json, string[]][] = [
  [
    'settings.approvalMode',
    overviewSchema[ov].settings[ov].approvalMode,
    vocab<ViewSettings['approvalMode']>()(['agent', 'operator']),
  ],
  [
    'settings.mode',
    overviewSchema[ov].settings[ov].mode,
    vocab<ViewSettings['mode']>()(['live', 'fixture']),
  ],
  [
    'settings.reviews[].kind',
    overviewSchema[ov].settings[ov].reviews.items[ov].kind,
    vocab<ReviewRuleView['kind']>()(['plan', 'contract', 'code']),
  ],
  [
    'settings.reviews[].scope',
    overviewSchema[ov].settings[ov].reviews.items[ov].scope,
    vocab<ReviewRuleView['scope']>()(['global', 'repository', 'role']),
  ],
  [
    'settings.reviews[].vendor',
    overviewSchema[ov].settings[ov].reviews.items[ov].vendor,
    vocab<ReviewRuleView['vendor']>()(['different-vendor', 'same-vendor-allowed']),
  ],
  [
    'settings.budgets[].scope',
    overviewSchema[ov].settings[ov].budgets.items[ov].scope,
    vocab<ViewSettings['budgets'][number]['scope']>()(['work', 'group', 'total']),
  ],
  [
    'settings.budgetOnUnknown',
    overviewSchema[ov].settings[ov].budgetOnUnknown,
    vocab<NonNullable<ViewSettings['budgetOnUnknown']>>()(['stop', 'continue']),
  ],
  [
    'settings.timeouts.stall.action',
    overviewSchema[ov].settings[ov].timeouts[ov].stall[ov].action,
    vocab<ViewSettings['timeouts']['stall']['action']>()(['stop', 'report']),
  ],
  [
    'settings.lean.state',
    overviewSchema[ov].settings[ov].lean[ov].state,
    vocab<ViewSettings['lean']['state']>()(['on', 'off', 'unknown']),
  ],
  [
    'works[].liveness',
    overviewSchema[ov].works.items[ov].liveness,
    vocab<NonNullable<WorkView['liveness']>>()(['active', 'quiet', 'stalled']),
  ],
  [
    'reviews[].kind',
    overviewSchema[ov].reviews.items[ov].kind,
    vocab<ReviewSubjectView['kind']>()(['plan', 'contract', 'code']),
  ],
  [
    'reviews[].findings[].disposition.decision',
    overviewSchema[ov].reviews.items[ov].findings.items[ov].disposition[ov].decision,
    vocab<NonNullable<FindingView['disposition']>['decision']>()([
      'accepted-limitation',
      'continue',
    ]),
  ],
  [
    'reviews[].findings[].disposition.by',
    overviewSchema[ov].reviews.items[ov].findings.items[ov].disposition[ov].by,
    vocab<NonNullable<FindingView['disposition']>['by']>()(['lead', 'operator']),
  ],
  [
    'questions[].answerableBy',
    overviewSchema[ov].questions.items[ov].answerableBy,
    vocab<OperatorQuestion['answerableBy']>()(['operator', 'operator-or-lead']),
  ],
  [
    'questions[].answeredBy',
    overviewSchema[ov].questions.items[ov].answeredBy,
    vocab<NonNullable<OperatorQuestion['answeredBy']>>()(['operator', 'lead', 'host']),
  ],
  [
    'questions[].answerBasis.by',
    overviewSchema[ov].questions.items[ov].answerBasis[ov].by,
    vocab<AnswerBasis['by']>()(['operator', 'lead', 'host']),
  ],
  [
    'questions[].answerBasis.rule',
    overviewSchema[ov].questions.items[ov].answerBasis[ov].rule,
    vocab<NonNullable<AnswerBasis['rule']>>()(['technical', 'severity']),
  ],
  [
    'history.totals.spendUsd.bound',
    overviewSchema[ov].history[ov].totals[ov].spendUsd[ov].bound,
    vocab<HistoryTotals['spendUsd']['bound']>()(['exact', 'lower', 'unknown']),
  ],
  [
    'history.spendBound',
    overviewSchema[ov].history[ov].spendBound,
    vocab<ViewHistory['spendBound']>()(['exact', 'lower', 'unknown']),
  ],
  [
    'Bounded.bound',
    overviewSchema[ov].history[ov].spendOpeningUsd[ov].bound,
    vocab<ViewHistory['spendOpeningUsd']['bound']>()(['exact', 'lower', 'unknown']),
  ],
  [
    'health.budgeting',
    overviewSchema[ov].health[ov].budgeting,
    vocab<ViewHealth['budgeting']>()(['on', 'off']),
  ],
  [
    'health.budgets[].scope',
    overviewSchema[ov].health[ov].budgets.items[ov].scope,
    vocab<ViewHealth['budgets'][number]['scope']>()(['work', 'group', 'total']),
  ],
  [
    'health.budgets[].state',
    overviewSchema[ov].health[ov].budgets.items[ov].state,
    vocab<ViewHealth['budgets'][number]['state']>()(['within', 'exceeded', 'undetermined']),
  ],
  [
    'decisions[].by',
    overviewSchema[ov].decisions.items[ov].by,
    vocab<DecisionView['by']>()(['lead', 'operator']),
  ],
  [
    'detail attempts[].stages[].outcome',
    detailSchema[ov].attempts.items[ov].stages.items[ov].outcome,
    vocab<NonNullable<AttemptRow['stages'][number]['outcome']>>()(['passed', 'failed']),
  ],
  [
    'detail verification[].kind',
    detailSchema[ov].verification.items[ov].kind,
    vocab<VerificationRow['kind']>()(['gate', 'review']),
  ],
  [
    'progress.queue.runner',
    overviewSchema[ov].progress[ov].queue[ov].runner,
    vocab<NonNullable<ViewProgress['queue']['runner']>>()(['running', 'not-running']),
  ],
  [
    'scopeReason',
    overviewSchema[ov].scopeReason,
    vocab<NonNullable<OperatorView['scopeReason']>>()(['no-snapshot', 'unreadable']),
  ],
  [
    'scope.tasks[].state',
    overviewSchema[ov].scope[ov].tasks.items[ov].state,
    vocab<ScopeTaskView['state']>()(['in-harness', 'not-handed-over', 'not-ready']),
  ],
  [
    'forecast.progress.basis',
    overviewSchema[ov].forecast[ov].progress[ov].basis,
    vocab<ForecastView['progress']['basis']>()(['scope', 'works']),
  ],
  [
    'updates.state',
    overviewSchema[ov].updates[ov].state,
    vocab<UpdatesView['state']>()([
      'up-to-date',
      'available',
      'needs-decision',
      'unavailable',
      'not-checked',
    ]),
  ],
  [
    'updates.mode',
    overviewSchema[ov].updates[ov].mode,
    vocab<UpdatesView['mode']>()(['auto', 'notify', 'off']),
  ],
  [
    'detail verification[].phase',
    detailSchema[ov].verification.items[ov].phase,
    vocab<NonNullable<VerificationRow['phase']>>()(['candidate', 'integration']),
  ],
];

/** Every enum (and boolean-free const) in a schema, by JSON pointer-ish path. */
function enumsIn(node: unknown, path: string, out: Map<string, unknown[]>) {
  if (Array.isArray(node)) return node.forEach((n, i) => enumsIn(n, `${path}/${i}`, out));
  if (typeof node !== 'object' || node === null) return;
  const n = node as Json;
  if (Array.isArray(n.enum)) out.set(path, n.enum);
  for (const [k, v] of Object.entries(n)) if (k !== 'enum') enumsIn(v, `${path}/${k}`, out);
}

test('closed vocabularies of the TS types equal the harness schema enums', () => {
  for (const [name, node, values] of vocabularies) {
    assert.ok(Array.isArray(node?.enum), `${name}: schema has no enum`);
    assert.deepEqual([...values].sort(), [...node.enum].sort(), name);
  }
  // Each schema enum is covered (a new harness enum must be added above).
  for (const [schema, label] of [
    [overviewSchema, 'overview'],
    [detailSchema, 'detail'],
  ] as const) {
    const found = new Map<string, unknown[]>();
    enumsIn(schema, label, found);
    for (const [path, values] of found) {
      // Same values count as covered: the detail document repeats the
      // overview sub-schemas (work, reviews, questions) verbatim.
      const covered = vocabularies.some(
        ([, node]) => JSON.stringify(node.enum) === JSON.stringify(values),
      );
      assert.ok(covered, `${path}: enum ${JSON.stringify(values)} not compared`);
    }
  }
});

test('the work detail embeds the same work and question shapes as the overview', () => {
  assert.deepEqual(detailSchema.properties.work, overviewSchema.properties.works.items);
  assert.deepEqual(detailSchema.properties.questions, overviewSchema.properties.questions);
  assert.deepEqual(detailSchema.properties.reviews, overviewSchema.properties.reviews);
  assert.deepEqual(detailSchema.properties.drift, overviewSchema.properties.drift.items);
});

const harnessDir = process.env.DEVCONTOUR_HARNESS_DIR;
test(
  'copied schemas equal the harness checkout (DEVCONTOUR_HARNESS_DIR)',
  { skip: !harnessDir && 'DEVCONTOUR_HARNESS_DIR is not set' },
  () => {
    for (const f of ['operator-view.schema.json', 'work-detail-view.schema.json']) {
      const theirs = join(harnessDir!, 'schemas', f);
      assert.ok(existsSync(theirs), theirs);
      assert.equal(
        readFileSync(new URL('./contract/harness/' + f, import.meta.url), 'utf8'),
        readFileSync(theirs, 'utf8'),
        f,
      );
    }
  },
);

test(
  'live smoke: the real harness checkout answers capabilities and view (DEVCONTOUR_HARNESS_DIR)',
  { skip: !harnessDir && 'DEVCONTOUR_HARNESS_DIR is not set' },
  async () => {
    const { probeHarness, harnessView } = await import('../src/server/harness.ts');
    const dir = mkdtempSync(join(tmpdir(), 'hui-live-harness-'));
    try {
      const bin = join(dir, 'harness');
      const src = resolve(harnessDir!);
      writeFileSync(
        bin,
        `#!/bin/sh\ncd ${JSON.stringify(src)} && exec ${JSON.stringify(process.execPath)} ` +
          `--disable-warning=ExperimentalWarning --import tsx src/cli.ts "$@"\n`,
      );
      chmodSync(bin, 0o755);
      const support = await probeHarness(bin);
      assert.equal(support.view, true);
      assert.equal(support.lang, true);
      const state = join(dir, 'no-state-yet');
      const r = await harnessView(
        {
          bin,
          state,
          policy: join(src, 'examples', 'two-vendors', 'policy.json'),
          timeoutMs: 60_000,
        },
        'en',
      );
      assert.equal(r.ok, true, r.ok ? '' : r.message);
      const view = (r as { view: Json }).view;
      assert.deepEqual(validate(overviewSchema, view), []);
      assert.equal(checkView(view).ok, true);
      assert.equal(view.health.warnings[0].code, 'STATE_NOT_FOUND');
      assert.equal(existsSync(state), false, 'harness view never creates the state');
      // From revision 2 the harness keeps a feed: an absent state has an empty one.
      if (view.viewRevision >= 2) assert.deepEqual(view.activity, []);
      // From revision 1 the token is content-only: a second run over the same
      // (absent) state, at another clock, gives the same token and digest.
      if (view.viewRevision >= 1) {
        const { digestOf } = await import('../src/server/serve.ts');
        await new Promise((ok) => setTimeout(ok, 20));
        const again = await harnessView(
          {
            bin,
            state,
            policy: join(src, 'examples', 'two-vendors', 'policy.json'),
            timeoutMs: 60_000,
          },
          'en',
        );
        assert.equal(again.ok, true);
        const second = (again as { view: Json }).view;
        assert.notEqual(second.generatedAt, view.generatedAt, 'another projection clock');
        assert.equal(second.source.token, view.source.token);
        assert.equal(digestOf(second), digestOf(view));
        const { createHash } = await import('node:crypto');
        assert.equal(
          digestOf(view),
          'harness:' + createHash('sha256').update(view.source.token).digest('hex'),
        );
      }
    } finally {
      if (dir.startsWith(join(tmpdir(), 'hui-live-harness-'))) rmSync(dir, { recursive: true });
    }
  },
);
