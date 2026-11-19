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
  const now = html.slice(html.indexOf('data-testid="now"'), html.indexOf('data-testid="accepted"'));
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
    progress: { ...view.progress, running: 0, waitingOperator: 0, byStage: { done: 1 } },
  };
  assert.match(
    renderToStaticMarkup(<Overview view={idle} lang="ru" timeZone="UTC" />),
    /Сейчас ничего не выполняется\. От вас: ничего не нужно\./,
  );
});

test('header never says "nothing is needed" while the harness counts work waiting for you', () => {
  // The question list is empty, but the harness still counts a work waiting for the operator.
  const hidden: OperatorView = {
    ...view,
    questions: [],
    progress: { ...view.progress, running: 0, waitingOperator: 2, byStage: { done: 1 } },
  };
  const ru = renderToStaticMarkup(<Overview view={hidden} lang="ru" timeZone="UTC" />);
  assert.match(ru, /От вас: 2 работы ждут вашего действия\./);
  assert.doesNotMatch(ru, /ничего не нужно/);
  const en = renderToStaticMarkup(<Overview view={hidden} timeZone="UTC" />);
  assert.match(en, /From you: 2 work orders wait for your action\./);

  // A clipped question list makes the count a floor, and an empty clipped list unknown.
  const clipped: OperatorView = { ...view, truncated: { questions: 3 } };
  assert.match(
    renderToStaticMarkup(<Overview view={clipped} lang="ru" timeZone="UTC" />),
    /ответить на 1 вопрос и, возможно, ещё \(список обрезан\)\./,
  );
  const clippedEmpty: OperatorView = {
    ...hidden,
    progress: { ...hidden.progress, waitingOperator: 0 },
    truncated: { escalations: 1 },
  };
  assert.match(
    renderToStaticMarkup(<Overview view={clippedEmpty} timeZone="UTC" />),
    /From you: unknown — the list is clipped\./,
  );
});

test('header lists pause, stopped work and operator decisions with plurals', () => {
  const busy: OperatorView = {
    ...view,
    progress: {
      ...view.progress,
      running: 2,
      byStage: { ...view.progress.byStage, queued: 5, stopped: 21 },
      queue: { paused: true, reason: 'operator' },
    },
    escalations: [
      { code: 'STOPPED', actor: 'operator', action: 'decide', since: view.generatedAt },
      { code: 'STOPPED', actor: 'operator', action: 'decide', since: view.generatedAt },
      { code: 'REVIEW', actor: 'lead', action: 'decide', since: view.generatedAt },
    ],
  };
  assert.match(
    renderToStaticMarkup(<Overview view={busy} lang="ru" timeZone="UTC" />),
    /Сейчас: очередь на паузе, в работе 2, в очереди 5, остановлено 21\. От вас: ответить на 1 вопрос и принять 2 решения\./,
  );
  assert.match(
    renderToStaticMarkup(<Overview view={busy} timeZone="UTC" />),
    /Now: the queue is paused, 2 working, 5 waiting in the queue, 21 stopped\. From you: answer 1 question and take 2 decisions\./,
  );
});

test('footer: viewer time zone, a date for another day, unknown instead of a crash', () => {
  // generatedAt is 12:00 UTC.
  assert.match(
    renderToStaticMarkup(<Overview view={view} lang="ru" timeZone="Europe/Moscow" />),
    /Данные harness на 15:00;/,
  );
  const nextDay = Date.parse(view.generatedAt) + 24 * 3600_000;
  assert.match(
    renderToStaticMarkup(<Overview view={view} timeZone="UTC" now={nextDay} />),
    /Harness data as of 19\.11\.2026 12:00;/,
  );
  const html = renderToStaticMarkup(<Overview view={view} lang="ru" timeZone="Not/AZone" />);
  assert.match(html, /Данные harness на неизвестное время;/);
});

test('an unknown question state or unknown budgeting is never read as "nothing" or "no budget"', () => {
  const odd: OperatorView = {
    ...view,
    questions: [{ ...view.questions[0]!, state: 'awaiting-something-new' }],
    progress: { ...view.progress, waitingOperator: 0 },
  };
  assert.match(
    renderToStaticMarkup(<Overview view={odd} timeZone="UTC" />),
    /From you: unknown — the list is clipped\./,
  );
  const noFlag = {
    ...view,
    health: { ...view.health, budgeting: undefined, budgets: [] },
  } as unknown as OperatorView;
  const html = renderToStaticMarkup(<Overview view={noFlag} />);
  assert.match(html, /budget unknown; spent/);
  assert.doesNotMatch(html, /no budget/);
  // A budget row is shown even when the producer says budgeting is off.
  const offWithRow: OperatorView = { ...view, health: { ...view.health, budgeting: 'off' } };
  assert.match(renderToStaticMarkup(<Overview view={offWithRow} />), /\(total: within\)/);
});

test('footer defaults to the viewer time zone (TZ), not UTC', () => {
  const saved = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo';
    assert.match(renderToStaticMarkup(<Overview view={view} />), /Harness data as of 21:00;/);
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test('accepted work: an unknown remote state is shown as unknown with the harness reason', () => {
  const html = renderToStaticMarkup(<Overview view={view} />);
  const accepted = html.slice(html.indexOf('data-testid="accepted"'));
  assert.match(accepted, /add-greeting/);
  assert.match(
    accepted,
    /Accepted locally; remote state unknown: the remote-tracking ref is not read by this harness version\./,
  );
  assert.doesNotMatch(accepted, /not on the remote|on the remote \(/);
  const ru = renderToStaticMarkup(<Overview view={view} lang="ru" />);
  assert.match(ru, /Принято локально; в удалённом репозитории — неизвестно: /);
  const none = renderToStaticMarkup(
    <Overview view={{ ...view, works: view.works.map(({ target: _t, ...w }) => w) }} />,
  );
  assert.doesNotMatch(none, /data-testid="accepted"/);
});

test('health warnings from the harness are listed with their code and message', () => {
  const warned: OperatorView = {
    ...view,
    health: {
      ...view.health,
      warnings: [
        { code: 'STATE_NOT_FOUND', message: 'there is no state yet' },
        { code: 'POLICY_DIGEST_MISMATCH', message: 'the policy differs from the bound one' },
      ],
    },
  };
  const html = renderToStaticMarkup(<Overview view={warned} />);
  const list = html.slice(html.indexOf('data-testid="warnings"'));
  assert.match(list, /STATE_NOT_FOUND<\/code> there is no state yet/);
  assert.match(list, /POLICY_DIGEST_MISMATCH<\/code> the policy differs/);
  assert.doesNotMatch(renderToStaticMarkup(<Overview view={view} />), /data-testid="warnings"/);
});
