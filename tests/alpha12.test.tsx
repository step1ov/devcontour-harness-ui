// ui 0.1.0-alpha.12 (harness 0.1.0-alpha.70, view revision 10): «Расход» on
// the home screen (the release and the install, by role and model, folded by
// work and attempt; a lower bound reads «не меньше»), the second review pass
// in the attempt review line, the writer's proposals with the lead's
// decision, the failure-cause reference as a link and the docs step of the
// release. Older views (revision 9) render as in alpha.11.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CostsPanel,
  FAILURE_CAUSES_BASE,
  ForecastRings,
  Overview,
  ReleaseDocs,
  Tasks,
  WorkDetail,
  checkOverview,
  checkView,
  checkWorkDetail,
  costText,
  costsOf,
  dict,
  dictionaries,
  failureReferenceHref,
  proposalsOf,
  releaseDocsOf,
  workCostOf,
  type OperatorView,
  type ReleaseDocsView,
  type WorkDetailView,
} from '../src/index.ts';
import { revision10View, revision9View } from './revision10.ts';

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
/** The markup of the task card of a work (up to the next work's card). */
function card(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="task-${id}"`);
  assert.ok(start >= 0, id);
  const next = [...markup.matchAll(/<li[^>]*data-testid="task-[^"]+"/g)]
    .map((m) => m.index!)
    .find((x) => x > start);
  return markup.slice(start, next);
}
const TZ = 'UTC';
const t = dict('ru');
const NEW_IDS = ['costs', 'second-pass', 'proposals', 'failure-reference', 'release-docs'] as const;

test('both dictionaries carry the alpha.12 texts with the same keys', () => {
  assert.deepEqual(
    Object.keys(dictionaries.ru.r12).sort(),
    Object.keys(dictionaries.en.r12).sort(),
  );
  for (const k of [
    'costRole',
    'secondPassMode',
    'proposalKind',
    'proposalStatus',
    'docsMode',
    'docsStatus',
  ] as const)
    assert.deepEqual(
      Object.keys(dictionaries.ru.r12[k]).sort(),
      Object.keys(dictionaries.en.r12[k]).sort(),
      k,
    );
});

test('accessors: absent in a revision 9 view, the harness values in revision 10', () => {
  const old = viewOf(revision9View());
  assert.equal(costsOf(old), undefined);
  assert.equal(releaseDocsOf(old.forecast), undefined);
  assert.deepEqual(proposalsOf(old.works[1]!), []);
  const v = viewOf(revision10View());
  assert.equal(costsOf(v)?.total.usd, 3.75);
  assert.equal(workCostOf(v, 'locale-format')?.attempts.length, 2);
  assert.equal(workCostOf(v, 'docs-page'), undefined);
  assert.equal(releaseDocsOf(v.forecast)?.status, 'missing');
  assert.deepEqual(
    proposalsOf(v.works.find((w) => w.id === 'locale-format')!).map((p) => p.status),
    ['proposed', 'rejected'],
  );
});

test('the failure reference links only a failure-causes anchor, to the harness document', () => {
  assert.equal(
    failureReferenceHref('docs/failure-causes.md#kind-environment'),
    FAILURE_CAUSES_BASE + 'docs/failure-causes.md#kind-environment',
  );
  assert.equal(
    failureReferenceHref('docs/failure-causes.md#cause-preflight'),
    FAILURE_CAUSES_BASE + 'docs/failure-causes.md#cause-preflight',
  );
  for (const bad of [
    undefined,
    '',
    'https://example.com/x',
    'javascript:alert(1)',
    'docs/failure-causes.md',
    'docs/other.md#kind-x',
    '../docs/failure-causes.md#kind-x',
    'docs/failure-causes.md#kind-x"><b>',
  ])
    assert.equal(failureReferenceHref(bad), undefined, String(bad));
});

test('a cost reads «не меньше» for a lower bound, «цена неизвестна» for unpriced calls only', () => {
  assert.equal(costText({ usd: 1.25, bound: 'exact' }), '$1.25');
  assert.equal(costText({ usd: 3.75, bound: 'lower' }), 'не меньше $3.75');
  assert.equal(costText({ usd: 0, bound: 'lower' }), 'цена неизвестна');
  assert.equal(costText({ usd: 0, bound: 'exact' }), '$0.00');
  assert.equal(costText({ usd: 0.001, bound: 'exact' }), '< $0.01');
  assert.equal(costText({ usd: 3.75, bound: 'lower' }, 'en'), 'at least $3.75');
  // An unknown bound of a later harness is not taken for exact.
  assert.equal(costText({ usd: 2, bound: 'later' as never }), 'не меньше $2.00');
});

test('«Расход»: the release and the install, by role and by model; the lower bound said honestly', () => {
  const v = viewOf(revision10View());
  const m = html(<CostsPanel view={v} lang="ru" timeZone={TZ} />);
  assert.equal(
    part(m, 'costs-release'),
    'Текущий выпуск не меньше $1.00 2 вызова · вызовы после release done 11:00',
  );
  assert.equal(part(m, 'costs-total'), 'Вся установка не меньше $3.75 5 вызовов');
  assert.equal(part(m, 'costs-lower'), 'есть вызовы без цены — сумма не меньше показанной');
  assert.equal(
    part(m, 'costs-by-role'),
    'По ролям исполнитель не меньше $3.00 · 3 вызова reviewer $0.50 · 1 вызов план и договор $0.25 · 1 вызов',
  );
  assert.equal(
    part(m, 'costs-by-model'),
    'По моделям claude-x (anthropic) не меньше $3.00 · 3 вызова gpt-x (openai) $0.75 · 2 вызова',
  );
  // By work and attempt, folded; an attempt of only unpriced calls says so.
  const works = part(m, 'costs-by-work');
  assert.match(works, /^По работам и попыткам \(2\)/);
  assert.match(
    works,
    /locale-format не меньше \$2\.50 · 3 вызова попытка 1 — \$2\.50, попытка 2 — цена неизвестна/,
  );
  assert.match(works, /import-csv \$1\.00 · 1 вызов попытка 1 — \$1\.00/);
  // English.
  const en = html(<CostsPanel view={viewOf(revision10View('en'))} lang="en" timeZone={TZ} />);
  assert.match(part(en, 'costs-total'), /^Whole install at least \$3\.75 5 calls$/);
});

test('«Расход» with every price known has no lower-bound note; no release closed — all calls', () => {
  const v = viewOf(
    (() => {
      const d = revision10View();
      for (const a of [d.costs.total, d.costs.release, ...d.costs.byRole, ...d.costs.byModel])
        a.bound = 'exact';
      delete d.costs.release.since;
      return d;
    })(),
  );
  const m = html(<CostsPanel view={v} lang="ru" timeZone={TZ} />);
  assert.doesNotMatch(m, /costs-lower/);
  assert.doesNotMatch(m, /не меньше \$3\.75/);
  assert.match(part(m, 'costs-release'), /все вызовы: выпуск ещё не закрывался$/);
  // No calls yet: a sentence, no zero sums.
  const none = viewOf(
    (() => {
      const d = revision10View();
      d.costs = {
        total: { usd: 0, bound: 'exact', calls: 0 },
        release: { usd: 0, bound: 'exact', calls: 0 },
        byRole: [],
        byModel: [],
        byWork: [],
      };
      return d;
    })(),
  );
  const n = html(<CostsPanel view={none} lang="ru" />);
  assert.equal(part(n, 'costs-none'), 'Вызовов моделей ещё не было.');
  assert.doesNotMatch(n, /\$0\.00/);
});

test('the task card: the second pass in the review line, proposals with status, the reference link', () => {
  const v = viewOf(revision10View());
  const c = card(html(<Tasks view={v} lang="ru" timeZone={TZ} />), 'locale-format');
  const line = part(c, 'task-attempt-reviews');
  assert.match(
    line,
    /^Ревью: попытка 1 — одобрено · второй проход: снято 1, отказ снят второй проход при отказе\. Второй проход — свежий вызов reviewer/,
  );
  assert.match(
    line,
    /попытка 2 — отклонено \(2 находки, 1 заметка\) · второй проход не удался — действует первый второй проход всегда\./,
  );
  assert.match(c, /data-testid="second-pass" data-status="ran" data-overturned="true"/);
  // The tooltip is tied to the line for assistive technology and reachable by keyboard.
  assert.match(c, /class="hui-tooltip-root" aria-describedby="[^"]+" tabindex="0"/);
  // Proposals: kind, title (or id), attempt, status; who decides — once, the CLI.
  assert.equal(
    part(c, 'proposals'),
    'Предложения исполнителя (2) продолжение Локализация попытка 1 ждёт ведущего разделение p2 попытка 2 отклонено Решает ведущий (harness proposal); принятое войдёт в план через ревью плана.',
  );
  const own = c.slice(c.indexOf('data-testid="proposals"'));
  assert.doesNotMatch(own, /<button|<form|<input/);
  // The failure reference after the last failure.
  assert.match(part(c, 'task-last-failure'), / · что значит этот отказ$/);
  assert.match(
    c,
    new RegExp(
      `<a class="hui-link" href="${FAILURE_CAUSES_BASE.replace(/[.]/g, '\\.')}docs/failure-causes\\.md#kind-gate" target="_blank" rel="noopener noreferrer" data-testid="failure-reference" data-anchor="kind-gate">`,
    ),
  );
  // English.
  const en = card(
    html(<Tasks view={viewOf(revision10View('en'))} lang="en" timeZone={TZ} />),
    'locale-format',
  );
  assert.match(part(en, 'second-pass'), /^second pass: 1 refuted, rejection lifted/);
  assert.match(part(en, 'proposals'), /^Writer proposals \(2\) follow-up/);
});

test('decided proposals drop the «who decides» line; an unknown status of a later harness is its code', () => {
  const v = viewOf(
    (() => {
      const d = revision10View();
      const w = d.works.find((x: Json) => x.id === 'locale-format');
      w.proposals[0].status = 'accepted';
      w.proposals[1].status = 'later-status';
      w.attemptReviews[0].secondPass.mode = 'later-mode';
      return d;
    })(),
  );
  const c = card(html(<Tasks view={v} lang="ru" timeZone={TZ} />), 'locale-format');
  assert.match(
    part(c, 'proposals'),
    /Локализация попытка 1 принято разделение p2 попытка 2 later-status$/,
  );
  assert.match(part(c, 'task-attempt-reviews'), /later-mode\. Второй проход/);
});

test('the docs step of the release: state, mode, works, roots and the harness line', () => {
  const block = (d: ReleaseDocsView, lang: 'ru' | 'en' = 'ru') =>
    part(html(<ReleaseDocs docs={d} lang={lang} />), 'release-docs');
  const v = viewOf(revision10View());
  assert.equal(
    block(releaseDocsOf(v.forecast)!),
    'Документация выпуска: нет работы документации совет: выпуск не держит Шаг документации выпуска: нет работы с меткой docs после корневых работ (add-greeting, locale-format)',
  );
  assert.equal(
    block({
      mode: 'required',
      status: 'not-after-roots',
      works: ['docs-page'],
      missingRoots: ['export-csv'],
    }),
    'Документация выпуска: не после всех корневых работ обязательно: выпуск ждёт работы: docs-page не зависит от: export-csv',
  );
  assert.equal(
    block({ mode: 'advisory', status: 'done', works: ['docs-page'] }),
    'Документация выпуска: готово работы: docs-page',
  );
  assert.match(
    html(<ReleaseDocs docs={{ mode: 'required', status: 'missing', works: [] }} />),
    /data-status="missing" data-mode="required"/,
  );
  assert.equal(
    block({ mode: 'advisory', status: 'pending', works: ['docs-page'] }, 'en'),
    'Release docs: in work advisory: does not hold the release works: docs-page',
  );
  // On the release ring of the home screen, after the release block.
  const f = html(<ForecastRings forecast={v.forecast!} lang="ru" />);
  assert.ok(f.indexOf('data-testid="forecast-release"') < f.indexOf('data-testid="release-docs"'));
});

test('the home screen shows «Расход» and the docs step', () => {
  const o = html(<Overview view={viewOf(revision10View())} lang="ru" timeZone={TZ} />);
  assert.match(part(o, 'costs'), /^Расход/);
  assert.match(part(o, 'release-docs'), /^Документация выпуска: нет работы документации/);
});

test('the work detail: the reference link, the review line with the second pass and the proposals', () => {
  const v = revision10View();
  const w = v.works.find((x: Json) => x.id === 'locale-format');
  const d = structuredClone(read('../fixtures/ru/work.sample.json'));
  d.viewRevision = 10;
  d.work.attemptReviews = structuredClone(w.attemptReviews);
  d.work.proposals = structuredClone(w.proposals);
  d.work.attempts.lastFailure = {
    ...(d.work.attempts.lastFailure ?? {
      attempt: 1,
      bucket: 'environment',
      plain: 'окружение: порт занят',
    }),
    reference: 'docs/failure-causes.md#cause-preflight',
  };
  const c = checkWorkDetail(d);
  assert.ok(c.ok, c.ok ? '' : c.message);
  const m = html(
    <WorkDetail detail={(c as { detail: WorkDetailView }).detail} lang="ru" timeZone={TZ} />,
  );
  assert.match(part(m, 'why-retry'), /что значит этот отказ$/);
  assert.match(m, /data-anchor="cause-preflight"/);
  assert.match(part(m, 'work-attempts'), /второй проход: снято 1, отказ снят/);
  assert.match(part(m, 'proposals'), /^Предложения исполнителя \(2\)/);
});

test('a revision 9 view renders as in alpha.11: no revision 10 block anywhere', () => {
  const old = viewOf(revision9View());
  const screens = [
    html(<Overview view={old} lang="ru" timeZone={TZ} />),
    html(<Tasks view={old} lang="ru" timeZone={TZ} />),
    html(<ForecastRings forecast={old.forecast!} lang="ru" />),
    html(<CostsPanel view={old} lang="ru" />),
  ];
  for (const m of screens)
    for (const id of NEW_IDS) assert.doesNotMatch(m, new RegExp(`data-testid="${id}"`), id);
  assert.equal(html(<CostsPanel view={old} lang="ru" />), '');
  // The review line of a revision 9 work reads as before (no second pass text).
  const r9 = revision9View();
  r9.works[1].attemptReviews = [
    {
      attempt: 1,
      phase: 'candidate',
      verdict: 'rejected',
      findings: 1,
      notes: 0,
      at: '2026-11-19T11:40:00.000Z',
    },
  ];
  const c = card(html(<Tasks view={viewOf(r9)} lang="ru" timeZone={TZ} />), r9.works[1].id);
  assert.equal(part(c, 'task-attempt-reviews'), 'Ревью: попытка 1 — отклонено (1 находка)');
  // A real alpha.69 envelope still passes the gate and renders without the new blocks.
  const env = read('./contract/harness-0.1.0-alpha.69/empty-state.view.json');
  const real = checkOverview(env.data);
  assert.ok(real.ok && !('setup' in real));
  const m = html(<Overview view={(real as { view: OperatorView }).view} lang="ru" timeZone={TZ} />);
  for (const id of NEW_IDS) assert.doesNotMatch(m, new RegExp(`data-testid="${id}"`), id);
});

test('the gate keeps revision 10 views and flags a newer one', () => {
  const c = checkView(revision10View());
  assert.equal(c.ok && c.newerRevision, false);
  const later = checkView({ ...revision10View(), viewRevision: 11 });
  assert.equal(later.ok && later.newerRevision, true);
  assert.equal(t.r12.costsTitle, 'Расход');
});
