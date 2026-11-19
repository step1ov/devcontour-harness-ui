// `devcontour-harness-ui --check` (design §4): is the installed harness one
// this panel can show? Runs `harness --version` and `harness capabilities`,
// and `harness view` when a state directory is given, then prints
// `{harness, ui, viewVersion, compatible, fix?}`. Read-only: the harness
// commands it runs write nothing.

import { checkView } from '../model/compat.ts';
import { VIEW_VERSION } from '../model/view.ts';
import {
  HarnessUnavailable,
  harnessVersion,
  harnessView,
  probeHarness,
  type HarnessSupport,
} from './harness.ts';

export interface CompatReport {
  /** Version the harness reports; `null` when it does not answer. */
  harness: string | null;
  ui: string;
  /** View version the harness declares (or the one `harness view` returned); `null` = unknown. */
  viewVersion: number | null;
  /** The view this panel reads: `VIEW_VERSION`. */
  uiViewVersion: number;
  compatible: boolean;
  /** What to do when not compatible, or when the state could not be read. */
  fix?: string;
  /** `harness view` on the given state: its refusal when it did not produce a view. */
  view?: { ok: true } | { ok: false; code: string; message: string };
}

export async function compatReport(o: {
  bin: string;
  ui: string;
  state?: string;
  policy?: string;
}): Promise<CompatReport> {
  const base = { ui: o.ui, uiViewVersion: VIEW_VERSION };
  const version = (await harnessVersion(o.bin)) ?? null;
  let support: HarnessSupport;
  try {
    support = await probeHarness(o.bin);
  } catch (err) {
    if (!(err instanceof HarnessUnavailable)) throw err;
    return {
      ...base,
      harness: version,
      viewVersion: null,
      compatible: false,
      fix:
        `${err.message} Install devcontour-harness 0.1.0-alpha.55 or newer, ` +
        'or pass --harness <bin> when it is not on PATH.',
    };
  }
  const harness = version ?? support.version ?? null;
  if (!support.view)
    return {
      ...base,
      harness,
      viewVersion: null,
      compatible: false,
      fix:
        `The installed harness${harness ? ' ' + harness : ''} has no \`harness view\`. ` +
        'Install devcontour-harness 0.1.0-alpha.55 or newer.',
    };
  let viewVersion = support.viewVersion ?? null;
  let view: CompatReport['view'];
  if (o.state !== undefined) {
    const r = await harnessView(
      { bin: o.bin, state: o.state, ...(o.policy !== undefined ? { policy: o.policy } : {}) },
      undefined,
    );
    if (!r.ok) view = { ok: false, code: r.code, message: r.message };
    else {
      const v = (r.view as { viewVersion?: unknown } | null)?.viewVersion;
      if (typeof v === 'number') viewVersion = v;
      const c = checkView(r.view);
      view = c.ok ? { ok: true } : { ok: false, code: c.code, message: c.message };
    }
  }
  if (viewVersion !== null && viewVersion !== VIEW_VERSION)
    return {
      ...base,
      harness,
      viewVersion,
      compatible: false,
      fix:
        `The harness writes view version ${viewVersion}; this panel reads ${VIEW_VERSION}. ` +
        'Install the devcontour-harness-ui release for that view version, or a harness of the 0.1.x line.',
      ...(view ? { view } : {}),
    };
  if (view && !view.ok && view.code !== 'VIEW_UNAVAILABLE')
    return {
      ...base,
      harness,
      viewVersion,
      compatible: false,
      fix: `This panel cannot read the harness view: ${view.message}`,
      view,
    };
  return {
    ...base,
    harness,
    viewVersion,
    // Unknown view version without a state to read is not a proven match.
    compatible: viewVersion !== null,
    ...(viewVersion === null
      ? {
          fix: 'The harness does not declare its view version; pass --state <dir> to read one view.',
        }
      : view && !view.ok
        ? { fix: `The versions match, but harness view on this state failed: ${view.message}` }
        : {}),
    ...(view ? { view } : {}),
  };
}
