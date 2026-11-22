// The whole path of a work (`works[].track`, view revision 6, harness
// 0.1.0-alpha.66) as the panel draws it: one tone per step and the steps of
// one attempt grouped into one segment. Every label, reason and time is the
// harness's; the panel only picks a colour for the state the harness gives.
// Pure: no node:*, no React.

import type { TrackStep, WorkTrack, WorkView } from './view.ts';

/**
 * How a step is drawn. `planned` grey, `current` green and pulsing,
 * `passed` green, `failed` red, `waiting` amber, `decision` blue (a lead
 * decision: diagnosis, the lead's reset), `human` dark neutral (a person's
 * decision or reset), `rework` solid violet (a passed step of a rework after
 * acceptance), `rework-planned` violet outline (a rework step still ahead),
 * `skipped` muted.
 */
export type TrackTone =
  | 'planned'
  | 'current'
  | 'passed'
  | 'failed'
  | 'waiting'
  | 'decision'
  | 'human'
  | 'rework'
  | 'rework-planned'
  | 'skipped';

/** Who took a decision step: the lead (or the harness itself), or a person. */
export type DecisionActor = 'lead' | 'user' | 'harness';

/** The harness's labels of a reset by a person (`track.ts`, «сброс попыток человеком»). */
const HUMAN_RESET_LABELS: ReadonlySet<string> = new Set([
  'сброс попыток человеком',
  'attempts reset by a human',
]);

/**
 * Who decides a decision-type step (`diagnosis`, `reset`, `user-decision`).
 * A newer harness names it (`actor`); until then the kind and the harness's
 * own label tell it: `user-decision` and a reset by a person are human,
 * other diagnoses and resets are the lead's. `undefined` for other kinds.
 */
export function decisionActor(step: Pick<TrackStep, 'kind' | 'label'>): DecisionActor | undefined {
  if (!DECISION_KINDS.has(step.kind)) return undefined;
  const sent = (step as { actor?: unknown }).actor;
  if (sent === 'lead' || sent === 'user' || sent === 'harness') return sent;
  if (step.kind === 'user-decision') return 'user';
  if (step.kind === 'reset' && HUMAN_RESET_LABELS.has(step.label.trim().toLowerCase()))
    return 'user';
  return 'lead';
}

/** Steps of one attempt run (code → checks → review → integration). */
export const PHASE_KINDS: ReadonlySet<string> = new Set([
  'code',
  'checks',
  'review',
  'integration',
]);

/** Kinds that are a decision of the lead or a person, not a step of an attempt. */
export const DECISION_KINDS: ReadonlySet<string> = new Set(['diagnosis', 'reset', 'user-decision']);

const KNOWN_STATES: ReadonlySet<string> = new Set([
  'planned',
  'current',
  'passed',
  'failed',
  'waiting',
  'skipped',
  'decision',
]);

export interface DrawnStep {
  step: TrackStep;
  /** Position in the harness list, from 1 (after the dropped ones: `truncated + i + 1`). */
  n: number;
  tone: TrackTone;
  /**
   * The state word to say: the harness state as sent. Since harness
   * 0.1.0-alpha.66 (5496b33) the steps a running attempt has not reached yet
   * come as `planned`; a `skipped` step really was skipped.
   */
  state: string;
}

/** A segment of the compact line: one attempt run, or one single step. */
export interface TrackGroup {
  attempt?: number;
  rework?: number;
  /** `attempt`: the phase steps of one attempt; `single`: any other step. */
  kind: 'attempt' | 'single';
  steps: DrawnStep[];
}

/** The colour of a step, from its state (and the rework mark and who decided). */
export function trackTone(
  step: Pick<TrackStep, 'state' | 'kind' | 'rework'> & { label?: string },
  state: string = step.state,
): TrackTone {
  if (state === 'failed') return 'failed';
  if (state === 'current') return 'current';
  if (state === 'waiting') return 'waiting';
  if (state === 'decision')
    return decisionActor({ ...step, label: step.label ?? '' }) === 'user' ? 'human' : 'decision';
  if (state === 'skipped') return 'skipped';
  if (step.rework !== undefined && state === 'passed') return 'rework';
  if (step.rework !== undefined && state === 'planned') return 'rework-planned';
  if (state === 'passed') return 'passed';
  // `planned`, or a state this build does not know: grey, with its own word.
  return 'planned';
}

/** Every step with its position, display state and tone. */
export function drawnSteps(track: WorkTrack): DrawnStep[] {
  const offset =
    Number.isSafeInteger(track.truncated) && track.truncated! > 0 ? track.truncated! : 0;
  return track.steps.map((step, i) => {
    const state = String(step.state);
    return { step, n: offset + i + 1, tone: trackTone(step, state), state };
  });
}

/** Steps grouped for the compact line: consecutive phase steps of one attempt form one segment. */
export function trackGroups(track: WorkTrack): TrackGroup[] {
  const out: TrackGroup[] = [];
  for (const d of drawnSteps(track)) {
    const s = d.step;
    const last = out.at(-1);
    if (
      PHASE_KINDS.has(s.kind) &&
      s.attempt !== undefined &&
      last?.kind === 'attempt' &&
      last.attempt === s.attempt &&
      last.rework === s.rework
    ) {
      last.steps.push(d);
      continue;
    }
    out.push({
      kind: PHASE_KINDS.has(s.kind) && s.attempt !== undefined ? 'attempt' : 'single',
      ...(s.attempt !== undefined ? { attempt: s.attempt } : {}),
      ...(s.rework !== undefined ? { rework: s.rework } : {}),
      steps: [d],
    });
  }
  return out;
}

/** Whether the panel knows the state word of a step (others are shown as the harness code). */
export const knownTrackState = (state: string) => KNOWN_STATES.has(state);

/**
 * Why a work has no track to draw: an older harness (revision below 6), or a
 * revision 6 document that dropped the tracks for size (they go first).
 */
export function trackAbsence(
  w: Pick<WorkView, 'track'>,
  viewRevision: number,
): 'present' | 'old' | 'dropped' {
  if (w.track && Array.isArray(w.track.steps)) return 'present';
  return viewRevision >= 6 ? 'dropped' : 'old';
}
