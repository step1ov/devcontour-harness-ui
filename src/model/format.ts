// Small display helpers shared by components. Pure, locale-independent.

import type { Bounded } from './view.ts';

export function formatUsd(amount: Bounded | undefined): string {
  if (!amount || amount.bound === 'unknown') return 'unknown';
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
export const stageLabel = (stage: string) => stageLabels[stage] ?? stage;
