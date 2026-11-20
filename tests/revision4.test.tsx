// View revision 4 (harness 0.1.0-alpha.60): the release forecast rings, the
// queue runner, the order of removal of blockers, the failure class and
// whether the attempt counts, the plan-review stage, question options, owner
// questions from the task tracker, the run slice, tracker health and
// updates. The fixtures are revision 4; `asAlpha59` gives the same document
// as harness alpha.59 sends it.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Health,
  Overview,
  Settings,
  Tasks,
  UpdatesBanner,
  WorkDetail,
  checkView,
  checkWorkDetail,
  leadStopOf,
  actorsOn,
  nextSteps,
  remainingWords,
  taskCard,
  timeState,
  type OperatorView,
  type WorkView,
} from '../src/index.ts';
import { asAlpha59 } from './legacy.ts';

type Json = Record<string, any>;
const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
const viewOf = (doc: Json): OperatorView => {
  const c = checkView(doc);
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const ru = read('../fixtures/ru/view.sample.json');
const en = read('../fixtures/view.sample.json');
const ruStopped = read('../fixtures/ru/view.stopped.json');
const html = (el: ReactElement) => renderToStaticMarkup(el);
/** Visible text without disclosures. */
const shown = (s: string) =>
  s
    .replace(/<details[\s\S]*?<\/details>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const overview = (doc: Json, lang: 'ru' | 'en' = 'ru') =>
  html(<Overview view={viewOf(doc)} lang={lang} timeZone="UTC" />);
/** The ring element (role=progressbar) of a tile. */
const ring = (markup: string, testid: string) => {
  const tile = markup.split(`data-testid="${testid}"`)[1]!;
  return /<div[^>]*role="progressbar"[^>]*>/.exec(tile)![0];
};

test('two big rings at the top: «До релиза» with the harness line, «Время» with elapsed and range', () => {
  const m = overview(ru);
  // The rings come first, before the story sentence.
  assert.ok(m.indexOf('data-testid="forecast"') < m.indexOf('data-testid="story"'));
  const release = ring(m, 'ring-release');
  assert.match(release, /aria-valuenow="23"/);
  assert.match(release, /aria-valuemin="0"/);
  assert.match(release, /aria-valuemax="100"/);
  assert.match(
    release,
    /aria-valuetext="До релиза: готово ~23 %, осталось задач: 5 из 6, в работе: 1"/,
  );
  assert.match(release, /aria-labelledby="[^"]+"/);
  const t = shown(m);
  assert.match(t, /До релиза ~23 % готово готово ~23 %, осталось задач: 5 из 6, в работе: 1/);
  assert.match(t, /Считается по всем задачам прогона, включая ещё не переданные в harness\./);
  // Time: elapsed and the remaining range from the forecast numbers.
  assert.match(t, /прошло 2 ч 50 мин · осталось ~1,5–3 ч/);
  const time = ring(m, 'ring-time');
  assert.match(time, /data-state="known"/);
  // Geometry: elapsed / (elapsed + upper end) — 10.2 / (10.2 + 10.8) h.
  assert.match(time, /aria-valuenow="49"/);
  assert.match(time, /aria-valuetext="Время: прошло 2 ч 50 мин · осталось ~1,5–3 ч"/);
  assert.match(t, /По 6 закончившимся попыткам; попыток на принятую задачу — 1,2\./);
  // Waiting for people apart, and not in the forecast.
  assert.match(
    t,
    /Ждут людей или ведущего сейчас: 1 работа, дольше всех — 20 мин\. В прогноз это не входит\./,
  );
  // Assumptions under «что это значит», with the harness lines.
  const details = /data-testid="forecast-assumptions"[\s\S]*?<\/details>/.exec(m)![0];
  assert.match(text(details), /что это значит/);
  assert.match(text(details), /ожидание людей и ведущего в прогноз не входит/);
  assert.match(text(details), /Так же это пишет harness status: готово ~23 %/);
  // The alpha.4 bar and the panel's own estimate are gone with a forecast.
  assert.doesNotMatch(m, /data-testid="eta"/);
  assert.doesNotMatch(m, /data-testid="forecast-missing"/);
  // Nor the panel's attempt average on waiting works.
  assert.doesNotMatch(m, /одна попытка в среднем/);
  assert.match(overview(asAlpha59(ru)), /одна попытка в среднем/);
  assert.doesNotMatch(m, /role="progressbar"[^>]*aria-label="принято/);
});

test('an unknown remaining time is a ring in the «неизвестно» state with its reason, never a zero', () => {
  const m = overview(ruStopped);
  const time = ring(m, 'ring-time');
  assert.match(time, /data-state="unknown"/);
  assert.doesNotMatch(time, /aria-valuenow/);
  assert.match(time, /aria-valuetext="Время: прошло 50 мин · сколько осталось — неизвестно"/);
  const tile = shown(m.split('data-testid="ring-time"')[1]!.split('data-testid="human-wait"')[0]!);
  assert.match(tile, /\? неизвестно/);
  assert.match(tile, /Почему неизвестно: закончившихся попыток пока слишком мало/);
  assert.doesNotMatch(tile, /(^|\D)0 (мин|ч|с)\b/);
  assert.match(m, /data-unknown="true"/);
  // Done is a known zero: the release ring says 0 % with the harness line.
  assert.match(ring(m, 'ring-release'), /aria-valuenow="0"/);
  assert.match(shown(m), /Считается только по работам harness/);
  // Not started yet: elapsed is not invented either.
  const f = structuredClone(ruStopped);
  delete f.forecast.time.elapsedMs;
  delete f.forecast.time.startedAt;
  assert.match(shown(overview(f)), /ещё не начиналось · сколько осталось — неизвестно/);
  // A remaining range without any elapsed time keeps the range (no share to draw).
  const g = structuredClone(ru);
  delete g.forecast.time.elapsedMs;
  delete g.forecast.time.startedAt;
  assert.equal(timeState(viewOf(g).forecast!, 'ru').kind, 'noElapsed');
});

test('nothing left: a full time ring, no range', () => {
  const f = structuredClone(ru);
  Object.assign(f.forecast.progress, { percent: 100, left: 0, done: 6, inWork: 0, weighted: 6 });
  delete f.forecast.time.remaining;
  const m = overview(f);
  assert.match(ring(m, 'ring-time'), /aria-valuenow="100"/);
  assert.match(shown(m), /прошло 2 ч 50 мин · осталось: ничего/);
});

test('remaining words: rounded outward, «до» under a minute at the low end', () => {
  assert.equal(remainingWords({ loMs: 5_400_000, hiMs: 10_800_000 }, 'ru'), '~1,5–3 ч');
  assert.equal(remainingWords({ loMs: 30_000, hiMs: 300_000 }, 'ru'), 'до 5 мин');
  assert.equal(remainingWords({ loMs: 600_000, hiMs: 600_000 }, 'en'), '~10 min');
  assert.equal(remainingWords({ loMs: 1_000, hiMs: 2_000 }, 'en'), '~under a minute');
});

test('without a forecast (harness alpha.59) the alpha.4 bar stays and the panel says why', () => {
  const m = overview(asAlpha59(ru));
  assert.doesNotMatch(m, /data-testid="forecast"/);
  assert.match(
    shown(m),
    /Круговые индикаторы «До релиза» и «Время» показываются с devcontour-harness 0\.1\.0-alpha\.60/,
  );
  assert.match(m, /data-testid="eta"/);
  assert.match(m, /role="progressbar"/);
  assert.match(shown(overview(asAlpha59(en), 'en')), /this harness version sends no forecast/);
  // Revision 4 without a forecast (no works or all cancelled): not blamed on the version.
  const none = structuredClone(ru);
  delete none.forecast;
  const n = shown(overview(none));
  assert.match(n, /В этом представлении harness нет прогноза; ниже — прежняя оценка панели\./);
  assert.doesNotMatch(n, /эта версия harness не сообщает прогноз/);
});

test('English rings', () => {
  const t = shown(overview(en, 'en'));
  assert.match(t, /To release ~23 % done done ~23 %, 5 of 6 task\(s\) left, 1 in work/);
  assert.match(t, /elapsed 2 h 50 min · left ~1\.5–3 h/);
  assert.match(t, /Waiting for people or the lead now: 1 work, the longest for 20 min/);
});

test('the queue runner comes from the harness: its line and who restarts, no panel guess', () => {
  const m = shown(overview(ruStopped));
  assert.match(m, /Очередь стоит/);
  assert.match(
    m,
    /Очередь стоит — никто не запущен: после ответа или решения нужен новый запуск \(ведущий: harness run\)\. — запускает: ведущий/,
  );
  assert.doesNotMatch(m, /harness не запущен, и сама очередь не пойдёт/);
  // The harness says someone runs it: no «стоит», whatever the controller field says.
  const running = structuredClone(ruStopped);
  running.progress.queue = {
    paused: false,
    runner: 'running',
    line: 'Очередь идёт: harness запущен.',
  };
  running.health.controller = { present: false };
  const r = overview(running);
  assert.doesNotMatch(shown(r), /Очередь стоит/);
  // The harness line is shown whatever the state, not only when the queue stands.
  assert.match(r, /data-testid="queue-line"[^>]*>Очередь идёт: harness запущен\.</);
  // And «not-running» stands even with a controller lease in the view.
  const idle = structuredClone(ru);
  idle.progress.queue = { paused: false, runner: 'not-running', restartBy: 'lead' };
  idle.health.controller = { present: true };
  const i = shown(overview(idle));
  assert.match(i, /Очередь стоит/);
  // Without a harness line the panel's own words, still with who acts.
  assert.match(
    i,
    /harness не запущен, и сама очередь не пойдёт — ведущему нужно снова запустить harness/,
  );
});

test('blockers[].step orders who goes first; without steps the alpha.4 code list', () => {
  // Fixture: WEB-1 — the stale approval (lead) step 1, the reset (you) step 2.
  const s = nextSteps(viewOf(ruStopped));
  const reset = s.operator.find((x) => x.action === 'reset-attempts')!;
  assert.equal(reset.ordered, true);
  assert.deepEqual(
    reset.after.map((x) => [x.actor, x.code, x.step]),
    [['lead', 'APPROVAL_STALE', 1]],
  );
  // Reversed by the harness: the reset goes first, nothing before it.
  const rev = structuredClone(ruStopped);
  rev.works[0].blockers[0].step = 2;
  rev.works[0].blockers[1].step = 1;
  const r = nextSteps(viewOf(rev)).operator.find((x) => x.action === 'reset-attempts')!;
  assert.deepEqual(r.after, []);
  assert.doesNotMatch(shown(overview(rev)), /Сначала ведущий/);
  // A harness order for a code the panel's list does not know is followed too.
  const other = structuredClone(ruStopped);
  other.works[0].blockers[0] = {
    code: 'BUDGET_EXHAUSTED',
    plain: 'бюджет исчерпан — нужно поднять предел',
    actor: 'lead',
    step: 1,
  };
  const o = nextSteps(viewOf(other)).operator.find((x) => x.action === 'reset-attempts')!;
  assert.deepEqual(
    o.after.map((x) => x.code),
    ['BUDGET_EXHAUSTED'],
  );
  assert.match(
    shown(overview(other)),
    /Сначала ведущий: бюджет исчерпан — нужно поднять предел\. Затем — вы\./,
  );
  // The same code without any step (alpha.59): the panel's list knows no such lead-first code.
  const old = nextSteps(viewOf(asAlpha59(other))).operator.find(
    (x) => x.action === 'reset-attempts',
  )!;
  assert.deepEqual(old.after, []);
  assert.equal(old.ordered, undefined);
});

const stoppedWork = (lastFailure: Json, needs = { actor: 'lead', action: 'diagnose-failure' }) => {
  const d = structuredClone(ruStopped);
  const w = d.works[0];
  w.blockers = [{ code: 'NEEDS_LEAD', plain: 'нужен ведущий', actor: 'lead' }];
  w.stage = { ...w.stage, needs };
  w.attempts.lastFailure = { attempt: 2, at: '2026-11-20T09:20:24.198Z', ...lastFailure };
  return d;
};

test('lastFailure.kind and counted replace the phrase matching of the writer-environment stop', () => {
  // Revision 4: needs-lead, not counted, the lead acts now — the harness sentence, no guessed subtype
  // (a preflight stop has the same facts as a writer-environment one).
  const env = stoppedWork({
    bucket: 'environment',
    plain: 'окружение: исполнителю закрыт локальный сервер',
    kind: 'needs-lead',
    counted: false,
  });
  assert.deepEqual(leadStopOf(viewOf(env).works[0]!, 4), { env: false });
  const m = shown(overview(env));
  assert.match(
    m,
    /попытка 2: ждёт ведущего — работа остановилась до результата; попытка не засчитана \(окружение: исполнителю закрыт локальный сервер\)/,
  );
  assert.doesNotMatch(m, /окружение не дало исполнителю/);
  // The harness phrase with another class is not this stop in revision 4.
  const phrase = stoppedWork({
    bucket: 'environment',
    plain: 'окружение — окружение закрыло исполнителю обязательный шаг: listen EPERM',
    kind: 'environment',
    counted: true,
  });
  assert.equal(leadStopOf(viewOf(phrase).works[0]!, 4), undefined);
  assert.match(
    shown(overview(phrase)),
    /попытка 2 остановилась: окружение — окружение закрыло исполнителю обязательный шаг: listen EPERM; попытка засчитана/,
  );
  // A revision 4 document without the fields says nothing: the phrase is not read (unknown).
  const bare = structuredClone(phrase);
  delete bare.works[0].attempts.lastFailure.kind;
  delete bare.works[0].attempts.lastFailure.counted;
  assert.equal(leadStopOf(viewOf(bare).works[0]!, 4), undefined);
  assert.doesNotMatch(shown(overview(bare)), /не засчитана/);
  // A supplied `counted: true` is never overridden by the phrase, at any revision.
  const countedOld = structuredClone(bare);
  countedOld.works[0].attempts.lastFailure.counted = true;
  assert.equal(leadStopOf(viewOf(countedOld).works[0]!, 3), undefined);
  // …while the same phrase in an alpha.59 document still is the old reading.
  const old = viewOf(asAlpha59(phrase));
  assert.deepEqual(leadStopOf(old.works[0]!, old.viewRevision), {
    env: true,
    summary: 'listen EPERM',
  });
  // The stop is now; a later operator-owned need wins over the historical failure.
  const later = stoppedWork(
    {
      bucket: 'incomplete',
      plain: 'исполнитель не изменил ни файла',
      kind: 'needs-lead',
      counted: false,
    },
    { actor: 'operator', action: 'reset-attempts' },
  );
  assert.equal(leadStopOf(viewOf(later).works[0]!, 4), undefined);
  const lt = shown(html(<Tasks view={viewOf(later)} lang="ru" />));
  assert.doesNotMatch(lt, /Ждёт ведущего/);
  assert.match(lt, /попытка 2 остановилась: исполнитель не изменил ни файла; попытка не засчитана/);
  // A lead stop outside the environment: its own words, still not counted.
  const empty = stoppedWork({
    bucket: 'incomplete',
    plain: 'исполнитель не изменил ни файла',
    kind: 'needs-lead',
    counted: false,
  });
  assert.deepEqual(leadStopOf(viewOf(empty).works[0]!, 4), { env: false });
  const tasks = shown(html(<Tasks view={viewOf(empty)} lang="ru" />));
  assert.match(tasks, /Ждёт ведущего: работа остановилась до результата\. Попытка не засчитана\./);
  assert.match(
    tasks,
    /попытка 2 остановилась: исполнитель не изменил ни файла; попытка не засчитана/,
  );
  // A counted needs-lead is not «не засчитана».
  const counted = stoppedWork({
    bucket: 'incomplete',
    plain: 'x',
    kind: 'needs-lead',
    counted: true,
  });
  assert.equal(leadStopOf(viewOf(counted).works[0]!, 4), undefined);
});

test('the elapsed time and the wait go on with the clock from the harness start points', () => {
  // The harness keeps durations out of its content token: an unchanged document stays on screen.
  const later = Date.parse(ru.generatedAt) + 61_000;
  const t = shown(html(<Overview view={viewOf(ru)} lang="ru" timeZone="UTC" now={later} />));
  assert.match(t, /прошло 2 ч 51 мин/);
  assert.match(t, /дольше всех — 21 мин/);
  // Never below the harness figure (a viewer clock behind the producer).
  const early = Date.parse(ru.generatedAt) - 600_000;
  assert.match(
    shown(html(<Overview view={viewOf(ru)} lang="ru" timeZone="UTC" now={early} />)),
    /прошло 2 ч 50 мин/,
  );
});

test('a question after a lead step: the harness order, in the item and in who acts', () => {
  const d = structuredClone(ru);
  const w = d.works.find((x: Json) => x.id === 'export-csv');
  w.blockers = [
    { code: 'APPROVAL_STALE', plain: 'нужно согласовать план заново', actor: 'lead', step: 1 },
    { ...w.blockers[0], step: 2 },
  ];
  const v = viewOf(d);
  const s = nextSteps(v);
  assert.deepEqual(
    s.questionAfter.get('export-csv')!.map((x) => [x.actor, x.code]),
    [['lead', 'APPROVAL_STALE']],
  );
  assert.deepEqual(actorsOn(s, 'export-csv', v), ['lead', 'operator']);
  const m = shown(overview(d));
  assert.match(m, /Сначала ведущий: нужно согласовать план заново\. Затем — вы\./);
  assert.match(shown(html(<Tasks view={v} lang="ru" />)), /Дальше действует: ведущий, затем вы/);
  // Without steps there is no order for a question.
  assert.equal(nextSteps(viewOf(asAlpha59(d))).questionAfter.size, 0);
});

test('a work question line shows on the card when the question list does not carry it', () => {
  const d = structuredClone(ru);
  const w = d.works.find((x: Json) => x.id === 'export-csv');
  w.question.line =
    'ответ был у попытки 1, она остановилась до передачи исполнителю — его получит следующая попытка';
  d.questions = d.questions.filter((q: Json) => q.workId !== 'export-csv');
  d.truncated = { questions: 1 };
  const t = shown(html(<Tasks view={viewOf(d)} lang="ru" />));
  assert.match(t, /его получит следующая попытка/);
  // The question is listed but carries no line: the work's line is shown.
  const noLine = structuredClone(ru);
  noLine.works.find((x: Json) => x.id === 'export-csv').question.line = 'строка работы';
  assert.match(shown(html(<Tasks view={viewOf(noLine)} lang="ru" />)), /строка работы/);
  // The listed question has its own line: it is shown once, the work's not again.
  const both = structuredClone(noLine);
  both.questions.find((q: Json) => q.workId === 'export-csv').line = 'строка вопроса';
  const b = shown(html(<Tasks view={viewOf(both)} lang="ru" />));
  assert.match(b, /строка вопроса/);
  assert.doesNotMatch(b, /строка работы/);
  // The work detail does the same.
  const detail = read('../fixtures/ru/work.sample.json');
  detail.work.question = {
    requestId: 'q-99',
    state: 'applied-awaiting-claim',
    severity: 5,
    line: 'ответ у идущей попытки 3 — ждать нечего',
  };
  const c = checkWorkDetail(detail);
  assert.ok(c.ok);
  assert.match(
    shown(html(<WorkDetail detail={c.detail} lang="ru" />)),
    /ответ у идущей попытки 3 — ждать нечего/,
  );
});

test('a dropped tracker question list is never «nothing is needed»; a dropped scope is named', () => {
  const d = structuredClone(ruStopped);
  d.truncated = { sourceQuestions: 5, scope: 12 };
  const m = shown(overview(d));
  assert.doesNotMatch(m, /ничего не нужно/);
  assert.match(m, /и, возможно, ещё \(список обрезан\)/);
  assert.match(m, /ещё 5 вопросов из трекера не показано/);
  assert.match(m, /Срез прогона \(12 задач\) не поместился в представление/);
  const t = shown(html(<Tasks view={viewOf(d)} lang="ru" />));
  assert.match(t, /Срез прогона \(12 задач\) не поместился в представление/);
});

test('the work detail says whether the last attempt counted', () => {
  const d = read('../fixtures/ru/work.sample.json');
  const c = checkWorkDetail(d);
  assert.ok(c.ok);
  const m = html(<WorkDetail detail={c.detail} lang="ru" />);
  assert.match(m, /data-testid="failure-counted"/);
  assert.match(shown(m), /попытка засчитана\./);
  const c3 = checkWorkDetail(asAlpha59(d));
  assert.ok(c3.ok);
  assert.doesNotMatch(html(<WorkDetail detail={c3.detail} lang="ru" />), /failure-counted/);
});

test('the plan-review stage: labelled, and the harness acts (not «контроллер», not waiting)', () => {
  const d = structuredClone(ruStopped);
  const w = d.works[1];
  w.stage = {
    name: 'plan-review',
    since: '2026-11-20T09:22:00.000Z',
    next: ['writer'],
    needs: { actor: 'controller', action: 'review-plan' },
  };
  w.blockers = [{ code: 'APPROVAL_STALE', plain: 'идёт ревью плана', actor: 'controller' }];
  w.dependsOn = [];
  d.escalations = d.escalations.filter((e: Json) => e.workId !== w.id);
  const v = viewOf(d);
  const card = taskCard(v, nextSteps(v), v.works[1] as WorkView);
  assert.equal(card.phase, 'running');
  assert.deepEqual(card.next, { kind: 'harness', stage: 'plan-review' });
  const t = shown(html(<Tasks view={v} lang="ru" />));
  assert.match(t, /Дальше действует: harness \(этап «Ревью плана»\)/);
  // The story says the harness reviews the plan, not that works wait for the lead.
  assert.match(shown(overview(d)), /Сейчас harness проводит ревью плана: WEB-2/);
  assert.match(shown(html(<Tasks view={v} lang="en" />)), /Plan review/);
});

test('question options with the recommended one, the rationale and where the answer is', () => {
  const m = overview(ru);
  const q = m.split('data-kind="question"')[1]!.split('data-kind="source-question"')[0]!;
  assert.match(text(q), /Варианты ответа: запятая \(,\) точка с запятой \(;\) рекомендуется/);
  assert.match(q, /data-recommended="true"[^>]*>точка с запятой/);
  assert.match(
    text(q),
    /Обоснование исполнителя: табличные программы с русской локалью открывают файл с «;» без настройки/,
  );
  // An answered question says where the applied answer is.
  assert.match(shown(m), /ответ передан попытке 2/);
  const tasks = shown(html(<Tasks view={viewOf(ru)} lang="ru" />));
  assert.match(tasks, /точка с запятой \(;\) рекомендуется/);
  assert.match(tasks, /ответ передан попытке 2/);
  // alpha.59: none of it, no empty headings.
  assert.doesNotMatch(overview(asAlpha59(ru)), /question-options|question-rationale|question-line/);
});

test('owner questions from the tracker are in «Нужно от вас» with a link, answered there', () => {
  const m = overview(ru);
  const t = shown(m);
  assert.match(t, /Нужно от вас \(2\)/);
  assert.match(t, /вопрос в трекере Вопрос: нужна ли выгрузка в Excel\?/);
  assert.match(t, /Делать ли вместе с CSV выгрузку в \.xlsx\?/);
  assert.match(t, /Варианты ответа: только CSV CSV и \.xlsx/);
  assert.match(t, /Рекомендация: в этом выпуске только CSV; \.xlsx — отдельной задачей/);
  assert.match(t, /Пока ответа нет, работа идёт с временным ответом: работа идёт только с CSV/);
  assert.match(t, /Задачи: DEMO-3/);
  assert.match(
    t,
    /Отвечают в трекере задач, панель только показывает вопрос\. Открыть Q-41 в трекере/,
  );
  assert.match(
    m,
    /<a href="https:\/\/relay\.example\.test\/docs\/Q-41" target="_blank" rel="noopener noreferrer" data-testid="source-link">/,
  );
  assert.match(t, /Прочитано из трекера 11:55; это не живое чтение\./);
  // The header counts them as questions for you.
  assert.match(t, /ответить на 2 вопроса/);
  // Only an http(s) page is a link.
  const bad = structuredClone(ru);
  bad.sourceQuestions[0].url = 'javascript:alert(1)';
  const b = overview(bad);
  assert.doesNotMatch(b, /data-testid="source-link"/);
  assert.doesNotMatch(b, /javascript:/);
  assert.match(shown(b), /документ Q-41 в трекере/);
  // Clipped by the view: said, never silently.
  const clipped = structuredClone(ru);
  clipped.truncated = { sourceQuestions: 3 };
  assert.match(shown(overview(clipped)), /ещё 3 вопроса из трекера не показано/);
});

test('the run slice: tasks not handed to the harness in Tasks and the Overview, by key', () => {
  const o = shown(overview(ru));
  // With a forecast the total of the release is the ring's; this line is the harness works only.
  assert.match(o, /В harness: принято 1 из 4 · в работе 1 · ждут 2 · ещё не переданы в harness: 2/);
  assert.match(o, /Ещё не переданы в harness \(2\)/);
  assert.match(o, /DEMO-5: Импорт отчёта из CSV не передана в harness ещё не передана в harness/);
  assert.match(o, /DEMO-6: Печать отчёта ждёт готовности у задачи нет критериев приёмки/);
  const t = shown(html(<Tasks view={viewOf(ru)} lang="ru" />));
  assert.match(t, /Ещё не переданы в harness \(2\)/);
  assert.match(t, /DEMO-6: Печать отчёта/);
});

test('tracker compatibility in Health; updates banner and read-only mode in Settings', () => {
  const v = viewOf(ru);
  const h = shown(html(<Health view={v} lang="ru" timeZone="UTC" />));
  assert.match(
    h,
    /Источники задач relay-main \(relay\): Relay без контекста задачи: исполнитель не получит описание функции и сценария; нужна Relay ≥ 0\.14\.0/,
  );
  assert.match(h, /договор REST 1 · проверено 19\.11\.2026 11:55/);
  // Without a line: level and context in words.
  const noLine = structuredClone(ru);
  delete noLine.health.sources[0].line;
  assert.match(
    shown(html(<Health view={viewOf(noLine)} lang="ru" timeZone="UTC" />)),
    /версия трекера ниже рекомендуемой; трекер не объявляет контекст задачи/,
  );
  const banner = html(<UpdatesBanner updates={v.updates} lang="ru" />);
  assert.match(text(banner), /Доступна harness 0\.1\.0-alpha\.61 \+ панель 0\.1\.0-alpha\.6/);
  assert.match(text(banner), /что нового/);
  assert.match(text(banner), /как обновить harness update --apply --state \.harness\/state/);
  assert.match(text(banner), /панель ничего не устанавливает/);
  for (const state of ['up-to-date', 'unavailable', 'not-checked'])
    assert.equal(html(<UpdatesBanner updates={{ ...v.updates!, state: state as never }} />), '');
  assert.equal(html(<UpdatesBanner lang="ru" />), '');
  const s = html(<Settings view={v} lang="ru" />);
  assert.match(shown(s), /Обновления Режим только сообщать/);
  assert.match(shown(s), /Стоит: devcontour-harness 0\.1\.0-alpha\.60, панель 0\.1\.0-alpha\.5/);
  assert.match(shown(s), /Режим задаётся в \.harness\/updates\.json/);
  assert.doesNotMatch(s, /<(input|select|button|form)\b/);
  assert.doesNotMatch(
    html(<Settings view={viewOf(asAlpha59(ru))} lang="ru" />),
    /settings-updates/,
  );
});

test('round 2: odd work ids, closed tracker tasks, a clipped plan review, unknown order', () => {
  // A work id that is an Object.prototype key renders.
  for (const id of ['constructor', 'toString', '__proto__']) {
    const d = structuredClone(ru);
    d.works[2].id = id;
    d.questions[0].workId = id;
    d.works[3].dependsOn = [id];
    const v = viewOf(d);
    assert.doesNotThrow(() => html(<Tasks view={v} lang="ru" />), id);
    assert.doesNotThrow(() => html(<Overview view={v} lang="ru" />), id);
  }
  // Everything is done by the forecast: a listed task without a work is closed, not «to hand over».
  const done = structuredClone(ru);
  done.works = [done.works[0]];
  done.progress = {
    ...done.progress,
    total: 1,
    byStage: { done: 1 },
    running: 0,
    waitingOperator: 0,
  };
  done.questions = [];
  done.sourceQuestions = [];
  done.scope.tasks = [
    done.scope.tasks[0],
    {
      id: 'rt-demo-9',
      connector: 'relay-main',
      key: 'DEMO-9',
      state: 'not-ready',
      plain: 'задача закрыта в трекере',
    },
  ];
  Object.assign(done.forecast.progress, {
    percent: 100,
    total: 2,
    done: 2,
    inWork: 0,
    left: 0,
    weighted: 2,
  });
  const dm = shown(overview(done));
  assert.doesNotMatch(dm, /передач/);
  assert.match(dm, /Все работы приняты/);
  // The works list is clipped and the harness says the queue runs: its line, not «ждут».
  const clipped = structuredClone(ruStopped);
  clipped.works = [];
  clipped.escalations = [];
  clipped.questions = [];
  clipped.truncated = { works: 2 };
  clipped.progress.queue = {
    paused: false,
    runner: 'running',
    line: 'Очередь идёт: harness запущен.',
  };
  assert.match(
    text(/data-testid="story"[^>]*>[^<]*</.exec(overview(clipped))![0]),
    /Очередь идёт: harness запущен\./,
  );
  // A revision 4 document without steps leaves the order unknown: no panel «сначала».
  const noSteps = structuredClone(ruStopped);
  for (const w of noSteps.works) for (const b of w.blockers) delete b.step;
  const reset = nextSteps(viewOf(noSteps)).operator.find((x) => x.action === 'reset-attempts')!;
  assert.deepEqual(reset.after, []);
  assert.doesNotMatch(shown(overview(noSteps)), /Сначала ведущий/);
  // The same document as alpha.59: the alpha.4 code list still orders it.
  const old = nextSteps(viewOf(asAlpha59(noSteps))).operator.find(
    (x) => x.action === 'reset-attempts',
  )!;
  assert.deepEqual(
    old.after.map((x) => x.code),
    ['APPROVAL_STALE'],
  );
  // Every listed scope task is in harness and more are clipped: no «(0)» heading.
  const allIn = structuredClone(ru);
  allIn.scope.tasks = allIn.scope.tasks.filter((x: Json) => x.state === 'in-harness');
  allIn.truncated = { scope: 3 };
  for (const m of [shown(overview(allIn)), shown(html(<Tasks view={viewOf(allIn)} lang="ru" />))]) {
    assert.doesNotMatch(m, /Ещё не переданы в harness \(0\)/);
    assert.match(m, /Ещё 3 задачи среза прогона не показано/);
  }
});

test('a remaining range without an elapsed time keeps the range; the ring has no share', () => {
  const d = structuredClone(ru);
  delete d.forecast.time.elapsedMs;
  delete d.forecast.time.startedAt;
  const m = overview(d);
  const time = ring(m, 'ring-time');
  assert.match(time, /data-state="unknown"/);
  assert.match(time, /aria-valuetext="Время: сколько прошло — неизвестно · осталось ~1,5–3 ч"/);
  const t = shown(m);
  assert.match(t, /Сколько прошло, harness не сообщил/);
  assert.doesNotMatch(t, /закончившихся попыток пока слишком мало/);
  assert.match(t, /По 6 закончившимся попыткам/);
});

// Harness 0.1.0-alpha.62: a state nothing has run with says so
// (`progress.queue.neverRun`), and a view without a tracker snapshot says why
// it has no run slice (`scopeReason`). Older documents keep the old words.
const empty62 = read('./contract/harness/empty-state.view.json').data;
const empty60 = read('./contract/harness-0.1.0-alpha.60/empty-state.view.json').data;

test('never run: the harness line instead of «Очередь идёт», and «harness ещё не читал задачи»', () => {
  // A made-up Russian document of the same shape as the real alpha.62 empty state.
  const ruEmpty = structuredClone(empty62);
  ruEmpty.progress.queue.line = 'Ещё ничего не запускали — ведущий начнёт с harness run.';
  for (const m of [overview(ruEmpty), html(<Overview view={viewOf(empty62)} lang="ru" />)]) {
    assert.match(m, /data-testid="queue-state"[^>]*>Ещё не запускали</);
    assert.doesNotMatch(shown(m), /Очередь идёт|Очередь стоит/);
    assert.match(shown(m), /harness ещё не читал задачи из трекера/);
    assert.doesNotMatch(shown(m), /эта версия harness не сообщает/);
  }
  // The harness's own line, in the language it was asked for.
  assert.match(
    overview(ruEmpty),
    /data-testid="queue-line"[^>]*>Ещё ничего не запускали — ведущий начнёт с harness run\.</,
  );
  const en = overview(empty62, 'en');
  assert.match(en, /data-testid="queue-state"[^>]*>Not started yet</);
  assert.match(
    en,
    /data-testid="queue-line"[^>]*>Nothing has run yet — the lead starts with harness run\.</,
  );
  assert.match(shown(en), /the harness has not read the tracker tasks yet/);
  // Not a problem on the way: nothing ran, so nothing stands.
  assert.doesNotMatch(shown(en), /the queue will not move by itself/);
  // The Tasks screen says the same about the run slice.
  assert.match(
    shown(html(<Tasks view={viewOf(ruEmpty)} lang="ru" />)),
    /harness ещё не читал задачи из трекера/,
  );
  // A pause still wins over «not started».
  const paused = structuredClone(ruEmpty);
  paused.progress.queue.paused = true;
  assert.match(overview(paused), /data-testid="queue-state"[^>]*>Очередь на паузе/);
});

test('an alpha.60 empty state (no neverRun/scopeReason) reads as never run from STATE_NOT_FOUND', () => {
  assert.equal(Object.hasOwn(empty60.progress.queue, 'neverRun'), false);
  const m = overview(empty60);
  assert.match(m, /data-testid="queue-state"[^>]*>Ещё не запускали</);
  // No harness line: the panel's own words.
  assert.match(
    m,
    /data-testid="queue-line"[^>]*>Ещё ничего не запускали — ведущий начнёт с harness run\.</,
  );
  assert.match(shown(m), /harness ещё не читал задачи из трекера/);
});

test('scope absent: an older revision says it does not report, an unknown reason is named', () => {
  // A made-up revision 4 document that ran: works, no scope, no reason (alpha.60/61).
  const ran = structuredClone(ru);
  delete ran.scope;
  delete ran.forecast;
  for (const m of [shown(overview(ran)), shown(html(<Tasks view={viewOf(ran)} lang="ru" />))]) {
    assert.match(m, /эта версия harness не сообщает остальные задачи прогона/);
    assert.doesNotMatch(m, /Ещё не запускали/);
  }
  // The same document with the harness reason.
  const reason = { ...structuredClone(ran), scopeReason: 'no-snapshot' };
  assert.match(shown(overview(reason)), /harness ещё не читал задачи из трекера/);
  const unread = { ...structuredClone(ran), scopeReason: 'unreadable' };
  assert.match(
    shown(overview(unread)),
    /снимок задач трекера есть, но harness не смог его прочитать/,
  );
  assert.doesNotMatch(shown(overview(unread)), /не сообщает|ещё не читал/);
  // A reason this build does not know: passes the gate, named as is, never «не сообщает».
  const future = { ...structuredClone(ran), scopeReason: 'source-offline' };
  const f = shown(overview(future));
  assert.match(f, /среза задач прогона в представлении нет \(source-offline\)/);
  assert.doesNotMatch(f, /не сообщает|не читал/);
  // Dropped for size stays «не поместился», whatever the reason field says.
  const dropped = { ...structuredClone(ran), truncated: { scope: 12 } };
  assert.match(shown(overview(dropped)), /не поместился в представление/);
});
