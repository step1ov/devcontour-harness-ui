// «Что задействовано» (`resources`, view revision 6, harness 0.1.0-alpha.66):
// which models and vendors work, how they are isolated, the pinned tools,
// the dependency store, the services (docker containers and lifecycle
// commands) and the checks — every line in the harness's plain words. The
// counts of a service are the harness's numbers. Pure render.

import { dict, type Lang } from '../model/dict.ts';
import type { OperatorView } from '../model/view.ts';
import { Badge } from './ui/badge.tsx';
import { Block, clockOf } from './common.tsx';

export function ResourcesPanel({
  view,
  lang = 'ru',
  timeZone,
  now,
}: {
  view: OperatorView;
  lang?: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  const t = dict(lang);
  const k = t.r6;
  const r = view.resources;
  if (!r) {
    // Revision 6 drops the section first when the document is too big: say so, not «nothing».
    return view.truncated?.resources ? (
      <Block t={t} title={k.resourcesTitle} testid="resources">
        <p className="hui-muted">{k.resourcesClipped}</p>
      </Block>
    ) : null;
  }
  const clipped = (n: number | undefined) =>
    n ? <p className="hui-muted">{k.resourcesListClipped(n)}</p> : null;
  return (
    <Block t={t} title={k.resourcesTitle} testid="resources">
      {r.lines.length ? (
        <ul
          className="hui:grid hui:list-disc hui:gap-1 hui:ps-5 hui:text-sm"
          data-testid="resources-lines"
        >
          {r.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      <details className="hui-term" data-testid="resources-more">
        <summary>{k.resourcesMore}</summary>
        <div className="hui:mt-2 hui:grid hui:gap-3 hui:text-sm">
          <div>
            <h4 className="hui:font-semibold">{k.resourcesRoles}</h4>
            <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-1">
              {r.roles.map((x, i) => (
                <li key={i} data-kind={x.kind}>
                  {x.line}
                </li>
              ))}
            </ul>
            {clipped(r.truncated?.roles)}
          </div>
          <div>
            <h4 className="hui:font-semibold">{k.resourcesIsolation}</h4>
            <p>{r.isolation.line}</p>
          </div>
          <div>
            <h4 className="hui:font-semibold">{k.resourcesTools}</h4>
            <p>{r.toolchain.line}</p>
            {clipped(r.truncated?.tools)}
          </div>
          <div>
            <h4 className="hui:font-semibold">{k.resourcesStore}</h4>
            <p>{r.dependencyStore.line}</p>
          </div>
          <div data-testid="resources-services">
            <h4 className="hui:font-semibold">{k.resourcesServices}</h4>
            {r.services.length ? (
              <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-2">
                {r.services.map((x, i) => (
                  <li key={i} className="hui:grid hui:gap-0.5">
                    <span className="hui:flex hui:flex-wrap hui:items-center hui:gap-2">
                      <strong>{x.name}</strong>
                      {x.engine ? <Badge tone="outline">{x.engine}</Badge> : null}
                      <span className="hui-muted">
                        {k.serviceCounts(x.running, x.stopped, x.leftover)}
                        {x.since && x.running ? ` · ${clockOf(x.since, t, timeZone, now)}` : ''}
                      </span>
                    </span>
                    <span>{x.line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hui-muted">{k.resourcesNoServices}</p>
            )}
            {clipped(r.truncated?.services)}
          </div>
          <div>
            <h4 className="hui:font-semibold">{k.resourcesGates}</h4>
            <p>{r.gates.line}</p>
          </div>
        </div>
      </details>
    </Block>
  );
}
