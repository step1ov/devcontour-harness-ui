import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { asAlpha59 } from './legacy.ts';
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

test('revision 10 (harness alpha.70) is known; revisions 9, 8, 7, 6, 5, 4, 3, 2, 1 and 0 (alpha.69, .68, .67, .66, .65, .60–.62, .59, .57, .56, .55) too; only later ones are newer', () => {
  assert.equal(KNOWN_VIEW_REVISION, 10);
  assert.equal(fixture.viewRevision, 6);
  const c4now = checkView(fixture);
  assert.equal(c4now.ok && c4now.newerRevision, false);
  const c3 = checkView(asAlpha59(fixture));
  assert.equal(c3.ok, true, c3.ok ? '' : c3.message);
  assert.equal(c3.ok && c3.newerRevision, false);
  assert.equal(c3.ok && c3.view.forecast, undefined, 'no forecast stays absent');
  const c2 = checkView({ ...asAlpha59(fixture), viewRevision: 2 });
  assert.equal(c2.ok && c2.newerRevision, false);
  const r1 = asAlpha59(fixture);
  r1.viewRevision = 1;
  delete r1.activity;
  for (const w of r1.works) if (w.target) w.target.remote = { state: 'unknown', reason: 'x' };
  const c1 = checkView(r1);
  assert.equal(c1.ok, true, c1.ok ? '' : c1.message);
  assert.equal(c1.ok && c1.newerRevision, false);
  assert.equal(c1.ok && c1.view.activity, undefined, 'no feed stays no feed, not []');
  const old = structuredClone(r1);
  old.viewRevision = 0;
  delete old.history.totals;
  for (const q of old.questions) delete q.answerBasis;
  const c0 = checkView(old);
  assert.equal(c0.ok, true, c0.ok ? '' : c0.message);
  assert.equal(c0.ok && c0.newerRevision, false);
  const c5 = checkView({ ...fixture, viewRevision: 5 });
  assert.equal(c5.ok && c5.newerRevision, false);
  const c6 = checkView({ ...fixture, viewRevision: 6 });
  assert.equal(c6.ok && c6.newerRevision, false);
  const c7 = checkView({ ...fixture, viewRevision: 7 });
  assert.equal(c7.ok && c7.newerRevision, false);
  const c8 = checkView({ ...fixture, viewRevision: 8 });
  assert.equal(c8.ok && c8.newerRevision, false);
  const c9 = checkView({ ...fixture, viewRevision: 9 });
  assert.equal(c9.ok && c9.newerRevision, false);
  const c10 = checkView({ ...fixture, viewRevision: 10 });
  assert.equal(c10.ok && c10.newerRevision, false);
  const c11 = checkView({ ...fixture, viewRevision: 11 });
  assert.equal(c11.ok && c11.newerRevision, true);
});

test('the gate checks the revision 4 fields the panel renders', () => {
  const bad = (mutate: (d: any) => void) => {
    const d = structuredClone(fixture);
    mutate(d);
    const c = checkView(d);
    assert.equal(c.ok, false, JSON.stringify(c).slice(0, 200));
    return c.ok ? '' : c.message;
  };
  assert.match(
    bad((d) => (d.forecast.progress.percent = '23')),
    /forecast\.progress\.percent/,
  );
  assert.match(
    bad((d) => (d.forecast.time.remaining.loMs = -1)),
    /forecast\.time\.remaining\.loMs/,
  );
  assert.match(
    bad((d) => delete d.forecast.time.humanWait),
    /forecast\.time\.humanWait/,
  );
  assert.match(
    bad((d) => (d.forecast.assumptions = 'x')),
    /forecast\.assumptions/,
  );
  assert.match(
    bad((d) => (d.scope.tasks[0].connector = 1)),
    /scope\.tasks\[0\]\.connector/,
  );
  assert.match(
    bad((d) => (d.sourceQuestions[0].readAt = 'yesterday')),
    /sourceQuestions\[0\]\.readAt/,
  );
  assert.match(
    bad((d) => (d.updates.line = null)),
    /updates\.line/,
  );
  assert.match(
    bad((d) => (d.health.sources[0].checkedAt = '')),
    /health\.sources\[0\]\.checkedAt/,
  );
  assert.match(
    bad((d) => (d.progress.queue.runner = 1)),
    /progress\.queue\.runner/,
  );
  assert.match(
    bad((d) => (d.works[2].blockers[0].step = 1.5)),
    /blockers\[0\]\.step/,
  );
  assert.match(
    bad((d) => (d.works[1].attempts.lastFailure.counted = 'no')),
    /lastFailure\.counted/,
  );
  assert.match(
    bad((d) => (d.questions[0].options[0].label = 3)),
    /options\[0\]\.label/,
  );
});

test('the gate checks the revision 2 remote fields and the feed the panel renders', () => {
  const bad = (mutate: (d: any) => void) => {
    const d = structuredClone(fixture);
    mutate(d);
    const c = checkView(d);
    return c.ok ? '' : c.message;
  };
  const accepted = (d: any) => d.works.find((w: any) => w.target);
  assert.match(
    bad((d) => (accepted(d).target.remote.checkedAt = '2026-02-30T10:00:00Z')),
    /works\[0\]\.target/,
  );
  assert.match(
    bad((d) => (accepted(d).target.remote.checkedAt = '2026-11-19T10:00:00')),
    /works\[0\]\.target/,
  );
  assert.match(
    bad((d) => (accepted(d).target.remote.line = 7)),
    /works\[0\]\.target/,
  );
  assert.match(
    bad((d) => (d.activity[0].at = 'yesterday')),
    /activity/,
  );
  assert.match(
    bad((d) => (d.activity[1].plain = null)),
    /activity/,
  );
  assert.match(
    bad((d) => (d.activity = {})),
    /activity/,
  );
  // Absent optional fields are fine: no line, no check time.
  assert.equal(
    bad((d) => {
      delete accepted(d).target.remote.line;
      delete accepted(d).target.remote.checkedAt;
    }),
    '',
  );
});

test('a newer revision is accepted and flagged; unknown fields are ignored', () => {
  const check = checkView({ ...fixture, viewRevision: 11, futureSection: { x: 1 } });
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
  const t = (state: string, extra: Record<string, string> = {}) => ({
    remote: { state, ...extra },
  });
  assert.equal(
    targetSentence(t('pushed', { trackingRef: 'origin/main' }), 'en'),
    'Accepted locally; already on the remote branch origin/main.',
  );
  assert.equal(
    targetSentence(t('not-pushed', { trackingRef: 'origin/main' }), 'ru'),
    'Принято локально; в удалённой ветке origin/main ещё нет.',
  );
  assert.equal(
    targetSentence(t('not-pushed'), 'en'),
    'Accepted locally; not yet on the remote branch.',
  );
  assert.equal(
    targetSentence(t('unknown', { reason: 'no tracking ref' }), 'en'),
    'Accepted locally; remote state unknown: no tracking ref.',
  );
  assert.equal(targetSentence(t('future-state'), 'en'), 'Accepted locally; remote state unknown.');
  assert.match(
    targetSentence(t('unknown', { reason: 'нет ref' }), 'ru'),
    /— неизвестно: нет ref\.$/,
  );
  // The line never decides the state.
  assert.equal(
    targetSentence(t('unknown', { line: 'already on the remote branch x' }), 'en'),
    'Accepted locally; remote state unknown.',
  );
});

test('formatWhen: today, yesterday by the calendar (DST, midnight, early years), else the date', async () => {
  const { formatWhen } = await import('../src/model/i18n.ts');
  const at = (iso: string) => Date.parse(iso);
  const Z = 'UTC';
  assert.equal(formatWhen('2026-11-19T11:51:40Z', 'ru', Z, at('2026-11-19T12:00:00Z')), '11:51');
  assert.equal(
    formatWhen('2026-11-18T18:05:00Z', 'ru', Z, at('2026-11-19T12:00:00Z')),
    'вчера 18:05',
  );
  assert.equal(
    formatWhen('2026-11-18T18:05:00Z', 'en', Z, at('2026-11-19T12:00:00Z')),
    'yesterday 18:05',
  );
  assert.equal(
    formatWhen('2026-11-17T18:05:00Z', 'ru', Z, at('2026-11-19T12:00:00Z')),
    '17.11.2026 18:05',
  );
  // No viewer clock: always the date.
  assert.equal(formatWhen('2026-11-19T11:51:40Z', 'ru', Z), '19.11.2026 11:51');
  // Midnight: 23:59 of the day before is yesterday; 00:00 is today.
  assert.equal(
    formatWhen('2026-11-18T23:59:00Z', 'ru', Z, at('2026-11-19T00:01:00Z')),
    'вчера 23:59',
  );
  assert.equal(formatWhen('2026-11-19T00:00:00Z', 'ru', Z, at('2026-11-19T00:01:00Z')), '00:00');
  // Year and month boundaries.
  assert.equal(
    formatWhen('2026-12-31T22:00:00Z', 'ru', Z, at('2027-01-01T08:00:00Z')),
    'вчера 22:00',
  );
  assert.equal(
    formatWhen('2028-02-29T10:00:00Z', 'ru', Z, at('2028-03-01T08:00:00Z')),
    'вчера 10:00',
  );
  // The zone decides the day: 23:30 UTC is already the next day in Moscow.
  assert.equal(
    formatWhen('2026-11-18T22:30:00Z', 'ru', 'Europe/Moscow', at('2026-11-19T09:00:00Z')),
    '01:30',
  );
  // Spring forward (Berlin, 29.03.2026, a 23 h day): 00:30 on the 29th is
  // yesterday for 00:30 on the 30th, though now − 24 h falls on the 28th.
  assert.equal(
    formatWhen('2026-03-28T23:30:00Z', 'ru', 'Europe/Berlin', at('2026-03-29T22:30:00Z')),
    'вчера 00:30',
  );
  // Fall back (Berlin, 25.10.2026, a 25 h day): 23:30 on the 24th is two days
  // back for 00:30 on the 26th, though only 26 h passed.
  assert.equal(
    formatWhen('2026-10-24T21:30:00Z', 'ru', 'Europe/Berlin', at('2026-10-25T23:30:00Z')),
    '24.10.2026 23:30',
  );
  assert.equal(
    formatWhen('2026-10-25T00:30:00Z', 'ru', 'Europe/Berlin', at('2026-10-25T23:30:00Z')),
    'вчера 02:30',
  );
  // Early years stay themselves (Date.UTC would map 99 to 1999).
  assert.equal(
    formatWhen('0099-11-18T18:05:00Z', 'ru', Z, at('0099-11-19T12:00:00Z')),
    'вчера 18:05',
  );
  assert.equal(
    formatWhen('0099-11-10T18:05:00Z', 'ru', Z, at('0099-11-19T12:00:00Z')),
    '10.11.0099 18:05',
  );
  // Year 0 is year 0 (Intl says "1 BC"), and its last day is yesterday for 0001-01-01.
  assert.equal(formatWhen('0000-06-01T10:00:00Z', 'ru', Z), '01.06.0000 10:00');
  assert.equal(
    formatWhen('0000-12-31T10:00:00Z', 'ru', Z, at('0001-01-01T08:00:00Z')),
    'вчера 10:00',
  );
  assert.equal(
    formatWhen('0000-01-01T10:00:00Z', 'ru', Z, at('0001-01-01T12:00:00Z')),
    '01.01.0000 10:00',
  );
  // Not an instant: undefined, never a shifted date.
  assert.equal(formatWhen('2026-02-30T10:00:00Z', 'ru', Z, at('2026-03-02T12:00:00Z')), undefined);
  assert.equal(formatWhen('2026-11-19T10:00:00', 'ru', Z, at('2026-11-19T12:00:00Z')), undefined);
  assert.equal(
    formatWhen('2026-11-19T10:00:00Z', 'ru', 'Not/AZone', at('2026-11-19T12:00:00Z')),
    undefined,
  );
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
