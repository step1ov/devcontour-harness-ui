import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Overview } from '../src/components/Overview.tsx';
import { checkView, type OperatorView } from '../src/model/index.ts';

const raw = JSON.parse(
  readFileSync(new URL('../fixtures/view.sample.json', import.meta.url), 'utf8'),
);
const check = checkView(raw);
if (!check.ok) throw new Error(check.message);
const view: OperatorView = check.view;

test('overview shows the waiting question, the running work and health', () => {
  const html = renderToStaticMarkup(<Overview view={view} />);
  assert.match(html, /Queue running/);
  assert.match(html, /1 of 4 accepted/);
  assert.match(html, /Which delimiter should the CSV use\?/);
  assert.match(html, /Only you can answer this question\./);
  assert.match(html, /locale-format/);
  assert.match(html, /candidate-test:unit/);
  assert.match(html, /7m 50s/); // stage since 11:52:10, view at 12:00:00
  assert.match(html, /≥ \$6\.02 \(within\)/);
  // Accepted, queued and answer-waiting work does not hold a slot.
  const now = html.slice(html.indexOf('data-testid="now"'), html.indexOf('data-testid="health"'));
  assert.match(now, /Working now \(1 of 2 slots\)/);
  assert.doesNotMatch(now, /add-greeting|docs-page|export-csv/);
});

test('overview without questions and with a paused queue', () => {
  const paused: OperatorView = {
    ...view,
    questions: [],
    progress: { ...view.progress, queue: { paused: true, reason: 'operator' } },
  };
  const html = renderToStaticMarkup(<Overview view={paused} />);
  assert.match(html, /Paused \(operator\)/);
  assert.match(html, /No questions are waiting for you\./);
});

test('the component renders no form or write control', () => {
  const html = renderToStaticMarkup(<Overview view={view} onOpenWork={() => {}} />);
  assert.doesNotMatch(html, /<form|<input|<textarea|method="post"/i);
});
