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
const check2 = (rel: string): OperatorView => {
  const c = checkView(JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')));
  if (!c.ok) throw new Error(c.message);
  return c.view;
};

test('overview shows the waiting question, the running work and health', () => {
  const html = renderToStaticMarkup(<Overview lang="en" view={view} />);
  assert.match(html, /Queue running/);
  assert.match(html, /1 of 4 accepted/);
  assert.match(html, /Which delimiter should the CSV use\?/);
  assert.match(html, /Only you can answer this question\./);
  assert.match(html, /locale-format/);
  assert.match(html, /candidate-test:unit/);
  assert.match(html, /7m 50s/); // stage since 11:52:10, view at 12:00:00
  assert.match(html, /≥ \$6\.02 of \$40\.00 \(total: within\)/);
  // Accepted, queued and answer-waiting work does not hold a slot.
  const now = html.slice(
    html.indexOf('data-testid="now"'),
    html.indexOf('data-testid="decisions"'),
  );
  assert.match(now, /Working now \(1 of 2 slots\)/);
  assert.doesNotMatch(now, /add-greeting|docs-page|export-csv/);
});

test('overview without questions and with a paused queue', () => {
  const paused: OperatorView = {
    ...view,
    questions: [],
    progress: { ...view.progress, queue: { paused: true, reason: 'operator' } },
  };
  const html = renderToStaticMarkup(<Overview lang="en" view={paused} />);
  assert.match(html, /Paused \(operator\)/);
  // export-csv still waits for an answer the view no longer lists: said, not hidden.
  assert.match(html, /Waiting for your answer, but the question is not in this view: export-csv\./);
  assert.doesNotMatch(html, /Nothing is needed from you now/);
  const quiet = {
    ...paused,
    works: paused.works.filter((w) => w.id !== 'export-csv' && w.id !== 'docs-page'),
  };
  // The harness still counts one work waiting for you that no item names: said, never "nothing".
  const counted = renderToStaticMarkup(<Overview lang="en" view={quiet} />);
  assert.match(
    counted,
    /1 more work order waits for your action but is not in this view — run harness status\./,
  );
  assert.doesNotMatch(counted, /Nothing is needed from you now/);
  const calm: OperatorView = { ...quiet, progress: { ...quiet.progress, waitingOperator: 0 } };
  assert.match(
    renderToStaticMarkup(<Overview lang="en" view={calm} />),
    /Nothing is needed from you now\./,
  );
});

test('the component renders no form or write control', () => {
  const html = renderToStaticMarkup(<Overview lang="en" view={view} onOpenWork={() => {}} />);
  assert.doesNotMatch(html, /<form|<input|<textarea|method="post"/i);
});

test('questions in other states are not asked as needing an answer', () => {
  const applied: OperatorView = {
    ...view,
    questions: view.questions.map((q) => ({ ...q, state: 'answered-not-applied' })),
  };
  const html = renderToStaticMarkup(<Overview lang="en" view={applied} />);
  // No count of zero next to the heading, and the answered question is not «unlisted».
  assert.match(html, />Needed from you<\/h3>/);
  assert.doesNotMatch(html, /Needed from you \(0\)|data-testid="unlisted-answers"/);
  assert.match(html, /still has to apply the answer/);
});

test('running count comes from progress, and a truncated list says so', () => {
  const truncated: OperatorView = {
    ...view,
    works: [],
    progress: { ...view.progress, running: 2 },
    truncated: { works: 4 },
  };
  const html = renderToStaticMarkup(<Overview lang="en" view={truncated} />);
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
    renderToStaticMarkup(<Overview lang="en" view={exceeded} />),
    /\$9\.00 of \$8\.00 \(work locale-format: exceeded\)/,
  );
  const none: OperatorView = {
    ...view,
    health: { ...view.health, budgeting: 'off', budgets: [] },
  };
  assert.match(
    renderToStaticMarkup(<Overview lang="en" view={none} />),
    /no budget; spent ≥ \$6\.02/,
  );
});

test('unavailable drift checks are not shown as zero drift', () => {
  const unknown: OperatorView = {
    ...view,
    health: { ...view.health, drift: { checked: 2, drifted: 0, unavailable: 2 } },
  };
  assert.match(renderToStaticMarkup(<Overview lang="en" view={unknown} />), /0 \(2 not checked\)/);
});

test('header sentence and footer: Russian first-class, English fallback', () => {
  const ru = renderToStaticMarkup(<Overview view={view} lang="ru" timeZone="UTC" />);
  assert.match(ru, /Сейчас: в работе 1, в очереди 1\. От вас: ответить на 1 вопрос\./);
  assert.match(ru, /Данные harness на 12:00; панель ничего не меняет\./);
  const en = renderToStaticMarkup(<Overview lang="en" view={view} timeZone="UTC" />);
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
  const sentence = ru.slice(
    ru.indexOf('data-testid="sentence"'),
    ru.indexOf('</p>', ru.indexOf('data-testid="sentence"')),
  );
  assert.doesNotMatch(sentence, /ничего не нужно/);
  const en = renderToStaticMarkup(<Overview lang="en" view={hidden} timeZone="UTC" />);
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
    renderToStaticMarkup(<Overview lang="en" view={clippedEmpty} timeZone="UTC" />),
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
    renderToStaticMarkup(<Overview lang="en" view={busy} timeZone="UTC" />),
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
    renderToStaticMarkup(<Overview lang="en" view={view} timeZone="UTC" now={nextDay} />),
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
    renderToStaticMarkup(<Overview lang="en" view={odd} timeZone="UTC" />),
    /From you: unknown — the list is clipped\./,
  );
  const noFlag = {
    ...view,
    health: { ...view.health, budgeting: undefined, budgets: [] },
  } as unknown as OperatorView;
  const html = renderToStaticMarkup(<Overview lang="en" view={noFlag} />);
  assert.match(html, /budget unknown; spent/);
  assert.doesNotMatch(html, /no budget/);
  // A budget row is shown even when the producer says budgeting is off.
  const offWithRow: OperatorView = { ...view, health: { ...view.health, budgeting: 'off' } };
  assert.match(renderToStaticMarkup(<Overview lang="en" view={offWithRow} />), /\(total: within\)/);
});

test('footer defaults to the viewer time zone (TZ), not UTC', () => {
  const saved = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo';
    assert.match(
      renderToStaticMarkup(<Overview lang="en" view={view} />),
      /Harness data as of 21:00;/,
    );
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test('accepted work: the harness remote line, the local check time and what it means', () => {
  const html = renderToStaticMarkup(<Overview lang="en" view={view} timeZone="UTC" />);
  const accepted = html.slice(html.indexOf('data-testid="accepted"'));
  assert.match(accepted, /add-greeting/);
  // The harness line, said once after «accepted locally», never "pushed".
  assert.match(
    accepted,
    /Accepted locally; not yet on the remote branch origin\/harness\/accepted\./,
  );
  assert.doesNotMatch(accepted, /accepted locally; accepted locally/i);
  assert.doesNotMatch(accepted, /already on the remote/);
  // checkedAt (18.11 17:30 UTC) is the day before generatedAt (19.11 12:00 UTC).
  assert.match(accepted, /git updated the copy: yesterday 17:30\./);
  // One «what it means» for the list, not one per row.
  assert.equal(accepted.split('on the remote branch: what this means').length - 1, 1);
  const ru = renderToStaticMarkup(
    <Overview view={check2('../fixtures/ru/view.sample.json')} lang="ru" timeZone="UTC" />,
  );
  assert.match(ru, /Принято локально; в удалённой ветке origin\/harness\/accepted ещё нет\./);
  assert.match(ru, /без сети; git обновил копию: вчера 17:30\./);
  assert.match(ru, /в удалённой ветке: что это значит/);
  // An alpha.56 view (unknown, with its reason) keeps the panel's unknown sentence.
  const old = renderToStaticMarkup(
    <Overview
      lang="en"
      view={{
        ...view,
        viewRevision: 1,
        works: view.works.map((w) =>
          w.target
            ? {
                ...w,
                target: {
                  ...w.target,
                  remote: { state: 'unknown', reason: 'the remote-tracking ref is not read' },
                },
              }
            : w,
        ),
      }}
    />,
  );
  assert.match(
    old,
    /Accepted locally; remote state unknown: the remote-tracking ref is not read\./,
  );
  assert.doesNotMatch(old, /git updated the copy/);
  // The count is the harness total, not the listed targets.
  assert.match(accepted, /Accepted \(1\)/);
  const many = renderToStaticMarkup(
    <Overview
      lang="en"
      view={{
        ...view,
        progress: { ...view.progress, done: 10 },
        truncated: { works: 9 },
      }}
    />,
  );
  assert.match(many, /Accepted \(10\)/);
  assert.match(many, /9 accepted work orders have no location in this view \(view limit\)\./);
  const unlisted = renderToStaticMarkup(
    <Overview lang="en" view={{ ...view, works: view.works.map(({ target: _t, ...w }) => w) }} />,
  );
  assert.match(unlisted, /Accepted \(1\)/);
  assert.match(unlisted, /1 accepted work order has no location in this view\./);
  const nothing = renderToStaticMarkup(
    <Overview
      lang="en"
      view={{
        ...view,
        works: view.works.map(({ target: _t, ...w }) => w),
        progress: { ...view.progress, done: 0 },
      }}
    />,
  );
  assert.doesNotMatch(nothing, /data-testid="accepted"/);
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
  const html = renderToStaticMarkup(<Overview lang="en" view={warned} />);
  const list = html.slice(html.indexOf('data-testid="warnings"'));
  assert.match(list, /STATE_NOT_FOUND<\/code> there is no state yet/);
  assert.match(list, /POLICY_DIGEST_MISMATCH<\/code> the policy differs/);
  assert.doesNotMatch(
    renderToStaticMarkup(<Overview lang="en" view={view} />),
    /data-testid="warnings"/,
  );
});

test('stopped run (RU): the header and «Нужно от вас» agree, each wait says whose turn it is', () => {
  const v = check2('../fixtures/ru/view.stopped.json');
  const html = renderToStaticMarkup(<Overview view={v} lang="ru" timeZone="UTC" />);
  const section = (id: string) => {
    const at = html.indexOf(`data-testid="${id}"`);
    assert.ok(at > 0, id);
    return html.slice(at, html.indexOf('<div class="hui-panel', at + 1));
  };
  assert.match(html, /Сейчас: остановлено 1\. От вас: принять 1 решение \(после ведущего\)\./);
  // The count of the header is the number of items in the section.
  const needs = section('needs-you');
  assert.match(needs, />Нужно от вас \(1\)<\/h3>/);
  assert.equal(needs.split('data-kind=').length - 1, 1);
  assert.match(needs, /data-kind="decision"/);
  assert.match(needs, /Сбросить попытки<\/strong> — <span><strong>WEB-1<\/strong><\/span>/);
  assert.match(needs, /Почему: попытки исчерпаны \(3 из 3\) — нужен ваш сброс попыток/);
  // Failure groups in words, never the bucket keys.
  const attempts = needs
    .slice(needs.indexOf('data-testid="decision-attempts"'))
    .replace(/<[^>]+>/g, '');
  assert.match(attempts, /отказов 4 \(работа не доделана 2, время вышло 1, нужен ответ 1\)/);
  assert.doesNotMatch(attempts.slice(0, 200), /incomplete|time-limit|input 1/);
  // The order: the lead first, then you.
  assert.match(
    needs,
    /Сначала ведущий: политика изменилась после согласования — нужно согласовать план заново\. Потом — вы:/,
  );
  assert.match(needs, /harness retry --state &lt;state&gt; --work tw1a2b3c4d5e6f7a8b9c0 --reset/);
  // Codes are in the «подробности» disclosure, not in the sentence.
  assert.match(
    needs,
    /<details class="hui-term" data-testid="step-details"><summary>подробности<\/summary>[\s\S]*ATTEMPTS_EXHAUSTED/,
  );

  const others = section('decisions');
  assert.match(others, />Остальные ожидания \(2\)<\/h3>/);
  assert.match(others, /Ваши решения и вопросы \(1\) — в разделе «Нужно от вас» выше\./);
  assert.match(others, /Делает ведущий \(1\)/);
  assert.match(
    others,
    /Политика изменилась после согласования — нужно согласовать план заново<\/strong> — <span><strong>WEB-1<\/strong><\/span><span>, <strong>WEB-2<\/strong><\/span>/,
  );
  assert.match(others, /Ждут другой работы \(1\)/);
  assert.match(
    others.replace(/<[^>]+>/g, ''),
    /WEB-2 ждёт WEB-1 \(по ней дальше действует: ведущий, затем вы\)ждёт зависимости WEB-1 — она остановлена, дальше: сбросить попытки/,
  );
  // The answered question is not asked again and not counted.
  const answered = section('other-questions');
  assert.match(answered, /Ответ применён; ждёт начала следующей попытки\./);
  // The old contradictory headings are gone.
  assert.doesNotMatch(html, /Нужен ваш ответ|Ждут решения|\(0\)/);
});

test('stopped run (EN): the same agreement in English', () => {
  const v = check2('../fixtures/view.stopped.json');
  const html = renderToStaticMarkup(<Overview view={v} lang="en" timeZone="UTC" />);
  const text = html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, '');
  assert.match(text, /Now: 1 stopped\. From you: take 1 decision \(after the lead agent\)\./);
  assert.match(text, /Needed from you \(1\)/);
  assert.match(text, /Reset the attempts — WEB-1/);
  assert.match(
    text,
    /failures 4 \(the work was not finished 2, out of time 1, an answer is needed 1\)/,
  );
  assert.match(text, /First the lead agent: the policy changed after the approval/);
  assert.match(text, /The lead agent acts \(1\)/);
  assert.match(text, /WEB-2 waits for WEB-1 \(on that one, acts: lead agent, then you\)/);
  assert.doesNotMatch(text, /\(0\)/);
});

test('an unknown failure group stays its key, in a code tag; running works too', () => {
  const v = check2('../fixtures/ru/view.stopped.json');
  const w0 = v.works[0]!;
  const line = 'попыток 3; отказов 2 (defect 1, brand-new 1); осталось попыток 1 из 3';
  const odd: OperatorView = {
    ...v,
    works: [{ ...w0, attempts: { ...w0.attempts, line } }, v.works[1]!],
  };
  const html = renderToStaticMarkup(<Overview view={odd} lang="ru" />);
  const at = html.indexOf('data-testid="decision-attempts"');
  const row = html.slice(at, html.indexOf('</div>', at));
  assert.match(row, /<span data-bucket="defect">ошибка в коде/);
  assert.match(row, /<span data-bucket="brand-new"><code>brand-new<\/code>/);
  // A running work shows its line the same way.
  const running: OperatorView = {
    ...odd,
    works: [{ ...odd.works[0]!, stage: { name: 'writer', next: [] }, blockers: [] }, odd.works[1]!],
    escalations: [],
  };
  const now = renderToStaticMarkup(<Overview view={running} lang="ru" />);
  const part = now.slice(now.indexOf('data-testid="now"'), now.indexOf('data-testid="decisions"'));
  assert.match(part, /<span data-bucket="defect">ошибка в коде/);
  assert.doesNotMatch(part.replace(/<[^>]+>/g, ''), /defect 1/);
});

test('an unknown question state is never "nothing is needed" in the section either', () => {
  const odd: OperatorView = {
    ...view,
    questions: [{ ...view.questions[0]!, state: 'awaiting-something-new' }],
    works: view.works.filter((w) => w.id !== 'export-csv' && w.id !== 'docs-page'),
    progress: { ...view.progress, waitingOperator: 0 },
  };
  for (const [lang, re] of [
    ['ru', /Неизвестно: у вопроса состояние, которого панель не знает/],
    ['en', /Unknown: a question is in a state this panel does not know/],
  ] as const) {
    const html = renderToStaticMarkup(<Overview view={odd} lang={lang} />);
    const needs = html.slice(
      html.indexOf('data-testid="needs-you"'),
      html.indexOf('data-testid="now"'),
    );
    assert.match(needs, re);
    assert.doesNotMatch(needs, /ничего не нужно|Nothing is needed/);
  }
});
