// The same document as an older harness sends it, for the compatibility
// tests: tests/contract.test.ts validates these shapes against the copied
// alpha.55, alpha.56, alpha.57 and alpha.59 schemas, so the screen and live tests that use them
// really feed the panel an old document, not a new one with a lower number.

type Json = Record<string, any>;

/**
 * Harness alpha.62 (revision 4): none of the revision 5 fields — no stage,
 * no checks in the task source, no added tasks, per-work readiness, rough
 * range, estimate or finish time, no uncounted runs.
 */
export function asAlpha62<T>(doc: T): T {
  const d = structuredClone(doc) as Json;
  if (typeof d.viewRevision === 'number' && d.viewRevision > 4) d.viewRevision = 4;
  for (const k of ['stage', 'sourceReviews']) delete d[k];
  d.escalations = d.escalations?.filter((e: Json) => e.code !== 'SOURCE_REVIEW');
  if (d.escalations === undefined) delete d.escalations;
  if (d.truncated) {
    delete d.truncated.sourceReviews;
    delete d.truncated.forecastWorks;
    if (!Object.keys(d.truncated).length) delete d.truncated;
  }
  if (d.forecast) {
    delete d.forecast.progress.added;
    delete d.forecast.progress.works;
    for (const k of ['rough', 'estimate', 'finishedAt']) delete d.forecast.time[k];
  }
  for (const w of [...(d.works ?? []), ...(d.work ? [d.work] : [])])
    if (w.attempts) delete w.attempts.runs;
  return d as T;
}

/**
 * Harness alpha.59 (revision 3): none of the revision 4 sections and fields —
 * no run slice, tracker questions, forecast or updates, no tracker health,
 * no queue runner, blocker order, failure class, answer location, question
 * options or rationale.
 */
export function asAlpha59<T>(doc: T): T {
  const d = asAlpha62(doc) as Json;
  d.viewRevision = 3;
  for (const k of ['scope', 'scopeReason', 'sourceQuestions', 'forecast', 'updates']) delete d[k];
  if (d.truncated) {
    delete d.truncated.scope;
    delete d.truncated.sourceQuestions;
    delete d.truncated.workFields;
    delete d.truncated.whatsNew;
    if (!Object.keys(d.truncated).length) delete d.truncated;
  }
  if (d.health) delete d.health.sources;
  if (d.progress?.queue)
    for (const k of ['runner', 'neverRun', 'restartBy', 'line']) delete d.progress.queue[k];
  for (const w of [...(d.works ?? []), ...(d.work ? [d.work] : [])]) {
    for (const b of w.blockers ?? []) delete b.step;
    if (w.attempts?.lastFailure) {
      delete w.attempts.lastFailure.kind;
      delete w.attempts.lastFailure.counted;
    }
    if (w.question) delete w.question.line;
  }
  for (const q of d.questions ?? []) {
    delete q.options;
    delete q.rationale;
    delete q.line;
  }
  return d as T;
}

/**
 * Harness alpha.57/58 (revision 2): no `unused` stages, and no prepare
 * stages of their own — preparing ran inside `implementation` (its time is
 * added there) and inside the integration step.
 */
export function asAlpha57<T>(doc: T): T {
  const d = asAlpha59(doc) as Json;
  d.viewRevision = 2;
  for (const a of d.attempts ?? []) {
    const stages: Json[] = a.stages ?? [];
    const prep = stages.filter((s) => s.stage === 'prepare');
    const impl = stages.find((s) => s.stage === 'implementation');
    if (impl && impl.durationMs !== undefined)
      for (const p of prep) impl.durationMs += p.durationMs ?? 0;
    a.stages = stages
      .filter((s) => s.stage !== 'prepare' && !String(s.stage).startsWith('integration-prepare'))
      .map(({ unused: _u, ...s }) => s);
  }
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
