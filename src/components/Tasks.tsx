// Tasks screen (design §5.3, replaces «Ревью»): one card per work — what is
// happening now, attempts used and left, review rounds, who acts next and
// the questions of that task with their full text. A card opens the work's
// process (WorkDetail). Reviews without a work (plan, contract) follow the
// cards. Pure render of an `OperatorView`; no fetching, no writes.

import { instantMs } from '../model/compat.ts';
import { dict, knownLabel, label, type Dict, type Lang } from '../model/dict.ts';
import { formatElapsed, questionStatus, stageLabel } from '../model/format.ts';
import {
  attemptAverage,
  outsideHarness,
  overallProgress,
  scopeOf,
  taskName,
} from '../model/scope.ts';
import {
  nextSteps,
  sourceReviewOf,
  workName,
  withWorkNames,
  type NextSteps,
} from '../model/steps.ts';
import {
  leadAnswers,
  taskCards,
  leadStopOf,
  plannedSplit,
  gateHoldsOf,
  type TaskCard as Card_,
  type TaskPhase,
} from '../model/tasks.ts';
import {
  attemptProgress,
  attemptReviews,
  leadResets,
  trackNow,
  type AttemptProgress,
} from '../model/track.ts';
import type { OperatorView, WorkView } from '../model/view.ts';
import {
  AcceptedLine,
  InfraBadge,
  AnswerBasisLine,
  AttemptsText,
  Block,
  Codes,
  QuestionExtras,
  WorkEta,
  WorkRef,
  actorLabel,
  scopeMissingText,
  type ScreenProps,
} from './common.tsx';
import { ReviewSubjectCard } from './Reviews.tsx';
import { Badge, type Tone } from './ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Tooltip } from './ui/tooltip.tsx';
import { Progress } from './ui/progress.tsx';
import { hasOverview, SetupScreen } from './Setup.tsx';
import { TrackLine } from './Track.tsx';
import { PlannedBlock } from './Planned.tsx';

export interface TasksProps extends ScreenProps {
  view: OperatorView;
}

const tones: Record<TaskPhase, Tone> = {
  accepted: 'ok',
  cancelled: 'neutral',
  running: 'info',
  question: 'warn',
  stopped: 'warn',
  dependency: 'outline',
  queued: 'outline',
  planned: 'outline',
  other: 'outline',
};

export function Tasks({ view, lang = 'ru', now, onOpenWork, workHref, timeZone }: TasksProps) {
  const t = dict(lang);
  // A document without the overview lists (revision 5 setup): the setup state, not a throw.
  if (!hasOverview(view))
    return <SetupScreen view={view} lang={lang} now={now} timeZone={timeZone} />;
  const k = t.tasks;
  const links = { onOpenWork, workHref };
  const clock = now ?? instantMs(view.generatedAt);
  const steps = nextSteps(view);
  const cards = taskCards(view, steps);
  const scope = scopeOf(view);
  // Revision 6: planned tasks get their own «ещё не утверждена» cards below
  // (the same split as on the Overview: each task once).
  const { planned, outside } = plannedSplit(view, scope);
  const unlisted = overallProgress(view).outsideUnlisted;
  const other = view.reviews.filter((r) => r.workId === undefined);
  return (
    <section
      className="hui hui-tasks hui:grid hui:gap-4 hui:bg-transparent"
      aria-labelledby="hui-tasks-title"
      lang={lang}
    >
      <header className="hui:grid hui:gap-1">
        <h2 className="hui-title" id="hui-tasks-title">
          {k.title}
        </h2>
        <p className="hui-muted">{k.intro}</p>
      </header>
      {cards.length === 0 ? <p className="hui-muted">{k.empty}</p> : null}
      <ul className="hui:grid hui:list-none hui:gap-4 hui:lg:grid-cols-2" data-testid="task-cards">
        {cards.map((c) => (
          <TaskCardView
            key={c.work.id}
            c={c}
            steps={steps}
            view={view}
            t={t}
            lang={lang}
            clock={clock}
            links={links}
            timeZone={timeZone}
          />
        ))}
      </ul>
      {view.truncated?.works ? <p className="hui-muted">{t.overview.planClipped}</p> : null}
      <PlannedBlock view={view} items={planned} lang={lang} testid="tasks-planned" />
      {scope ? (
        outside.length ? (
          <Block t={t} title={k.outside(outside.length)} testid="tasks-outside">
            {outside.length ? (
              <ul className="hui:grid hui:list-none hui:gap-2">
                {outside.map((task) => (
                  <li
                    key={task.id}
                    className="hui:flex hui:flex-wrap hui:items-center hui:gap-2"
                    data-testid="outside-task"
                  >
                    <strong>{taskName(task)}</strong>
                    <Badge tone="outline">{label(t.overview.outsideState, task.state)}</Badge>
                    {task.plain ? <span className="hui-muted">{task.plain}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {unlisted ? <p className="hui-muted">{t.r4.scopeClipped(unlisted)}</p> : null}
          </Block>
        ) : unlisted ? (
          // Every listed task has a work; the clipped ones have an unknown state: no «(0)».
          <p className="hui-muted" data-testid="scope-clipped">
            {t.r4.scopeClipped(unlisted)}
          </p>
        ) : null
      ) : (
        <p className="hui:text-xs hui:text-muted-foreground" data-testid="scope-missing">
          {scopeMissingText(view, t)}
        </p>
      )}
      {other.length ? (
        <Block t={t} title={k.otherReviews(other.length)} testid="other-reviews" term="review">
          {other.map((r) => (
            <ReviewSubjectCard
              key={r.kind + ':' + r.subject}
              r={r}
              lang={lang}
              links={links}
              collapsed
            />
          ))}
        </Block>
      ) : null}
    </section>
  );
}

function TaskCardView({
  c,
  steps,
  view,
  t,
  lang,
  clock,
  links,
  timeZone,
}: {
  c: Card_;
  steps: NextSteps;
  view: OperatorView;
  t: Dict;
  lang: Lang;
  clock: number;
  links: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  timeZone: string | undefined;
}) {
  const k = t.tasks;
  const w = c.work;
  const name = workName(view, w.id);
  const a = w.attempts;
  const code = c.reviews.filter((r) => r.kind === 'code');
  const rounds = code.reduce((n, r) => n + r.rounds.used, 0);
  const cap = code.length === 1 ? code[0]!.rounds.max : null;
  const firstBlocker = w.blockers.find((b) => b.actor !== null) ?? w.blockers[0];
  const blockedEnv = leadStopOf(w, view.viewRevision);
  const nowText = blockedEnv
    ? blockedEnv.env
      ? k.nowWriterEnv
      : t.r4.nowLeadStop
    : c.phase === 'accepted'
      ? k.nowAccepted
      : c.phase === 'cancelled'
        ? k.nowCancelled
        : c.phase === 'running'
          ? k.nowRunning(
              stageLabel(w.stage.name, lang),
              w.stage.since ? formatElapsed(w.stage.since, clock, lang) : '',
            )
          : firstBlocker?.plain?.trim()
            ? k.nowWaits(withWorkNames(view, firstBlocker.plain).replace(/[.\s]+$/, ''))
            : c.phase === 'queued'
              ? k.nowQueued
              : k.nowStage(stageLabel(w.stage.name, lang));
  const next =
    c.next.kind === 'nobody'
      ? k.next.nobody
      : c.next.kind === 'harness'
        ? k.next.harness(stageLabel(c.next.stage, lang))
        : c.next.kind === 'actors'
          ? k.next.actors(c.next.actors.map((x) => actorLabel(t, x)).join(t.overview.then))
          : c.next.kind === 'dependency'
            ? k.next.dependency(c.next.on.map((id) => workName(view, id)).join(', '))
            : c.next.kind === 'queue'
              ? k.next.queue
              : k.next.unknown;
  const titleText = w.title && w.title !== name ? w.title : undefined;
  // Revision 5: accepted, and left in the task source for your check.
  const review = sourceReviewOf(view, w.id);
  // Harness alpha.66: a check held by a refusal without a retry — the lead's move.
  // The harness's words: for the work that caused the hold the held-gate line
  // of «что задействовано» (whole, up to 300), else the stop's own `plain`.
  const holds = gateHoldsOf(view, w);
  const holdLine = (holds.own.length ? view.resources?.gates.heldLine : undefined) ?? holds.plain;
  // ui alpha.10 (P6-25): the bar is the current attempt's way to acceptance.
  const prog = attemptProgress(w.track, w.status);
  const resets = leadResets(w.track);
  const now = trackNow(w.track);
  const leadWaits =
    Boolean(blockedEnv) ||
    w.stage.needs?.actor === 'lead' ||
    (now?.state === 'waiting' && now.step.actor === 'lead');
  return (
    <Card as="li" data-testid={`task-${w.id}`} className="hui-task">
      <CardHeader>
        <CardTitle>
          <WorkRef id={w.id} {...links}>
            {titleText ?? name}
          </WorkRef>
        </CardTitle>
        <Badge tone={tones[c.phase]} data-testid="task-phase">
          {label(k.phase, c.phase)}
        </Badge>
        {w.planned && c.phase !== 'planned' ? (
          <Badge tone="outline" data-testid="planned-badge">
            {t.r6.plannedBadge}
          </Badge>
        ) : null}
        <InfraBadge kind={w.kind} lang={lang} />
        <AttemptBadge w={w} prog={prog} phase={c.phase} t={t} leadWaits={leadWaits} />
      </CardHeader>
      <CardContent className="hui:gap-2 hui:text-sm">
        <p data-testid="task-now" data-status={c.phase === 'accepted' ? 'accepted' : undefined}>
          {nowText}
        </p>
        {w.planned ? <p className="hui-muted">{t.r6.plannedWork}</p> : null}
        {w.track && !w.planned && c.phase !== 'cancelled' && c.phase !== 'planned' ? (
          <AttemptBar prog={prog} percent={forecastPercent(view, w, prog)} t={t} />
        ) : null}
        {holdLine && holdLine !== firstBlocker?.plain?.trim() ? (
          <p data-testid="task-gate-held">{withWorkNames(view, holdLine)}</p>
        ) : null}
        {w.track ? (
          <TrackLine
            track={w.track}
            lang={lang}
            name={titleText ?? name}
            since={c.phase === 'running' ? w.stage.since : undefined}
            now={clock}
            timeZone={timeZone}
          />
        ) : null}
        {review ? (
          <p data-testid="task-source-review" data-status="blocked">
            <Badge tone="info">{t.r5.kindSourceReview}</Badge>{' '}
            {t.r5.sourceReviewTask(review.key ?? name, review.column)}
          </p>
        ) : null}
        {blockedEnv?.summary ? <Codes t={t} codes={[blockedEnv.summary]} /> : null}
        {c.waitsOn.length ? (
          <p data-testid="task-waits">
            {k.waitsOn(c.waitsOn.map((id) => workName(view, id)).join(', '))}
          </p>
        ) : null}
        <WorkEta
          w={w}
          t={t}
          lang={lang}
          clock={clock}
          average={attemptAverage(view)}
          forecast={view.forecast !== undefined}
        />
        {c.phase === 'accepted' ? (
          <AcceptedLine w={w} lang={lang} linkProps={links} timeZone={timeZone} now={clock} />
        ) : null}
        <div className="hui:grid hui:gap-1" data-testid="task-attempts">
          <span>
            {k.attempts(a.used, a.max, a.left)}
            {a.runs !== undefined && a.runs !== a.used ? (
              <span data-testid="attempt-runs" title={t.r5.runsWhy}>
                {' '}
                ({t.r5.runs(a.runs, a.used)})
              </span>
            ) : null}
          </span>
          {w.track ? null : (
            <Progress
              value={Math.min(a.used, a.max)}
              max={a.max}
              label={k.attempts(a.used, a.max, a.left)}
              className="hui:h-1.5"
            />
          )}
          {resets.done ? (
            <span className="hui-muted" data-testid="task-resets">
              {t.r10.resets(resets.done, resets.total, resets.reasons.join(', '))}
            </span>
          ) : null}
          {a.line ? (
            <span className="hui-muted">
              <AttemptsText line={a.line} t={t} />
            </span>
          ) : null}
          {a.lastFailure && c.phase !== 'accepted' && (!blockedEnv || a.lastFailure.kind) ? (
            <span className="hui-muted" data-testid="task-last-failure">
              {t.problems.lastFailure(
                a.lastFailure.attempt,
                withWorkNames(view, a.lastFailure.plain),
              )}
              {a.lastFailure.counted === undefined
                ? ''
                : `; ${a.lastFailure.counted ? t.r4.counted : t.r4.notCounted}`}
            </span>
          ) : null}
        </div>
        {w.track ? <ReviewLine w={w} t={t} /> : null}
        {/* The lead's `harness review-code` rounds: separate, only when there are any. */}
        {!w.track || code.length ? (
          <p data-testid="task-reviews">
            {code.length
              ? w.track
                ? t.r10.codeReview(rounds, cap)
                : k.reviewRounds(rounds, cap)
              : k.noReview}
            {code.some((r) => r.open.blocking) ? (
              <span className="hui-muted">
                {' · '}
                {t.reviews.open(
                  code.reduce((n, r) => n + r.open.blocking, 0),
                  code.reduce((n, r) => n + r.open.notes, 0),
                )}
              </span>
            ) : null}
          </p>
        ) : null}
        <p
          className="hui:font-medium"
          data-testid="task-next"
          data-status={
            c.phase === 'accepted' || c.phase === 'cancelled' || c.phase === 'running'
              ? undefined
              : 'blocked'
          }
        >
          <span className="hui-who">{next}</span>
        </p>
        {w.question?.line?.trim() &&
        !c.questions.some((q) => q.requestId === w.question!.requestId && q.line?.trim()) ? (
          <p className="hui-muted" data-testid="task-question-line">
            {w.question.line}
          </p>
        ) : null}
        {c.questions.length ? (
          <div data-testid="task-questions">
            <h4 className="hui:text-sm hui:font-semibold">{k.questions(c.questions.length)}</h4>
            <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-2">
              {c.questions.map((q) => {
                const asking = questionStatus(q).needsAnswer;
                return (
                  <li
                    key={q.requestId}
                    className="hui:rounded-control hui:bg-muted hui:p-2"
                    data-kind="question"
                  >
                    <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-2">
                      <Badge tone={asking ? 'warn' : 'outline'}>
                        {t.question.severity(q.severity)}
                      </Badge>
                      {q.title ? <strong>{q.title}</strong> : null}
                    </div>
                    {q.plain ? (
                      <p className="hui:mt-1">
                        {t.question.whatChanges} {q.plain}
                      </p>
                    ) : null}
                    <p className="hui-muted hui:mt-1">
                      {asking && leadAnswers(view, q)
                        ? t.question.leadAnswers
                        : questionStatus(q, lang).text}
                    </p>
                    <AnswerBasisLine q={q} t={t} timeZone={timeZone} now={clock} />
                    <QuestionExtras q={q} t={t} />
                    <Codes t={t} codes={[q.requestId, t.question.version(q.version)]} />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-3">
          <WorkRef id={w.id} {...links}>
            {k.open}
          </WorkRef>
          <Codes
            t={t}
            codes={[
              w.id,
              ...w.blockers.map((b) => b.code),
              w.stage.needs
                ? knownLabel(t.action, w.stage.needs.action)
                  ? undefined
                  : w.stage.needs.action
                : undefined,
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** The harness readiness of the work's current attempt (`forecast.progress.works[]`), if it names this attempt. */
function forecastPercent(
  view: OperatorView,
  w: WorkView,
  prog: AttemptProgress,
): number | undefined {
  const f = view.forecast?.progress.works?.find((x) => x.workId === w.id);
  if (!f || !Number.isFinite(f.percent) || f.rework) return undefined;
  if (prog.state !== 'running') return undefined;
  if (f.attempt && prog.attempt !== undefined && f.attempt.n !== prog.attempt) return undefined;
  return Math.max(0, Math.min(99, Math.round(f.percent)));
}

/**
 * The current attempt toward acceptance (P6-25): code → checks → review →
 * integration → accepted, the harness percent when the forecast names it,
 * else the passed stages of the track; after a failure the bar starts again
 * with «повтор после отказа: <этап>».
 */
function AttemptBar({
  prog,
  percent,
  t,
}: {
  prog: AttemptProgress;
  percent: number | undefined;
  t: Dict;
}) {
  if (prog.state === 'none') return null;
  const k = t.r10;
  const head = k.groupHead(prog.attempt, prog.rework);
  const pct =
    prog.state === 'accepted'
      ? 100
      : prog.state === 'next'
        ? 0
        : (percent ?? Math.round((prog.passed / prog.of) * 100));
  const text =
    prog.state === 'accepted'
      ? k.progressAccepted
      : prog.state === 'running'
        ? k.progressRunning(head, prog.step ?? '', prog.passed, prog.of)
        : prog.state === 'next'
          ? k.progressNext(head)
          : k.progressFailed(head, prog.step ?? '');
  return (
    <div className="hui:grid hui:gap-1" data-testid="task-progress" data-state={prog.state}>
      <span>{text}</span>
      <Progress
        value={pct}
        max={100}
        label={prog.state === 'accepted' ? k.progressAccepted : k.progressLabel(head, pct)}
        className="hui:h-2"
        indicatorClassName={prog.state === 'failed' ? 'hui:bg-bad' : 'hui:bg-ok'}
      />
      {prog.retryAfter && prog.state !== 'accepted' ? (
        <span className="hui-muted" data-testid="task-retry-after">
          {k.retryAfter(prog.retryAfter)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * «попытка 2 из 3» in the card corner (P6-25): neutral; amber on the last
 * attempt; red when the attempts are spent or the work waits for the lead.
 * The tooltip repeats the attempts line of the card (mouse only: the same
 * words are in the card).
 */
function AttemptBadge({
  w,
  prog,
  phase,
  t,
  leadWaits,
}: {
  w: WorkView;
  prog: AttemptProgress;
  phase: TaskPhase;
  t: Dict;
  leadWaits: boolean;
}) {
  const a = w.attempts;
  if (w.planned || phase === 'planned' || phase === 'cancelled') return null;
  // The running attempt; otherwise the attempts spent (a retry not started yet is not «on» it).
  const n = prog.state === 'running' ? (prog.attempt ?? a.used) : a.used;
  if (!n) return null;
  const closed = phase === 'accepted';
  const spent = !closed && a.left <= 0 && prog.state !== 'running';
  const why = closed
    ? undefined
    : leadWaits
      ? 'lead'
      : spent
        ? 'spent'
        : n >= a.max
          ? 'last'
          : undefined;
  const tone: Tone =
    why === 'lead' || why === 'spent' ? 'bad' : why === 'last' ? 'warn' : 'neutral';
  const resets = leadResets(w.track);
  const tip = [
    t.tasks.attempts(a.used, a.max, a.left),
    resets.total ? t.r10.resets(resets.done, resets.total, resets.reasons.join(', ')) : undefined,
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <Tooltip content={tip} decorative className="hui:ml-auto">
      <Badge tone={tone} data-testid="attempt-badge" data-why={why}>
        {t.r10.attemptBadge(n, a.max)}
        {why ? <span className="hui-sr"> — {t.r10.attemptBadgeWhy[why]}</span> : null}
      </Badge>
    </Tooltip>
  );
}

/**
 * The independent review of each attempt (P6-10): «Ревью: попытка 1 —
 * отклонено, попытка 2 — одобрено», from the track's review steps.
 */
function ReviewLine({ w, t }: { w: WorkView; t: Dict }) {
  const k = t.r10;
  const items = attemptReviews(w.track);
  return (
    <p data-testid="task-attempt-reviews">
      {items.length
        ? k.reviewLine(
            items
              .map((r) => {
                const head = k.groupHead(r.attempt, r.rework).toLowerCase();
                const extra = [
                  r.findings !== undefined ? k.findings(r.findings) : undefined,
                ].filter(Boolean);
                return `${head ? `${head} — ` : ''}${label(k.review, r.state)}${extra.length ? ` (${extra.join(', ')})` : ''}`;
              })
              .join(', '),
          )
        : k.reviewNone}
    </p>
  );
}
