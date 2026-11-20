// The whole scope of work and rough time ranges, for the Overview and the
// Tasks screen (design §5.1, §5.3). Pure: no node:*, no React.
//
// Counts come from the harness aggregates (`progress`), never from the
// possibly truncated `works` list. The time ranges are the panel's one piece
// of arithmetic over numbers the harness observed (`stage.typical`,
// `history.totals`); they are shown as ranges with their assumption, and an
// unknown is "unknown", never zero (design §5.1 «Сроки»).

import { instantMs } from './compat.ts';
import { SLOT_STAGES } from './format.ts';
import type { OperatorView, WorkView } from './view.ts';

/**
 * A task of the run slice (`scope.tasks[]`, revision 4, harness
 * 0.1.0-alpha.60; proposal P10). A task with a `workId` is a work order of
 * this view; one without was not handed to the harness yet.
 */
export interface ScopeTask {
  id: string;
  /** Connector of the task source; absent only in a hand-made document. */
  connector?: string;
  /** Task key in the source («WEB-7»). */
  key?: string;
  title?: string;
  /** The work order of this task, once the harness has it. */
  workId?: string;
  /**
   * `in-harness`, `not-handed-over` (the lead has not passed it on),
   * `not-ready` (waits for readiness: criteria, a dependency outside the run);
   * an unknown state is shown as is.
   */
  state: string;
  /** Plain reason in the view language. */
  plain?: string;
}

export interface ScopeView {
  tasks: ScopeTask[];
  /** All tasks of the snapshot, when the list is clipped. */
  total?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The optional `scope` section of a newer view, read defensively: any part
 * that does not have the expected shape is dropped, and a section without a
 * single valid task reads as absent.
 */
export function scopeOf(view: object): ScopeView | undefined {
  const raw = (view as { scope?: unknown }).scope;
  if (!isObj(raw) || !Array.isArray(raw.tasks)) return undefined;
  const tasks: ScopeTask[] = [];
  for (const t of raw.tasks) {
    if (!isObj(t) || typeof t.id !== 'string' || typeof t.state !== 'string') continue;
    tasks.push({
      id: t.id,
      state: t.state,
      ...(typeof t.connector === 'string' ? { connector: t.connector } : {}),
      ...(typeof t.key === 'string' ? { key: t.key } : {}),
      ...(typeof t.title === 'string' ? { title: t.title } : {}),
      ...(typeof t.workId === 'string' ? { workId: t.workId } : {}),
      ...(typeof t.plain === 'string' ? { plain: t.plain } : {}),
    });
  }
  if (!tasks.length) return undefined;
  const total =
    typeof raw.total === 'number' && Number.isInteger(raw.total) && raw.total >= tasks.length
      ? raw.total
      : undefined;
  return { tasks, ...(total !== undefined ? { total } : {}) };
}

/** A readable name of a scope task: its key and title, else the title, the key or the id. */
export function taskName(task: Pick<ScopeTask, 'id' | 'key' | 'title'>): string {
  const title = task.title?.trim();
  if (task.key && title) return title.startsWith(task.key) ? title : `${task.key}: ${title}`;
  return title || task.key || task.id;
}

/** Tasks of the scope that are not work orders of this view. */
export const outsideHarness = (scope: ScopeView | undefined): ScopeTask[] =>
  scope ? scope.tasks.filter((t) => t.workId === undefined && t.state !== 'in-harness') : [];

export interface Overall {
  /** Everything known: works of the harness plus scope tasks outside it. */
  total: number;
  done: number;
  running: number;
  /** Works of the harness that are neither accepted, cancelled nor running. */
  waiting: number;
  cancelled: number;
  /** Scope tasks not handed to the harness yet; `undefined` = the view has no scope. */
  outside: number | undefined;
  /**
   * Scope tasks clipped from the list (`truncated.scope`, else `total`
   * beyond the listed tasks). Their state is unknown — some may be work
   * orders — so they are named as «not shown», never counted as outside or
   * added to `total`.
   */
  outsideUnlisted: number;
}

const stageCount = (view: OperatorView, stage: string) =>
  Object.hasOwn(view.progress.byStage, stage) ? Number(view.progress.byStage[stage]) || 0 : 0;

/** Done / in work / waiting of all known works (harness counts), plus the scope outside. */
export function overallProgress(view: OperatorView): Overall {
  const p = view.progress;
  const cancelled = stageCount(view, 'cancelled');
  const waiting = Math.max(0, p.total - p.done - p.running - cancelled);
  const scope = scopeOf(view);
  const outside = scope ? outsideHarness(scope).length : undefined;
  const clipped = view.truncated?.scope;
  const outsideUnlisted = scope
    ? Number.isSafeInteger(clipped) && clipped! > 0
      ? clipped!
      : scope.total !== undefined
        ? Math.max(0, scope.total - scope.tasks.length)
        : 0
    : 0;
  return {
    total: p.total + (outside ?? 0),
    done: p.done,
    running: p.running,
    waiting,
    cancelled,
    outside,
    outsideUnlisted,
  };
}

/** A time range in ms; `lo <= hi`. */
export interface Range {
  loMs: number;
  hiMs: number;
}

/** Fewer finished attempts than this, and the panel does not guess an attempt's length. */
export const MIN_ATTEMPT_SAMPLES = 3;

/**
 * Average length of one attempt in the history window (`attemptMs /
 * attemptsStarted`, both harness totals), or `undefined` below
 * MIN_ATTEMPT_SAMPLES attempts or without totals (harness alpha.55).
 */
export function attemptAverage(view: OperatorView): { ms: number; samples: number } | undefined {
  const t = view.history.totals;
  if (!t || !(t.attemptsStarted >= MIN_ATTEMPT_SAMPLES) || !(t.attemptMs > 0)) return undefined;
  const ms = t.attemptMs / t.attemptsStarted;
  return Number.isFinite(ms) ? { ms, samples: t.attemptsStarted } : undefined;
}

export type StageLeft =
  | { kind: 'range'; range: Range }
  /** Already longer than usual (`p90`): the range is behind. */
  | { kind: 'over'; usualMaxMs: number };

/**
 * How long the current stage of a running work should still take, from its
 * observed `typical` (p50–p90) minus the time already spent. `undefined`
 * without an observation or a start time.
 */
export function stageLeft(w: WorkView, nowMs: number): StageLeft | undefined {
  const typ = w.stage.typical;
  if (!typ || !SLOT_STAGES.has(w.stage.name) || !w.stage.since) return undefined;
  const { p50Ms, p90Ms } = typ;
  if (!Number.isFinite(p50Ms) || !Number.isFinite(p90Ms) || p50Ms < 0 || p90Ms < p50Ms)
    return undefined;
  const elapsed = nowMs - instantMs(w.stage.since);
  if (!Number.isFinite(elapsed)) return undefined;
  if (elapsed >= p90Ms) return { kind: 'over', usualMaxMs: p90Ms };
  return {
    kind: 'range',
    range: { loMs: Math.max(0, p50Ms - elapsed), hiMs: Math.max(0, p90Ms - elapsed) },
  };
}

export interface ScopeLeft {
  /** Works still to finish: harness works not accepted or cancelled, plus scope tasks outside. */
  works: number;
  /** `undefined` = not enough observations to say (never a zero). */
  range?: Range;
  average?: { ms: number; samples: number };
}

/**
 * The remaining scope as a rough range: each unfinished work needs at least
 * one attempt of average length; at best `concurrency` of them run side by
 * side, at worst one after another. Waiting for people is not in it.
 */
export function scopeLeft(view: OperatorView): ScopeLeft {
  const o = overallProgress(view);
  const works = Math.max(0, o.total - o.done - o.cancelled);
  const average = attemptAverage(view);
  if (!works || !average) return { works, ...(average ? { average } : {}) };
  const slots = Math.max(1, Math.floor(view.settings.concurrency) || 1);
  return {
    works,
    average,
    range: { loMs: Math.ceil(works / slots) * average.ms, hiMs: works * average.ms },
  };
}

/**
 * Nothing has run with this state directory yet: the harness says so
 * (`progress.queue.neverRun`, alpha.62), or an older harness gives the empty
 * view of a state that does not exist (`STATE_NOT_FOUND`) with no works.
 * The queue then neither runs nor stands.
 */
export function neverRun(view: OperatorView): boolean {
  if (view.progress.queue.neverRun === true) return true;
  return (
    view.progress.total === 0 &&
    view.progress.queue.runner === undefined &&
    view.health.warnings.some((w) => w.code === 'STATE_NOT_FOUND')
  );
}

/**
 * Why the view has no run slice (`scope` absent and not dropped for size):
 * `not-read` — the harness has not read the tracker tasks yet (`scopeReason:
 * no-snapshot`, or nothing has run at all); `unreadable` — a tracker snapshot
 * exists but the harness could not read it; `other` — a reason this panel
 * does not know; `not-reported` — an older harness without the field.
 */
export function scopeAbsence(
  view: OperatorView,
): 'not-read' | 'unreadable' | 'other' | 'not-reported' {
  // A newer harness may name a reason this build does not know.
  const reason = view.scopeReason as string | undefined;
  if (reason === 'no-snapshot') return 'not-read';
  if (reason === 'unreadable') return 'unreadable';
  if (typeof reason === 'string') return 'other';
  return neverRun(view) ? 'not-read' : 'not-reported';
}
