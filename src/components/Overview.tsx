// Overview screen: what needs the operator, what runs now, what waits and
// why, progress and health at a glance. Pure render of an `OperatorView`; no
// fetching, no writes. Counts come from the view's aggregate sections (never
// from the possibly truncated lists). Hosts theme it through `--hui-*`.

import type { OperatorView, ViewHealth } from '../model/view.ts';
import {
  KNOWN_QUESTION_STATES,
  SLOT_STAGES,
  formatElapsed,
  formatTypical,
  formatUsd,
  questionStatus,
  stageLabel,
  usd,
} from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import { dict, knownLabel, label, type Dict, type Lang } from '../model/dict.ts';
import { footerSentence, headerSentence } from '../model/i18n.ts';
import {
  dependencyState,
  nextSteps,
  withWorkNames,
  workName,
  type DependencyWait,
  type NextSteps,
  type Step,
} from '../model/steps.ts';
import {
  AcceptedLine,
  AnswerBasisLine,
  AttemptsText,
  BlockerLine,
  Clipped,
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
  const asking = steps.questions;
  const otherQuestions = view.questions.filter((q) => !questionStatus(q).needsAnswer);
  const budget = worstBudget(health);
  // Works listed with a location; the count itself is `progress.done`.
  const accepted = view.works.filter((w) => w.target !== undefined);
  const yours = asking.length + steps.operator.length;
  // Works the harness counts as waiting for you that no item here names.
  const named = new Set([
    ...asking.map((q) => q.workId),
    ...steps.operator.flatMap((s) => s.workIds),
    ...steps.unlistedAnswers,
  ]);
  const hiddenWaiting = Math.max(0, progress.waitingOperator - named.size);
  const others = steps.lead.length + steps.other.length + steps.dependencies.length;
  const otherActors = [...new Set(steps.other.map((s) => s.actor))];
  const count = (stage: string) =>
    Object.hasOwn(progress.byStage, stage) ? Number(progress.byStage[stage]) || 0 : 0;
  const clipped = Boolean(view.truncated?.questions || view.truncated?.escalations);
  const oddState = view.questions.some((q) => !KNOWN_QUESTION_STATES.has(String(q.state)));
  const sentence = headerSentence(
    {
      running: progress.running,
      queued: count('queued'),
      stopped: count('stopped'),
      paused: progress.queue.paused,
      questions: asking.length,
      decisions: steps.operator.length,
      afterLead:
        asking.length === 0 &&
        steps.operator.length > 0 &&
        steps.operator.every((s) => s.after.length > 0),
      waitingOperator: progress.waitingOperator,
      // A clipped list or a question state this build does not know makes the
      // count a floor: the sentence then never says "nothing is needed".
      incomplete: clipped || oddState,
    },
    lang,
  );
  const inspect = (requestId: string) => (
    <code>harness input-show --state &lt;state&gt; --request {requestId}</code>
  );

  return (
    <section className="hui hui-overview" aria-label={o.label} lang={lang}>
      <header className="hui-row hui-header">
        <h2 className="hui-title">Harness</h2>
        <span
          className={'hui-badge ' + (progress.queue.paused ? 'hui-warn' : 'hui-ok')}
          data-testid="queue-state"
        >
          {progress.queue.paused ? o.queuePaused(progress.queue.reason ?? '') : o.queueRunning}
        </span>
        {progress.queue.paused ? (
          <span data-status="blocked" data-testid="queue-who">
            {progress.queue.detail ? <span>{progress.queue.detail} — </span> : null}
            <span className="hui-who">
              {o.queueWho(actorLabel(t, progress.queue.actor), progress.queue.action ?? '')}
            </span>
          </span>
        ) : null}
        <span className="hui-muted">{o.acceptedOf(progress.done, progress.total)}</span>
      </header>
      <p className="hui-lead" data-testid="sentence">
        {sentence}
      </p>

      {view.works.length ? (
        <div className="hui-panel" data-testid="plan">
          <Heading t={t} term="stage">
            {o.plan}
          </Heading>
          <ol className="hui-plan">
            {view.works.map((w) => (
              <li
                key={w.id}
                className={'hui-plan-step' + (SLOT_STAGES.has(w.stage.name) ? ' hui-current' : '')}
              >
                <WorkRef id={w.id} {...links}>
                  <strong>{workName(view, w.id)}</strong>
                </WorkRef>{' '}
                <StageStatus w={w} lang={lang} linkProps={links} />
                {w.dependsOn?.length ? (
                  <span className="hui-muted">
                    {' '}
                    {o.after(w.dependsOn.map((id) => workName(view, id)).join(', '))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {view.truncated?.works ? <p className="hui-muted">{o.planClipped}</p> : null}
        </div>
      ) : null}

      <div className="hui-panel" data-testid="needs-you">
        <Heading t={t} term="decision">
          {o.needsYou(yours)}
        </Heading>
        {yours === 0 && steps.unlistedAnswers.length === 0 && hiddenWaiting === 0 ? (
          <p className="hui-muted">
            {clipped ? t.header.unknownClipped : oddState ? o.unknownQuestionState : o.noQuestions}
          </p>
        ) : (
          <ul className="hui-list">
            {asking.map((q) => (
              <li key={q.requestId} className="hui-item" data-kind="question">
                <span className="hui-badge">{o.kindQuestion}</span>{' '}
                <span className="hui-badge hui-warn">{t.question.severity(q.severity)}</span>{' '}
                <WorkRef id={q.workId} {...links}>
                  <strong>{workName(view, q.workId)}</strong>
                </WorkRef>{' '}
                {q.title ? <span>{q.title}</span> : null}
                {q.plain ? (
                  <div>
                    {t.question.whatChanges} {q.plain}
                  </div>
                ) : null}
                <div className="hui-muted">
                  {questionStatus(q, lang).text} {t.question.full} {inspect(q.requestId)} (
                  {t.question.version(q.version)}).
                </div>
              </li>
            ))}
            {steps.operator.map((s, i) => (
              <li key={'d' + i} className="hui-item" data-kind="decision" data-status="blocked">
                <span className="hui-badge hui-warn">{o.kindDecision}</span>{' '}
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
                    <strong>{o.leadFirst(s.after.map((f) => stepWhat(f, t)).join('; '))}</strong>
                  </div>
                ) : null}
                {s.action === 'reset-attempts' && s.workIds.length ? (
                  <div className="hui-muted">
                    {o.howAsk} <code>{o.resetCommand(s.workIds[0]!)}</code>
                  </div>
                ) : null}
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
        {steps.operator.some((s) => s.action === 'reset-attempts') ? (
          <div className="hui-terms">
            <Term id="attempt" t={t} named />
            <Term id="failureBucket" t={t} named />
          </div>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="now">
        <Heading t={t} term="attempt">
          {o.now(progress.running, view.settings.concurrency)}
        </Heading>
        {running.length === 0 && progress.running === 0 ? (
          <p className="hui-muted">{o.nothingRunning}</p>
        ) : (
          <ul className="hui-list">
            {running.map((w) => (
              <li key={w.id} className="hui-item">
                <div className="hui-row">
                  <WorkRef id={w.id} {...links} />
                  <span className="hui-badge">{stageLabel(w.stage.name, lang)}</span>
                  {w.stage.step ? <code className="hui-muted">{w.stage.step}</code> : null}
                  {w.liveness && w.liveness !== 'active' ? (
                    <span className="hui-badge hui-warn">{label(t.liveness, w.liveness)}</span>
                  ) : null}
                  {w.stage.since ? (
                    <span className="hui-muted">{formatElapsed(w.stage.since, clock, lang)}</span>
                  ) : null}
                  {formatTypical(w.stage.typical, lang) ? (
                    <span className="hui-muted" data-testid="typical">
                      {formatTypical(w.stage.typical, lang)}
                    </span>
                  ) : null}
                </div>
                <div className="hui-muted">
                  {w.attempts.line ? (
                    <AttemptsText line={w.attempts.line} t={t} />
                  ) : (
                    o.attemptsShort(w.attempts.used, w.attempts.max, w.attempts.left)
                  )}
                  {w.attempts.lastFailure ? `; ${o.lastStopped(w.attempts.lastFailure.plain)}` : ''}
                </div>
              </li>
            ))}
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
      </div>

      <div className="hui-panel" data-testid="decisions">
        <Heading t={t} term="lead">
          {o.others(others)}
        </Heading>
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
        {steps.lead.length ? (
          <div data-testid="by-lead">
            <h4 className="hui-subtitle">{o.byLead(steps.lead.length)}</h4>
            <p className="hui-muted">{o.leadNote}</p>
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
      </div>

      <div className="hui-panel" data-testid="waiting">
        <Heading t={t} term="waitsQueue">
          {o.waiting}
        </Heading>
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
                  <span className="hui-badge">{stageLabel(w.stage.name, lang)}</span>
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
      </div>

      {otherQuestions.length ? (
        <div className="hui-panel hui-secondary" data-testid="other-questions">
          <h3 className="hui-subtitle">{o.otherQuestions}</h3>
          <ul className="hui-list">
            {otherQuestions.map((q) => (
              <li key={q.requestId} className="hui-item hui-muted">
                <WorkRef id={q.workId} {...links}>
                  <strong>{workName(view, q.workId)}</strong>
                </WorkRef>{' '}
                <code>{q.requestId}</code>: {questionStatus(q, lang).text}
                <AnswerBasisLine q={q} t={t} timeZone={timeZone} now={clock} />
              </li>
            ))}
          </ul>
          {otherQuestions.some((q) => q.answerBasis) ? (
            <div className="hui-terms">
              <Term id="answerBasis" t={t} named />
            </div>
          ) : null}
        </div>
      ) : null}

      {accepted.length || progress.done ? (
        <div className="hui-panel" data-testid="accepted">
          <Heading t={t} term="accepted">
            {o.accepted(progress.done)}
          </Heading>
          <ul className="hui-list">
            {accepted.map((w) => (
              <li key={w.id} className="hui-item">
                <WorkRef id={w.id} {...links} /> <code className="hui-muted">{w.target!.ref}</code>
                <AcceptedLine
                  w={w}
                  lang={lang}
                  linkProps={links}
                  timeZone={timeZone}
                  now={clock}
                  explain={false}
                />
              </li>
            ))}
          </ul>
          {accepted.length ? <Term id="remote" t={t} named /> : null}
          {progress.done > accepted.length ? (
            <p className="hui-muted" data-testid="accepted-unlisted">
              {o.acceptedUnlisted(progress.done - accepted.length, Boolean(view.truncated?.works))}
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="hui-grid" data-testid="health">
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
            <li key={i} className="hui-item">
              <code className="hui-muted">{w.code}</code> {w.message}
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
        {head ? (
          head.charAt(0).toUpperCase() + head.slice(1)
        ) : (
          <code>{s.action ?? s.code ?? t.unknown}</code>
        )}
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
        <code>{s.subject || t.unknown}</code>
      )}
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
}: {
  s?: Step;
  t: Dict;
  timeZone?: string | undefined;
  now?: number | undefined;
  records: Step['records'];
  workIds: string[];
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
