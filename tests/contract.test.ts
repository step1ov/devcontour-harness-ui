// Contract with devcontour-harness: the view schema is owned by the harness.
// tests/contract/harness/*.schema.json are verbatim copies of the harness
// schemas (schemas/operator-view.schema.json, schemas/work-detail-view.schema.json
// and schemas/setup-view.schema.json of 0.1.0-alpha.69, view revision 9);
// empty-state.view.json is a real `harness view --lang en` envelope of that
// version for a state that does not exist yet (examples/two-vendors policy),
// setup-state.view.json a real `harness view --repository <empty dir> --lang en`
// (the setup document) and setup-progress.view.json a real `harness view
// --repository <dir> --lang en` right after `harness init` (an overview at the
// setup stage with `stage.progress`), made with the built CLI of the
// released 0.1.0-alpha.69. tests/contract/harness-0.1.0-alpha.68/ keeps the same
// files of 0.1.0-alpha.68 (revision 8); tests/contract/harness-0.1.0-alpha.67/ keeps the same
// files of 0.1.0-alpha.67 (revision 7); tests/contract/harness-0.1.0-alpha.66/ keeps the same
// files of 0.1.0-alpha.66 (revision 6); tests/contract/harness-0.1.0-alpha.65/ keeps the same
// files of 0.1.0-alpha.65 (revision 5); tests/contract/harness-0.1.0-alpha.62/ keeps the same
// files of 0.1.0-alpha.62 (revision 4 with `neverRun` and `scopeReason`),
// harness-0.1.0-alpha.60/ (revision 4 without them), harness-0.1.0-alpha.59/
// (revision 3), harness-0.1.0-alpha.57/ (revision 2, also alpha.58),
// harness-0.1.0-alpha.56/ and harness-0.1.0-alpha.55/ keep the same files of
// 0.1.0-alpha.59, .57, .56 (revision 1) and .55 (revision 0): the panel
// still supports those harnesses (peer >=0.1.0-alpha.55), so older-shaped
// documents must pass their own and every newer schema and the gate. With
// DEVCONTOUR_HARNESS_DIR pointing at a harness checkout or an installed
// package the copies are compared byte for byte and a live smoke runs its
// `capabilities` and `view` (`--state` and, from revision 5, `--repository`).

import { strict as assert } from 'node:assert';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  checkOverview,
  checkView,
  checkWorkDetail,
  isSetupDocument,
  type ActivityEntry,
  type Bilingual,
  type DecisionSettingsView,
  type LeadView,
  type PlannedTaskView,
  type PreviewView,
  type ResourcesView,
  type TrackStep,
  type WorkTrack,
  type AnswerBasis,
  type AttemptRow,
  type BlockerView,
  type DecisionView,
  type DriftView,
  type Escalation,
  type FindingView,
  type AttemptReviewResult,
  type ForecastGrowthView,
  type ForecastOutlineView,
  type ForecastView,
  type HarnessModeView,
  type HeldGateCause,
  type ReleaseReviewView,
  type OutlineComponentView,
  type OutlineStageView,
  type ReopenedView,
  type StageProgressView,
  type QuestionOption,
  type ScopeTaskView,
  type SetupView,
  type SetupProgressView,
  type SetupStepView,
  type SourceReview,
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
import {
  asAlpha55,
  asAlpha56,
  asAlpha57,
  asAlpha59,
  asAlpha62,
  asAlpha65,
  asAlpha66,
} from './legacy.ts';
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
const setupSchema = read('./contract/harness/setup-view.schema.json');
const harnessSetup = read('./contract/harness/setup-state.view.json');
const harnessProgress = read('./contract/harness/setup-progress.view.json');
/** The producer of the alpha.69 copies. */
const ALPHA69 = /^0\.1\.0-alpha\.69$/;
const overviewSchema62 = read('./contract/harness-0.1.0-alpha.62/operator-view.schema.json');
const detailSchema62 = read('./contract/harness-0.1.0-alpha.62/work-detail-view.schema.json');
const harnessEmpty62 = read('./contract/harness-0.1.0-alpha.62/empty-state.view.json');
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
  assert.equal(harnessEmpty.data.viewRevision, 9);
  // Revision 9: a policy without the field is in light mode, by default, with the write guard.
  assert.deepEqual(harnessEmpty.data.settings.harnessMode, {
    mode: 'light',
    default: true,
    writeGuard: true,
  });
  assert.equal(harnessEmpty.data.settings.thresholds.reviewRoundsUnlimited, true);
  assert.match(harnessEmpty.data.source.producerVersion, ALPHA69);
  // Revision 6: who decides, with the harness's own words in both languages.
  assert.equal(harnessEmpty.data.settings.decisions.items[0].key, 'maxAttempts');
  assert.match(harnessEmpty.data.settings.decisions.summary.en, /you decide/);
  assert.match(harnessEmpty.data.settings.decisions.summary.ru, /решаете вы/);
  // No state: no lead session, no tracks, no previews, no planned tasks.
  for (const k of ['lead', 'previews', 'planned', 'resources'])
    assert.equal(Object.hasOwn(harnessEmpty.data, k), false, k);
  // Revision 5: a state without works says it is at the setup stage.
  assert.deepEqual(harnessEmpty.data.stage, {
    name: 'setup',
    lines: ['Harness setup is in progress', 'No tasks yet'],
  });
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

test('the setup document of harness alpha.69 is valid, passes the setup gate and is not an overview', () => {
  assert.equal(harnessSetup.ok, true);
  const doc = harnessSetup.data;
  assert.equal(doc.viewRevision, 9);
  assert.match(doc.source.producerVersion, ALPHA69);
  // An empty directory has no `.harness/`: no setup progress yet.
  assert.equal(Object.hasOwn(doc.stage, 'progress'), false);
  assert.deepEqual(validate(setupSchema, doc), []);
  // Neither an overview nor a work detail.
  assert.notDeepEqual(validate(overviewSchema, doc), []);
  assert.notDeepEqual(validate(detailSchema, doc), []);
  assert.equal(isSetupDocument(doc), true);
  const c = checkOverview(doc);
  assert.equal(c.ok, true, c.ok ? '' : c.message);
  assert.equal(c.ok && 'setup' in c && c.setup.setup.waitingFor, 'project');
  assert.equal(c.ok && c.newerRevision, false);
  // The overview gate alone refuses it: no screen reads works that are not there.
  assert.equal(checkView(doc).ok, false);
  // An overview at the setup stage stays an overview.
  assert.equal(isSetupDocument(harnessEmpty.data), false);
  const e = checkOverview(harnessEmpty.data);
  assert.equal(e.ok && !('setup' in e), true);
  // The setup gate checks its fields' types.
  for (const bad of [
    { ...doc, stage: { name: 'setup', lines: [1] } },
    { ...doc, setup: { waitingFor: 3 } },
    { ...doc, generatedAt: 'yesterday' },
    { ...doc, viewVersion: 2 },
  ])
    assert.equal(checkOverview(bad).ok, false, JSON.stringify(bad).slice(0, 80));
});

const overviewSchema66 = read('./contract/harness-0.1.0-alpha.66/operator-view.schema.json');
const detailSchema66 = read('./contract/harness-0.1.0-alpha.66/work-detail-view.schema.json');
const setupSchema66 = read('./contract/harness-0.1.0-alpha.66/setup-view.schema.json');
const harnessEmpty66 = read('./contract/harness-0.1.0-alpha.66/empty-state.view.json');
const harnessSetup66 = read('./contract/harness-0.1.0-alpha.66/setup-state.view.json');

test('a real alpha.69 overview right after harness init carries the setup progress', () => {
  assert.equal(harnessProgress.ok, true);
  const doc = harnessProgress.data;
  assert.equal(doc.viewRevision, 9);
  // harness init writes no harnessMode: light mode by default.
  assert.deepEqual(doc.settings.harnessMode, { mode: 'light', default: true, writeGuard: true });
  assert.equal(doc.settings.thresholds.reviewRoundsUnlimited, true);
  assert.match(doc.source.producerVersion, ALPHA69);
  assert.deepEqual(validate(overviewSchema, doc), []);
  assert.deepEqual(doc.works, []);
  assert.equal(doc.stage.name, 'setup');
  const p = doc.stage.progress;
  // The steps in the harness order, the soft budget of 30 min, both languages always.
  assert.deepEqual(
    p.steps.map((x: Json) => x.id),
    ['profile', 'init', 'doctor', 'smoke', 'probe', 'gates', 'connector'],
  );
  assert.equal(p.budgetMs, 30 * 60_000);
  assert.equal(p.overBudget, false);
  // From alpha.68: the setup clock starts at this setup's first recorded step, not
  // at the oldest file of an inherited `.harness/` — right after init, seconds.
  assert.ok(p.elapsedMs < 60_000, String(p.elapsedMs));
  assert.ok(instantMs(p.since) <= instantMs(doc.generatedAt));
  assert.match(p.line, /^Настройка: готово 2 из 5 шагов/);
  assert.match(p.lineEn, /^Setup: 2 of 5 steps done/);
  // The progress line is not one of the stage lines: the panel shows it itself.
  assert.equal(doc.stage.lines.includes(p.line), false);
  assert.equal(doc.stage.lines.includes(p.lineEn), false);
  const c = checkOverview(doc);
  assert.equal(c.ok && !('setup' in c) && c.newerRevision, false);
  // The alpha.66 schema refuses it: a real revision 7 field.
  assert.match(validate(overviewSchema66, doc).join(), /unknown field progress/);
});

const overviewSchema67 = read('./contract/harness-0.1.0-alpha.67/operator-view.schema.json');
const detailSchema67 = read('./contract/harness-0.1.0-alpha.67/work-detail-view.schema.json');
const setupSchema67 = read('./contract/harness-0.1.0-alpha.67/setup-view.schema.json');
const harnessEmpty67 = read('./contract/harness-0.1.0-alpha.67/empty-state.view.json');
const harnessSetup67 = read('./contract/harness-0.1.0-alpha.67/setup-state.view.json');
const harnessProgress67 = read('./contract/harness-0.1.0-alpha.67/setup-progress.view.json');

test('alpha.67 documents (revision 7) stay valid under the alpha.69 schemas and pass the gate', () => {
  for (const [name, env, schema, old] of [
    ['empty', harnessEmpty67, overviewSchema, overviewSchema67],
    ['setup', harnessSetup67, setupSchema, setupSchema67],
    ['progress', harnessProgress67, overviewSchema, overviewSchema67],
  ] as const) {
    assert.equal(env.data.viewRevision, 7, name);
    assert.equal(env.data.source.producerVersion, '0.1.0-alpha.67', name);
    assert.deepEqual(validate(old, env.data), [], name);
    assert.deepEqual(validate(schema, env.data), [], name);
    const c = checkOverview(env.data);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
  for (const [name, doc, schema] of fixtures()) {
    const old67 = schema === overviewSchema ? overviewSchema67 : detailSchema67;
    assert.deepEqual(validate(old67, doc), [], name);
  }
});

test('revision 8 fields: valid under the alpha.68+ schemas, refused by alpha.67, checked by the gate', () => {
  const v = structuredClone(viewFixture);
  v.viewRevision = 8;
  const w = v.works.find((x: Json) => x.id === 'import-csv');
  w.attemptReviews = [
    {
      attempt: 1,
      phase: 'candidate',
      verdict: 'rejected',
      findings: 3,
      notes: 1,
      at: '2026-11-19T10:40:00.000Z',
      earlier: true,
    },
    {
      attempt: 2,
      phase: 'integration',
      verdict: 'approved',
      findings: 0,
      notes: 0,
      at: '2026-11-19T11:36:00.000Z',
    },
  ];
  w.track.steps.find((x: Json) => x.kind === 'diagnosis').required = true;
  v.works.find((x: Json) => x.id === 'add-greeting').reopened = {
    at: '2026-11-19T11:00:00.000Z',
    by: 'lead',
    revision: 2,
    budget: 'fresh',
    acceptedSha: '3b1f9e0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    spent: 1,
    reason: 'reopened by the lead: rework after acceptance (accepted result 3b1f9e0 not included)',
  };
  v.reviews[0].rounds = { ...v.reviews[0].rounds, remaining: 4, free: 1 };
  Object.assign(v.forecast.progress, {
    conditional: true,
    growth: {
      at: '2026-11-19T11:01:00.000Z',
      added: ['photo-gate'],
      before: 95,
      after: 80,
      by: 'works',
      line: 'plan grew: +photo-gate (was 95 % → now 80 %)',
    },
    infraShare: { share: 0.3, line: 'infrastructure is 30 % of the release (estimate)' },
  });
  v.forecast.progress.works = [
    {
      workId: 'locale-format',
      percent: 25,
      attempt: { n: 2, max: 3 },
      stageProgress: {
        stage: 'checks',
        from: 0.25,
        to: 0.5,
        since: '2026-11-19T11:52:10.000Z',
        typicalMs: 600000,
        samples: 6,
      },
      line: 'DEMO-2: ~25 %',
    },
  ];
  v.forecast.time.finishing = {
    since: '2026-11-19T11:25:00.000Z',
    elapsedMs: 60000,
    exceeded: true,
  };
  v.forecast.time.outline = {
    units: 5,
    basis: 'default',
    line: 'by the release outline ~5 more tasks',
  };
  v.forecast.outline = {
    state: 'recorded',
    revision: 1,
    units: 10,
    stages: [
      {
        id: 'infra',
        kind: 'infra',
        state: 'partial',
        units: 3,
        registered: 2,
        percent: 60,
        components: [
          {
            id: 'api',
            size: 'M',
            actor: 'writers',
            state: 'registered',
            units: 2,
            registered: 2,
            percent: 90,
            works: ['locale-format'],
          },
        ],
      },
    ],
    line: 'release outline: 1 stage, ~10 tasks',
  };
  v.truncated = { ...(v.truncated ?? {}), attemptReviews: 2 };
  assert.deepEqual(validate(overviewSchema, v), []);
  const old = validate(overviewSchema67, v).join();
  for (const f of [
    'attemptReviews',
    'reopened',
    'required',
    'remaining',
    'free',
    'stageProgress',
    'growth',
    'conditional',
    'infraShare',
    'finishing',
    'outline',
  ])
    assert.match(old, new RegExp(`unknown field ${f}`), f);
  const c = checkView(v);
  assert.equal(c.ok, true, c.ok ? '' : c.message);
  assert.equal(c.ok && c.newerRevision, false);
  // The gate refuses a malformed revision 8 field instead of throwing during render.
  const bad = (f: (d: Json) => void) => {
    const d = structuredClone(v);
    f(d);
    return checkView(d).ok;
  };
  assert.equal(
    bad((d) => (d.works[3].attemptReviews[0].attempt = 'x')),
    false,
  );
  assert.equal(
    bad((d) => (d.works[0].reopened.spent = -1)),
    false,
  );
  assert.equal(
    bad((d) => (d.reviews[0].rounds.remaining = 'four')),
    false,
  );
  assert.equal(
    bad((d) => (d.reviews[0].rounds.remaining = null)),
    true,
  );
  assert.equal(
    bad((d) => (d.forecast.outline.stages[0].units = -1)),
    false,
  );
  assert.equal(
    bad((d) => (d.forecast.progress.works[0].stageProgress.from = 'a')),
    false,
  );
  assert.equal(
    bad((d) => (d.forecast.time.finishing.since = 'yesterday')),
    false,
  );
  // The work detail embeds the same work.
  const detail = structuredClone(workFixture);
  detail.viewRevision = 8;
  detail.work.attemptReviews = w.attemptReviews;
  detail.truncated = { ...(detail.truncated ?? {}), attemptReviews: 1 };
  assert.deepEqual(validate(detailSchema, detail), []);
  assert.equal(checkWorkDetail(detail).ok, true);
});

const overviewSchema68 = read('./contract/harness-0.1.0-alpha.68/operator-view.schema.json');
const detailSchema68 = read('./contract/harness-0.1.0-alpha.68/work-detail-view.schema.json');
const setupSchema68 = read('./contract/harness-0.1.0-alpha.68/setup-view.schema.json');
const harnessEmpty68 = read('./contract/harness-0.1.0-alpha.68/empty-state.view.json');
const harnessSetup68 = read('./contract/harness-0.1.0-alpha.68/setup-state.view.json');
const harnessProgress68 = read('./contract/harness-0.1.0-alpha.68/setup-progress.view.json');

test('alpha.68 documents (revision 8) stay valid under the alpha.69 schemas and pass the gate', () => {
  for (const [name, env, schema, old] of [
    ['empty', harnessEmpty68, overviewSchema, overviewSchema68],
    ['setup', harnessSetup68, setupSchema, setupSchema68],
    ['progress', harnessProgress68, overviewSchema, overviewSchema68],
  ] as const) {
    assert.equal(env.data.viewRevision, 8, name);
    assert.equal(env.data.source.producerVersion, '0.1.0-alpha.68', name);
    assert.deepEqual(validate(old, env.data), [], name);
    assert.deepEqual(validate(schema, env.data), [], name);
    const c = checkOverview(env.data);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
    // No revision 9 field in an alpha.68 document: the panel reads «absent».
    if (c.ok && !('setup' in c)) {
      assert.equal(c.view.settings.harnessMode, undefined, name);
      assert.equal(c.view.settings.thresholds.reviewRoundsUnlimited, undefined, name);
    }
  }
  for (const [name, doc, schema] of fixtures()) {
    const old68 = schema === overviewSchema ? overviewSchema68 : detailSchema68;
    assert.deepEqual(validate(old68, doc), [], name);
  }
});

/** A revision 9 overview from the demo fixture: every new field once. */
function revision9View(): Json {
  const v = structuredClone(viewFixture);
  v.viewRevision = 9;
  v.settings.harnessMode = { mode: 'light', default: true, writeGuard: true };
  v.settings.thresholds.reviewRoundsUnlimited = true;
  v.forecast.progress.release.review = {
    required: true,
    status: 'findings',
    round: 2,
    open: 3,
    blocking: 1,
    base: '1a2b3c4',
    baseSource: 'register',
    head: '5d6e7f8',
    target: 'main',
    at: '2026-11-19T11:50:00.000Z',
    line: 'release review found 1 blocking of 3 open (round 2): fix them with works (required: release done waits)',
  };
  v.reviews.push({
    kind: 'release',
    subject: 'release',
    approved: false,
    rounds: { used: 2, max: null },
    open: { blocking: 1, notes: 2 },
    accepted: 0,
    spend: { calls: 2, usd: { value: 0.4, bound: 'exact' } },
    findings: [],
  });
  v.resources.gates.held[0].cause = 'gate-definition';
  return v;
}

test('revision 9 fields: valid under the alpha.69 schemas, refused by alpha.68, checked by the gate', () => {
  const v = revision9View();
  assert.deepEqual(validate(overviewSchema, v), []);
  const old = validate(overviewSchema68, v).join();
  for (const f of ['harnessMode', 'reviewRoundsUnlimited', 'review', 'cause'])
    assert.match(old, new RegExp(`unknown field ${f}`), f);
  assert.match(
    old,
    /reviews\[\d+\]\.kind: not in enum/,
    'reviews[].kind release is not in the alpha.68 vocabulary',
  );
  const c = checkView(v);
  assert.equal(c.ok, true, c.ok ? '' : c.message);
  assert.equal(c.ok && c.newerRevision, false);
  // The gate refuses a malformed revision 9 field instead of throwing during render.
  const bad = (f: (d: Json) => void) => {
    const d = structuredClone(v);
    f(d);
    return checkView(d).ok;
  };
  assert.equal(
    bad((d) => (d.settings.harnessMode.writeGuard = 'yes')),
    false,
  );
  assert.equal(
    bad((d) => (d.settings.harnessMode.mode = 3)),
    false,
  );
  assert.equal(
    bad((d) => (d.settings.thresholds.reviewRoundsUnlimited = 1)),
    false,
  );
  assert.equal(
    bad((d) => (d.forecast.progress.release.review.required = 'true')),
    false,
  );
  assert.equal(
    bad((d) => (d.forecast.progress.release.review.open = -1)),
    false,
  );
  assert.equal(
    bad((d) => (d.forecast.progress.release.review.at = 'yesterday')),
    false,
  );
  assert.equal(
    bad((d) => delete d.forecast.progress.release.review.line),
    false,
  );
  assert.equal(
    bad((d) => (d.resources.gates.held[0].cause = 7)),
    false,
  );
  // An unknown cause or status of a later harness is read, shown as its code.
  assert.equal(
    bad((d) => (d.resources.gates.held[0].cause = 'later-cause')),
    true,
  );
  // The work detail carries release reviews too.
  const detail = structuredClone(workFixture);
  detail.viewRevision = 9;
  detail.reviews.push(structuredClone(v.reviews.at(-1)));
  assert.deepEqual(validate(detailSchema, detail), []);
  assert.match(validate(detailSchema68, detail).join(), /reviews\[\d+\]\.kind: not in enum/);
  assert.equal(checkWorkDetail(detail).ok, true);
});

test('alpha.66 documents (revision 6) stay valid under the alpha.69 schemas and pass the gate', () => {
  assert.equal(harnessEmpty66.data.viewRevision, 6);
  assert.equal(harnessEmpty66.data.source.producerVersion, '0.1.0-alpha.66');
  assert.deepEqual(validate(overviewSchema66, harnessEmpty66.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty66.data), []);
  const real = checkOverview(harnessEmpty66.data);
  assert.equal(real.ok && !('setup' in real) && real.newerRevision, false);
  assert.deepEqual(validate(setupSchema66, harnessSetup66.data), []);
  assert.deepEqual(validate(setupSchema, harnessSetup66.data), []);
  const setup = checkOverview(harnessSetup66.data);
  assert.equal(setup.ok && 'setup' in setup, true);
  const docs: [string, Json, Json, Json][] = [
    ...fixtures().map(([name, doc, schema]): [string, Json, Json, Json] => [
      name,
      doc,
      schema,
      schema === overviewSchema ? overviewSchema66 : detailSchema66,
    ]),
    [
      'view.setup-progress.json',
      read('../fixtures/view.setup-progress.json'),
      overviewSchema,
      overviewSchema66,
    ],
    [
      'ru/view.setup-progress.json',
      read('../fixtures/ru/view.setup-progress.json'),
      overviewSchema,
      overviewSchema66,
    ],
  ];
  for (const [name, doc, schema, old66] of docs) {
    const old = asAlpha66(doc);
    assert.deepEqual(validate(old66, old), [], name);
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
});

test('the revision 7 fixtures are valid, carry the new fields, and the alpha.66 schema refuses them', () => {
  for (const f of ['view.setup-progress.json', 'ru/view.setup-progress.json']) {
    const doc = read('../fixtures/' + f);
    assert.equal(doc.viewRevision, 7, f);
    assert.deepEqual(validate(overviewSchema, doc), [], f);
    assert.match(validate(overviewSchema66, doc).join(), /unknown field progress/, f);
    const c = checkView(doc);
    assert.equal(c.ok && c.newerRevision, false, f);
    // Over budget, with a failed step, a recorded one, a skipped one and doctor unknown.
    const p = doc.stage.progress;
    assert.equal(p.overBudget, true, f);
    assert.ok(p.elapsedMs > p.budgetMs, f);
    assert.deepEqual(
      p.steps.map((x: Json) => x.state),
      ['done', 'done', 'unknown', 'done', 'failed', 'pending', 'skipped'],
      f,
    );
  }
  // An infrastructure work: the alpha.67 schemas take `kind: infra`, alpha.66 refuses it.
  const infra = structuredClone(viewFixture);
  infra.viewRevision = 7;
  infra.works[0].kind = 'infra';
  assert.deepEqual(validate(overviewSchema, infra), []);
  assert.match(validate(overviewSchema66, infra).join(), /unknown field kind/);
  assert.equal(checkView(infra).ok, true);
  const detail = structuredClone(workFixture);
  detail.work.kind = 'infra';
  assert.deepEqual(validate(detailSchema, detail), []);
  assert.equal(checkWorkDetail(detail).ok, true);
  // Only `infra` is a kind; the gate checks the type.
  assert.notDeepEqual(
    validate(overviewSchema, { ...infra, works: [{ ...infra.works[0], kind: 'product' }] }),
    [],
  );
  assert.equal(checkView({ ...infra, works: [{ ...infra.works[0], kind: 3 }] }).ok, false);
  // The gate checks the progress types it reads, but no field of it is required.
  const p = read('../fixtures/view.setup-progress.json');
  const withProgress = (progress: unknown) => ({ ...p, stage: { ...p.stage, progress } });
  assert.equal(checkView(withProgress({})).ok, true);
  assert.equal(checkView(withProgress({ steps: [{ id: 'smoke' }] })).ok, true);
  for (const bad of [
    { overBudget: 'yes' },
    { budgetMs: -1 },
    { since: 'yesterday' },
    { steps: [{ id: 3 }] },
    { steps: [{ id: 'smoke', at: 'now' }] },
    { line: 7 },
  ])
    assert.equal(checkView(withProgress(bad)).ok, false, JSON.stringify(bad));
});

const overviewSchema65 = read('./contract/harness-0.1.0-alpha.65/operator-view.schema.json');
const detailSchema65 = read('./contract/harness-0.1.0-alpha.65/work-detail-view.schema.json');
const harnessEmpty65 = read('./contract/harness-0.1.0-alpha.65/empty-state.view.json');

test('alpha.65 documents (revision 5) stay valid under the alpha.66 schemas and pass the gate', () => {
  assert.equal(harnessEmpty65.data.viewRevision, 5);
  assert.equal(harnessEmpty65.data.source.producerVersion, '0.1.0-alpha.65');
  assert.equal(Object.hasOwn(harnessEmpty65.data.settings, 'decisions'), false);
  assert.deepEqual(validate(overviewSchema65, harnessEmpty65.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty65.data), []);
  const real = checkOverview(harnessEmpty65.data);
  assert.equal(real.ok && !('setup' in real) && real.newerRevision, false);
  for (const [name, doc, schema] of fixtures()) {
    const old = asAlpha65(doc);
    const old65 = schema === overviewSchema ? overviewSchema65 : detailSchema65;
    assert.deepEqual(validate(old65, old), [], name);
    assert.deepEqual(validate(schema, old), [], name);
    const c = schema === overviewSchema ? checkView(old) : checkWorkDetail(old);
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
    assert.equal(c.ok && c.newerRevision, false, name);
  }
  // The alpha.66 empty state carries `settings.decisions`: the alpha.65 schema refuses it.
  assert.match(validate(overviewSchema65, harnessEmpty.data).join(), /unknown field decisions/);
});

test('the demo fixtures really carry the revision 6 fields (the alpha.65 schema refuses them)', () => {
  const docs: [string, Json][] = [
    ['view.sample.json', viewFixture],
    ['ru/view.sample.json', read('../fixtures/ru/view.sample.json')],
  ];
  for (const [name, doc] of docs) {
    assert.equal(doc.viewRevision, 6, name);
    const errors = validate(overviewSchema65, doc).join();
    for (const k of [
      'decisions',
      'track',
      'restoredFrom',
      'planned',
      'lead',
      'resources',
      'previews',
      'approved',
      'release',
      'chain',
    ])
      assert.match(errors, new RegExp(`unknown field ${k}`), `${name}: ${k}`);
    // A track with a lead decision, a waiting diagnosis, a running step and a rework.
    const steps = doc.works.flatMap((w: Json) => w.track.steps);
    assert.ok(
      steps.some((x: Json) => x.kind === 'diagnosis' && x.state === 'decision'),
      name,
    );
    assert.ok(
      steps.some((x: Json) => x.kind === 'diagnosis' && x.state === 'waiting'),
      name,
    );
    assert.ok(
      steps.some((x: Json) => x.state === 'current'),
      name,
    );
    assert.ok(
      steps.some((x: Json) => x.rework !== undefined),
      name,
    );
    // Harness 5496b33: the steps a running attempt has not reached are `planned`, not `skipped`.
    for (const w of doc.works as Json[]) {
      const st: Json[] = w.track.steps;
      st.forEach((x, i) => {
        if (x.state !== 'current') return;
        for (const y of st.slice(i + 1).filter((y) => y.attempt === x.attempt))
          assert.equal(y.state, 'planned', `${name}: ${w.id} attempt ${x.attempt}`);
      });
    }
    // A held gate: the resources list and its line first, the lead's stop on the work.
    assert.deepEqual(doc.resources.gates.held, [
      { repositoryId: 'app', gate: 'e2e', workId: 'import-csv' },
    ]);
    assert.equal(doc.resources.lines[0], doc.resources.gates.heldLine);
    assert.ok(
      doc.works
        .find((w: Json) => w.id === 'import-csv')
        .blockers.some((b: Json) => b.code === 'ENVIRONMENT_GATE_HELD' && b.actor === 'lead'),
    );
    assert.doesNotMatch(doc.lead.line, /UTC|\d\d:\d\d/);
    // The waiting diagnosis is the lead's move, never the operator's.
    const diag = doc.works.find((w: Json) => w.id === 'import-csv');
    assert.deepEqual(diag.stage.needs, { actor: 'lead', action: 'diagnose' });
    assert.equal(diag.blockers[0].code, 'DIAGNOSIS_REQUIRED');
    assert.equal(diag.blockers[0].actor, 'lead');
  }
  for (const f of ['work.diagnosis.sample.json', 'ru/work.diagnosis.sample.json']) {
    const d = read('../fixtures/' + f);
    assert.deepEqual(validate(detailSchema, d), [], f);
    assert.notDeepEqual(validate(detailSchema65, d), [], f);
    assert.equal(checkWorkDetail(d).ok, true, f);
  }
});

test('alpha.62 documents (revision 4) stay valid under the alpha.65 schemas and pass the gate', () => {
  assert.equal(harnessEmpty62.data.viewRevision, 4);
  assert.equal(harnessEmpty62.data.source.producerVersion, '0.1.0-alpha.62');
  assert.equal(Object.hasOwn(harnessEmpty62.data, 'stage'), false);
  assert.deepEqual(validate(overviewSchema62, harnessEmpty62.data), []);
  assert.deepEqual(validate(overviewSchema, harnessEmpty62.data), []);
  const real = checkOverview(harnessEmpty62.data);
  assert.equal(real.ok && !('setup' in real) && real.newerRevision, false);
  // Fixtures without revision 5 fields are alpha.62 documents too.
  for (const [name, doc, schema] of fixtures()) {
    const old62 = schema === overviewSchema ? overviewSchema62 : detailSchema62;
    assert.deepEqual(validate(old62, asAlpha62(doc)), [], name);
    const c =
      schema === overviewSchema ? checkView(asAlpha62(doc)) : checkWorkDetail(asAlpha62(doc));
    assert.equal(c.ok, true, `${name}: ${c.ok ? '' : c.message}`);
  }
  // The alpha.65 empty state really carries `stage`: the alpha.62 schema refuses it.
  assert.match(validate(overviewSchema62, harnessEmpty.data).join(), /unknown field stage/);
  // Revision 5 fixtures carry the new fields, which the alpha.62 schema refuses.
  for (const f of ['view.release.json', 'view.finished.json']) {
    const doc = read('../fixtures/' + f);
    assert.deepEqual(validate(overviewSchema, doc), [], f);
    assert.notDeepEqual(validate(overviewSchema62, doc), [], f);
    const c = checkView(doc);
    assert.equal(c.ok, true, `${f}: ${c.ok ? '' : c.message}`);
  }
  const setupFixture = read('../fixtures/view.setup.json');
  assert.deepEqual(validate(setupSchema, setupFixture), []);
  assert.equal(checkOverview(setupFixture).ok, true);
  // The gate checks the revision 5 fields' types.
  const release = read('../fixtures/view.release.json');
  for (const bad of [
    { ...release, sourceReviews: [{ ...release.sourceReviews[0], tasks: 'WEB-1' }] },
    { ...release, stage: { name: 'work', lines: 'x' } },
    {
      ...release,
      forecast: {
        ...release.forecast,
        time: {
          ...release.forecast.time,
          rough: { loMs: -1, hiMs: 2, samples: 1, attemptsPerTask: 1 },
        },
      },
    },
    {
      ...release,
      forecast: {
        ...release.forecast,
        progress: { ...release.forecast.progress, added: [{ key: 'WEB-3' }] },
      },
    },
  ])
    assert.equal(checkView(bad).ok, false);
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
  assert.equal(real.ok, true, real.ok ? '' : real.message);
  assert.equal(real.ok && real.newerRevision, false);
  const now = checkView(harnessEmpty.data);
  assert.equal(now.ok, true, now.ok ? '' : now.message);
  // The gate checks the new fields' types.
  for (const bad of [
    { ...harnessEmpty.data, scopeReason: 5 },
    {
      ...harnessEmpty.data,
      progress: {
        ...harnessEmpty.data.progress,
        queue: { ...harnessEmpty.data.progress.queue, neverRun: 'yes' },
      },
    },
  ])
    assert.equal(checkView(bad).ok, false);
  // Without their revision 6 fields the fixtures carry no alpha.62 field: alpha.60 documents too.
  for (const [name, doc, schema] of fixtures()) {
    const old60 = schema === overviewSchema ? overviewSchema60 : detailSchema60;
    assert.deepEqual(validate(old60, asAlpha65(doc)), [], name);
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
    // Seeded with the alpha.61 truncation keys: the transform drops them too.
    const old = asAlpha59(
      schema === overviewSchema ? { ...doc, truncated: { workFields: 2, whatsNew: 1 } } : doc,
    );
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
  for (const doc of [
    asAlpha65(viewFixture),
    asAlpha65(read('../fixtures/ru/view.sample.json')),
    stopped,
  ]) {
    assert.ok(doc.viewRevision >= 4);
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
    assert.equal(d.viewRevision, 6, f);
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
    assert.equal(doc.viewRevision, 6, name);
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
  const noLines = { ...harnessSetup.data, stage: { name: 'setup', lines: [] } };
  assert.match(validate(setupSchema, noLines).join(), /stage\.lines: too few items/);
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
    // Several non-null branches (`settings.decisions.items[].value`): their kinds, sorted.
    const kinds = parts.map((x) => schemaKind(x)).sort();
    return kinds.join('|') + (parts.length < n.anyOf.length ? '|null' : '');
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
      sourceReviews: 'opt:a<o>',
      stage: 'opt:o',
      forecast: 'opt:o',
      updates: 'opt:o',
      planned: 'opt:a<o>',
      lead: 'opt:o',
      resources: 'opt:o',
      previews: 'opt:a<o>',
      truncated: 'opt:o',
    }),
  ],
  [
    'sourceReviews[]',
    overviewSchema[ov].sourceReviews.items,
    shape<SourceReview>({
      connector: 'req:s',
      provider: 'req:s',
      tasks: 'req:a<o>',
      line: 'req:s',
    }),
  ],
  [
    'sourceReviews[].tasks[]',
    overviewSchema[ov].sourceReviews.items[ov].tasks.items,
    shape<SourceReview['tasks'][number]>({
      taskId: 'req:s',
      key: 'opt:s',
      workId: 'req:s',
      column: 'req:s',
      since: 'req:s',
    }),
  ],
  [
    'stage',
    overviewSchema[ov].stage,
    shape<NonNullable<OperatorView['stage']>>({
      name: 'req:s',
      lines: 'req:a<s>',
      progress: 'opt:o',
    }),
  ],
  [
    'stage.progress',
    overviewSchema[ov].stage[ov].progress,
    shape<SetupProgressView>({
      since: 'opt:s',
      elapsedMs: 'opt:n',
      budgetMs: 'req:n',
      overBudget: 'req:b',
      steps: 'req:a<o>',
      line: 'req:s',
      lineEn: 'req:s',
    }),
  ],
  [
    'stage.progress.steps[]',
    overviewSchema[ov].stage[ov].progress[ov].steps.items,
    shape<SetupStepView>({
      id: 'req:s',
      state: 'req:s',
      at: 'opt:s',
      elapsedMs: 'opt:n',
      line: 'req:s',
      lineEn: 'req:s',
    }),
  ],
  [
    'SetupView',
    setupSchema,
    shape<SetupView>({
      viewVersion: 'req:n',
      viewRevision: 'req:n',
      generatedAt: 'req:s',
      source: 'req:o',
      stage: 'req:o',
      setup: 'req:o',
    }),
  ],
  [
    'SetupView.stage',
    setupSchema[ov].stage,
    shape<SetupView['stage']>({ name: 'req:s', lines: 'req:a<s>', progress: 'opt:o' }),
  ],
  ['SetupView.setup', setupSchema[ov].setup, shape<SetupView['setup']>({ waitingFor: 'req:s' })],
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
      decisions: 'opt:o',
      harnessMode: 'opt:o',
    }),
  ],
  [
    'settings.decisions',
    overviewSchema[ov].settings[ov].decisions,
    shape<DecisionSettingsView>({ items: 'req:a<o>', summary: 'req:o', warning: 'opt:o' }),
  ],
  [
    'settings.decisions.items[]',
    overviewSchema[ov].settings[ov].decisions[ov].items.items,
    {
      ...shape<Omit<DecisionSettingsView['items'][number], 'value'>>({
        key: 'req:s',
        source: 'req:s',
        explain: 'req:o',
      }),
      // A number, a boolean or a string: the TS union, three schema branches.
      value: 'req:b|n|s',
    },
  ],
  [
    'settings.decisions.items[].explain',
    overviewSchema[ov].settings[ov].decisions[ov].items.items[ov].explain,
    shape<Bilingual>({ ru: 'req:s', en: 'req:s' }),
  ],
  [
    'settings.decisions.summary',
    overviewSchema[ov].settings[ov].decisions[ov].summary,
    shape<Bilingual>({ ru: 'req:s', en: 'req:s' }),
  ],
  [
    'settings.decisions.warning',
    overviewSchema[ov].settings[ov].decisions[ov].warning,
    shape<Bilingual>({ ru: 'req:s', en: 'req:s' }),
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
      reviewRoundsUnlimited: 'opt:b',
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
      planned: 'opt:b',
      restoredFrom: 'opt:s',
      restoredLine: 'opt:s',
      kind: 'opt:s',
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
      track: 'opt:o',
      reopened: 'opt:o',
      attemptReviews: 'opt:a<o>',
    }),
  ],
  [
    'works[].reopened',
    overviewSchema[ov].works.items[ov].reopened,
    shape<ReopenedView>({
      at: 'req:s',
      by: 'opt:s',
      revision: 'req:n',
      budget: 'req:s',
      acceptedSha: 'req:s',
      spent: 'req:n',
      reason: 'req:s',
    }),
  ],
  [
    'works[].attemptReviews[]',
    overviewSchema[ov].works.items[ov].attemptReviews.items,
    shape<AttemptReviewResult>({
      attempt: 'req:n',
      phase: 'req:s',
      verdict: 'req:s',
      findings: 'req:n',
      notes: 'req:n',
      at: 'req:s',
      earlier: 'opt:b',
    }),
  ],
  [
    'works[].track',
    overviewSchema[ov].works.items[ov].track,
    shape<WorkTrack>({ steps: 'req:a<o>', truncated: 'opt:n' }),
  ],
  [
    'works[].track.steps[]',
    overviewSchema[ov].works.items[ov].track[ov].steps.items,
    shape<TrackStep>({
      kind: 'req:s',
      attempt: 'opt:n',
      state: 'req:s',
      label: 'req:s',
      at: 'opt:s',
      reason: 'opt:s',
      rework: 'opt:n',
      actor: 'opt:s',
      required: 'opt:b',
    }),
  ],
  [
    'works[].attempts.rework',
    overviewSchema[ov].works.items[ov].attempts[ov].rework,
    shape<NonNullable<WorkView['attempts']['rework']>>({
      revision: 'req:n',
      fresh: 'req:b',
      acceptedSha: 'req:s',
      acceptedAt: 'opt:s',
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
      runs: 'opt:n',
      rework: 'opt:o',
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
    'reviews[].rounds',
    overviewSchema[ov].reviews.items[ov].rounds,
    shape<ReviewSubjectView['rounds']>({
      used: 'req:n',
      max: 'req:n|null',
      remaining: 'opt:n|null',
      free: 'opt:n',
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
    shape<ForecastView>({
      progress: 'req:o',
      time: 'req:o',
      outline: 'opt:o',
      assumptions: 'req:a<s>',
    }),
  ],
  [
    'forecast.outline',
    overviewSchema[ov].forecast[ov].outline,
    shape<ForecastOutlineView>({
      state: 'req:s',
      code: 'opt:s',
      revision: 'opt:n',
      recordedAt: 'opt:s',
      units: 'opt:n',
      registered: 'opt:n',
      unregistered: 'opt:n',
      beyond: 'opt:n',
      stages: 'opt:a<o>',
      line: 'req:s',
    }),
  ],
  [
    'forecast.outline.stages[]',
    overviewSchema[ov].forecast[ov].outline[ov].stages.items,
    shape<OutlineStageView>({
      id: 'req:s',
      title: 'opt:s',
      kind: 'req:s',
      state: 'req:s',
      units: 'req:n',
      registered: 'req:n',
      percent: 'req:n',
      components: 'req:a<o>',
    }),
  ],
  [
    'forecast.outline.stages[].components[]',
    overviewSchema[ov].forecast[ov].outline[ov].stages.items[ov].components.items,
    shape<OutlineComponentView>({
      id: 'req:s',
      title: 'opt:s',
      size: 'opt:s',
      tasks: 'opt:n',
      actor: 'req:s',
      state: 'req:s',
      units: 'req:n',
      registered: 'req:n',
      percent: 'req:n',
      works: 'opt:a<s>',
    }),
  ],
  [
    'forecast.progress.growth',
    overviewSchema[ov].forecast[ov].progress[ov].growth,
    shape<ForecastGrowthView>({
      at: 'req:s',
      added: 'req:a<s>',
      before: 'req:n',
      after: 'req:n',
      by: 'req:s',
      reason: 'opt:s',
      line: 'req:s',
    }),
  ],
  [
    'forecast.progress.infraShare',
    overviewSchema[ov].forecast[ov].progress[ov].infraShare,
    shape<NonNullable<ForecastView['progress']['infraShare']>>({ share: 'req:n', line: 'req:s' }),
  ],
  [
    'forecast.progress.works[].stageProgress',
    overviewSchema[ov].forecast[ov].progress[ov].works.items[ov].stageProgress,
    shape<StageProgressView>({
      stage: 'req:s',
      from: 'req:n',
      to: 'req:n',
      since: 'opt:s',
      typicalMs: 'opt:n',
      samples: 'opt:n',
    }),
  ],
  [
    'forecast.time.outline',
    overviewSchema[ov].forecast[ov].time[ov].outline,
    shape<NonNullable<ForecastView['time']['outline']>>({
      units: 'req:n',
      ownerUnits: 'opt:n',
      loMs: 'opt:n',
      hiMs: 'opt:n',
      basis: 'req:s',
      line: 'req:s',
    }),
  ],
  [
    'forecast.time.finishing',
    overviewSchema[ov].forecast[ov].time[ov].finishing,
    shape<NonNullable<ForecastView['time']['finishing']>>({
      since: 'opt:s',
      elapsedMs: 'opt:n',
      exceeded: 'opt:b',
    }),
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
      added: 'opt:a<o>',
      works: 'opt:a<o>',
      rework: 'opt:n',
      growth: 'opt:o',
      conditional: 'opt:b',
      infraShare: 'opt:o',
      planned: 'opt:o',
      approved: 'opt:o',
      lead: 'opt:o',
      release: 'opt:o',
    }),
  ],
  [
    'forecast.progress.planned',
    overviewSchema[ov].forecast[ov].progress[ov].planned,
    shape<NonNullable<ForecastView['progress']['planned']>>({
      count: 'req:n',
      keys: 'req:a<s>',
      line: 'req:s',
    }),
  ],
  [
    'forecast.progress.approved',
    overviewSchema[ov].forecast[ov].progress[ov].approved,
    shape<NonNullable<ForecastView['progress']['approved']>>({
      percent: 'req:n',
      total: 'req:n',
      done: 'req:n',
      left: 'req:n',
      loMs: 'opt:n',
      hiMs: 'opt:n',
    }),
  ],
  [
    'forecast.progress.lead',
    overviewSchema[ov].forecast[ov].progress[ov].lead,
    shape<NonNullable<ForecastView['progress']['lead']>>({
      steps: 'req:a<o>',
      weighted: 'req:n',
      total: 'req:n',
    }),
  ],
  [
    'forecast.progress.lead.steps[]',
    overviewSchema[ov].forecast[ov].progress[ov].lead[ov].steps.items,
    shape<NonNullable<ForecastView['progress']['lead']>['steps'][number]>({
      step: 'req:s',
      weight: 'req:n',
      done: 'req:b',
    }),
  ],
  [
    'forecast.progress.release',
    overviewSchema[ov].forecast[ov].progress[ov].release,
    shape<NonNullable<ForecastView['progress']['release']>>({
      state: 'req:s',
      doneAt: 'opt:s',
      summary: 'opt:s',
      line: 'req:s',
      review: 'opt:o',
    }),
  ],
  [
    'forecast.progress.release.review',
    overviewSchema[ov].forecast[ov].progress[ov].release[ov].review,
    shape<ReleaseReviewView>({
      required: 'req:b',
      status: 'req:s',
      round: 'opt:n',
      open: 'opt:n',
      blocking: 'opt:n',
      base: 'opt:s',
      baseSource: 'opt:s',
      head: 'opt:s',
      target: 'opt:s',
      at: 'opt:s',
      line: 'req:s',
    }),
  ],
  [
    'settings.harnessMode',
    overviewSchema[ov].settings[ov].harnessMode,
    shape<HarnessModeView>({ mode: 'req:s', default: 'req:b', writeGuard: 'req:b' }),
  ],
  [
    'forecast.time.lead',
    overviewSchema[ov].forecast[ov].time[ov].lead,
    shape<NonNullable<ForecastView['time']['lead']>>({
      ms: 'req:n',
      samples: 'req:n',
      line: 'req:s',
    }),
  ],
  [
    'planned[]',
    overviewSchema[ov].planned.items,
    shape<PlannedTaskView>({
      id: 'req:s',
      connector: 'req:s',
      taskId: 'req:s',
      key: 'opt:s',
      title: 'opt:s',
      status: 'req:s',
      from: 'req:s',
      graphId: 'opt:s',
      dependsOn: 'opt:a<s>',
      line: 'req:s',
    }),
  ],
  [
    'lead',
    overviewSchema[ov].lead,
    shape<LeadView>({
      active: 'req:b',
      since: 'opt:s',
      until: 'opt:s',
      endedAt: 'opt:s',
      lastNote: 'opt:o',
      notes: 'req:a<o>',
      line: 'req:s',
    }),
  ],
  [
    'lead.lastNote',
    overviewSchema[ov].lead[ov].lastNote,
    shape<NonNullable<LeadView['lastNote']>>({ at: 'req:s', plain: 'req:s' }),
  ],
  [
    'lead.notes[]',
    overviewSchema[ov].lead[ov].notes.items,
    shape<LeadView['notes'][number]>({
      at: 'req:s',
      kind: 'req:s',
      action: 'req:s',
      workId: 'opt:s',
      plain: 'req:s',
    }),
  ],
  [
    'resources',
    overviewSchema[ov].resources,
    shape<ResourcesView>({
      roles: 'req:a<o>',
      isolation: 'req:o',
      toolchain: 'req:o',
      dependencyStore: 'req:o',
      services: 'req:a<o>',
      gates: 'req:o',
      lines: 'req:a<s>',
      truncated: 'opt:o',
    }),
  ],
  [
    'resources.roles[]',
    overviewSchema[ov].resources[ov].roles.items,
    shape<ResourcesView['roles'][number]>({
      role: 'req:s',
      kind: 'req:s',
      review: 'opt:s',
      alternate: 'opt:b',
      runtime: 'req:s',
      vendor: 'req:s',
      model: 'opt:s',
      effort: 'opt:s',
      repositoryId: 'opt:s',
      network: 'opt:s',
      line: 'req:s',
    }),
  ],
  [
    'resources.isolation',
    overviewSchema[ov].resources[ov].isolation,
    shape<ResourcesView['isolation']>({
      sandbox: 'req:s',
      writers: 'req:s',
      gates: 'req:s',
      domains: 'req:n',
      line: 'req:s',
    }),
  ],
  [
    'resources.toolchain',
    overviewSchema[ov].resources[ov].toolchain,
    shape<ResourcesView['toolchain']>({ tools: 'req:a<o>', line: 'req:s' }),
  ],
  [
    'resources.toolchain.tools[]',
    overviewSchema[ov].resources[ov].toolchain[ov].tools.items,
    shape<ResourcesView['toolchain']['tools'][number]>({
      name: 'req:s',
      version: 'req:s',
      repositoryId: 'opt:s',
    }),
  ],
  [
    'resources.dependencyStore',
    overviewSchema[ov].resources[ov].dependencyStore,
    shape<ResourcesView['dependencyStore']>({
      state: 'req:s',
      repositories: 'req:a<o>',
      line: 'req:s',
    }),
  ],
  [
    'resources.dependencyStore.repositories[]',
    overviewSchema[ov].resources[ov].dependencyStore[ov].repositories.items,
    shape<ResourcesView['dependencyStore']['repositories'][number]>({
      repositoryId: 'req:s',
      manager: 'req:s',
      seeds: 'opt:n',
    }),
  ],
  [
    'resources.services[]',
    overviewSchema[ov].resources[ov].services.items,
    shape<ResourcesView['services'][number]>({
      repositoryId: 'req:s',
      name: 'req:s',
      engine: 'opt:s',
      scope: 'req:s',
      running: 'req:n',
      stopped: 'req:n',
      leftover: 'req:n',
      since: 'opt:s',
      leftoverRuns: 'opt:a<s>',
      line: 'req:s',
    }),
  ],
  [
    'resources.gates',
    overviewSchema[ov].resources[ov].gates,
    shape<ResourcesView['gates']>({
      total: 'req:n',
      workspace: 'req:n',
      repositories: 'req:a<o>',
      line: 'req:s',
      held: 'opt:a<o>',
      heldLine: 'opt:s',
    }),
  ],
  [
    'resources.gates.held[]',
    overviewSchema[ov].resources[ov].gates[ov].held.items,
    shape<NonNullable<ResourcesView['gates']['held']>[number]>({
      repositoryId: 'req:s',
      gate: 'req:s',
      workId: 'req:s',
      cause: 'opt:s',
    }),
  ],
  [
    'resources.gates.repositories[]',
    overviewSchema[ov].resources[ov].gates[ov].repositories.items,
    shape<ResourcesView['gates']['repositories'][number]>({
      repositoryId: 'req:s',
      count: 'req:n',
    }),
  ],
  [
    'resources.truncated',
    overviewSchema[ov].resources[ov].truncated,
    shape<NonNullable<ResourcesView['truncated']>>({
      roles: 'opt:n',
      tools: 'opt:n',
      services: 'opt:n',
      receipts: 'opt:n',
    }),
  ],
  [
    'previews[]',
    overviewSchema[ov].previews.items,
    shape<PreviewView>({
      id: 'req:s',
      repositoryId: 'req:s',
      title: 'opt:s',
      url: 'req:s',
      ref: 'req:s',
      sha: 'req:s',
      workId: 'opt:s',
      startedAt: 'req:s',
      expiresAt: 'req:s',
      state: 'req:s',
    }),
  ],
  [
    'forecast.progress.added[]',
    overviewSchema[ov].forecast[ov].progress[ov].added.items,
    shape<NonNullable<ForecastView['progress']['added']>[number]>({
      key: 'req:s',
      workId: 'opt:s',
      at: 'req:s',
      before: 'req:n',
      after: 'req:n',
      line: 'req:s',
    }),
  ],
  [
    'forecast.progress.works[]',
    overviewSchema[ov].forecast[ov].progress[ov].works.items,
    shape<NonNullable<ForecastView['progress']['works']>[number]>({
      workId: 'req:s',
      key: 'opt:s',
      percent: 'req:n',
      attempt: 'opt:o',
      retry: 'opt:s',
      rework: 'opt:b',
      stageProgress: 'opt:o',
      line: 'req:s',
    }),
  ],
  [
    'forecast.progress.works[].attempt',
    overviewSchema[ov].forecast[ov].progress[ov].works.items[ov].attempt,
    shape<NonNullable<NonNullable<ForecastView['progress']['works']>[number]['attempt']>>({
      n: 'req:n',
      max: 'req:n',
    }),
  ],
  [
    'forecast.time',
    overviewSchema[ov].forecast[ov].time,
    shape<ForecastView['time']>({
      startedAt: 'opt:s',
      elapsedMs: 'opt:n',
      finishedAt: 'opt:s',
      remaining: 'opt:o',
      rough: 'opt:o',
      estimate: 'opt:s',
      chain: 'opt:n',
      lead: 'opt:o',
      humanWait: 'req:o',
      outline: 'opt:o',
      finishing: 'opt:o',
      line: 'req:s',
    }),
  ],
  [
    'forecast.time.rough',
    overviewSchema[ov].forecast[ov].time[ov].rough,
    shape<NonNullable<ForecastView['time']['rough']>>({
      loMs: 'req:n',
      hiMs: 'req:n',
      samples: 'req:n',
      attemptsPerTask: 'req:n',
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
      sourceReviews: 'opt:n',
      forecastWorks: 'opt:n',
      planned: 'opt:n',
      leadNotes: 'opt:n',
      resources: 'opt:n',
      previews: 'opt:n',
      attemptReviews: 'opt:n',
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
      attemptReviews: 'opt:n',
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
    vocab<ReviewSubjectView['kind']>()(['plan', 'contract', 'code', 'release']),
  ],
  [
    'resources.gates.held[].cause',
    overviewSchema[ov].resources[ov].gates[ov].held.items[ov].cause,
    vocab<HeldGateCause>()([
      'sandbox-process-list',
      'sandbox-signal',
      'sandbox-browser',
      'gate-definition',
    ]),
  ],
  [
    'forecast.progress.release.review.status',
    overviewSchema[ov].forecast[ov].progress[ov].release[ov].review[ov].status,
    vocab<ReleaseReviewView['status']>()(['not-run', 'stale', 'findings', 'approved']),
  ],
  [
    'forecast.progress.release.review.baseSource',
    overviewSchema[ov].forecast[ov].progress[ov].release[ov].review[ov].baseSource,
    vocab<NonNullable<ReleaseReviewView['baseSource']>>()(['register', 'outline', 'attempt']),
  ],
  [
    'settings.harnessMode.mode',
    overviewSchema[ov].settings[ov].harnessMode[ov].mode,
    vocab<HarnessModeView['mode']>()(['light', 'strict']),
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
    'forecast.time.estimate',
    overviewSchema[ov].forecast[ov].time[ov].estimate,
    vocab<NonNullable<ForecastView['time']['estimate']>>()([
      'precise',
      'rough',
      'unknown',
      'nothing',
    ]),
  ],
  [
    'forecast.progress.works[].retry',
    overviewSchema[ov].forecast[ov].progress[ov].works.items[ov].retry,
    vocab<NonNullable<NonNullable<ForecastView['progress']['works']>[number]['retry']>>()([
      'repair',
      'answer',
    ]),
  ],
  [
    'stage.name',
    overviewSchema[ov].stage[ov].name,
    vocab<NonNullable<OperatorView['stage']>['name']>()(['setup', 'work']),
  ],
  [
    'SetupView.setup.waitingFor',
    setupSchema[ov].setup[ov].waitingFor,
    vocab<SetupView['setup']['waitingFor']>()(['project', 'policy']),
  ],
  [
    'settings.decisions.items[].key',
    overviewSchema[ov].settings[ov].decisions[ov].items.items[ov].key,
    vocab<DecisionSettingsView['items'][number]['key']>()([
      'maxAttempts',
      'recovery.mode',
      'recovery.diagnoseAfter',
      'recovery.leadResets',
      'inputPolicy.leadAnswers.technical',
    ]),
  ],
  [
    'settings.decisions.items[].source',
    overviewSchema[ov].settings[ov].decisions[ov].items.items[ov].source,
    vocab<DecisionSettingsView['items'][number]['source']>()(['policy', 'derived', 'default']),
  ],
  [
    'works[].track.steps[].kind',
    overviewSchema[ov].works.items[ov].track[ov].steps.items[ov].kind,
    vocab<TrackStep['kind']>()([
      'code',
      'checks',
      'review',
      'integration',
      'question',
      'diagnosis',
      'reset',
      'user-decision',
      'accepted',
    ]),
  ],
  [
    'works[].track.steps[].state',
    overviewSchema[ov].works.items[ov].track[ov].steps.items[ov].state,
    vocab<TrackStep['state']>()([
      'planned',
      'current',
      'passed',
      'failed',
      'waiting',
      'skipped',
      'decision',
    ]),
  ],
  [
    'works[].track.steps[].actor',
    overviewSchema[ov].works.items[ov].track[ov].steps.items[ov].actor,
    vocab<NonNullable<TrackStep['actor']>>()(['lead', 'user', 'harness']),
  ],
  [
    'planned[].from',
    overviewSchema[ov].planned.items[ov].from,
    vocab<PlannedTaskView['from']>()(['validated', 'read']),
  ],
  [
    'forecast.progress.lead.steps[].step',
    overviewSchema[ov].forecast[ov].progress[ov].lead[ov].steps.items[ov].step,
    vocab<NonNullable<ForecastView['progress']['lead']>['steps'][number]['step']>()([
      'plan',
      'questions',
      'delivery',
      'report',
    ]),
  ],
  [
    'forecast.progress.release.state',
    overviewSchema[ov].forecast[ov].progress[ov].release[ov].state,
    vocab<NonNullable<ForecastView['progress']['release']>['state']>()([
      'in-work',
      'code-accepted',
      'done',
    ]),
  ],
  [
    'resources.roles[].kind',
    overviewSchema[ov].resources[ov].roles.items[ov].kind,
    vocab<ResourcesView['roles'][number]['kind']>()(['writer', 'reviewer', 'lead']),
  ],
  [
    'resources.roles[].network',
    overviewSchema[ov].resources[ov].roles.items[ov].network,
    vocab<NonNullable<ResourcesView['roles'][number]['network']>>()([
      'closed',
      'loopback',
      'domains',
      'open',
      'mixed',
    ]),
  ],
  [
    'resources.isolation.sandbox',
    overviewSchema[ov].resources[ov].isolation[ov].sandbox,
    vocab<ResourcesView['isolation']['sandbox']>()(['os', 'none']),
  ],
  [
    'resources.dependencyStore.state',
    overviewSchema[ov].resources[ov].dependencyStore[ov].state,
    vocab<ResourcesView['dependencyStore']['state']>()(['on', 'off', 'partial']),
  ],
  [
    'resources.services[].scope',
    overviewSchema[ov].resources[ov].services.items[ov].scope,
    vocab<ResourcesView['services'][number]['scope']>()(['attempt', 'workspace']),
  ],
  [
    'previews[].state',
    overviewSchema[ov].previews.items[ov].state,
    vocab<PreviewView['state']>()(['running']),
  ],
  [
    'stage.progress.steps[].id',
    overviewSchema[ov].stage[ov].progress[ov].steps.items[ov].id,
    vocab<SetupStepView['id']>()([
      'profile',
      'init',
      'doctor',
      'smoke',
      'probe',
      'gates',
      'connector',
    ]),
  ],
  [
    'stage.progress.steps[].state',
    overviewSchema[ov].stage[ov].progress[ov].steps.items[ov].state,
    vocab<SetupStepView['state']>()(['done', 'failed', 'pending', 'skipped', 'unknown']),
  ],
  [
    'setup document stage.progress.steps[].id',
    setupSchema[ov].stage[ov].progress[ov].steps.items[ov].id,
    vocab<SetupStepView['id']>()([
      'profile',
      'init',
      'doctor',
      'smoke',
      'probe',
      'gates',
      'connector',
    ]),
  ],
  [
    'works[].reopened.by',
    overviewSchema[ov].works.items[ov].reopened[ov].by,
    vocab<NonNullable<ReopenedView['by']>>()(['lead', 'operator']),
  ],
  [
    'works[].reopened.budget',
    overviewSchema[ov].works.items[ov].reopened[ov].budget,
    vocab<ReopenedView['budget']>()(['fresh', 'carried']),
  ],
  [
    'works[].attemptReviews[].phase',
    overviewSchema[ov].works.items[ov].attemptReviews.items[ov].phase,
    vocab<AttemptReviewResult['phase']>()(['candidate', 'integration']),
  ],
  [
    'works[].attemptReviews[].verdict',
    overviewSchema[ov].works.items[ov].attemptReviews.items[ov].verdict,
    vocab<AttemptReviewResult['verdict']>()(['approved', 'rejected', 'invalid']),
  ],
  [
    'forecast.progress.works[].stageProgress.stage',
    overviewSchema[ov].forecast[ov].progress[ov].works.items[ov].stageProgress[ov].stage,
    vocab<StageProgressView['stage']>()(['code', 'checks', 'review', 'integration']),
  ],
  [
    'forecast.progress.growth.by',
    overviewSchema[ov].forecast[ov].progress[ov].growth[ov].by,
    vocab<ForecastGrowthView['by']>()(['works', 'outline']),
  ],
  [
    'forecast.time.outline.basis',
    overviewSchema[ov].forecast[ov].time[ov].outline[ov].basis,
    vocab<NonNullable<ForecastView['time']['outline']>['basis']>()(['attempts', 'default']),
  ],
  [
    'forecast.outline.state',
    overviewSchema[ov].forecast[ov].outline[ov].state,
    vocab<ForecastOutlineView['state']>()(['recorded', 'missing']),
  ],
  [
    'forecast.outline.stages[].kind',
    overviewSchema[ov].forecast[ov].outline[ov].stages.items[ov].kind,
    vocab<OutlineStageView['kind']>()(['infra', 'product', 'deploy', 'other']),
  ],
  [
    'forecast.outline.stages[].state',
    overviewSchema[ov].forecast[ov].outline[ov].stages.items[ov].state,
    vocab<OutlineStageView['state']>()(['registered', 'partial', 'unregistered']),
  ],
  [
    'forecast.outline.stages[].components[].size',
    overviewSchema[ov].forecast[ov].outline[ov].stages.items[ov].components.items[ov].size,
    vocab<NonNullable<OutlineComponentView['size']>>()(['S', 'M', 'L']),
  ],
  [
    'forecast.outline.stages[].components[].actor',
    overviewSchema[ov].forecast[ov].outline[ov].stages.items[ov].components.items[ov].actor,
    vocab<OutlineComponentView['actor']>()(['writers', 'environment', 'owner']),
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
    [setupSchema, 'setup'],
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
    for (const f of [
      'operator-view.schema.json',
      'work-detail-view.schema.json',
      'setup-view.schema.json',
    ]) {
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
      // A checkout runs its sources with tsx; an installed package its built CLI.
      const built = !existsSync(join(src, 'src', 'cli.ts'));
      writeFileSync(
        bin,
        built
          ? `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ` +
              `--disable-warning=ExperimentalWarning ${JSON.stringify(join(src, 'lib', 'cli.js'))} "$@"\n`
          : `#!/bin/sh\ncd ${JSON.stringify(src)} && exec ${JSON.stringify(process.execPath)} ` +
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
      // Revision 5: before setup `--repository` gives the setup document, not a refusal.
      if (view.viewRevision >= 5) {
        assert.equal(support.repository, true);
        const repo = join(dir, 'not-set-up');
        mkdirSync(repo);
        const s = await harnessView({ bin, repository: repo, timeoutMs: 60_000 }, 'en');
        assert.equal(s.ok, true, s.ok ? '' : s.message);
        const doc = (s as { view: Json }).view;
        assert.deepEqual(validate(setupSchema, doc), []);
        const c = checkOverview(doc);
        assert.equal(c.ok && 'setup' in c && c.setup.setup.waitingFor, 'project');
        assert.equal(existsSync(join(repo, '.harness')), false, 'view never creates the project');
      }
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
