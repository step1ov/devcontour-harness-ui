// View revision 9 (harness 0.1.0-alpha.69): the harness mode and its write
// guard (`settings.harnessMode`), plan review rounds without a limit in light
// mode (`settings.thresholds.reviewRoundsUnlimited`), the release acceptance
// review (`forecast.progress.release.review`, `reviews[].kind: release`) and
// the cause of a held gate (`resources.gates.held[].cause`). The fields are
// typed in view.ts and checked by the gate; these accessors only say
// «absent» for an older harness. Pure: no React.

import type {
  ForecastView,
  HarnessModeView,
  HeldGateCause,
  OperatorView,
  ReleaseReviewView,
  ReviewSubjectView,
} from './view.ts';

export type {
  HarnessModeView,
  HeldGateCause,
  ReleaseReviewView,
  ReviewSubjectKind,
} from './view.ts';

/** The harness mode the view names; `undefined` for an older harness (no field). */
export function harnessModeOf(view: Pick<OperatorView, 'settings'>): HarnessModeView | undefined {
  return view.settings.harnessMode;
}

/** Light mode: plan review rounds have no limit (revision 9); `false` for an older harness. */
export function reviewRoundsUnlimited(view: Pick<OperatorView, 'settings'>): boolean {
  return view.settings.thresholds.reviewRoundsUnlimited === true;
}

/**
 * Whether a review subject's rounds read «без предела»: the harness sent no
 * limit (`max: null`), or light mode lifted the limit of plan and contract
 * rounds. Code and release reviews keep what the harness sent.
 */
export function roundsWithoutLimit(
  r: Pick<ReviewSubjectView, 'kind' | 'rounds'>,
  unlimited: boolean,
): boolean {
  return r.rounds.max === null || (unlimited && (r.kind === 'plan' || r.kind === 'contract'));
}

/** The release acceptance review (revision 9); `undefined` when the harness sends none. */
export function releaseReviewOf(forecast: ForecastView | undefined): ReleaseReviewView | undefined {
  return forecast?.progress.release?.review;
}

/**
 * The release waits for its acceptance review: the review is required and
 * not approved. The harness caps the release figure then; the panel never
 * shows 100 % against it.
 */
export function releaseWaitsForReview(forecast: ForecastView | undefined): boolean {
  const r = releaseReviewOf(forecast);
  return r !== undefined && r.required && r.status !== 'approved';
}

/** The causes of the held gates the harness names (revision 9), in its order, each once. */
export function heldCauses(
  view: Pick<OperatorView, 'resources'>,
  workId?: string,
): HeldGateCause[] {
  const out: HeldGateCause[] = [];
  for (const h of view.resources?.gates.held ?? [])
    if (h.cause && (workId === undefined || h.workId === workId) && !out.includes(h.cause))
      out.push(h.cause);
  return out;
}
