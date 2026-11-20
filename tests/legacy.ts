// The same document as an older harness sends it, for the compatibility
// tests: tests/contract.test.ts validates these shapes against the copied
// alpha.55, alpha.56 and alpha.57 schemas, so the screen and live tests that use them
// really feed the panel an old document, not a new one with a lower number.

type Json = Record<string, any>;

/**
 * Harness alpha.57/58 (revision 2): no `unused` stages; the prepare stages
 * keep their names (the alpha.57 schema allows any stage name).
 */
export function asAlpha57<T>(doc: T): T {
  const d = structuredClone(doc) as Json;
  d.viewRevision = 2;
  for (const a of d.attempts ?? []) for (const s of a.stages ?? []) delete s.unused;
  return d as T;
}

/**
 * Harness alpha.56 (revision 1): no activity feed, and a remote state that is
 * always `unknown` with the reason that version gives (it does not read the
 * tracking ref).
 */
export function asAlpha56<T>(doc: T): T {
  const d = asAlpha57(doc) as Json;
  d.viewRevision = 1;
  delete d.activity;
  if (d.truncated) delete d.truncated.activity;
  for (const w of [...(d.works ?? []), ...(d.work ? [d.work] : [])])
    if (w.target)
      w.target.remote = {
        state: 'unknown',
        reason: 'the remote-tracking ref is not read by this harness version',
      };
  return d as T;
}

/** Harness alpha.55 (revision 0): alpha.56 without answer bases and window totals. */
export function asAlpha55<T>(doc: T): T {
  const d = asAlpha56(doc) as Json;
  d.viewRevision = 0;
  for (const q of d.questions ?? []) delete q.answerBasis;
  if (d.history) delete d.history.totals;
  return d as T;
}
