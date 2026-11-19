// Contract with devcontour-harness: the view schema is owned by the harness.
// tests/contract/harness/*.schema.json are verbatim copies of the harness
// schemas (schemas/operator-view.schema.json, schemas/work-detail-view.schema.json
// of 0.1.0-alpha.55); empty-state.view.json is a real `harness view --lang en`
// envelope for a state that does not exist yet. With DEVCONTOUR_HARNESS_DIR
// pointing at a harness checkout the copies are compared byte for byte.

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkView,
  type ActivityEntry,
  type AttemptRow,
  type BlockerView,
  type DecisionView,
  type DriftView,
  type Escalation,
  type FindingView,
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

type Json = Record<string, any>;
const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
const overviewSchema = read('./contract/harness/operator-view.schema.json');
const detailSchema = read('./contract/harness/work-detail-view.schema.json');
const viewFixture = read('../fixtures/view.sample.json');
const workFixture = read('../fixtures/work.sample.json');
const harnessEmpty = read('./contract/harness/empty-state.view.json');

test('both fixtures and a real harness document are valid under the harness schemas', () => {
  assert.deepEqual(validate(overviewSchema, viewFixture), []);
  assert.deepEqual(validate(detailSchema, workFixture), []);
  assert.equal(harnessEmpty.ok, true);
  assert.deepEqual(validate(overviewSchema, harnessEmpty.data), []);
});

test('every schema-valid overview passes the compatibility gate', () => {
  assert.equal(checkView(viewFixture).ok, true);
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
  for (const r of workFixture.verification as VerificationRow[]) {
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
// each literal below must list exactly the keys of the type ('req' for a
// required field, 'opt' for an optional one), and the test compares it with
// the schema object's properties and `required`.
type Shape<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? 'opt' : 'req' };
const shape = <T>(s: Shape<T>) => s as Record<string, 'req' | 'opt'>;

type Truncated = NonNullable<OperatorView['truncated']>;
type DetailTruncated = NonNullable<WorkDetailView['truncated']>;
const ov = 'properties';
const shapes: [string, Json, Record<string, 'req' | 'opt'>][] = [
  [
    'OperatorView',
    overviewSchema,
    shape<OperatorView>({
      viewVersion: 'req',
      viewRevision: 'req',
      generatedAt: 'req',
      source: 'req',
      settings: 'req',
      works: 'req',
      reviews: 'req',
      questions: 'req',
      escalations: 'req',
      drift: 'req',
      progress: 'req',
      history: 'req',
      health: 'req',
      activity: 'opt',
      decisions: 'opt',
      truncated: 'opt',
    }),
  ],
  [
    'source',
    overviewSchema[ov].source,
    shape<OperatorView['source']>({
      producer: 'req',
      producerVersion: 'req',
      stateVersion: 'req',
      token: 'req',
    }),
  ],
  [
    'settings',
    overviewSchema[ov].settings,
    shape<ViewSettings>({
      policyDigest: 'req',
      approvalMode: 'req',
      mode: 'req',
      concurrency: 'req',
      roles: 'req',
      reviews: 'req',
      thresholds: 'req',
      budgets: 'req',
      budgetOnUnknown: 'opt',
      timeouts: 'req',
      lean: 'req',
      defaulted: 'req',
    }),
  ],
  [
    'settings.roles[]',
    overviewSchema[ov].settings[ov].roles.items,
    shape<RoleBinding>({ role: 'req', writer: 'req', repositoryId: 'opt' }),
  ],
  [
    'settings.roles[].writer',
    overviewSchema[ov].settings[ov].roles.items[ov].writer,
    shape<RoleBinding['writer']>({ runtime: 'req', model: 'opt', effort: 'opt' }),
  ],
  [
    'settings.reviews[]',
    overviewSchema[ov].settings[ov].reviews.items,
    shape<ReviewRuleView>({
      kind: 'req',
      scope: 'req',
      repositoryId: 'opt',
      role: 'opt',
      reviewer: 'req',
      alternates: 'req',
      vendor: 'req',
    }),
  ],
  [
    'settings.thresholds',
    overviewSchema[ov].settings[ov].thresholds,
    shape<ViewSettings['thresholds']>({
      inputSeverity: 'req',
      leadAnswersMaxSeverity: 'opt',
      leadAnswersTechnical: 'opt',
      criticalPaths: 'req',
      maxAttempts: 'req',
      repairBudget: 'req',
      maxNeutralFailures: 'req',
      reviewRoundCap: 'req',
      reviewEscalationRounds: 'req',
    }),
  ],
  [
    'settings.budgets[]',
    overviewSchema[ov].settings[ov].budgets.items,
    shape<ViewSettings['budgets'][number]>({ scope: 'req', usd: 'opt', timeMs: 'opt' }),
  ],
  [
    'settings.timeouts',
    overviewSchema[ov].settings[ov].timeouts,
    shape<ViewSettings['timeouts']>({
      runTimeoutMs: 'req',
      leaseMs: 'req',
      gateTimeoutFloorMs: 'opt',
      stall: 'req',
    }),
  ],
  [
    'settings.timeouts.stall',
    overviewSchema[ov].settings[ov].timeouts[ov].stall,
    shape<ViewSettings['timeouts']['stall']>({
      intervalMs: 'req',
      quietMs: 'req',
      stalledMs: 'req',
      action: 'req',
    }),
  ],
  [
    'settings.lean',
    overviewSchema[ov].settings[ov].lean,
    shape<ViewSettings['lean']>({ state: 'req' }),
  ],
  [
    'works[]',
    overviewSchema[ov].works.items,
    shape<WorkView>({
      id: 'req',
      graphId: 'req',
      title: 'opt',
      status: 'req',
      stage: 'req',
      attempts: 'req',
      liveness: 'opt',
      runtime: 'opt',
      model: 'opt',
      blockers: 'req',
      dependsOn: 'opt',
      target: 'opt',
      question: 'opt',
      spend: 'req',
      resultSha: 'opt',
    }),
  ],
  [
    'works[].stage',
    overviewSchema[ov].works.items[ov].stage,
    shape<WorkView['stage']>({
      name: 'req',
      step: 'opt',
      since: 'opt',
      next: 'req',
      needs: 'opt',
      typical: 'opt',
    }),
  ],
  [
    'works[].stage.needs',
    overviewSchema[ov].works.items[ov].stage[ov].needs,
    shape<NonNullable<WorkView['stage']['needs']>>({ actor: 'req', action: 'req' }),
  ],
  [
    'works[].stage.typical',
    overviewSchema[ov].works.items[ov].stage[ov].typical,
    shape<NonNullable<WorkView['stage']['typical']>>({
      p50Ms: 'req',
      p90Ms: 'req',
      samples: 'req',
    }),
  ],
  [
    'works[].attempts',
    overviewSchema[ov].works.items[ov].attempts,
    shape<WorkView['attempts']>({
      used: 'req',
      max: 'req',
      left: 'req',
      failed: 'req',
      interrupted: 'req',
      rechecks: 'req',
      neutral: 'req',
      line: 'opt',
      lastFailure: 'opt',
    }),
  ],
  [
    'works[].attempts.lastFailure',
    overviewSchema[ov].works.items[ov].attempts[ov].lastFailure,
    shape<NonNullable<WorkView['attempts']['lastFailure']>>({
      attempt: 'req',
      bucket: 'req',
      plain: 'req',
      at: 'opt',
    }),
  ],
  [
    'works[].blockers[]',
    overviewSchema[ov].works.items[ov].blockers.items,
    shape<BlockerView>({ code: 'req', plain: 'opt', actor: 'req' }),
  ],
  [
    'works[].target',
    overviewSchema[ov].works.items[ov].target,
    shape<TargetView>({ repositoryId: 'req', ref: 'req', acceptedSha: 'opt', remote: 'req' }),
  ],
  [
    'works[].target.remote',
    overviewSchema[ov].works.items[ov].target[ov].remote,
    shape<TargetView['remote']>({ state: 'req', trackingRef: 'opt', reason: 'opt' }),
  ],
  [
    'works[].question',
    overviewSchema[ov].works.items[ov].question,
    shape<NonNullable<WorkView['question']>>({ requestId: 'req', state: 'req', severity: 'req' }),
  ],
  [
    'works[].spend',
    overviewSchema[ov].works.items[ov].spend,
    shape<WorkView['spend']>({ calls: 'req', usd: 'req', durationMs: 'req' }),
  ],
  [
    'reviews[]',
    overviewSchema[ov].reviews.items,
    shape<ReviewSubjectView>({
      kind: 'req',
      subject: 'req',
      workId: 'opt',
      approved: 'req',
      rounds: 'req',
      open: 'req',
      accepted: 'req',
      reviewer: 'opt',
      sameVendor: 'opt',
      spend: 'req',
      findings: 'req',
      escalation: 'opt',
      line: 'opt',
    }),
  ],
  [
    'reviews[].findings[]',
    overviewSchema[ov].reviews.items[ov].findings.items,
    shape<FindingView>({
      id: 'req',
      severity: 'req',
      status: 'req',
      rounds: 'opt',
      disposition: 'opt',
      title: 'opt',
    }),
  ],
  [
    'reviews[].escalation',
    overviewSchema[ov].reviews.items[ov].escalation,
    shape<NonNullable<ReviewSubjectView['escalation']>>({
      requestId: 'req',
      findings: 'req',
      answered: 'req',
    }),
  ],
  [
    'questions[]',
    overviewSchema[ov].questions.items,
    shape<OperatorQuestion>({
      requestId: 'req',
      workId: 'req',
      state: 'req',
      version: 'req',
      severity: 'req',
      answerableBy: 'req',
      impact: 'opt',
      plain: 'opt',
      answeredBy: 'opt',
      title: 'opt',
      createdAt: 'req',
    }),
  ],
  [
    'escalations[]',
    overviewSchema[ov].escalations.items,
    shape<Escalation>({
      workId: 'opt',
      subject: 'opt',
      code: 'req',
      actor: 'req',
      action: 'req',
      since: 'req',
    }),
  ],
  [
    'drift[]',
    overviewSchema[ov].drift.items,
    shape<DriftView>({
      workId: 'req',
      repositoryId: 'req',
      ref: 'req',
      acceptedSha: 'req',
      head: 'opt',
      commitsSinceAccepted: 'opt',
      filesSinceAccepted: 'opt',
      diverged: 'opt',
      unavailable: 'opt',
    }),
  ],
  [
    'progress',
    overviewSchema[ov].progress,
    shape<ViewProgress>({
      total: 'req',
      byStage: 'req',
      running: 'req',
      done: 'req',
      waitingOperator: 'req',
      queue: 'req',
    }),
  ],
  [
    'progress.queue',
    overviewSchema[ov].progress[ov].queue,
    shape<ViewProgress['queue']>({
      paused: 'req',
      reason: 'opt',
      detail: 'opt',
      actor: 'opt',
      action: 'opt',
    }),
  ],
  [
    'history',
    overviewSchema[ov].history,
    shape<ViewHistory>({
      from: 'req',
      to: 'req',
      bucketMs: 'req',
      load: 'req',
      attemptsStarted: 'req',
      attemptsFailed: 'req',
      gatesPassed: 'req',
      gatesFailed: 'req',
      gatesReused: 'req',
      spendUsd: 'req',
      spendBound: 'req',
      spendOpeningUsd: 'req',
      budgetUsd: 'opt',
    }),
  ],
  [
    'health',
    overviewSchema[ov].health,
    shape<ViewHealth>({
      controller: 'req',
      stalledAttempts: 'req',
      quietAttempts: 'req',
      environmentFailures: 'req',
      budgeting: 'req',
      budgets: 'req',
      spentTotalUsd: 'req',
      drift: 'req',
      warnings: 'req',
    }),
  ],
  [
    'health.budgets[]',
    overviewSchema[ov].health[ov].budgets.items,
    shape<ViewHealth['budgets'][number]>({
      scope: 'req',
      id: 'opt',
      state: 'req',
      spentUsd: 'req',
      limitUsd: 'opt',
      spentMs: 'opt',
      limitMs: 'opt',
    }),
  ],
  [
    'health.warnings[]',
    overviewSchema[ov].health[ov].warnings.items,
    shape<ViewHealth['warnings'][number]>({ code: 'req', message: 'req' }),
  ],
  [
    'activity[]',
    overviewSchema[ov].activity.items,
    shape<ActivityEntry>({
      at: 'req',
      actor: 'req',
      action: 'req',
      workId: 'opt',
      subject: 'opt',
      plain: 'req',
    }),
  ],
  [
    'decisions[]',
    overviewSchema[ov].decisions.items,
    shape<DecisionView>({
      id: 'req',
      kind: 'req',
      by: 'req',
      at: 'req',
      workId: 'opt',
      subject: 'opt',
      findingId: 'opt',
      requestId: 'opt',
      temporary: 'req',
      revisit: 'opt',
      title: 'opt',
      reason: 'opt',
    }),
  ],
  [
    'truncated',
    overviewSchema[ov].truncated,
    shape<Truncated>({
      works: 'opt',
      reviews: 'opt',
      findings: 'opt',
      questions: 'opt',
      escalations: 'opt',
      drift: 'opt',
      roles: 'opt',
      reviewRules: 'opt',
      warnings: 'opt',
      budgets: 'opt',
      blockers: 'opt',
      dependsOn: 'opt',
      alternates: 'opt',
      activity: 'opt',
      decisions: 'opt',
    }),
  ],
  [
    'WorkDetailView',
    detailSchema,
    shape<WorkDetailView>({
      viewVersion: 'req',
      viewRevision: 'req',
      generatedAt: 'req',
      source: 'req',
      work: 'req',
      attempts: 'req',
      verification: 'opt',
      reviews: 'req',
      questions: 'req',
      drift: 'opt',
      truncated: 'opt',
    }),
  ],
  [
    'detail attempts[]',
    detailSchema[ov].attempts.items,
    shape<AttemptRow>({
      attempt: 'req',
      status: 'req',
      failureBucket: 'opt',
      interrupted: 'opt',
      runtime: 'req',
      model: 'opt',
      startedAt: 'req',
      finishedAt: 'opt',
      stages: 'req',
    }),
  ],
  [
    'detail attempts[].stages[]',
    detailSchema[ov].attempts.items[ov].stages.items,
    shape<AttemptRow['stages'][number]>({ stage: 'req', durationMs: 'opt', outcome: 'opt' }),
  ],
  [
    'detail verification[]',
    detailSchema[ov].verification.items,
    shape<VerificationRow>({
      gate: 'req',
      kind: 'req',
      phase: 'opt',
      result: 'req',
      how: 'req',
      by: 'opt',
      attempt: 'opt',
      at: 'opt',
    }),
  ],
  [
    'detail truncated',
    detailSchema[ov].truncated,
    shape<DetailTruncated>({
      attempts: 'opt',
      findings: 'opt',
      verification: 'opt',
      stages: 'opt',
      reviews: 'opt',
      questions: 'opt',
      blockers: 'opt',
      dependsOn: 'opt',
    }),
  ],
];

test('TS view types list exactly the harness schema fields, with the same required set', () => {
  for (const [name, schema, fields] of shapes) {
    assert.ok(schema?.properties, `${name}: no object schema`);
    assert.equal(schema.additionalProperties, false, `${name}: harness objects are closed`);
    assert.deepEqual(Object.keys(fields).sort(), Object.keys(schema.properties).sort(), name);
    const required = Object.keys(fields)
      .filter((k) => fields[k] === 'req')
      .sort();
    assert.deepEqual(required, [...(schema.required ?? [])].sort(), `${name}: required`);
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
