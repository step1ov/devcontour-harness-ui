// ui 0.1.0-alpha.13 (harness 0.1.0-alpha.73, view revision 11): thin mode
// on the settings and the home screen (named neutrally, with what it means;
// the write guard line reads as in the light environment), the plan review
// limit lifted «тонкий режим», and the writer session of each attempt in the
// work detail («сессия: новая / продолжена / новая после переполнения»).
// Older views (revision 10) render as in alpha.12.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HarnessModePanel,
  Overview,
  Reviews,
  Settings,
  WorkDetail,
  WriterSessionText,
  checkOverview,
  checkView,
  checkWorkDetail,
  dict,
  dictionaries,
  isThinMode,
  writerSessionOf,
  type OperatorView,
  type WorkDetailView,
} from '../src/index.ts';
import { revision10View } from './revision10.ts';
import { revision11Detail, revision11View } from './revision11.ts';

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
/** The text of the first element with this test id (and its children). */
function part(markup: string, testid: string): string {
  const start = markup.indexOf(`data-testid="${testid}"`);
  assert.ok(start >= 0, testid);
  const open = markup.lastIndexOf('<', start);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open))![1]!;
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return shown(markup.slice(open, m.index + m[0].length));
  }
  throw new Error('unclosed ' + testid);
}
const TZ = 'UTC';
const thin = (f?: (d: Json) => void, lang: 'ru' | 'en' = 'ru') => {
  const d = revision11View(lang);
  f?.(d);
  return viewOf(d);
};

test('both dictionaries carry the alpha.13 texts with the same keys', () => {
  assert.deepEqual(
    Object.keys(dictionaries.ru.r13).sort(),
    Object.keys(dictionaries.en.r13).sort(),
  );
  for (const k of ['writerSession', 'writerSessionWhy'] as const) {
    assert.deepEqual(
      Object.keys(dictionaries.ru.r13[k]).sort(),
      ['fallback', 'fresh', 'resumed'],
      k,
    );
    assert.deepEqual(Object.keys(dictionaries.en.r13[k]).sort(), ['fallback', 'fresh', 'resumed']);
  }
  // Every mode of the harness schema has a name in both languages.
  for (const lang of ['ru', 'en'] as const)
    assert.deepEqual(Object.keys(dictionaries[lang].r11.mode).sort(), ['light', 'strict', 'thin']);
  assert.equal(dict('ru').r11.mode.thin, 'тонкий');
  assert.equal(dict('en').r11.mode.thin, 'thin');
});

test('accessors: thin mode and the writer session; absent in revision 10 and other modes', () => {
  assert.equal(isThinMode(thin()), true);
  assert.equal(isThinMode(viewOf(revision10View())), false);
  assert.equal(
    isThinMode(
      thin((d) => (d.settings.harnessMode = { mode: 'light', default: true, writeGuard: true })),
    ),
    false,
  );
  const d = detailOf(revision11Detail());
  assert.deepEqual(
    d.attempts.map((a) => writerSessionOf(a)),
    ['resumed', 'fresh'],
  );
  assert.equal(
    writerSessionOf(detailOf(read('../fixtures/ru/work.sample.json')).attempts[0]!),
    undefined,
  );
});

test('settings: thin mode named neutrally, with what it means and the write guard of light', () => {
  const m = html(<Settings view={thin()} lang="ru" />);
  const panel = part(m, 'settings-harness-mode');
  assert.match(panel, /^Режим harness тонкий · выбран в политике Защита записи:/);
  assert.match(m, /data-testid="settings-harness-mode" data-mode="thin" data-guard="on"/);
  assert.equal(
    part(m, 'harness-mode-thin'),
    'Тонкий режим: окружение облегчённого, поток тоньше. Исполнитель считается честным, но ошибающимся: у работы одна сессия исполнителя, она продолжается от сдачи к сдаче; каждая сдача проверяется на чистом checkout цели и проходит одно независимое ревью против постановки.',
  );
  // Nothing in the mode panel is flagged while the guard is in force.
  assert.doesNotMatch(part(m, 'settings-harness-mode'), /blocked/);
  assert.doesNotMatch(
    m.slice(m.indexOf('data-testid="settings-harness-mode"')).split('</div>')[0]!,
    /data-status="blocked"/,
  );
  // The round cap names thin mode, not light.
  assert.match(shown(m), /без предела \(тонкий режим; в строгом — \d+\)/);
  assert.doesNotMatch(shown(m), /облегчённый режим; в строгом/);
});

test('settings in English: thin mode and its explanation', () => {
  const m = html(<Settings view={thin(undefined, 'en')} lang="en" />);
  assert.match(
    part(m, 'settings-harness-mode'),
    /^Harness mode thin · set in the policy Write guard:/,
  );
  assert.match(
    part(m, 'harness-mode-thin'),
    /^Thin mode: the light environment with a thinner flow\./,
  );
  assert.match(part(m, 'harness-mode-thin'), /one independent review against the task\.$/);
  assert.match(shown(m), /no limit \(thin mode; \d+ in strict\)/);
});

test('thin mode without the write guard: the guard line is flagged as in light mode', () => {
  const m = html(
    <HarnessModePanel view={thin((d) => (d.settings.harnessMode.writeGuard = false))} lang="ru" />,
  );
  assert.match(m, /data-testid="harness-mode-guard" data-status="blocked"/);
  assert.match(part(m, 'harness-mode-guard'), /^Защиты записи нет/);
  // The mode itself is not flagged: its name and explanation stay neutral.
  assert.match(m, /data-testid="harness-mode-thin">/);
  assert.equal(part(m, 'harness-mode-name'), 'тонкий');
});

test('light and strict panels have no thin explanation', () => {
  for (const mode of ['light', 'strict'] as const) {
    const m = html(
      <HarnessModePanel
        view={thin(
          (d) => (d.settings.harnessMode = { mode, default: false, writeGuard: mode === 'light' }),
        )}
        lang="ru"
      />,
    );
    assert.doesNotMatch(m, /harness-mode-thin/, mode);
  }
});

test('the home screen: «режим: тонкий» with what it means in the tooltip', () => {
  const o = html(<Overview view={thin()} lang="ru" timeZone={TZ} />);
  assert.equal(part(o, 'harness-mode'), 'режим: тонкий');
  assert.match(part(o, 'harness-mode-why'), /^режим: тонкий Тонкий режим: окружение облегчённого/);
  assert.match(o, /role="tooltip"/);
  // Light mode keeps its plain badge without the tooltip.
  const light = html(
    <Overview
      view={thin(
        (d) => (d.settings.harnessMode = { mode: 'light', default: true, writeGuard: true }),
      )}
      lang="ru"
      timeZone={TZ}
    />,
  );
  assert.equal(part(light, 'harness-mode'), 'режим: облегчённый');
  assert.doesNotMatch(light, /harness-mode-why/);
});

test('reviews: plan rounds without a limit name thin mode', () => {
  const m = html(<Reviews view={thin()} lang="ru" timeZone={TZ} />);
  assert.match(
    part(m, 'review-plan-g1'),
    /раундов 2, без предела · тонкий режим; бюджет — время и стоимость выпуска/,
  );
  assert.doesNotMatch(m, /облегчённый режим; бюджет/);
  const en = html(<Reviews view={thin(undefined, 'en')} lang="en" timeZone={TZ} />);
  assert.match(part(en, 'review-plan-g1'), /thin mode; the budget is the release time and cost/);
});

test('the work detail: each attempt names its writer session, with what it means', () => {
  const m = html(<WorkDetail detail={detailOf(revision11Detail())} lang="ru" timeZone={TZ} />);
  const rows = part(m, 'work-attempts');
  assert.match(rows, /Попытка 2 .*· сессия: продолжена/);
  assert.match(rows, /Попытка 1 .*· сессия: новая/);
  assert.match(m, /data-testid="writer-session" data-session="resumed"/);
  assert.match(m, /data-testid="writer-session" data-session="fresh"/);
  assert.match(shown(m), /Сессия исполнителя: продолжение сессии этой работы/);
  const en = html(<WorkDetail detail={detailOf(revision11Detail('en'))} lang="en" timeZone={TZ} />);
  assert.match(part(en, 'work-attempts'), /· session: resumed/);
  assert.match(part(en, 'work-attempts'), /· session: new/);
});

test('the writer session: fallback reads «новая после переполнения»; an unknown one is its code', () => {
  const t = dict('ru');
  const fb = html(<WriterSessionText row={{ writerSession: 'fallback' }} t={t} />);
  assert.equal(part(fb, 'writer-session'), '· сессия: новая после переполнения');
  assert.match(shown(fb), /контекст переполнен или сессия утрачена/);
  const later = html(
    <WriterSessionText row={{ writerSession: 'later' as unknown as 'fresh' }} t={t} />,
  );
  assert.equal(part(later, 'writer-session'), '· сессия: later');
  assert.doesNotMatch(later, /role="tooltip"/);
  assert.equal(html(<WriterSessionText row={{}} t={t} />), '');
  assert.equal(
    part(
      html(<WriterSessionText row={{ writerSession: 'fallback' }} t={dict('en')} />),
      'writer-session',
    ),
    '· session: new after overflow',
  );
});

test('a revision 10 view and detail render as in alpha.12: no thin text, no session', () => {
  const o = html(<Overview view={viewOf(revision10View())} lang="ru" timeZone={TZ} />);
  const s = html(<Settings view={viewOf(revision10View())} lang="ru" />);
  for (const m of [o, s]) {
    assert.doesNotMatch(m, /harness-mode-thin|harness-mode-why|тонкий/);
  }
  const d = html(
    <WorkDetail
      detail={detailOf(read('../fixtures/ru/work.sample.json'))}
      lang="ru"
      timeZone={TZ}
    />,
  );
  assert.doesNotMatch(d, /writer-session/);
});

test('the real alpha.73 thin envelope renders thin mode on the home screen and in settings', () => {
  const env = read('./contract/harness/setup-progress-thin.view.json');
  const c = checkOverview(env.data);
  assert.ok(c.ok && !('setup' in c));
  const view = (c as { view: OperatorView }).view;
  assert.equal(isThinMode(view), true);
  const s = html(<Settings view={view} lang="en" />);
  assert.match(
    part(s, 'settings-harness-mode'),
    /^Harness mode thin · set in the policy Write guard:/,
  );
});

test('the gate keeps revision 11 views and flags a newer one', () => {
  const c = checkView(revision11View());
  assert.equal(c.ok && c.newerRevision, false);
  const later = checkView({ ...revision11View(), viewRevision: 12 });
  assert.equal(later.ok && later.newerRevision, true);
  const d = checkWorkDetail({ ...revision11Detail(), viewRevision: 12 });
  assert.equal(d.ok && d.newerRevision, true);
});
