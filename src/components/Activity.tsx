// "Who did what" screen (`activity[]`, P2): harness events, newest first,
// filtered by work and by actor. These are harness events, not an agent's
// retelling. Without `activity` the producer keeps no feed: the screen says
// so and never reads it as "nothing happened".

import { dict, label } from '../model/dict.ts';
import type { OperatorView } from '../model/view.ts';
import { Clipped, Heading, WorkRef, actorLabel, clockOf, type ScreenProps } from './common.tsx';

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
  const all = view.activity;
  const shown = (all ?? []).filter(
    (e) =>
      (filter.workId === undefined || e.workId === filter.workId) &&
      (filter.actor === undefined || e.actor === filter.actor),
  );
  const works = [...new Set((all ?? []).map((e) => e.workId).filter((x): x is string => !!x))];
  const actors = [...new Set((all ?? []).map((e) => String(e.actor)))];
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
      <Heading t={t} term="lead" level={2} id="hui-activity-title">
        {v.label}
      </Heading>
      {all === undefined ? (
        <p className="hui-panel" data-testid="activity-missing">
          {t.noDataInHarness}: {v.missing}
        </p>
      ) : (
        <div className="hui-panel" data-testid="activity-feed">
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
          {shown.length === 0 ? (
            <p className="hui-muted">{v.none}</p>
          ) : (
            <ol className="hui-list hui-feed">
              {shown.map((e, i) => (
                <li key={i} className="hui-item">
                  <span className="hui-muted">{clockOf(e.at, t, timeZone, now)}</span>{' '}
                  <strong>{actorLabel(t, e.actor)}</strong> {e.plain}{' '}
                  {e.workId ? <WorkRef id={e.workId} {...links} /> : null}{' '}
                  <code className="hui-muted hui-code">{e.action}</code>
                </li>
              ))}
            </ol>
          )}
          <Clipped n={view.truncated?.activity} t={t} />
        </div>
      )}
    </section>
  );
}
