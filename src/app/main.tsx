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
import { Reviews } from '../components/Reviews.tsx';
import { Settings } from '../components/Settings.tsx';
import { WorkDetail } from '../components/WorkDetail.tsx';
import {
  dict,
  httpViewSource,
  type Dict,
  type Lang,
  type ViewSource,
  formatClock,
  pickLang,
  questionStatus,
  type OperatorView,
  type ViewCheck,
  type WorkDetailCheck,
} from '../model/index.ts';
import { activityHash, parseRoute, workHash, type Route } from './route.ts';
import '../components/styles.css';
import './app.css';

const POLL_MS = 5000;
// Set once at boot (see the end of the file): the language, its dictionary and the source.
let lang: Lang = 'ru';
let t: Dict = dict(lang);
let source: ViewSource;
let uiVersion: string | undefined;
/** What the server watches (`/api/health`): a live `harness view` or a file. */
let liveRoute: 'state' | 'file' | undefined;
const mobile = () => window.matchMedia('(max-width: 639px)').matches;

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
 * Loads a document and keeps it current (design §6, S3). With a stream
 * (`source.subscribe`) the page loads only when the server reports a
 * digest other than the one the shown document was loaded for; without one, or after the stream failed, it polls every
 * 5 s and tries the stream again after RESUBSCRIBE_MS. A hidden tab closes
 * the stream and stops polling: the server then runs nothing for it.
 *
 * A transport error, or a temporary `VIEW_UNAVAILABLE` after a good
 * document, keeps the last good document on screen with a banner (§5.9).
 */
function useLive<T extends Checked>(load: () => Promise<T>, key: string, workId?: string) {
  const [value, setValue] = useState<T | undefined>();
  const [live, setLive] = useState<Live>({ mode: 'poll' });
  const last = useRef<T | undefined>(undefined);
  useEffect(() => {
    setValue(undefined);
    setLive({ mode: 'poll' });
    last.current = undefined;
    let stopped = false;
    let poll: number | undefined;
    let retry: number | undefined;
    let unsubscribe: (() => void) | undefined;
    let seq = 0;
    let docDigest: string | undefined;
    let wanted: string | undefined;
    /** Loads the document; `digest` = the server digest this load answers. */
    const fetchNow = async (digest?: string) => {
      const mine = ++seq;
      wanted = digest;
      busy++;
      try {
        const next = await load().finally(() => busy--);
        // A slower, older answer never replaces a newer one.
        if (stopped || mine !== seq) return;
        if (!next.ok && next.code === 'VIEW_UNAVAILABLE' && last.current?.ok) {
          const message = next.message;
          setLive((l) => ({
            ...l,
            lost: { message, harness: true, since: l.lost?.since ?? new Date().toISOString() },
          }));
          return;
        }
        last.current = next;
        docDigest = digest;
        setValue(next);
        setLive((l) => ({ ...l, lost: undefined, docDigest: digest }));
      } catch (err) {
        if (stopped || mine !== seq) return;
        const message = (err as Error).message;
        setLive((l) => ({
          ...l,
          lost: { message, harness: false, since: l.lost?.since ?? new Date().toISOString() },
        }));
      }
    };
    let busy = 0;
    const seqBusy = () => busy > 0;
    const startPoll = () => {
      if (poll === undefined) poll = window.setInterval(() => void fetchNow(), POLL_MS);
    };
    const stopPoll = () => {
      window.clearInterval(poll);
      poll = undefined;
    };
    const unsubscribeNow = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      window.clearTimeout(retry);
      retry = undefined;
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
            setLive((l) => ({ ...l, mode: 'poll', stale: undefined }));
            startPoll();
            void fetchNow();
            retry = window.setTimeout(subscribe, RESUBSCRIBE_MS);
            return;
          }
          stopPoll();
          if (ev.kind === 'stale') {
            const stale = { since: ev.since, message: ev.message };
            setLive((l) => ({ ...l, mode: 'push', stale }));
            return;
          }
          setLive((l) => ({
            ...l,
            mode: 'push',
            checkedAt: ev.checkedAt,
            token: ev.token,
            stale: undefined,
          }));
          // Load unless the shown document (or the load under way) is for this digest.
          if (ev.token !== docDigest && !(seqBusy() && wanted === ev.token))
            void fetchNow(ev.token);
        },
        workId !== undefined ? { workId } : {},
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        unsubscribeNow();
        stopPoll();
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
  }, [key]);
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

type NavKey = 'overview' | 'reviews' | 'decisions' | 'activity' | 'settings' | 'history' | 'health';
const screens: [string, NavKey][] = [
  ['#/', 'overview'],
  ['#/reviews', 'reviews'],
  ['#/decisions', 'decisions'],
  ['#/activity', 'activity'],
  ['#/settings', 'settings'],
  ['#/history', 'history'],
  ['#/health', 'health'],
];
const isNavKey = (s: string): s is NavKey => screens.some(([, k]) => k === s);

function Nav({ route }: { route: Route }) {
  const other = lang === 'ru' ? 'en' : 'ru';
  return (
    <nav className="app-nav" aria-label={t.nav.label}>
      <ul>
        {screens.map(([href, key]) => (
          <li key={key}>
            <a href={href} aria-current={route.screen === key ? 'page' : undefined}>
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
  const { value, live } = useLive<WorkDetailCheck>(() => source.loadWork!(id), 'work:' + id, id);
  const error = live.lost?.message;
  useEffect(() => {
    // The clicked link is gone after navigation: move focus to the target, not just the view.
    const el = value?.ok && anchor ? document.getElementById(anchor) : null;
    if (!el) return;
    el.setAttribute('tabindex', '-1');
    el.scrollIntoView();
    el.focus({ preventScroll: true });
  }, [value?.ok, anchor]);
  return (
    <>
      <p>
        <a className="hui-link" href="#/">
          {t.nav.back}
        </a>
      </p>
      {!value ? (
        <Note bad={Boolean(error)}>{error ? t.app.connectionLost(error) : t.app.loadingWork}</Note>
      ) : !value.ok ? (
        <Refusal head={t.work.detailUnavailable} r={value} />
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
  const { value: check, live } = useLive<ViewCheck>(() => source.load(), 'view');
  const error = live.lost?.message;
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const name =
      route.screen === 'work'
        ? route.workId
        : isNavKey(route.screen)
          ? t.nav[route.screen]
          : t.app.notFound;
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
  else {
    const view = check.view;
    const common = { view, lang, now: Date.now(), workHref: workHash };
    const screen =
      route.screen === 'overview' ? (
        <Overview {...common} />
      ) : route.screen === 'reviews' ? (
        <Reviews {...common} collapseFindings={mobile()} />
      ) : route.screen === 'decisions' ? (
        <Decisions {...common} />
      ) : route.screen === 'activity' ? (
        <Activity {...common} filter={route.filter ?? {}} filterHref={activityHash} />
      ) : route.screen === 'settings' ? (
        <Settings view={view} lang={lang} />
      ) : route.screen === 'history' ? (
        <History view={view} lang={lang} now={Date.now()} />
      ) : route.screen === 'health' ? (
        <Health {...common} {...(uiVersion ? { uiVersion } : {})} />
      ) : (
        <Note bad>{t.app.notFound}</Note>
      );
    const waiting = view.questions.filter((q) => questionStatus(q).needsAnswer).length;
    const clipped = Boolean(view.truncated?.questions);
    body = (
      <>
        <Freshness generatedAt={view.generatedAt} live={live} />
        {check.newerRevision ? <Note>{t.app.newerRevision}</Note> : null}
        {isEmpty(view) ? (
          <Note>
            {t.app.empty} <code>harness run</code>
          </Note>
        ) : null}
        <p className="hui-sr" aria-live="polite">
          {t.app.liveQuestions(waiting, clipped)}
        </p>
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
      <main id="hui-main" ref={main} tabIndex={-1}>
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
  const param = new URLSearchParams(window.location.search).get('lang');
  let served: string | undefined;
  try {
    const h = (await (await fetch(new URL('./api/health', window.location.href))).json()) as {
      version?: unknown;
      lang?: unknown;
      live?: unknown;
    };
    if (typeof h.version === 'string') uiVersion = h.version;
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
