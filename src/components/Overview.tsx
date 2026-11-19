// Overview screen: what needs the operator, what runs now, progress and
// health at a glance. Pure render of an `OperatorView`; no fetching, no
// writes. Counts come from the view's aggregate sections (never from the
// possibly truncated lists). Hosts theme it through `--hui-*` variables.

import type { OperatorView, ViewHealth } from '../model/view.ts';
import {
  SLOT_STAGES,
  formatElapsed,
  formatUsd,
  questionStatus,
  stageLabel,
} from '../model/format.ts';

export interface OverviewProps {
  view: OperatorView;
  /** Clock for elapsed times, epoch ms; defaults to `view.generatedAt` (deterministic). */
  now?: number;
  /** Host navigation to a work order; without it work ids are plain text. */
  onOpenWork?: (workId: string) => void;
}

const severityOrder = ['exceeded', 'undetermined', 'within'];

/** The most severe budget row; `undefined` when budgeting is off. */
function worstBudget(health: ViewHealth) {
  if (health.budgeting !== 'on' || !health.budgets.length) return undefined;
  const rank = (s: string) => {
    const i = severityOrder.indexOf(s);
    return i < 0 ? 1 : i; // unknown state reads as undetermined
  };
  return [...health.budgets].sort((a, b) => rank(a.state) - rank(b.state))[0];
}

export function Overview({ view, now, onOpenWork }: OverviewProps) {
  const clock = now ?? Date.parse(view.generatedAt);
  const { progress, health } = view;
  const running = view.works.filter((w) => SLOT_STAGES.has(w.stage.name));
  const asking = view.questions.filter((q) => questionStatus(q).needsAnswer);
  const otherQuestions = view.questions.filter((q) => !questionStatus(q).needsAnswer);
  const budget = worstBudget(health);
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
            <dd>no budget; spent {formatUsd(health.spentTotalUsd)}</dd>
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
    </section>
  );
}
