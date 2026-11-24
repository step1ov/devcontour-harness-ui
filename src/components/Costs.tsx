// «Расход» (view revision 10, harness 0.1.0-alpha.70): what the current
// release and the whole install cost, by role and by model with its vendor,
// and, folded, by work and attempt. Every sum is the harness's `costs`; the
// panel adds nothing up. A sum with calls without a price is a lower bound
// and reads «не меньше $X» — never an exact-looking figure; a sum of only
// unpriced calls reads «цена неизвестна», never $0.00.

import { dict, knownLabel, type Lang } from '../model/dict.ts';
import { workName } from '../model/steps.ts';
import { costsOf, isLowerBound, type CostAmountView } from '../model/revision10.ts';
import type { OperatorView } from '../model/view.ts';
import { Block, WorkRef, clockOf, type ScreenProps } from './common.tsx';

/** A cost in words: `$1.25`, `не меньше $3.75`, `< $0.01`, `цена неизвестна`. */
export function costText(a: Pick<CostAmountView, 'usd' | 'bound'>, lang: Lang = 'ru'): string {
  const r = dict(lang).r12;
  const lower = isLowerBound(a);
  if (!Number.isFinite(a.usd) || a.usd < 0) return dict(lang).usdUnknown;
  if (a.usd === 0 && lower) return r.priceUnknown;
  const amount = a.usd > 0 && a.usd < 0.005 ? r.belowCent : '$' + a.usd.toFixed(2);
  return lower ? r.atLeast(amount) : amount;
}

function Amount({ a, lang }: { a: CostAmountView; lang: Lang }) {
  return (
    <span data-bound={a.bound} className={isLowerBound(a) ? 'hui-cost-lower' : undefined}>
      {costText(a, lang)}
    </span>
  );
}

export function CostsPanel({
  view,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
}: Pick<ScreenProps, 'onOpenWork' | 'workHref'> & {
  view: Pick<OperatorView, 'costs' | 'works'>;
  lang?: Lang;
  timeZone?: string;
  now?: number;
}) {
  const costs = costsOf(view);
  if (!costs) return null;
  const t = dict(lang);
  const r = t.r12;
  const links = { onOpenWork, workHref };
  const anyLower =
    isLowerBound(costs.total) ||
    isLowerBound(costs.release) ||
    costs.byRole.some(isLowerBound) ||
    costs.byModel.some(isLowerBound);
  const row = (key: string, name: string, a: CostAmountView) => (
    <li key={key} className="hui-cost-row" data-bound={a.bound}>
      <span className="hui:min-w-0 hui:break-words">{name}</span>
      <span className="hui:text-end hui:whitespace-nowrap">
        <Amount a={a} lang={lang} />
        <span className="hui-muted"> · {r.costCalls(a.calls)}</span>
      </span>
    </li>
  );
  return (
    <Block t={t} title={r.costsTitle} testid="costs" term="lowerBound">
      {costs.total.calls === 0 ? (
        <p className="hui-muted" data-testid="costs-none">
          {r.costsNone}
        </p>
      ) : (
        <div className="hui:grid hui:gap-3">
          <dl className="hui-grid hui-stats hui-cost-totals">
            <div data-testid="costs-release">
              <dt>{r.costsRelease}</dt>
              <dd className="hui:text-lg hui:font-semibold">
                <Amount a={costs.release} lang={lang} />
              </dd>
              <dd className="hui-muted hui:text-xs">
                {r.costCalls(costs.release.calls)} ·{' '}
                {costs.release.since
                  ? r.costsSince(clockOf(costs.release.since, t, timeZone, now))
                  : r.costsAllCalls}
              </dd>
            </div>
            <div data-testid="costs-total">
              <dt>{r.costsTotal}</dt>
              <dd className="hui:text-lg hui:font-semibold">
                <Amount a={costs.total} lang={lang} />
              </dd>
              <dd className="hui-muted hui:text-xs">{r.costCalls(costs.total.calls)}</dd>
            </div>
          </dl>
          {anyLower ? (
            <p className="hui:text-sm" data-testid="costs-lower" data-status="warn">
              {r.unpriced}
            </p>
          ) : null}
          <div className="hui:grid hui:gap-3 hui:sm:grid-cols-2">
            {costs.byRole.length ? (
              <section data-testid="costs-by-role" aria-label={r.costsByRole}>
                <h4 className="hui:text-sm hui:font-semibold">{r.costsByRole}</h4>
                <ul className="hui-cost-list">
                  {costs.byRole.map((x) =>
                    row(x.role, knownLabel(r.costRole, x.role) ?? x.role, x),
                  )}
                </ul>
              </section>
            ) : null}
            {costs.byModel.length ? (
              <section data-testid="costs-by-model" aria-label={r.costsByModel}>
                <h4 className="hui:text-sm hui:font-semibold">{r.costsByModel}</h4>
                <ul className="hui-cost-list">
                  {costs.byModel.map((x) =>
                    row(`${x.runtime}\u0000${x.model}`, r.costModel(x.model, x.vendor), x),
                  )}
                </ul>
              </section>
            ) : null}
          </div>
          {costs.byWork.length ? (
            <details className="hui-term" data-testid="costs-by-work">
              <summary>{r.costsByWork(costs.byWork.length)}</summary>
              <ul className="hui-cost-list hui:mt-1">
                {costs.byWork.map((w) => (
                  <li key={w.workId} className="hui:grid hui:gap-0.5" data-testid="cost-work">
                    <span className="hui-cost-row">
                      <WorkRef id={w.workId} {...links}>
                        {workName(view, w.workId)}
                      </WorkRef>
                      <span className="hui:text-end hui:whitespace-nowrap">
                        <Amount a={w} lang={lang} />
                        <span className="hui-muted"> · {r.costCalls(w.calls)}</span>
                      </span>
                    </span>
                    {w.attempts.length ? (
                      <span className="hui-muted hui:text-xs">
                        {w.attempts
                          .map((x) => `${r.costAttempt(x.attempt)} — ${costText(x, lang)}`)
                          .join(', ')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </Block>
  );
}
