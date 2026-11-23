// View revision 7 (harness 0.1.0-alpha.67): setup progress while there are
// no works (`stage.progress` of the overview and of the setup document),
// infrastructure works (`works[].kind: 'infra'`), the queue line that names
// a new run as the lead's move, and the `environment.reconciled` event
// as a known neutral one. A revision 6 document (`asAlpha66`) keeps the
// previous screens.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Activity,
  InfraBadge,
  Overview,
  SetupNote,
  SetupProgress,
  SetupScreen,
  Tasks,
  WorkDetail,
  checkOverview,
  checkView,
  checkWorkDetail,
  isInfraWork,
  setupElapsed,
  setupProgressOf,
  setupStepTone,
  type OperatorView,
  type WorkDetailView,
} from '../src/index.ts';
import { instantMs } from '../src/model/compat.ts';
import { asAlpha66 } from './legacy.ts';

type Json = Record<string, any>;
const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
const viewOf = (doc: Json): OperatorView => {
  const c = checkView(doc);
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const detailOf = (doc: Json): WorkDetailView => {
  const c = checkWorkDetail(doc);
  if (!c.ok) throw new Error(c.message);
  return c.detail;
};
const html = (el: ReactElement) => renderToStaticMarkup(el);
/** Visible text: tags out, entities decoded, spaces squeezed. */
const shown = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const TZ = 'UTC';
const ruProgress = read('../fixtures/ru/view.setup-progress.json');
const enProgress = read('../fixtures/view.setup-progress.json');
const ruSetup = read('../fixtures/ru/view.setup.json');
const ruSample = read('../fixtures/ru/view.sample.json');
const enSample = read('../fixtures/view.sample.json');
const realInit = read('./contract/harness/setup-progress.view.json').data;
const at = (doc: Json) => instantMs(doc.generatedAt);
const count = (m: string, s: string) => m.split(s).length - 1;

test('setup progress on the home: the harness line, the time, the budget exceeded and seven steps', () => {
  const view = viewOf(ruProgress);
  const m = html(<SetupNote view={view} lang="ru" now={at(ruProgress)} timeZone={TZ} />);
  const s = shown(m);
  // The stage lines stay as before («Идёт настройка harness», «Задач пока нет»).
  assert.match(s, /^Идёт настройка harness Задач пока нет/);
  // The progress line is not one of the stage lines: the block shows it itself.
  assert.ok(s.includes(ruProgress.stage.progress.line), s);
  assert.match(s, /Ход настройки идёт 42 мин \(с 09:00\) бюджет 30 мин/);
  assert.match(m, /data-testid="setup-over-budget"/);
  assert.match(s, /Превышен бюджет настройки/);
  assert.match(s, /работами инфраструктуры в плане, а не в настройке/);
  assert.equal(count(m, 'data-testid="setup-step"'), 7);
  // Each step: a dot of its state, the harness line, its time when recorded.
  for (const [id, state, tone] of [
    ['profile', 'done', 'passed'],
    ['doctor', 'unknown', 'unknown'],
    ['probe', 'failed', 'failed'],
    ['gates', 'pending', 'planned'],
    ['connector', 'skipped', 'skipped'],
  ])
    assert.match(
      m,
      new RegExp(
        `data-step="${id}" data-state="${state}"><span aria-hidden="true" class="hui-dot[^"]*" data-tone="${tone}"`,
      ),
      id,
    );
  assert.match(s, /smoke окружения: готово, 40 с \(готово\) · записано 09:12/);
  assert.match(s, /проба исполнителя: не прошло, 40 с \(не прошло\)/);
  // English: the harness `lineEn` of the block and of the steps.
  const e = shown(
    html(<SetupNote view={viewOf(enProgress)} lang="en" now={at(enProgress)} timeZone={TZ} />),
  );
  assert.ok(e.includes(enProgress.stage.progress.lineEn), e);
  assert.match(e, /Setup progress running 42m \(since 09:00\) budget 30m/);
  assert.match(e, /Setup budget exceeded/);
  assert.match(e, /writer probe: failed, 40 s \(failed\)/);
  assert.doesNotMatch(e, /проба|готово/);
});

test('setup time goes on with the viewer clock from `since`; never below the harness figure', () => {
  const p = setupProgressOf(ruProgress, 'ru')!;
  assert.equal(setupElapsed(p, at(ruProgress)), 42 * 60_000);
  // Ten minutes later on an unchanged document (the token leaves the elapsed time out).
  assert.equal(setupElapsed(p, at(ruProgress) + 10 * 60_000), 52 * 60_000);
  const later = shown(
    html(
      <SetupProgress view={ruProgress} lang="ru" now={at(ruProgress) + 600_000} timeZone={TZ} />,
    ),
  );
  assert.match(later, /идёт 52 мин/);
  // A clock behind the harness keeps the harness figure; no `since` — the figure as is.
  assert.equal(setupElapsed(p, at(ruProgress) - 3_600_000), 42 * 60_000);
  assert.equal(setupElapsed({ ...p, since: undefined }, at(ruProgress) + 600_000), 42 * 60_000);
  assert.equal(setupElapsed({ ...p, since: undefined, elapsedMs: undefined }, 0), undefined);
  assert.match(
    shown(html(<SetupProgress progress={{ overBudget: false, steps: [] }} lang="ru" />)),
    /сколько идёт настройка — неизвестно/,
  );
});

test('screens other than the home: the line and the time, no step list', () => {
  const m = html(
    <SetupNote view={viewOf(ruProgress)} lang="ru" steps={false} now={at(ruProgress)} />,
  );
  assert.match(m, /data-testid="setup-progress-line"/);
  assert.match(m, /data-testid="setup-over-budget"/);
  assert.doesNotMatch(m, /data-testid="setup-step"/);
});

test('a real overview right after harness init: under budget, two of five steps, no alarm', () => {
  const view = viewOf(realInit);
  const now = instantMs(realInit.generatedAt);
  const m = html(<SetupNote view={view} lang="en" now={now} timeZone={TZ} />);
  const s = shown(m);
  assert.ok(s.includes(realInit.stage.progress.lineEn), s);
  assert.match(s, /budget 30m /);
  assert.doesNotMatch(m, /setup-over-budget|data-over-budget/);
  assert.equal(count(m, 'data-testid="setup-step"'), 7);
  assert.match(s, /stack profile: done, built-in npm-ci/);
  assert.match(s, /task source connector: not needed, graph files/);
  // The budget badge is neutral while under budget.
  assert.doesNotMatch(
    m,
    /data-testid="setup-budget"[^>]*hui:bg-warn-soft|hui:bg-warn-soft[^>]*data-testid="setup-budget"/,
  );
});

test('the setup document shows the progress too; alpha.66 documents keep the old screen', () => {
  const doc = {
    ...ruSetup,
    viewRevision: 7,
    stage: { ...ruSetup.stage, progress: ruProgress.stage.progress },
  };
  const c = checkOverview(doc);
  assert.equal(c.ok && 'setup' in c, true);
  const m = html(<SetupScreen view={doc} lang="ru" now={at(ruProgress)} timeZone={TZ} />);
  const s = shown(m);
  assert.match(s, /^Идёт настройка harness Задач пока нет/);
  assert.match(s, /ждёт политику/);
  assert.ok(s.includes(ruProgress.stage.progress.line));
  assert.equal(count(m, 'data-testid="setup-step"'), 7);
  // Any screen a host passes the document to shows the same block.
  assert.match(html(<Tasks view={doc as never} lang="ru" />), /data-testid="setup-progress"/);
  // Revision 6 (alpha.66): no progress, no block, the same lines and wait as before.
  for (const old of [asAlpha66(doc), asAlpha66(ruProgress)]) {
    const o = html(
      'setup' in old ? (
        <SetupScreen view={old} lang="ru" />
      ) : (
        <SetupNote view={viewOf(old)} lang="ru" />
      ),
    );
    assert.doesNotMatch(o, /setup-progress/);
    assert.match(shown(o), /Идёт настройка harness Задач пока нет/);
  }
});

test('setup progress is read tolerantly: missing fields, unknown states, other languages', () => {
  assert.equal(setupProgressOf(undefined), undefined);
  assert.equal(setupProgressOf({ stage: { name: 'setup', lines: [] } }), undefined);
  assert.equal(setupProgressOf({ stage: { progress: 'x' } }), undefined);
  const p = setupProgressOf(
    {
      stage: {
        progress: {
          steps: [
            { id: 'smoke', state: 'running', elapsedMs: 40_000 },
            { id: 'new-step', state: 'done' },
            { state: 'done' },
            'junk',
            { id: 'gates', state: 'failed', at: 'not a time', lineEn: 'gates on HEAD: failed' },
          ],
          budgetMs: 0,
          overBudget: 'true',
          lineEn: 'Setup: only English',
        },
      },
    },
    'ru',
  )!;
  // A state this build does not know reads as unknown; a step without an id is skipped.
  assert.deepEqual(
    p.steps.map((s) => [s.id, s.state]),
    [
      ['smoke', 'unknown'],
      ['new-step', 'done'],
      ['gates', 'failed'],
    ],
  );
  assert.equal(p.steps[2]!.at, undefined, 'a bad instant is not shown');
  // Only `true` is over budget; a zero budget is no budget; the other language as a fallback.
  assert.equal(p.overBudget, false);
  assert.equal(p.budgetMs, undefined);
  assert.equal(p.line, 'Setup: only English');
  assert.equal(p.steps[2]!.line, 'gates on HEAD: failed');
  const m = shown(html(<SetupProgress progress={p} lang="ru" />));
  // Without a harness line the panel's own words: name, state, duration.
  assert.match(m, /smoke окружения: итог не записывается, 40 с/);
  assert.match(m, /new-step: готово/);
  assert.doesNotMatch(m, /бюджет/);
  assert.equal(setupStepTone('done'), 'passed');
  assert.equal(setupStepTone('unknown'), 'unknown');
  // An empty step list says so instead of an empty box.
  assert.match(
    shown(html(<SetupProgress progress={{ overBudget: true, steps: [] }} lang="en" />)),
    /Setup budget exceeded.*The harness sent no setup steps\./,
  );
});

/** The sample with its first open work as an infrastructure work (revision 7). */
function withInfra(doc: Json): Json {
  const d = structuredClone(doc);
  d.viewRevision = 7;
  d.works.find((w: Json) => w.id === 'locale-format').kind = 'infra';
  return d;
}

test('an infrastructure work carries «инфраструктура» on its card, in the plan and in its detail', () => {
  const view = viewOf(withInfra(ruSample));
  assert.equal(isInfraWork(view.works.find((w) => w.id === 'locale-format')), true);
  assert.equal(isInfraWork(view.works.find((w) => w.id === 'add-greeting')), false);
  const tasks = html(<Tasks view={view} lang="ru" now={at(ruSample)} timeZone={TZ} />);
  const card = tasks.slice(
    tasks.indexOf('data-testid="task-locale-format"'),
    tasks.indexOf('</li>', tasks.indexOf('data-testid="task-locale-format"')),
  );
  assert.match(card, /data-testid="infra-badge"[^>]*>инфраструктура</);
  assert.equal(count(tasks, 'data-testid="infra-badge"'), 1, 'only the infra work');
  // The home: the plan and the running list (the work is in gates).
  const home = html(<Overview view={view} lang="ru" now={at(ruSample)} timeZone={TZ} />);
  assert.equal(count(home, 'data-testid="infra-badge"'), 2);
  // Otherwise a normal task: the same phase, attempts and path as without the kind.
  const plain = html(<Tasks view={viewOf(ruSample)} lang="ru" now={at(ruSample)} timeZone={TZ} />);
  assert.equal(shown(tasks).replace(/ инфраструктура/g, ''), shown(plain));
  const detail = structuredClone(read('../fixtures/ru/work.sample.json'));
  detail.viewRevision = 7;
  detail.work.kind = 'infra';
  const d = html(<WorkDetail detail={detailOf(detail)} lang="ru" now={at(detail)} timeZone={TZ} />);
  assert.match(d, /data-testid="infra-badge"/);
  assert.match(shown(d), /Работа инфраструктуры harness: мосты окружения/);
  // English, and nothing for another kind or an alpha.66 document.
  assert.match(html(<InfraBadge kind="infra" lang="en" />), />infrastructure</);
  assert.equal(html(<InfraBadge kind="product" />), '');
  assert.equal(html(<InfraBadge />), '');
  const old = html(<Tasks view={viewOf(asAlpha66(withInfra(enSample)))} lang="en" />);
  assert.doesNotMatch(old, /infra-badge/);
});

const START_RUN =
  'Очередь стоит — никто не запущен: запустите harness run: готово 2 задачи, вопрос блокирует только export-csv (ведущий).';

/** Nobody runs while works are ready and a question holds only its own work (harness alpha.67). */
function standing(doc: Json, line = START_RUN, restartBy: string | undefined = 'lead'): Json {
  const d = structuredClone(doc);
  d.viewRevision = 7;
  d.progress.queue = {
    paused: false,
    runner: 'not-running',
    ...(restartBy ? { restartBy } : {}),
    line,
  };
  return d;
}

test('the queue line «запустите harness run» stands out on the home as the lead’s move', () => {
  const view = viewOf(standing(ruSample));
  const m = html(<Overview view={view} lang="ru" now={at(ruSample)} timeZone={TZ} />);
  const block = m.slice(m.lastIndexOf('<', m.indexOf('data-testid="lead-next-move"')));
  assert.ok(block.length < m.length, 'the lead-move block is there');
  assert.match(
    shown(block),
    new RegExp(`^Очередь — за ведущим ${START_RUN.replace(/[().]/g, '\\$&')} — запускает: ведущий`),
  );
  // The badge says the queue stands, the line is in the hero once and among the problems.
  assert.match(m, /data-testid="queue-state"[^>]*>Очередь стоит</);
  assert.equal(count(m, 'data-testid="queue-who"'), 1);
  const problems = shown(m.slice(m.indexOf('data-testid="problems"')));
  assert.ok(problems.includes(START_RUN), 'in «Проблемы по ходу» too');
  // Without `restartBy` the lead restarts by default.
  const bare = html(
    <Overview
      view={viewOf(standing(ruSample, START_RUN, undefined))}
      lang="ru"
      now={at(ruSample)}
    />,
  );
  assert.match(shown(bare), /Очередь — за ведущим .* — запускает: ведущий/);
  // Another actor restarts: no lead move, the inline line as before.
  const other = html(
    <Overview
      view={viewOf(standing(ruSample, START_RUN, 'operator'))}
      lang="ru"
      now={at(ruSample)}
    />,
  );
  assert.doesNotMatch(other, /lead-next-move/);
  assert.match(shown(other), /запустите harness run.* — запускает: вы/);
  // English.
  const en = html(
    <Overview
      view={viewOf(
        standing(
          enSample,
          'The queue is idle — nothing is running: start harness run: 2 tasks are ready, the question blocks only export-csv (the lead).',
        ),
      )}
      lang="en"
      now={at(enSample)}
    />,
  );
  assert.match(
    shown(en),
    /The queue is up to the lead The queue is idle — nothing is running: start harness run/,
  );
  // Harness alpha.67: no task is ready — a question holds them all. The same
  // block, but nothing in the panel's words tells to start a run now.
  const held =
    'Очередь стоит — никто не запущен: готовых задач нет — вопрос держит export-csv; после ответа нужен новый запуск (ведущий: harness run).';
  const h = html(<Overview view={viewOf(standing(ruSample, held))} lang="ru" now={at(ruSample)} />);
  const hb = shown(h.slice(h.lastIndexOf('<', h.indexOf('data-testid="lead-next-move"'))));
  assert.ok(hb.startsWith(`Очередь — за ведущим ${held} — запускает: ведущий`), hb);
  assert.doesNotMatch(hb.slice(0, hb.indexOf(held)), /запуст|start|ход/i);
  // A running queue has no lead move.
  assert.doesNotMatch(html(<Overview view={viewOf(ruSample)} lang="ru" />), /lead-next-move/);
});

test('`environment.reconciled` is a known neutral event, not an unknown one', () => {
  for (const [doc, lang, word] of [
    [ruSample, 'ru', 'окружение сверено'],
    [enSample, 'en', 'environment reconciled'],
  ] as const) {
    const d = structuredClone(doc);
    d.viewRevision = 7;
    d.activity = [
      {
        at: d.history.to,
        actor: 'operator',
        action: 'environment.reconciled',
        plain:
          lang === 'ru'
            ? 'запись smoke LS-1 сверена: ресурсов не осталось'
            : 'smoke record LS-1 reconciled',
      },
      ...d.activity,
    ];
    const m = html(<Activity view={viewOf(d)} lang={lang} now={at(d)} timeZone={TZ} />);
    assert.match(
      m,
      new RegExp(`data-testid="event-kind" data-action="environment.reconciled"[^>]*>${word}<`),
    );
    assert.equal(
      count(m, 'data-testid="event-kind"'),
      1,
      'other events keep their plain line only',
    );
    // Neutral: the muted badge, not a warning or an error tone.
    const badge = m.slice(
      m.lastIndexOf('<span', m.indexOf('data-testid="event-kind"')),
      m.indexOf('data-testid="event-kind"'),
    );
    assert.match(badge, /hui:bg-muted/);
    assert.doesNotMatch(badge, /warn|bad/);
  }
});
