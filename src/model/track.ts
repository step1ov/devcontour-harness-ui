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
export function decisionActor(
  step: Pick<TrackStep, 'kind' | 'label' | 'actor'>,
): DecisionActor | undefined {
  if (!DECISION_KINDS.has(step.kind)) return undefined;
  // The harness names it (alpha.66): it wins; the fallback is for steps without it.
  const sent = step.actor;
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
  step: Pick<TrackStep, 'state' | 'kind' | 'rework' | 'actor'> & { label?: string },
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

/** The phase steps of one attempt run, in order, ending at acceptance. */
export const ATTEMPT_PHASES = ['code', 'checks', 'review', 'integration'] as const;

/**
 * Where the current attempt of a work stands on its way to acceptance (ui
 * alpha.10, owner request P6-25): the track's own steps, counted. `state`:
 * `running` — a step of the attempt is current; `next` — the next attempt
 * has not started yet (a retry or the first run); `accepted`; `failed` — the
 * last attempt failed and no attempt is ahead; `none` — nothing to say.
 */
export interface AttemptProgress {
  state: 'running' | 'next' | 'accepted' | 'failed' | 'none';
  attempt?: number;
  rework?: number;
  /** Phase steps of the attempt that passed, of `of` (4: code, checks, review, integration). */
  passed: number;
  of: number;
  /** The step the attempt is on now (`running`) or failed at (`failed`): the harness label. */
  step?: string;
  /** The previous attempt failed at this step (harness label): «повтор после отказа ревью». */
  retryAfter?: string;
}

/** The attempt groups of a track (phase steps only). */
const attemptGroups = (track: WorkTrack) => trackGroups(track).filter((g) => g.kind === 'attempt');

const failedStepOf = (g: TrackGroup | undefined) =>
  g?.steps.find((d) => d.state === 'failed')?.step.label;

/** The progress of the current attempt toward acceptance, from the track. */
export function attemptProgress(track: WorkTrack | undefined, status?: string): AttemptProgress {
  const of = ATTEMPT_PHASES.length;
  if (!track || !Array.isArray(track.steps)) return { state: 'none', passed: 0, of };
  const groups = attemptGroups(track);
  const passedOf = (g: TrackGroup) => g.steps.filter((d) => d.state === 'passed').length;
  const pick = (g: TrackGroup) => ({
    ...(g.attempt !== undefined ? { attempt: g.attempt } : {}),
    ...(g.rework !== undefined ? { rework: g.rework } : {}),
  });
  const cur = groups.findIndex((g) => g.steps.some((d) => d.state === 'current'));
  if (cur >= 0) {
    const g = groups[cur]!;
    const before = failedStepOf(groups[cur - 1]);
    return {
      state: 'running',
      ...pick(g),
      passed: passedOf(g),
      of,
      step: g.steps.find((d) => d.state === 'current')!.step.label,
      ...(before ? { retryAfter: before } : {}),
    };
  }
  // Accepted: the harness says so (`done`), or the last step is a passed end.
  const end = drawnSteps(track).at(-1);
  if (status === 'done' || (end?.step.kind === 'accepted' && end.state === 'passed')) {
    const done = [...groups].reverse().find((g) => g.steps.every((d) => d.state === 'passed'));
    return { state: 'accepted', ...(done ? pick(done) : {}), passed: of, of };
  }
  // The first attempt ahead: every phase step planned.
  const next = groups.findIndex((g) => g.steps.every((d) => d.state === 'planned'));
  if (next >= 0) {
    const before = failedStepOf(groups[next - 1]);
    return {
      state: 'next',
      ...pick(groups[next]!),
      passed: 0,
      of,
      ...(before ? { retryAfter: before } : {}),
    };
  }
  const last = groups.at(-1);
  if (last && failedStepOf(last))
    return {
      state: 'failed',
      ...pick(last),
      passed: passedOf(last),
      of,
      step: failedStepOf(last)!,
    };
  return { state: 'none', passed: 0, of };
}

/** One attempt's independent review, as the track records it (P6-10). */
export interface AttemptReview {
  attempt?: number;
  rework?: number;
  state: 'passed' | 'failed' | 'current' | 'waiting';
  reason?: string;
  /** Findings of the review, when the harness counts them on the step. */
  findings?: number;
}

/**
 * The review step of every attempt that reached review (passed, rejected or
 * running now); planned and skipped review steps are not reviews.
 */
export function attemptReviews(track: WorkTrack | undefined): AttemptReview[] {
  if (!track || !Array.isArray(track.steps)) return [];
  const out: AttemptReview[] = [];
  for (const d of drawnSteps(track)) {
    const s = d.step;
    if (s.kind !== 'review') continue;
    if (
      d.state !== 'passed' &&
      d.state !== 'failed' &&
      d.state !== 'current' &&
      d.state !== 'waiting'
    )
      continue;
    const findings = (s as { findings?: unknown }).findings;
    out.push({
      ...(s.attempt !== undefined ? { attempt: s.attempt } : {}),
      ...(s.rework !== undefined ? { rework: s.rework } : {}),
      state: d.state,
      ...(s.reason ? { reason: s.reason } : {}),
      ...(Number.isSafeInteger(findings) && (findings as number) >= 0
        ? { findings: findings as number }
        : {}),
    });
  }
  return out;
}

/** What the work is doing now, for the caption beside the line: the current or waiting step. */
export function trackNow(track: WorkTrack | undefined): DrawnStep | undefined {
  if (!track || !Array.isArray(track.steps)) return undefined;
  const steps = drawnSteps(track);
  return steps.find((d) => d.state === 'current') ?? steps.find((d) => d.state === 'waiting');
}

/**
 * The lead's resets on the track (P6-25 badge tooltip): those taken
 * (`decision`) and the total the policy allows (taken + still planned), with
 * the harness reason of each taken one («+3»).
 */
export function leadResets(track: WorkTrack | undefined): {
  done: number;
  total: number;
  reasons: string[];
} {
  if (!track || !Array.isArray(track.steps)) return { done: 0, total: 0, reasons: [] };
  const lead = drawnSteps(track).filter(
    (d) => d.step.kind === 'reset' && decisionActor(d.step) !== 'user',
  );
  const done = lead.filter((d) => d.state === 'decision');
  const planned = lead.filter((d) => d.state === 'planned');
  return {
    done: done.length,
    total: done.length + planned.length,
    reasons: done.map((d) => d.step.reason ?? '').filter(Boolean),
  };
}

/**
 * Whether the lead's diagnosis is required (view revision 8, harness
 * alpha.68, P6-3): `true` — the work is held until the lead diagnoses;
 * `false` — the harness retries by itself and the lead may diagnose.
 * `undefined` — not said (an older harness, or not a diagnosis step).
 */
export function diagnosisRequired(step: Pick<TrackStep, 'kind' | 'required'>): boolean | undefined {
  if (step.kind !== 'diagnosis') return undefined;
  return typeof step.required === 'boolean' ? step.required : undefined;
}
