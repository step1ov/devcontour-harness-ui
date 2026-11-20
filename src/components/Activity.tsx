// "Who did what" screen (`activity[]`, view revision 2, harness alpha.57):
// harness events of the history window, newest first, filtered by work and
// by actor. The lines are harness events as the harness wrote them, not an
// agent's retelling. A missing `activity` means the producer keeps no feed
// (an older harness) and is never read as "nothing happened"; only `[]` says
// that nothing happened in the window.

import { instantMs } from '../model/compat.ts';
import { dict, label, type GlossaryId } from '../model/dict.ts';
import { formatWindow } from '../model/format.ts';
import { formatWhen } from '../model/i18n.ts';
import type { OperatorView } from '../model/view.ts';
import { Heading, Term, WorkRef, actorLabel, type ScreenProps } from './common.tsx';

export interface ActivityFilter {
  workId?: string;
  actor?: string;
}

export interface ActivityProps extends ScreenProps {
  view: OperatorView;
  filter?: ActivityFilter;
  /** Link of a filter (an anchor); without it the filter choices are not shown. */
  filterHref?: (filter: ActivityFilter) => string;
}

/** Glossary entry of each actor the harness names in the feed. */
const ACTOR_TERM: Readonly<Record<string, GlossaryId>> = {
  controller: 'controller',
  writer: 'writer',
  reviewer: 'review',
  lead: 'lead',
  operator: 'operator',
  host: 'host',
};

export function Activity({
  view,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
  filter = {},
  filterHref,
}: ActivityProps) {
  const t = dict(lang);
  const v = t.activity;
  const links = { onOpenWork, workHref };
  const clock = now ?? instantMs(view.generatedAt);
  const all = view.activity;
  const shown = (all ?? []).filter(
    (e) =>
      (filter.workId === undefined || e.workId === filter.workId) &&
      (filter.actor === undefined || e.actor === filter.actor),
  );
  // Filter choices: the values in the feed, plus the chosen one when the feed lacks it.
  const choices = (xs: (string | undefined)[], current: string | undefined) => {
    const out = [...new Set(xs.filter((x): x is string => !!x))];
    if (current !== undefined && !out.includes(current)) out.push(current);
    return out;
  };
  const works = choices(
    (all ?? []).map((e) => e.workId),
    filter.workId,
  );
  const actors = choices(
    (all ?? []).map((e) => String(e.actor)),
    filter.actor,
  );
  const span = instantMs(view.history.to) - instantMs(view.history.from);
  const windowText = Number.isFinite(span) && span > 0 ? formatWindow(span, lang) : undefined;
  // The glossary names only the actors in the feed, not a chosen filter value.
  const terms = [
    ...new Set(
      (all ?? [])
        .map((e) => String(e.actor))
        .filter((a) => Object.hasOwn(ACTOR_TERM, a))
        .map((a) => ACTOR_TERM[a] as GlossaryId),
    ),
  ];
  const chips = (
    title: string,
    values: string[],
    current: string | undefined,
    make: (x: string | undefined) => ActivityFilter,
    text: (x: string) => string,
  ) =>
    filterHref ? (
      <div className="hui-row hui-filter" role="group" aria-label={title}>
        <span className="hui-muted">{title}:</span>
        {[undefined, ...values].map((x) => (
          <a
            key={x ?? ''}
            className={'hui-chip' + (x === current ? ' hui-chip-on' : '')}
            href={filterHref(make(x))}
            aria-current={x === current ? 'true' : undefined}
          >
            {x === undefined ? v.all : text(x)}
          </a>
        ))}
      </div>
    ) : null;
  return (
    <section className="hui hui-activity" aria-labelledby="hui-activity-title" lang={lang}>
      <Heading t={t} level={2} id="hui-activity-title">
        {v.label}
      </Heading>
      {all === undefined ? (
        <p className="hui-panel" data-testid="activity-missing">
          {v.missing}
        </p>
      ) : (
        <div className="hui-panel" data-testid="activity-feed">
          <p className="hui-muted">{windowText ? v.window(windowText) : v.windowUnknown}</p>
          {chips(
            v.filterWork,
            works,
            filter.workId,
            (x) => ({ ...filter, workId: x }),
            (x) => x,
          )}
          {chips(
            v.filterActor,
            actors,
            filter.actor,
            (x) => ({ ...filter, actor: x }),
            (x) => label(t.actor, x),
          )}
          {all.length !== shown.length ? (
            <p className="hui-muted">{v.shown(shown.length, all.length)}</p>
          ) : null}
          {all.length === 0 ? (
            <p data-testid="activity-none">{v.none(windowText ?? t.unknown)}</p>
          ) : shown.length === 0 ? (
            <p className="hui-muted" data-testid="activity-none-filtered">
              {v.noneFiltered}
            </p>
          ) : (
            <ol className="hui-list hui-feed">
              {shown.map((e, i) => (
                <li key={i} className="hui-item hui-event">
                  <time className="hui-muted hui-when" dateTime={e.at}>
                    {formatWhen(e.at, lang, timeZone, clock) ?? t.unknown}
                  </time>{' '}
                  <span className="hui-badge hui-actor" data-actor={String(e.actor)}>
                    {actorLabel(t, e.actor)}
                  </span>{' '}
                  <span className="hui-plain">{e.plain}</span>{' '}
                  {e.action === 'work.accepted' && e.workId ? (
                    // §5.9: an acceptance names where it is and links to its checks,
                    // even when the harness line was clipped before «локально».
                    <span className="hui-muted" data-status="accepted">
                      {v.accepted}{' '}
                      <WorkRef id={e.workId} suffix="#verification" {...links}>
                        {t.target.seeChecks}
                      </WorkRef>
                    </span>
                  ) : null}{' '}
                  {e.workId ? (
                    <WorkRef id={e.workId} {...links}>
                      <span className="hui-sr">{v.openWork} </span>
                      <code>{e.workId}</code>
                    </WorkRef>
                  ) : null}{' '}
                  <code className="hui-muted hui-code">{e.action}</code>
                </li>
              ))}
            </ol>
          )}
          {view.truncated?.activity ? (
            <p className="hui-muted hui-clipped" data-testid="activity-clipped">
              {v.clipped(view.truncated.activity)}
            </p>
          ) : null}
          {terms.length ? (
            <div className="hui-terms" data-testid="activity-who">
              <span className="hui-muted">{v.who}:</span>
              {terms.map((id) => (
                <Term key={id} id={id} t={t} named />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
