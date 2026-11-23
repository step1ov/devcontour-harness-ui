// View revision 8 (harness 0.1.0-alpha.68, pending its final release): the
// per-attempt review results (`works[].attemptReviews`), the reopen reason
// (`works[].reopened`) and the diagnosis kind (`track.steps[].required`).
// Read tolerantly: until the schemas are synced these fields are not in the
// typed contract, so a document without them (revision 7) reads as before
// and a malformed entry is skipped, never thrown on. Pure: no React.

import type { WorkView } from './view.ts';

/** `works[].attemptReviews[]` (revision 8): the last applied independent review round of an attempt and phase. */
export interface AttemptReviewResult {
  attempt: number;
  phase: 'candidate' | 'integration' | (string & {});
  verdict: 'approved' | 'rejected' | 'invalid' | (string & {});
  /** Open blocking findings of the round. */
  findings: number;
  /** Other open findings. */
  notes: number;
  at?: string;
  /** An attempt of the earlier (accepted) revision of the work, before the rework. */
  earlier?: true;
}

/** `works[].reopened` (revision 8): a new plan revision reopened an accepted work. */
export interface ReopenedView {
  at: string;
  /** Who approved the reopening revision; absent while it is not approved. */
  by?: 'lead' | 'operator' | (string & {});
  revision: number;
  /** `fresh` — its own attempt limit; `carried` — the limit carried over. */
  budget: 'fresh' | 'carried' | (string & {});
  acceptedSha: string;
  /** Counted attempts of the accepted revision. */
  spent: number;
  /** The harness phrase for the card. */
  reason: string;
}

const count = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const str = (x: unknown) => typeof x === 'string' && x.length > 0;

/** The per-attempt review results the harness sends; `undefined` when the field is absent (older harness). */
export function attemptReviewResults(w: WorkView): AttemptReviewResult[] | undefined {
  const raw = (w as { attemptReviews?: unknown }).attemptReviews;
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(
    (r): r is AttemptReviewResult =>
      typeof r === 'object' &&
      r !== null &&
      count((r as AttemptReviewResult).attempt) &&
      str((r as AttemptReviewResult).phase) &&
      str((r as AttemptReviewResult).verdict) &&
      count((r as AttemptReviewResult).findings) &&
      count((r as AttemptReviewResult).notes),
  );
}

/** Why an accepted work is in work again; `undefined` when not reopened (or an older harness). */
export function reopenedOf(w: WorkView): ReopenedView | undefined {
  const r = (w as { reopened?: unknown }).reopened;
  if (typeof r !== 'object' || r === null) return undefined;
  const o = r as ReopenedView;
  return str(o.reason) && str(o.budget) && str(o.acceptedSha) ? o : undefined;
}

/** `forecast.progress.works[].stageProgress` (alpha.68): the running attempt's stage and its share span. */
export interface StageProgressView {
  stage: 'code' | 'checks' | 'review' | 'integration' | (string & {});
  /** Share of the attempt at the start (`from`) and end (`to`) of the stage, 0..1. */
  from: number;
  to: number;
  since?: string;
  typicalMs?: number;
  samples?: number;
}

/** `forecast.progress.growth` (alpha.68): the last plan growth. */
export interface ForecastGrowthView {
  at: string;
  added: string[];
  before: number;
  after: number;
  by: 'works' | 'outline' | (string & {});
  reason?: string;
  line: string;
}

/** One stage of the lead's release outline in the forecast (alpha.68). */
export interface OutlineStageView {
  id: string;
  title?: string;
  kind: 'infra' | 'product' | 'deploy' | 'other' | (string & {});
  state: 'registered' | 'partial' | 'unregistered' | (string & {});
  units: number;
  registered: number;
  percent: number;
}

/** `forecast.outline` (alpha.68): the lead's release outline, or the hint that there is none. */
export interface ForecastOutlineView {
  state: 'recorded' | 'missing' | (string & {});
  code?: string;
  stages?: OutlineStageView[];
  line: string;
}

/** The alpha.68 forecast additions, read tolerantly; each absent or malformed one is `undefined`. */
export interface ForecastAdditions {
  growth?: ForecastGrowthView;
  conditional: boolean;
  infraShare?: { share: number; line: string };
  outline?: ForecastOutlineView;
  outlineTime?: { line: string };
  finishing?: { since?: string; elapsedMs?: number; exceeded?: true };
}

const rec = (x: unknown): Record<string, unknown> | undefined =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : undefined;
const share = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const pct = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;

export function forecastAdditions(forecast: unknown): ForecastAdditions {
  const f = rec(forecast);
  const p = rec(f?.progress);
  const time = rec(f?.time);
  const out: ForecastAdditions = { conditional: p?.conditional === true };
  const g = rec(p?.growth);
  if (g && str(g.line) && pct(g.before) && pct(g.after))
    out.growth = {
      ...(g as unknown as ForecastGrowthView),
      added: Array.isArray(g.added) ? g.added.filter(str).map(String) : [],
    };
  const infra = rec(p?.infraShare);
  if (infra && share(infra.share) && str(infra.line))
    out.infraShare = { share: infra.share as number, line: infra.line as string };
  const o = rec(f?.outline);
  if (o && str(o.state) && str(o.line)) {
    const stages = Array.isArray(o.stages)
      ? o.stages.filter((s): s is OutlineStageView => {
          const r = rec(s);
          return (
            !!r &&
            str(r.id) &&
            str(r.kind) &&
            str(r.state) &&
            count(r.units) &&
            count(r.registered) &&
            pct(r.percent)
          );
        })
      : undefined;
    out.outline = {
      state: o.state as string,
      ...(str(o.code) ? { code: o.code as string } : {}),
      ...(stages ? { stages } : {}),
      line: o.line as string,
    };
  }
  const ot = rec(time?.outline);
  if (ot && str(ot.line)) out.outlineTime = { line: ot.line as string };
  const fin = rec(time?.finishing);
  if (fin)
    out.finishing = {
      ...(str(fin.since) ? { since: fin.since as string } : {}),
      ...(count(fin.elapsedMs) ? { elapsedMs: fin.elapsedMs as number } : {}),
      ...(fin.exceeded === true ? { exceeded: true as const } : {}),
    };
  return out;
}

/** The stage progress the forecast gives for a work's running attempt, if well formed. */
export function stageProgressOf(forecast: unknown, workId: string): StageProgressView | undefined {
  const works = rec(rec(forecast)?.progress)?.works;
  if (!Array.isArray(works)) return undefined;
  const w = rec(works.find((x) => rec(x)?.workId === workId));
  const s = rec(w?.stageProgress);
  if (
    !s ||
    !str(s.stage) ||
    !share(s.from) ||
    !share(s.to) ||
    (s.to as number) < (s.from as number)
  )
    return undefined;
  return s as unknown as StageProgressView;
}
