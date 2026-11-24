// ui 0.1.0-alpha.11 (harness 0.1.0-alpha.69, view revision 9): the harness
// mode in the settings and the header with a line on the write guard, plan
// review rounds without a limit in light mode, the «Ревью выпуска» block of
// the forecast (and the release never at 100 % before it is approved), the
// release review subject on the reviews screen, and the cause of a held gate.
// Older views keep the alpha.10 behaviour.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ForecastRings,
  HarnessModePanel,
  LeadSummary,
  Overview,
  ReleaseReview,
  ResourcesPanel,
  Reviews,
  Settings,
  Tasks,
  WorkDetail,
  checkView,
  checkWorkDetail,
  dict,
  dictionaries,
  harnessModeOf,
  heldCauses,
  releaseReviewOf,
  releaseWaitsForReview,
  reviewRoundsUnlimited,
  roundsWithoutLimit,
  type OperatorView,
  type ReleaseReviewView,
  type WorkDetailView,
} from '../src/index.ts';

type Json = Record<string, any>;
const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
const viewOf = (doc: Json): OperatorView => {
  const c = checkView(doc);
  if (!c.ok) throw new Error(c.message);
  return c.view;
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
const ru = read('../fixtures/ru/view.sample.json');
const en = read('../fixtures/view.sample.json');
const t = dict('ru');

const review = (over: Partial<ReleaseReviewView> = {}): ReleaseReviewView => ({
  required: true,
  status: 'findings',
  round: 2,
  open: 3,
  blocking: 1,
  base: '1a2b3c4',
  baseSource: 'register',
  head: '5d6e7f8',
  target: 'main',
  at: '2026-11-19T11:50:00.000Z',
  line: 'приёмка выпуска: блокирующих 1 из открытых 3 (раунд 2) — исправить работами (обязательна: release done ждёт)',
  ...over,
});

/** The Russian demo view as revision 9: light mode, a release review, a held gate cause. */
function r9(mutate?: (d: Json) => void): OperatorView {
  const d = structuredClone(ru);
  d.viewRevision = 9;
  d.settings.harnessMode = { mode: 'light', default: true, writeGuard: true };
  d.settings.thresholds.reviewRoundsUnlimited = true;
  d.reviews[0].rounds = { used: 7, max: null };
  d.forecast.progress.release.review = review();
  d.reviews.push({
    kind: 'release',
    subject: 'release',
    approved: false,
    rounds: { used: 2, max: null },
    open: { blocking: 1, notes: 2 },
    accepted: 0,
    reviewer: { runtime: 'codex' },
    spend: { calls: 2, usd: { value: 0.4, bound: 'exact' } },
    findings: [{ id: 'R1', severity: 'high', status: 'open', rounds: 1 }],
    line: 'выпуск: замечаний 3, блокирующих 1',
  });
  d.resources.gates.held[0].cause = 'gate-definition';
  mutate?.(d);
  return viewOf(d);
}

test('both dictionaries carry the alpha.11 texts with the same keys', () => {
  assert.deepEqual(
    Object.keys(dictionaries.ru.r11).sort(),
    Object.keys(dictionaries.en.r11).sort(),
  );
  for (const k of ['mode', 'releaseReview', 'baseSource', 'heldCause'] as const)
    assert.deepEqual(
      Object.keys(dictionaries.ru.r11[k]).sort(),
      Object.keys(dictionaries.en.r11[k]).sort(),
      k,
    );
  assert.equal(t.reviews.kind.release, 'выпуск');
  assert.equal(dictionaries.en.reviews.kind.release, 'release');
});

test('accessors: absent in an older view, the harness values in revision 9', () => {
  const old = viewOf(ru);
  assert.equal(harnessModeOf(old), undefined);
  assert.equal(reviewRoundsUnlimited(old), false);
  assert.equal(releaseReviewOf(old.forecast), undefined);
  assert.equal(releaseWaitsForReview(old.forecast), false);
  assert.deepEqual(heldCauses(old), []);
  const v = r9();
  assert.deepEqual(harnessModeOf(v), { mode: 'light', default: true, writeGuard: true });
  assert.equal(reviewRoundsUnlimited(v), true);
  assert.equal(releaseReviewOf(v.forecast)?.status, 'findings');
  assert.equal(releaseWaitsForReview(v.forecast), true);
  assert.deepEqual(heldCauses(v), ['gate-definition']);
  assert.deepEqual(heldCauses(v, 'import-csv'), ['gate-definition']);
  assert.deepEqual(heldCauses(v, 'add-greeting'), []);
  // Approved or advisory: the review does not hold the release.
  for (const over of [{ status: 'approved' as const }, { required: false }]) {
    const a = r9((d) => Object.assign(d.forecast.progress.release.review, over));
    assert.equal(releaseWaitsForReview(a.forecast), false, JSON.stringify(over));
  }
  // Light mode lifts the limit of plan and contract rounds only.
  const plan = { kind: 'plan' as const, rounds: { used: 2, max: 6 } };
  assert.equal(roundsWithoutLimit(plan, false), false);
  assert.equal(roundsWithoutLimit(plan, true), true);
  assert.equal(roundsWithoutLimit({ ...plan, kind: 'contract' }, true), true);
  assert.equal(roundsWithoutLimit({ ...plan, kind: 'code' }, true), false);
  assert.equal(roundsWithoutLimit({ kind: 'code', rounds: { used: 2, max: null } }, false), true);
});

test('settings: the harness mode with the write guard line; the round cap says «без предела»', () => {
  const m = html(<Settings view={r9()} lang="ru" />);
  assert.equal(
    part(m, 'settings-harness-mode'),
    'Режим harness облегчённый · по умолчанию Защита записи: исполнитель и проверки пишут только в своё дерево попытки, свой временный каталог и кеши (от случайных ошибок, не граница безопасности).',
  );
  assert.match(m, /data-mode="light"/);
  assert.match(m, /data-guard="on"/);
  assert.match(
    shown(m),
    /Раундов ревью на предмет без предела \(облегчённый режим; в строгом — 6\)/,
  );
  // Strict, chosen in the policy: the OS sandbox line.
  const strict = html(
    <HarnessModePanel
      view={r9((d) => {
        d.settings.harnessMode = { mode: 'strict', default: false, writeGuard: false };
        delete d.settings.thresholds.reviewRoundsUnlimited;
      })}
      lang="ru"
    />,
  );
  assert.equal(
    part(strict, 'settings-harness-mode'),
    'Режим harness строгий · выбран в политике Песочница ОС: исполнитель и проверки изолированы, как в прежнем режиме.',
  );
  // Light without the guard: a blocked line.
  const off = html(
    <HarnessModePanel view={r9((d) => (d.settings.harnessMode.writeGuard = false))} lang="ru" />,
  );
  assert.match(off, /data-testid="harness-mode-guard" data-status="blocked"/);
  assert.match(shown(off), /Защиты записи нет/);
  // English.
  const e = html(
    <Settings
      view={viewOf({
        ...structuredClone(en),
        viewRevision: 9,
        settings: {
          ...en.settings,
          harnessMode: { mode: 'light', default: true, writeGuard: true },
        },
      })}
      lang="en"
    />,
  );
  assert.match(part(e, 'settings-harness-mode'), /^Harness mode light · default Write guard:/);
});

test('an older view: no mode panel, no header badge, the round cap as a number', () => {
  const old = viewOf(ru);
  const m = html(<Settings view={old} lang="ru" />);
  assert.doesNotMatch(m, /settings-harness-mode/);
  assert.match(shown(m), /Раундов ревью на предмет 6/);
  const o = html(<Overview view={old} lang="ru" timeZone={TZ} />);
  assert.doesNotMatch(o, /data-testid="harness-mode"/);
  assert.doesNotMatch(o, /release-review/);
});

test('the header names the mode', () => {
  const o = html(<Overview view={r9()} lang="ru" timeZone={TZ} />);
  assert.equal(part(o, 'harness-mode'), 'режим: облегчённый');
  const s = html(
    <Overview
      view={r9(
        (d) => (d.settings.harnessMode = { mode: 'strict', default: false, writeGuard: false }),
      )}
      lang="en"
      timeZone={TZ}
    />,
  );
  assert.equal(part(s, 'harness-mode'), 'mode: strict');
});

test('reviews: plan rounds «раундов N, без предела» in light mode; the release review subject', () => {
  const m = html(<Reviews view={r9()} lang="ru" timeZone={TZ} />);
  const plan = part(m, 'review-plan-g1');
  assert.match(
    plan,
    /раундов 7, без предела · облегчённый режим; бюджет — время и стоимость выпуска/,
  );
  assert.doesNotMatch(plan, /из 6/);
  assert.doesNotMatch(plan, /осталось/);
  // Even when the harness still sends its strict limit, light mode reads no limit.
  const capped = html(
    <Reviews
      view={r9((d) => (d.reviews[0].rounds = { used: 3, max: 6, remaining: 3 }))}
      lang="ru"
      timeZone={TZ}
    />,
  );
  assert.match(part(capped, 'review-plan-g1'), /раундов 3, без предела/);
  assert.doesNotMatch(part(capped, 'review-plan-g1'), /раунды 3 из 6|осталось 3/);
  // The release review: its own kind label and card.
  const rel = part(m, 'review-release-release');
  assert.match(rel, /^выпуск не одобрено/);
  assert.match(rel, /раундов 2, без предела/);
  assert.doesNotMatch(rel, /облегчённый режим/, 'the light-mode reason is for plan rounds');
  assert.match(rel, /открыто: блокирующих 1, заметок 2/);
  assert.match(shown(m), /release выпуск раундов 2, без предела/);
  // An older view keeps «раунды N из M».
  const old = html(<Reviews view={viewOf(ru)} lang="ru" timeZone={TZ} />);
  assert.match(part(old, 'review-plan-g1'), /раунды 2 из 6/);
  assert.doesNotMatch(old, /rounds-unlimited/);
});

test('the work detail renders a release review subject', () => {
  const d = structuredClone(read('../fixtures/ru/work.sample.json'));
  d.viewRevision = 9;
  d.reviews.push({
    kind: 'release',
    subject: 'release',
    approved: true,
    rounds: { used: 1, max: null },
    open: { blocking: 0, notes: 0 },
    accepted: 0,
    spend: { calls: 1, usd: { value: 0.2, bound: 'exact' } },
    findings: [],
  });
  const c = checkWorkDetail(d);
  assert.ok(c.ok, c.ok ? '' : c.message);
  const m = html(
    <WorkDetail detail={(c as { detail: WorkDetailView }).detail} lang="ru" timeZone={TZ} />,
  );
  assert.match(part(m, 'review-release-release'), /^выпуск одобрено/);
});

test('«Ревью выпуска»: each state in words, the round, required or advisory, the base and the harness line', () => {
  const block = (r: ReleaseReviewView, lang: 'ru' | 'en' = 'ru') =>
    part(html(<ReleaseReview review={r} lang={lang} />), 'release-review');
  assert.equal(
    block(review()),
    'Ревью выпуска: замечания 3 (блокирующих 1) · раунд 2 обязательно: release done ждёт одобрения ' +
      review().line +
      ' база выпуска 1a2b3c4 (при регистрации графа)',
  );
  assert.match(
    block(
      review({
        status: 'not-run',
        round: undefined,
        open: undefined,
        blocking: undefined,
        base: undefined,
        line: 'приёмки выпуска нет: harness review-release до release done (обязательна: release done ждёт)',
      }),
    ),
    /^Ревью выпуска: не запускалось обязательно: release done ждёт одобрения приёмки выпуска нет/,
  );
  assert.match(
    block(review({ status: 'stale', baseSource: 'outline' })),
    /^Ревью выпуска: устарело · раунд 2 .* \(по плану выпуска\)$/,
  );
  const ok = block(
    review({
      status: 'approved',
      open: 0,
      blocking: 0,
      line: 'приёмка выпуска одобрена (раунд 2)',
    }),
  );
  assert.match(ok, /^Ревью выпуска: одобрено · раунд 2 приёмка выпуска одобрена/);
  assert.doesNotMatch(ok, /обязательно/);
  assert.match(block(review({ required: false, status: 'not-run' })), /совет: выпуск не держит/);
  assert.match(
    block(review({ baseSource: 'attempt' }), 'en'),
    /^Release review: 3 findings \(1 blocking\) · round 2 required: release done waits for approval .* release base 1a2b3c4 \(from an early attempt\)$/,
  );
  // An unknown later state reads as its code, never as approved.
  const later = html(<ReleaseReview review={review({ status: 'later' as never })} lang="ru" />);
  assert.match(part(later, 'release-review-state'), /^later$/);
  // Tones: blocking findings are red, approved green.
  assert.match(html(<ReleaseReview review={review()} />), /hui:text-bad/);
  assert.match(html(<ReleaseReview review={review({ status: 'approved' })} />), /hui:text-ok/);
});

test('the forecast never shows 100 % while a required release review is not approved', () => {
  const at = (pct: number, over: Partial<ReleaseReviewView>, state = 'code-accepted') =>
    r9((d) => {
      d.forecast.progress.percent = pct;
      d.forecast.progress.release.state = state;
      Object.assign(d.forecast.progress.release.review, over);
    });
  const ring = (v: OperatorView) =>
    html(<ForecastRings forecast={v.forecast!} lang="ru" now={Date.parse(v.generatedAt)} />);
  // Findings, at a 100 the harness would never send: the panel still holds 99.
  const held = ring(at(100, {}, 'in-work'));
  assert.match(held, /aria-valuenow="99"/);
  assert.doesNotMatch(held, /aria-valuenow="100"/);
  assert.match(
    part(held, 'release-review-capped'),
    /не покажет 100 %, пока ревью выпуска не одобрено/,
  );
  // Approved and done: 100.
  const done = ring(at(100, { status: 'approved' }, 'done'));
  assert.match(done, /aria-valuenow="100"/);
  assert.doesNotMatch(done, /release-review-capped/);
  // Advisory: the review does not hold the figure.
  const adv = ring(at(100, { required: false }, 'done'));
  assert.match(adv, /aria-valuenow="100"/);
  // A lower figure is shown as the harness sent it, with the block and no cap line.
  const low = ring(at(62, {}, 'in-work'));
  assert.match(low, /aria-valuenow="62"/);
  assert.match(part(low, 'release-review'), /^Ревью выпуска: замечания 3/);
  assert.doesNotMatch(low, /release-review-capped/);
  // An older view: no block, the alpha.10 figure.
  const old = viewOf(ru);
  const o = html(<ForecastRings forecast={old.forecast!} lang="ru" />);
  assert.doesNotMatch(o, /release-review/);
  assert.match(o, new RegExp(`aria-valuenow="${Math.round(old.forecast!.progress.percent)}"`));
});

test('the home screen shows «Ревью выпуска»; the lead panel repeats the harness line', () => {
  const v = r9();
  const o = html(<Overview view={v} lang="ru" timeZone={TZ} />);
  assert.match(part(o, 'release-review'), /^Ревью выпуска: замечания 3 \(блокирующих 1\)/);
  const l = html(<LeadSummary view={v} lang="ru" timeZone={TZ} />);
  assert.equal(part(l, 'lead-release-review'), `Ревью выпуска: ${review().line}`);
});

test('a held gate names its cause: «проверка не назвала причину» for gate-definition', () => {
  const v = r9();
  const r = html(<ResourcesPanel view={v} lang="ru" timeZone={TZ} />);
  assert.equal(
    part(r, 'resources-held-cause'),
    '— проверка не назвала причину — исправить команду проверки, ход ведущего',
  );
  assert.match(r, /data-cause="gate-definition"/);
  // The task card of the work whose attempt held the gate says the same.
  const tasks = html(<Tasks view={v} lang="ru" timeZone={TZ} />);
  assert.equal(
    part(tasks, 'task-gate-cause'),
    'проверка не назвала причину — исправить команду проверки, ход ведущего',
  );
  // Sandbox causes have their own words; an unknown cause is its code on «Что задействовано».
  const sb = html(
    <ResourcesPanel
      view={r9((d) => (d.resources.gates.held[0].cause = 'sandbox-browser'))}
      lang="en"
    />,
  );
  assert.match(part(sb, 'resources-held-cause'), /starts a browser/);
  const later = r9((d) => (d.resources.gates.held[0].cause = 'later-cause'));
  assert.match(
    part(html(<ResourcesPanel view={later} lang="ru" />), 'resources-held-cause'),
    /later-cause/,
  );
  assert.doesNotMatch(html(<Tasks view={later} lang="ru" timeZone={TZ} />), /task-gate-cause/);
  // An older view: no cause, the alpha.10 line only.
  const old = viewOf(ru);
  assert.doesNotMatch(html(<ResourcesPanel view={old} lang="ru" />), /resources-held-cause/);
  assert.doesNotMatch(html(<Tasks view={old} lang="ru" timeZone={TZ} />), /task-gate-cause/);
});
