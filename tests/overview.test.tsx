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
  assert.match(html, /≥ \$6\.02 of \$40\.00 \(total: within\)/);
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

test('questions in other states are not asked as needing an answer', () => {
  const applied: OperatorView = {
    ...view,
    questions: view.questions.map((q) => ({ ...q, state: 'answered-not-applied' })),
  };
  const html = renderToStaticMarkup(<Overview view={applied} />);
  assert.match(html, /Needs your answer \(0\)/);
  assert.match(html, /still has to apply the answer/);
});

test('running count comes from progress, and a truncated list says so', () => {
  const truncated: OperatorView = {
    ...view,
    works: [],
    progress: { ...view.progress, running: 2 },
    truncated: { works: 4 },
  };
  const html = renderToStaticMarkup(<Overview view={truncated} />);
  assert.match(html, /Working now \(2 of 2 slots\)/);
  assert.match(html, /2 more running work orders are not listed/);
  assert.doesNotMatch(html, /Nothing is running/);
});

test('budgets: the worst scope is shown; no budgets says so', () => {
  const exceeded: OperatorView = {
    ...view,
    health: {
      ...view.health,
      budgets: [
        { scope: 'total', state: 'within', spentUsd: { value: 6, bound: 'exact' }, limitUsd: 40 },
        {
          scope: 'work',
          id: 'locale-format',
          state: 'exceeded',
          spentUsd: { value: 9, bound: 'exact' },
          limitUsd: 8,
        },
      ],
    },
  };
  assert.match(
    renderToStaticMarkup(<Overview view={exceeded} />),
    /\$9\.00 of \$8\.00 \(work locale-format: exceeded\)/,
  );
  const none: OperatorView = {
    ...view,
    health: { ...view.health, budgeting: 'off', budgets: [] },
  };
  assert.match(renderToStaticMarkup(<Overview view={none} />), /no budget; spent ≥ \$6\.02/);
});

test('unavailable drift checks are not shown as zero drift', () => {
  const unknown: OperatorView = {
    ...view,
    health: { ...view.health, drift: { checked: 2, drifted: 0, unavailable: 2 } },
  };
  assert.match(renderToStaticMarkup(<Overview view={unknown} />), /0 \(2 not checked\)/);
});

test('header sentence and footer: Russian first-class, English fallback', () => {
  const ru = renderToStaticMarkup(<Overview view={view} lang="ru" timeZone="UTC" />);
  assert.match(ru, /Сейчас: в работе 1, в очереди 1\. От вас: ответить на 1 вопрос\./);
  assert.match(ru, /Данные harness на 12:00; панель ничего не меняет\./);
  const en = renderToStaticMarkup(<Overview view={view} timeZone="UTC" />);
  assert.match(en, /Now: 1 working, 1 waiting in the queue\. From you: answer 1 question\./);
  assert.match(en, /Harness data as of 12:00; the panel changes nothing\./);
  const idle: OperatorView = {
    ...view,
    questions: [],
    progress: { ...view.progress, running: 0, byStage: { done: 1 } },
  };
  assert.match(
    renderToStaticMarkup(<Overview view={idle} lang="ru" timeZone="UTC" />),
    /Сейчас ничего не выполняется\. От вас: ничего не нужно\./,
  );
});
