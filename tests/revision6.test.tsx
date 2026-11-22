// View revision 6 (harness 0.1.0-alpha.66): the lead's session and journal,
// the forecast's two figures with the lead's share and the release state,
// planned (not approved) tasks, «what is used», previews, the whole path of
// each work, who decides (settings.decisions), a rework restored as
// accepted and the lead's diagnosis as the lead's move. A revision 5
// document (`asAlpha65`) keeps the previous screens.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LeadJournal,
  LeadSummary,
  Overview,
  PreviewsPanel,
  ResourcesPanel,
  Settings,
  Tasks,
  TrackLine,
  TrackTable,
  WorkDetail,
  checkView,
  checkWorkDetail,
  decisionValueText,
  drawnSteps,
  nextSteps,
  plannedKeys,
  previewHref,
  trackAbsence,
  trackGroups,
  trackTone,
  type OperatorView,
  type WorkDetailView,
  type WorkTrack,
} from '../src/index.ts';
import { plannedSplit, splitQuestions, taskCard } from '../src/model/tasks.ts';
import { decisionActor } from '../src/model/track.ts';
import { shapeOf } from '../src/components/Track.tsx';
import { scopeOf } from '../src/model/scope.ts';
import { parseRoute } from '../src/app/route.ts';
import { asAlpha65 } from './legacy.ts';

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
const en = read('../fixtures/view.sample.json');
const ru = read('../fixtures/ru/view.sample.json');
const view = viewOf(en);
const viewRu = viewOf(ru);
const html = (el: ReactElement) => renderToStaticMarkup(el);
/** Visible text: tags out, entities of the dictionary decoded, spaces squeezed. */
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
const href = (id: string) => '#/work/' + id;

test('track tones: the harness state alone picks the colour; rework violet; unknown grey', () => {
  const t = (state: string, extra: Json = {}) =>
    trackTone({ kind: 'code', state, ...extra } as never);
  assert.equal(t('planned'), 'planned');
  assert.equal(t('current'), 'current');
  assert.equal(t('passed'), 'passed');
  assert.equal(t('failed'), 'failed');
  assert.equal(t('waiting'), 'waiting');
  assert.equal(t('skipped'), 'skipped');
  assert.equal(trackTone({ kind: 'diagnosis', state: 'decision' }), 'decision');
  // Rework: passed solid violet, ahead a violet outline.
  assert.equal(t('passed', { rework: 1 }), 'rework');
  assert.equal(t('planned', { rework: 1 }), 'rework-planned');
  // A person's decision is not the lead's blue: by `actor`, else by kind or the harness label.
  const d = (extra: Json) => trackTone({ state: 'decision', label: 'x', ...extra } as never);
  assert.equal(d({ kind: 'diagnosis' }), 'decision');
  assert.equal(d({ kind: 'reset', label: 'ещё попытки от ведущего' }), 'decision');
  assert.equal(d({ kind: 'reset', label: 'сброс попыток человеком' }), 'human');
  assert.equal(d({ kind: 'reset', label: 'attempts reset by a human' }), 'human');
  assert.equal(d({ kind: 'user-decision', label: 'решение человека' }), 'human');
  assert.equal(d({ kind: 'reset', label: 'ещё попытки от ведущего', actor: 'user' }), 'human');
  assert.equal(d({ kind: 'user-decision', actor: 'lead' }), 'decision');
  assert.equal(decisionActor({ kind: 'code', label: 'код' }), undefined);
  assert.equal(
    shapeOf({ step: { kind: 'reset', state: 'decision', label: 'сброс попыток человеком' } }),
    'bar',
  );
  assert.equal(
    shapeOf({ step: { kind: 'diagnosis', state: 'planned', label: 'разбор ведущего' } }),
    'diamond',
  );
  assert.equal(
    shapeOf({ step: { kind: 'accepted', state: 'planned', label: 'принято' } }),
    'square',
  );
  // A failed or running rework step keeps its own colour: red and green say more.
  assert.equal(t('failed', { rework: 1 }), 'failed');
  assert.equal(t('current', { rework: 1 }), 'current');
  assert.equal(t('something-new'), 'planned');
});

test('track steps: positions after the dropped ones; states as sent, a real skipped stays skipped', () => {
  const track = view.works.find((w) => w.id === 'locale-format')!.track!;
  const d = drawnSteps(track);
  assert.equal(d.length, 18);
  assert.equal(d[0]!.n, 1);
  // Attempt 2 runs its checks: harness alpha.66 sends the steps ahead as `planned`.
  const a2 = d.filter((x) => x.step.attempt === 2);
  assert.deepEqual(
    a2.map((x) => [x.step.kind, x.step.state, x.state, x.tone]),
    [
      ['code', 'passed', 'passed', 'passed'],
      ['checks', 'current', 'current', 'current'],
      ['review', 'planned', 'planned', 'planned'],
      ['integration', 'planned', 'planned', 'planned'],
    ],
  );
  // No panel reading: a `skipped` after the running step is said as skipped.
  const odd: WorkTrack = {
    steps: track.steps.map((x) =>
      x.attempt === 2 && x.state === 'planned' ? { ...x, state: 'skipped' as const } : x,
    ),
  };
  assert.deepEqual(
    drawnSteps(odd)
      .filter((x) => x.step.attempt === 2)
      .map((x) => [x.state, x.tone]),
    [
      ['passed', 'passed'],
      ['current', 'current'],
      ['skipped', 'skipped'],
      ['skipped', 'skipped'],
    ],
  );
  // An attempt that failed keeps its skipped steps skipped.
  const a1 = d.filter((x) => x.step.attempt === 1).map((x) => x.state);
  assert.deepEqual(a1, ['passed', 'failed', 'skipped', 'skipped']);
  // Clipped tracks number from after the dropped steps.
  const clipped: WorkTrack = { steps: track.steps.slice(5), truncated: 5 };
  assert.equal(drawnSteps(clipped)[0]!.n, 6);
});

test('track groups: one segment per attempt run, decisions and the end on their own', () => {
  const g = trackGroups(view.works.find((w) => w.id === 'import-csv')!.track!);
  assert.deepEqual(
    g.map((x) => [x.kind, x.attempt ?? null, x.steps.length]),
    [
      ['attempt', 1, 4],
      ['attempt', 2, 4],
      ['single', null, 1],
      ['attempt', 3, 4],
      ['single', null, 1],
      ['single', null, 1],
      ['single', null, 1],
      ['single', null, 1],
      ['single', null, 1],
    ],
  );
  // The rework of add-greeting is its own segment, marked as rework.
  const r = trackGroups(view.works.find((w) => w.id === 'add-greeting')!.track!);
  assert.deepEqual(
    r.map((x) => [x.kind, x.attempt ?? null, x.rework ?? null]),
    [
      ['attempt', 1, null],
      ['single', 1, null],
      ['attempt', 2, 1],
      ['single', null, 1],
    ],
  );
});

test('the card line: one focusable button, the step list in a tooltip tied to it, clipped steps said', () => {
  const w = view.works.find((x) => x.id === 'import-csv')!;
  const m = html(<TrackLine track={w.track!} lang="ru" name="import-csv" />);
  // One tabbable trigger per line with a name; the dots are hidden from the tree.
  assert.equal((m.match(/<button/g) ?? []).length, 1);
  const button = /<button[^>]*>/.exec(m)![0];
  assert.match(button, /type="button"/);
  assert.match(button, /aria-label="Путь задачи import-csv"/);
  assert.match(button, /aria-expanded="false"/);
  const id = /aria-describedby="([^"]+)"/.exec(button)![1]!;
  const tip = new RegExp(
    `<span role="tooltip" id="${id.replace(/[:]/g, '\\:')}"[^>]*>([\\s\\S]*?)</span>`,
  ).exec(m);
  assert.ok(tip, 'the tooltip is tied to the button');
  const words = shown(tip![1]!);
  assert.match(
    words,
    /попытка 2: code — пройдено; checks — пройдено; review — не прошло \(review rejected\)/,
  );
  assert.match(words, /lead diagnosis — ждёт/);
  assert.match(m, /class="hui-track-line" aria-hidden="true"/);
  assert.match(m, /data-tone="waiting"/);
  assert.match(m, /data-shape="diamond"/);
  const clipped = html(
    <TrackLine track={{ steps: w.track!.steps.slice(-3), truncated: 15 }} lang="ru" name="x" />,
  );
  assert.match(shown(clipped), /\+15 15 ранних шагов не показаны \(предел пути\)/);
  // A track without steps draws nothing.
  assert.equal(html(<TrackLine track={{ steps: [] }} lang="ru" name="x" />), '');
});

test('track marks differ by shape too: failed ✕, waiting ring, current ring, rework outline (CSS)', () => {
  const css = readFileSync(new URL('../src/components/styles.css', import.meta.url), 'utf8');
  const rule = (tone: string) =>
    new RegExp(`\\.hui-dot\\[data-tone='${tone}'\\] \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  assert.match(rule('failed'), /clip-path: polygon/);
  assert.match(rule('waiting'), /background: transparent;[\s\S]*border: 2\.5px solid/);
  assert.match(rule('current'), /box-shadow: 0 0 0 2\.5px[\s\S]*animation: hui-pulse/);
  assert.match(rule('passed'), /background: var\(--hui-passed\)/);
  assert.match(rule('rework'), /background: var\(--hui-rework\)/);
  assert.match(
    rule('rework-planned'),
    /background: transparent;[\s\S]*border: 2px solid var\(--hui-rework\)/,
  );
  assert.match(rule('human'), /background: var\(--hui-human\)/);
  assert.match(css, /\.hui-dot\[data-shape='bar'\]/);
  // Dark mode: passed and current are different colours.
  const dark = /:where\(:root\[data-theme='dark'\]\) \{([^}]*)\}/.exec(css)![1]!;
  const tok = (name: string) => new RegExp(`--hui-${name}: (#[0-9a-f]+)`).exec(dark)![1];
  assert.notEqual(tok('passed'), tok('current'));
  // Reduced motion reaches a TrackLine rendered outside a .hui root.
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.hui-dot \{\s*animation: none !important;/,
  );
});

test('the detail rows: step, attempt, label, state, time, reason; a legend in words', () => {
  const d = detailOf(read('../fixtures/ru/work.sample.json'));
  const m = html(<TrackTable track={d.work.track!} lang="ru" timeZone={TZ} />);
  const t = shown(m);
  assert.match(t, /№ Попытка Шаг Состояние Время Почему/);
  assert.match(t, /2 1 проверки не прошло 11:40 проверки не прошли/);
  assert.match(t, /5 — разбор ведущего решение 11:40 D1: слабое покрытие/);
  assert.match(t, /7 2 проверки идёт сейчас —/);
  assert.match(t, /8 2 ревью впереди —/);
  assert.match(t, /15 — ещё попытки от ведущего впереди — сброс 1 из 2/);
  assert.match(t, /18 — принято \(итог задачи\) впереди/);
  assert.match(
    t,
    /Обозначения: пройдено идёт сейчас не прошло ждёт решение ведущего решение человека доработка после приёмки доработка впереди впереди пропущено/,
  );
  // The table scrolls in its own focusable region, never the page.
  assert.match(m, /class="hui-table-wrap" role="region" aria-label="Путь задачи" tabindex="0"/);
  // Rework steps say so.
  const g = detailOf(read('../fixtures/ru/work.accepted.sample.json'));
  const gt = shown(html(<TrackTable track={g.work.track!} lang="ru" />));
  assert.match(gt, /проверки · доработка 1 не прошло/);
  assert.match(
    gt,
    /доработка оставлена — принятая редакция \(итог задачи\) · доработка 1 пройдено/,
  );
});

test('work detail: the path panel, and an older or a size-cut document says why there is none', () => {
  const d = detailOf(read('../fixtures/ru/work.diagnosis.sample.json'));
  const m = shown(html(<WorkDetail detail={d} lang="ru" timeZone={TZ} workHref={href} />));
  assert.match(m, /Путь задачи/);
  assert.match(m, /разбор ведущего ждёт/);
  // The lead diagnoses: the detail says the lead acts, not you.
  assert.match(m, /Ждёт: ведущий — разобрать причину повторных отказов\./);
  const old = detailOf(asAlpha65(read('../fixtures/ru/work.sample.json')));
  assert.equal(trackAbsence(old.work, old.viewRevision), 'old');
  assert.match(
    shown(html(<WorkDetail detail={old} lang="ru" timeZone={TZ} />)),
    /Путь задачи передаёт harness 0\.1\.0-alpha\.66 и новее\./,
  );
  const cut = structuredClone(read('../fixtures/ru/work.sample.json'));
  delete cut.work.track;
  const c = detailOf(cut);
  assert.equal(trackAbsence(c.work, c.viewRevision), 'dropped');
  assert.match(shown(html(<WorkDetail detail={c} lang="ru" />)), /Путь задачи не вошёл в документ/);
});

test('the diagnosis is the lead’s move: never «нужно от вас», one lead line per stop', () => {
  const steps = nextSteps(view);
  const lead = steps.lead.filter(
    (s) => s.workIds.includes('import-csv') && s.code === 'DIAGNOSIS_REQUIRED',
  );
  assert.equal(lead.length, 1, JSON.stringify(steps.lead));
  assert.equal(lead[0]!.code, 'DIAGNOSIS_REQUIRED');
  assert.equal(lead[0]!.action, 'diagnose');
  // Blocker, escalation and stage need are one stop.
  assert.deepEqual(lead[0]!.records.map((r) => r.source).sort(), [
    'blocker',
    'escalation',
    'needs',
  ]);
  assert.equal(
    steps.operator.some((s) => s.workIds.includes('import-csv')),
    false,
  );
  const o = html(<Overview view={viewRu} lang="ru" timeZone={TZ} workHref={href} />);
  const needs = o.slice(o.indexOf('data-testid="needs-you"'), o.indexOf('data-testid="problems"'));
  assert.doesNotMatch(needs, /import-csv/);
  assert.match(shown(needs), /Нужно от вас \(2\)/);
  const byLead = o.slice(o.indexOf('data-testid="by-lead"'));
  assert.match(shown(byLead), /Разобрать причину повторных отказов — import-csv/);
  // The task card names the lead.
  const card = taskCard(
    viewRu,
    nextSteps(viewRu),
    viewRu.works.find((w) => w.id === 'import-csv')!,
  );
  assert.deepEqual(card.next, { kind: 'actors', actors: ['lead'] });
  // And an exhausted work the lead resets (alpha.66 `exhausted-lead-reset`) is the lead's too.
  const exhausted = structuredClone(en);
  const w = exhausted.works.find((x: Json) => x.id === 'import-csv');
  w.blockers = [{ code: 'ATTEMPTS_EXHAUSTED', plain: 'attempts ran out', actor: 'lead' }];
  w.stage.needs = { actor: 'lead', action: 'reset-attempts' };
  exhausted.escalations = [];
  const s2 = nextSteps(viewOf(exhausted));
  assert.equal(
    s2.operator.some((s) => s.workIds.includes('import-csv')),
    false,
  );
  assert.equal(s2.lead.filter((s) => s.workIds.includes('import-csv')).length, 1);
  void splitQuestions;
});

test('Журнал → Ведущий: session, release, the journal newest first, links', () => {
  assert.deepEqual(parseRoute('#/lead'), { screen: 'lead' });
  const m = html(
    <LeadJournal
      view={viewRu}
      lang="ru"
      timeZone={TZ}
      workHref={href}
      activityHref="#/activity?actor=lead"
    />,
  );
  const t = shown(m);
  assert.match(t, /Ведущий/);
  assert.match(t, /работает в сессии с 09:05 отметка действует до 12:35/);
  // Harness 5496b33: the line has no clock; the time is `since`, in the viewer's zone.
  assert.match(t, /ведущий работает: жду ответа про разделитель CSV/);
  assert.doesNotMatch(t, /UTC/);
  const moscow = shown(html(<LeadJournal view={viewRu} lang="ru" timeZone="Europe/Moscow" />));
  assert.match(moscow, /в сессии с 12:05/);
  assert.match(t, /код в работе/);
  assert.match(t, /Журнал ведущего \(6\)/);
  // Newest first, with the work link and the action code only under «подробности».
  assert.ok(t.indexOf('жду ответа про разделитель') < t.indexOf('начал выпуск'));
  assert.match(
    t,
    /11:40 команда harness ведущий разобрал отказы locale-format: D1, причина coverage; дальше — новая попытка · locale-format/,
  );
  assert.match(m, /href="#\/work\/locale-format"/);
  assert.match(m, /<code>lead\.diagnose<\/code>/);
  assert.match(m, /href="#\/activity\?actor=lead"/);
  // Clipped notes are said.
  const clipped = viewOf({ ...ru, truncated: { leadNotes: 4 } });
  assert.match(
    shown(html(<LeadJournal view={clipped} lang="ru" />)),
    /Журнал ведущего \(10\)[\s\S]*Ещё 4 записи журнала не показаны/,
  );
  // No lead record: revision 6 says the lead has not started; older harness says it cannot.
  const { lead: _l, ...none } = ru;
  assert.match(
    shown(html(<LeadJournal view={viewOf(none)} lang="ru" />)),
    /Ведущий ещё не начинал сессию/,
  );
  assert.match(
    shown(html(<LeadJournal view={viewOf(asAlpha65(ru))} lang="ru" />)),
    /Журнал ведущего передаёт harness 0\.1\.0-alpha\.66 и новее/,
  );
  // A finished release: its summary and time.
  const done = structuredClone(ru);
  done.forecast.progress.release = {
    state: 'done',
    doneAt: '2026-11-19T13:00:00.000Z',
    summary: 'Выпуск готов: экспорт CSV и форматирование дат.',
    line: 'выпуск готов: ведущий написал итоговый отчёт',
  };
  const d = shown(html(<LeadJournal view={viewOf(done)} lang="ru" timeZone={TZ} />));
  assert.match(d, /выпуск готов выпуск готов: ведущий написал итоговый отчёт/);
  assert.match(d, /отчёт записан 13:00/);
  assert.match(d, /Итоговый отчёт ведущего Выпуск готов: экспорт CSV и форматирование дат\./);
});

test('home lead panel: active or not, since, last note, release state; hidden before revision 6', () => {
  const t = shown(html(<LeadSummary view={viewRu} lang="ru" timeZone={TZ} journalHref="#/lead" />));
  assert.match(t, /Ведущий/);
  assert.match(t, /работает в сессии с 09:05/);
  assert.match(t, /Последняя заметка \(11:50\): жду ответа про разделитель CSV/);
  assert.match(t, /код в работе/);
  assert.doesNotMatch(t, /код в работе код в работе/);
  assert.match(t, /Журнал ведущего/);
  const ended = structuredClone(ru);
  ended.lead = {
    active: false,
    since: '2026-11-19T09:05:00.000Z',
    endedAt: '2026-11-19T11:59:00.000Z',
    notes: [],
    line: 'ведущий закончил сессию',
  };
  const e = shown(html(<LeadSummary view={viewOf(ended)} lang="ru" timeZone={TZ} />));
  assert.match(e, /не в сессии сессия закончена 11:59/);
  assert.match(e, /ведущий закончил сессию/);
  assert.equal(html(<LeadSummary view={viewOf(asAlpha65(ru))} lang="ru" />), '');
  // The Overview carries it.
  assert.match(
    html(<Overview view={viewRu} lang="ru" leadHref="#/lead" />),
    /data-testid="lead-summary"[\s\S]*href="#\/lead"/,
  );
});

test('forecast: two figures, the lead share, the release state and the chain — as sent', () => {
  const m = html(<Overview view={viewRu} lang="ru" timeZone={TZ} />);
  const f = shown(m.slice(m.indexOf('data-testid="forecast"'), m.indexOf('data-testid="story"')));
  assert.match(f, /по утверждённому плану: ~27 %/);
  assert.match(f, /с планируемыми задачами: ~23 %/);
  assert.match(
    f,
    /по утверждённому плану ~27 %, осталось ~1 ч 15 мин – 2 ч 30 мин; с планируемыми \(1 задача, не утверждены: DEMO-6\) ~23 %/,
  );
  assert.match(f, /код в работе/);
  assert.match(f, /доля ведущего: 0 % из 10 %/);
  assert.match(f, /○ план согласован — впереди/);
  assert.match(f, /цепочка зависимостей: не меньше 2 задач подряд/);
  assert.match(f, /работа ведущего ~30 мин \(по 3 разрывам «приёмка → следующая попытка»\)/);
  // The ring keeps the harness percent; code accepted is said under it, never 100 before done.
  const accepted = structuredClone(ru);
  Object.assign(accepted.forecast.progress, {
    percent: 90,
    release: { state: 'code-accepted', line: 'код принят, ведущий ещё работает: пишу отчёт' },
    lead: {
      steps: [
        { step: 'plan', weight: 0.05, done: true },
        { step: 'report', weight: 0.05, done: false },
      ],
      weighted: 0.05,
      total: 0.1,
    },
  });
  const a = html(<Overview view={viewOf(accepted)} lang="ru" />);
  assert.match(a, /aria-valuenow="90"/);
  assert.match(shown(a), /~90 % код принят/);
  assert.match(
    shown(a),
    /код принят, ведущий работает код принят, ведущий ещё работает: пишу отчёт/,
  );
  assert.match(shown(a), /доля ведущего: 5 % из 10 %/);
  assert.match(shown(a), /✓ план согласован — сделано/);
  // English, fractional chain.
  const e = structuredClone(en);
  e.forecast.time.chain = 2.5;
  assert.match(
    shown(html(<Overview view={viewOf(e)} lang="en" />)),
    /dependency chain: at least 2\.5 tasks in a row/,
  );
  // A revision 5 forecast: none of it.
  const old = shown(html(<Overview view={viewOf(asAlpha65(ru))} lang="ru" />));
  assert.doesNotMatch(old, /по утверждённому плану:|доля ведущего|цепочка зависимостей/);
});

test('planned tasks: cards with «ещё не утверждена», not listed twice; a planned work badge', () => {
  assert.deepEqual([...plannedKeys(viewRu)], ['relay-main\0rt-demo-6']);
  const t = shown(html(<Tasks view={viewRu} lang="ru" workHref={href} />));
  assert.match(t, /Ещё не утверждены \(1\)/);
  assert.match(
    t,
    /DEMO-6 · Печать отчёта ещё не утверждена DEMO-6: ещё не утверждена \(прочитана из источника, в план ещё не входит\) Не готова: у задачи нет критериев приёмки\. после: export-csv/,
  );
  const clipped = shown(
    html(<Tasks view={viewOf({ ...ru, truncated: { planned: 3 } })} lang="ru" />),
  );
  assert.match(clipped, /Ещё не утверждены \(4\)[\s\S]*Ещё 3 задачи не показаны/);
  // A registered work whose plan is not approved: its own phase and the badge.
  const p = structuredClone(ru);
  const docs = p.works.find((w: Json) => w.id === 'docs-page');
  docs.planned = true;
  docs.blockers = [];
  const pv = viewOf(p);
  const card = taskCard(
    pv,
    nextSteps(pv),
    pv.works.find((w) => w.id === 'docs-page')!,
  );
  assert.equal(card.phase, 'planned');
  const pt = html(<Tasks view={pv} lang="ru" />);
  assert.match(
    shown(pt),
    /Document the export Ещё не утверждена Сейчас: [^.]*\. План этой работы ещё не согласован; попыток не было\./,
  );
  const pw = html(<Overview view={pv} lang="ru" />);
  assert.match(shown(pw), /docs-page Document the export [^·]*ещё не утверждена/);
});

test('a rework an older harness cancelled is shown accepted, with the harness line', () => {
  const t = shown(html(<Tasks view={viewRu} lang="ru" workHref={href} />));
  assert.match(
    t,
    /Add greet\(name\) Принята .*доработка отменена принято на 3b1f9e0; доработка отменена Принято локально/,
  );
  const d = detailOf(read('../fixtures/ru/work.accepted.sample.json'));
  const m = html(<WorkDetail detail={d} lang="ru" timeZone={TZ} />);
  assert.match(m, /data-status="accepted"[^>]*>[\s\S]*data-testid="restored-line"/);
  // Without the fields (revision 5): no note.
  assert.doesNotMatch(html(<Tasks view={viewOf(asAlpha65(ru))} lang="ru" />), /restored-line/);
});

test('«Что задействовано»: harness lines, services with counts, a section cut for size is said', () => {
  const m = html(<ResourcesPanel view={viewRu} lang="ru" timeZone={TZ} />);
  const t = shown(m);
  assert.match(t, /Что задействовано/);
  assert.match(t, /docker: postgres — 1 работает, 1 осталась после попытки/);
  assert.match(t, /postgres docker работает: 1, остановлено: 3, осталось после попыток: 1 · 11:41/);
  assert.match(t, /redis docker работает: 0, остановлено: 1 redis в docker/);
  assert.match(t, /песочница системы; исполнителям — только 2 разрешённых домена/);
  assert.match(t, /закреплены: node 24\.22\.3/);
  const cut = viewOf({ ...asAlpha65(ru), viewRevision: 6, truncated: { resources: 1 } });
  assert.match(shown(html(<ResourcesPanel view={cut} lang="ru" />)), /не вошёл в документ/);
  assert.equal(html(<ResourcesPanel view={viewOf(asAlpha65(ru))} lang="ru" />), '');
});

test('«Посмотреть результат»: only the harness loopback address is a link; commands, not buttons', () => {
  assert.equal(previewHref('http://127.0.0.1:4791/'), 'http://127.0.0.1:4791/');
  for (const bad of [
    'http://127.0.0.1:0/',
    'http://127.0.0.1:70000/',
    'https://example.test/',
    'javascript:alert(1)',
    'http://localhost:4791/',
  ])
    assert.equal(previewHref(bad), undefined, bad);
  const m = html(<PreviewsPanel view={viewRu} lang="ru" timeZone={TZ} workHref={href} />);
  const t = shown(m);
  assert.match(
    m,
    /<a class="hui-link hui:font-medium" href="http:\/\/127\.0\.0\.1:4791\/" target="_blank" rel="noopener noreferrer">Открыть Сайт<\/a>/,
  );
  assert.match(t, /принятый результат, коммит 3b1f9e0 · add-greeting/);
  assert.match(t, /запущено 11:45 · остановится само 13:45/);
  assert.match(
    t,
    /npx harness preview-stop --state <каталог состояния> --preview web --repository app/,
  );
  assert.match(t, /npx harness preview-start --state <каталог состояния> --ref accepted --ttl 2h/);
  assert.doesNotMatch(m, /<button|<form/);
  // An odd address is text, not a link.
  const odd = structuredClone(ru);
  odd.previews[0].url = 'http://127.0.0.1:99999/';
  assert.doesNotMatch(html(<PreviewsPanel view={viewOf(odd)} lang="ru" />), /href="http:\/\/127/);
  // Revision 6 without previews: how to start one; older: no panel.
  const { previews: _p, ...none } = ru;
  assert.match(
    shown(html(<PreviewsPanel view={viewOf(none)} lang="ru" />)),
    /Сейчас ни одно превью не запущено\./,
  );
  assert.equal(html(<PreviewsPanel view={viewOf(asAlpha65(ru))} lang="ru" />), '');
});

test('settings: who decides — summary, warning, each value with its source and harness text', () => {
  const t = shown(html(<Settings view={viewRu} lang="ru" />));
  assert.match(t, /Кто принимает решения/);
  assert.match(
    t,
    /Итог: после 2 отказов — разбор ведущего; ведущий может дать ещё попытки 2 раза; дальше — вы/,
  );
  assert.match(t, /Предел попыток 3 из политики Сколько засчитанных попыток получает задача/);
  assert.match(
    t,
    /Кто восстанавливает после отказов ведущий выведено из соседней настройки Кто решает после повторных отказов/,
  );
  assert.match(t, /Ведущий отвечает на технические вопросы да из политики/);
  const e = shown(html(<Settings view={view} lang="en" />));
  assert.match(e, /In short: after 2 failures the lead diagnoses/);
  assert.match(
    e,
    /Who recovers after failures the lead derived from a neighbouring setting Who decides after repeated failures/,
  );
  // A warning from the harness, in the panel language.
  const w = structuredClone(ru);
  w.settings.decisions.warning = {
    ru: 'необычно: восстанавливает ведущий, а технические вопросы — вы',
    en: 'unusual: the lead recovers, you answer technical questions',
  };
  const wm = html(<Settings view={viewOf(w)} lang="ru" />);
  assert.match(wm, /data-testid="decisions-warning"[^>]*>необычно: восстанавливает ведущий/);
  // Values in words; an unknown key and value as is.
  assert.equal(decisionValueText(true, 'ru'), 'да');
  assert.equal(decisionValueText('user', 'ru'), 'вы');
  assert.equal(decisionValueText('other', 'en'), 'other');
  assert.equal(decisionValueText(2, 'en'), '2');
  assert.doesNotMatch(
    html(<Settings view={viewOf(asAlpha65(ru))} lang="ru" />),
    /settings-decisions/,
  );
});

test('the gate checks the revision 6 fields the panel renders', () => {
  const bad = (mutate: (d: Json) => void) => {
    const d = structuredClone(en);
    mutate(d);
    const c = checkView(d);
    assert.equal(c.ok, false, JSON.stringify(c).slice(0, 160));
  };
  bad((d) => (d.works[0].track.steps[0].label = 3));
  bad((d) => (d.works[0].track = { steps: 'all' }));
  bad((d) => (d.works[0].track.steps = Array(121).fill(d.works[0].track.steps[0])));
  bad((d) => (d.settings.decisions.items[0].value = { n: 3 }));
  bad((d) => (d.settings.decisions.summary = 'x'));
  bad((d) => (d.lead.notes[0].at = 'yesterday'));
  bad((d) => (d.lead.active = 'yes'));
  bad((d) => (d.planned[0].line = undefined));
  bad((d) => (d.resources.services[0].running = -1));
  bad((d) => (d.previews[0].startedAt = 'now'));
  bad((d) => (d.forecast.progress.approved.percent = 'x'));
  bad((d) => (d.forecast.progress.release.line = 1));
  bad((d) => (d.forecast.time.chain = 'long'));
  // Each of them absent is a revision 5 document: accepted.
  assert.equal(checkView(asAlpha65(en)).ok, true);
  assert.equal(checkWorkDetail(asAlpha65(read('../fixtures/work.diagnosis.sample.json'))).ok, true);
});

test('a held gate (ENVIRONMENT_GATE_HELD): the lead’s move, in «Что задействовано» and on the card', () => {
  // One lead line per stop, never the operator's.
  const steps = nextSteps(view);
  const held = steps.lead.filter((s) => s.code === 'ENVIRONMENT_GATE_HELD');
  assert.equal(held.length, 1, JSON.stringify(steps.lead));
  assert.deepEqual(held[0]!.workIds, ['import-csv']);
  assert.equal(
    steps.operator.some((s) => s.code === 'ENVIRONMENT_GATE_HELD'),
    false,
  );
  // A stage need «fix-environment» of the lead joins the same stop.
  const need = structuredClone(en);
  const w = need.works.find((x: Json) => x.id === 'import-csv');
  w.blockers = w.blockers.filter((b: Json) => b.code === 'ENVIRONMENT_GATE_HELD');
  w.stage.needs = { actor: 'lead', action: 'fix-environment' };
  need.escalations = [];
  const one = nextSteps(viewOf(need)).lead.filter((s) => s.workIds.includes('import-csv'));
  assert.equal(one.length, 1, JSON.stringify(one));
  assert.equal(one[0]!.action, 'fix-environment');
  const o = html(<Overview view={viewRu} lang="ru" timeZone={TZ} workHref={href} />);
  const needs = o.slice(o.indexOf('data-testid="needs-you"'), o.indexOf('data-testid="problems"'));
  assert.doesNotMatch(needs, /удержан/);
  assert.match(
    shown(o.slice(o.indexOf('data-testid="by-lead"'))),
    /Делает ведущий \(2\)[^]*Gate e2e удержан: зовёт ps[^]*— import-csv действует: ведущий/,
  );
  // «Что задействовано»: the harness line first, and the held list.
  const r = shown(html(<ResourcesPanel view={viewRu} lang="ru" />));
  assert.match(r, /Что задействовано Удержано: app\/e2e \(работа import-csv\)/);
  assert.match(r, /Удержанные проверки Удержано: app\/e2e[^]*app\/e2e · import-csv/);
  // The card of the work whose attempt failed says it in plain words.
  const t = html(<Tasks view={viewRu} lang="ru" />);
  const card = t.slice(t.indexOf('data-testid="task-import-csv"'));
  // The harness's own words (the work's stop), not a panel-made cause.
  assert.match(
    card,
    /data-testid="task-gate-held">gate e2e удержан: зовёт ps, а в песочнице проверок список процессов недоступен; ход ведущего/,
  );
  // Without the stop's text: the held-gate line of «что задействовано».
  const noPlain = structuredClone(ru);
  for (const b of noPlain.works.find((x: Json) => x.id === 'import-csv').blockers)
    if (b.code === 'ENVIRONMENT_GATE_HELD') delete b.plain;
  const np = html(<Tasks view={viewOf(noPlain)} lang="ru" />);
  assert.match(
    np.slice(np.indexOf('data-testid="task-import-csv"')),
    /data-testid="task-gate-held">Удержано: app\/e2e \(работа import-csv\)/,
  );
  // A work that only waits for a held gate.
  const waits = structuredClone(ru);
  waits.works
    .find((x: Json) => x.id === 'docs-page')
    .blockers.push({ code: 'ENVIRONMENT_GATE_HELD', plain: 'gate e2e удержан', actor: 'lead' });
  const wt = html(<Tasks view={viewOf(waits)} lang="ru" />);
  const docsCard = wt.slice(wt.indexOf('data-testid="task-docs-page"'));
  // The stop is the card's «Сейчас» line already: said once, the lead acts next.
  assert.match(shown(docsCard), /Сейчас: gate e2e удержан\./);
  assert.doesNotMatch(docsCard.split('data-testid="task-')[1]!, /task-gate-held/);
  assert.match(shown(docsCard), /Дальше действует: ведущий/);
  // Without the fields (revision 5, or no hold): nothing.
  assert.doesNotMatch(html(<Tasks view={viewOf(asAlpha65(ru))} lang="ru" />), /task-gate-held/);
  const none = structuredClone(ru);
  delete none.resources.gates.held;
  delete none.resources.gates.heldLine;
  assert.doesNotMatch(html(<ResourcesPanel view={viewOf(none)} lang="ru" />), /resources-held/);
  // The gate checks the new fields.
  const bad = structuredClone(en);
  bad.resources.gates.held = [{ repositoryId: 'app', gate: 3, workId: 'x' }];
  assert.equal(checkView(bad).ok, false);
});

test('every command the panel shows gives --ttl a unit', () => {
  const pages = [
    html(<PreviewsPanel view={viewRu} lang="ru" />),
    html(<LeadJournal view={viewOf((({ lead: _l, ...r }) => r)(ru))} lang="ru" />),
    html(<Overview view={viewRu} lang="ru" />),
  ];
  const all = shown(pages.join('\n'));
  assert.match(all, /harness lead begin --state <каталог состояния> --ttl 30m/);
  for (const m of all.matchAll(/--ttl\s+(\S+)/g)) assert.match(m[1]!, /^\d+[smh]\b/, m[0]);
});

test('an expired lead lease is not «в сессии»: the harness line says it, on Home and in the journal', () => {
  const expired = structuredClone(ru);
  expired.lead = {
    active: false,
    since: '2026-11-19T09:05:00.000Z',
    until: '2026-11-19T09:35:00.000Z',
    lastNote: { at: '2026-11-19T09:20:00.000Z', plain: 'разбираю отказы импорта' },
    notes: [],
    line: 'ведущий давно не отмечался (срок сессии истёк)',
  };
  const v = viewOf(expired);
  for (const m of [
    shown(html(<LeadSummary view={v} lang="ru" timeZone={TZ} />)),
    shown(html(<LeadJournal view={v} lang="ru" timeZone={TZ} />)),
  ]) {
    assert.match(m, /не в сессии/);
    assert.doesNotMatch(m, /в сессии с/);
    assert.doesNotMatch(m, /отметка действует до/);
    assert.match(m, /ведущий давно не отмечался \(срок сессии истёк\)/);
  }
  // Home: the harness line always, and the last note as a second line.
  const home = html(<LeadSummary view={v} lang="ru" timeZone={TZ} />);
  assert.ok(home.indexOf('data-testid="lead-line"') < home.indexOf('data-testid="lead-last-note"'));
  assert.match(
    shown(home),
    /срок сессии истёк\) Последняя заметка \(09:20\): разбираю отказы импорта/,
  );
  // An active session still says since when, and the harness line too.
  const active = shown(html(<LeadSummary view={viewRu} lang="ru" timeZone={TZ} />));
  assert.match(
    active,
    /работает в сессии с 09:05[^]*ведущий работает: жду ответа[^]*Последняя заметка/,
  );
});

test('every lead journal kind the harness emits has words; unknown kinds stay as is', () => {
  const kinds: [string, string, string][] = [
    ['note', 'заметка', 'note'],
    ['command', 'команда harness', 'harness command'],
    ['begin', 'начало сессии', 'session start'],
    ['end', 'конец сессии', 'session end'],
    ['release-done', 'итог выпуска', 'release summary'],
  ];
  const j = structuredClone(ru);
  j.lead.notes = [
    ...kinds.map(([kind], i) => ({
      at: `2026-11-19T10:0${i}:00.000Z`,
      kind,
      action: 'lead.' + kind,
      plain: 'запись ' + kind,
    })),
    { at: '2026-11-19T10:09:00.000Z', kind: 'new-kind', action: 'lead.x', plain: 'запись new' },
  ];
  const ruText = shown(html(<LeadJournal view={viewOf(j)} lang="ru" timeZone={TZ} />));
  const enText = shown(html(<LeadJournal view={viewOf(j)} lang="en" timeZone={TZ} />));
  for (const [kind, r, e] of kinds) {
    assert.match(ruText, new RegExp(`${r} запись ${kind}`), kind);
    assert.match(enText, new RegExp(`${e} запись ${kind}`), kind);
  }
  assert.match(ruText, /new-kind запись new/);
});

test('a journal cut to nothing says only the cut: no «(N)», no «записей пока нет»', () => {
  const j = structuredClone(ru);
  j.lead.notes = [];
  j.truncated = { leadNotes: 7 };
  const t = shown(html(<LeadJournal view={viewOf(j)} lang="ru" />));
  assert.match(t, /Журнал ведущего Ещё 7 записей журнала не показаны/);
  assert.doesNotMatch(t, /Журнал ведущего \(/);
  assert.doesNotMatch(t, /Записей в журнале пока нет/);
  // A really empty journal says so.
  const e = structuredClone(ru);
  e.lead.notes = [];
  assert.match(
    shown(html(<LeadJournal view={viewOf(e)} lang="ru" />)),
    /Записей в журнале пока нет\./,
  );
});

test('Overview of a revision 6 view without lead and forecast says the lead has not started', () => {
  const { lead: _l, forecast: _f, ...bare } = structuredClone(ru);
  const o = html(<Overview view={viewOf(bare)} lang="ru" />);
  assert.match(o, /data-testid="lead-summary"/);
  assert.match(shown(o), /Ведущий ещё не начинал сессию и не вёл журнал\./);
  // Revision 5: no panel.
  assert.doesNotMatch(html(<Overview view={viewOf(asAlpha65(ru))} lang="ru" />), /lead-summary/);
});

test('planned tasks: the not-ready reason stays, who approves comes from the policy, both screens agree', () => {
  const split = plannedSplit(viewRu, scopeOf(viewRu));
  assert.deepEqual(
    split.planned.map((p) => [p.task.key, p.notReady]),
    [['DEMO-6', 'у задачи нет критериев приёмки']],
  );
  assert.equal(split.outside.length, 0);
  const tasks = shown(html(<Tasks view={viewRu} lang="ru" />));
  const over = shown(html(<Overview view={viewRu} lang="ru" />));
  for (const m of [tasks, over]) {
    assert.match(m, /Не готова: у задачи нет критериев приёмки\./);
    // No blanket «nothing is needed»: the policy says who approves (agent mode — the lead).
    assert.match(m, /попыток не было\. План по ним согласует ведущий \(так задано в политике\)\./);
    assert.doesNotMatch(m, /попыток не было, от вас ничего не нужно/);
    // Listed once: not under «не переданы».
    assert.doesNotMatch(m, /Ещё не переданы в harness \(/);
  }
  // With operator approval the plan is yours.
  const op = structuredClone(ru);
  op.settings.approvalMode = 'operator';
  assert.match(
    shown(html(<Tasks view={viewOf(op)} lang="ru" />)),
    /План по ним утверждаете вы \(в политике план согласует оператор\)\./,
  );
  // The harness line says where the task comes from; the panel does not repeat it.
  assert.doesNotMatch(tasks, /прочитана из трекера, в план ещё не входит/);
  // A planned work no longer claims nothing is needed.
  const p = structuredClone(ru);
  const docs = p.works.find((w: Json) => w.id === 'docs-page');
  docs.planned = true;
  assert.match(
    shown(html(<Tasks view={viewOf(p)} lang="ru" />)),
    /План этой работы ещё не согласован; попыток не было\./,
  );
});
