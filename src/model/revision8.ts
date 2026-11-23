// View revision 8 (harness 0.1.0-alpha.68): the per-attempt review results
// (`works[].attemptReviews`), the reopen reason (`works[].reopened`) and the
// forecast additions (plan growth, the conditional figure, the infra share,
// the release outline, the lead's last stretch, the stage of a running
// attempt). The fields are typed in view.ts and checked by the gate; these
// accessors only say «absent» for an older harness. Pure: no React.

import type {
  AttemptReviewResult,
  ForecastGrowthView,
  ForecastOutlineView,
  ForecastView,
  ReopenedView,
  StageProgressView,
  WorkView,
} from './view.ts';

export type {
  AttemptReviewResult,
  ForecastGrowthView,
  ForecastOutlineView,
  OutlineComponentView,
  OutlineStageView,
  ReopenedView,
  StageProgressView,
} from './view.ts';

/** The per-attempt review results the harness sends; `undefined` when the field is absent (older harness). */
export function attemptReviewResults(w: WorkView): AttemptReviewResult[] | undefined {
  return Array.isArray(w.attemptReviews) ? w.attemptReviews : undefined;
}

/** Why an accepted work is in work again; `undefined` when not reopened (or an older harness). */
export function reopenedOf(w: WorkView): ReopenedView | undefined {
  return w.reopened;
}

/** The revision 8 forecast additions; each absent one is left out (`conditional` false). */
export interface ForecastAdditions {
  growth?: ForecastGrowthView;
  conditional: boolean;
  infraShare?: { share: number; line: string };
  outline?: ForecastOutlineView;
  outlineTime?: { line: string };
  finishing?: { since?: string; elapsedMs?: number; exceeded?: true };
}

export function forecastAdditions(forecast: ForecastView | undefined): ForecastAdditions {
  const p = forecast?.progress;
  const time = forecast?.time;
  return {
    conditional: p?.conditional === true,
    ...(p?.growth ? { growth: p.growth } : {}),
    ...(p?.infraShare ? { infraShare: p.infraShare } : {}),
    ...(forecast?.outline ? { outline: forecast.outline } : {}),
    ...(time?.outline ? { outlineTime: { line: time.outline.line } } : {}),
    ...(time?.finishing ? { finishing: time.finishing } : {}),
  };
}

/** The stage progress the forecast gives for a work's running attempt, if a usable span. */
export function stageProgressOf(
  forecast: ForecastView | undefined,
  workId: string,
): StageProgressView | undefined {
  const s = forecast?.progress.works?.find((x) => x.workId === workId)?.stageProgress;
  if (!s || !(s.from >= 0 && s.to <= 1 && s.to >= s.from)) return undefined;
  return s;
}
