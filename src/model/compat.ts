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
const isStr = (v: unknown) => typeof v === 'string';
const optStr = (v: unknown) => v === undefined || typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || isNum(v);
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const isBounded = (v: unknown) =>
  isObject(v) &&
  typeof v.value === 'number' &&
  Number.isFinite(v.value) &&
  typeof v.bound === 'string';

const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;

/**
 * An ISO 8601 instant with an explicit zone (`Z` or `±HH:MM`) and a real
 * calendar date: `2026-02-30T…` or a zone-less local time is refused, so the
 * footer never shows a shifted or reader-dependent time. Every instant the
 * harness schema accepts (any number of fraction digits, years 0000-9999)
 * passes.
 */
export function isInstant(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const m = INSTANT.exec(v);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((x) => Number(x ?? 0));
  const day = new Date(0);
  // setUTCFullYear keeps years 0-99 as they are (Date.UTC maps them to 19xx).
  day.setUTCFullYear(y!, mo! - 1, d!);
  return (
    day.getUTCFullYear() === y &&
    day.getUTCMonth() === mo! - 1 &&
    day.getUTCDate() === d &&
    h! < 24 &&
    mi! < 60 &&
    s! < 60 &&
    (m[8] === 'Z' || (Number(m[9]) < 24 && Number(m[10]) < 60)) &&
    !Number.isNaN(instantMs(v))
  );
}

/**
 * Epoch ms of an instant accepted by `isInstant`; NaN otherwise. Fractions
 * longer than milliseconds are cut to three digits first, since `Date.parse`
 * refuses them.
 */
export function instantMs(v: string): number {
  const m = INSTANT.exec(v);
  if (!m) return Number.NaN;
  const frac = m[7] ? m[7].slice(0, 4) : '';
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((x) => x ?? '00');
  return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${frac}${m[8]}`);
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
  // `truncated` counts decide whether the header may say "nothing is needed".
  if (v.truncated !== undefined) {
    const t = obj(v.truncated, 'truncated');
    if (t) for (const [k, n] of Object.entries(t)) need(isCount(n), `truncated.${k}`);
  }
  const progress = obj(v.progress, 'progress');
  if (progress) {
    for (const k of ['total', 'done', 'running', 'waitingOperator'])
      need(isCount(progress[k]), `progress.${k}`);
    const byStage = obj(progress.byStage, 'progress.byStage');
    if (byStage)
      for (const [k, n] of Object.entries(byStage)) need(isCount(n), `progress.byStage.${k}`);
    const queue = obj(progress.queue, 'progress.queue');
    if (queue) {
      need(typeof queue.paused === 'boolean', 'progress.queue.paused');
      need(optStr(queue.reason), 'progress.queue.reason');
    }
  }
  obj(v.history, 'history');
  const health = obj(v.health, 'health');
  if (health) {
    const controller = obj(health.controller, 'health.controller');
    if (controller) need(typeof controller.present === 'boolean', 'health.controller.present');
    need(isCount(health.stalledAttempts), 'health.stalledAttempts');
    need(isStr(health.budgeting), 'health.budgeting');
    need(isBounded(health.spentTotalUsd), 'health.spentTotalUsd');
    need(Array.isArray(health.budgets), 'health.budgets');
    if (Array.isArray(health.budgets))
      health.budgets.forEach((b, i) => {
        const p = `health.budgets[${i}]`;
        if (!isObject(b)) return need(false, p);
        need(isStr(b.state), `${p}.state`);
        need(isStr(b.scope), `${p}.scope`);
        need(optStr(b.id), `${p}.id`);
        need(isBounded(b.spentUsd), `${p}.spentUsd`);
        need(optNum(b.limitUsd), `${p}.limitUsd`);
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
      if (isObject(w.stage)) {
        if (w.stage.since !== undefined) need(isInstant(w.stage.since), `${p}.stage.since`);
        need(optStr(w.stage.step), `${p}.stage.step`);
      }
      need(optStr(w.liveness), `${p}.liveness`);
      const a = w.attempts;
      need(
        isObject(a) && isCount(a.used) && isCount(a.max) && isCount(a.left) && optStr(a.line),
        `${p}.attempts`,
      );
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
      need(isStr(q.answerableBy), `${p}.answerableBy`);
      need(optStr(q.impact), `${p}.impact`);
      need(optStr(q.title), `${p}.title`);
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
