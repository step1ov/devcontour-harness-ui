// Health screen in plain words, with the code beside: controller, stalled
// and quiet attempts, environment failures, budgets, drift after acceptance,
// harness warnings and versions. "Not checked" is never shown as zero drift.

import { dict, label } from '../model/dict.ts';
import { formatDuration, formatUsd, formatWindow, usd } from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import type { OperatorView } from '../model/view.ts';
import { Clipped, Codes, Heading, WorkRef, clockOf, type ScreenProps } from './common.tsx';
import { DriftLine } from './WorkDetail.tsx';

export interface HealthProps extends ScreenProps {
  view: OperatorView;
  /** Version of the panel package, shown beside the harness version. */
  uiVersion?: string;
}

export function Health({
  view,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
  uiVersion,
}: HealthProps) {
  const t = dict(lang);
  const v = t.health;
  const h = view.health;
  const links = { onOpenWork, workHref };
  const windowText = formatWindow(instantMs(view.history.to) - instantMs(view.history.from), lang);
  const troubled = view.works.filter((w) => w.liveness === 'stalled' || w.liveness === 'quiet');
  return (
    <section className="hui hui-health" aria-labelledby="hui-health-title" lang={lang}>
      <Heading t={t} level={2} id="hui-health-title" term="controller">
        {v.label}
      </Heading>
      <div className="hui-panel" data-testid="health-machine">
        <ul className="hui-list">
          <li className={h.controller.present ? '' : 'hui-bad'} data-testid="health-controller">
            {h.controller.present
              ? v.controllerOn(
                  h.controller.leaseUntil
                    ? clockOf(h.controller.leaseUntil, t, timeZone, now)
                    : undefined,
                )
              : v.controllerOff}
          </li>
          <li className={h.stalledAttempts ? 'hui-bad' : ''} data-testid="health-stalled">
            {h.stalledAttempts ? v.stalled(h.stalledAttempts) : v.stalledNone}{' '}
            {v.quiet(h.quietAttempts)}
          </li>
          <li data-testid="health-env">{v.envFailures(h.environmentFailures, windowText)}</li>
        </ul>
        {troubled.length ? (
          <>
            <h3 className="hui-minor">{v.stalledWorks}</h3>
            <ul className="hui-list">
              {troubled.map((w) => (
                <li key={w.id}>
                  <WorkRef id={w.id} {...links} /> — {label(t.liveness, w.liveness!)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="health-budgets">
        <Heading t={t} term="lowerBound">
          {v.budgets}
        </Heading>
        {h.budgets.length ? (
          <ul className="hui-list">
            {h.budgets.map((b, i) => (
              <li key={i} className={b.state === 'within' ? '' : 'hui-bad'}>
                {v.budgetRow(
                  label(t.budgetScope, b.scope) + (b.id ? ` ${b.id}` : ''),
                  formatUsd(b.spentUsd, lang),
                  b.limitUsd !== undefined ? usd(b.limitUsd) : undefined,
                  label(t.budgetState, b.state),
                  b.spentMs !== undefined || b.limitMs !== undefined
                    ? v.timeOf(
                        b.spentMs !== undefined ? formatDuration(b.spentMs, lang) : t.unknown,
                        b.limitMs !== undefined ? formatDuration(b.limitMs, lang) : undefined,
                      )
                    : undefined,
                )}
              </li>
            ))}
          </ul>
        ) : h.budgeting === 'off' ? (
          <p>{v.budgetingOff(formatUsd(h.spentTotalUsd, lang))}</p>
        ) : (
          <p>
            {t.overview.budgetUnknown}; {t.overview.spent(formatUsd(h.spentTotalUsd, lang))}
          </p>
        )}
        {h.budgets.length ? (
          <p className="hui-muted">{v.spentTotal(formatUsd(h.spentTotalUsd, lang))}</p>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="health-drift">
        <Heading t={t} term="drift">
          {v.drift}
        </Heading>
        <p>{v.driftCounts(h.drift.drifted, h.drift.unavailable, h.drift.checked)}</p>
        {view.drift.length ? (
          <ul className="hui-list">
            {view.drift.map((d) => (
              <li key={d.workId + d.ref}>
                <WorkRef id={d.workId} {...links} /> <DriftLine d={d} t={t} />
              </li>
            ))}
          </ul>
        ) : null}
        <Clipped n={view.truncated?.drift} t={t} />
      </div>

      <div className="hui-panel" data-testid="health-warnings">
        <Heading t={t} term="unknown">
          {v.warnings}
        </Heading>
        {h.warnings.length ? (
          <ul className="hui-list">
            {h.warnings.map((w, i) => (
              <li key={i}>
                {w.message} <Codes t={t} codes={[w.code]} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hui-muted">{v.noWarnings}</p>
        )}
        <Clipped n={view.truncated?.warnings} t={t} />
      </div>

      <div className="hui-panel" data-testid="health-versions">
        <h3 className="hui-subtitle">{v.versions}</h3>
        <ul className="hui-list">
          <li>{v.harness(view.source.producer, view.source.producerVersion)}</li>
          <li>{v.ui(uiVersion)}</li>
          <li>{v.view(view.viewVersion, view.viewRevision)}</li>
          <li>{v.state(view.source.stateVersion)}</li>
        </ul>
      </div>
    </section>
  );
}
