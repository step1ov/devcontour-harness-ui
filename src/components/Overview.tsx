// Overview screen: what needs the operator, what runs now, what waits and
// why, progress and health at a glance. Pure render of an `OperatorView`; no
// fetching, no writes. Counts come from the view's aggregate sections (never
// from the possibly truncated lists). Hosts theme it through `--hui-*`.

import type { OperatorView, ViewHealth } from '../model/view.ts';
import {
  KNOWN_QUESTION_STATES,
  SLOT_STAGES,
  formatDuration,
  formatElapsed,
  formatUsd,
  questionStatus,
  stageLabel,
  usd,
} from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import { dict, label } from '../model/dict.ts';
import { footerSentence, headerSentence } from '../model/i18n.ts';
import {
  AcceptedLine,
  BlockerLine,
  Heading,
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
  const asking = view.questions.filter((q) => questionStatus(q).needsAnswer);
  const otherQuestions = view.questions.filter((q) => !questionStatus(q).needsAnswer);
  const budget = worstBudget(health);
  // Works listed with a location; the count itself is `progress.done`.
  const accepted = view.works.filter((w) => w.target !== undefined);
  const waiting = view.works.filter(
    (w) => w.blockers.length > 0 || w.stage.name === 'stopped' || w.stage.name === 'blocked',
  );
  const deciding = view.escalations.filter((e) => e.actor === 'operator' || e.actor === 'lead');
  const count = (stage: string) =>
    Object.hasOwn(progress.byStage, stage) ? Number(progress.byStage[stage]) || 0 : 0;
  const sentence = headerSentence(
    {
      running: progress.running,
      queued: count('queued'),
      stopped: count('stopped'),
      paused: progress.queue.paused,
      questions: asking.length,
      decisions: view.escalations.filter((e) => e.actor === 'operator').length,
      waitingOperator: progress.waitingOperator,
      // A clipped list or a question state this build does not know makes the
      // count a floor: the sentence then never says "nothing is needed".
      incomplete:
        Boolean(view.truncated?.questions || view.truncated?.escalations) ||
        view.questions.some((q) => !KNOWN_QUESTION_STATES.has(String(q.state))),
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
                <WorkRef id={w.id} {...links} />{' '}
                <span className="hui-badge">{stageLabel(w.stage.name, lang)}</span>
                {w.dependsOn?.length ? (
                  <span className="hui-muted"> {o.after(w.dependsOn.join(', '))}</span>
                ) : null}
              </li>
            ))}
          </ol>
          {view.truncated?.works ? <p className="hui-muted">{o.planClipped}</p> : null}
        </div>
      ) : null}

      <div className="hui-panel" data-testid="needs-you">
        <Heading t={t} term="technical">
          {o.needsYou(asking.length)}
        </Heading>
        {asking.length === 0 ? (
          <p className="hui-muted">{o.noQuestions}</p>
        ) : (
          <ul className="hui-list">
            {asking.map((q) => (
              <li key={q.requestId} className="hui-item">
                <span className="hui-badge hui-warn">{t.question.severity(q.severity)}</span>{' '}
                <WorkRef id={q.workId} {...links} /> {q.title ? <span>{q.title}</span> : null}
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
          </ul>
        )}
        {otherQuestions.length ? (
          <ul className="hui-list hui-secondary" data-testid="other-questions">
            {otherQuestions.map((q) => (
              <li key={q.requestId} className="hui-item hui-muted">
                <WorkRef id={q.workId} {...links} /> <code>{q.requestId}</code>:{' '}
                {questionStatus(q, lang).text}
              </li>
            ))}
          </ul>
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
                  {w.stage.typical ? (
                    <span className="hui-muted">
                      {t.typicalRange(
                        formatDuration(w.stage.typical.p50Ms, lang),
                        formatDuration(w.stage.typical.p90Ms, lang),
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="hui-muted">
                  {w.attempts.line ??
                    o.attemptsShort(w.attempts.used, w.attempts.max, w.attempts.left)}
                  {w.attempts.lastFailure ? `; ${o.lastStopped(w.attempts.lastFailure.plain)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
        {progress.running > running.length ? (
          <p className="hui-muted" data-testid="running-truncated">
            {o.runningUnlisted(progress.running - running.length)}
          </p>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="decisions">
        <Heading t={t} term="escalation">
          {o.decisions(deciding.length)}
        </Heading>
        {deciding.length === 0 ? (
          <p className="hui-muted">{o.noDecisions}</p>
        ) : (
          <ul className="hui-list">
            {deciding.map((e, i) => (
              <li key={i} className="hui-item" data-status="blocked">
                {e.workId ? <WorkRef id={e.workId} {...links} /> : <code>{e.subject ?? '—'}</code>}{' '}
                <code className="hui-muted">{e.code}</code>{' '}
                <span className="hui-who">{o.whoActs(actorLabel(t, e.actor), e.action)}</span>{' '}
                <span className="hui-muted">({clockOf(e.since, t, timeZone, now)})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hui-panel" data-testid="waiting">
        <Heading t={t} term="waitsQueue">
          {o.waiting}
        </Heading>
        {waiting.length === 0 ? (
          <p className="hui-muted">{o.noWaiting}</p>
        ) : (
          <ul className="hui-list">
            {waiting.map((w) => (
              <li key={w.id} className="hui-item">
                <WorkRef id={w.id} {...links} />{' '}
                <span className="hui-badge">{stageLabel(w.stage.name, lang)}</span>
                <ul className="hui-list hui-nested">
                  {w.blockers.length ? (
                    w.blockers.map((b, i) => <BlockerLine key={i} b={b} t={t} />)
                  ) : w.stage.needs ? (
                    <li className="hui-item" data-status="blocked">
                      {o.whoActs(actorLabel(t, w.stage.needs.actor), w.stage.needs.action)}
                    </li>
                  ) : (
                    <li className="hui-item" data-status="blocked">
                      {t.blocker.stoppedNoReason}
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {accepted.length || progress.done ? (
        <div className="hui-panel" data-testid="accepted">
          <Heading t={t} term="accepted">
            {o.accepted(progress.done)}
          </Heading>
          <ul className="hui-list">
            {accepted.map((w) => (
              <li key={w.id} className="hui-item">
                <WorkRef id={w.id} {...links} /> <code className="hui-muted">{w.target!.ref}</code>
                <AcceptedLine w={w} lang={lang} linkProps={links} />
              </li>
            ))}
          </ul>
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
