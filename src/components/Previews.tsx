// «Посмотреть результат» (`previews[]`, harness 0.1.0-alpha.66): links to the
// previews the harness runs on this machine (`harness preview-start`) — what
// each shows, since when and when it stops by itself — and the commands to
// start and stop one. The panel is read-only (no write endpoint): a person
// or the lead runs the commands. Only the harness's own loopback address is
// linked; the panel never makes up a port.

import { dict, type Lang } from '../model/dict.ts';
import { workName } from '../model/steps.ts';
import type { OperatorView } from '../model/view.ts';
import { Block, WorkRef, clockOf, type ScreenProps } from './common.tsx';

/** The only address the harness gives a preview: `http://127.0.0.1:<port>/`. */
const LOOPBACK = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/$/;

/** The preview address when it is the harness's loopback form, else `undefined` (shown as text). */
export function previewHref(url: string): string | undefined {
  const m = LOOPBACK.exec(url);
  if (!m) return undefined;
  const port = Number(m[1]);
  return port > 0 && port < 65536 ? url : undefined;
}

export function PreviewsPanel({
  view,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
}: {
  view: OperatorView;
  lang?: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
} & Pick<ScreenProps, 'onOpenWork' | 'workHref'>) {
  const t = dict(lang);
  const k = t.r6;
  const list = view.previews ?? [];
  // Before harness 0.1.0-alpha.66 there are no previews at all: no panel.
  if (!list.length && view.viewRevision < 6) return null;
  const links = { onOpenWork, workHref };
  return (
    <Block t={t} title={k.previewsTitle} testid="previews">
      <p className="hui-muted">{k.previewsIntro}</p>
      {list.length ? (
        <ul className="hui-list">
          {list.map((p) => {
            const href = previewHref(p.url);
            const what = p.title ?? p.repositoryId;
            return (
              <li key={p.id} className="hui-item" data-testid="preview">
                <div className="hui:flex hui:flex-wrap hui:items-baseline hui:gap-x-2">
                  {href ? (
                    <a
                      className="hui-link hui:font-medium"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {k.previewOpen(what)}
                    </a>
                  ) : (
                    <strong>{what}</strong>
                  )}
                  <code>{p.url}</code>
                </div>
                <div className="hui-muted">
                  {k.previewWhat(p.ref, p.sha.slice(0, 7))}
                  {p.workId ? (
                    <>
                      {' · '}
                      <WorkRef id={p.workId} {...links}>
                        {workName(view, p.workId)}
                      </WorkRef>
                    </>
                  ) : null}
                </div>
                <div className="hui-muted">
                  {k.previewSince(clockOf(p.startedAt, t, timeZone, now))} ·{' '}
                  {k.previewUntil(clockOf(p.expiresAt, t, timeZone, now))}
                </div>
                <div className="hui:text-sm">
                  {k.previewStop}{' '}
                  <code data-testid="preview-stop">
                    {`npx harness preview-stop --state ${k.stateDir} --preview ${p.id}`}
                  </code>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p data-testid="preview-none">{k.previewNone}</p>
      )}
      {view.truncated?.previews ? (
        <p className="hui-muted">{k.previewsClipped(view.truncated.previews)}</p>
      ) : null}
      <p className="hui:text-sm">
        {k.previewStart}{' '}
        <code data-testid="preview-start">
          {`npx harness preview-start --state ${k.stateDir} --ref accepted`}
        </code>
      </p>
    </Block>
  );
}
