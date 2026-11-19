import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  checkView,
  formatElapsed,
  formatUsd,
  httpViewSource,
  questionStatus,
  stageLabel,
  staticViewSource,
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
