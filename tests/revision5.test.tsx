// View revision 5 (harness 0.1.0-alpha.65): the setup state before harness
// setup (the setup document and an overview at the setup stage), the
// forecast over the whole release (tasks added later, per-work readiness, a
// rough time range, the finished release), checks left in the task source
// (`sourceReviews`, escalation SOURCE_REVIEW) and uncounted runs. A
// revision 4 document (`asAlpha62`) keeps the previous screens.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Activity,
  Decisions,
  Health,
  History,
  Overview,
  Settings,
  SetupScreen,
  Tasks,
  WorkDetail,
  checkOverview,
  checkView,
  checkWorkDetail,
  headerSentence,
  nextSteps,
  sourceReviewItems,
  timeState,
  type OperatorView,
} from '../src/index.ts';
import { projectPaths, startServer } from '../src/server/serve.ts';
import { probeHarness } from '../src/server/harness.ts';
import { fakeHarness, recordedArgs } from './fake-harness.ts';
import { asAlpha62 } from './legacy.ts';

type Json = Record<string, any>;
const read = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
const viewOf = (doc: Json): OperatorView => {
  const c = checkView(doc);
  if (!c.ok) throw new Error(c.message);
  return c.view;
};
const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&gt;/g, '>');
const ruRelease = read('../fixtures/ru/view.release.json');
const enRelease = read('../fixtures/view.release.json');
const ruFinished = read('../fixtures/ru/view.finished.json');
const enFinished = read('../fixtures/view.finished.json');
const ruSetup = read('../fixtures/ru/view.setup.json');
const enSetup = read('../fixtures/view.setup.json');
const harnessEmpty = read('./contract/harness/empty-state.view.json').data;
const work = read('../fixtures/work.sample.json');
const ui = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

test('the setup document renders «Идёт настройка harness» on every screen, without a throw', () => {
  for (const [doc, lang, title, wait] of [
    [ruSetup, 'ru', 'Идёт настройка harness', /ждёт политику/],
    [enSetup, 'en', 'Harness setup is in progress', /waits for the policy/],
  ] as const) {
    const c = checkOverview(doc);
    assert.equal(c.ok && 'setup' in c, true);
    // A host that passes the document to any screen gets the setup state.
    const view = doc as unknown as OperatorView;
    for (const el of [
      <Overview view={view} lang={lang} />,
      <Tasks view={view} lang={lang} />,
      <Health view={view} lang={lang} />,
      <History view={view} lang={lang} />,
      <Settings view={view} lang={lang} />,
      <Decisions view={view} lang={lang} />,
      <Activity view={view} lang={lang} />,
      <SetupScreen view={doc} lang={lang} />,
    ]) {
      const m = text(html(el));
      assert.ok(m.includes(title), m.slice(0, 200));
      assert.match(m, lang === 'ru' ? /Задач пока нет/ : /No tasks yet/);
      assert.match(m, wait);
      assert.doesNotMatch(m, /не может показать|cannot show|NOT_A_VIEW/);
    }
  }
  // The project file is missing: that is what the panel says it waits for.
  const m = text(html(<SetupScreen view={{ ...ruSetup, setup: { waitingFor: 'project' } }} />));
  assert.match(m, /\.harness\/project\.json/);
  // Without harness lines the panel's own words stand.
  const bare = text(html(<SetupScreen view={{}} lang="en" />));
  assert.match(bare, /Harness setup is in progress/);
  assert.match(bare, /No tasks yet/);
});

test('an overview at the setup stage (a state without works) still renders the screens', () => {
  const view = viewOf(harnessEmpty);
  assert.equal(view.stage?.name, 'setup');
  const m = text(html(<Overview view={view} lang="en" />));
  assert.doesNotMatch(m, /Harness setup is in progress/, 'the app shows the note, not the screen');
  assert.match(m, /Nothing has run yet/);
});

test('rough time: «грубо, ~25–55 мин (по 2 попыткам)», a ring with its share, never «неизвестно»', () => {
  const f = viewOf(ruRelease).forecast!;
  const now = Date.parse('2026-11-19T12:00:00Z');
  const ru = timeState(f, 'ru', now);
  assert.equal(ru.kind, 'known');
  assert.ok(ru.share! > 0 && ru.share! < 1);
  assert.match(ru.text, /осталось грубо, ~25–55 мин \(по 2 попыткам\)/);
  assert.equal(ru.sub, 'грубо');
  const en = timeState(viewOf(enRelease).forecast!, 'en', now);
  assert.match(en.text, /roughly ~25–55 min left \(from 2 attempts\)/);
  // Unknown only when the harness says so.
  const unknown = timeState(
    { ...f, time: { ...f.time, estimate: 'unknown', rough: undefined } as any },
    'ru',
    now,
  );
  assert.equal(unknown.kind, 'unknown');
  assert.match(unknown.text, /неизвестно/);
  // `estimate: unknown` is unknown even next to a stale range.
  const stale = timeState(
    { ...f, time: { ...f.time, estimate: 'unknown', remaining: f.time.rough } as any },
    'ru',
    now,
  );
  assert.equal(stale.kind, 'unknown');
  // Precise: the p50–p90 range, not the rough one.
  const precise = timeState(
    {
      ...f,
      time: {
        ...f.time,
        estimate: 'precise',
        remaining: { loMs: 5_400_000, hiMs: 10_800_000, samples: 6, attemptsPerTask: 1.2 },
      },
    },
    'ru',
    now,
  );
  assert.match(precise.text, /осталось ~1,5–3 ч$/);
  // The rendered ring tile says it is rough and why.
  const m = html(<Overview view={viewOf(ruRelease)} lang="ru" timeZone="UTC" now={now} />);
  assert.match(text(m), /грубо, ~25–55 мин \(по 2 попыткам\)/);
  assert.match(m, /data-testid="time-rough"/);
  assert.doesNotMatch(m, /data-testid="time-unknown"/);
});

test('tasks added to the release and the readiness of each unfinished work are shown', () => {
  const m = html(<Overview view={viewOf(ruRelease)} lang="ru" timeZone="UTC" />);
  const added = m.split('data-testid="forecast-added"')[1]!.split('</div>')[0]!;
  assert.match(text(added), /добавлена задача DEMO-6 \(задач 5 → 6\)/);
  const works = text(
    m.split('data-testid="forecast-works"')[1]!.split('data-testid="human-wait"')[0]!,
  );
  assert.match(works, /DEMO-2: ~60 %, попытка 2 из 3, исправляет замечания/);
  assert.match(works, /DEMO-3: ~10 %/);
  const clipped = html(
    <Overview
      view={viewOf({ ...ruRelease, truncated: { forecastWorks: 4 } })}
      lang="ru"
      timeZone="UTC"
    />,
  );
  assert.match(text(clipped), /Ещё 4 работы не показано/);
  const en = text(html(<Overview view={viewOf(enRelease)} lang="en" timeZone="UTC" />));
  assert.match(en, /Added to the release after it started: task DEMO-6 added \(tasks 5 → 6\)/);
});

test('a finished release: a full ring with the finish time, elapsed stops at finishedAt', () => {
  const f = viewOf(ruFinished).forecast!;
  // Hours later the elapsed time does not grow: the release is over.
  const later = Date.parse('2026-11-19T18:00:00Z');
  const s = timeState(f, 'ru', later);
  assert.equal(s.kind, 'done');
  assert.equal(s.share, 1);
  assert.match(s.text, /выпуск закончен .*занял 2 ч 40 мин · осталось: ничего/);
  assert.equal(s.sub, 'закончен');
  const en = timeState(viewOf(enFinished).forecast!, 'en', later);
  assert.match(en.text, /release finished at .*took 2 h 40 min/);
  // `estimate: nothing` without a finish time is done too.
  const nothing = timeState(
    { ...f, progress: { ...f.progress, left: 1 }, time: { ...f.time, finishedAt: undefined } },
    'ru',
    later,
  );
  assert.equal(nothing.kind, 'done');
  const m = text(html(<Overview view={viewOf(ruFinished)} lang="ru" timeZone="UTC" now={later} />));
  assert.match(m, /готово 100 %, все 4 задачи приняты/);
  // Nobody has to start a run for a finished release: the queue does not «stand».
  assert.doesNotMatch(m, /Очередь стоит/);
  assert.match(m, /Все работы приняты: 4 из 4/);
  assert.match(m, /Сейчас от вас ничего не нужно/);
});

test('checks in the task source are in «Нужно от вас» and in the header sentence', () => {
  const view = viewOf(ruRelease);
  const items = sourceReviewItems(view);
  assert.equal(items.count, 1);
  assert.equal(items.loose.length, 0, 'the escalation is the listed task');
  // Not a decision step as well.
  assert.equal(
    nextSteps(view).operator.some((s) => s.code === 'SOURCE_REVIEW'),
    false,
  );
  const m = html(<Overview view={view} lang="ru" timeZone="UTC" />);
  const needs = text(m.split('data-testid="needs-you"')[1]!.split('data-testid="problems"')[0]!);
  assert.match(needs, /ждут вашей проверки в Relay: DEMO-1/);
  assert.match(needs, /проверка в трекере/);
  assert.match(needs, /DEMO-1 · review/);
  assert.match(text(m), /От вас: ответить на 2 вопроса и проверить 1 задачу в источнике задач/);
  const en = text(html(<Overview view={viewOf(enRelease)} lang="en" timeZone="UTC" />));
  assert.match(en, /waiting for your check in Relay: DEMO-1/);
  assert.match(en, /check 1 task in the task source/);
  // An escalation no group lists (a clipped list) is still yours.
  const clipped = viewOf({ ...ruRelease, sourceReviews: [], truncated: { sourceReviews: 1 } });
  assert.equal(sourceReviewItems(clipped).loose.length, 1);
  const c = text(html(<Overview view={clipped} lang="ru" timeZone="UTC" />));
  assert.match(c, /ждёт вашей проверки в источнике задач: DEMO-1/);
  assert.match(c, /Ещё 1 задача на проверке не показано/);
  assert.equal(
    headerSentence(
      {
        running: 0,
        queued: 0,
        stopped: 0,
        paused: false,
        questions: 0,
        decisions: 0,
        reviews: 2,
        waitingOperator: 0,
        incomplete: false,
      },
      'ru',
    ),
    'Сейчас ничего не выполняется. От вас: проверить 2 задачи в источнике задач.',
  );
});

test('runs that differ from counted attempts: «запусков 3, засчитано попыток 2»', () => {
  const view = viewOf(ruRelease);
  const tasks = html(<Tasks view={view} lang="ru" timeZone="UTC" />);
  assert.match(text(tasks), /\(запусков 3, засчитано попыток 2\)/);
  assert.match(tasks, /data-testid="attempt-runs"/);
  const en = text(html(<Tasks view={viewOf(enRelease)} lang="en" timeZone="UTC" />));
  assert.match(en, /\(3 runs, 2 counted attempts\)/);
  // The work detail says it next to the attempts line.
  const doc = structuredClone(work);
  doc.work.attempts.runs = 3;
  const d = checkWorkDetail(doc);
  assert.ok(d.ok);
  const detail = text(html(<WorkDetail detail={d.ok ? d.detail : (null as never)} lang="ru" />));
  assert.match(detail, /запусков 3, засчитано попыток 2/);
  // Equal or absent runs say nothing extra.
  const same = structuredClone(ruRelease);
  same.works.find((w: Json) => w.id === 'locale-format').attempts.runs = 2;
  assert.doesNotMatch(html(<Tasks view={viewOf(same)} lang="ru" />), /attempt-runs/);
});

test('revision 4 documents keep the previous screens: no added, readiness, rough or source checks', () => {
  for (const doc of [ruRelease, ruFinished]) {
    const old = asAlpha62(doc);
    const m = html(<Overview view={viewOf(old)} lang="ru" timeZone="UTC" />);
    for (const id of ['forecast-added', 'forecast-works', 'time-rough', 'attempt-runs'])
      assert.doesNotMatch(m, new RegExp(`data-testid="${id}"`), id);
    assert.doesNotMatch(text(m), /проверка в трекере|осталось грубо/);
  }
  // A revision 4 release without a range is unknown, as before.
  const t = timeState(viewOf(asAlpha62(ruRelease)).forecast!, 'ru', Date.now());
  assert.equal(t.kind, 'unknown');
});

const withTmp = async (prefix: string, fn: (dir: string) => Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    await fn(dir);
  } finally {
    // Guard: only the directory made above.
    if (dir.startsWith(join(tmpdir(), prefix))) rmSync(dir, { recursive: true, force: true });
  }
};

test('--repository: the live route asks `harness view --repository` and switches when the project appears', async () => {
  await withTmp('hui-r5-repo-', async (repo) => {
    const fake = fakeHarness({ view: true, lang: true, repository: true });
    const s = await startServer({
      harness: { bin: fake.bin, repository: repo, lang: true, defaultLang: 'ru' },
      appDir: repo,
      version: 'test',
    });
    try {
      const first = await fetch(s.url + 'api/view?lang=en');
      assert.equal(first.status, 200);
      const setup = (await first.json()) as Json;
      assert.equal(setup.setup.waitingFor, 'project');
      assert.deepEqual(JSON.parse(setup.source.producer), [
        'view',
        '--repository',
        repo,
        '--lang',
        'en',
      ]);
      assert.match(first.headers.get('x-hui-digest') ?? '', /^harness:/);
      // The project is set up while the panel runs: the next read is the overview.
      mkdirSync(join(repo, '.harness'));
      writeFileSync(join(repo, '.harness', 'project.json'), '{}');
      await new Promise((ok) => setTimeout(ok, 1_600));
      const next = await fetch(s.url + 'api/view?lang=en');
      assert.equal(next.status, 200);
      const view = (await next.json()) as Json;
      assert.ok(Array.isArray(view.works));
      assert.deepEqual(recordedArgs(view as never).slice(0, 3), ['view', '--repository', repo]);
    } finally {
      await s.close();
      fake.remove();
    }
  });
});

test('projectPaths watches the manifest, the policy and the state the manifest names', async () => {
  await withTmp('hui-r5-paths-', async (repo) => {
    const before = await projectPaths(repo);
    assert.deepEqual(before, [
      join(repo, '.harness'),
      join(repo, '.harness', 'project.json'),
      join(repo, '.harness', 'policy.json'),
    ]);
    mkdirSync(join(repo, '.harness'));
    writeFileSync(
      join(repo, '.harness', 'project.json'),
      JSON.stringify({ paths: { state: 'st' } }),
    );
    const after = await projectPaths(repo);
    assert.ok(after.includes(join(repo, 'st', 'state.sqlite')));
    assert.ok(after.includes(join(repo, 'st', 'binding.json')));
    writeFileSync(join(repo, '.harness', 'project.json'), 'not json');
    assert.equal((await projectPaths(repo)).length, 3);
  });
});

test('probe: the setup branch of the view output schema means --repository works', async () => {
  const fresh = fakeHarness({ view: true, lang: true, repository: true });
  const old = fakeHarness({ view: true, lang: true });
  try {
    assert.equal((await probeHarness(fresh.bin)).repository, true);
    assert.equal((await probeHarness(old.bin)).repository, false);
  } finally {
    fresh.remove();
    old.remove();
  }
});

const cli = (args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', ui, ...args], { encoding: 'utf8' });

test('CLI: --check --repository succeeds before setup; an older harness is told to use --state', async () => {
  await withTmp('hui-r5-cli-', async (repo) => {
    const fresh = fakeHarness({
      view: true,
      lang: true,
      repository: true,
      version: '0.1.0-alpha.65',
    });
    const old = fakeHarness({ view: true, lang: true, version: '0.1.0-alpha.62' });
    try {
      const ok = cli(['--check', '--harness', fresh.bin, '--repository', repo]);
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      const r = JSON.parse(ok.stdout);
      assert.equal(r.compatible, true);
      assert.deepEqual(r.view, { ok: true, setup: 'project' });
      assert.equal(r.fix, undefined);
      // Without a state or repository the check reads no view and still passes.
      assert.equal(cli(['--check', '--harness', fresh.bin]).status, 0);
      const no = cli(['--check', '--harness', old.bin, '--repository', repo]);
      assert.equal(no.status, 3);
      assert.match(JSON.parse(no.stdout).fix, /needs devcontour-harness 0\.1\.0-alpha\.65/);
      const serve = cli(['--repository', repo, '--harness', old.bin, '--port', '1']);
      assert.equal(serve.status, 2);
      assert.equal(JSON.parse(serve.stdout).error.code, 'HARNESS_VIEW_UNAVAILABLE');
      // Flag combinations.
      for (const bad of [
        ['--repository', repo, '--state', repo],
        ['--repository', repo, '--policy', join(repo, 'p.json')],
        ['--check', '--repository', repo, '--state', repo],
        ['--repository', repo, '--demo'],
      ]) {
        const b = cli(bad);
        assert.equal(b.status, 2, bad.join(' '));
        assert.equal(JSON.parse(b.stdout).error.code, 'INVALID_INPUT');
      }
    } finally {
      fresh.remove();
      old.remove();
    }
  });
});
