// The lead (view revision 6, harness 0.1.0-alpha.66): a short panel on the
// Overview — is the lead in a session, since when, its last note and the
// release state — and the «Журнал → Ведущий» screen with the whole journal
// (notes and the lead's harness commands, newest first, as the harness
// recorded them). Every sentence is the harness's (`lead.line`,
// `notes[].plain`, `forecast.progress.release.line`); the panel only says
// the state words. Pure render; no fetching, no writes.

import { instantMs } from '../model/compat.ts';
import { dict, knownLabel, type Lang } from '../model/dict.ts';
import { workName } from '../model/steps.ts';
import type { OperatorView } from '../model/view.ts';
import { Badge, type Tone } from './ui/badge.tsx';
import { Block, Codes, Heading, Term, WorkRef, clockOf, type ScreenProps } from './common.tsx';
import { hasOverview, SetupScreen } from './Setup.tsx';

const releaseTone: Record<string, Tone> = {
  'in-work': 'info',
  'code-accepted': 'warn',
  done: 'ok',
};

/** Whether the Overview has a lead panel to show: a lead record or a release state. */
export const hasLeadPanel = (view: OperatorView) =>
  view.lead !== undefined || view.forecast?.progress.release !== undefined;

function SessionLine({
  view,
  lang,
  timeZone,
  now,
}: {
  view: OperatorView;
  lang: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  const t = dict(lang);
  const l = view.lead!;
  return (
    <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-2" data-testid="lead-session">
      <Badge tone={l.active ? 'ok' : 'neutral'} data-testid="lead-active">
        {l.active ? t.r6.leadActive : t.r6.leadInactive}
      </Badge>
      {l.since && !l.endedAt ? (
        <span className="hui:text-sm">{t.r6.leadSince(clockOf(l.since, t, timeZone, now))}</span>
      ) : null}
      {l.endedAt ? (
        <span className="hui:text-sm">{t.r6.leadEnded(clockOf(l.endedAt, t, timeZone, now))}</span>
      ) : l.active && l.until ? (
        <span className="hui:text-xs hui:text-muted-foreground">
          {t.r6.leadUntil(clockOf(l.until, t, timeZone, now))}
        </span>
      ) : null}
    </div>
  );
}

function ReleaseLine({ view, lang }: { view: OperatorView; lang: Lang }) {
  const t = dict(lang);
  const r = view.forecast?.progress.release;
  if (!r) return null;
  return (
    <p className="hui:text-sm" data-testid="lead-release" data-release={r.state}>
      <Badge tone={releaseTone[r.state] ?? 'outline'}>
        {knownLabel(t.r6.releaseState, r.state) ?? r.state}
      </Badge>
      {r.line !== knownLabel(t.r6.releaseState, r.state) ? <> {r.line}</> : null}
    </p>
  );
}

/** The Overview panel: the lead's session, last note and the release state. */
export function LeadSummary({
  view,
  lang = 'ru',
  timeZone,
  now,
  journalHref,
}: {
  view: OperatorView;
  lang?: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
  /** Link to «Журнал → Ведущий»; without it no link is shown. */
  journalHref?: string;
}) {
  const t = dict(lang);
  if (!hasLeadPanel(view)) return null;
  const l = view.lead;
  return (
    <Block t={t} title={t.r6.leadTitle} testid="lead-summary" term="lead">
      {l ? (
        <>
          <SessionLine view={view} lang={lang} timeZone={timeZone} now={now} />
          {l.lastNote ? (
            <p className="hui:text-sm" data-testid="lead-last-note">
              <span className="hui:text-muted-foreground">
                {t.r6.leadLastNote(clockOf(l.lastNote.at, t, timeZone, now))}
              </span>{' '}
              {l.lastNote.plain}
            </p>
          ) : (
            <p className="hui:text-sm" data-testid="lead-line">
              {l.line}
            </p>
          )}
        </>
      ) : (
        <p className="hui-muted">{view.viewRevision >= 6 ? t.r6.leadNone : t.r6.leadOld}</p>
      )}
      <ReleaseLine view={view} lang={lang} />
      {journalHref ? (
        <p>
          <a className="hui-link" href={journalHref}>
            {t.r6.leadOpen}
          </a>
        </p>
      ) : null}
    </Block>
  );
}

export interface LeadJournalProps extends ScreenProps {
  view: OperatorView;
  /** Link to the activity feed filtered by the lead; without it no link is shown. */
  activityHref?: string;
}

/** «Журнал → Ведущий»: the session, the release and the whole journal, newest first. */
export function LeadJournal({
  view,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
  activityHref,
}: LeadJournalProps) {
  const t = dict(lang);
  if (!hasOverview(view)) return <SetupScreen view={view} lang={lang} />;
  const links = { onOpenWork, workHref };
  const clock = now ?? instantMs(view.generatedAt);
  const l = view.lead;
  const release = view.forecast?.progress.release;
  return (
    <section
      className="hui hui-lead hui:grid hui:gap-4"
      aria-labelledby="hui-lead-title"
      lang={lang}
      data-testid="lead-journal"
    >
      <Heading t={t} level={2} id="hui-lead-title" term="lead">
        {t.r6.leadTitle}
      </Heading>
      <p className="hui-muted">{t.r6.leadIntro}</p>
      {l ? (
        <div className="hui-panel hui:grid hui:gap-2">
          <SessionLine view={view} lang={lang} timeZone={timeZone} now={clock} />
          <p data-testid="lead-line">{l.line}</p>
        </div>
      ) : (
        <p className="hui-muted" data-testid="lead-missing">
          {view.viewRevision >= 6 ? t.r6.leadNone : t.r6.leadOld}
        </p>
      )}
      {release ? (
        <div className="hui-panel hui:grid hui:gap-2" data-testid="lead-release-panel">
          <Heading t={t}>{t.r6.releaseTitle}</Heading>
          <ReleaseLine view={view} lang={lang} />
          {release.doneAt ? (
            <p className="hui-muted">
              {t.r6.releaseDoneAt(clockOf(release.doneAt, t, timeZone, clock))}
            </p>
          ) : null}
          {release.summary ? (
            <div data-testid="release-summary">
              <h4 className="hui:text-sm hui:font-semibold">{t.r6.releaseSummary}</h4>
              <p className="hui:whitespace-pre-line hui:text-sm">{release.summary}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {l ? (
        <div className="hui-panel" data-testid="lead-notes">
          <Heading t={t}>
            {t.r6.leadJournal(l.notes.length + (view.truncated?.leadNotes ?? 0))}
          </Heading>
          {l.notes.length === 0 ? (
            <p className="hui-muted">{t.r6.leadJournalEmpty}</p>
          ) : (
            <ul className="hui-list">
              {l.notes.map((n, i) => (
                <li key={i} className="hui-item hui-event" data-kind={n.kind}>
                  <span className="hui-muted">{clockOf(n.at, t, timeZone, clock)}</span>{' '}
                  <Badge tone={n.kind === 'note' ? 'info' : 'outline'}>
                    {knownLabel(t.r6.noteKind, n.kind) ?? n.kind}
                  </Badge>{' '}
                  <span>{n.plain}</span>
                  {n.workId ? (
                    <>
                      {' · '}
                      <WorkRef id={n.workId} {...links}>
                        {workName(view, n.workId)}
                      </WorkRef>
                    </>
                  ) : null}
                  <Codes t={t} codes={[n.action]} />
                </li>
              ))}
            </ul>
          )}
          {view.truncated?.leadNotes ? (
            <p className="hui-muted">{t.r6.leadNotesClipped(view.truncated.leadNotes)}</p>
          ) : null}
        </div>
      ) : null}
      {activityHref ? (
        <p>
          <a className="hui-link" href={activityHref}>
            {t.r6.leadActivity}
          </a>
        </p>
      ) : null}
      <div className="hui-terms">
        <Term id="lead" t={t} named />
      </div>
    </section>
  );
}
