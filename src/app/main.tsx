// Standalone app: polls the local CLI's /api/view (relative URL, same origin)
// and renders the screens behind hash routes. Read-only; no third-party
// requests. States: loading, empty, incompatible, connection lost, newer revision.

import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity } from '../components/Activity.tsx';
import { Decisions } from '../components/Decisions.tsx';
import { Health } from '../components/Health.tsx';
import { History } from '../components/History.tsx';
import { Overview } from '../components/Overview.tsx';
import { Settings, type ThemeChoice } from '../components/Settings.tsx';
import { Tasks } from '../components/Tasks.tsx';
import { UpdatesBanner } from '../components/Updates.tsx';
import { Alert } from '../components/ui/alert.tsx';
import { Button } from '../components/ui/button.tsx';
import { cn } from '../components/ui/cn.ts';
import { WorkDetail } from '../components/WorkDetail.tsx';
import { inSetup, SetupNote, SetupScreen } from '../components/Setup.tsx';
import {
  dict,
  httpViewSource,
  type Dict,
  type Lang,
  type ViewSource,
  type Digested,
  formatClock,
  pickLang,
  nextSteps,
  sourceReviewItems,
  type OperatorView,
  type SetupCheck,
  type ViewCheck,
  type WorkDetailCheck,
} from '../model/index.ts';
import { activityHash, parseRoute, redirectOf, workHash, type Route } from './route.ts';
import { splitQuestions } from '../model/tasks.ts';
import '../components/styles.css';
import './app.css';

const POLL_MS = 5000;
// Set once at boot (see the end of the file): the language, its dictionary and the source.
let lang: Lang = 'ru';
let t: Dict = dict(lang);
let source: ViewSource;
let uiVersion: string | undefined;
/**
 * The app build this page runs (F-AF): the id the server wrote into the
 * page it served (`<meta name="hui-build">`), else the first `/api/health`.
 */
let bootBuild: string | undefined =
  document.querySelector<HTMLMetaElement>('meta[name="hui-build"]')?.content || undefined;
/** What the server watches (`/api/health`): a live `harness view` or a file. */
let liveRoute: 'state' | 'file' | undefined;

const THEME_KEY = 'devcontour-harness-ui:theme';
/** The viewer's theme choice, kept in this browser only; storage may be unavailable. */
function readTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
function applyTheme(c: ThemeChoice) {
  if (c === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = c;
}
function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  return [
    theme,
    (c) => {
      setTheme(c);
      applyTheme(c);
      try {
        if (c === 'system') window.localStorage.removeItem(THEME_KEY);
        else window.localStorage.setItem(THEME_KEY, c);
      } catch {
        // Not kept: the choice lasts for this page only.
      }
    },
  ];
}

/** How often an open tab asks whether a new panel build is served. */
const BUILD_CHECK_MS = 60_000;
/**
 * F-AF: an open tab notices a new panel build (the server restarted with a
 * new version) and offers a reload instead of showing the old bundle.
 */
function useNewBuild(): { version: string } | undefined {
  const [fresh, setFresh] = useState<{ version: string } | undefined>();
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(new URL('./api/health', window.location.href), { cache: 'no-store' });
        const h = (await r.json()) as { build?: unknown; version?: unknown };
        // No baseline yet (the boot check failed): the first answer is it.
        if (typeof h.build === 'string' && bootBuild === undefined) bootBuild = h.build;
        else if (!stopped && typeof h.build === 'string' && h.build !== bootBuild)
          setFresh({ version: typeof h.version === 'string' ? h.version : '' });
      } catch {
        // The panel server is away: the connection banner says so.
      }
    };
    const timer = window.setInterval(() => void check(), BUILD_CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return fresh;
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

type Checked = { ok: true } | { ok: false; code: string; message: string };

/** What the page knows about the freshness of the shown document. */
interface Live {
  /** `push`: an SSE stream delivers changes; `poll`: GET every 5 s (no stream, or it failed). */
  mode: 'push' | 'poll';
  /** Last confirmed check of the server (stream) and the content token it saw. */
  checkedAt?: string;
  token?: string;
  /**
   * The server digest the shown document was loaded for (the `view` or
   * `fresh` event that caused the load); `undefined` after a poll. Equal to
   * `token` = the shown content is what the server last checked.
   */
  docDigest?: string;
  /** The last server check failed: harness refused, crashed or timed out. */
  stale?: { since: string; message: string };
  /** A GET failed: transport error, or a temporary refusal after a good document. */
  lost?: { message: string; harness: boolean; since: string };
}

/** After a stream is lost, the page polls and tries the stream again after this long. */
const RESUBSCRIBE_MS = 30_000;
/**
 * A load that has not answered by then is abandoned as a failure (and retried
 * by polling): one stalled GET must not block every later load. Longer than
 * the server's 30 s harness deadline.
 */
const LOAD_DEADLINE_MS = 40_000;

/**
 * Loads a document and keeps it current (design §6, S3). With a stream
 * (`source.subscribe`) the page loads only when the server reports a
 * digest other than the one the shown document was loaded for; without one, or after the stream failed, it polls every
 * 5 s and tries the stream again after RESUBSCRIBE_MS. A hidden tab closes
 * the stream and stops polling: the server then runs nothing for it.
 *
 * A transport error, or a temporary `VIEW_UNAVAILABLE` after a good
 * document, keeps the last good document on screen with a banner (§5.9).
 */
function useLive<T extends Checked & { digest?: string }>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  workId?: string,
  active = true,
) {
  const [value, setValue] = useState<T | undefined>();
  const [live, setLive] = useState<Live>({ mode: 'poll' });
  const last = useRef<T | undefined>(undefined);
  const shownKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    // A new document starts empty; pausing and resuming the same one keeps it.
    if (shownKey.current !== key) {
      shownKey.current = key;
      setValue(undefined);
      setLive({ mode: 'poll' });
      last.current = undefined;
    }
    if (!active) return;
    let stopped = false;
    let poll: number | undefined;
    let retry: number | undefined;
    let unsubscribe: (() => void) | undefined;
    /**
     * Loads run one at a time. A load asked while one runs is coalesced into
     * one more load after it. `generation` changes when a pending answer must
     * not land any more (the tab was hidden, or the server confirmed the
     * shown content meanwhile).
     */
    let generation = 0;
    let loading = false;
    let again = false;
    /** Server digest of the shown document (`x-hui-digest` of its GET). */
    let docDigest = last.current?.digest;
    /** Digest of the latest `view`/`fresh` event: what the server has now. */
    let latest: string | undefined;
    /** Loads in a row whose digest still differs from `latest` (bounded catch-up). */
    let behind = 0;
    /** The stream delivers events; polling then runs only to retry a failed load. */
    let pushing = false;
    let failing = false;
    const startPoll = () => {
      // A hidden tab never polls.
      if (poll === undefined && !document.hidden)
        poll = window.setInterval(() => void fetchNow(), POLL_MS);
    };
    const stopPoll = () => {
      window.clearInterval(poll);
      poll = undefined;
    };
    const failed = (message: string, harness: boolean) => {
      failing = true;
      // A failed load is retried by polling, whatever the stream says.
      startPoll();
      setLive((l) => ({
        ...l,
        lost: { message, harness, since: l.lost?.since ?? new Date().toISOString() },
      }));
    };
    const fetchNow = async (): Promise<void> => {
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      again = false;
      const mine = generation;
      let next: T | undefined;
      let error: string | undefined;
      try {
        const ctl = new AbortController();
        const deadline = window.setTimeout(() => ctl.abort(), LOAD_DEADLINE_MS);
        try {
          next = await load(ctl.signal);
        } finally {
          window.clearTimeout(deadline);
        }
      } catch (err) {
        error =
          (err as Error).name === 'AbortError'
            ? `no answer in ${LOAD_DEADLINE_MS / 1000} s`
            : (err as Error).message;
      }
      if (stopped || mine !== generation) return;
      loading = false;
      if (next === undefined) failed(error ?? 'error', false);
      else if (!next.ok && next.code === 'VIEW_UNAVAILABLE') {
        // Temporary: keep a good document with a warning, and retry either way.
        if (last.current?.ok) failed(next.message, true);
        else {
          failing = true;
          startPoll();
          last.current = next;
          setValue(next);
        }
      } else {
        last.current = next;
        docDigest = next.digest;
        failing = false;
        if (pushing) stopPoll();
        setValue(next);
        setLive((l) => ({
          ...l,
          lost: undefined,
          docDigest: next.digest,
          // A GET answered while polling ran the source just now: the data is current.
          ...(pushing ? {} : { stale: undefined }),
        }));
        // The server moved on while this load ran: catch up (a few times at most).
        const lagging =
          pushing && latest !== undefined && next.digest !== undefined && next.digest !== latest;
        behind = lagging ? behind + 1 : 0;
        if (lagging && behind <= 3) again = true;
      }
      if (again) void fetchNow();
    };
    /** Drops a pending load: its answer is no longer wanted. */
    const forget = () => {
      generation++;
      loading = false;
      again = false;
    };
    const unsubscribeNow = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      window.clearTimeout(retry);
      retry = undefined;
      pushing = false;
    };
    const subscribe = () => {
      unsubscribeNow();
      // Until the stream confirms itself, the page polls: a stream that never
      // opens cannot freeze the screen.
      startPoll();
      if (!source.subscribe) return;
      unsubscribe = source.subscribe(
        (ev) => {
          if (stopped) return;
          if (!ev) return void fetchNow();
          if (ev.kind === 'down') {
            unsubscribe = undefined;
            pushing = false;
            latest = undefined;
            // A known failure stays on screen until a load succeeds.
            setLive((l) => ({ ...l, mode: 'poll' }));
            startPoll();
            void fetchNow();
            retry = window.setTimeout(subscribe, RESUBSCRIBE_MS);
            return;
          }
          pushing = true;
          if (!failing) stopPoll();
          if (ev.kind === 'stale') {
            const stale = { since: ev.since, message: ev.message };
            setLive((l) => ({ ...l, mode: 'push', stale }));
            return;
          }
          latest = ev.token;
          const shown = docDigest !== undefined && ev.token === docDigest;
          setLive((l) => ({
            ...l,
            mode: 'push',
            checkedAt: ev.checkedAt,
            token: ev.token,
            stale: undefined,
            // The server confirmed exactly the shown content: the link works again.
            ...(shown ? { lost: undefined } : {}),
          }));
          if (shown) {
            // A pending load would only replace confirmed content with an older answer.
            forget();
            behind = 0;
            failing = false;
            stopPoll();
          } else void fetchNow();
        },
        workId !== undefined ? { workId } : {},
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        unsubscribeNow();
        stopPoll();
        forget();
      } else {
        void fetchNow();
        subscribe();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) {
      void fetchNow();
      subscribe();
    }
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeNow();
      stopPoll();
    };
    // `key` names the document; `load` is recreated on every render.
  }, [key, active]);
  return { value, live };
}

/** «Данные на HH:MM · обновляются сами» and the stale or lost-connection warning. */
function Freshness({ generatedAt, live }: { generatedAt: string; live: Live }) {
  const now = Date.now();
  const clock = (iso: string) => formatClock(iso, undefined, now) ?? t.live.unknownTime;
  // A confirmed check of the same content is newer than the document's own
  // time. Only the live route confirms: a file read says nothing about when
  // the snapshot was taken.
  const confirmed =
    liveRoute === 'state' &&
    live.mode === 'push' &&
    live.checkedAt !== undefined &&
    live.token !== undefined &&
    live.token === live.docDigest &&
    Date.parse(live.checkedAt) > Date.parse(generatedAt)
      ? live.checkedAt
      : undefined;
  const at = clock(confirmed ?? generatedAt);
  const how =
    live.mode === 'poll' ? t.live.poll : liveRoute === 'state' ? t.live.push : t.live.snapshot;
  const problem = live.stale ?? live.lost;
  return (
    <>
      {problem ? (
        <p className="app-note app-bad" data-testid="stale">
          {live.lost && !live.lost.harness
            ? t.app.connectionLost(live.lost.message)
            : t.live.stale(clock(problem.since), problem.message, at)}
        </p>
      ) : null}
      <p className="app-note app-fresh" data-testid="freshness">
        {t.live.at(
          at,
          confirmed && clock(generatedAt) !== at ? clock(generatedAt) : undefined,
          how,
        )}
      </p>
    </>
  );
}

type NavKey = 'overview' | 'tasks' | 'decisions' | 'journal' | 'settings';
const screens: [string, NavKey][] = [
  ['#/', 'overview'],
  ['#/tasks', 'tasks'],
  ['#/decisions', 'decisions'],
  ['#/activity', 'journal'],
  ['#/settings', 'settings'],
];
/** Screens of «Журнал»: who did what, the run over time, the machinery. */
const journal: [string, 'activity' | 'history' | 'health'][] = [
  ['#/activity', 'activity'],
  ['#/history', 'history'],
  ['#/health', 'health'],
];
const navOf = (s: Route['screen']): NavKey | undefined =>
  s === 'overview' || s === 'tasks' || s === 'decisions' || s === 'settings'
    ? s
    : s === 'work' || s === 'reviews'
      ? 'tasks'
      : s === 'activity' || s === 'history' || s === 'health'
        ? 'journal'
        : undefined;
const titleOf = (r: Route): string =>
  r.screen === 'work'
    ? (r.workId ?? '')
    : r.screen === 'activity' || r.screen === 'history' || r.screen === 'health'
      ? t.nav[r.screen]
      : r.screen === 'reviews'
        ? t.nav.tasks
        : r.screen === 'overview' ||
            r.screen === 'tasks' ||
            r.screen === 'decisions' ||
            r.screen === 'settings'
          ? t.nav[r.screen]
          : t.app.notFound;

function Nav({ route }: { route: Route }) {
  const other = lang === 'ru' ? 'en' : 'ru';
  const current = navOf(route.screen);
  return (
    <header className="app-top hui:border-b hui:border-border hui:bg-card">
      <nav className="app-nav" aria-label={t.nav.label}>
        <span className="app-brand">{t.app.title}</span>
        <ul>
          {screens.map(([href, key]) => (
            <li key={key}>
              <a
                href={href}
                aria-current={current === key ? 'page' : undefined}
                className={cn('app-tab', current === key && 'app-tab-on')}
              >
                {t.nav[key]}
              </a>
            </li>
          ))}
        </ul>
        <a
          className="app-lang"
          href={`?lang=${other}${window.location.hash}`}
          lang={other}
          hrefLang={other}
        >
          {dict(other).langName}
        </a>
      </nav>
    </header>
  );
}

/** Second row of «Журнал»: events, the run over time, the machinery. */
function JournalNav({ route }: { route: Route }) {
  return (
    <nav className="app-subnav" aria-label={t.nav.journalLabel}>
      <ul>
        {journal.map(([href, key]) => (
          <li key={key}>
            <a
              href={href}
              aria-current={route.screen === key ? 'page' : undefined}
              className={cn('app-chip', route.screen === key && 'app-chip-on')}
            >
              {t.nav[key]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Only the producer's own signal: a state without work orders is not a missing state.
const isEmpty = (v: OperatorView) => v.health.warnings.some((w) => w.code === 'STATE_NOT_FOUND');

/** A refusal in the panel's words, with the server's message as a detail. */
function Refusal({ head, r }: { head: string; r: { code: string; message: string } }) {
  return (
    <p className="app-note app-bad">
      {head} {Object.hasOwn(t.app.refusal, r.code) ? t.app.refusal[r.code] : r.code}{' '}
      <span className="app-detail">
        {t.app.details} <code>{r.message}</code>
      </span>
    </p>
  );
}

function Note({ bad, children }: { bad?: boolean; children: ReactNode }) {
  return <p className={'app-note' + (bad ? ' app-bad' : '')}>{children}</p>;
}

function WorkScreen({ id, anchor }: { id: string; anchor: string | undefined }) {
  const { value, live } = useLive<(WorkDetailCheck | SetupCheck) & Digested>(
    (signal) => source.loadWork!(id, signal),
    'work:' + id,
    id,
  );
  const error = live.lost?.message;
  useEffect(() => {
    // The clicked link is gone after navigation: move focus to the target, not just the view.
    const el = value?.ok && !('setup' in value) && anchor ? document.getElementById(anchor) : null;
    if (!el) return;
    el.setAttribute('tabindex', '-1');
    el.scrollIntoView();
    el.focus({ preventScroll: true });
  }, [value?.ok, anchor]);
  return (
    <>
      <p>
        <a className="hui-link" href="#/tasks">
          {t.nav.backTasks}
        </a>
      </p>
      {!value ? (
        <Note bad={Boolean(error)}>{error ? t.app.connectionLost(error) : t.app.loadingWork}</Note>
      ) : !value.ok ? (
        <Refusal head={t.work.detailUnavailable} r={value} />
      ) : 'setup' in value ? (
        // Revision 5: the harness is not set up yet; the page switches by itself.
        <>
          <Freshness generatedAt={value.setup.generatedAt} live={live} />
          <SetupScreen view={value.setup} lang={lang} />
        </>
      ) : (
        <>
          <Freshness generatedAt={value.detail.generatedAt} live={live} />
          {value.newerRevision ? <Note>{t.app.newerRevision}</Note> : null}
          <WorkDetail detail={value.detail} now={Date.now()} lang={lang} workHref={workHash} />
        </>
      )}
    </>
  );
}

function App() {
  const route = useRoute();
  const [theme, setTheme] = useTheme();
  const fresh = useNewBuild();
  const redirect = redirectOf(route);
  useEffect(() => {
    // An old link (`#/reviews`) lands where its content lives now.
    if (redirect) window.location.replace(redirect + (route.anchor ? '#' + route.anchor : ''));
  }, [redirect]);
  const { value: check, live } = useLive<(ViewCheck | SetupCheck) & Digested>(
    (signal) => source.load(signal),
    'view',
    undefined,
    // The work screen has its own stream; the overview one would only cost
    // a harness run per check and a browser connection.
    route.screen !== 'work',
  );
  const error = live.lost?.message;
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const name = titleOf(route);
    document.title = `${t.app.title} — ${name}`;
    // Move focus to the new screen for keyboard and screen-reader users (not on first load).
    if (first.current) first.current = false;
    else if (!route.anchor) main.current?.focus();
  }, [route.screen, route.workId, route.anchor]);

  let body: ReactNode;
  if (route.screen === 'work') body = <WorkScreen id={route.workId!} anchor={route.anchor} />;
  else if (!check)
    body = <Note bad={Boolean(error)}>{error ? t.app.connectionLost(error) : t.app.loading}</Note>;
  else if (!check.ok) body = <Refusal head={t.app.incompatible} r={check} />;
  else if ('setup' in check)
    // Revision 5: the harness is not set up in the project yet. Not an error:
    // the page keeps reading and switches to the screens once an overview comes.
    body = (
      <>
        <Freshness generatedAt={check.setup.generatedAt} live={live} />
        {check.newerRevision ? <Note>{t.app.newerRevision}</Note> : null}
        <SetupScreen view={check.setup} lang={lang} />
      </>
    );
  else {
    const view = check.view;
    const common = { view, lang, now: Date.now(), workHref: workHash };
    const screen =
      route.screen === 'overview' ? (
        <Overview {...common} />
      ) : route.screen === 'tasks' || route.screen === 'reviews' ? (
        <Tasks {...common} />
      ) : route.screen === 'decisions' ? (
        <Decisions {...common} />
      ) : route.screen === 'activity' ? (
        <Activity {...common} filter={route.filter ?? {}} filterHref={activityHash} />
      ) : route.screen === 'settings' ? (
        <Settings view={view} lang={lang} theme={theme} onThemeChange={setTheme} />
      ) : route.screen === 'history' ? (
        <History view={view} lang={lang} now={Date.now()} />
      ) : route.screen === 'health' ? (
        <Health {...common} {...(uiVersion ? { uiVersion } : {})} />
      ) : (
        <Note bad>{t.app.notFound}</Note>
      );
    // Questions the lead answers by the policy are not announced as yours (F-W).
    // Tracker questions to the owner (revision 4) are yours too.
    const waiting =
      splitQuestions(view, nextSteps(view)).yours.length + (view.sourceQuestions?.length ?? 0);
    // Revision 5: tasks waiting for your check in the task source.
    const reviews = sourceReviewItems(view).count;
    const clipped = Boolean(
      view.truncated?.questions || view.truncated?.sourceQuestions || view.truncated?.sourceReviews,
    );
    body = (
      <>
        <Freshness generatedAt={view.generatedAt} live={live} />
        {check.newerRevision ? <Note>{t.app.newerRevision}</Note> : null}
        <UpdatesBanner updates={view.updates} lang={lang} />
        {inSetup(view) ? (
          // Revision 5: a state without works — «Идёт настройка harness», «Задач пока нет».
          <SetupNote view={view} lang={lang} />
        ) : isEmpty(view) ? (
          <Note>
            {t.app.empty} <code>harness run</code>
          </Note>
        ) : null}
        <p className="hui-sr" aria-live="polite">
          {t.app.liveQuestions(waiting, clipped, reviews)}
        </p>
        {navOf(route.screen) === 'journal' ? <JournalNav route={route} /> : null}
        {screen}
      </>
    );
  }
  return (
    <>
      <a
        className="app-skip"
        href="#hui-main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        {t.app.skip}
      </a>
      <Nav route={route} />
      <main id="hui-main" ref={main} tabIndex={-1} className="app-main">
        {fresh ? (
          <Alert tone="warn" className="app-alert" data-testid="new-build" role="status">
            <span>{t.app.newBuild(fresh.version)}</span>
            <Button type="button" onClick={() => window.location.reload()}>
              {t.app.reload}
            </Button>
          </Alert>
        ) : null}
        {body}
      </main>
    </>
  );
}

/**
 * Language: `?lang=ru|en` wins; then the CLI's `--lang` (or its system
 * locale), which `/api/health` reports; then the browser locale (design §6).
 */
async function boot() {
  // The viewer's theme first: no flash of the other theme while health loads.
  applyTheme(readTheme());
  const param = new URLSearchParams(window.location.search).get('lang');
  let served: string | undefined;
  try {
    const h = (await (await fetch(new URL('./api/health', window.location.href))).json()) as {
      version?: unknown;
      build?: unknown;
      lang?: unknown;
      live?: unknown;
    };
    if (typeof h.version === 'string') uiVersion = h.version;
    if (typeof h.build === 'string') bootBuild ??= h.build;
    if (h.live === 'state' || h.live === 'file') liveRoute = h.live;
    if (typeof h.lang === 'string') served = h.lang;
  } catch {
    // No health route (a host page): the browser locale decides.
  }
  const asked = param === 'ru' || param === 'en' ? param : served;
  lang = pickLang(asked, [...(navigator.languages ?? []), navigator.language]);
  t = dict(lang);
  document.documentElement.lang = lang;
  // The UI language goes to the view source too: the harness writes the plain
  // strings (`plain`, `line`, warnings) in it (`harness view --lang`).
  source = httpViewSource(new URL('./', window.location.href).toString(), fetch, { lang });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
