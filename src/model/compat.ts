// Compatibility gate between a view document and this UI build. The rule
// (docs/design.md, "Versioning"): the same `viewVersion` major is accepted,
// any `viewRevision` is accepted (unknown fields are ignored), a different
// major is refused with a reason the panel shows instead of guessing.
//
// The gate checks every field the components read, with the type the harness
// schema gives it (devcontour-harness schemas/operator-view.schema.json), so
// that a malformed document is refused here instead of throwing during render.
// It is not a full schema validator: the harness owns the schema, and
// tests/contract.test.ts checks that every schema-valid fixture passes here.

import { VIEW_VERSION, type OperatorView } from './view.ts';

export type ViewCheck =
  | { ok: true; view: OperatorView; newerRevision: boolean }
  | {
      ok: false;
      code: 'NOT_A_VIEW' | 'VIEW_VERSION_UNSUPPORTED' | 'VIEW_UNAVAILABLE';
      message: string;
    };

/** Highest `viewRevision` this build knows how to render in full. */
export const KNOWN_VIEW_REVISION = 0;

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const isBounded = (v: unknown) =>
  isObject(v) &&
  typeof v.value === 'number' &&
  Number.isFinite(v.value) &&
  typeof v.bound === 'string';

/**
 * An ISO 8601 instant with an explicit zone (`Z` or `±HH:MM`) and a real
 * calendar date: `2026-02-30T…` or a zone-less local time is refused, so the
 * footer never shows a shifted or reader-dependent time.
 */
export function isInstant(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      v,
    );
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  const day = new Date(Date.UTC(y!, mo! - 1, d!));
  return (
    day.getUTCFullYear() === y &&
    day.getUTCMonth() === mo! - 1 &&
    day.getUTCDate() === d &&
    h! < 24 &&
    mi! < 60 &&
    s! < 60 &&
    !Number.isNaN(Date.parse(v))
  );
}

/** Path -> predicate for every field the components dereference. */
function problems(v: Obj): string[] {
  const out: string[] = [];
  const need = (ok: boolean, path: string) => {
    if (!ok) out.push(path);
  };
  const obj = (o: unknown, path: string): Obj | undefined => {
    need(isObject(o), path);
    return isObject(o) ? o : undefined;
  };
  need(isCount(v.viewRevision), 'viewRevision');
  need(isInstant(v.generatedAt), 'generatedAt');
  const source = obj(v.source, 'source');
  if (source) need(typeof source.token === 'string', 'source.token');
  const settings = obj(v.settings, 'settings');
  if (settings) need(isCount(settings.concurrency), 'settings.concurrency');
  const progress = obj(v.progress, 'progress');
  if (progress) {
    for (const k of ['total', 'done', 'running', 'waitingOperator'])
      need(isCount(progress[k]), `progress.${k}`);
    const byStage = obj(progress.byStage, 'progress.byStage');
    if (byStage)
      for (const [k, n] of Object.entries(byStage)) need(isCount(n), `progress.byStage.${k}`);
    const queue = obj(progress.queue, 'progress.queue');
    if (queue) need(typeof queue.paused === 'boolean', 'progress.queue.paused');
  }
  obj(v.history, 'history');
  const health = obj(v.health, 'health');
  if (health) {
    const controller = obj(health.controller, 'health.controller');
    if (controller) need(typeof controller.present === 'boolean', 'health.controller.present');
    need(isCount(health.stalledAttempts), 'health.stalledAttempts');
    need(Array.isArray(health.budgets), 'health.budgets');
    if (Array.isArray(health.budgets))
      health.budgets.forEach((b, i) => {
        need(isObject(b) && typeof b.state === 'string', `health.budgets[${i}].state`);
        need(isObject(b) && isBounded(b.spentUsd), `health.budgets[${i}].spentUsd`);
      });
    const drift = obj(health.drift, 'health.drift');
    if (drift)
      for (const k of ['drifted', 'unavailable']) need(isCount(drift[k]), `health.drift.${k}`);
    need(Array.isArray(health.warnings), 'health.warnings');
    if (Array.isArray(health.warnings))
      health.warnings.forEach((w, i) =>
        need(
          isObject(w) && typeof w.code === 'string' && typeof w.message === 'string',
          `health.warnings[${i}]`,
        ),
      );
  }
  for (const key of ['works', 'reviews', 'questions', 'escalations', 'drift']) {
    need(Array.isArray(v[key]), key);
  }
  if (Array.isArray(v.works))
    v.works.forEach((w, i) => {
      const p = `works[${i}]`;
      if (!isObject(w)) return need(false, p);
      need(typeof w.id === 'string', `${p}.id`);
      need(isObject(w.stage) && typeof w.stage.name === 'string', `${p}.stage.name`);
      if (isObject(w.stage) && w.stage.since !== undefined)
        need(isInstant(w.stage.since), `${p}.stage.since`);
      const a = w.attempts;
      need(isObject(a) && isCount(a.used) && isCount(a.max) && isCount(a.left), `${p}.attempts`);
      if (w.target !== undefined) {
        const t = w.target;
        need(
          isObject(t) &&
            typeof t.ref === 'string' &&
            isObject(t.remote) &&
            typeof t.remote.state === 'string' &&
            (t.remote.reason === undefined || typeof t.remote.reason === 'string'),
          `${p}.target`,
        );
      }
    });
  if (Array.isArray(v.escalations))
    v.escalations.forEach((e, i) =>
      need(isObject(e) && typeof e.actor === 'string', `escalations[${i}].actor`),
    );
  if (Array.isArray(v.questions))
    v.questions.forEach((q, i) => {
      const p = `questions[${i}]`;
      if (!isObject(q)) return need(false, p);
      need(typeof q.requestId === 'string' && typeof q.workId === 'string', `${p}.requestId`);
      need(typeof q.state === 'string', `${p}.state`);
      need(isCount(q.severity) && isCount(q.version), `${p}.severity`);
    });
  return out;
}

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
  const bad = problems(value);
  if (bad.length) {
    return {
      ok: false,
      code: 'NOT_A_VIEW',
      message: `The view is malformed: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ', …' : ''}.`,
    };
  }
  return {
    ok: true,
    view: value as unknown as OperatorView,
    newerRevision: (value.viewRevision as number) > KNOWN_VIEW_REVISION,
  };
}
