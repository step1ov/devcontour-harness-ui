import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  checkView,
  formatElapsed,
  formatUsd,
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
    'spendUsd',
  ]) {
    assert.equal(h[key].length, buckets, key);
  }
});

test('staticViewSource returns the checked view', async () => {
  const check = await staticViewSource(fixture).load();
  assert.equal(check.ok, true);
});
