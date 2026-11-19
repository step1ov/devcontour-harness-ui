// Small display helpers shared by components. Pure, locale-independent.
// Unknown values from a newer producer get the conservative reading: an
// unknown bound is "unknown", an unknown answer rule is "only you".

import type { Bounded, OperatorQuestion } from './view.ts';

export function formatUsd(amount: Bounded | undefined): string {
  if (!amount || (amount.bound !== 'exact' && amount.bound !== 'lower')) return 'unknown';
  const text = '$' + amount.value.toFixed(2);
  return amount.bound === 'lower' ? '≥ ' + text : text;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Elapsed time between an ISO instant and `nowMs` as `1h 05m`, `4m 12s` or `9s`. */
export function formatElapsed(fromIso: string, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - Date.parse(fromIso)) / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${s}s`;
}

const stageLabels: Record<string, string> = {
  queued: 'Queued',
  blocked: 'Blocked',
  prepare: 'Preparing',
  writer: 'Writing',
  gates: 'Checks',
  review: 'Review',
  integration: 'Integrating',
  input: 'Waiting for an answer',
  stopped: 'Stopped',
  done: 'Accepted',
  cancelled: 'Cancelled',
};

/** Label for a stage; an unknown stage from a newer harness is shown as is. */
export const stageLabel = (stage: string): string =>
  Object.hasOwn(stageLabels, stage) ? stageLabels[stage]! : String(stage);

/** Stages that hold a worker slot. */
export const SLOT_STAGES: ReadonlySet<string> = new Set([
  'prepare',
  'writer',
  'gates',
  'review',
  'integration',
]);

export interface QuestionStatus {
  /** Whether the question waits for a new answer from a person. */
  needsAnswer: boolean;
  text: string;
}

/**
 * What a question's lifecycle state means for the operator. Only
 * `awaiting-answer` asks for an answer; the other states name who acts.
 */
/** Question states this build knows; any other state makes the header's count unknown. */
export const KNOWN_QUESTION_STATES: ReadonlySet<string> = new Set([
  'awaiting-answer',
  'answered-not-applied',
  'applied-awaiting-claim',
  'delivered',
  'carry-stale',
]);

/**
 * Whether the lead may answer (design §3.4): `answerableBy: operator-or-lead`
 * and `impact: technical`. An absent, unknown or `user-visible` impact reads
 * as user-visible, which only the operator answers, whatever the severity.
 */
export function leadMayAnswer(q: Pick<OperatorQuestion, 'answerableBy' | 'impact'>): boolean {
  return q.answerableBy === 'operator-or-lead' && q.impact === 'technical';
}

export function questionStatus(
  q: Pick<OperatorQuestion, 'state' | 'answerableBy' | 'impact'>,
): QuestionStatus {
  switch (q.state) {
    case 'awaiting-answer':
      return {
        needsAnswer: true,
        text: leadMayAnswer(q)
          ? 'You or the lead agent can answer this question.'
          : 'Only you can answer this question.',
      };
    case 'answered-not-applied':
      return {
        needsAnswer: false,
        text: 'Answered; the lead agent or controller still has to apply the answer.',
      };
    case 'carry-stale':
      return {
        needsAnswer: false,
        text: 'The carried-over answer of a replaced question went stale; the lead carries it again or withdraws it.',
      };
    case 'applied-awaiting-claim':
      return { needsAnswer: false, text: 'Answer applied; waiting for the next attempt to start.' };
    case 'delivered':
      return { needsAnswer: false, text: 'Answer delivered to the executor.' };
    default:
      return { needsAnswer: false, text: `State ${String(q.state)}; inspect it before acting.` };
  }
}
