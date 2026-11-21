// View revision 5 (harness 0.1.0-alpha.65): the setup state before harness
// setup (the setup document and an overview at the setup stage), the
// forecast over the whole release (tasks added later, per-work readiness, a
// rough time range, the finished release), checks left in the task source
// (`sourceReviews`, escalation SOURCE_REVIEW) and uncounted runs. A
// revision 4 document (`asAlpha62`) keeps the previous screens.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
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
  checkWork,
  checkWorkDetail,
  dict,
  headerSentence,
  httpViewSource,
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
  // The hero line counts the same release as the ring: 1 of 6 tasks, not 1 of 4 works.
  const hero = text(m.split('data-testid="hero"')[1]!.split('data-testid="scope"')[0]!);
  assert.match(hero, /принято 1 из 6/);
  assert.doesNotMatch(hero, /принято 1 из 4/);
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
  assert.match(text(clipped), /Ещё 4 работы не показаны/);
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
  // `estimate: nothing` without a finish time is done too, but its clock goes on.
  const { finishedAt: _f, ...open } = f.time;
  const nothing = timeState(
    { ...f, progress: { ...f.progress, left: 1 }, time: open },
    'ru',
    later,
  );
  assert.equal(nothing.kind, 'done');
  assert.doesNotMatch(nothing.text, /занял 2 ч 40 мин/);
  assert.match(nothing.text, /прошло 8 ч 50 мин/);
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
  // The Tasks card of the accepted work says it too.
  const tasks = html(<Tasks view={view} lang="ru" timeZone="UTC" />);
  const card = text(
    tasks.split('data-testid="task-add-greeting"')[1]!.split('data-testid="task-')[0]!,
  );
  assert.match(
    text(tasks.split('data-testid="task-source-review"')[1]!.split('</p>')[0]!),
    /DEMO-1 ждёт вашей проверки в источнике задач \(колонка review\)/,
  );
  assert.ok(card.length > 0);
  // The screen-reader count names the checks, and a clipped list makes it a floor.
  assert.equal(
    dict('ru').app.liveQuestions(2, false, 1),
    'Ждут вашего ответа: 2 вопроса; вашей проверки в источнике задач: 1 задача.',
  );
  assert.match(dict('en').app.liveQuestions(0, true, 2), /2 tasks wait for your check/);
  // An escalation no group lists (a clipped list) is still yours.
  const clipped = viewOf({ ...ruRelease, sourceReviews: [], truncated: { sourceReviews: 1 } });
  assert.equal(sourceReviewItems(clipped).loose.length, 1);
  const c = text(html(<Overview view={clipped} lang="ru" timeZone="UTC" />));
  assert.match(c, /ждёт вашей проверки в источнике задач: DEMO-1/);
  assert.match(c, /Ещё 1 задача на проверке не показана/);
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

/**
 * A fetch without a connection pool: a pooled socket to a port an earlier
 * test's server used would be reset by the next server on that port.
 */
const get = (url: string) =>
  new Promise<{
    ok: boolean;
    status: number;
    headers: { get(k: string): string | null };
    json(): Promise<unknown>;
  }>((ok, fail) => {
    const req = request(url, { agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () =>
        ok({
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode ?? 0,
          headers: { get: (k) => (res.headers[k.toLowerCase()] as string | undefined) ?? null },
          json: async () => JSON.parse(body) as unknown,
        }),
      );
    });
    req.on('error', fail);
    req.end();
  });
const pooled = ((url: string) => get(String(url))) as unknown as typeof fetch;

/** A minimal reader of the panel's event stream. */
async function events(url: string) {
  const ctl = new AbortController();
  const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'text/event-stream' } });
  const got: { event: string; data: Json }[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev && data) got.push({ event: ev, data: JSON.parse(data) as Json });
        }
      }
    } catch {
      // Aborted.
    }
  })();
  return {
    async next(kind: string, ms: number, ok: (e: { data: Json }) => boolean = () => true) {
      const end = Date.now() + ms;
      for (;;) {
        const e = got.find((x) => x.event === kind && ok(x));
        if (e) return e;
        if (Date.now() > end) throw new Error(`no ${kind} in ${ms} ms: ${JSON.stringify(got)}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    close() {
      ctl.abort();
      void pump;
    },
  };
}

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
      const first = await get(s.url + 'api/view?lang=en');
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
      // An open page holds the event stream; its first `view` is the setup document.
      const es = await events(s.url + 'api/events?lang=en');
      try {
        const before = await es.next('view', 10_000);
        assert.equal(before.data.token, first.headers.get('x-hui-digest'));
        // Harness setup writes the project file while the panel runs: the
        // watch notices it (no reload, no restart) and pushes a new `view`.
        mkdirSync(join(repo, '.harness'));
        writeFileSync(join(repo, '.harness', 'project.json'), '{}');
        const changed = await es.next('view', 10_000, (e) => e.data.token !== before.data.token);
        const next = await get(s.url + 'api/view?lang=en');
        assert.equal(next.status, 200);
        assert.equal(next.headers.get('x-hui-digest'), changed.data.token);
        const view = (await next.json()) as Json;
        assert.ok(Array.isArray(view.works));
        assert.deepEqual(recordedArgs(view as never).slice(0, 3), ['view', '--repository', repo]);
        // The work route of a set-up project is the detail again.
        const w = await get(s.url + 'api/work/locale-format?lang=en');
        assert.equal(w.status, 200);
      } finally {
        es.close();
      }
    } finally {
      await s.close();
      fake.remove();
    }
  });
});

test('--repository: the work route before setup is the setup document; a harness refusal stays a refusal', async () => {
  await withTmp('hui-r5-work-', async (repo) => {
    const fake = fakeHarness({ view: true, lang: true, repository: true });
    const refusing = fakeHarness({
      view: true,
      lang: true,
      repository: true,
      refuse: { code: 'POLICY_REQUIRED', message: 'no policy and no binding' },
    });
    const s = await startServer({
      harness: { bin: fake.bin, repository: repo, lang: true, defaultLang: 'ru' },
      appDir: repo,
      version: 'test',
    });
    const r = await startServer({
      harness: { bin: refusing.bin, repository: repo, lang: true, defaultLang: 'ru' },
      appDir: repo,
      version: 'test',
    });
    try {
      const w = await get(s.url + 'api/work/locale-format');
      assert.equal(w.status, 200);
      const doc = (await w.json()) as Json;
      const c = checkWork(doc);
      assert.equal(c.ok && 'setup' in c, true);
      // The page source reads it as the setup state, not «несовместимо».
      const src = httpViewSource(s.url, pooled);
      const loaded = await src.loadWork!('locale-format');
      assert.equal(loaded.ok && 'setup' in loaded, true);
      // A refusal is an unavailable view with the harness code, never the setup screen.
      const v = await get(r.url + 'api/view');
      assert.equal(v.status, 503);
      const body = (await v.json()) as Json;
      assert.equal(body.error.code, 'VIEW_UNAVAILABLE');
      assert.match(body.error.message, /POLICY_REQUIRED/);
      const viaSource = await httpViewSource(r.url, pooled).load();
      assert.equal(viaSource.ok, false);
      assert.equal('setup' in viaSource, false);
    } finally {
      await s.close();
      await r.close();
      fake.remove();
      refusing.remove();
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

test('probe: `repository` in the view input schema, or else the setup branch of its output schema, means --repository works', async () => {
  const fresh = fakeHarness({ view: true, lang: true, repository: true });
  const listed = fakeHarness({ view: true, lang: true, repositoryArg: true, viewVersion: null });
  const old = fakeHarness({ view: true, lang: true });
  try {
    assert.equal((await probeHarness(fresh.bin)).repository, true);
    // The catalog's input schema names the flag: no output schema needed.
    assert.equal((await probeHarness(listed.bin)).repository, true);
    assert.equal((await probeHarness(old.bin)).repository, false);
  } finally {
    fresh.remove();
    listed.remove();
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
      // A failing view under --repository (not the setup document) fails the check.
      const refusing = fakeHarness({
        view: true,
        lang: true,
        repository: true,
        refuse: { code: 'POLICY_REQUIRED', message: 'no policy' },
      });
      try {
        const bad = cli(['--check', '--harness', refusing.bin, '--repository', repo]);
        assert.equal(bad.status, 3, bad.stdout);
        const br = JSON.parse(bad.stdout);
        assert.equal(br.compatible, false);
        assert.equal(br.view.ok, false);
        assert.match(br.fix, /POLICY_REQUIRED/);
      } finally {
        refusing.remove();
      }
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
