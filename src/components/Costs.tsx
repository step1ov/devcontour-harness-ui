// «Расход» (view revision 10, harness 0.1.0-alpha.70): what the current
// release and the whole install cost, by role and by model with its vendor,
// and, folded, by work and attempt. Every sum is the harness's `costs`; the
// panel adds nothing up. A sum with calls without a price is a lower bound
// and reads «не меньше $X» with «без цены: N вызовов» — never an
// exact-looking figure; a sum of only unpriced calls reads «цена
// неизвестна», never $0.00. Lists the harness cut say «ещё N».

import { dict, knownLabel, type Dict, type Lang } from '../model/dict.ts';
import { workName } from '../model/steps.ts';
import {
  costsOf,
  isLowerBound,
  type AttemptCostView,
  type CostAmountView,
  type WorkCostView,
} from '../model/revision10.ts';
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

/** «3 вызова» and, when some have no price, «· без цены: 1 вызов». */
export function callsText(a: Pick<CostAmountView, 'calls' | 'unpricedCalls'>, t: Dict): string {
  const r = t.r12;
  return (
    r.costCalls(a.calls) + (a.unpricedCalls > 0 ? ` · ${r.unpricedCalls(a.unpricedCalls)}` : '')
  );
}

/** One attempt's spend: «попытка 1 — $2.50». */
export const attemptCostText = (x: AttemptCostView, lang: Lang) =>
  `${dict(lang).r12.costAttempt(x.attempt)} — ${costText(x, lang)}`;

function Amount({ a, lang }: { a: CostAmountView; lang: Lang }) {
  return (
    <span data-bound={a.bound} className={isLowerBound(a) ? 'hui-cost-lower' : undefined}>
      {costText(a, lang)}
    </span>
  );
}

function Row({ name, a, t, lang }: { name: string; a: CostAmountView; t: Dict; lang: Lang }) {
  return (
    <li className="hui-cost-row" data-bound={a.bound}>
      <span className="hui:min-w-0 hui:break-words">{name}</span>
      <span className="hui:text-end">
        <Amount a={a} lang={lang} />
        <span className="hui-muted"> · {callsText(a, t)}</span>
      </span>
    </li>
  );
}

const More = ({ testid, text }: { testid: string; text: string }) => (
  <li className="hui-muted hui:text-xs" data-testid={testid}>
    {text}
  </li>
);

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
  const release = costs.release;
  const releaseScope = release.sinceRelease
    ? release.since
      ? r.costsSince(clockOf(release.since, t, timeZone, now))
      : r.costsAfterRelease
    : r.costsAllCalls;
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
                <Amount a={release} lang={lang} />
              </dd>
              <dd className="hui-muted hui:text-xs">
                {callsText(release, t)} · {releaseScope}
              </dd>
            </div>
            <div data-testid="costs-total">
              <dt>{r.costsTotal}</dt>
              <dd className="hui:text-lg hui:font-semibold">
                <Amount a={costs.total} lang={lang} />
              </dd>
              <dd className="hui-muted hui:text-xs">{callsText(costs.total, t)}</dd>
            </div>
          </dl>
          {costs.total.unpricedCalls > 0 ? (
            <p className="hui:text-sm" data-testid="costs-lower" data-status="warn">
              {r.unpricedNote(costs.total.unpricedCalls)}
            </p>
          ) : null}
          <div className="hui:grid hui:gap-3 hui:sm:grid-cols-2">
            {costs.byRole.length ? (
              <section data-testid="costs-by-role" aria-label={r.costsByRole}>
                <h4 className="hui:text-sm hui:font-semibold">{r.costsByRole}</h4>
                <ul className="hui-cost-list">
                  {costs.byRole.map((x) => (
                    <Row
                      key={x.role}
                      name={knownLabel(r.costRole, x.role) ?? x.role}
                      a={x}
                      t={t}
                      lang={lang}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {costs.byModel.length ? (
              <section data-testid="costs-by-model" aria-label={r.costsByModel}>
                <h4 className="hui:text-sm hui:font-semibold">{r.costsByModel}</h4>
                <ul className="hui-cost-list">
                  {costs.byModel.map((x) => (
                    <Row
                      key={`${x.runtime}\u0000${x.model}`}
                      name={r.costModel(x.model, x.vendor)}
                      a={x}
                      t={t}
                      lang={lang}
                    />
                  ))}
                  {costs.byModelTruncated > 0 ? (
                    <More testid="costs-models-more" text={r.moreModels(costs.byModelTruncated)} />
                  ) : null}
                </ul>
              </section>
            ) : null}
          </div>
          {costs.byWork.length ? (
            <details className="hui-term" data-testid="costs-by-work">
              <summary>{r.costsByWork(costs.byWork.length + costs.byWorkTruncated)}</summary>
              <ul className="hui-cost-list hui:mt-1">
                {costs.byWork.map((w) => (
                  <li key={w.workId} className="hui:grid hui:gap-0.5" data-testid="cost-work">
                    <span className="hui-cost-row">
                      <WorkRef id={w.workId} {...links}>
                        {workName(view, w.workId)}
                      </WorkRef>
                      <span className="hui:text-end">
                        <Amount a={w} lang={lang} />
                        <span className="hui-muted"> · {callsText(w, t)}</span>
                      </span>
                    </span>
                    {w.attempts.length || w.attemptsTruncated ? (
                      <span className="hui-muted hui:text-xs">
                        {/* The harness keeps the latest attempts: the earlier ones come first. */}
                        {[
                          ...(w.attemptsTruncated > 0 ? [r.moreAttempts(w.attemptsTruncated)] : []),
                          ...w.attempts.map((x) => attemptCostText(x, lang)),
                        ].join(', ')}
                      </span>
                    ) : null}
                  </li>
                ))}
                {costs.byWorkTruncated > 0 ? (
                  <More testid="costs-works-more" text={r.moreWorks(costs.byWorkTruncated)} />
                ) : null}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </Block>
  );
}

/**
 * «Расход по попыткам» in the work detail (revision 10, `works[].cost`):
 * the work's total and each attempt, earlier ones over the limit as «ещё N».
 */
export function WorkCost({ cost, lang = 'ru' }: { cost: WorkCostView; lang?: Lang }) {
  const t = dict(lang);
  const r = t.r12;
  return (
    <div className="hui:grid hui:gap-1" data-testid="work-cost">
      <h4 className="hui:text-sm hui:font-semibold">{r.workCostTitle}</h4>
      <p className="hui:m-0 hui:text-sm" data-testid="work-cost-total">
        {r.workCostTotal(costText(cost, lang), callsText(cost, t))}
      </p>
      {cost.byAttempt.length || cost.byAttemptTruncated ? (
        <ul className="hui-cost-list">
          {cost.byAttemptTruncated > 0 ? (
            <More testid="work-cost-more" text={r.moreAttempts(cost.byAttemptTruncated)} />
          ) : null}
          {cost.byAttempt.map((x) => (
            <Row key={x.runId} name={r.costAttempt(x.attempt)} a={x} t={t} lang={lang} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
