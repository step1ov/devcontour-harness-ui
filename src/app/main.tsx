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

/**
 * Polls `load` every 5 s while the tab is visible. A transport error, or a
 * temporary `VIEW_UNAVAILABLE` after a good document, keeps the last good
 * document on screen with a "connection lost" banner (design §5.9).
 */
function usePoll<T extends Checked>(load: () => Promise<T>, key: string) {
  const [value, setValue] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const last = useRef<T | undefined>(undefined);
  useEffect(() => {
    setValue(undefined);
    setError(undefined);
    last.current = undefined;
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const next = await load();
        if (stopped) return;
        if (!next.ok && next.code === 'VIEW_UNAVAILABLE' && last.current?.ok) {
          setError(next.message);
          return;
        }
        last.current = next;
        setValue(next);
        setError(undefined);
      } catch (err) {
        if (!stopped) setError((err as Error).message);
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // `key` names the polled document; `load` is recreated on every render.
  }, [key]);
  return { value, error };
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
  const { value, error } = usePoll<WorkDetailCheck>(() => source.loadWork!(id), 'work:' + id);
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
          {error ? <Note bad>{t.app.connectionLost(error)}</Note> : null}
          {value.newerRevision ? <Note>{t.app.newerRevision}</Note> : null}
          <WorkDetail detail={value.detail} now={Date.now()} lang={lang} workHref={workHash} />
        </>
      )}
    </>
  );
}

function App() {
  const route = useRoute();
  const { value: check, error } = usePoll<ViewCheck>(() => source.load(), 'view');
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
        {error ? <Note bad>{t.app.connectionLost(error)}</Note> : null}
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
    };
    if (typeof h.version === 'string') uiVersion = h.version;
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
