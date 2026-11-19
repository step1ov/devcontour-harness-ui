// Work detail screen (`harness view --work <id>`): where the work is now,
// its stages, why it was retried, what was checked and how, spend, what is
// in the way, its questions and reviews, and where the accepted result is.
// Pure render of a `WorkDetailView`; no fetching, no writes.

import { instantMs } from '../model/compat.ts';
import { dict, label, type Dict, type Lang } from '../model/dict.ts';
import {
  SLOT_STAGES,
  formatDuration,
  formatElapsed,
  formatTypical,
  formatUsd,
  questionStatus,
  stageLabel,
} from '../model/format.ts';
import type { DriftView, VerificationRow, WorkDetailView } from '../model/view.ts';
import {
  AcceptedLine,
  AnswerBasisLine,
  BlockerLine,
  Heading,
  StageStatus,
  Term,
  WorkRef,
  actorLabel,
  clockOf,
  type ScreenProps,
} from './common.tsx';
import { ReviewSubjectCard } from './Reviews.tsx';

export interface WorkDetailProps extends ScreenProps {
  detail: WorkDetailView;
}

/** Results that claim something was determined: these rows must say how and by whom. */
const DETERMINED = new Set(['passed', 'failed', 'reused']);

/** The words of one verification row: result, method and who, never a bare "checked". */
export function verificationWords(r: VerificationRow, t: Dict) {
  const w = t.work;
  const result = Object.hasOwn(w.result, r.result) ? w.result[r.result]! : w.resultOther(r.result);
  let how: string;
  switch (r.how) {
    case 'executed':
      how = w.howExecuted(r.attempt);
      break;
    case 'reused':
      how = w.howReused(r.attempt);
      break;
    case 'read':
      how = w.howRead;
      break;
    case 'not-checked':
      how = w.howNotChecked;
      break;
    default:
      how = w.howUnknown(String(r.how));
  }
  const by = r.by ? w.by(label(t.actor, r.by)) : w.byUnknown;
  return { result, how, by, determined: DETERMINED.has(r.result) || r.how !== 'not-checked' };
}

export function DriftLine({ d, t }: { d: DriftView; t: Dict }) {
  const parts = [
    t.drift.row(
      d.ref,
      d.acceptedSha.slice(0, 12),
      d.head ? d.head.slice(0, 12) : t.drift.headUnknown,
    ),
  ];
  if (d.commitsSinceAccepted !== undefined) parts.push(t.drift.commits(d.commitsSinceAccepted));
  if (d.filesSinceAccepted !== undefined) parts.push(t.drift.files(d.filesSinceAccepted));
  if (d.diverged) parts.push(t.drift.diverged);
  if (d.unavailable !== undefined) parts.push(t.drift.unavailable(d.unavailable));
  return <>{parts.join('; ')}</>;
}

export function WorkDetail({
  detail,
  lang = 'ru',
  timeZone,
  now,
  onOpenWork,
  workHref,
}: WorkDetailProps) {
  const t = dict(lang);
  const w = t.work;
  const work = detail.work;
  const links = { onOpenWork, workHref };
  const clock = now ?? instantMs(detail.generatedAt);
  const typical = formatTypical(work.stage.typical, lang);
  const latest = detail.attempts[0];
  const a = work.attempts;
  const accepted = work.stage.name === 'done' || work.target !== undefined;
  const verificationHref = (workHref ? workHref(work.id) : '') + '#verification';
  const clipped = (what: string, n: number | undefined) =>
    n ? <p className="hui-muted hui-clipped">{w.detailClipped(what, n)}</p> : null;

  // Stage strip: the latest attempt's stages with their outcome, then the stages ahead.
  const seen = new Set<string>();
  const steps: { stage: string; state: string; durationMs?: number }[] = [];
  for (const s of latest?.stages ?? []) {
    seen.add(s.stage);
    steps.push({
      stage: s.stage,
      state:
        s.outcome === 'passed'
          ? w.stagePassed
          : s.outcome === 'failed'
            ? w.stageFailed
            : s.stage === work.stage.name && SLOT_STAGES.has(s.stage)
              ? w.stageCurrent
              : w.stageNoOutcome,
      ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
    });
  }
  if (!seen.has(work.stage.name) && SLOT_STAGES.has(work.stage.name))
    steps.push({ stage: work.stage.name, state: w.stageCurrent });
  for (const n of work.stage.next) if (!seen.has(n)) steps.push({ stage: n, state: w.stageAhead });

  return (
    <section className="hui hui-work" aria-labelledby="hui-work-title" lang={lang}>
      <header className="hui-row hui-header">
        <h2 className="hui-title" id="hui-work-title">
          <code>{work.id}</code>
          {work.title ? <span className="hui-work-title"> {work.title}</span> : null}
        </h2>
        <StageStatus w={work} lang={lang} linkProps={links} verificationHref={verificationHref} />
        {work.liveness ? (
          <span className={'hui-badge' + (work.liveness === 'active' ? '' : ' hui-warn')}>
            {label(t.liveness, work.liveness)}
          </span>
        ) : null}
      </header>

      <div className="hui-panel" data-testid="work-now">
        <Heading t={t} term="stage">
          {w.now}
        </Heading>
        <p>
          <StageStatus w={work} lang={lang} linkProps={links} verificationHref={verificationHref} />
          {work.stage.step ? (
            <>
              {' '}
              (<code>{work.stage.step}</code>)
            </>
          ) : null}
          {work.stage.since
            ? ' ' +
              w.since(
                clockOf(work.stage.since, t, timeZone, now),
                formatElapsed(work.stage.since, clock, lang),
              )
            : ''}
          {typical ? '; ' + typical : ''}
          {work.stage.step || work.stage.since || typical ? '.' : ''}{' '}
          {work.stage.next.length
            ? w.next(work.stage.next.map((s) => stageLabel(s, lang).toLowerCase()).join(', '))
            : w.nothingNext}
        </p>
        {work.stage.needs ? (
          <p data-status="blocked">
            {w.needs(actorLabel(t, work.stage.needs.actor), work.stage.needs.action)}
          </p>
        ) : null}
        {work.runtime ? (
          <p className="hui-muted">
            {t.actor.writer}: {[work.runtime, work.model].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {typical ? (
          <div className="hui-terms">
            <Term id="typical" t={t} named />
          </div>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="work-stages">
        <Heading t={t} term="gates">
          {w.stages}
        </Heading>
        <ol className="hui-steps">
          {steps.map((s, i) => (
            <li key={i} className="hui-step">
              <span>{stageLabel(s.stage, lang)}</span>{' '}
              <span className="hui-muted">
                — {s.state}
                {s.durationMs !== undefined ? `, ${formatDuration(s.durationMs, lang)}` : ''}
              </span>
            </li>
          ))}
        </ol>
        {clipped(w.clippedName.stages!, detail.truncated?.stages)}
        <div className="hui-terms">
          <Term id="integration" t={t} named />
        </div>
      </div>

      {a.failed > 0 || a.interrupted > 0 || a.lastFailure ? (
        <div className="hui-panel" data-testid="why-retry">
          <Heading t={t} term="attempt">
            {w.whyRetry}
          </Heading>
          <p>
            {w.attemptsLine(a.used, a.max, a.left)}{' '}
            {a.lastFailure ? (
              <>
                {w.lastFailure(a.lastFailure.attempt, a.lastFailure.plain)}{' '}
                {w.failureGroup(label(t.bucket, a.lastFailure.bucket))}
              </>
            ) : a.failed > 0 ? (
              w.failureUnknown
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="hui-panel" data-testid="work-attempts">
        <Heading t={t} term="attempt">
          {w.attempts}
        </Heading>
        {a.line ? <p className="hui-muted">{a.line}</p> : null}
        <p data-testid="work-counters">
          {w.rechecks(a.rechecks)} {w.neutral(a.neutral.used, a.neutral.max)}
          {a.interrupted ? ' ' + w.interrupted(a.interrupted) : ''}
        </p>
        <div className="hui-terms">
          <Term id="recheck" t={t} named />
          <Term id="neutral" t={t} named />
        </div>
        {detail.attempts.length === 0 ? (
          <p className="hui-muted">{w.noAttempts}</p>
        ) : (
          <ul className="hui-list">
            {detail.attempts.map((r) => (
              <li key={r.attempt} className="hui-item">
                <strong>{w.attemptRow(r.attempt)}</strong>{' '}
                <span className="hui-badge">{label(w.attemptStatus, r.status)}</span>{' '}
                {r.failureBucket ? <span>{label(t.bucket, r.failureBucket)} · </span> : null}
                <span className="hui-muted">
                  {[r.runtime, r.model].filter(Boolean).join(' · ')} ·{' '}
                  {w.startedAt(clockOf(r.startedAt, t, timeZone, now))}
                  {r.finishedAt ? ', ' + w.finishedAt(clockOf(r.finishedAt, t, timeZone, now)) : ''}
                </span>
                {r.interrupted ? <div className="hui-muted">{w.interruptedRow}</div> : null}
              </li>
            ))}
          </ul>
        )}
        {clipped(w.attempts, detail.truncated?.attempts)}
      </div>

      <div className="hui-panel" data-testid="work-verification">
        <Heading t={t} term="gates" id="verification">
          {w.whatChecked}
        </Heading>
        {detail.verification === undefined ? (
          <p className="hui-muted" data-testid="no-verification">
            {w.noVerification}
          </p>
        ) : detail.verification.length === 0 ? (
          <p className="hui-muted">{w.emptyVerification}</p>
        ) : (
          <ul className="hui-list hui-checks">
            {detail.verification.map((r, i) => {
              const words = verificationWords(r, t);
              return (
                <li
                  key={i}
                  className="hui-item hui-check"
                  data-status={words.determined ? 'checked' : 'not-checked'}
                >
                  <code>{r.gate}</code>{' '}
                  <span className="hui-muted">
                    ({r.kind === 'review' ? w.reviewRow : w.gate}
                    {r.phase ? ', ' + label(w.phase, r.phase) : ''})
                  </span>
                  {' — '}
                  <span>{words.result}</span> · <span className="hui-how">{words.how}</span>
                  {words.determined ? (
                    <>
                      {' '}
                      · <span className="hui-who">{words.by}</span>
                    </>
                  ) : null}
                  {r.at ? (
                    <span className="hui-muted"> · {clockOf(r.at, t, timeZone, now)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {clipped(w.whatChecked, detail.truncated?.verification)}
      </div>

      <div className="hui-panel hui-split" data-testid="work-spend">
        <div>
          <Heading t={t} term="lowerBound">
            {w.spend}
          </Heading>
          <p>
            {w.spendLine(
              formatUsd(work.spend.usd, lang),
              t.calls(work.spend.calls),
              formatDuration(work.spend.durationMs, lang),
            )}
          </p>
        </div>
        <div>
          <Heading t={t} term="waitsQueue">
            {w.blockers}
          </Heading>
          {work.blockers.length ? (
            <ul className="hui-list">
              {work.blockers.map((b, i) => (
                <BlockerLine key={i} b={b} t={t} />
              ))}
            </ul>
          ) : (
            <p className="hui-muted">{w.noBlockers}</p>
          )}
          {clipped(w.clippedName.blockers!, detail.truncated?.blockers)}
        </div>
      </div>

      <div className="hui-panel" data-testid="work-questions">
        <Heading t={t} term="technical">
          {w.questions}
        </Heading>
        {detail.questions.length === 0 ? (
          <p className="hui-muted">{w.noQuestions}</p>
        ) : (
          <ul className="hui-list">
            {detail.questions.map((q) => (
              <li key={q.requestId} className="hui-item">
                <code>{q.requestId}</code>{' '}
                <span className="hui-badge">{t.question.severity(q.severity)}</span>{' '}
                {q.title ? <span>{q.title}</span> : null}
                {q.plain ? (
                  <div>
                    {t.question.whatChanges} {q.plain}
                  </div>
                ) : null}
                <div className="hui-muted">{questionStatus(q, lang).text}</div>
                <AnswerBasisLine q={q} t={t} timeZone={timeZone} now={clock} />
              </li>
            ))}
          </ul>
        )}
        {clipped(w.clippedName.questions!, detail.truncated?.questions)}
        {detail.questions.some((q) => q.answerBasis) ? (
          <div className="hui-terms">
            <Term id="answerBasis" t={t} named />
          </div>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="work-reviews">
        <Heading t={t} term="review">
          {w.reviews}
        </Heading>
        {detail.reviews.length === 0 ? (
          <p className="hui-muted">{w.noReviews}</p>
        ) : (
          detail.reviews.map((r) => (
            <ReviewSubjectCard key={r.kind + ':' + r.subject} r={r} lang={lang} links={links} />
          ))
        )}
        {clipped(w.clippedName.reviews!, detail.truncated?.reviews)}
        {clipped(w.clippedName.findings!, detail.truncated?.findings)}
      </div>

      <div className="hui-panel" data-testid="work-accepted">
        <Heading t={t} term="accepted">
          {w.accepted}
        </Heading>
        {accepted ? (
          <AcceptedLine
            w={work}
            lang={lang}
            linkProps={links}
            verificationHref={verificationHref}
          />
        ) : (
          <p>{t.target.notYet}</p>
        )}
        <Heading t={t} term="drift">
          {w.drift}
        </Heading>
        <p data-testid="work-drift">
          {detail.drift ? (
            <DriftLine d={detail.drift} t={t} />
          ) : !accepted ? (
            w.notAccepted
          ) : work.target ? (
            w.noDriftAccepted
          ) : (
            w.noDriftUnknown
          )}
        </p>
      </div>
      {work.dependsOn?.length ? (
        <p className="hui-muted">
          {t.overview.after('')}
          {work.dependsOn.map((id, i) => (
            <span key={id}>
              {i ? ', ' : ''}
              <WorkRef id={id} {...links} />
            </span>
          ))}
        </p>
      ) : null}
      {clipped(w.clippedName.dependsOn!, detail.truncated?.dependsOn)}
    </section>
  );
}
