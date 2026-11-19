// Standalone app: polls the local CLI's /api/view (relative URL, same origin)
// and renders the components. Read-only; no third-party requests.

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Overview } from '../components/Overview.tsx';
import { httpViewSource, pickLang, type ViewCheck } from '../model/index.ts';
import '../components/styles.css';
import './app.css';

const POLL_MS = 5000;
// `?lang=ru|en` wins; an empty or unknown value falls back to the browser locale.
const lang = pickLang(new URLSearchParams(window.location.search).get('lang'), [
  ...(navigator.languages ?? []),
  navigator.language,
]);
// The UI language goes to the view source too: the harness writes the plain
// strings (`plain`, `line`, warnings) in it (`harness view --lang`).
const source = httpViewSource(new URL('./', window.location.href).toString(), fetch, { lang });

function App() {
  const [check, setCheck] = useState<ViewCheck | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const next = await source.load();
        if (!stopped) {
          setCheck(next);
          setError(undefined);
        }
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
  }, []);
  if (!check) return <p className="app-note">{error ?? 'Loading the harness view…'}</p>;
  if (!check.ok) return <p className="app-note app-bad">{check.message}</p>;
  return (
    <>
      {error ? (
        <p className="app-note app-bad">Connection lost: {error}. Showing the last view.</p>
      ) : null}
      {check.newerRevision ? (
        <p className="app-note">
          The harness sends newer data than this panel knows; update devcontour-harness-ui for full
          detail.
        </p>
      ) : null}
      <Overview view={check.view} now={Date.now()} lang={lang} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
