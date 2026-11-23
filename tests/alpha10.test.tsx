// ui 0.1.0-alpha.10 (pilot 6 owner feedback): the sticky top menu (P6-28),
// one tooltip per attempt group with roving focus and a «сейчас» caption
// (P6-27), the card bar as the current attempt's way to acceptance with an
// attempt badge in the corner (P6-25), the per-attempt review line with the
// lead's `review-code` rounds apart (P6-10), and the lead diagnosis kind
// (`required`, harness alpha.68, P6-3) read tolerantly.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Tasks,
  TrackLine,
  TrackTable,
  attemptProgress,
  attemptReviews,
  checkView,
  diagnosisRequired,
  dict,
  groupTip,
  leadResets,
  stepLabel,
  trackCaption,
  trackGroups,
  drawnSteps,
  type OperatorView,
  type WorkTrack,
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
const TZ = 'UTC';
const t = dict('ru');
const ru = read('../fixtures/ru/view.sample.json');
const viewRu = viewOf(ru);
const work = (v: OperatorView, id: string) => v.works.find((w) => w.id === id)!;
/** One task card's markup from the Tasks screen. */
function card(v: OperatorView, id: string): string {
  const m = html(<Tasks view={v} lang="ru" timeZone={TZ} />);
  const start = m.indexOf(`data-testid="task-${id}"`);
  assert.ok(start >= 0, id);
  const end = m.indexOf('</li>', m.indexOf('data-testid="task-next"', start));
  return m.slice(start, end);
}
const tips = (m: string) =>
  [...m.matchAll(/<span role="tooltip"[^>]*>([\s\S]*?)<\/span>/g)].map((x) => shown(x[1]!));

test('P6-28: the top menu is sticky, opaque, above the content, and anchors land below it', () => {
  const css = readFileSync(new URL('../src/app/app.css', import.meta.url), 'utf8');
  const top = /\.app-top \{([^}]*)\}/.exec(css)![1]!;
  assert.match(top, /position: sticky;/);
  assert.match(top, /top: 0;/);
  assert.match(top, /z-index: 30;/);
  assert.match(top, /background: var\(--hui-surface\);/);
  // Above the panel's tooltips (z-index 20).
  const ui = readFileSync(new URL('../src/components/styles.css', import.meta.url), 'utf8');
  assert.match(ui, /\.hui-tooltip \{[^}]*z-index: 20;/);
  assert.match(css, /html \{\s*scroll-padding-top: calc\(var\(--app-top-h, 64px\) \+ 8px\);/);
  // The app measures the menu for the padding.
  const main = readFileSync(new URL('../src/app/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /setProperty\('--app-top-h'/);
  assert.match(main, /new ResizeObserver\(set\)/);
});

test('P6-27: one tooltip per attempt group, single marks their own, the current with its time', () => {
  const w = work(viewRu, 'locale-format');
  const now = Date.parse('2026-11-19T11:55:10.000Z');
  const m = html(
    <TrackLine
      track={w.track!}
      lang="ru"
      name="Format"
      since={w.stage.since}
      now={now}
      timeZone={TZ}
    />,
  );
  const all = tips(m);
  assert.equal(all.length, trackGroups(w.track!).length);
  assert.equal(all[0], 'Попытка 1: код ✓ · проверки ✗ — проверки не прошли · 11:40');
  assert.equal(all[1], 'Разбор ведущего · D1: слабое покрытие · 11:40');
  assert.equal(all[2], 'Попытка 2: код ✓ · сейчас: проверки, идёт 3 мин');
  assert.equal(all[3], 'Попытка 3: впереди');
  assert.ok(all.includes('Ещё попытки от ведущего · сброс 1 из 2 — впереди'), all.join('\n'));
  // The caption beside the line.
  assert.match(m, /data-testid="track-caption">сейчас: проверки \(попытка 2\)</);
  // Roving focus: one tab stop, on the current attempt; segment names are short.
  const buttons = m.match(/<button[^>]*>/g)!;
  const tab = buttons.findIndex((b) => /tabindex="0"/.test(b));
  assert.equal(tab, 2);
  assert.match(buttons[2]!, /aria-label="Попытка 2"/);
  assert.match(buttons[1]!, /aria-label="Разбор ведущего"/);
  assert.match(m, /role="toolbar" aria-label="Путь задачи Format" aria-describedby="[^"]+-keys"/);
  assert.match(shown(m), /Стрелки переходят между попытками и решениями/);
  // Nothing is open before focus, hover or a tap.
  assert.doesNotMatch(m, /role="tooltip"[^>]*data-open/);
});

test('P6-27: a waiting step is the caption; a rework group names the rework; no track → nothing', () => {
  const w = work(viewRu, 'import-csv');
  assert.equal(trackCaption(w.track!, t), 'сейчас: разбор ведущего — ждёт ведущего');
  const rework: WorkTrack = {
    steps: [
      { kind: 'code', attempt: 2, state: 'passed', label: 'код', rework: 1 },
      { kind: 'checks', attempt: 2, state: 'failed', label: 'проверки', rework: 1 },
    ],
  };
  assert.equal(
    groupTip(trackGroups(rework)[0]!, { t, lang: 'ru' }),
    'Доработка 1 · попытка 2: код ✓ · проверки ✗',
  );
  assert.equal(trackCaption({ steps: [] }, t), undefined);
});

test('P6-25: the current attempt toward acceptance, from the track', () => {
  assert.deepEqual(attemptProgress(work(viewRu, 'locale-format').track, 'verifying'), {
    state: 'running',
    attempt: 2,
    passed: 1,
    of: 4,
    step: 'проверки',
    retryAfter: 'проверки',
  });
  assert.deepEqual(attemptProgress(work(viewRu, 'import-csv').track, 'held'), {
    state: 'next',
    attempt: 3,
    passed: 0,
    of: 4,
    retryAfter: 'ревью',
  });
  assert.equal(attemptProgress(work(viewRu, 'add-greeting').track, 'done').state, 'accepted');
  // The last attempt failed and none is ahead.
  const spent: WorkTrack = {
    steps: [
      { kind: 'code', attempt: 3, state: 'passed', label: 'код' },
      { kind: 'checks', attempt: 3, state: 'passed', label: 'проверки' },
      { kind: 'review', attempt: 3, state: 'failed', label: 'ревью' },
      { kind: 'integration', attempt: 3, state: 'skipped', label: 'интеграция' },
    ],
  };
  assert.deepEqual(attemptProgress(spent, 'held'), {
    state: 'failed',
    attempt: 3,
    passed: 2,
    of: 4,
    step: 'ревью',
  });
  assert.deepEqual(attemptProgress(undefined), { state: 'none', passed: 0, of: 4 });
});

test('P6-25: the card bar, the retry caption and the attempt badge in the corner', () => {
  const running = card(viewRu, 'locale-format');
  assert.match(running, /data-testid="task-progress" data-state="running"/);
  assert.match(shown(running), /Попытка 2: идёт «проверки» — пройдено этапов 1 из 4/);
  assert.match(running, /aria-valuenow="25"/);
  assert.match(running, /aria-valuetext="Попытка 2: к приёмке ~25 %"/);
  assert.match(shown(running), /повтор после отказа: проверки/);
  // The badge: neutral on attempt 2 of 3, its tooltip the attempts and resets.
  const badge = /<span[^>]*data-testid="attempt-badge"[^>]*>[\s\S]*?<\/span>/.exec(running)![0];
  assert.match(badge, /hui:bg-muted hui:text-foreground/);
  assert.match(shown(badge), /^попытка 2 из 3$/);
  assert.match(running, /Попытки: израсходовано 2 из 3, осталось 1; сбросы ведущего: 0 из 2/);
  // The track stays below the bar.
  assert.ok(running.indexOf('task-progress') < running.indexOf('task-track'));
  // The harness readiness wins when the forecast names this attempt.
  const v = structuredClone(ru);
  v.forecast.progress.works = [
    { workId: 'locale-format', percent: 60, attempt: { n: 2, max: 3 }, line: 'DEMO-2: ~60 %' },
  ];
  assert.match(card(viewOf(v), 'locale-format'), /aria-valuetext="Попытка 2: к приёмке ~60 %"/);
  // Another attempt's figure is not this one's.
  v.forecast.progress.works[0].attempt.n = 1;
  assert.match(card(viewOf(v), 'locale-format'), /aria-valuetext="Попытка 2: к приёмке ~25 %"/);
});

test('P6-25: badge tones — red when the lead holds it or attempts are spent, amber on the last', () => {
  const held = card(viewRu, 'import-csv');
  const badge = (m: string) => /<span[^>]*data-testid="attempt-badge"[^>]*>/.exec(m)?.[0] ?? '';
  assert.match(badge(held), /hui:bg-bad-soft/);
  assert.match(badge(held), /data-why="lead"/);
  assert.match(shown(held), /попытка 2 из 3 — ждёт ведущего/);
  assert.match(shown(held), /Попытка 3 ещё не началась повтор после отказа: ревью/);
  // Running the last attempt: amber.
  const v = structuredClone(ru);
  const w = v.works.find((x: Json) => x.id === 'locale-format');
  w.attempts = { ...w.attempts, used: 3, left: 0 };
  for (const s of w.track.steps) if (s.attempt === 2) s.attempt = 3;
  assert.match(badge(card(viewOf(v), 'locale-format')), /hui:bg-warn-soft[^>]*data-why="last"/);
  // Spent and not running, nobody named: red «попытки израсходованы».
  const s = structuredClone(ru);
  const x = s.works.find((y: Json) => y.id === 'export-csv');
  x.attempts = { ...x.attempts, used: 3, left: 0 };
  assert.match(badge(card(viewOf(s), 'export-csv')), /data-why="spent"/);
  // Accepted: neutral, no reason. Never run: no badge.
  assert.doesNotMatch(badge(card(viewRu, 'add-greeting')), /data-why/);
  assert.equal(badge(card(viewRu, 'docs-page')), '');
  // The lead's taken resets are said in the card.
  const r = structuredClone(ru);
  const z = r.works.find((y: Json) => y.id === 'import-csv');
  z.track.steps.splice(9, 0, {
    kind: 'reset',
    state: 'decision',
    actor: 'lead',
    label: 'ещё попытки от ведущего',
    reason: '+3',
  });
  assert.deepEqual(leadResets(viewOf(r).works.find((y) => y.id === 'import-csv')!.track), {
    done: 1,
    total: 3,
    reasons: ['+3'],
  });
  assert.match(shown(card(viewOf(r), 'import-csv')), /сбросы ведущего: 1 из 3 \(\+3\)/);
});

test('P6-10: the review line from the attempts; review-code rounds apart, only when present', () => {
  const held = card(viewRu, 'import-csv');
  assert.match(shown(held), /Ревью: попытка 2 — отклонено/);
  assert.doesNotMatch(held, /Ревью кода ещё не было/);
  assert.doesNotMatch(held, /data-testid="task-reviews"/);
  const v = structuredClone(ru);
  const w = v.works.find((x: Json) => x.id === 'import-csv');
  // An approved review after a rejected one, with the findings count when sent.
  w.track.steps[6].findings = 3;
  w.track.steps.splice(9, 0, { kind: 'review', attempt: 3, state: 'passed', label: 'ревью' });
  const reviews = attemptReviews(viewOf(v).works.find((x) => x.id === 'import-csv')!.track);
  assert.deepEqual(reviews, [
    { attempt: 2, state: 'failed', reason: 'ревью отклонило', findings: 3 },
    { attempt: 3, state: 'passed' },
  ]);
  assert.match(
    shown(card(viewOf(v), 'import-csv')),
    /Ревью: попытка 2 — отклонено \(3 находки\), попытка 3 — одобрено/,
  );
  // The lead's review-code rounds: a separate line.
  v.reviews.push({
    ...structuredClone(v.reviews[0]),
    kind: 'code',
    subject: 'import-csv@abc',
    workId: 'import-csv',
  });
  assert.match(
    shown(card(viewOf(v), 'import-csv')),
    /Дополнительное ревью кода \(ведущий\): раунды 2 из 6/,
  );
  // No attempt reached review yet.
  assert.match(shown(card(viewRu, 'docs-page')), /Ревью: ещё не было/);
  // A work without a track (older harness) keeps the alpha.9 line.
  const old = structuredClone(ru);
  delete old.works.find((x: Json) => x.id === 'import-csv').track;
  assert.match(shown(card(viewOf(old), 'import-csv')), /Ревью кода ещё не было/);
  assert.match(card(viewOf(old), 'import-csv'), /aria-valuetext="Попытки: израсходовано 2 из 3/);
});

test('P6-3: the diagnosis kind — required filled, optional hollow; taken ones say which', () => {
  const track: WorkTrack = {
    steps: [
      { kind: 'code', attempt: 1, state: 'passed', label: 'код' },
      { kind: 'checks', attempt: 1, state: 'failed', label: 'проверки' },
      {
        kind: 'diagnosis',
        state: 'decision',
        actor: 'lead',
        label: 'разбор ведущего',
        reason: 'D1: покрытие',
        required: false,
      } as never,
      { kind: 'code', attempt: 2, state: 'planned', label: 'код' },
      {
        kind: 'diagnosis',
        state: 'planned',
        actor: 'lead',
        label: 'разбор ведущего',
        required: false,
      } as never,
      {
        kind: 'diagnosis',
        state: 'planned',
        actor: 'lead',
        label: 'разбор ведущего',
        required: true,
      } as never,
      { kind: 'diagnosis', state: 'planned', actor: 'lead', label: 'разбор ведущего' },
    ],
  };
  const d = drawnSteps(track);
  assert.equal(diagnosisRequired(d[2]!.step), false);
  assert.equal(diagnosisRequired(d[5]!.step), true);
  assert.equal(diagnosisRequired(d[6]!.step), undefined);
  assert.equal(diagnosisRequired(d[0]!.step), undefined);
  assert.equal(stepLabel(d[2]!, t), 'разбор ведущего · по желанию');
  assert.equal(stepLabel(d[4]!, t), 'повтор: harness сам, ведущий может разобрать');
  assert.equal(stepLabel(d[5]!, t), 'обязательный разбор ведущего');
  assert.equal(stepLabel(d[6]!, t), 'разбор ведущего');
  const m = html(<TrackLine track={track} lang="ru" name="x" timeZone={TZ} />);
  // Optional diamonds are hollow (data-optional); the required one is filled.
  assert.equal((m.match(/data-shape="diamond"[^>]*data-optional=""/g) ?? []).length, 2);
  assert.equal((m.match(/data-shape="diamond"/g) ?? []).length, 4);
  const all = tips(m);
  assert.ok(all.includes('Разбор ведущего · по желанию · D1: покрытие'), all.join('\n'));
  assert.ok(all.includes('Повтор: harness сам, ведущий может разобрать — впереди'), all.join('\n'));
  assert.ok(all.includes('Обязательный разбор ведущего — впереди'), all.join('\n'));
  const table = shown(html(<TrackTable track={track} lang="ru" timeZone={TZ} />));
  assert.match(table, /разбор ведущего · по желанию решение/);
  assert.match(table, /обязательный разбор ведущего впереди/);
  const css = readFileSync(new URL('../src/components/styles.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.hui-dot\[data-shape='diamond'\]\[data-optional\] \{\s*background: transparent;\s*border: 1\.5px dashed/,
  );
});

test('English words for the new lines', () => {
  const e = dict('en').r10;
  assert.equal(e.groupHead(2, undefined), 'Attempt 2');
  assert.equal(e.attemptBadge(2, 3), 'attempt 2 of 3');
  assert.equal(e.retryAfter('review'), 'retry after a failure at: review');
  assert.equal(e.reviewLine('attempt 1 — rejected'), 'Review: attempt 1 — rejected');
  assert.equal(e.codeReview(2, 6), 'Extra code review (lead): rounds 2 of 6');
  assert.equal(t.r10.findings(5), '5 находок');
});

test('P6-5: code accepted, the lead finishing — the ring stays below 100 with a striped tail', async () => {
  const { Overview } = await import('../src/index.ts');
  const { tailDashes } = await import('../src/components/Forecast.tsx');
  const v = structuredClone(ru);
  Object.assign(v.forecast.progress, {
    percent: 100,
    release: { state: 'code-accepted', line: 'код принят, ведущий работает' },
  });
  const m = html(<Overview view={viewOf(v)} lang="ru" />);
  const ring = /data-testid="ring-release"[\s\S]*?<\/svg>/.exec(m)![0];
  assert.match(ring, /data-part="tail"/);
  assert.match(ring, /class="hui-ring-tail"/);
  // The fill is capped at 99 % of the circle; the words keep the harness figure.
  const fill = /stroke-dasharray="([\d.]+) ([\d.]+)"[^>]*data-part="fill"/.exec(ring)!;
  assert.ok(Number(fill[1]) / Number(fill[2]) < 0.995, fill[0]);
  assert.match(shown(m), /Код принят · осталось немного: ведущий завершает работу/);
  // In work or done: no tail.
  assert.doesNotMatch(html(<Overview view={viewRu} lang="ru" />), /data-part="tail"/);
  // Stripes fill the rest of the circle and end with a gap round it.
  const d = tailDashes(0.5).split(' ').map(Number);
  assert.equal(d.at(-2), 0);
  const sum = d.slice(0, -2).reduce((a, b) => a + b, 0);
  assert.ok(sum > 160 && sum <= 174, String(sum)); // half the circle (≈169.6), the last gap may run over
  const css = readFileSync(new URL('../src/components/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.hui-ring-tail \{\s*stroke-opacity: 0\.55;\s*animation: hui-breathe/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.hui-ring-tail \{\s*animation: none/);
});
