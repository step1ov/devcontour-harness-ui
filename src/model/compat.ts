// Compatibility gate between a view document and this UI build. The rule
// (docs/design.md, "Versioning"): the same `viewVersion` major is accepted,
// any `viewRevision` is accepted (unknown fields are ignored), a different
// major is refused with a reason the panel shows instead of guessing.
//
// The gate checks every field the components read, so that a malformed
// document is refused here instead of throwing during render. It is not a
// full schema validator: the producer owns the schema.

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
  need(
    typeof v.generatedAt === 'string' && !Number.isNaN(Date.parse(v.generatedAt)),
    'generatedAt',
  );
  const source = obj(v.source, 'source');
  if (source) need(typeof source.token === 'string', 'source.token');
  const settings = obj(v.settings, 'settings');
  if (settings) need(isCount(settings.concurrency), 'settings.concurrency');
  const progress = obj(v.progress, 'progress');
  if (progress) {
    for (const k of ['total', 'done', 'running', 'waitingOperator'])
      need(isCount(progress[k]), `progress.${k}`);
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
      const a = w.attempts;
      need(isObject(a) && isCount(a.used) && isCount(a.max) && isCount(a.left), `${p}.attempts`);
    });
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
