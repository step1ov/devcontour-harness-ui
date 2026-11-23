// Setup progress (view revision 7, harness 0.1.0-alpha.67): `stage.progress`
// of the overview at the setup stage and of the setup document. The panel
// reads what is there: every field may be missing (an older or a reshaped
// harness), and nothing here derives a number the harness did not send —
// only the elapsed time goes on with the viewer's clock from `since`, as the
// forecast's time does (the harness keeps the elapsed time and its line out
// of the content token).

import type { Lang } from './dict.ts';
import type { SetupStepState } from './view.ts';
import { instantMs, isInstant } from './compat.ts';

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;
const ms = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** The step states the panel draws; anything else reads as `unknown`. */
const STATES = new Set(['done', 'failed', 'pending', 'skipped', 'unknown']);

export interface SetupStepRead {
  id: string;
  state: 'done' | 'failed' | 'pending' | 'skipped' | 'unknown';
  at?: string;
  elapsedMs?: number;
  /** The harness line in the panel language; absent when the harness sent none. */
  line?: string;
}

export interface SetupProgressRead {
  since?: string;
  /** The harness figure, as sent (see `setupElapsed` for the live one). */
  elapsedMs?: number;
  budgetMs?: number;
  overBudget: boolean;
  steps: SetupStepRead[];
  /** `stage.progress.line` in the panel language (not one of `stage.lines`). */
  line?: string;
}

/** The line in the panel language: `lineEn` for English, `line` otherwise; the other as a fallback. */
function lineOf(o: Obj, lang: Lang): string | undefined {
  return lang === 'en' ? (text(o.lineEn) ?? text(o.line)) : (text(o.line) ?? text(o.lineEn));
}

/**
 * The setup progress of a document (overview or setup document), or
 * `undefined` when the harness sent none (alpha.66 and older, or works exist).
 */
export function setupProgressOf(view: unknown, lang: Lang = 'ru'): SetupProgressRead | undefined {
  const stage = isObject(view) && isObject(view.stage) ? view.stage : undefined;
  const p = stage && isObject(stage.progress) ? stage.progress : undefined;
  if (!p) return undefined;
  const steps: SetupStepRead[] = [];
  for (const s of Array.isArray(p.steps) ? p.steps : []) {
    if (!isObject(s) || !text(s.id)) continue;
    const state = (
      typeof s.state === 'string' && STATES.has(s.state) ? s.state : 'unknown'
    ) as SetupStepRead['state'];
    const line = lineOf(s, lang);
    const elapsedMs = ms(s.elapsedMs);
    steps.push({
      id: s.id as string,
      state,
      ...(isInstant(s.at) ? { at: s.at as string } : {}),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
      ...(line ? { line } : {}),
    });
  }
  const line = lineOf(p, lang);
  const elapsedMs = ms(p.elapsedMs);
  const budgetMs = ms(p.budgetMs);
  return {
    ...(isInstant(p.since) ? { since: p.since as string } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(budgetMs ? { budgetMs } : {}),
    overBudget: p.overBudget === true,
    steps,
    ...(line ? { line } : {}),
  };
}

/**
 * How long setup has run: from `since` on the viewer's clock, never less than
 * the harness figure; without `since`, the harness figure as is.
 */
export function setupElapsed(p: SetupProgressRead, now?: number): number | undefined {
  if (p.since === undefined || now === undefined || !Number.isFinite(now)) return p.elapsedMs;
  const live = now - instantMs(p.since);
  if (!Number.isFinite(live)) return p.elapsedMs;
  return Math.max(p.elapsedMs ?? 0, Math.max(0, live));
}

/** The dot of a step state: done — filled, failed — ✕, pending — grey, skipped — dashed, unknown — ring. */
export function setupStepTone(
  state: SetupStepState,
): 'passed' | 'failed' | 'planned' | 'skipped' | 'unknown' {
  return state === 'done'
    ? 'passed'
    : state === 'failed'
      ? 'failed'
      : state === 'pending'
        ? 'planned'
        : state === 'skipped'
          ? 'skipped'
          : 'unknown';
}

/** A harness infrastructure work (revision 7, `works[].kind: 'infra'`). */
export const isInfraWork = (w: { kind?: unknown } | undefined): boolean => w?.kind === 'infra';
