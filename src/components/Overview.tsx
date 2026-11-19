// Overview screen: what needs the operator, what runs now, progress and
// health at a glance. Pure render of an `OperatorView`; no fetching, no
// writes. Hosts theme it through the `--hui-*` CSS variables (styles.css).

import type { OperatorView, WorkView } from '../model/view.ts';
import { formatElapsed, formatUsd, stageLabel } from '../model/format.ts';

export interface OverviewProps {
  view: OperatorView;
  /** Clock for elapsed times, epoch ms; defaults to `view.generatedAt` (deterministic). */
  now?: number;
  /** Host navigation to a work order; without it work ids are plain text. */
  onOpenWork?: (workId: string) => void;
}

/** Stages that hold a worker slot; waiting, queued and final work does not. */
const SLOT_STAGES = new Set(['prepare', 'writer', 'gates', 'review', 'integration']);
const live = (w: WorkView) => SLOT_STAGES.has(w.stage.name);

export function Overview({ view, now, onOpenWork }: OverviewProps) {
  const clock = now ?? Date.parse(view.generatedAt);
  const { progress, health, questions } = view;
  const running = view.works.filter(live);
  const workRef = (id: string) =>
    onOpenWork ? (
      <button type="button" className="hui-link" onClick={() => onOpenWork(id)}>
        {id}
      </button>
    ) : (
      <code>{id}</code>
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
        <h3 className="hui-subtitle">Needs your answer</h3>
        {questions.length === 0 ? (
          <p className="hui-muted">No questions are waiting for you.</p>
        ) : (
          <ul className="hui-list">
            {questions.map((q) => (
              <li key={q.requestId} className="hui-item">
                <span className="hui-badge hui-warn">severity {q.severity}</span>{' '}
                {workRef(q.workId)} {q.title ? <span>{q.title}</span> : null}
                <div className="hui-muted">
                  {q.answerableBy === 'operator'
                    ? 'Only you can answer this question.'
                    : 'You or the lead agent can answer this question.'}{' '}
                  Request <code>{q.requestId}</code>, version {q.version}.
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hui-panel" data-testid="now">
        <h3 className="hui-subtitle">
          Working now ({running.length} of {view.settings.concurrency} slots)
        </h3>
        {running.length === 0 ? (
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
      </div>

      <dl className="hui-grid" data-testid="health">
        <div>
          <dt>Budget</dt>
          <dd className={health.budget.state === 'within' ? '' : 'hui-bad'}>
            {formatUsd(health.budget.spentUsd)} ({health.budget.state})
          </dd>
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
          <dt>Drifted results</dt>
          <dd>{view.drift.filter((d) => d.commitsSinceAccepted || d.diverged).length}</dd>
        </div>
      </dl>
    </section>
  );
}
