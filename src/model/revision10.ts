// View revision 10 (harness 0.1.0-alpha.70): spend by work and attempt, role
// and model (`costs`), the second review pass of an attempt
// (`works[].attemptReviews[].secondPass`), the writer's follow-up and split
// proposals (`works[].proposals`), the docs step of the release
// (`forecast.progress.release.docs`) and the failure-cause reference
// (`works[].attempts.lastFailure.reference`). The fields are typed in view.ts
// and checked by the gate; these accessors only say «absent» for an older
// harness. Pure: no React.

import type {
  CostAmountView,
  CostsView,
  ForecastView,
  OperatorView,
  ProposalView,
  ReleaseDocsView,
  WorkView,
} from './view.ts';

export type {
  CostAmountView,
  CostRole,
  CostsView,
  ProposalView,
  ReleaseDocsView,
  SecondPassView,
} from './view.ts';

/** Spend by work, role and model; `undefined` for an older harness (no field). */
export function costsOf(view: Pick<OperatorView, 'costs'>): CostsView | undefined {
  return view.costs;
}

/** A work's spend with its attempts, as the harness sums it; `undefined` when not listed. */
export function workCostOf(
  view: Pick<OperatorView, 'costs'>,
  workId: string,
): CostsView['byWork'][number] | undefined {
  return view.costs?.byWork.find((w) => w.workId === workId);
}

/** Whether a sum is a lower bound (some calls have no price); an unknown bound reads as lower. */
export const isLowerBound = (a: Pick<CostAmountView, 'bound'>): boolean => a.bound !== 'exact';

/** The writer's proposals of a work (revision 10); `[]` when none or an older harness. */
export function proposalsOf(w: Pick<WorkView, 'proposals'>): ProposalView[] {
  return Array.isArray(w.proposals) ? w.proposals : [];
}

/** The docs step of the release (revision 10); `undefined` when off or an older harness. */
export function releaseDocsOf(forecast: ForecastView | undefined): ReleaseDocsView | undefined {
  return forecast?.progress.release?.docs;
}

/**
 * Where the failure-cause reference of the harness is published. The view
 * sends a path inside the harness package (`docs/failure-causes.md#…`); the
 * panel opens the same document in the public harness repository.
 */
export const FAILURE_CAUSES_BASE = 'https://github.com/step1ov/devcontour-harness/blob/master/';

const REFERENCE = /^docs\/failure-causes\.md#([a-z0-9][a-z0-9-]{0,80})$/;

/**
 * The link of a failure-cause reference (revision 10), or `undefined` for
 * anything but `docs/failure-causes.md#<anchor>`: the panel never turns an
 * arbitrary string of the view into a link.
 */
export function failureReferenceHref(
  reference: string | undefined,
  base: string = FAILURE_CAUSES_BASE,
): string | undefined {
  if (!reference || !REFERENCE.test(reference)) return undefined;
  return base + reference;
}

/** The anchor of a reference (`kind-environment`, `cause-preflight`), for the visible text. */
export function failureReferenceAnchor(reference: string | undefined): string | undefined {
  return reference ? REFERENCE.exec(reference)?.[1] : undefined;
}
