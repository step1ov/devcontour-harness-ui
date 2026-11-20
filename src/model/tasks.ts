// One task card per work (design §5.3 «Задачи») and the process timeline of
// a work (prepare → writing → checks → review → integration → acceptance).
// Pure over the view and the alpha.3 `nextSteps` model: every line names a
// view record; nothing new is counted. Pure: no node:*, no React.

import { SLOT_STAGES, leadMayAnswer, questionStatus } from './format.ts';
import { actorsOn, leadAnswers, type NextSteps, type StepActor } from './steps.ts';
import type {
  AttemptRow,
  OperatorQuestion,
  OperatorView,
  ReviewSubjectView,
  WorkDetailView,
  WorkView,
} from './view.ts';

export { leadAnswers };

/** Asking questions split by who answers them: you, or the lead under the policy. */
export function splitQuestions(view: OperatorView, steps: NextSteps) {
  const yours: OperatorQuestion[] = [];
  const lead: OperatorQuestion[] = [];
  for (const q of steps.questions) (leadAnswers(view, q) ? lead : yours).push(q);
  return { yours, lead };
}

/** What a task card says the work is doing, as a kind the dictionary words. */
export type TaskPhase =
  'accepted' | 'cancelled' | 'running' | 'question' | 'stopped' | 'dependency' | 'queued' | 'other';

export type NextActor =
  | { kind: 'nobody' }
  | { kind: 'harness'; stage: string }
  | { kind: 'actors'; actors: StepActor[] }
  | { kind: 'dependency'; on: string[] }
  | { kind: 'queue' }
  | { kind: 'unknown' };

export interface TaskCard {
  work: WorkView;
  phase: TaskPhase;
  next: NextActor;
  /** All questions of the view about this work, asking ones first. */
  questions: OperatorQuestion[];
  /** Code reviews of the work (`reviews[]` with its `workId`). */
  reviews: ReviewSubjectView[];
  /** Unfinished works it waits for (`nextSteps` dependencies). */
  waitsOn: string[];
}

const accepted = (w: WorkView) => w.stage.name === 'done' || w.target !== undefined;

export function taskCard(view: OperatorView, steps: NextSteps, w: WorkView): TaskCard {
  const questions = view.questions
    .filter((q) => q.workId === w.id)
    .sort((a, b) => Number(questionStatus(b).needsAnswer) - Number(questionStatus(a).needsAnswer));
  const reviews = view.reviews.filter((r) => r.workId === w.id);
  const asking = steps.questions.filter((q) => q.workId === w.id);
  const dep = steps.dependencies.find((d) => d.workId === w.id);
  let phase: TaskPhase;
  let next: NextActor;
  if (accepted(w)) {
    phase = 'accepted';
    next = { kind: 'nobody' };
  } else if (w.stage.name === 'cancelled') {
    phase = 'cancelled';
    next = { kind: 'nobody' };
  } else if (SLOT_STAGES.has(w.stage.name)) {
    // A running work is never "waiting" (F-J): the harness acts, unless the
    // view names someone else for it (the same people as on the Overview).
    phase = 'running';
    const actors = actorsOn(steps, w.id, view);
    next = actors.length ? { kind: 'actors', actors } : { kind: 'harness', stage: w.stage.name };
  } else {
    // Questions the lead answers by the policy name the lead, not you (F-W).
    const actors = actorsOn(steps, w.id, view);
    if (asking.length || steps.unlistedAnswers.includes(w.id)) phase = 'question';
    else if (dep) phase = 'dependency';
    else if (w.stage.name === 'stopped' || w.stage.name === 'blocked') phase = 'stopped';
    else if (w.stage.name === 'queued') phase = 'queued';
    else phase = 'other';
    if (actors.length) next = { kind: 'actors', actors };
    else if (dep) next = { kind: 'dependency', on: dep.on };
    else if (steps.queue.some((q) => q.workId === w.id && !q.unexplained) || phase === 'queued')
      next = { kind: 'queue' };
    else next = { kind: 'unknown' };
    // A stopped work that only waits for its dependency reads as waiting for it.
    if (phase === 'stopped' && dep && !actors.length) phase = 'dependency';
  }
  return { work: w, phase, next, questions, reviews, waitsOn: dep?.on ?? [] };
}

/** Order of the task list: what moves now, what waits for people, the rest, the finished. */
const ORDER: TaskPhase[] = [
  'running',
  'question',
  'stopped',
  'dependency',
  'queued',
  'other',
  'accepted',
  'cancelled',
];

export function taskCards(view: OperatorView, steps: NextSteps): TaskCard[] {
  return view.works
    .map((w) => taskCard(view, steps, w))
    .sort((a, b) => ORDER.indexOf(a.phase) - ORDER.indexOf(b.phase));
}

/** One step of the process timeline. */
export interface TimelineStep {
  /** Stage name: `prepare`, `writer`, `gates`, `review`, `integration`, `acceptance`, or a newer one. */
  stage: string;
  /**
   * `skipped`: an earlier attempt stopped before it; `next`: the latest
   * attempt stopped before it and the next attempt gets there; `not-needed`:
   * the work was accepted without it.
   */
  state: 'passed' | 'failed' | 'current' | 'ahead' | 'skipped' | 'next' | 'not-needed' | 'unknown';
  durationMs?: number;
}

/** The process a work goes through, in order (design §5.2). */
export const PROCESS: readonly string[] = [
  'prepare',
  'writer',
  'gates',
  'review',
  'integration',
  'acceptance',
];

/**
 * The timeline of one attempt: the stages it went through with their
 * duration and outcome, the current one, and what is ahead. `current` is
 * the work's stage when this is its latest attempt.
 */
export function timelineOf(
  row: AttemptRow | undefined,
  work: WorkView,
  latest: boolean,
): TimelineStep[] {
  const seen = new Map(row?.stages.map((s) => [s.stage, s]) ?? []);
  const isAccepted = accepted(work);
  const terminal = isAccepted || work.stage.name === 'cancelled';
  const known = PROCESS.filter((s) => s !== 'acceptance');
  // Stages a newer harness reports that this build does not know keep their place after the known ones.
  const extra = (row?.stages ?? []).map((s) => s.stage).filter((s) => !PROCESS.includes(s));
  const order = [...known, ...extra];
  const failedRow =
    row?.status === 'failed' || (row?.stages ?? []).some((s) => s.outcome === 'failed');
  // A stopped latest attempt of a work that goes on: the rest comes in the next attempt.
  const notReached: TimelineStep['state'] =
    latest && !terminal && work.attempts.left > 0 ? 'next' : 'skipped';
  const current = latest && !terminal ? order.indexOf(work.stage.name) : -1;
  const lastSeen = Math.max(-1, ...order.map((x, i) => (seen.has(x) ? i : -1)));
  let failed = false;
  const out: TimelineStep[] = [];
  for (const [i, stage] of order.entries()) {
    const s = seen.get(stage);
    let state: TimelineStep['state'];
    if (s?.outcome === 'passed') state = 'passed';
    else if (s?.outcome === 'failed') state = 'failed';
    // Only the work's own stage runs now, never two at once.
    else if (i === current && SLOT_STAGES.has(stage)) state = 'current';
    // Seen without an outcome: passed when a later stage started, else unknown.
    else if (s) state = i < current || i < lastSeen ? 'passed' : 'unknown';
    // Not in the record: after a failure it was not reached; a missing record
    // before the current stage (or of an accepted work without records) is
    // unknown, never a guess.
    else if (failed || (failedRow && i > lastSeen)) state = latest ? notReached : 'skipped';
    else if (!latest) state = i > lastSeen ? 'skipped' : 'unknown';
    else if (isAccepted) state = seen.size ? 'not-needed' : 'unknown';
    else if (work.stage.name === 'cancelled') state = 'skipped';
    else if (current >= 0 && i < current) state = 'unknown';
    else state = 'ahead';
    if (state === 'failed') failed = true;
    out.push({
      stage,
      state,
      ...(s?.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
    });
  }
  out.push({
    stage: 'acceptance',
    state:
      isAccepted && latest
        ? 'passed'
        : !latest || work.stage.name === 'cancelled'
          ? 'skipped'
          : failed || failedRow
            ? notReached
            : 'ahead',
  });
  return out;
}

/** The timeline of the latest attempt of a work detail, and of every earlier one. */
export function timelines(detail: WorkDetailView) {
  return detail.attempts.map((row, i) => ({
    attempt: row,
    steps: timelineOf(row, detail.work, i === 0),
  }));
}
