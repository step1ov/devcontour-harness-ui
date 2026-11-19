// Overview screen: what needs the operator, what runs now, progress and
// health at a glance. Pure render of an `OperatorView`; no fetching, no
// writes. Counts come from the view's aggregate sections (never from the
// possibly truncated lists). Hosts theme it through `--hui-*` variables.

import type { OperatorView, ViewHealth } from '../model/view.ts';
import {
  KNOWN_QUESTION_STATES,
  SLOT_STAGES,
  formatElapsed,
  formatUsd,
  questionStatus,
  stageLabel,
} from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import { footerSentence, headerSentence, targetSentence, type Lang } from '../model/i18n.ts';

export interface OverviewProps {
  view: OperatorView;
  /** Clock for elapsed times, epoch ms; defaults to `view.generatedAt` (deterministic). */
  now?: number;
  /** Host navigation to a work order; without it work ids are plain text. */
  onOpenWork?: (workId: string) => void;
  /**
   * Panel language; Russian is first-class. Until slice S2 only the header
   * sentence and the footer are localized. Default `en`.
   */
  lang?: Lang;
  /** IANA time zone for the footer clock; defaults to the viewer's. */
  timeZone?: string;
}

const severityOrder = ['exceeded', 'undetermined', 'within'];

/**
 * The most severe budget row, whatever `budgeting` says: a row the producer
 * sent is never hidden. `undefined` only when there are no rows.
 */
function worstBudget(health: ViewHealth) {
  if (!health.budgets.length) return undefined;
  const rank = (s: string) => {
    const i = severityOrder.indexOf(s);
    return i < 0 ? 1 : i; // unknown state reads as undetermined
  };
  return [...health.budgets].sort((a, b) => rank(a.state) - rank(b.state))[0];
}

export function Overview({ view, now, onOpenWork, lang = 'en', timeZone }: OverviewProps) {
  const clock = now ?? instantMs(view.generatedAt);
  const { progress, health } = view;
  const running = view.works.filter((w) => SLOT_STAGES.has(w.stage.name));
  const asking = view.questions.filter((q) => questionStatus(q).needsAnswer);
  const otherQuestions = view.questions.filter((q) => !questionStatus(q).needsAnswer);
  const budget = worstBudget(health);
  // Works listed with a location; the count itself is `progress.done`.
  const accepted = view.works.filter((w) => w.target !== undefined);
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
  const workRef = (id: string) =>
    onOpenWork ? (
      <button type="button" className="hui-link" onClick={() => onOpenWork(id)}>
        {id}
      </button>
    ) : (
      <code>{id}</code>
    );
  const inspect = (requestId: string) => (
    <code>harness input-show --state &lt;state&gt; --request {requestId}</code>
  );

  return (
    <section className="hui hui-overview" aria-label="Harness overview">
      <header className="hui-row hui-header">
        <h2 className="hui-title">Harness</h2>
        <span
          className={'hui-badge ' + (progress.queue.paused ? 'hui-warn' : 'hui-ok')}
          data-testid="queue-state"
        >
          {progress.queue.paused
            ? `Paused${progress.queue.reason ? ` (${progress.queue.reason})` : ''}`
            : 'Queue running'}
        </span>
        <span className="hui-muted">
          {progress.done} of {progress.total} accepted
        </span>
      </header>
      <p className="hui-lead" data-testid="sentence" lang={lang}>
        {sentence}
      </p>

      <div className="hui-panel" data-testid="needs-you">
        <h3 className="hui-subtitle">Needs your answer ({asking.length})</h3>
        {asking.length === 0 ? (
          <p className="hui-muted">No questions are waiting for you.</p>
        ) : (
          <ul className="hui-list">
            {asking.map((q) => (
              <li key={q.requestId} className="hui-item">
                <span className="hui-badge hui-warn">severity {q.severity}</span>{' '}
                {workRef(q.workId)} {q.title ? <span>{q.title}</span> : null}
                <div className="hui-muted">
                  {questionStatus(q).text} Full question: {inspect(q.requestId)} (version{' '}
                  {q.version}).
                </div>
              </li>
            ))}
          </ul>
        )}
        {otherQuestions.length ? (
          <ul className="hui-list hui-secondary" data-testid="other-questions">
            {otherQuestions.map((q) => (
              <li key={q.requestId} className="hui-item hui-muted">
                {workRef(q.workId)} <code>{q.requestId}</code>: {questionStatus(q).text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="hui-panel" data-testid="now">
        <h3 className="hui-subtitle">
          Working now ({progress.running} of {view.settings.concurrency} slots)
        </h3>
        {running.length === 0 && progress.running === 0 ? (
          <p className="hui-muted">Nothing is running.</p>
        ) : (
          <ul className="hui-list">
            {running.map((w) => (
              <li key={w.id} className="hui-item">
                <div className="hui-row">
                  {workRef(w.id)}
                  <span className="hui-badge">{stageLabel(w.stage.name)}</span>
                  {w.stage.step ? <code className="hui-muted">{w.stage.step}</code> : null}
                  {w.liveness && w.liveness !== 'active' ? (
                    <span className="hui-badge hui-warn">{w.liveness}</span>
                  ) : null}
                  {w.stage.since ? (
                    <span className="hui-muted">{formatElapsed(w.stage.since, clock)}</span>
                  ) : null}
                </div>
                <div className="hui-muted">
                  {w.attempts.line ??
                    `attempt ${w.attempts.used} of ${w.attempts.max}, ${w.attempts.left} left`}
                </div>
              </li>
            ))}
          </ul>
        )}
        {progress.running > running.length ? (
          <p className="hui-muted" data-testid="running-truncated">
            {progress.running - running.length} more running work orders are not listed (view
            limit).
          </p>
        ) : null}
      </div>

      {accepted.length || progress.done ? (
        <div className="hui-panel" data-testid="accepted">
          <h3 className="hui-subtitle">Accepted ({progress.done})</h3>
          <ul className="hui-list">
            {accepted.map((w) => (
              <li key={w.id} className="hui-item">
                {workRef(w.id)} <code className="hui-muted">{w.target!.ref}</code>
                <div className="hui-muted" lang={lang}>
                  {targetSentence(w.target!, lang)}
                </div>
              </li>
            ))}
          </ul>
          {progress.done > accepted.length ? (
            <p className="hui-muted" data-testid="accepted-unlisted">
              {progress.done - accepted.length} accepted work order
              {progress.done - accepted.length === 1 ? ' has' : 's have'} no location in this view
              {view.truncated?.works ? ' (view limit)' : ''}.
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="hui-grid" data-testid="health">
        <div>
          <dt>Budget</dt>
          {budget ? (
            <dd className={budget.state === 'within' ? '' : 'hui-bad'}>
              {formatUsd(budget.spentUsd)}
              {budget.limitUsd !== undefined ? ` of $${budget.limitUsd.toFixed(2)}` : ''} (
              {budget.scope}
              {budget.id ? ` ${budget.id}` : ''}: {budget.state})
            </dd>
          ) : (
            <dd data-testid="no-budget">
              {health.budgeting === 'off' ? 'no budget' : 'budget unknown'}; spent{' '}
              {formatUsd(health.spentTotalUsd)}
            </dd>
          )}
        </div>
        <div>
          <dt>Controller</dt>
          <dd className={health.controller.present ? '' : 'hui-bad'}>
            {health.controller.present ? 'present' : 'absent'}
          </dd>
        </div>
        <div>
          <dt>Stalled attempts</dt>
          <dd className={health.stalledAttempts ? 'hui-bad' : ''}>{health.stalledAttempts}</dd>
        </div>
        <div>
          <dt>Changed after acceptance</dt>
          <dd>
            {health.drift.drifted}
            {health.drift.unavailable ? ` (${health.drift.unavailable} not checked)` : ''}
          </dd>
        </div>
      </dl>
      {health.warnings.length ? (
        <ul className="hui-list hui-secondary" data-testid="warnings">
          {health.warnings.map((w, i) => (
            <li key={i} className="hui-item">
              <code className="hui-muted">{w.code}</code> {w.message}
            </li>
          ))}
        </ul>
      ) : null}
      <footer className="hui-muted hui-footer" data-testid="footer" lang={lang}>
        {footerSentence(view.generatedAt, lang, timeZone, now)}
      </footer>
    </section>
  );
}
