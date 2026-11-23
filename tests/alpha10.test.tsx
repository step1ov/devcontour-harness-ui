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

test('revision 8: the harness per-attempt review results win over the track', () => {
  const v = structuredClone(ru);
  const w = v.works.find((x: Json) => x.id === 'import-csv');
  w.attemptReviews = [
    {
      attempt: 1,
      phase: 'candidate',
      verdict: 'rejected',
      findings: 3,
      notes: 1,
      at: '2026-11-19T10:40:00.000Z',
      earlier: true,
    },
    {
      attempt: 2,
      phase: 'candidate',
      verdict: 'rejected',
      findings: 0,
      notes: 0,
      at: '2026-11-19T11:35:00.000Z',
    },
    {
      attempt: 2,
      phase: 'integration',
      verdict: 'approved',
      findings: 0,
      notes: 0,
      at: '2026-11-19T11:36:00.000Z',
    },
    {
      attempt: 3,
      phase: 'candidate',
      verdict: 'invalid',
      findings: 0,
      notes: 0,
      at: '2026-11-19T11:37:00.000Z',
    },
  ];
  const m = card(viewOf(v), 'import-csv');
  assert.match(m, /data-testid="task-attempt-reviews" data-source="harness"/);
  assert.match(
    shown(m),
    /Ревью: попытка 1, до доработки — отклонено \(3 находки, 1 заметка\), попытка 2 — отклонено, попытка 2, интеграция — одобрено, попытка 3 — ответ не по протоколу/,
  );
  // An empty list: no review yet, by the harness's word.
  w.attemptReviews = [];
  assert.match(shown(card(viewOf(v), 'import-csv')), /Ревью: ещё не было/);
  // Without the field (revision 7): from the track, as before.
  assert.match(card(viewRu, 'import-csv'), /data-source="track"/);
});

test('revision 8: a reopened work says why, in the harness words, with its attempt limit', () => {
  const v = structuredClone(ru);
  const w = v.works.find((x: Json) => x.id === 'add-greeting');
  w.reopened = {
    at: '2026-11-19T11:00:00.000Z',
    by: 'lead',
    revision: 2,
    budget: 'fresh',
    acceptedSha: '3b1f9e0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    spent: 1,
    reason: 'переоткрыта ведущим: доработка после приёмки (принятый результат 3b1f9e0 не включён)',
  };
  assert.match(
    shown(card(viewOf(v), 'add-greeting')),
    /переоткрыта ведущим: доработка после приёмки \(принятый результат 3b1f9e0 не включён\) · свой предел попыток/,
  );
  w.reopened.budget = 'later-kind';
  const later = shown(card(viewOf(v), 'add-greeting'));
  assert.match(later, /не включён\)/);
  assert.doesNotMatch(later, /не включён\) ·/);
  delete w.reopened;
  assert.doesNotMatch(card(viewOf(v), 'add-greeting'), /task-reopened/);
});

test('revision 8: the harness diagnosis labels stay as sent; waiting and taken ones say which', () => {
  const steps = drawnSteps({
    steps: [
      {
        kind: 'diagnosis',
        state: 'planned',
        actor: 'lead',
        label: 'повтор: harness сам, ведущий может разобрать',
        required: false,
      } as never,
      {
        kind: 'diagnosis',
        state: 'waiting',
        actor: 'lead',
        label: 'разбор ведущего',
        required: true,
      } as never,
      {
        kind: 'diagnosis',
        state: 'decision',
        actor: 'lead',
        label: 'разбор ведущего',
        required: true,
      } as never,
    ],
  });
  assert.equal(stepLabel(steps[0]!, t), 'повтор: harness сам, ведущий может разобрать');
  assert.equal(stepLabel(steps[1]!, t), 'разбор ведущего · обязательный');
  assert.equal(stepLabel(steps[2]!, t), 'разбор ведущего · обязательный');
});

test('revision 8 (P6-26): the decisions the harness fills render with their kinds and actors', async () => {
  const { Decisions } = await import('../src/index.ts');
  const v = structuredClone(ru);
  v.decisions = [
    {
      id: 'diagnosis:0123456789abcdef',
      kind: 'diagnosis',
      by: 'lead',
      at: '2026-11-19T11:40:50.000Z',
      workId: 'locale-format',
      subject: 'D1',
      temporary: false,
      title: 'слабое покрытие · по желанию',
      reason: 'тест не ловит лишний импорт',
    },
    {
      id: 'reset:0123456789abcdef',
      kind: 'reset',
      by: 'operator',
      at: '2026-11-19T11:38:00.000Z',
      workId: 'export-csv',
      temporary: false,
      title: '+1',
    },
    {
      id: 'cancel:0123456789abcdef',
      kind: 'cancel',
      by: 'operator',
      at: '2026-11-19T11:20:00.000Z',
      workId: 'docs-page',
      temporary: false,
    },
    {
      id: 'reapproval:0123456789abcdef',
      kind: 'reapproval',
      by: 'lead',
      at: '2026-11-19T11:10:00.000Z',
      subject: 'g1',
      temporary: false,
      reason: 'новая задача в плане',
    },
    {
      id: 'later:0123456789abcdef',
      kind: 'later-kind',
      by: 'lead',
      at: '2026-11-19T11:00:00.000Z',
      temporary: false,
    },
  ];
  const m = shown(html(<Decisions view={viewOf(v)} lang="ru" timeZone={TZ} />));
  assert.match(m, /Все решения \(5\)/);
  assert.match(
    m,
    /11:40 разбор ведущего по D1 \( locale-format \) · кто решил: ведущий слабое покрытие · по желанию причина: тест не ловит лишний импорт/,
  );
  assert.match(m, /11:38 новый предел попыток \( export-csv \) · кто решил: вы \+1/);
  assert.match(m, /11:20 отмена \( docs-page \) · кто решил: вы/);
  assert.match(m, /повторное согласование плана по g1/);
  // An unknown kind is shown as its code.
  assert.match(m, /11:00 later-kind/);
  assert.match(m, /Временных решений нет/);
});

test('alpha.68 forecast: the lead stretch with its live time, no exceeded estimate, the conditional figure, plan growth', async () => {
  const { Overview } = await import('../src/index.ts');
  const v = structuredClone(ru);
  Object.assign(v.forecast.progress, {
    percent: 95,
    conditional: true,
    release: { state: 'code-accepted', line: 'код принят, ведущий работает' },
    growth: {
      at: '2026-11-19T11:01:00.000Z',
      added: ['photo-gate-handoff'],
      before: 95,
      after: 80,
      by: 'outline',
      reason: 'передача секрета из жизненного цикла',
      line: 'план вырос: +photo-gate-handoff (было 95 % → стало 80 %)',
    },
  });
  // The lead's usual 30 min, the stretch started 40 min before the viewer's clock.
  v.forecast.time.finishing = { since: '2026-11-19T11:25:00.000Z', elapsedMs: 60_000 };
  const now = Date.parse('2026-11-19T12:05:00.000Z');
  const m = shown(html(<Overview view={viewOf(v)} lang="ru" now={now} />));
  assert.match(m, /Код принят · осталось немного: ведущий завершает работу \(идёт уже 40 мин\)/);
  assert.doesNotMatch(m, /работа ведущего ~30 мин/);
  assert.match(
    m,
    /Цифра — по известному плану: если ведущий добавит задачи, она сдвинется назад\./,
  );
  assert.match(
    m,
    /план вырос: \+photo-gate-handoff \(было 95 % → стало 80 %\) почему: передача секрета из жизненного цикла/,
  );
  // Within the estimate: the lead line stays.
  v.forecast.time.finishing = { since: '2026-11-19T12:00:00.000Z', elapsedMs: 60_000 };
  assert.match(
    shown(html(<Overview view={viewOf(v)} lang="ru" now={now} />)),
    /работа ведущего ~30 мин/,
  );
  // The harness says it is exceeded: hidden whatever the clock.
  v.forecast.time.finishing.exceeded = true;
  assert.doesNotMatch(
    shown(html(<Overview view={viewOf(v)} lang="ru" now={now} />)),
    /работа ведущего ~30 мин/,
  );
  // A revision 7 document: none of these lines.
  const old = html(<Overview view={viewRu} lang="ru" now={now} />);
  for (const id of ['release-if', 'forecast-growth', 'forecast-stages', 'time-outline'])
    assert.doesNotMatch(old, new RegExp(`data-testid="${id}"`));
});

test('alpha.68 forecast: stages of the release outline, the infra share without one, the no-outline hint', async () => {
  const { Overview } = await import('../src/index.ts');
  const v = structuredClone(ru);
  v.forecast.outline = {
    state: 'recorded',
    revision: 1,
    units: 10,
    stages: [
      {
        id: 'infra',
        kind: 'infra',
        state: 'registered',
        units: 3,
        registered: 3,
        percent: 100,
        components: [],
      },
      {
        id: 'product',
        title: 'Фото в карточке',
        kind: 'product',
        state: 'partial',
        units: 5,
        registered: 2,
        percent: 20,
        components: [],
      },
      {
        id: 'deploy',
        kind: 'deploy',
        state: 'unregistered',
        units: 2,
        registered: 0,
        percent: 0,
        components: [],
      },
    ],
    line: 'план выпуска: 3 этапа, ~10 задач; зарегистрировано ~5, ещё нет ~5',
  };
  v.forecast.time.outline = {
    units: 5,
    basis: 'default',
    line: 'по плану выпуска ещё ~5 задач: ~1–3 ч (оценка по размеру)',
  };
  const m = html(<Overview view={viewOf(v)} lang="ru" />);
  const t1 = shown(m);
  assert.match(
    t1,
    /Выпуск по этапам инфраструктура — 100 % \(задачи заведены\) Фото в карточке — 20 % \(заведена часть задач\) выкладка — 0 % \(задачи ещё не заведены \(оценка\)\)/,
  );
  assert.match(t1, /план выпуска: 3 этапа, ~10 задач; зарегистрировано ~5, ещё нет ~5/);
  assert.match(t1, /по плану выпуска ещё ~5 задач: ~1–3 ч \(оценка по размеру\)/);
  // Segments grow by the stage volume and fill by its percent.
  assert.match(
    m,
    /data-state="partial" style="flex-grow:5;flex-basis:0"><span class="hui-stage-fill hui:bg-ok" style="width:20%"/,
  );
  assert.match(m, /role="img" aria-label="инфраструктура — 100 %/);
  // No outline, all works infra: the estimated infra share against an unplanned product.
  const i = structuredClone(ru);
  i.forecast.progress.infraShare = {
    share: 0.3,
    line: 'инфраструктура — 30 % выпуска (оценка), продукт ещё не спланирован',
  };
  i.forecast.outline = {
    state: 'missing',
    code: 'RELEASE_OUTLINE_MISSING',
    line: 'плана выпуска нет — прогноз по одному графу: ведущий записывает его командой harness lead outline --file F',
  };
  const n = html(<Overview view={viewOf(i)} lang="ru" />);
  assert.match(shown(n), /инфраструктура — 30 % \(оценка\) продукт — ещё не спланирован/);
  assert.match(n, /flex-grow:30;flex-basis:0/);
  assert.match(n, /data-testid="forecast-outline" data-state="missing"/);
  assert.match(shown(n), /плана выпуска нет — прогноз по одному графу/);
  // A malformed outline stage: the gate refuses the document instead of a render throw.
  v.forecast.outline.stages.push({
    id: 'bad',
    kind: 'other',
    state: 'partial',
    units: -1,
    registered: 0,
    percent: 0,
    components: [],
  });
  assert.equal(checkView(v).ok, false);
});

test('alpha.68 card bar: the stage span of the forecast, moved on by the clock against its typical time', () => {
  const v = structuredClone(ru);
  v.forecast.progress.works = [
    {
      workId: 'locale-format',
      percent: 25,
      attempt: { n: 2, max: 3 },
      stageProgress: {
        stage: 'checks',
        from: 0.25,
        to: 0.5,
        since: '2026-11-19T11:52:10.000Z',
        typicalMs: 600_000,
        samples: 6,
      },
      line: 'DEMO-2: ~25 %',
    },
  ];
  const at = (iso: string) => {
    const m = html(<Tasks view={viewOf(v)} lang="ru" timeZone={TZ} now={Date.parse(iso)} />);
    return /aria-valuetext="Попытка 2: к приёмке ~(\d+) %"/.exec(m)![1];
  };
  assert.equal(at('2026-11-19T11:52:10.000Z'), '25');
  assert.equal(at('2026-11-19T11:57:10.000Z'), '38');
  // Past the typical time: the stage end, not beyond.
  assert.equal(at('2026-11-19T13:00:00.000Z'), '50');
});

test('revision 8: plan review rounds left and free re-reviews on the review line', async () => {
  const { ReviewSubjectCard } = await import('../src/components/Reviews.tsx');
  const v = structuredClone(ru);
  v.reviews[0].rounds = { used: 2, max: 6, remaining: 4, free: 1 };
  const r = viewOf(v).reviews[0]!;
  const m = html(<ReviewSubjectCard r={r} lang="ru" links={{}} />);
  assert.match(
    shown(m),
    /раунды 2 из 6 · раундов ревью плана: осталось 4 · 1 повторное ревью неизменённого плана — без траты раунда/,
  );
  // None left: said, and marked for attention.
  v.reviews[0].rounds = { used: 6, max: 6, remaining: 0 };
  const zero = html(<ReviewSubjectCard r={viewOf(v).reviews[0]!} lang="ru" links={{}} />);
  assert.match(zero, /data-testid="rounds-left" data-status="blocked"/);
  assert.match(shown(zero), /раундов ревью плана: осталось 0/);
  assert.doesNotMatch(zero, /rounds-free/);
  // No limit (`null`) or an older harness: the alpha.9 words only.
  for (const rounds of [
    { used: 2, max: null, remaining: null },
    { used: 2, max: 6 },
  ]) {
    v.reviews[0].rounds = rounds;
    const old = html(<ReviewSubjectCard r={viewOf(v).reviews[0]!} lang="ru" links={{}} />);
    assert.doesNotMatch(old, /rounds-left|rounds-free/);
  }
  assert.equal(dict('en').reviews.roundsLeft('plan', 4), 'plan review rounds left: 4');
});

test('revision 8: the budget and diagnosis-addendum decisions have their words', async () => {
  const { Decisions } = await import('../src/index.ts');
  const v = structuredClone(ru);
  v.decisions = [
    {
      id: 'budget:0123456789abcdef',
      kind: 'budget',
      by: 'operator',
      at: '2026-11-19T11:50:00.000Z',
      temporary: false,
      title: 'бюджет поднят: maxAttempts 3 → 5',
      reason: 'ещё две попытки на инфраструктуру',
    },
    {
      id: 'diagnosis-addendum:0123456789abcdef',
      kind: 'diagnosis-addendum',
      by: 'lead',
      at: '2026-11-19T11:45:00.000Z',
      workId: 'import-csv',
      subject: 'D1',
      temporary: false,
      reason: 'вторая причина: очистка теста скрывает исходный отказ',
    },
  ];
  const m = shown(html(<Decisions view={viewOf(v)} lang="ru" timeZone={TZ} />));
  assert.match(
    m,
    /11:50 бюджет поднят · кто решил: вы бюджет поднят: maxAttempts 3 → 5 причина: ещё две попытки на инфраструктуру/,
  );
  assert.match(m, /11:45 дополнение разбора ведущего по D1 \( import-csv \) · кто решил: ведущий/);
  assert.equal(dict('en').decisions.kind['diagnosis-addendum'], 'lead diagnosis addendum');
});
