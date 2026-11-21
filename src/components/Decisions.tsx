// Decisions screen (`decisions[]`, P2): temporary decisions first with their
// revisit condition, then every decision with who took it, when and why.
// Without `decisions` the producer does not report them: the screen says so
// and never shows an empty list as "no decisions".

import { dict, label, type Dict } from '../model/dict.ts';
import type { DecisionView, OperatorView } from '../model/view.ts';
import { Clipped, Heading, WorkRef, actorLabel, clockOf, type ScreenProps } from './common.tsx';
import { hasOverview, SetupScreen } from './Setup.tsx';

export interface DecisionsProps extends ScreenProps {
  view: OperatorView;
}

function DecisionItem({
  d,
  t,
  links,
  timeZone,
  now,
}: {
  d: DecisionView;
  t: Dict;
  links: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  timeZone?: string;
  now?: number;
}) {
  const v = t.decisions;
  const about = [d.findingId, d.requestId, d.subject].filter(Boolean).join(', ');
  return (
    <li className="hui-item" data-testid={`decision-${d.id}`}>
      <span className="hui-muted">{clockOf(d.at, t, timeZone, now)}</span>{' '}
      <strong>{label(v.kind, d.kind)}</strong>
      {about ? (
        <>
          {' '}
          {v.about} <code>{about}</code>
        </>
      ) : null}
      {d.workId ? (
        <>
          {' '}
          (<WorkRef id={d.workId} {...links} />)
        </>
      ) : null}
      {' · '}
      <span className="hui-who">{v.by(actorLabel(t, d.by))}</span>
      {d.title ? <div>{d.title}</div> : null}
      <div className="hui-muted">{d.reason ? v.reason(d.reason) : v.reasonMissing}</div>
      {d.temporary ? (
        <div className="hui-warn-text">{d.revisit ? v.revisit(d.revisit) : v.revisitUnknown}</div>
      ) : null}
    </li>
  );
}

export function Decisions({
  view,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
}: DecisionsProps) {
  const t = dict(lang);
  // A document without the overview lists (revision 5 setup): the setup state, not a throw.
  if (!hasOverview(view)) return <SetupScreen view={view} lang={lang} />;
  const v = t.decisions;
  const links = { onOpenWork, workHref };
  const item = (d: DecisionView) => (
    <DecisionItem
      key={d.id}
      d={d}
      t={t}
      links={links}
      {...(timeZone ? { timeZone } : {})}
      {...(now !== undefined ? { now } : {})}
    />
  );
  return (
    <section className="hui hui-decisions" aria-labelledby="hui-decisions-title" lang={lang}>
      <Heading t={t} term="temporary" level={2} id="hui-decisions-title">
        {v.label}
      </Heading>
      {view.decisions === undefined ? (
        <p className="hui-panel" data-testid="decisions-missing">
          {t.noDataInHarness}: {v.missing}
        </p>
      ) : (
        <>
          <div className="hui-panel" data-testid="decisions-temporary">
            <Heading t={t} term="temporary">
              {v.temporary(view.decisions.filter((d) => d.temporary).length)}
            </Heading>
            {view.decisions.some((d) => d.temporary) ? (
              <ul className="hui-list">{view.decisions.filter((d) => d.temporary).map(item)}</ul>
            ) : (
              <p className="hui-muted">{v.noTemporary}</p>
            )}
          </div>
          <div className="hui-panel" data-testid="decisions-all">
            <Heading t={t} term="technical">
              {v.all(view.decisions.length)}
            </Heading>
            {view.decisions.length ? (
              <ul className="hui-list">{view.decisions.map(item)}</ul>
            ) : (
              <p className="hui-muted">{v.none}</p>
            )}
            <Clipped n={view.truncated?.decisions} t={t} />
          </div>
        </>
      )}
    </section>
  );
}
