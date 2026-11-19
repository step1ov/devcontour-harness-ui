// Compatibility gate between a view document and this UI build. The rule
// (docs/design.md, "Versioning"): the same `viewVersion` major is accepted,
// any `viewRevision` is accepted (unknown fields are ignored), a different
// major is refused with a reason the panel shows instead of guessing.

import { VIEW_VERSION, type OperatorView } from './view.ts';

export type ViewCheck =
  | { ok: true; view: OperatorView; newerRevision: boolean }
  | { ok: false; code: 'NOT_A_VIEW' | 'VIEW_VERSION_UNSUPPORTED'; message: string };

/** Highest `viewRevision` this build knows how to render in full. */
export const KNOWN_VIEW_REVISION = 0;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Structural check of a parsed JSON value. It verifies the envelope and the
 * top-level sections the panel depends on; it is not a full schema validator
 * (the producer owns the schema).
 */
export function checkView(value: unknown): ViewCheck {
  if (!isObject(value) || typeof value.viewVersion !== 'number') {
    return { ok: false, code: 'NOT_A_VIEW', message: 'The document has no numeric viewVersion.' };
  }
  if (value.viewVersion !== VIEW_VERSION) {
    return {
      ok: false,
      code: 'VIEW_VERSION_UNSUPPORTED',
      message:
        `View version ${value.viewVersion} is not supported by this panel ` +
        `(expects ${VIEW_VERSION}). Install a matching devcontour-harness-ui.`,
    };
  }
  for (const key of ['settings', 'progress', 'history', 'health'] as const) {
    if (!isObject(value[key])) {
      return { ok: false, code: 'NOT_A_VIEW', message: `Section "${key}" is missing.` };
    }
  }
  for (const key of ['works', 'reviews', 'questions', 'escalations', 'drift'] as const) {
    if (!Array.isArray(value[key])) {
      return { ok: false, code: 'NOT_A_VIEW', message: `List "${key}" is missing.` };
    }
  }
  const revision = typeof value.viewRevision === 'number' ? value.viewRevision : 0;
  return {
    ok: true,
    view: value as unknown as OperatorView,
    newerRevision: revision > KNOWN_VIEW_REVISION,
  };
}
