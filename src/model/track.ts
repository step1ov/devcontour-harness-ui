// The whole path of a work (`works[].track`, view revision 6, harness
// 0.1.0-alpha.66) as the panel draws it: one tone per step and the steps of
// one attempt grouped into one segment. Every label, reason and time is the
// harness's; the panel only picks a colour for the state the harness gives.
// Pure: no node:*, no React.

import type { TrackStep, WorkTrack, WorkView } from './view.ts';

/**
 * How a step is drawn. `planned` grey, `current` green and pulsing,
 * `passed` green, `failed` red, `waiting` amber, `decision` blue (a lead or
 * human decision: diagnosis, reset), `rework` violet (a passed or planned
 * step of a rework after acceptance), `skipped` muted.
 */
export type TrackTone =
  'planned' | 'current' | 'passed' | 'failed' | 'waiting' | 'decision' | 'rework' | 'skipped';

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
   * The state word to say: the harness state, except that a `skipped` step
   * after the running step of the same attempt reads as `planned` — harness
   * 0.1.0-alpha.66 sends the phases a running attempt has not reached yet as
   * `skipped`, and «пропущено» there would say the attempt gave them up.
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

/** The colour of a step, from its state alone (and the rework mark). */
export function trackTone(
  step: Pick<TrackStep, 'state' | 'kind' | 'rework'>,
  state: string = step.state,
): TrackTone {
  if (state === 'failed') return 'failed';
  if (state === 'current') return 'current';
  if (state === 'waiting') return 'waiting';
  if (state === 'decision') return 'decision';
  if (state === 'skipped') return 'skipped';
  if (step.rework !== undefined && (state === 'passed' || state === 'planned')) return 'rework';
  if (state === 'passed') return 'passed';
  // `planned`, or a state this build does not know: grey, with its own word.
  return 'planned';
}

/** Every step with its position, display state and tone. */
export function drawnSteps(track: WorkTrack): DrawnStep[] {
  const offset =
    Number.isSafeInteger(track.truncated) && track.truncated! > 0 ? track.truncated! : 0;
  let running: number | undefined;
  return track.steps.map((step, i) => {
    let state = String(step.state);
    if (state === 'current') running = step.attempt;
    else if (
      state === 'skipped' &&
      running !== undefined &&
      step.attempt === running &&
      PHASE_KINDS.has(step.kind)
    )
      state = 'planned';
    else if (step.attempt !== running) running = undefined;
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
