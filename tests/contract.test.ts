// Contract with devcontour-harness: the view schema is owned by the harness.
// tests/contract/harness/*.schema.json are verbatim copies of the harness
// schemas (schemas/operator-view.schema.json, schemas/work-detail-view.schema.json
// of 0.1.0-alpha.56, view revision 1); empty-state.view.json is a real
// `harness view --lang en` envelope of that version for a state that does not
// exist yet. tests/contract/harness-0.1.0-alpha.55/ keeps the same files of
// 0.1.0-alpha.55 (revision 0): the panel still supports that harness
// (peer >=0.1.0-alpha.55), so 55-shaped documents must pass both schemas and
// the gate. With DEVCONTOUR_HARNESS_DIR pointing at a harness checkout the
// copies are compared byte for byte and a live smoke runs that checkout's
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
const overviewSchema55 = read('./contract/harness-0.1.0-alpha.55/operator-view.schema.json');
const detailSchema55 = read('./contract/harness-0.1.0-alpha.55/work-detail-view.schema.json');
const harnessEmpty55 = read('./contract/harness-0.1.0-alpha.55/empty-state.view.json');

/** The same document as harness alpha.55 would send it: revision 0, without the revision 1 fields. */
function asAlpha55(doc: Json): Json {
  const d = structuredClone(doc);
  d.viewRevision = 0;
  for (const q of d.questions ?? []) delete q.answerBasis;
  if (d.history) delete d.history.totals;
  return d;
}
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
  assert.equal(harnessEmpty.data.viewRevision, 1);
  assert.deepEqual(validate(overviewSchema, harnessEmpty.data), []);
});

test('alpha.55 documents (revision 0) stay valid under the alpha.56 schemas and pass the gate', () => {
  // The real alpha.55 envelope, under both schema versions.
  assert.equal(harnessEmpty55.data.viewRevision, 0);
  assert.deepEqual(validate(overviewSchema55, harnessEmpty55.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty55.data), []);
  const real = checkView(harnessEmpty55.data);
  assert.equal(real.ok, true, real.ok ? '' : real.message);
  assert.equal(real.ok && real.view.history.totals, undefined);
  for (const [name, doc, schema] of fixtures()) {
    const old = asAlpha55(doc);
    const old55 = schema === overviewSchema ? overviewSchema55 : detailSchema55;
    // A 55-shaped copy is a real alpha.55 document: valid under the alpha.55 schema…
    assert.deepEqual(validate(old55, old), [], name);
    // …and still valid under the alpha.56 one: the revision 1 fields are optional.
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
});

test('the 56-shaped fixtures really carry the revision 1 fields (the alpha.55 schema refuses them)', () => {
  for (const [name, doc, schema] of fixtures()) {
    assert.equal(doc.viewRevision, 1, name);
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
    assert.equal(t.spendUsd.bound, h.spendBound);
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
    }),
  ],
  [
    'works[].blockers[]',
    overviewSchema[ov].works.items[ov].blockers.items,
    shape<BlockerView>({ code: 'req:s', plain: 'opt:s', actor: 'req:s|null' }),
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
    shape<TargetView['remote']>({ state: 'req:s', trackingRef: 'opt:s', reason: 'opt:s' }),
  ],
  [
    'works[].question',
    overviewSchema[ov].works.items[ov].question,
    shape<NonNullable<WorkView['question']>>({
      requestId: 'req:s',
      state: 'req:s',
      severity: 'req:n',
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
    }),
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
    }),
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
    shape<AttemptRow['stages'][number]>({ stage: 'req:s', durationMs: 'opt:n', outcome: 'opt:s' }),
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
        assert.equal(digestOf(view), 'harness:' + view.source.token);
      }
    } finally {
      if (dir.startsWith(join(tmpdir(), 'hui-live-harness-'))) rmSync(dir, { recursive: true });
    }
  },
);
