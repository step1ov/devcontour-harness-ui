// S2 screens rendered with renderToStaticMarkup for each fixture and both
// languages: the key text (counts, bounds, actors, states) must be on the
// screen, and the honest-wording rules of design §5.9 hold line by line.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Activity,
  Decisions,
  Health,
  History,
  Overview,
  Reviews,
  Settings,
  WorkDetail,
  checkView,
  checkWorkDetail,
  cumulativeSpend,
  effectiveCodeReview,
  formatTypical,
  questionStatus,
  perHour,
  type Lang,
  type OperatorView,
  type ReviewRuleView,
  type WorkDetailView,
} from '../src/index.ts';

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const vc = checkView(read('../fixtures/view.sample.json'));
if (!vc.ok) throw new Error(vc.message);
const view: OperatorView = vc.view;
const detailOf = (rel: string): WorkDetailView => {
  const c = checkWorkDetail(read(rel));
  if (!c.ok) throw new Error(c.message);
  return c.detail;
};
const running = detailOf('../fixtures/work.sample.json');
const accepted = detailOf('../fixtures/work.accepted.sample.json');
const ruView = (() => {
  const c = checkView(read('../fixtures/ru/view.sample.json'));
  if (!c.ok) throw new Error(c.message);
  return c.view;
})();
const ruAccepted = detailOf('../fixtures/ru/work.accepted.sample.json');
/** The same document as harness alpha.55 sends it: revision 0, no revision 1 fields. */
function asAlpha55<T extends OperatorView | WorkDetailView>(doc: T): T {
  const d = structuredClone(doc) as T & { history?: OperatorView['history'] };
  d.viewRevision = 0;
  for (const q of d.questions) delete q.answerBasis;
  if (d.history) delete d.history.totals;
  return d;
}
const workHref = (id: string) => '#/work/' + id;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const TZ = 'UTC';

/** Every screen of the panel for a view, a detail and a language. */
function allScreens(v: OperatorView, details: WorkDetailView[], lang: Lang): string[] {
  const common = { view: v, lang, timeZone: TZ, workHref };
  return [
    html(<Overview {...common} />),
    html(<Reviews {...common} />),
    html(<Decisions {...common} />),
    html(<Activity {...common} filterHref={() => '#/activity'} />),
    html(<Settings view={v} lang={lang} />),
    html(<History view={v} lang={lang} timeZone={TZ} />),
    html(<Health {...common} uiVersion="0.1.0-alpha.1" />),
    ...details.map((d) =>
      html(<WorkDetail detail={d} lang={lang} timeZone={TZ} workHref={workHref} />),
    ),
  ];
}

/** Inner text of every element carrying `data-status="<status>"` (nested markup flattened). */
function statusElements(markup: string, status: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<(\\w+)[^>]*data-status="${status}"[^>]*>`, 'g');
  for (const m of markup.matchAll(open)) {
    const tag = m[1]!;
    // Find the matching close tag, counting nested tags of the same name.
    let depth = 1;
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
    re.lastIndex = m.index! + m[0].length;
    let end = markup.length;
    for (let x; (x = re.exec(markup));) {
      depth += x[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = x.index;
        break;
      }
    }
    out.push(markup.slice(m.index!, end));
  }
  return out;
}
const text = (s: string) => s.replace(/<[^>]+>/g, '');

test('work detail (RU): now, stages, why a retry, what was checked and how', () => {
  const ru = html(<WorkDetail detail={running} lang="ru" timeZone={TZ} workHref={workHref} />);
  assert.match(text(ru), /Проверки \(candidate-test:unit\) с 11:52, 7 мин 50 с; обычно 5–12 мин\./);
  assert.match(ru, /Дальше: ревью, интеграция\./);
  assert.match(ru, /Подготовка<\/span> <span class="hui-muted">— пройден, 20 с/);
  assert.match(ru, /Проверки<\/span> <span class="hui-muted">— идёт сейчас/);
  assert.match(ru, /Ревью<\/span> <span class="hui-muted">— впереди/);
  assert.match(ru, /Попытка 2 из 3 \(осталось 1\)\./);
  assert.match(ru, /Попытка 1 остановлена: a check failed: lint found an unused import\./);
  assert.match(ru, /Группа сбоя: ошибка в коде\./);
  assert.match(ru, /Перепроверок: 1\. Нейтральных сбоев: 0 из 3\./);
  const checks = text(ru.slice(ru.indexOf('data-testid="work-verification"')));
  assert.match(
    checks,
    /lint \(проверка, кандидат\) — пройдено · запущено в попытке 2 · кем: harness/,
  );
  assert.match(
    checks,
    /typecheck \(проверка, интеграция\) — засчитано по прежнему результату · взято прежнее доказательство \(для попытки 2\) · кем — неизвестно/,
  );
  assert.match(checks, /unit \(проверка, кандидат\) — ещё не запускалось · не проверялось/);
  assert.match(checks, /g1 \(ревью\) — пройдено · прочитал diff, ничего не запускал · кем: codex/);
  assert.match(checks, /e2e \(проверка, кандидат\) — не применяется · не проверялось/);
  assert.match(ru, /≥ \$3\.40 · 5 вызовов · 31 мин 40 с/);
  assert.match(ru, /Ещё не принято\./);
  assert.match(ru, /Работа ещё не принята — дрейфа быть не может\./);
  // Who answered and why: the harness line with the answer time.
  assert.match(
    text(ru),
    /q-12.*Ответ передан исполнителю; ничего делать не нужно\.11:27 — answered by the lead \(technical question\): the built-in Intl\.DateTimeFormat is enough; no new dependency/s,
  );
  assert.match(text(ru), /кто и почему ответил: что это значит/);
});

test('work detail (EN) and the accepted work: where it is, drift and the checks link', () => {
  const en = html(<WorkDetail detail={running} lang="en" timeZone={TZ} />);
  assert.match(en, /Why a retry/);
  assert.match(text(en), /lint \(check, candidate\) — passed · ran in attempt 2 · by: harness/);
  assert.match(text(en), /read the diff, ran nothing · by: codex/);
  const ok = html(<WorkDetail detail={ruAccepted} lang="ru" timeZone={TZ} workHref={workHref} />);
  assert.match(
    text(ok),
    /Принято локально; в удалённой ветке origin\/harness\/accepted ещё нет\. Сверено с копией удалённой ветки на этой машине, без сети; git обновил копию: вчера 17:30\./,
  );
  assert.match(text(ok), /в удалённой ветке: что это значит/);
  assert.match(text(ok), /без сети и без git fetch/);
  assert.match(ok, /href="#\/work\/add-greeting#verification"/);
  assert.match(
    ok,
    /refs\/heads\/harness\/accepted: принято 3b1f9e0c2a7d → сейчас 9c04d1aa77e2; коммитов после: 2; файлов: 3/,
  );
  assert.doesNotMatch(ok, /data-testid="why-retry"/, 'no failures: no retry section');
  const okEn = html(<WorkDetail detail={accepted} lang="en" timeZone={TZ} />);
  assert.match(okEn, /Accepted locally; not yet on the remote branch origin\/harness\/accepted\./);
});

test('remote line: the state says pushed or not, in harness words; anything else is unknown', () => {
  const withRemote = (remote: Record<string, unknown>, lang: 'en' | 'ru' = 'en') =>
    text(
      html(
        <WorkDetail
          detail={{
            ...accepted,
            work: { ...accepted.work, target: { ...accepted.work.target!, remote } as never },
          }}
          lang={lang}
          timeZone={TZ}
        />,
      ),
    );
  const pushed = withRemote({
    state: 'pushed',
    trackingRef: 'origin/main',
    checkedAt: '2026-11-19T11:58:00Z',
    line: 'already on the remote branch origin/main',
  });
  assert.match(pushed, /Accepted locally; already on the remote branch origin\/main\./);
  assert.match(pushed, /git updated the copy: 11:58\./, 'today: the time only');
  // Older than yesterday: the date.
  assert.match(
    withRemote({ state: 'pushed', checkedAt: '2026-11-10T09:00:00Z', line: 'already on x' }),
    /git updated the copy: 10\.11\.2026 09:00\./,
  );
  // No reflog: the check time is unknown, said so; no tracking ref: no name.
  assert.match(
    withRemote({ state: 'not-pushed' }),
    /Accepted locally; not yet on the remote branch\. Compared with this machine.{1,6}s copy of the remote branch, no network; when git updated the copy is unknown\./,
  );
  // A long branch name: the harness clips its line at 200 and cuts off «ещё
  // нет» (as `remoteOf` + the projection do); the panel still says "not yet".
  const ref = 'origin/' + 'b'.repeat(180);
  const full = `принято локально; в удалённой ветке ${ref} ещё нет`;
  const clipped = full.slice(0, 199) + '…';
  assert.ok(!clipped.includes('ещё нет'), 'the clipped harness line lost the state word');
  const ru = withRemote({ state: 'not-pushed', trackingRef: ref, line: clipped }, 'ru');
  assert.match(ru, new RegExp(`Принято локально; в удалённой ветке ${ref} ещё нет\\.`));
  assert.doesNotMatch(ru, /…/);
  const en = withRemote({
    state: 'not-pushed',
    line: ('accepted locally; not yet on the remote branch ' + 'c'.repeat(300)).slice(0, 199) + '…',
  });
  assert.match(en, /Accepted locally; not yet on the remote branch\./, 'no trackingRef: no name');
  // Unknown: the reason, not the line; never pushed or not pushed.
  const unknown = withRemote({
    state: 'unknown',
    reason: 'no remote branch',
    line: 'unknown (no remote branch)',
  });
  assert.match(unknown, /Accepted locally; remote state unknown: no remote branch\./);
  assert.doesNotMatch(unknown, /already on|not yet on|git updated/);
  // A state this build does not know, even with a line that says pushed, is unknown.
  const future = withRemote({
    state: 'mirrored',
    trackingRef: 'origin/main',
    line: 'already on the remote branch origin/main',
    checkedAt: '2026-11-19T11:00:00Z',
  });
  assert.match(future, /Accepted locally; remote state unknown\./);
  assert.doesNotMatch(future, /already on the remote/);
  // A not-pushed state whose line claims otherwise is still "not yet".
  assert.match(
    withRemote({
      state: 'not-pushed',
      trackingRef: 'o/m',
      line: 'already on the remote branch o/m',
    }),
    /Accepted locally; not yet on the remote branch o\/m\./,
  );
});

test('work detail: no verification is "no data", an unknown method is not "checked"', () => {
  const { verification: _v, ...rest } = running;
  const none = html(<WorkDetail detail={rest as WorkDetailView} lang="ru" />);
  assert.match(none, /Нет сведений о проверках\./);
  const odd: WorkDetailView = {
    ...running,
    verification: [{ gate: 'lint', kind: 'gate', result: 'passed', how: 'telepathy' }],
  };
  const ru = html(<WorkDetail detail={odd} lang="ru" />);
  assert.match(ru, /способ неизвестен \(telepathy\) · <\/span>|способ неизвестен \(telepathy\)/);
  assert.match(ru, /кем — неизвестно/);
  const lost: WorkDetailView = {
    ...running,
    work: {
      ...running.work,
      attempts: { ...running.work.attempts, lastFailure: undefined },
    } as never,
  };
  assert.match(
    html(<WorkDetail detail={lost} lang="ru" />),
    /Причина прошлой остановки неизвестна\./,
  );
  const noTarget: WorkDetailView = {
    ...accepted,
    work: { ...accepted.work, target: undefined } as never,
    drift: undefined,
  } as never;
  const nt = html(<WorkDetail detail={noTarget} lang="ru" />);
  assert.match(
    nt,
    /Принято локально \(результат 3b1f9e0c2a7d\); в удалённом репозитории — неизвестно: harness не сообщил цель\./,
  );
  assert.match(nt, /Нет сведений о дрейфе: harness не сообщил цель\./);
});

test('reviews: rounds against the cap, findings with who decided, escalation and vendor flag', () => {
  const ru = html(<Reviews view={view} lang="ru" />);
  assert.match(ru, /раунды 2 из 6/);
  assert.match(ru, /открыто: блокирующих 0, заметок 0/);
  assert.match(ru, /F2.*принято как ограничение · кто решил: ведущий, раунд 2/s);
  assert.match(ru, /F1.*закрыто/s);
  assert.match(ru, /Эскалаций и остановок, ждущих решения, нет\./);
  const escalated: OperatorView = {
    ...view,
    reviews: [
      {
        ...view.reviews[0]!,
        approved: false,
        sameVendor: true,
        rounds: { used: 4, max: null },
        escalation: { requestId: 'q-21', findings: ['F9'], answered: false },
      },
    ],
    escalations: [
      {
        subject: 'g1',
        code: 'REVIEW_ESCALATED',
        actor: 'operator',
        action: 'decide F9',
        since: view.generatedAt,
      },
    ],
  };
  const e = html(<Reviews view={escalated} lang="ru" timeZone={TZ} />);
  assert.match(e, /раундов 4, без предела/);
  assert.match(e, /Эскалация q-21: F9 — решает оператор \(ответа ещё нет\)/);
  assert.match(e, /тот же вендор, что у исполнителя/);
  assert.match(e, /действует: вы — decide F9/);
  const en = html(<Reviews view={escalated} lang="en" />);
  assert.match(en, /Escalation q-21: F9 — the operator decides \(not answered yet\)/);
  assert.match(en, /4 rounds, no limit/);
});

test('settings: plain thresholds, the technical-questions line, defaults and the effective reviewer', () => {
  const ru = html(<Settings view={view} lang="ru" />);
  assert.match(ru, /Вопросы важности 7 и выше ждут ответа\./);
  assert.match(ru, /Ведущий может ответить на вопросы важности до 4\./);
  assert.match(
    ru,
    /Технические вопросы решает ведущий: да; вопросы, меняющие результат для пользователя, — всегда вам\./,
  );
  assert.match(ru, /Критических путей: 2\./);
  assert.match(ru, /роль backend: codex · example-reviewer \(откуда: общее правило\)/);
  assert.match(ru, /общий: \$40\.00/);
  assert.match(ru, /Если цена неизвестна<\/dt><dd>остановиться/);
  // "default" only for the paths in settings.defaulted.
  const marks = [...ru.matchAll(/data-testid="default-([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(marks.sort(), [
    'thresholds.repairBudget',
    'timeouts.leaseMs',
    'timeouts.runTimeoutMs',
    'timeouts.stall',
  ]);
  const off: OperatorView = {
    ...view,
    settings: {
      ...view.settings,
      thresholds: { ...view.settings.thresholds, leadAnswersTechnical: undefined } as never,
      budgetOnUnknown: undefined,
    } as never,
  };
  const o = html(<Settings view={off} lang="ru" />);
  assert.match(o, /Технические вопросы решает ведущий: нет;/);
  assert.match(o, /Если цена неизвестна<\/dt><dd>нет сведений/);
  assert.match(
    html(<Settings view={view} lang="en" />),
    /The lead agent decides technical questions: yes;/,
  );
});

test('effective code reviewer: role, then repository, then global', () => {
  const g = {
    kind: 'code',
    scope: 'global',
    reviewer: { runtime: 'codex' },
    alternates: [],
    vendor: 'different-vendor',
  } as const;
  const repo = {
    ...g,
    scope: 'repository',
    repositoryId: 'web',
    reviewer: { runtime: 'r-repo' },
  } as const;
  const role = { ...g, scope: 'role', role: 'backend', reviewer: { runtime: 'r-role' } } as const;
  const rules = [g, repo, role] as unknown as ReviewRuleView[];
  assert.equal(
    effectiveCodeReview(rules, { role: 'backend', repositoryId: 'web' })?.reviewer.runtime,
    'r-role',
  );
  assert.equal(
    effectiveCodeReview(rules, { role: 'frontend', repositoryId: 'web' })?.reviewer.runtime,
    'r-repo',
  );
  assert.equal(effectiveCodeReview(rules, { role: 'frontend' })?.reviewer.runtime, 'codex');
  assert.equal(effectiveCodeReview([], { role: 'frontend' }), undefined);
});

test('history: summaries, per-hour regrouping, spend starts at the opening balance', () => {
  const ru = html(<History view={view} lang="ru" timeZone={TZ} />);
  assert.match(ru, /Окно: с 18\.11\.2026 12:00 по 12:00, интервал 1 ч\./);
  assert.match(ru, /Наибольшая нагрузка за окно: 2 одновременно при 2 местах\./);
  assert.match(ru, /За окно начато попыток: 11, неудачных: 1; больше всего начато за час: 2\./);
  assert.match(ru, /За окно пройдено: 27, не пройдено: 1; засчитано по прежнему доказательству: 1/);
  assert.match(
    ru,
    /К концу окна потрачено ≥ \$7\.50 из бюджета \$40\.00\. До начала окна: \$1\.20\./,
  );
  assert.match(ru, /накоплено — нижняя граница/);
  assert.match(ru, /class="hui-line hui-s1 hui-dashed"/);
  // Each chart has a data table for screen readers.
  assert.equal(ru.match(/<div class="hui-sr"><table>/g)?.length, 4);
  const c = cumulativeSpend(view.history);
  // Boundary values: the opening balance at `from`, then the total after each bucket.
  assert.equal(c.values.length, view.history.spendUsd.length + 1);
  assert.equal(c.values[0], 1.2);
  assert.equal(c.values[1], 1.2);
  assert.equal(c.end.bound, 'lower');
  const unknownAll = cumulativeSpend({
    ...view.history,
    spendBound: 'unknown',
    spendOpeningUsd: { value: 0, bound: 'unknown' },
  });
  assert.equal(unknownAll.end.bound, 'unknown');
  assert.equal(
    cumulativeSpend({ ...view.history, spendBound: 'future' as never }).end.bound,
    'unknown',
  );
  assert.ok(Math.abs(c.values.at(-1)! - 7.5) < 1e-9);
  // The polyline starts at the height of the opening balance, not at zero.
  const first = /points="0,([\d.]+)/.exec(ru)!;
  assert.notEqual(Number(first[1]), 160);
  assert.deepEqual(perHour({ bucketMs: 900_000 }, [1, 1, 0, 2, 3, 0, 0, 0]).values, [4, 3]);
  const unknownOpening: OperatorView = {
    ...view,
    history: { ...view.history, spendOpeningUsd: { value: 0, bound: 'unknown' } },
  };
  assert.match(
    html(<History view={unknownOpening} lang="ru" />),
    /Расходы до начала окна неизвестны: кривая показывает только расходы внутри окна\./,
  );
  const misaligned: OperatorView = { ...view, history: { ...view.history, load: [1] } };
  assert.match(html(<History view={misaligned} lang="en" />), /History series differ in length/);
  assert.match(
    html(<History view={view} lang="en" />),
    /Highest load in the window: 2 at once with 2 slots\./,
  );
});

test('health: plain words with codes; not-checked drift is never zero drift', () => {
  const ru = html(<Health view={view} lang="ru" timeZone={TZ} uiVersion="0.1.0-alpha.1" />);
  assert.match(ru, /Контроллер работает, аренда до 12:00\./);
  assert.match(ru, /Зависших попыток нет\. Тихих попыток: 0\./);
  assert.match(ru, /Сбоев окружения за 24 ч: 0\./);
  assert.match(ru, /общий: потрачено ≥ \$6\.02 из \$40\.00, в пределах\./);
  assert.match(ru, /работа locale-format: потрачено ≥ \$3\.40 из \$8\.00, в пределах\./);
  assert.match(ru, /Изменено после приёмки: 1; не проверено: 0; проверено принятых: 1\./);
  assert.match(ru, /панель: 0\.1\.0-alpha\.1/);
  const sick: OperatorView = {
    ...view,
    works: view.works.map((w) => (w.id === 'locale-format' ? { ...w, liveness: 'stalled' } : w)),
    health: {
      ...view.health,
      controller: { present: false },
      stalledAttempts: 2,
      drift: { checked: 3, drifted: 0, unavailable: 2 },
      warnings: [{ code: 'DRIFT_UNAVAILABLE', message: 'target ref not read' }],
    },
  };
  const s = html(<Health view={sick} lang="ru" workHref={workHref} />);
  assert.match(s, /Контроллер не запущен — работа не продвигается\./);
  assert.match(s, /Зависли 2 попытки\./);
  assert.match(s, /не проверено: 2/);
  assert.match(s, /target ref not read <code class="hui-muted">DRIFT_UNAVAILABLE<\/code>/);
  assert.match(s, /href="#\/work\/locale-format"/);
  assert.match(html(<Health view={view} lang="en" />), /panel: no data/);
});

test('decisions and activity: shown when the view carries them, "no data in this harness" otherwise', () => {
  const ru = html(<Decisions view={view} lang="ru" timeZone={TZ} />);
  assert.match(ru, /Временные \(1\)/);
  assert.match(
    ru,
    /11:10.*замечание принято как ограничение<\/strong> по <code>F2, g1<\/code>.*кто решил: ведущий.*вернуться: before the release/s,
  );
  assert.match(
    ru,
    /ответ на технический вопрос<\/strong> по <code>q-12<\/code>.*кто решил: ведущий/s,
  );
  const { decisions: _d, activity: _a, ...old } = view;
  for (const lang of ['ru', 'en'] as const) {
    const d = html(<Decisions view={old as OperatorView} lang={lang} />);
    const words =
      lang === 'ru' ? /нет данных в этой версии harness/ : /no data in this harness version/;
    assert.match(d, words);
    assert.doesNotMatch(d, /\(0\)/);
  }
  const noReason: OperatorView = {
    ...view,
    decisions: [{ ...view.decisions![1]!, revisit: undefined, reason: undefined }],
  };
  const nr = html(<Decisions view={noReason} lang="ru" />);
  assert.match(nr, /условие пересмотра неизвестно/);
  assert.match(nr, /причина не записана/);
});

test('who did what: harness lines as written, actor chips, times with «вчера», work links', () => {
  const a = html(
    <Activity
      view={ruView}
      lang="ru"
      timeZone={TZ}
      workHref={workHref}
      filterHref={(f) => JSON.stringify(f)}
    />,
  );
  const t = text(a);
  assert.match(t, /События harness за последние 24 ч, новые сверху\./);
  // Newest first, each with its time, actor chip, the harness line and the code.
  assert.match(
    a,
    /<time class="hui-muted hui-when" dateTime="2026-11-19T11:51:40.000Z">11:51<\/time> <span class="hui-badge hui-actor" data-actor="controller">контроллер<\/span> <span class="hui-plain">контроллер запустил проверку lint: прошла \(работа locale-format, попытка 2, кандидат\)<\/span>/,
  );
  assert.ok(t.indexOf('11:51') < t.indexOf('вчера 18:05'), 'newest first, as the harness sends it');
  // The event of the day before the view: «вчера», not a bare time.
  assert.match(
    t,
    /вчера 18:05 reviewer reviewer codex вернул план g1: блокирующих замечаний 1, раунд 1/,
  );
  assert.match(
    a,
    /data-actor="writer">исполнитель<\/span> <span class="hui-plain">исполнитель задал вопрос q-17/,
  );
  assert.match(a, /data-actor="lead">ведущий<\/span>/);
  // A work link per event with a work; none for the plan event.
  assert.match(
    a,
    /<a class="hui-link" href="#\/work\/export-csv"><span class="hui-sr">открыть работу <\/span><code>export-csv<\/code><\/a>/,
  );
  assert.equal((a.match(/href="#\/work\//g) ?? []).length, 11);
  // Filters by work and by actor, and the glossary of the actors present.
  assert.match(a, /href="\{&quot;workId&quot;:&quot;add-greeting&quot;\}"/);
  assert.match(a, /href="\{&quot;actor&quot;:&quot;reviewer&quot;\}"/);
  assert.match(t, /Кто есть кто:.*контроллер: что это значит.*исполнитель: что это значит/s);
  assert.doesNotMatch(t, /хост: что это значит/, 'only the actors in the feed');
  assert.doesNotMatch(a, /data-testid="activity-clipped"/);
  // Filtered by a work: only its events, with the count.
  const byWork = text(
    html(
      <Activity
        view={ruView}
        lang="ru"
        filter={{ workId: 'add-greeting' }}
        filterHref={() => '#'}
      />,
    ),
  );
  assert.match(byWork, /показано 6 из 13/);
  assert.doesNotMatch(byWork, /locale-format; пишет/);
  // A filter that matches nothing is not "nothing happened".
  const none = text(
    html(<Activity view={ruView} lang="ru" filter={{ actor: 'host' }} filterHref={() => '#'} />),
  );
  assert.match(none, /По выбранному фильтру событий нет\./);
  assert.doesNotMatch(none, /ничего не происходило/);
  assert.doesNotMatch(none, /хост: что это значит/, 'a chosen filter is not an actor of the feed');
  // A filter by a present actor keeps exactly its events.
  const byActor = html(
    <Activity view={ruView} lang="ru" filter={{ actor: 'controller' }} filterHref={() => '#'} />,
  );
  assert.match(text(byActor), /показано 8 из 13/);
  const chips = [...byActor.matchAll(/data-actor="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(chips.length, 8);
  assert.deepEqual([...new Set(chips)], ['controller']);
  // English: the same screen in the English dictionary.
  const en = text(html(<Activity view={view} lang="en" timeZone={TZ} />));
  assert.match(en, /Harness events of the last 24 h, newest first\./);
  assert.match(
    en,
    /yesterday 18:05 reviewer reviewer codex returned the plan g1: 1 blocking finding, round 1/,
  );
  assert.match(
    en,
    /11:27 lead agent the lead answered question q-12 on locale-format \(technical question\)/,
  );
});

test('who did what: [] is a quiet window, a missing feed is an older harness, clipped is counted', () => {
  for (const lang of ['ru', 'en'] as const) {
    const quiet = text(html(<Activity view={{ ...view, activity: [] }} lang={lang} />));
    assert.match(
      quiet,
      lang === 'ru'
        ? /За окно \(24 ч\) ничего не происходило\./
        : /Nothing happened in the window \(24 h\)\./,
    );
    const { activity: _a, ...old } = view;
    const missing = html(<Activity view={old as OperatorView} lang={lang} />);
    assert.match(
      text(missing),
      lang === 'ru'
        ? /harness этой версии не ведёт ленту\./
        : /This harness version keeps no feed\./,
    );
    assert.doesNotMatch(text(missing), /ничего не происходило|Nothing happened/);
    assert.match(missing, /data-testid="activity-missing"/);
  }
  // A 7-day window names itself.
  const week = {
    ...view,
    history: { ...view.history, from: '2026-11-12T12:00:00.000Z' },
    activity: [],
  };
  assert.match(text(html(<Activity view={week} lang="ru" />)), /За окно \(7 дней\)/);
  const clipped = text(
    html(<Activity view={{ ...view, truncated: { activity: 23 } }} lang="ru" />),
  );
  assert.match(clipped, /Ещё 23 события окна не показано: лента держит 50 последних\./);
  // An unknown actor and an unknown event code are shown as is, not dropped.
  const future = text(
    html(
      <Activity
        view={{
          ...view,
          activity: [
            {
              at: '2026-11-19T11:59:00.000Z',
              actor: 'robot',
              action: 'robot.waved',
              plain: 'a robot waved',
            },
          ],
        }}
        lang="ru"
        timeZone={TZ}
      />,
    ),
  );
  assert.match(future, /11:59 robot a robot waved\s+robot\.waved/);
  // Without a viewer clock or view day, an old event shows its date.
  const older = text(
    html(
      <Activity
        view={{
          ...view,
          activity: [{ ...view.activity![0]!, at: '2026-11-17T08:00:00.000Z' }],
        }}
        lang="en"
        timeZone={TZ}
      />,
    ),
  );
  assert.match(older, /17\.11\.2026 08:00/);
});

test('overview: plan strip, waiting with who acts, plain question lines (RU)', () => {
  const ru = html(<Overview view={view} lang="ru" timeZone={TZ} workHref={workHref} />);
  assert.match(
    ru,
    /export-csv<\/code><\/a> <span class="hui-badge">Ждёт ответа<\/span><span class="hui-muted"> после add-greeting/,
  );
  assert.match(ru, /Что изменится: Changes how the exported file opens/);
  assert.match(ru, /Ответить можете только вы\./);
  assert.match(
    ru,
    /just waits for export-csv to be accepted; nothing is needed<\/span> — <span class="hui-who">никто — просто ждёт очереди, ничего не нужно/,
  );
  assert.match(ru, /обычно 5–12 мин/);
});

const variants = (): { name: string; v: OperatorView; d: WorkDetailView[] }[] => {
  const blockers = (b: unknown) =>
    ({ ...view, works: view.works.map((w) => ({ ...w, blockers: b })) }) as OperatorView;
  return [
    { name: 'fixture', v: view, d: [running, accepted] },
    { name: 'blocker without plain', v: blockers([{ code: 'X_CODE', actor: 'lead' }]), d: [] },
    {
      name: 'blocker with an unknown actor',
      v: blockers([{ code: 'Y', plain: 'p', actor: 'robot' }]),
      d: [],
    },
    {
      name: 'stopped without blockers',
      v: {
        ...view,
        works: view.works.map((w) => ({
          ...w,
          blockers: [],
          stage: { ...w.stage, name: 'stopped', needs: undefined },
        })),
      } as OperatorView,
      d: [],
    },
    {
      name: 'remote states',
      v: {
        ...view,
        works: view.works.map((w, i) =>
          w.target
            ? {
                ...w,
                target: {
                  ...w.target,
                  remote: { state: ['pushed', 'not-pushed', 'mystery'][i % 3]! },
                },
              }
            : w,
        ),
      } as OperatorView,
      d: [
        {
          ...accepted,
          work: {
            ...accepted.work,
            target: { ...accepted.work.target!, remote: { state: 'pushed' } },
          },
        },
        {
          ...accepted,
          work: {
            ...accepted.work,
            target: { ...accepted.work.target!, remote: { state: 'what' } },
          },
        },
      ],
    },
    {
      name: 'verification without by and with unknown how',
      v: view,
      d: [
        {
          ...running,
          verification: [
            { gate: 'a', kind: 'gate', result: 'passed', how: 'executed', attempt: 2 },
            { gate: 'b', kind: 'gate', result: 'failed', how: 'mystery' },
            { gate: 'c', kind: 'review', result: 'passed', how: 'read' },
          ],
        },
      ],
    },
  ];
};

test('words with grounds (§5.9): every checked, accepted and blocked element says how, where and who', () => {
  const how = {
    ru: /запущено|взято прежнее доказательство|прочитал diff, ничего не запускал|способ неизвестен/,
    en: /ran |earlier evidence reused|read the diff, ran nothing|method unknown/,
  };
  const by = { ru: /кем: \S|кем — неизвестно/, en: /by: \S|by whom — unknown/ };
  const where = {
    ru: /в удалённом репозитории — (да|ещё нет|неизвестно)|где — неизвестно|в удалённой ветке|on the remote branch/,
    en: /on the remote|not on the remote yet|remote state unknown|where is unknown/,
  };
  const who = {
    ru: /действует: \S|никто — просто ждёт очереди|кто действует — неизвестно/,
    en: /acts: \S|nobody — it just waits its turn|who acts is unknown/,
  };
  let counts = { checked: 0, accepted: 0, blocked: 0 };
  for (const { name, v, d } of variants())
    for (const lang of ['ru', 'en'] as const)
      for (const page of allScreens(v, d, lang)) {
        for (const el of statusElements(page, 'checked')) {
          counts.checked++;
          assert.match(text(el), how[lang], `${name}/${lang} checked without how: ${text(el)}`);
          assert.match(text(el), by[lang], `${name}/${lang} checked without by: ${text(el)}`);
        }
        for (const el of statusElements(page, 'accepted')) {
          counts.accepted++;
          assert.match(
            text(el),
            where[lang],
            `${name}/${lang} accepted without where: ${text(el)}`,
          );
          assert.match(
            el,
            /href="[^"]*#verification"/,
            `${name}/${lang} accepted without checks link`,
          );
        }
        for (const el of statusElements(page, 'blocked')) {
          counts.blocked++;
          // Who acts sits in its own span; the reason is the text outside it.
          const span = /<span class="hui-who">([\s\S]*?)<\/span>/.exec(el);
          assert.ok(span, `${name}/${lang} blocked without a who span: ${text(el)}`);
          assert.match(
            text(span[1]!),
            who[lang],
            `${name}/${lang} blocked without who: ${text(el)}`,
          );
          const rest = text(el.replace(span[0], '')).replace(/[\s—:;,.()-]+/g, '');
          assert.ok(rest.length >= 1, `${name}/${lang} blocked without reason: ${text(el)}`);
        }
      }
  assert.ok(
    counts.checked > 10 && counts.accepted > 5 && counts.blocked > 10,
    JSON.stringify(counts),
  );
});

test('no bare "checked / done / blocked" word, no form, no unknown shown as $0.00', () => {
  const bare =
    /^\s*(проверено|готово|заблокировано|принято|checked|done|blocked|accepted)\s*[.!]?\s*$/i;
  for (const { name, v, d } of variants())
    for (const lang of ['ru', 'en'] as const)
      for (const page of allScreens(v, d, lang)) {
        // Glossary disclosures name the term itself; they are definitions, not statuses.
        const shown = page.replace(/<details class="hui-term">[\s\S]*?<\/details>/g, '');
        for (const piece of shown.split(/<[^>]+>/))
          assert.doesNotMatch(piece, bare, `${name}/${lang}: «${piece}»`);
        assert.doesNotMatch(page, /<form|<input|<textarea|<select|method="post"/i);
      }
  const unknownSpend: OperatorView = {
    ...view,
    health: {
      ...view.health,
      spentTotalUsd: { value: 0, bound: 'unknown' },
      budgets: [],
      budgeting: 'off',
    },
  };
  const h = html(<Health view={unknownSpend} lang="ru" />);
  assert.match(h, /Бюджетов нет; всего потрачено неизвестно\./);
  assert.doesNotMatch(h, /\$0\.00/);
});

test('review fixes: truncation, pause, plan statuses, counters, time budgets, unknown spend', () => {
  const clipped: OperatorView = {
    ...view,
    questions: [],
    escalations: [],
    truncated: { questions: 2, escalations: 1 },
  };
  const c = html(<Overview view={clipped} lang="ru" />);
  assert.doesNotMatch(c, /Вопросов, которые ждут вас, нет/);
  assert.doesNotMatch(c, /Решений от вас и ведущего сейчас не ждут/);
  assert.equal(c.match(/неизвестно — список обрезан/g)?.length, 2); // both sections
  assert.match(c, /ещё 2 не показано/);
  const paused: OperatorView = {
    ...view,
    progress: {
      ...view.progress,
      queue: {
        paused: true,
        reason: 'budget',
        detail: 'total budget exceeded',
        actor: 'operator',
        action: 'raise the budget',
      },
    },
  };
  assert.match(
    text(html(<Overview view={paused} lang="ru" />)),
    /total budget exceeded — действует: вы — raise the budget/,
  );
  const stopped: OperatorView = {
    ...view,
    works: view.works.map((w) =>
      w.id === 'docs-page' ? { ...w, stage: { ...w.stage, name: 'stopped' } } : w,
    ),
  };
  const st = text(html(<Overview view={stopped} lang="ru" workHref={workHref} />));
  assert.match(
    st,
    /Остановлено: just waits for export-csv to be accepted; nothing is needed — никто/,
  );
  assert.match(st, /Принято локально; в удалённом репозитории — ещё нет; что проверено/);
  const quiet: WorkDetailView = {
    ...accepted,
    work: {
      ...accepted.work,
      attempts: { ...accepted.work.attempts, rechecks: 2, neutral: { used: 1, max: 3 } },
    },
  };
  const q = html(<WorkDetail detail={quiet} lang="ru" />);
  assert.doesNotMatch(q, /data-testid="why-retry"/);
  assert.match(q, /Перепроверок: 2\. Нейтральных сбоев: 1 из 3\./);
  const timeBudget: OperatorView = {
    ...view,
    health: {
      ...view.health,
      budgets: [
        {
          scope: 'total',
          state: 'exceeded',
          spentUsd: { value: 0.5, bound: 'exact' },
          spentMs: 4_000_000,
          limitMs: 3_600_000,
        },
      ],
    },
  };
  assert.match(
    html(<Health view={timeBudget} lang="ru" />),
    /общий: потрачено \$0\.50; время 1 ч 06 мин из 1 ч 00 мин, превышен\./,
  );
  const allUnknown: OperatorView = {
    ...view,
    history: {
      ...view.history,
      spendBound: 'unknown',
      spendOpeningUsd: { value: 0, bound: 'unknown' },
    },
  };
  const hu = html(<History view={allUnknown} lang="ru" />);
  assert.match(hu, /К концу окна потрачено неизвестно/);
  assert.doesNotMatch(hu, /≥ \$0\.00/);
  const detailClipped: WorkDetailView = {
    ...running,
    truncated: { questions: 1, reviews: 2, findings: 3, stages: 4, blockers: 5, dependsOn: 6 },
  };
  const dc = text(html(<WorkDetail detail={detailClipped} lang="ru" />));
  for (const [what, n] of [
    ['Вопросы', 1],
    ['Ревью', 2],
    ['Замечания', 3],
    ['Этапы попыток', 4],
    ['Причины ожидания', 5],
    ['Зависимости', 6],
  ])
    assert.match(dc, new RegExp(`${what}: ещё ${n} не показано`), String(what));
});

test('settings: role/repository pairs from review overrides; a clipped rule list is not authoritative', () => {
  const v2: OperatorView = {
    ...view,
    settings: {
      ...view.settings,
      reviews: [
        ...view.settings.reviews,
        {
          kind: 'code',
          scope: 'repository',
          repositoryId: 'web',
          reviewer: { runtime: 'r-web' },
          alternates: [],
          vendor: 'different-vendor',
        },
        {
          kind: 'code',
          scope: 'role',
          role: 'backend',
          repositoryId: 'api',
          reviewer: { runtime: 'r-api' },
          alternates: [],
          vendor: 'different-vendor',
        },
      ],
    },
  };
  const ru = text(html(<Settings view={v2} lang="ru" />));
  assert.match(ru, /роль backend в репозитории web: r-web \(откуда: для репозитория web\)/);
  assert.match(ru, /роль backend в репозитории api: r-api \(откуда: для роли backend \/ api\)/);
  assert.match(ru, /роль backend в остальных репозиториях: codex · example-reviewer/);
  assert.doesNotMatch(ru, /Список правил ревью обрезан/);
  const cut = text(html(<Settings view={{ ...v2, truncated: { reviewRules: 3 } }} lang="ru" />));
  assert.match(cut, /Список правил ревью обрезан/);
  const empty = read('../tests/contract/harness/empty-state.view.json').data;
  assert.match(
    html(<Settings view={empty} lang="ru" />),
    /data-testid="default-thresholds\.inputSeverity"/,
  );
});

test('answer basis: who answered and why, RU first; alpha.55 names only who answered', () => {
  // The Russian demo: the harness line in Russian, with the answer time.
  const ru = text(html(<Overview view={ruView} lang="ru" timeZone={TZ} workHref={workHref} />));
  assert.match(
    ru,
    /q-12: Ответ передан исполнителю; ничего делать не нужно\.11:27 — ответил ведущий \(технический вопрос\): хватает встроенного Intl\.DateTimeFormat, без новой зависимости/,
  );
  assert.match(ru, /кто и почему ответил: что это значит/);
  // A question of a closed work: the detail names the operator's answer.
  const ok = text(html(<WorkDetail detail={ruAccepted} lang="ru" timeZone={TZ} />));
  assert.match(
    ok,
    /q-5.*Ответ передан исполнителю; ничего делать не нужно\.09:20 — ответил оператор/s,
  );
  // English UI over the English demo.
  const en = text(html(<WorkDetail detail={accepted} lang="en" timeZone={TZ} />));
  assert.match(en, /09:20 — answered by the operator/);
  assert.match(en, /who answered and why: what this means/);
  // alpha.55: no basis, only who answered (as before); no disclosure without a basis.
  const old = text(html(<WorkDetail detail={asAlpha55(running)} lang="ru" timeZone={TZ} />));
  assert.match(old, /Ответ передан исполнителю; ничего делать не нужно\.ответил: ведущий/);
  assert.doesNotMatch(old, /кто и почему ответил|технический вопрос\)/);
  const oldOverview = html(<Overview view={asAlpha55(view)} lang="ru" timeZone={TZ} />);
  assert.doesNotMatch(oldOverview, /кто и почему ответил/);
  assert.match(
    text(oldOverview),
    /q-12: Ответ передан исполнителю; ничего делать не нужно\.ответил: ведущий/,
  );
  // Neither basis nor answeredBy: nothing is said about who answered.
  const bare = asAlpha55(running);
  for (const q of bare.questions) delete q.answeredBy;
  assert.doesNotMatch(
    html(<WorkDetail detail={bare} lang="ru" timeZone={TZ} />),
    /data-testid="answer-basis"/,
  );
  // An empty line from another producer falls back to who answered.
  const blank = structuredClone(running);
  blank.questions[0]!.answerBasis!.line = '  ';
  assert.match(
    text(html(<WorkDetail detail={blank} lang="ru" timeZone={TZ} />)),
    /11:27 — ответил: ведущий/,
  );
});

test('questions of a closed work: cancelled and superseded are said, never "needs an answer"', () => {
  const d = structuredClone(ruAccepted);
  d.questions[0]!.state = 'cancelled';
  d.questions.push({ ...d.questions[0]!, requestId: 'q-6', state: 'superseded' });
  const ru = text(html(<WorkDetail detail={d} lang="ru" timeZone={TZ} />));
  assert.match(ru, /q-5.*Вопрос снят\./s);
  assert.match(ru, /q-6.*Вопрос заменён\./s);
  const en = text(html(<WorkDetail detail={d} lang="en" timeZone={TZ} />));
  assert.match(en, /Question withdrawn\./);
  assert.match(en, /Question replaced\./);
  for (const state of ['cancelled', 'superseded'])
    assert.equal(questionStatus({ state, answerableBy: 'operator' }).needsAnswer, false);
});

test('history totals (alpha.56): every number from the harness, each term explained', () => {
  const ru = html(<History view={view} lang="ru" timeZone={TZ} />);
  const panel = ru.slice(
    ru.indexOf('data-testid="history-totals"'),
    ru.indexOf('data-testid="chart-load"'),
  );
  const row = (id: string) => {
    const at = panel.indexOf(`data-testid="total-${id}"`);
    assert.ok(at >= 0, id);
    return text(panel.slice(at, panel.indexOf('</div>', at)));
  };
  assert.ok(text(panel).includes('Итоги окна'));
  assert.match(row('started'), /Начато попыток11/);
  assert.match(row('failed'), /Неудачных попыток1 \(по причинам: ошибка в коде — 1\)/);
  assert.match(row('gates'), /пройдено 27, не пройдено 1, по прежнему доказательству 1/);
  assert.match(row('rounds'), /план 2, контракт 1, код 1, в попытках 4/);
  assert.match(row('spend'), /Расход за окно≥ \$6\.30/);
  assert.match(row('wall'), /Время, когда шли попытки7 ч 40 мин/);
  assert.match(row('attempt-ms'), /Сумма времени попыток9 ч 10 мин/);
  assert.match(row('peak'), /Пик нагрузки2 одновременно при 2 местах/);
  // Each row has its «что это значит»: attempt, failure reason, gates, review
  // round, window spend and its lower bound, wall and attempt time, peak.
  assert.equal(panel.match(/<details class="hui-term">/g)?.length, 9);
  for (const term of [
    'попытка',
    'причина неудачи',
    'проверки (gates)',
    'раунд ревью',
    'расход за окно',
    'нижняя граница (≥)',
    'время, когда шли попытки',
    'сумма времени попыток',
    'пик нагрузки',
  ])
    assert.ok(panel.includes(`<span class="hui-sr"> — ${term}</span>`), term);
  const en = text(html(<History view={view} lang="en" timeZone={TZ} />));
  assert.match(en, /Window totals/);
  assert.match(en, /Attempts failed1 \(by reason: a defect in the code — 1\)/);
  assert.match(en, /Checks27 passed, 1 failed, 1 from earlier evidence/);
  assert.match(en, /plan 2, contract 1, code 1, in attempts 4/);
  assert.match(en, /Spend in the window≥ \$6\.30/);
  assert.match(en, /Time attempts were running7h 40m/);
  assert.match(en, /Attempt time added up9h 10m/);
  assert.match(en, /2 at once with 2 slots/);
});

test('history totals drive the chart summaries; alpha.55 says it has none instead of zeros', () => {
  // Totals that differ from the series: the summaries read the totals.
  const v = structuredClone(view);
  v.history.totals = {
    ...v.history.totals!,
    attemptsStarted: 40,
    attemptsFailed: 3,
    failuresByBucket: { environment: 2, unclassified: 1 },
    gatesPassed: 90,
    gatesFailed: 4,
    gatesReused: 5,
    loadPeak: 3,
    spendUsd: { value: 0, bound: 'unknown' },
  };
  const ru = text(html(<History view={v} lang="ru" timeZone={TZ} />));
  assert.match(ru, /За окно начато попыток: 40, неудачных: 3;/);
  assert.match(ru, /За окно пройдено: 90, не пройдено: 4; засчитано по прежнему доказательству: 5/);
  assert.match(ru, /Наибольшая нагрузка за окно: 3 одновременно/);
  assert.match(ru, /по причинам: окружение — 2, без группы — 1/);
  // An unknown spend is "unknown", with its disclosures, never $0.00 — in the
  // totals and in the cumulative chart, though spendBound says only "lower"
  // (what the harness sends when no call of the window has a known cost).
  assert.equal(v.history.spendBound, 'lower');
  assert.match(ru, /Расход за окнонеизвестно/);
  assert.match(ru, /К концу окна потрачено неизвестно из бюджета \$40\.00\./);
  assert.doesNotMatch(ru, /Расход за окно\$0\.00|потрачено ≥/);
  const spendRow = (doc: OperatorView) => {
    const m = html(<History view={doc} lang="ru" />);
    const at = m.indexOf('data-testid="total-spend"');
    return m.slice(at, m.indexOf('</dd>', at));
  };
  const terms = (row: string) =>
    [...row.matchAll(/<span class="hui-sr"> — ([^<]+)<\/span>/g)].map((x) => x[1]);
  assert.deepEqual(terms(spendRow(v)), ['расход за окно', 'неизвестно, не проверено']);
  assert.deepEqual(terms(spendRow(view)), ['расход за окно', 'нижняя граница (≥)']);
  const exact = structuredClone(view);
  exact.history.totals!.spendUsd = { value: 6.3, bound: 'exact' };
  assert.deepEqual(terms(spendRow(exact)), ['расход за окно']);
  // A window where no call has a known cost: zero series, unknown total. The
  // cumulative curve is not drawn at zero and the data table says unknown.
  const noCost = structuredClone(view);
  noCost.history.spendUsd = noCost.history.spendUsd.map(() => 0);
  noCost.history.totals!.spendUsd = { value: 0, bound: 'unknown' };
  const noneHtml = html(<History view={noCost} lang="ru" timeZone={TZ} />);
  const chart = noneHtml.slice(noneHtml.indexOf('data-testid="chart-spend"'));
  assert.doesNotMatch(chart, /<polyline/, 'no curve claims a cost');
  assert.doesNotMatch(chart, /<td>\$/, 'no dollar cell in the data table');
  assert.equal(chart.match(/<td>неизвестно<\/td>/g)?.length, noCost.history.spendUsd.length + 1);
  assert.match(text(chart), /К концу окна потрачено неизвестно/);
  // The known windows still draw their curve.
  assert.match(html(<History view={view} lang="ru" />), /<polyline/);
  const value = (row: string) => /<span class="hui-total-value">([^<]*)<\/span>/.exec(row)?.[1];
  assert.equal(value(spendRow(exact)), '$6.30');
  assert.equal(value(spendRow(view)), '≥ $6.30');
  assert.equal(value(spendRow(v)), 'неизвестно');
  // alpha.55: no totals panel numbers, a plain sentence; summaries add up the series.
  const old = html(<History view={asAlpha55(view)} lang="ru" timeZone={TZ} />);
  assert.match(old, /data-testid="history-totals-missing"/);
  assert.match(text(old), /Итогов окна нет в этой версии harness/);
  assert.doesNotMatch(old, /data-testid="total-/);
  assert.match(text(old), /За окно начато попыток: 11, неудачных: 1;/);
  assert.match(
    text(html(<History view={asAlpha55(view)} lang="en" timeZone={TZ} />)),
    /This harness version sends no window totals/,
  );
  // Zero failures: no "by reason" part, the count is a real 0 from the harness.
  const none = structuredClone(view);
  none.history.totals = { ...none.history.totals!, attemptsFailed: 0, failuresByBucket: {} };
  assert.match(text(html(<History view={none} lang="ru" />)), /Неудачных попыток0(?! \()/);
});

test('usual stage time: an honest range only when the harness sent one', () => {
  const typical = (p50Ms: number, p90Ms: number, lang: Lang = 'ru') =>
    formatTypical({ p50Ms, p90Ms, samples: 6 }, lang);
  assert.equal(typical(300_000, 720_000), 'обычно 5–12 мин');
  assert.equal(typical(300_000, 720_000, 'en'), 'usually 5–12 min');
  // The low end rounds down, the high end up: never narrower than observed.
  assert.equal(typical(749_000, 1_441_000), 'обычно 12–25 мин');
  assert.equal(typical(720_000, 720_000), 'обычно 12 мин');
  assert.equal(typical(20_500, 44_200), 'обычно 20–45 с');
  assert.equal(typical(30_000, 100_000), 'обычно до 2 мин');
  assert.equal(typical(30_000, 100_000, 'en'), 'usually up to 2 min');
  assert.equal(typical(2_700_000, 4_200_000), 'обычно 45 мин–1 ч 10 мин');
  assert.equal(typical(3_900_000, 7_800_000, 'en'), 'usually 1h 05m–2h 10m');
  // Hours: not whole minutes round outward too (65.5 min down, 130.2 min up).
  assert.equal(typical(3_930_000, 7_810_000), 'обычно 1 ч 05 мин–2 ч 11 мин');
  assert.equal(typical(3_630_000, 3_650_000), 'обычно 1 ч 00 мин–1 ч 01 мин');
  // Inconsistent or missing: nothing, never a made-up number.
  assert.equal(typical(720_000, 300_000), undefined);
  assert.equal(typical(Number.NaN, 300_000), undefined);
  assert.equal(formatTypical(undefined, 'ru'), undefined);
  // Without an observation the screens say nothing about usual time.
  const v = structuredClone(view);
  for (const w of v.works) delete w.stage.typical;
  const ov = html(<Overview view={v} lang="ru" timeZone={TZ} />);
  assert.doesNotMatch(ov, /data-testid="typical"|обычно|обычное время этапа/);
  const d = structuredClone(running);
  delete d.work.stage.typical;
  assert.doesNotMatch(html(<WorkDetail detail={d} lang="ru" />), /обычно|обычное время этапа/);
  // With one: the range and its disclosure on both screens.
  assert.match(
    html(<Overview view={view} lang="ru" timeZone={TZ} />),
    /обычно 5–12 мин.*обычное время этапа: что это значит/s,
  );
  assert.match(
    text(html(<WorkDetail detail={running} lang="ru" />)),
    /обычное время этапа: что это значит/,
  );
});
