// Overview screen: what needs the operator, what runs now, what waits and
// why, progress and health at a glance. Pure render of an `OperatorView`; no
// fetching, no writes. Counts come from the view's aggregate sections (never
// from the possibly truncated lists). Hosts theme it through `--hui-*`.

import type {
  OperatorQuestion,
  OperatorView,
  SourceQuestion,
  ViewHealth,
  WorkView,
} from '../model/view.ts';
import {
  KNOWN_QUESTION_STATES,
  SLOT_STAGES,
  formatElapsed,
  formatTypical,
  formatRange,
  formatRough,
  formatUsd,
  questionStatus,
  stageLabel,
  usd,
} from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import { dict, knownLabel, label, type Dict, type Lang } from '../model/dict.ts';
import { footerSentence, formatWhen, headerSentence } from '../model/i18n.ts';
import {
  LEAD_FIRST_CODES,
  actorsOn,
  dependencyState,
  nextSteps,
  withWorkNames,
  workName,
  type DependencyWait,
  type NextSteps,
  type Step,
} from '../model/steps.ts';
import {
  MIN_ATTEMPT_SAMPLES,
  attemptAverage,
  outsideHarness,
  overallProgress,
  scopeLeft,
  scopeOf,
  taskName,
} from '../model/scope.ts';
import { HARNESS_STAGES, leadStopOf, splitQuestions } from '../model/tasks.ts';
import { ForecastRings } from './Forecast.tsx';
import { Badge, type Tone } from './ui/badge.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { Progress } from './ui/progress.tsx';
import {
  AcceptedLine,
  Block,
  Codes,
  StageLeftLine,
  WorkEta,
  AnswerBasisLine,
  AttemptsText,
  BlockerLine,
  Clipped,
  QuestionExtras,
  safeHttpUrl,
  Heading,
  StageStatus,
  Term,
  WorkRef,
  actorLabel,
  clockOf,
  type ScreenProps,
} from './common.tsx';

export interface OverviewProps extends ScreenProps {
  view: OperatorView;
}

const severityOrder = ['exceeded', 'undetermined', 'within'];

/**
 * The most severe budget row, whatever `budgeting` says: a row the producer
 * sent is never hidden. `undefined` only when there are no rows.
 */
export function worstBudget(health: ViewHealth) {
  if (!health.budgets.length) return undefined;
  const rank = (s: string) => {
    const i = severityOrder.indexOf(s);
    return i < 0 ? 1 : i; // unknown state reads as undetermined
  };
  return [...health.budgets].sort((a, b) => rank(a.state) - rank(b.state))[0];
}

export function Overview({
  view,
  now,
  onOpenWork,
  workHref,
  lang = 'ru',
  timeZone,
}: OverviewProps) {
  const t = dict(lang);
  const o = t.overview;
  const clock = now ?? instantMs(view.generatedAt);
  const links = { onOpenWork, workHref };
  const { progress, health } = view;
  const running = view.works.filter((w) => SLOT_STAGES.has(w.stage.name));
  const steps = nextSteps(view);
  // Technical questions the lead answers by the policy do not wait for you (F-W).
  const { yours: asking, lead: leadAsking } = splitQuestions(view, steps);
  const otherQuestions = view.questions.filter((q) => !questionStatus(q).needsAnswer);
  const budget = worstBudget(health);
  // Works listed with a location; the count itself is `progress.done`.
  const accepted = view.works.filter((w) => w.target !== undefined);
  // Owner questions the lead wrote in the task tracker (revision 4): answered there.
  const sourceQuestions = view.sourceQuestions ?? [];
  const yours = asking.length + steps.operator.length + sourceQuestions.length;
  // Works the harness counts as waiting for you that no item here names.
  const named = new Set([
    ...asking.map((q) => q.workId),
    ...leadAsking.map((q) => q.workId),
    ...steps.operator.flatMap((s) => s.workIds),
    ...steps.unlistedAnswers,
  ]);
  const hiddenWaiting = Math.max(0, progress.waitingOperator - named.size);
  const others =
    steps.lead.length + leadAsking.length + steps.other.length + steps.dependencies.length;
  const otherActors = [...new Set(steps.other.map((s) => s.actor))];
  const count = (stage: string) =>
    Object.hasOwn(progress.byStage, stage) ? Number(progress.byStage[stage]) || 0 : 0;
  // A tracker question list that was clipped or dropped (revision 4) makes the count a floor too.
  const clipped = Boolean(
    view.truncated?.questions || view.truncated?.escalations || view.truncated?.sourceQuestions,
  );
  const oddState = view.questions.some((q) => !KNOWN_QUESTION_STATES.has(String(q.state)));
  const leadOnlyWorks = new Set(
    leadAsking
      .map((q) => q.workId)
      .filter(
        (id) =>
          !asking.some((q) => q.workId === id) &&
          !steps.operator.some((s) => s.workIds.includes(id)) &&
          !steps.unlistedAnswers.includes(id),
      ),
  );
  const sentence = headerSentence(
    {
      running: progress.running,
      queued: count('queued'),
      stopped: count('stopped'),
      paused: progress.queue.paused,
      questions: asking.length + sourceQuestions.length,
      decisions: steps.operator.length,
      afterLead:
        asking.length + sourceQuestions.length === 0 &&
        steps.operator.length > 0 &&
        steps.operator.every((s) => s.after.length > 0),
      // Works counted as waiting for you only because of a question the lead answers.
      waitingOperator: Math.max(0, progress.waitingOperator - leadOnlyWorks.size),
      // A clipped list or a question state this build does not know makes the
      // count a floor: the sentence then never says "nothing is needed".
      incomplete: clipped || oddState,
    },
    lang,
  );
  const overall = overallProgress(view);
  const scope = scopeOf(view);
  const outside = outsideHarness(scope);
  const left = scopeLeft(view);
  const average = attemptAverage(view);
  const unfinished = overall.total - overall.done - overall.cancelled;
  // Harness works only: tasks outside the harness are the lead's to hand over, not the queue's.
  const harnessLeft = progress.total - progress.done - overall.cancelled;
  const outsideLeft = overall.outside ?? 0;
  // Who moves the queue. Revision 4 says it (`queue.runner`); before it the
  // panel read it from the controller and the running count (F-X).
  const runner = progress.queue.runner;
  const standing =
    !progress.queue.paused &&
    (runner !== undefined
      ? runner === 'not-running'
      : !health.controller.present && progress.running === 0 && harnessLeft > 0);
  const standingLine = progress.queue.line?.trim() || undefined;
  const finished = progress.total > 0 && harnessLeft === 0;
  // Nothing accepted and everything cancelled is not «всё принято».
  const allDone = finished && progress.done > 0;
  const allCancelled = finished && progress.done === 0;
  const story = storySentence({
    view,
    running,
    t,
    lang,
    standing,
    allDone,
    yours,
    cancelled: overall.cancelled,
    outsideLeft,
  });
  const problems = problemsOf(view, steps, t, lang, standing, standingLine);

  return (
    <section
      className="hui hui-overview hui:grid hui:gap-4 hui:bg-transparent"
      aria-label={o.label}
      lang={lang}
    >
      {view.forecast ? <ForecastRings forecast={view.forecast} lang={lang} now={clock} /> : null}
      <Card data-testid="hero" className="hui-hero">
        <CardContent className="hui:gap-2 hui:pt-4">
          <h2 className="hui:text-xl hui:leading-snug hui:font-semibold" data-testid="story">
            {story}
          </h2>
          <p className="hui-lead hui:text-muted-foreground" data-testid="sentence">
            {sentence}
          </p>
          <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-2 hui-header">
            <Badge
              tone={progress.queue.paused || standing ? 'warn' : allCancelled ? 'neutral' : 'ok'}
              data-testid="queue-state"
            >
              {progress.queue.paused
                ? o.queuePaused(progress.queue.reason ?? '')
                : standing
                  ? o.queueStanding
                  : allCancelled
                    ? o.queueCancelled
                    : allDone
                      ? outsideLeft
                        ? o.queueHarnessDone
                        : o.queueDone
                      : o.queueRunning}
            </Badge>
            {progress.queue.paused ? (
              <span data-status="blocked" data-testid="queue-who" className="hui:text-sm">
                {progress.queue.detail ? <span>{progress.queue.detail} — </span> : null}
                <span className="hui-who">
                  {o.queueWho(
                    actorLabel(t, progress.queue.actor),
                    progress.queue.action ? label(t.action, progress.queue.action) : '',
                  )}
                </span>
              </span>
            ) : standing ? (
              <span data-status="blocked" data-testid="queue-who" className="hui:text-sm">
                {standingLine ? (
                  <>
                    {standingLine}
                    {progress.queue.restartBy ? (
                      <>
                        {' — '}
                        <span className="hui-who">
                          {t.r4.queueBy(actorLabel(t, progress.queue.restartBy))}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    {o.standingWhy} — <span className="hui-who">{o.standingWho}</span>
                  </>
                )}
              </span>
            ) : null}
            {standingLine && !standing ? (
              <span className="hui:text-sm" data-testid="queue-line">
                {standingLine}
              </span>
            ) : null}
            <span className="hui:text-sm hui:text-muted-foreground">
              {o.acceptedOf(progress.done, progress.total)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Block t={t} title={o.scopeTitle} testid="scope" term="stage">
        <p className="hui:text-sm" data-testid="scope-counts">
          {view.forecast
            ? t.r4.harnessCounts(progress.done, progress.total, overall.running, overall.waiting)
            : o.scopeCounts(overall.done, overall.total, overall.running, overall.waiting)}
          {overall.cancelled ? ' ' + o.scopeCancelled(overall.cancelled) : ''}
          {outsideLeft ? ' ' + o.scopeOutside(outsideLeft) : ''}
        </p>
        {view.forecast ? null : (
          <p className="hui:text-xs hui:text-muted-foreground" data-testid="forecast-missing">
            {view.viewRevision >= 4 ? t.forecast.none : t.forecast.fallback}
          </p>
        )}
        {view.forecast ? null : (
          <>
            <Progress
              value={overall.done}
              max={overall.total}
              label={o.acceptedOf(overall.done, overall.total)}
              segments={[
                { value: overall.running, className: 'hui:bg-primary' },
                { value: overall.waiting, className: 'hui:bg-wait' },
                { value: overall.cancelled, className: 'hui:bg-muted-foreground' },
              ]}
            />
            <ul
              className="hui:flex hui:list-none hui:flex-wrap hui:gap-x-4 hui:gap-y-1 hui:text-xs hui:text-muted-foreground"
              aria-hidden="true"
            >
              <li className="hui:flex hui:items-center hui:gap-1.5">
                <span className="hui:inline-block hui:size-2.5 hui:rounded-full hui:bg-ok" />
                {o.legendDone}
              </li>
              <li className="hui:flex hui:items-center hui:gap-1.5">
                <span className="hui:inline-block hui:size-2.5 hui:rounded-full hui:bg-primary" />
                {o.legendRunning}
              </li>
              <li className="hui:flex hui:items-center hui:gap-1.5">
                <span className="hui:inline-block hui:size-2.5 hui:rounded-full hui:bg-wait" />
                {o.legendWaiting}
              </li>
              {overall.cancelled ? (
                <li className="hui:flex hui:items-center hui:gap-1.5">
                  <span className="hui:inline-block hui:size-2.5 hui:rounded-full hui:bg-muted-foreground" />
                  {o.legendCancelled}
                </li>
              ) : null}
              {overall.outside ? (
                <li className="hui:flex hui:items-center hui:gap-1.5">
                  <span className="hui:inline-block hui:size-2.5 hui:rounded-full hui:bg-track" />
                  {o.legendOutside}
                </li>
              ) : null}
            </ul>
            <p className="hui:text-sm" data-testid="eta">
              {unfinished <= 0
                ? o.etaNothingLeft
                : left.range
                  ? o.etaLeft(formatRange(left.range, lang), left.works)
                  : view.history.totals
                    ? o.etaUnknown(MIN_ATTEMPT_SAMPLES)
                    : o.etaNoTotals}
            </p>
            {left.range && left.average ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="eta-basis">
                {o.etaBasis(formatRough(left.average.ms, lang), left.average.samples)}
              </p>
            ) : null}
          </>
        )}
        {view.works.length ? (
          <ol className="hui-plan hui:grid hui:gap-2" data-testid="plan">
            {view.works.map((w) => (
              <li
                key={w.id}
                className={
                  'hui-plan-step hui:flex hui:flex-wrap hui:items-center hui:gap-x-2 hui:gap-y-1' +
                  (SLOT_STAGES.has(w.stage.name) ? ' hui-current' : '')
                }
              >
                <WorkRef id={w.id} {...links}>
                  <strong>{workName(view, w.id)}</strong>
                </WorkRef>
                {w.title && workName(view, w.id) !== w.title ? (
                  <span className="hui:text-sm hui:text-muted-foreground">
                    {titleRest(w.title)}
                  </span>
                ) : null}
                <StageStatus w={w} lang={lang} linkProps={links} />
                <WorkEta
                  w={w}
                  t={t}
                  lang={lang}
                  clock={clock}
                  average={average}
                  forecast={view.forecast !== undefined}
                />
                {w.dependsOn?.length ? (
                  <span className="hui:text-sm hui:text-muted-foreground">
                    {o.after(w.dependsOn.map((id) => workName(view, id)).join(', '))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        {view.truncated?.works ? <p className="hui-muted">{o.planClipped}</p> : null}
        {scope ? (
          outside.length || overall.outsideUnlisted ? (
            <>
              {outside.length ? (
                <div data-testid="outside">
                  <h4 className="hui:text-sm hui:font-semibold">
                    {o.outsideTitle(outside.length)}
                  </h4>
                  <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-1">
                    {outside.map((task) => (
                      <li
                        key={task.id}
                        className="hui:flex hui:flex-wrap hui:items-center hui:gap-2 hui:text-sm"
                      >
                        <strong>{taskName(task)}</strong>
                        <Badge tone="outline">{label(o.outsideState, task.state)}</Badge>
                        {task.plain ? (
                          <span className="hui:text-muted-foreground">{task.plain}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {overall.outsideUnlisted ? (
                <p className="hui-muted" data-testid="scope-clipped">
                  {t.r4.scopeClipped(overall.outsideUnlisted)}
                </p>
              ) : null}
            </>
          ) : null
        ) : (
          <p className="hui:text-xs hui:text-muted-foreground" data-testid="scope-missing">
            {view.truncated?.scope ? t.r4.scopeDropped(view.truncated.scope) : o.scopeMissing}
          </p>
        )}
      </Block>

      <div className="hui:grid hui:gap-4 hui:lg:grid-cols-2">
        <Block t={t} title={o.needsYou(yours)} testid="needs-you" term="decision">
          {yours === 0 && steps.unlistedAnswers.length === 0 && hiddenWaiting === 0 ? (
            <p className="hui-muted">
              {clipped
                ? t.header.unknownClipped
                : oddState
                  ? o.unknownQuestionState
                  : o.noQuestions}
            </p>
          ) : (
            <ul className="hui-list">
              {asking.map((q) => (
                <QuestionItem
                  key={q.requestId}
                  q={q}
                  view={view}
                  t={t}
                  lang={lang}
                  links={links}
                  after={steps.questionAfter[q.workId]}
                />
              ))}
              {sourceQuestions.map((q) => (
                <SourceQuestionItem
                  key={q.connector + '\0' + q.id}
                  q={q}
                  t={t}
                  lang={lang}
                  timeZone={timeZone}
                  now={clock}
                />
              ))}
              {steps.operator.map((s, i) => (
                <li key={'d' + i} className="hui-item" data-kind="decision" data-status="blocked">
                  <Badge tone="warn">{o.kindDecision}</Badge>{' '}
                  <StepHead s={s} t={t} view={view} links={links} />
                  <span className="hui-sr">
                    {' '}
                    <span className="hui-who">{t.blocker.whoActs(actorLabel(t, s.actor))}</span>
                  </span>
                  {s.plain && s.action ? (
                    <div>
                      {o.why} {s.plain}
                    </div>
                  ) : null}
                  {s.action === 'reset-attempts'
                    ? s.workIds.map((id) => {
                        const w = view.works.find((x) => x.id === id);
                        return w?.attempts.line ? (
                          <div key={id} className="hui-muted" data-testid="decision-attempts">
                            {o.attempts} <AttemptsText line={w.attempts.line} t={t} />
                          </div>
                        ) : null;
                      })
                    : null}
                  {s.after.length ? (
                    <div data-testid="lead-first">
                      <strong>
                        {s.ordered &&
                        !(
                          s.action === 'reset-attempts' &&
                          s.after.every(
                            (f) =>
                              f.actor === 'lead' &&
                              f.code !== undefined &&
                              LEAD_FIRST_CODES.has(f.code),
                          )
                        )
                          ? t.r4.leadFirstOrdered(
                              s.after
                                .map((f) => t.r4.actorDoes(actorLabel(t, f.actor), stepWhat(f, t)))
                                .join('; '),
                            )
                          : o.leadFirst(s.after.map((f) => stepWhat(f, t)).join('; '))}
                      </strong>
                    </div>
                  ) : null}
                  {s.action === 'reset-attempts' && s.workIds.length ? (
                    <div className="hui-muted">{o.howAskLead}</div>
                  ) : null}
                  <StepDetails
                    s={s}
                    t={t}
                    timeZone={timeZone}
                    now={now}
                    records={s.records}
                    workIds={s.workIds}
                    command={
                      s.action === 'reset-attempts' && s.workIds.length
                        ? o.resetCommand(s.workIds[0]!)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {hiddenWaiting ? (
            <p data-testid="unlisted-waiting">{o.unlistedWaiting(hiddenWaiting)}</p>
          ) : null}
          {steps.unlistedAnswers.length ? (
            <p data-testid="unlisted-answers">
              {o.unlistedAnswers(steps.unlistedAnswers.map((id) => workName(view, id)).join(', '))}
            </p>
          ) : null}
          <Clipped n={view.truncated?.questions} t={t} />
          {view.truncated?.sourceQuestions ? (
            <p className="hui-muted">{t.r4.sourceClipped(view.truncated.sourceQuestions)}</p>
          ) : null}
          {steps.operator.some((s) => s.action === 'reset-attempts') ? (
            <div className="hui-terms">
              <Term id="attempt" t={t} named />
              <Term id="failureBucket" t={t} named />
            </div>
          ) : null}
        </Block>

        <Block t={t} title={o.problems(problems.length)} testid="problems" term="failureBucket">
          {problems.length === 0 ? (
            <p className="hui-muted">{o.noProblems}</p>
          ) : (
            <ul className="hui-list">
              {problems.map((p, i) => (
                <li key={i} className="hui-item" data-status={p.blocked ? 'blocked' : undefined}>
                  <Badge tone={p.tone}>{p.kind}</Badge>{' '}
                  {p.workId ? (
                    <>
                      <WorkRef id={p.workId} {...links}>
                        <strong>{workName(view, p.workId)}</strong>
                      </WorkRef>
                      {': '}
                    </>
                  ) : null}
                  <span>{p.text}</span>
                  {p.who ? (
                    <>
                      {' — '}
                      <span className="hui-who">{p.who}</span>
                    </>
                  ) : null}
                  <Codes t={t} codes={p.codes} />
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <Block
        t={t}
        title={o.now(progress.running, view.settings.concurrency)}
        testid="now"
        term="attempt"
      >
        {running.length === 0 && progress.running === 0 ? (
          <p className="hui-muted">{o.nothingRunning}</p>
        ) : (
          <ul className="hui-list">
            {running.map((w) => {
              const typical = formatTypical(w.stage.typical, lang);
              return (
                <li key={w.id} className="hui-item">
                  <div className="hui-row">
                    <WorkRef id={w.id} {...links}>
                      <strong>{workName(view, w.id)}</strong>
                    </WorkRef>
                    <Badge tone="info">{stageLabel(w.stage.name, lang)}</Badge>
                    {w.stage.step ? <Codes t={t} codes={[w.stage.step]} /> : null}
                    {w.liveness && w.liveness !== 'active' ? (
                      <Badge tone="warn">{label(t.liveness, w.liveness)}</Badge>
                    ) : null}
                    {w.stage.since ? (
                      <span className="hui-muted">
                        {o.stageFor(formatElapsed(w.stage.since, clock, lang))}
                      </span>
                    ) : null}
                    {typical ? (
                      <span className="hui-muted" data-testid="typical">
                        {typical}
                      </span>
                    ) : null}
                  </div>
                  <StageLeftLine w={w} t={t} lang={lang} clock={clock} />
                  <div className="hui-muted">
                    {w.attempts.line ? (
                      <AttemptsText line={w.attempts.line} t={t} />
                    ) : (
                      o.attemptsShort(w.attempts.used, w.attempts.max, w.attempts.left)
                    )}
                    {w.attempts.lastFailure
                      ? `; ${o.lastStopped(w.attempts.lastFailure.plain)}${countedWords(w, t)}`
                      : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {running.some((w) => formatTypical(w.stage.typical, lang)) ? (
          <div className="hui-terms">
            <Term id="typical" t={t} named />
          </div>
        ) : null}
        {progress.running > running.length ? (
          <p className="hui-muted" data-testid="running-truncated">
            {o.runningUnlisted(progress.running - running.length)}
          </p>
        ) : null}
      </Block>

      <Block t={t} title={o.others(others)} testid="decisions" term="lead">
        {yours ? (
          <p className="hui-muted" data-testid="yours-above">
            {o.yoursAbove(yours)}
          </p>
        ) : null}
        {others === 0 ? (
          <p className="hui-muted">
            {view.truncated?.escalations ? t.header.unknownClipped : o.noOthers}
          </p>
        ) : null}
        {steps.lead.length || leadAsking.length ? (
          <div data-testid="by-lead">
            <h4 className="hui-subtitle">{o.byLead(steps.lead.length + leadAsking.length)}</h4>
            <p className="hui-muted">{o.leadNote}</p>
            {leadAsking.length ? (
              <ul className="hui-list" data-testid="lead-questions">
                {leadAsking.map((q) => (
                  <QuestionItem
                    key={q.requestId}
                    q={q}
                    view={view}
                    t={t}
                    lang={lang}
                    links={links}
                    byLead
                  />
                ))}
              </ul>
            ) : null}
            <StepList steps={steps.lead} t={t} view={view} links={links} {...{ timeZone, now }} />
          </div>
        ) : null}
        {otherActors.map((a) => {
          const list = steps.other.filter((s) => s.actor === a);
          return (
            <div key={a} data-testid="by-other">
              <h4 className="hui-subtitle">{o.byOther(actorLabel(t, a), list.length)}</h4>
              <StepList steps={list} t={t} view={view} links={links} {...{ timeZone, now }} />
            </div>
          );
        })}
        {steps.dependencies.length ? (
          <div data-testid="by-dependency">
            <div className="hui-heading">
              <h4 className="hui-subtitle">{o.byDependency(steps.dependencies.length)}</h4>
              <Term id="waitsWork" t={t} />
            </div>
            <ul className="hui-list">
              {steps.dependencies.map((d) => (
                <DependencyLine
                  key={d.workId}
                  d={d}
                  steps={steps}
                  t={t}
                  view={view}
                  links={links}
                  lang={lang}
                />
              ))}
            </ul>
          </div>
        ) : null}
        <Clipped n={view.truncated?.escalations} t={t} />
      </Block>

      <Block t={t} title={o.waiting} testid="waiting" term="waitsQueue">
        {steps.queue.length === 0 ? (
          <p className="hui-muted">{o.noWaiting}</p>
        ) : (
          <ul className="hui-list">
            {steps.queue.map((q) => {
              const w = view.works.find((x) => x.id === q.workId)!;
              return (
                <li key={q.workId} className="hui-item">
                  <WorkRef id={q.workId} {...links}>
                    <strong>{workName(view, q.workId)}</strong>
                  </WorkRef>{' '}
                  <Badge tone="outline">{stageLabel(w.stage.name, lang)}</Badge>
                  <ul className="hui-list hui-nested">
                    {q.unexplained ? (
                      <li className="hui-item" data-status="blocked">
                        {t.blocker.noReason(w.stage.name)} —{' '}
                        <span className="hui-who">{t.blocker.whoActs(t.unknown)}</span>
                      </li>
                    ) : (
                      q.blockers.map((b, i) => <BlockerLine key={i} b={b} t={t} />)
                    )}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      {otherQuestions.length ? (
        <Block t={t} title={o.otherQuestions} testid="other-questions" className="hui-secondary">
          <ul className="hui-list">
            {otherQuestions.map((q) => (
              <li key={q.requestId} className="hui-item hui-muted">
                <WorkRef id={q.workId} {...links}>
                  <strong>{workName(view, q.workId)}</strong>
                </WorkRef>
                {q.title ? <span className="hui:text-foreground">: {q.title}</span> : null}
                <div>{questionStatus(q, lang).text}</div>
                <AnswerBasisLine q={q} t={t} timeZone={timeZone} now={clock} />
                <QuestionExtras q={q} t={t} />
                <Codes t={t} codes={[q.requestId]} />
              </li>
            ))}
          </ul>
          {otherQuestions.some((q) => q.answerBasis) ? (
            <div className="hui-terms">
              <Term id="answerBasis" t={t} named />
            </div>
          ) : null}
        </Block>
      ) : null}

      {accepted.length || progress.done ? (
        <Block t={t} title={o.accepted(progress.done)} testid="accepted" term="accepted">
          <ul className="hui-list">
            {accepted.map((w) => (
              <li key={w.id} className="hui-item">
                <WorkRef id={w.id} {...links}>
                  <strong>{workName(view, w.id)}</strong>
                </WorkRef>{' '}
                <AcceptedLine
                  w={w}
                  lang={lang}
                  linkProps={links}
                  timeZone={timeZone}
                  now={clock}
                  explain={false}
                />
                <Codes t={t} codes={[w.target!.ref]} />
              </li>
            ))}
          </ul>
          {accepted.length ? <Term id="remote" t={t} named /> : null}
          {progress.done > accepted.length ? (
            <p className="hui-muted" data-testid="accepted-unlisted">
              {o.acceptedUnlisted(progress.done - accepted.length, Boolean(view.truncated?.works))}
            </p>
          ) : null}
        </Block>
      ) : null}

      <dl className="hui-grid hui-stats" data-testid="health">
        <div>
          <dt>{o.budget}</dt>
          {budget ? (
            <dd className={budget.state === 'within' ? '' : 'hui-bad'}>
              {formatUsd(budget.spentUsd, lang)}
              {budget.limitUsd !== undefined ? ` ${t.ofLimit(usd(budget.limitUsd))}` : ''} (
              {label(t.budgetScope, budget.scope)}
              {budget.id ? ` ${budget.id}` : ''}: {label(t.budgetState, budget.state)})
            </dd>
          ) : (
            <dd data-testid="no-budget">
              {health.budgeting === 'off' ? o.noBudget : o.budgetUnknown};{' '}
              {o.spent(formatUsd(health.spentTotalUsd, lang))}
            </dd>
          )}
        </div>
        <div>
          <dt>{o.controller}</dt>
          <dd className={health.controller.present ? '' : 'hui-bad'}>
            {health.controller.present ? o.controllerPresent : o.controllerAbsent}
          </dd>
        </div>
        <div>
          <dt>{o.stalled}</dt>
          <dd className={health.stalledAttempts ? 'hui-bad' : ''}>{health.stalledAttempts}</dd>
        </div>
        <div>
          <dt>{o.drift}</dt>
          <dd>
            {health.drift.drifted}
            {health.drift.unavailable ? ` (${o.driftNotChecked(health.drift.unavailable)})` : ''}
          </dd>
        </div>
      </dl>
      <div className="hui-terms">
        <Term id="controller" t={t} named />
        <Term id="drift" t={t} named />
        <Term id="lowerBound" t={t} named />
      </div>
      {health.warnings.length ? (
        <ul className="hui-list hui-secondary" data-testid="warnings" aria-label={o.warnings}>
          {health.warnings.map((w, i) => (
            <li key={i} className="hui-item hui-muted">
              {w.message} <Codes t={t} codes={[w.code]} />
            </li>
          ))}
        </ul>
      ) : null}
      <footer className="hui-muted hui-footer" data-testid="footer">
        {footerSentence(view.generatedAt, lang, timeZone, now)}
      </footer>
    </section>
  );
}

/** «; попытка засчитана» / «; не засчитана» when the harness says it (revision 4), else nothing. */
function countedWords(w: WorkView, t: Dict): string {
  const c = w.attempts.lastFailure?.counted;
  return c === undefined ? '' : `; ${c ? t.r4.counted : t.r4.notCounted}`;
}

/**
 * An owner question the lead wrote in the task tracker (revision 4,
 * `sourceQuestions[]`): the question, its options and recommendation, the
 * provisional answer the work goes on with, and a link to answer it there.
 */
export function SourceQuestionItem({
  q,
  t,
  lang,
  timeZone,
  now,
}: {
  q: SourceQuestion;
  t: Dict;
  lang: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  const r = t.r4;
  const href = safeHttpUrl(q.url);
  const when = formatWhen(q.readAt, lang, timeZone, now);
  const head = q.title?.trim() || q.question?.trim() || q.ref;
  return (
    <li className="hui-item hui-question" data-kind="source-question" data-status="blocked">
      <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-2">
        <Badge tone="info">{r.kindSource}</Badge>
        <strong>{head}</strong>
      </div>
      {q.question?.trim() && q.question.trim() !== head ? (
        <p className="hui:mt-1 hui:font-medium">{q.question}</p>
      ) : null}
      {q.options?.length ? (
        <div>
          <p className="hui:mt-1">{r.options}</p>
          <ul className="hui:mt-1 hui:grid hui:list-disc hui:gap-1 hui:ps-5">
            {q.options.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {q.recommendation?.trim() ? (
        <p className="hui:mt-1" data-testid="source-recommendation">
          {r.sourceRecommendation} {q.recommendation}
        </p>
      ) : null}
      {q.provisional?.trim() ? (
        <p className="hui:mt-1">
          {r.sourceProvisional} {q.provisional}
        </p>
      ) : null}
      {q.tasks?.length ? <p className="hui-muted">{r.sourceTasks(q.tasks.join(', '))}</p> : null}
      <p className="hui-muted">
        {r.sourceAnswerThere}{' '}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" data-testid="source-link">
            {r.sourceOpen(q.ref)}
          </a>
        ) : (
          <span>{r.sourceRef(q.ref)}</span>
        )}
      </p>
      <p className="hui-muted hui:text-xs">{r.sourceReadAt(when ?? t.unknown)}</p>
    </li>
  );
}

/** The rest of a title after its key («WEB-1: Каталог» → «Каталог»). */
const titleRest = (title: string) => title.replace(/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,23}:\s+/u, '');

/** The first line of the Overview: one plain sentence of what is happening. */
function storySentence({
  view,
  running,
  t,
  lang,
  standing,
  allDone,
  yours,
  cancelled,
  outsideLeft,
}: {
  view: OperatorView;
  running: WorkView[];
  t: Dict;
  lang: Lang;
  standing: boolean;
  allDone: boolean;
  yours: number;
  cancelled: number;
  outsideLeft: number;
}): string {
  const s = t.story;
  if (view.progress.total === 0) return outsideLeft ? s.onlyOutside(outsideLeft) : s.empty;
  if (allDone)
    return outsideLeft
      ? s.harnessDone(view.progress.done, outsideLeft)
      : s.allDone(view.progress.done, view.progress.total - cancelled, cancelled);
  if (view.progress.total > 0 && view.progress.done === 0 && cancelled >= view.progress.total)
    return s.allCancelled(cancelled);
  if (running.length)
    return s.running(
      running.map((w) => s.workAt(workName(view, w.id), stageLabel(w.stage.name, lang))),
      Math.max(0, view.progress.running - running.length),
    );
  if (view.progress.running > 0) return s.runningUnlisted(view.progress.running);
  if (view.progress.queue.paused) return s.paused;
  // Revision 4: a plan review in a live run is the harness's move, not a wait.
  const reviewing = view.works.filter((w) => HARNESS_STAGES.has(w.stage.name));
  if (reviewing.length) return t.r4.planReview(reviewing.map((w) => workName(view, w.id)));
  if (yours) return s.waitsYou;
  if (standing) return s.standing;
  return s.waitsOthers;
}

interface Problem {
  kind: string;
  tone: Tone;
  workId?: string;
  text: string;
  who?: string;
  codes: (string | undefined)[];
  blocked?: boolean;
}

/**
 * «Проблемы по ходу»: what went wrong on the way, in plain words: the last
 * failed attempt of each unfinished work, stops with their reason and who
 * acts, a queue that stands, stalled attempts, environment failures, budget
 * and drift. Every line is a view record; codes only under «подробности».
 */
function problemsOf(
  view: OperatorView,
  steps: NextSteps,
  t: Dict,
  lang: Lang,
  standing: boolean,
  standingLine?: string,
): Problem[] {
  const p = t.problems;
  const out: Problem[] = [];
  if (standing)
    out.push({
      kind: p.kindQueue,
      tone: 'warn',
      text: standingLine ?? p.standing,
      who: t.blocker.whoActs(actorLabel(t, view.progress.queue.restartBy ?? 'lead')),
      codes: [],
      blocked: true,
    });
  for (const w of view.works) {
    if (w.stage.name === 'done' || w.target !== undefined || w.stage.name === 'cancelled') continue;
    const f = w.attempts.lastFailure;
    const lead = leadStopOf(w, view.viewRevision);
    if (f && lead)
      out.push({
        kind: label(t.bucket, f.bucket),
        tone: 'warn',
        workId: w.id,
        text:
          (lead.env ? p.writerEnv(f.attempt) : t.r4.leadStop(f.attempt)) +
          // Revision 4: the harness's own sentence of the stop; before it, the writer's words go to «подробности».
          (f.kind !== undefined && f.plain.trim() ? ` (${withWorkNames(view, f.plain)})` : ''),
        who: t.blocker.whoActs(actorLabel(t, w.stage.needs?.actor ?? 'lead')),
        codes: [f.bucket, f.kind, lead.summary],
        blocked: true,
      });
    else if (f)
      out.push({
        kind: label(t.bucket, f.bucket),
        tone: 'bad',
        workId: w.id,
        text: p.lastFailure(f.attempt, withWorkNames(view, f.plain)) + countedWords(w, t),
        codes: [f.bucket, f.kind],
      });
    if (w.stage.name === 'stopped') {
      const b = w.blockers.find((x) => x.actor !== null) ?? w.blockers[0];
      // Who acts: the same people as «Нужно от вас» and «Остальные ожидания».
      const actors = actorsOn(steps, w.id, view);
      const needs = w.stage.needs?.actor;
      out.push({
        kind: p.kindStopped,
        tone: 'warn',
        workId: w.id,
        text: b?.plain?.trim() ? withWorkNames(view, b.plain) : p.stoppedNoReason,
        who: actors.length
          ? t.blocker.whoActs(actors.map((a) => actorLabel(t, a)).join(t.overview.then))
          : needs
            ? t.blocker.whoActs(actorLabel(t, needs))
            : t.blocker.whoActs(t.unknown),
        codes: w.blockers.map((x) => x.code),
        blocked: true,
      });
    }
  }
  const h = view.health;
  if (h.stalledAttempts)
    out.push({ kind: p.kindHealth, tone: 'bad', text: p.stalled(h.stalledAttempts), codes: [] });
  if (h.environmentFailures)
    out.push({
      kind: label(t.bucket, 'environment'),
      tone: 'warn',
      text: p.environment(h.environmentFailures),
      codes: [],
    });
  for (const b of h.budgets)
    if (b.state === 'exceeded')
      out.push({
        kind: p.kindBudget,
        tone: 'bad',
        text: p.budgetExceeded(formatUsd(b.spentUsd, lang), label(t.budgetScope, b.scope)),
        codes: [],
      });
  if (h.drift.drifted)
    out.push({ kind: p.kindDrift, tone: 'warn', text: p.drifted(h.drift.drifted), codes: [] });
  return out;
}

/**
 * A question with its full text in the panel (F-Y): the question, what
 * changes, who may answer, its importance — never a command to run.
 */
export function QuestionItem({
  q,
  view,
  t,
  lang,
  links,
  byLead,
  after,
}: {
  q: OperatorQuestion;
  view: Pick<OperatorView, 'works'>;
  t: Dict;
  lang: Lang;
  links: Links;
  /** The lead answers it by the policy (F-W). */
  byLead?: boolean;
  /** Steps the harness orders before this answer (revision 4, `blockers[].step`). */
  after?: Step[] | undefined;
}) {
  return (
    <li className="hui-item hui-question" data-kind="question">
      <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-2">
        <Badge tone="info">{t.overview.kindQuestion}</Badge>
        <Badge tone="warn">{t.question.severity(q.severity)}</Badge>
        <WorkRef id={q.workId} {...links}>
          <strong>{workName(view, q.workId)}</strong>
        </WorkRef>
      </div>
      {q.title ? <p className="hui:mt-1 hui:font-medium">{q.title}</p> : null}
      {q.plain ? (
        <p>
          {t.question.whatChanges} {q.plain}
        </p>
      ) : null}
      <QuestionExtras q={q} t={t} />
      {after?.length ? (
        <p data-testid="question-after">
          <strong>
            {t.r4.leadFirstOrdered(
              after.map((f) => t.r4.actorDoes(actorLabel(t, f.actor), stepWhat(f, t))).join('; '),
            )}
          </strong>
        </p>
      ) : null}
      <p className="hui-muted">{byLead ? t.question.leadAnswers : questionStatus(q, lang).text}</p>
      <Codes t={t} codes={[q.requestId, t.question.version(q.version)]} />
    </li>
  );
}

type Links = Pick<ScreenProps, 'onOpenWork' | 'workHref'>;

/** What a step asks for, as text: the action in words, else the harness reason, else the code. */
function stepWhat(s: Step, t: Dict): string {
  const action = s.action !== undefined ? knownLabel(t.action, s.action) : undefined;
  return action ?? s.plain ?? s.action ?? s.code ?? t.unknown;
}

/** «Сбросить попытки — WEB-1»: what to do, then the works it is about. */
function StepHead({ s, t, view, links }: { s: Step; t: Dict; view: OperatorView; links: Links }) {
  const action = s.action !== undefined ? knownLabel(t.action, s.action) : undefined;
  const head = action ?? s.plain;
  return (
    <>
      <strong>
        {head ? head.charAt(0).toUpperCase() + head.slice(1) : t.overview.unknownAction}
      </strong>
      {' — '}
      {s.workIds.length ? (
        s.workIds.map((id, i) => (
          <span key={id}>
            {i ? ', ' : ''}
            <WorkRef id={id} {...links}>
              <strong>{workName(view, id)}</strong>
            </WorkRef>
          </span>
        ))
      ) : (
        <span>{s.subject ? t.overview.otherSubject : t.unknown}</span>
      )}
      {!head || (!s.workIds.length && s.subject) ? (
        <Codes t={t} codes={[s.action ?? s.code, s.subject]} />
      ) : null}
    </>
  );
}

/** «подробности»: the codes and records behind a line, for whoever needs them. */
function StepDetails({
  s,
  t,
  timeZone,
  now,
  records,
  workIds,
  command,
}: {
  s?: Step;
  t: Dict;
  timeZone?: string | undefined;
  now?: number | undefined;
  records: Step['records'];
  workIds: string[];
  /** The harness command behind the step, for whoever runs it (the lead). */
  command?: string | undefined;
}) {
  const o = t.overview;
  return (
    <details className="hui-term" data-testid="step-details">
      <summary>{o.details}</summary>
      <ul className="hui-list hui-nested">
        {workIds.length ? (
          <li className="hui-muted">
            {o.workIds}{' '}
            {workIds.map((id, i) => (
              <span key={id}>
                {i ? ', ' : ''}
                <code>{id}</code>
              </span>
            ))}
          </li>
        ) : null}
        {records.map((r, i) => (
          <li key={i} className="hui-muted">
            {label(o.recordSource, r.source)}: {r.code ? <code>{r.code}</code> : null}{' '}
            {r.actor === null ? t.blocker.nobody : t.blocker.whoActs(actorLabel(t, r.actor))}
            {r.action ? (
              <>
                {' → '}
                <code>{r.action}</code>
              </>
            ) : null}
          </li>
        ))}
        {s?.since ? <li className="hui-muted">{clockOf(s.since, t, timeZone, now)}</li> : null}
        {command ? (
          <li className="hui-muted">
            {o.command} <code>{command}</code>
          </li>
        ) : null}
      </ul>
    </details>
  );
}

function StepList({
  steps,
  t,
  view,
  links,
  timeZone,
  now,
}: {
  steps: Step[];
  t: Dict;
  view: OperatorView;
  links: Links;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  return (
    <ul className="hui-list">
      {steps.map((s, i) => (
        <li key={i} className="hui-item" data-status="blocked">
          <StepHead s={s} t={t} view={view} links={links} />
          {s.plain && s.action ? (
            <div>
              {t.overview.why} {s.plain}
            </div>
          ) : null}
          <span className="hui-sr">
            {' '}
            <span className="hui-who">{t.blocker.whoActs(actorLabel(t, s.actor))}</span>
          </span>
          <StepDetails
            s={s}
            t={t}
            timeZone={timeZone}
            now={now}
            records={s.records}
            workIds={s.workIds}
          />
        </li>
      ))}
    </ul>
  );
}

/** «WEB-2 ждёт WEB-1 — …; дальше по ней действует: ведущий, затем вы». */
function DependencyLine({
  d,
  steps,
  t,
  view,
  links,
  lang,
}: {
  d: DependencyWait;
  steps: NextSteps;
  t: Dict;
  view: OperatorView;
  links: Links;
  lang: Lang;
}) {
  const o = t.overview;
  return (
    <li className="hui-item" data-status="blocked">
      <WorkRef id={d.workId} {...links}>
        <strong>{workName(view, d.workId)}</strong>
      </WorkRef>{' '}
      {o.waitsFor}{' '}
      {d.on.map((id, i) => {
        const st = dependencyState(view, steps, id);
        const stage = (name: string) => stageLabel(name, lang);
        const who =
          st.kind === 'actors'
            ? o.nextThere(st.actors.map((a) => actorLabel(t, a)).join(o.then))
            : st.kind === 'running'
              ? o.runningThere(stage(st.stage))
              : st.kind === 'queue'
                ? o.nobodyThere
                : st.kind === 'waits'
                  ? o.waitsThere
                  : st.kind === 'cancelled'
                    ? o.cancelledThere
                    : o.unknownThere(st.stage === undefined ? undefined : stage(st.stage));
        return (
          <span key={id}>
            {i ? '; ' : ''}
            <WorkRef id={id} {...links}>
              <strong>{workName(view, id)}</strong>
            </WorkRef>{' '}
            <span className="hui-who">({who})</span>
          </span>
        );
      })}
      {d.plain ? <div className="hui-muted">{withWorkNames(view, d.plain)}</div> : null}
      <StepDetails t={t} records={d.records} workIds={[d.workId, ...d.on]} />
    </li>
  );
}
