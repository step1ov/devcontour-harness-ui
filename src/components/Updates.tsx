// Updates of the harness and the panel (view revision 4, harness
// 0.1.0-alpha.60 `updates`): a banner «Доступна … — что нового · как
// обновить» with the harness command, and a read-only Settings section with
// the mode. The panel installs nothing and asks no registry: it shows the
// harness's last saved check (`harness update --check`).

import { dict, label, type Lang } from '../model/dict.ts';
import { formatWhen } from '../model/i18n.ts';
import type { UpdatesView } from '../model/view.ts';
import { Alert } from './ui/alert.tsx';

/** States in which the banner is shown: something can be installed or needs the owner. */
export const UPDATE_BANNER_STATES: ReadonlySet<string> = new Set(['available', 'needs-decision']);

function WhatsNew({ u, lang }: { u: UpdatesView; lang: Lang }) {
  const r = dict(lang).r4;
  return (
    <>
      {u.whatsNew?.length ? (
        <details className="hui-term" data-testid="updates-whats-new">
          <summary>{r.whatsNew}</summary>
          <ul className="hui:mt-1 hui:grid hui:list-disc hui:gap-1 hui:ps-5">
            {u.whatsNew.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {u.command ? (
        <details className="hui-term" data-testid="updates-how">
          <summary>{r.howToUpdate}</summary>
          <p>
            <code className="hui:break-all">{u.command}</code>
          </p>
          <p className="hui-muted">{r.updateNote}</p>
        </details>
      ) : null}
    </>
  );
}

/** The banner; nothing when the view has no `updates` or nothing to install. */
export function UpdatesBanner({ updates, lang = 'ru' }: { updates?: UpdatesView; lang?: Lang }) {
  if (!updates || !UPDATE_BANNER_STATES.has(String(updates.state)) || !updates.line.trim())
    return null;
  return (
    <Alert
      tone={updates.state === 'needs-decision' ? 'warn' : 'info'}
      data-testid="updates-banner"
      className="hui-updates"
    >
      <p className="hui:font-medium">{updates.line}</p>
      <div className="hui:flex hui:flex-wrap hui:gap-x-4">
        <WhatsNew u={updates} lang={lang} />
      </div>
    </Alert>
  );
}

/** Settings «Обновления»: what is installed, the last check and the mode, read-only. */
export function UpdatesSection({
  updates,
  lang = 'ru',
  timeZone,
  now,
}: {
  updates: UpdatesView;
  lang?: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  const t = dict(lang);
  const r = t.r4;
  const when = updates.checkedAt ? formatWhen(updates.checkedAt, lang, timeZone, now) : undefined;
  return (
    <div className="hui:grid hui:gap-2 hui:text-sm" data-testid="updates-settings">
      <dl className="hui-grid hui-stats">
        <div>
          <dt>{r.updatesMode}</dt>
          <dd data-testid="updates-mode">{label(r.mode, String(updates.mode))}</dd>
        </div>
        <div>
          <dt>{r.updatesState}</dt>
          <dd>
            {label(r.state, String(updates.state))}
            {'; '}
            {when ? r.checkedAt(when) : r.notCheckedYet}
          </dd>
        </div>
      </dl>
      <p>{r.current(updates.current.harness, updates.current.ui)}</p>
      {updates.available ? (
        <p>{r.available(updates.available.harness, updates.available.ui)}</p>
      ) : null}
      {updates.line.trim() ? <p className="hui-muted">{updates.line}</p> : null}
      <WhatsNew u={updates} lang={lang} />
      <p className="hui-muted">{r.updatesModeNote}</p>
    </div>
  );
}
