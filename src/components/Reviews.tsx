// Reviews screen: every review subject with its rounds against the cap,
// open and decided findings (with who decided), and escalations that wait
// for the operator. Pure render of an `OperatorView`.

import type { Dict, Lang } from '../model/dict.ts';
import { dict, knownLabel, label } from '../model/dict.ts';
import { formatUsd } from '../model/format.ts';
import type { Escalation, OperatorView, ReviewSubjectView } from '../model/view.ts';
import {
  releaseReviewOf,
  reviewRoundsUnlimited,
  roundsWithoutLimit,
  type ReleaseReviewView,
} from '../model/revision9.ts';
import { isThinMode } from '../model/revision11.ts';
import {
  Clipped,
  Codes,
  Heading,
  WorkRef,
  actorLabel,
  clockOf,
  type ScreenProps,
} from './common.tsx';

export interface ReviewsProps extends ScreenProps {
  view: OperatorView;
  /** Findings start collapsed (narrow screens, design §5.3). */
  collapseFindings?: boolean;
}

const bindingText = (b: { runtime: string; model?: string } | undefined, t: Dict) =>
  b ? [b.runtime, b.model].filter(Boolean).join(' · ') : t.reviews.reviewerUnknown;

/** One review subject as a card: counters, findings with decisions, escalation. */
export function ReviewSubjectCard({
  r,
  lang,
  links,
  collapsed,
  unlimited = false,
  thin = false,
  releaseStatus,
}: {
  r: ReviewSubjectView;
  lang: Lang;
  links: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  collapsed?: boolean;
  /** `settings.thresholds.reviewRoundsUnlimited` (revision 9): plan rounds without a limit. */
  unlimited?: boolean;
  /** Revision 11: thin mode lifts the limit too; the reason names it. */
  thin?: boolean;
  /**
   * Revision 9: the current release acceptance (`forecast.progress.release.review.status`).
   * A release round approved earlier is not the current acceptance when it is stale.
   */
  releaseStatus?: ReleaseReviewView['status'] | undefined;
}) {
  const t = dict(lang);
  const v = t.reviews;
  const earlier =
    r.kind === 'release' &&
    r.approved &&
    releaseStatus !== undefined &&
    releaseStatus !== 'approved';
  return (
    <article className="hui-panel hui-card" data-testid={`review-${r.kind}-${r.subject}`}>
      <div className="hui-row">
        <strong>{label(v.kind, r.kind)}</strong>
        <span
          className={'hui-badge ' + (r.approved && !earlier ? 'hui-ok' : 'hui-warn')}
          data-testid="review-verdict"
        >
          {earlier
            ? t.r11.approvedEarlier(
                knownLabel(t.r11.releaseReview, releaseStatus!) ?? releaseStatus!,
              )
            : r.approved
              ? v.approved
              : v.notApproved}
        </span>
        {r.workId ? <WorkRef id={r.workId} {...links} /> : null}
        {r.sameVendor ? <span className="hui-badge hui-warn">{v.sameVendor}</span> : null}
        <Codes t={t} codes={[r.subject]} />
      </div>
      {r.line ? <p className="hui-muted">{r.line}</p> : null}
      <ul className="hui-facts">
        <li data-testid="review-rounds">
          <RoundsText r={r} t={t} unlimited={unlimited} thin={thin} />
        </li>
        <li>{v.open(r.open.blocking, r.open.notes)}</li>
        <li>{v.acceptedLimits(r.accepted)}</li>
        <li>{v.reviewer(bindingText(r.reviewer, t))}</li>
        <li>
          {formatUsd(r.spend.usd, lang)} · {t.calls(r.spend.calls)}
        </li>
      </ul>
      <details className="hui-findings" open={!collapsed}>
        <summary>{v.findings(r.findings.length)}</summary>
        {r.findings.length === 0 ? (
          <p className="hui-muted">{v.noFindings}</p>
        ) : (
          <ul className="hui-list">
            {r.findings.map((f) => (
              <li key={f.id} className="hui-item" data-testid={`finding-${f.id}`}>
                <span className="hui-badge">{f.severity}</span>{' '}
                <span>{label(v.finding, f.status)}</span>
                {f.rounds !== undefined ? (
                  <span className="hui-muted"> · {v.findingRounds(f.rounds)}</span>
                ) : null}
                {f.disposition ? (
                  <div className="hui-who">
                    {v.decidedBy(
                      label(v.disposition, f.disposition.decision),
                      actorLabel(t, f.disposition.by),
                      f.disposition.round,
                    )}
                  </div>
                ) : null}
                {f.title ? <div className="hui-muted">{f.title}</div> : null}
                <Codes t={t} codes={[f.id]} />
              </li>
            ))}
          </ul>
        )}
      </details>
      {r.escalation ? (
        <p className="hui-escalation" data-status="blocked">
          ⚠ {v.escalation(r.escalation.requestId, r.escalation.findings.join(', '))} (
          {r.escalation.answered ? v.escalationAnswered : v.escalationOpen})
        </p>
      ) : null}
    </article>
  );
}

export function EscalationList({
  items,
  t,
  links,
  timeZone,
  now,
}: {
  items: Escalation[];
  t: Dict;
  links: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  timeZone?: string;
  now?: number;
}) {
  if (!items.length) return <p className="hui-muted">{t.reviews.noEscalations}</p>;
  return (
    <ul className="hui-list">
      {items.map((e, i) => (
        <li key={i} className="hui-item" data-status="blocked">
          {e.workId ? <WorkRef id={e.workId} {...links} /> : null}
          {e.subject ? <code> {e.subject}</code> : null}{' '}
          <span className="hui-who">
            {t.overview.whoActs(actorLabel(t, e.actor), label(t.action, e.action))}
          </span>{' '}
          <span className="hui-muted">({clockOf(e.since, t, timeZone, now)})</span>{' '}
          <Codes t={t} codes={[e.code, e.action]} />
        </li>
      ))}
    </ul>
  );
}

export function Reviews({
  view,
  lang = 'ru',
  onOpenWork,
  workHref,
  timeZone,
  now,
  collapseFindings,
}: ReviewsProps) {
  const t = dict(lang);
  const v = t.reviews;
  const links = { onOpenWork, workHref };
  const unlimited = reviewRoundsUnlimited(view);
  const thin = isThinMode(view);
  const releaseStatus = releaseReviewOf(view.forecast)?.status;
  return (
    <section className="hui hui-reviews" aria-labelledby="hui-reviews-title" lang={lang}>
      <Heading t={t} term="review" level={2} id="hui-reviews-title">
        {v.label}
      </Heading>
      <div className="hui-panel" data-testid="escalations">
        <Heading t={t} term="escalation">
          {v.escalations(view.escalations.length)}
        </Heading>
        <EscalationList
          items={view.escalations}
          t={t}
          links={links}
          timeZone={timeZone}
          {...(now !== undefined ? { now } : {})}
        />
        <Clipped n={view.truncated?.escalations} t={t} />
      </div>
      {view.reviews.length === 0 ? (
        <p className="hui-muted">{v.none}</p>
      ) : (
        <>
          <table className="hui-table" data-testid="reviews-table">
            <thead>
              <tr>
                <th scope="col">{v.col.subject}</th>
                <th scope="col">{v.col.kind}</th>
                <th scope="col">{v.col.rounds}</th>
                <th scope="col">{v.col.open}</th>
                <th scope="col">{v.col.accepted}</th>
                <th scope="col">{v.col.reviewer}</th>
              </tr>
            </thead>
            <tbody>
              {view.reviews.map((r) => (
                <tr key={r.kind + ':' + r.subject}>
                  <td data-label={v.col.subject}>
                    <code>{r.subject}</code>
                  </td>
                  <td data-label={v.col.kind}>{label(v.kind, r.kind)}</td>
                  <td data-label={v.col.rounds}>
                    <RoundsText r={r} t={t} unlimited={unlimited} thin={thin} />
                  </td>
                  <td data-label={v.col.open}>{v.open(r.open.blocking, r.open.notes)}</td>
                  <td data-label={v.col.accepted}>{r.accepted}</td>
                  <td data-label={v.col.reviewer}>{bindingText(r.reviewer, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.reviews.map((r) => (
            <ReviewSubjectCard
              key={r.kind + ':' + r.subject}
              r={r}
              lang={lang}
              links={links}
              collapsed={Boolean(collapseFindings)}
              unlimited={unlimited}
              thin={thin}
              releaseStatus={releaseStatus}
            />
          ))}
        </>
      )}
      <Clipped n={view.truncated?.reviews} t={t} />
      <Clipped n={view.truncated?.findings} t={t} />
    </section>
  );
}

/**
 * Rounds of a review subject against its limit; revision 8 adds the rounds
 * left («раундов ревью плана: осталось K», warn at 0) and the free
 * re-reviews of an unchanged plan that spent no round. Revision 9: in light
 * mode (`unlimited`) plan and contract rounds read «раундов N, без предела»
 * with the reason, and no rounds-left count.
 */
export function RoundsText({
  r,
  t,
  unlimited = false,
  thin = false,
}: {
  r: ReviewSubjectView;
  t: Dict;
  unlimited?: boolean;
  /** Revision 11: the limit is lifted by thin mode, not light. */
  thin?: boolean;
}) {
  const v = t.reviews;
  const light = unlimited && (r.kind === 'plan' || r.kind === 'contract');
  const left = light ? undefined : r.rounds.remaining;
  return (
    <>
      {roundsWithoutLimit(r, unlimited)
        ? t.r11.roundsUnlimited(r.rounds.used)
        : v.rounds(r.rounds.used, r.rounds.max)}
      {light ? (
        <span className="hui-muted" data-testid="rounds-unlimited">
          {' · '}
          {(thin ? t.r13 : t.r11).roundsUnlimitedWhy}
        </span>
      ) : null}
      {typeof left === 'number' ? (
        <span data-testid="rounds-left" data-status={left === 0 ? 'blocked' : undefined}>
          {' · '}
          {v.roundsLeft(label(v.roundsKindOf, r.kind), left)}
        </span>
      ) : null}
      {r.rounds.free ? (
        <span className="hui-muted" data-testid="rounds-free">
          {' · '}
          {v.roundsFree(r.rounds.free)}
        </span>
      ) : null}
    </>
  );
}
