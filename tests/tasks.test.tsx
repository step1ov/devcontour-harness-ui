// The alpha.4 screens: Tasks (replaces Reviews), the scope on the Overview,
// plain words over codes. Static markup over the demo fixtures and made-up
// variants; no browser.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Overview } from '../src/components/Overview.tsx';
import { Settings } from '../src/components/Settings.tsx';
import { Tasks } from '../src/components/Tasks.tsx';
import { checkView, type OperatorView } from '../src/model/index.ts';

const viewOf = (rel: string): OperatorView => {
  const c = checkView(JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')));
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const view = viewOf('../fixtures/ru/view.sample.json');
const stopped = viewOf('../fixtures/ru/view.stopped.json');
const href = (id: string) => '#/work/' + id;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
/** Visible text: «подробности» and glossary disclosures removed, tags stripped. */
const shown = (s: string) =>
  s
    .replace(/<details[\s\S]*?<\/details>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
/** One task card: from its `<li>` to the next card. */
const card = (markup: string, id: string) => {
  const found = markup
    .split('<li class="hui-card-ui')
    .find((c) => c.includes(`data-testid="task-${id}"`));
  assert.ok(found, id);
  return found;
};

test('task cards: now, attempts used and left, review rounds, who acts next, questions in full', () => {
  const ru = html(<Tasks view={view} lang="ru" workHref={href} timeZone="UTC" />);
  const running = shown(card(ru, 'locale-format'));
  assert.match(running, /Идёт работа/);
  assert.match(running, /Сейчас: этап «Проверки», идёт 7 мин 50 с\./);
  assert.match(running, /осталось на этапе: до 5 мин/);
  assert.match(running, /Попытки: израсходовано 2 из 3, осталось 1/);
  assert.match(running, /Ревью кода ещё не было/);
  assert.match(running, /Дальше действует: harness \(этап «Проверки»\)/);
  // The answered technical question of this task, with its full text and who answered.
  assert.match(running, /Вопросы по задаче \(1\)/);
  assert.match(running, /Какую библиотеку дат использовать для форматирования\?/);
  assert.match(running, /ответил ведущий \(технический вопрос\)/);
  const asking = shown(card(ru, 'export-csv'));
  assert.match(asking, /Ждёт ответа/);
  assert.match(asking, /Дальше действует: вы/);
  assert.match(asking, /Какой разделитель использовать в CSV\?/);
  assert.match(asking, /Что изменится:/);
  assert.match(asking, /Ответить можете только вы\./);
  assert.match(shown(card(ru, 'docs-page')), /Дальше: ждёт export-csv/);
  const done = card(ru, 'add-greeting');
  assert.match(shown(done), /Принята; от неё больше ничего не нужно\./);
  assert.match(done, /data-status="accepted"[^]*Принято локально; в удалённой ветке/);
  // Never a command to run instead of the question (F-Y), never a raw code outside «подробности».
  assert.doesNotMatch(ru, /input-show|--state/);
  assert.doesNotMatch(shown(ru), /INPUT_REQUIRED|DEPENDENCY_INCOMPLETE|NOT_READY/);
  assert.match(ru, /<details class="hui-term hui-codes"[^]*DEPENDENCY_INCOMPLETE/);
  // Plan review (no work) stays visible below the cards.
  assert.match(ru, /data-testid="other-reviews"[^]*Ревью плана и договоров \(1\)/);
  // The view has no scope: said, not guessed.
  assert.match(ru, /data-testid="scope-missing"/);
  // English parity.
  const en = shown(html(<Tasks view={viewOf('../fixtures/view.sample.json')} lang="en" />));
  assert.match(en, /Attempts: 2 of 3 used, 1 left/);
  assert.match(en, /Acts next: the harness \(stage “Checks”\)/);
});

test('stopped run: the lead first, then you; the dependent waits; no code in the text', () => {
  const ru = html(<Tasks view={stopped} lang="ru" workHref={href} />);
  const w1 = shown(card(ru, 'tw1a2b3c4d5e6f7a8b9c0'));
  assert.match(w1, /Остановлена/);
  assert.match(w1, /Дальше действует: ведущий, затем вы/);
  assert.match(w1, /Попытки: израсходовано 3 из 3, осталось 0/);
  const w2 = shown(card(ru, 'tw2a2b3c4d5e6f7a8b9c0'));
  assert.match(w2, /Начнётся после: WEB-1\./);
  assert.doesNotMatch(shown(ru), /ATTEMPTS_EXHAUSTED|APPROVAL_STALE|NOT_READY|reset-attempts/);
});

test('scope tasks not handed to the harness are listed with their state (harness alpha.59/60)', () => {
  const scoped = {
    ...view,
    scope: {
      tasks: [
        { id: 'T-1', workId: 'add-greeting', state: 'in-harness' },
        { id: 'T-7', title: 'Страница поиска', state: 'not-handed-over' },
        { id: 'T-8', title: 'Отзывы', state: 'not-ready', plain: 'критерии ещё не написаны' },
      ],
    },
  } as OperatorView;
  const tasks = shown(html(<Tasks view={scoped} lang="ru" />));
  assert.match(tasks, /Ещё не переданы в harness \(2\)/);
  assert.match(tasks, /Страница поиска не передана в harness/);
  assert.match(tasks, /Отзывы ждёт готовности критерии ещё не написаны/);
  const ov = html(<Overview view={scoped} lang="ru" />);
  assert.match(shown(ov), /Сделано 1 из 6 · в работе 1 · ждут 2 · ещё не переданы в harness: 2/);
  assert.match(ov, /aria-valuenow="1"[^>]*aria-valuetext="принято 1 из 6"/);
  assert.doesNotMatch(ov, /data-testid="scope-missing"/);
  // Six works left (4 in harness − 1 accepted + 2 outside): 3 rounds of 2 to 5 in a row.
  assert.match(shown(ov), /Осталось: 2,5–4,5 ч на 5 работ/);
});

test('overview: one plain sentence first, the whole scope, problems on the way in plain words', () => {
  const ru = html(<Overview view={view} lang="ru" workHref={href} />);
  const text = shown(ru);
  assert.match(
    ru,
    /data-testid="story">Сейчас harness работает над locale-format \(этап «Проверки»\)\.</,
  );
  assert.match(text, /Сделано 1 из 4 · в работе 1 · ждут 2/);
  assert.match(text, /Осталось: 1,5–2,5 ч на 3 работы — если каждой хватит одной попытки/);
  assert.match(text, /попытка в среднем длится 50 мин \(по 11 попыткам за окно истории\)/);
  assert.match(text, /Проблемы по ходу \(2\)/);
  assert.match(
    text,
    /locale-format : попытка 1 остановилась: проверка не прошла: lint нашёл лишний импорт/,
  );
  // The question in full, never a command (F-Y).
  assert.match(text, /Какой разделитель использовать в CSV\?/);
  assert.doesNotMatch(ru, /input-show/);
  // Unknown is never zero: without attempt totals no range is shown.
  const { totals: _t, ...history } = view.history;
  const noTotals = shown(html(<Overview view={{ ...view, history }} lang="ru" />));
  assert.match(noTotals, /Сколько осталось, пока сказать нельзя: нужно хотя бы 3 попытки/);
  assert.doesNotMatch(noTotals, /Осталось: 0|0 мин/);
});

test('a technical question the lead answers is not in «Нужно от вас» (F-W)', () => {
  const asking: OperatorView = {
    ...view,
    questions: view.questions.map((q) =>
      q.workId === 'locale-format' ? { ...q, state: 'awaiting-answer' } : q,
    ),
  };
  const ru = html(<Overview view={asking} lang="ru" />);
  const needs = ru.slice(
    ru.indexOf('data-testid="needs-you"'),
    ru.indexOf('data-testid="problems"'),
  );
  assert.match(needs, /Нужно от вас \(1\)/);
  assert.doesNotMatch(needs, /Какую библиотеку дат/);
  const lead = ru.slice(ru.indexOf('data-testid="by-lead"'));
  assert.match(shown(lead), /Какую библиотеку дат использовать для форматирования\?/);
  assert.match(shown(lead), /Отвечает ведущий: вопрос технический/);
  assert.match(shown(ru), /От вас: ответить на 1 вопрос\./);
});

test('the queue stands when no controller runs: never «Очередь идёт» (F-X)', () => {
  const ru = html(<Overview view={stopped} lang="ru" />);
  assert.match(ru, /data-testid="queue-state">Очередь стоит</);
  assert.doesNotMatch(ru, /Очередь идёт/);
  assert.match(
    shown(ru),
    /harness не запущен, и сама очередь не пойдёт — запустить заново \(harness run\) нужно ведущему/,
  );
  assert.match(shown(ru), /очередь стоит: harness не запущен/);
  // Raw codes only under «подробности» (F-AA).
  assert.doesNotMatch(shown(ru), /ATTEMPTS_EXHAUSTED|APPROVAL_STALE|NOT_READY|VIEW_TRUNCATED/);
  // Everything accepted: «Всё принято», nothing stands.
  const all: OperatorView = {
    ...view,
    progress: { ...view.progress, done: 4, running: 0, byStage: { done: 4 } },
    works: view.works.filter((w) => w.id === 'add-greeting'),
    questions: [],
    health: { ...view.health, controller: { present: false } },
  };
  const done = html(<Overview view={all} lang="ru" />);
  assert.match(done, /data-testid="queue-state">Всё принято</);
  assert.match(done, /Все работы приняты: 4 из 4\./);
});

test('settings: the appearance choice only when the host lets the viewer pick', () => {
  assert.doesNotMatch(html(<Settings view={view} lang="ru" />), /data-testid="settings-theme"/);
  const ru = html(<Settings view={view} lang="ru" theme="dark" onThemeChange={() => {}} />);
  assert.match(ru, /Оформление/);
  assert.match(ru, /role="radiogroup"[^>]*aria-label="Тема"/);
  assert.match(ru, /aria-checked="true"[^>]*value="dark"|value="dark"[^>]*aria-checked="true"/);
});
