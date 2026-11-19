import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  KNOWN_VIEW_REVISION,
  checkView,
  formatElapsed,
  formatUsd,
  httpViewSource,
  questionStatus,
  stageLabel,
  staticViewSource,
  type WorkDetailView,
  type WorkView,
} from '../src/model/index.ts';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/view.sample.json', import.meta.url), 'utf8'),
);

test('the sample fixture passes the compatibility gate', () => {
  const check = checkView(fixture);
  assert.equal(check.ok, true);
});

test('a different major view version is refused with a reason', () => {
  const check = checkView({ ...fixture, viewVersion: 2 });
  assert.equal(check.ok, false);
  assert.equal(check.ok ? '' : check.code, 'VIEW_VERSION_UNSUPPORTED');
});

test('revision 1 (harness alpha.56) is known; revision 0 (alpha.55) too; only later ones are newer', () => {
  assert.equal(KNOWN_VIEW_REVISION, 1);
  assert.equal(fixture.viewRevision, 1);
  const c1 = checkView(fixture);
  assert.equal(c1.ok && c1.newerRevision, false);
  const old = structuredClone(fixture);
  old.viewRevision = 0;
  delete old.history.totals;
  for (const q of old.questions) delete q.answerBasis;
  const c0 = checkView(old);
  assert.equal(c0.ok, true, c0.ok ? '' : c0.message);
  assert.equal(c0.ok && c0.newerRevision, false);
  const c2 = checkView({ ...fixture, viewRevision: 2 });
  assert.equal(c2.ok && c2.newerRevision, true);
});

test('a newer revision is accepted and flagged; unknown fields are ignored', () => {
  const check = checkView({ ...fixture, viewRevision: 7, futureSection: { x: 1 } });
  assert.equal(check.ok, true);
  assert.equal(check.ok && check.newerRevision, true);
});

test('a document missing a section is not a view', () => {
  const { health: _health, ...rest } = fixture;
  const check = checkView(rest);
  assert.equal(check.ok ? '' : check.code, 'NOT_A_VIEW');
  assert.equal(checkView(null).ok, false);
  assert.equal(checkView([]).ok, false);
});

test('unknown spend is never shown as zero', () => {
  assert.equal(formatUsd({ value: 0, bound: 'unknown' }), 'unknown');
  assert.equal(formatUsd({ value: 3.4, bound: 'lower' }), '≥ $3.40');
  assert.equal(formatUsd({ value: 1.5, bound: 'exact' }), '$1.50');
});

test('elapsed time and stage labels', () => {
  const t0 = Date.parse('2026-11-19T10:00:00Z');
  assert.equal(formatElapsed('2026-11-19T10:00:00Z', t0 + 9000), '9s');
  assert.equal(formatElapsed('2026-11-19T10:00:00Z', t0 + 252000), '4m 12s');
  assert.equal(formatElapsed('2026-11-19T10:00:00Z', t0 + 3900000), '1h 05m');
  assert.equal(stageLabel('gates'), 'Checks');
  assert.equal(stageLabel('some-future-stage'), 'some-future-stage');
});

test('history series are aligned to the bucket count', () => {
  const h = fixture.history;
  const buckets = (Date.parse(h.to) - Date.parse(h.from)) / h.bucketMs;
  for (const key of [
    'load',
    'attemptsStarted',
    'attemptsFailed',
    'gatesPassed',
    'gatesFailed',
    'gatesReused',
    'spendUsd',
  ]) {
    assert.equal(h[key].length, buckets, key);
  }
});

test('staticViewSource returns the checked view', async () => {
  const check = await staticViewSource(fixture).load();
  assert.equal(check.ok, true);
});

test('empty or malformed sections are refused before render', () => {
  for (const broken of [
    { ...fixture, progress: {} },
    { ...fixture, health: { ...fixture.health, budgets: [{}] } },
    { ...fixture, works: [{ id: 'x' }] },
    { ...fixture, questions: [{ requestId: 'q' }] },
    { ...fixture, viewRevision: -1 },
    { ...fixture, source: {} },
  ]) {
    const check = checkView(broken);
    assert.equal(check.ok, false);
    assert.equal(check.ok ? '' : check.code, 'NOT_A_VIEW');
  }
});

test('unknown values from a newer producer read conservatively', () => {
  assert.equal(formatUsd({ value: 5, bound: 'estimated' as never }), 'unknown');
  assert.equal(stageLabel('__proto__'), '__proto__');
  assert.equal(stageLabel('toString'), 'toString');
  const q = { state: 'awaiting-answer', answerableBy: 'someone-new' as never };
  assert.match(questionStatus(q).text, /Only you/);
  assert.equal(questionStatus({ state: 'mystery', answerableBy: 'operator' }).needsAnswer, false);
});

test('only awaiting-answer asks the operator for an answer', () => {
  const states = ['answered-not-applied', 'applied-awaiting-claim', 'delivered', 'carry-stale'];
  for (const state of states) {
    assert.equal(questionStatus({ state, answerableBy: 'operator' }).needsAnswer, false, state);
  }
  assert.equal(
    questionStatus({ state: 'awaiting-answer', answerableBy: 'operator' }).needsAnswer,
    true,
  );
});

test('httpViewSource keeps a typed 409 refusal and its message', async () => {
  const fake = (async () =>
    new Response(
      JSON.stringify({ error: { code: 'VIEW_VERSION_UNSUPPORTED', message: 'install 0.2' } }),
      { status: 409 },
    )) as typeof fetch;
  const check = await httpViewSource('http://127.0.0.1:1/', fake).load();
  assert.equal(check.ok, false);
  assert.equal(check.ok ? '' : check.message, 'install 0.2');
  const down = (async () => new Response('x', { status: 500 })) as typeof fetch;
  await assert.rejects(httpViewSource('http://127.0.0.1:1/', down).load());
});

test('language: Russian locales map to ru, everything else to en; plurals', async () => {
  const { langOf, ruPlural } = await import('../src/model/i18n.ts');
  for (const tag of ['ru', 'ru-RU', 'ru_RU.UTF-8', 'RU']) assert.equal(langOf(tag), 'ru');
  for (const tag of ['en-US', 'rus', '', undefined, null, 'C']) assert.equal(langOf(tag), 'en');
  const f = ['вопрос', 'вопроса', 'вопросов'] as const;
  assert.deepEqual(
    [1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => ruPlural(n, f)),
    [
      'вопрос',
      'вопроса',
      'вопросов',
      'вопросов',
      'вопросов',
      'вопрос',
      'вопроса',
      'вопросов',
      'вопросов',
    ],
  );
});

test('language: ?lang= wins only for ru|en; otherwise the first browser locale', async () => {
  const { pickLang } = await import('../src/model/i18n.ts');
  assert.equal(pickLang('en', ['ru-RU']), 'en');
  assert.equal(pickLang('RU', ['en-US']), 'ru');
  assert.equal(pickLang('', ['ru-RU', 'en']), 'ru');
  assert.equal(pickLang('xx', ['ru']), 'ru');
  assert.equal(pickLang(null, ['', 'ru-RU']), 'ru');
  assert.equal(pickLang(null, ['uk-UA', 'ru']), 'en');
  assert.equal(pickLang(undefined, []), 'en');
});

test('Russian plurals: 0, 3, 4, 14, 101, 112, 1001', async () => {
  const { ruPlural } = await import('../src/model/i18n.ts');
  const f = ['решение', 'решения', 'решений'] as const;
  assert.deepEqual(
    [0, 3, 4, 14, 101, 112, 1001].map((n) => ruPlural(n, f)),
    ['решений', 'решения', 'решения', 'решений', 'решение', 'решений', 'решение'],
  );
});

test('the gate refuses a missing or non-count progress.byStage', () => {
  const { byStage: _b, ...progress } = fixture.progress;
  const missing = checkView({ ...fixture, progress });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.message, /progress\.byStage/);
  const bad = checkView({
    ...fixture,
    progress: { ...fixture.progress, byStage: { queued: '3' } },
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /progress\.byStage\.queued/);
});

test('the work detail fixture matches the overview and covers every verification method', () => {
  const detail = JSON.parse(
    readFileSync(new URL('../fixtures/work.sample.json', import.meta.url), 'utf8'),
  ) as WorkDetailView;
  assert.equal(detail.viewVersion, fixture.viewVersion);
  assert.equal(detail.generatedAt, fixture.generatedAt);
  // The detail document carries the same WorkView as the overview, byte for byte.
  const work = (fixture.works as WorkView[]).find((w) => w.id === detail.work.id);
  assert.deepEqual(detail.work, work);
  const rows = detail.verification ?? [];
  assert.deepEqual([...new Set(rows.map((r) => r.how))].sort(), [
    'executed',
    'not-checked',
    'read',
    'reused',
  ]);
  assert.deepEqual([...new Set(rows.map((r) => r.kind))].sort(), ['gate', 'review']);
  // Executed rows say who and in which attempt; a read review never claims execution.
  for (const r of rows.filter((r) => r.how === 'executed')) {
    assert.ok(r.by && r.attempt, `executed row ${r.gate} lacks by/attempt`);
  }
  for (const r of rows.filter((r) => r.kind === 'review')) assert.notEqual(r.how, 'executed');
  assert.ok(detail.attempts.length <= 20 && rows.length <= 50);
});

test('the gate refuses zone-less, impossible or non-string instants', async () => {
  const { isInstant } = await import('../src/model/compat.ts');
  for (const ok of ['2026-11-19T12:00Z', '2026-11-19T12:00:00.000Z', '2024-02-29T23:59:59+03:00'])
    assert.equal(isInstant(ok), true, ok);
  for (const bad of [
    '2026-02-30T12:00:00Z',
    '2026-11-19T12:00:00',
    '2026-11-19',
    '2026-11-19T24:00:00Z',
    'now',
    1763553600000,
  ])
    assert.equal(isInstant(bad), false, String(bad));
  const shifted = checkView({ ...fixture, generatedAt: '2026-02-30T12:00:00Z' });
  assert.equal(shifted.ok, false);
  const nullEscalation = checkView({ ...fixture, escalations: [null] });
  assert.equal(nullEscalation.ok, false);
  if (!nullEscalation.ok) assert.match(nullEscalation.message, /escalations\[0\]/);
});

test('the lead may answer only a technical question the policy opens to it', async () => {
  const { leadMayAnswer, questionStatus } = await import('../src/model/format.ts');
  const q = { state: 'awaiting-answer', answerableBy: 'operator-or-lead' } as const;
  assert.equal(leadMayAnswer({ ...q, impact: 'technical' }), true);
  for (const impact of ['user-visible', 'something-new', undefined])
    assert.equal(leadMayAnswer({ ...q, impact }), false, String(impact));
  assert.equal(leadMayAnswer({ answerableBy: 'operator', impact: 'technical' }), false);
  assert.match(questionStatus({ ...q }).text, /Only you can answer/);
  assert.match(questionStatus({ ...q, impact: 'technical' }).text, /You or the lead agent/);
});

test('httpViewSource passes the UI language as ?lang=', async () => {
  const seen: string[] = [];
  const fake = (async (url: string | URL | Request) => {
    seen.push(String(url));
    return new Response(JSON.stringify(fixture), { status: 200 });
  }) as typeof fetch;
  await httpViewSource('http://127.0.0.1:1/', fake, { lang: 'ru' }).load();
  await httpViewSource('http://127.0.0.1:1/', fake).load();
  assert.deepEqual(seen, ['http://127.0.0.1:1/api/view?lang=ru', 'http://127.0.0.1:1/api/view']);
});

test('targetSentence: only pushed and not-pushed are definite; anything else is unknown', async () => {
  const { targetSentence } = await import('../src/model/i18n.ts');
  const t = (state: string, reason?: string) => ({
    remote: { state, ...(reason ? { reason } : {}) },
  });
  assert.match(targetSentence(t('pushed'), 'en'), /^Accepted locally; on the remote \(as of/);
  assert.match(targetSentence(t('not-pushed'), 'en'), /not on the remote yet/);
  assert.equal(
    targetSentence(t('unknown', 'no tracking ref'), 'en'),
    'Accepted locally; remote state unknown: no tracking ref.',
  );
  assert.equal(targetSentence(t('future-state'), 'en'), 'Accepted locally; remote state unknown.');
  assert.match(targetSentence(t('unknown', 'нет ref'), 'ru'), /— неизвестно: нет ref\.$/);
});

test('the gate checks the target and warnings the panel renders', () => {
  const badTarget = structuredClone(fixture);
  badTarget.works[0].target.remote = { reason: 'x' };
  const t = checkView(badTarget);
  assert.equal(t.ok ? '' : t.code, 'NOT_A_VIEW');
  assert.match(t.ok ? '' : t.message, /works\[0\]\.target/);
  const badWarnings = structuredClone(fixture);
  badWarnings.health.warnings = [{ code: 'VIEW_TRUNCATED' }];
  const w = checkView(badWarnings);
  assert.match(w.ok ? '' : w.message, /health\.warnings\[0\]/);
});

test('every instant the harness schema accepts passes the gate and renders', async () => {
  const { isInstant, instantMs } = await import('../src/model/compat.ts');
  const { formatClock } = await import('../src/model/i18n.ts');
  for (const ok of [
    '2026-11-19T12:00:00.1234567890Z',
    '0099-11-19T12:00:00Z',
    '0000-01-01T00:00:00Z',
    '2024-02-29T23:59:59.5+03:00',
  ])
    assert.equal(isInstant(ok), true, ok);
  assert.equal(isInstant('2026-11-19T12:00:00+24:00'), false);
  assert.equal(
    instantMs('2026-11-19T12:00:00.1234567890Z'),
    Date.parse('2026-11-19T12:00:00.123Z'),
  );
  assert.equal(new Date(instantMs('0099-11-19T12:00:00Z')).getUTCFullYear(), 99);
  assert.equal(formatClock('2026-11-19T12:00:00.1234567890Z', 'UTC'), '12:00');
  assert.equal(
    formatElapsed('2026-11-19T12:00:00.1234567890Z', Date.parse('2026-11-19T12:00:09Z')),
    '8s',
  );
  const v = structuredClone(fixture);
  v.generatedAt = '2026-11-19T12:00:00.1234567890Z';
  v.works[1].stage.since = '0099-11-19T12:00:00Z';
  assert.equal(checkView(v).ok, true);
});

test('the gate refuses every rendered field of the wrong type, optional ones too', () => {
  const mutations: [string, (v: any) => void][] = [
    ['health.budgets[0].limitUsd', (v) => (v.health.budgets[0].limitUsd = 'oops')],
    ['health.budgets[0].scope', (v) => (v.health.budgets[0].scope = {})],
    ['health.budgets[1].id', (v) => (v.health.budgets[1].id = 7)],
    ['health.spentTotalUsd', (v) => delete v.health.spentTotalUsd],
    ['health.budgeting', (v) => (v.health.budgeting = 1)],
    ['questions[0].title', (v) => (v.questions[0].title = {})],
    ['questions[0].answerableBy', (v) => delete v.questions[0].answerableBy],
    ['questions[0].impact', (v) => (v.questions[0].impact = 1)],
    ['works[1].stage.step', (v) => (v.works[1].stage.step = {})],
    ['works[1].attempts', (v) => (v.works[1].attempts.line = {})],
    ['works[1].liveness', (v) => (v.works[1].liveness = {})],
    ['progress.queue.reason', (v) => (v.progress.queue.reason = {})],
    ['truncated.questions', (v) => (v.truncated = { questions: 'x' })],
    // Revision 1 fields (harness alpha.56): optional, but checked when present.
    ['questions[1].answerBasis.line', (v) => (v.questions[1].answerBasis.line = 7)],
    ['questions[1].answerBasis.at', (v) => (v.questions[1].answerBasis.at = '2026-11-19 11:27')],
    ['questions[1].answerBasis.reason', (v) => (v.questions[1].answerBasis.reason = {})],
    ['questions[1].answerBasis', (v) => (v.questions[1].answerBasis = 'lead')],
    ['history.totals.attemptsFailed', (v) => (v.history.totals.attemptsFailed = -1)],
    [
      'history.totals.failuresByBucket.defect',
      (v) => (v.history.totals.failuresByBucket.defect = 'x'),
    ],
    ['history.totals.reviewRounds.code', (v) => delete v.history.totals.reviewRounds.code],
    ['history.totals.spendUsd', (v) => (v.history.totals.spendUsd = 6.3)],
    ['history.totals.wallMs', (v) => (v.history.totals.wallMs = 1.5)],
    ['history.totals', (v) => (v.history.totals = [])],
  ];
  for (const [path, mutate] of mutations) {
    const v = structuredClone(fixture);
    mutate(v);
    const c = checkView(v);
    assert.equal(c.ok, false, path);
    assert.ok((c.ok ? '' : c.message).includes(path), `${path}: ${c.ok ? '' : c.message}`);
  }
});
