// Who acts next, for the Overview (design §5.1). One pure pass over the
// view's own lists — `questions`, `escalations`, `works[].blockers` and
// `works[].stage.needs` — that sorts every reason a work does not move into
// one of five places, so that the header counts and the sections are the
// same lists:
//
// - `questions`: questions waiting for an answer (`awaiting-answer`);
// - `operator`: decisions of the operator (reset attempts, raise a budget…);
// - `lead`: actions of the lead agent (re-approve the plan, diagnose…);
// - `other`: actions of another actor (controller, host, …);
// - `dependencies`: works that wait for other work, with who acts there;
// - `queue`: works that just wait their turn (`actor: null`), and stopped
//   works with no stated reason.
//
// Nothing here is a new count: every line is a record of the view, merged
// when several records name the same thing (the escalation, the blocker
// and the stage of one stop). Pure: no node:*, no React.

import { SLOT_STAGES, leadMayAnswer, questionStatus } from './format.ts';
import type {
  Actor,
  BlockerView,
  Escalation,
  OperatorQuestion,
  OperatorView,
  WorkView,
} from './view.ts';

/**
 * A question the lead answers by the policy (`leadAnswers.technical` and a
 * technical question the lead may answer, F-W): it does not wait for you.
 */
export function leadAnswers(
  view: Pick<OperatorView, 'settings'>,
  q: Pick<OperatorQuestion, 'answerableBy' | 'impact'>,
): boolean {
  return view.settings.thresholds.leadAnswersTechnical === true && leadMayAnswer(q);
}

/** Who acts, as the panel groups it. `user` is the harness diagnosis name of the operator. */
export type StepActor = 'operator' | 'lead' | (string & {});

/** One thing someone has to do, with every view record that says it. */
export interface Step {
  actor: StepActor;
  /** Works this line is about; several when the same reason holds for each (one plan approval). */
  workIds: string[];
  /** An escalation about a subject that is not a work (a review, the queue). */
  subject?: string;
  /** Blocker or escalation code; absent when only `stage.needs` names the action. */
  code?: string;
  /** Harness action token (`reset-attempts`, `review-plan`, …), when a record names it. */
  action?: string;
  /** The harness plain reason of the blocker. */
  plain?: string;
  /** Escalation time. */
  since?: string;
  /**
   * Order of removal the harness gave the blocker (`blockers[].step`,
   * revision 4): 1 goes first. Absent before revision 4 or when one person
   * removes everything.
   */
  step?: number;
  /**
   * Operator steps only: steps of others on the same work that have to
   * happen first. Revision 4: the steps with a lower `blockers[].step`, in
   * the harness order. Before it: lead steps whose code stops the harness
   * from starting an attempt (`LEAD_FIRST_CODES`) — a reset before them
   * would change nothing.
   */
  after: Step[];
  /** `after` comes from the harness order (`blockers[].step`), not from the panel's code list. */
  ordered?: true;
  /** Raw records behind the line, for the «подробности» disclosure. */
  records: StepRecord[];
}

export interface StepRecord {
  source: 'blocker' | 'escalation' | 'needs';
  code?: string;
  actor: Actor | null;
  action?: string;
}

/** A work that waits for other works. */
export interface DependencyWait {
  workId: string;
  /** Unfinished works it depends on (from `dependsOn`), in view order. */
  on: string[];
  /** Harness plain reason of the waiting blocker. */
  plain?: string;
  code: string;
  records: StepRecord[];
}

/** A work that just waits its turn, or a stop without a reason. */
export interface QueueWait {
  workId: string;
  blockers: BlockerView[];
  /** Stopped or blocked, and the harness named no reason and no actor. */
  unexplained: boolean;
}

export interface NextSteps {
  questions: OperatorQuestion[];
  /**
   * Revision 4: steps of others that the harness orders before your answer
   * on a work (`blockers[].step` lower than the answer's), by work id.
   */
  questionAfter: ReadonlyMap<string, Step[]>;
  /** Works that wait for the operator's answer while the view lists no question of theirs. */
  unlistedAnswers: string[];
  operator: Step[];
  lead: Step[];
  other: Step[];
  dependencies: DependencyWait[];
  queue: QueueWait[];
}

/**
 * Codes that stop the harness from starting the next attempt until the lead
 * acts (`stop.ts`: the approval check runs before the attempt count). An
 * operator decision on the same work comes after them.
 */
export const LEAD_FIRST_CODES: ReadonlySet<string> = new Set([
  'APPROVAL_STALE',
  'APPROVAL_REQUIRED',
]);

/** Codes that mean "waits for another work" when the work has unfinished dependencies. */
export const DEPENDENCY_CODES: ReadonlySet<string> = new Set([
  'NOT_READY',
  'DEPENDENCY_INCOMPLETE',
  'DEPENDENCY_FAILED',
  'DEPENDENCY_CANCELLED',
]);

/** Records an asking question already covers: the work waits for that answer. */
const ANSWER_CODES = new Set(['INPUT_REQUIRED']);
const ANSWER_ACTIONS = new Set(['answer', 'answer-input']);

/**
 * The action a stop code asks for, as the harness diagnosis gives it
 * (`stop.ts`). A stage need joins the blocker of that code when no
 * escalation states the action, so one stop stays one line.
 */
const CODE_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  ATTEMPTS_EXHAUSTED: ['reset-attempts'],
  APPROVAL_STALE: ['review-plan'],
  APPROVAL_REQUIRED: ['review-plan'],
  BUDGET_EXHAUSTED: ['raise-budget'],
  BUDGET_UNKNOWN: ['raise-budget'],
  PAUSED: ['resume-queue'],
  GATE_FAILED: ['diagnose-failure'],
  REVIEW_REJECTED: ['diagnose-failure'],
  SCOPE_VIOLATION: ['diagnose-failure'],
  REVIEW_PROTOCOL_INVALID: ['user-decision'],
  CANCELLED: ['replan-dependents'],
  INPUT_REQUIRED: ['answer', 'answer-input', 'apply-input'],
};

/**
 * Stage actions that a dependent work's diagnosis gives while it waits for
 * its dependency (`chain.ts`): they describe that wait, not a step of their
 * own. Any other action (fix access, replan…) stays its own line.
 */
const DEPENDENT_NEED_ACTIONS = new Set(['diagnose-failure', 'wait', 'none']);

const actorOf = (a: Actor | null | undefined): StepActor | null | undefined =>
  a === 'user' ? 'operator' : a;

interface Entry {
  actor: StepActor | null | undefined;
  step?: number;
  code?: string;
  action?: string;
  plain?: string;
  since?: string;
  records: StepRecord[];
}

function entriesOf(
  w: WorkView | undefined,
  workId: string,
  escalations: Escalation[],
  dependent: boolean,
) {
  const out: Entry[] = [];
  const find = (actor: Entry['actor'], code: string | undefined) =>
    out.find((e) => e.actor === actor && e.code === code);
  // A running work holds a slot: its "not ready to start" blockers describe
  // the attempt already under way, not a wait (F-J).
  const running = w !== undefined && SLOT_STAGES.has(w.stage.name);
  for (const b of w?.blockers ?? []) {
    // Only the reasons that mean "not ready to start" (or nobody acts) are
    // dropped for a running work; a reason that names an actor stays.
    if (running && (b.actor === null || b.code === 'NOT_READY' || b.code.startsWith('DEPENDENCY_')))
      continue;
    const actor = actorOf(b.actor);
    const record: StepRecord = { source: 'blocker', code: b.code, actor: b.actor };
    const same = find(actor, b.code);
    const step = Number.isSafeInteger(b.step) && b.step! > 0 ? b.step : undefined;
    if (same) {
      same.records.push(record);
      if (!same.plain && b.plain?.trim()) same.plain = b.plain;
      if (step !== undefined) same.step = Math.min(same.step ?? step, step);
    } else
      out.push({
        actor,
        code: b.code,
        ...(step !== undefined ? { step } : {}),
        ...(b.plain?.trim() ? { plain: b.plain } : {}),
        records: [record],
      });
  }
  for (const e of escalations) {
    if (e.workId !== workId) continue;
    const actor = actorOf(e.actor);
    const record: StepRecord = {
      source: 'escalation',
      code: e.code,
      actor: e.actor,
      action: e.action,
    };
    const same = find(actor, e.code);
    if (same) {
      same.records.push(record);
      same.action ??= e.action;
      same.since ??= e.since;
    } else out.push({ actor, code: e.code, action: e.action, since: e.since, records: [record] });
  }
  const needs = w?.stage.needs;
  // «Wait» on a running work is the attempt itself, not a step of anyone.
  if (needs && !(running && (needs.action === 'wait' || needs.action === 'none'))) {
    const actor = actorOf(needs.actor);
    const record: StepRecord = { source: 'needs', actor: needs.actor, action: needs.action };
    // The stage names the next action of one of the stops above. It joins
    // the record of the same actor and action, or the blocker whose code
    // asks for that action; else the wait for a dependency, which the stage
    // of a dependent work describes; else it is its own line. Actor alone
    // proves nothing: a lead diagnosis is not a plan approval.
    const same =
      out.find((e) => e.actor === actor && e.action === needs.action) ??
      out.find(
        (e) =>
          e.actor === actor &&
          e.action === undefined &&
          e.code !== undefined &&
          (CODE_ACTIONS[e.code] ?? []).includes(needs.action),
      ) ??
      (dependent && DEPENDENT_NEED_ACTIONS.has(needs.action)
        ? out.find((e) => e.code !== undefined && DEPENDENCY_CODES.has(e.code))
        : undefined);
    if (same) {
      same.records.push(record);
      if (same.actor === actor) same.action ??= needs.action;
    } else if (actor !== null) out.push({ actor, action: needs.action, records: [record] });
    // A need of nobody (`actor: null`, action `none`) asks for nothing: no line.
  }
  return out;
}

const stepOf = (e: Entry, workIds: string[], subject?: string): Step => ({
  actor: e.actor ?? 'unknown',
  workIds,
  ...(subject !== undefined ? { subject } : {}),
  ...(e.code !== undefined ? { code: e.code } : {}),
  ...(e.action !== undefined ? { action: e.action } : {}),
  ...(e.plain !== undefined ? { plain: e.plain } : {}),
  ...(e.since !== undefined ? { since: e.since } : {}),
  ...(e.step !== undefined ? { step: e.step } : {}),
  after: [],
  records: e.records,
});

/**
 * Same thing to do for several works of one plan (one plan approval): one
 * line. Works of different plans (`graphId`) stay apart — each plan is
 * approved on its own.
 */
function mergeSame(steps: Step[], graphOf: (id: string) => string | undefined): Step[] {
  const out: Step[] = [];
  const graph = (x: Step) => (x.workIds.length ? graphOf(x.workIds[0]!) : undefined);
  for (const s of steps) {
    const same = out.find(
      (o) =>
        o.subject === undefined &&
        s.subject === undefined &&
        graph(o) !== undefined &&
        graph(o) === graph(s) &&
        o.actor === s.actor &&
        o.code === s.code &&
        // One record may name the action and another not: the same stop.
        (o.action === s.action || o.action === undefined || s.action === undefined) &&
        o.plain === s.plain &&
        o.code !== undefined,
    );
    if (same) {
      if (same.action === undefined && s.action !== undefined) same.action = s.action;
      for (const id of s.workIds) if (!same.workIds.includes(id)) same.workIds.push(id);
      same.records.push(...s.records);
    } else out.push(s);
  }
  return out;
}

/** Sort the view's reasons into who acts next (see the file comment). */
export function nextSteps(source: OperatorView): NextSteps {
  // Revision 5: a check in the task source is its own item («ждут вашей
  // проверки в …», `sourceReviewItems`), not a decision step.
  const view = {
    ...source,
    escalations: source.escalations.filter((e) => e.code !== SOURCE_REVIEW),
  };
  const questions = view.questions.filter((q) => questionStatus(q).needsAnswer);
  const questionAfter = new Map<string, Step[]>();
  const answerOnly = new Set<string>();
  const asking = new Set(questions.map((q) => q.workId));
  const operator: Step[] = [];
  const lead: Step[] = [];
  const other: Step[] = [];
  const dependencies: DependencyWait[] = [];
  const queue: QueueWait[] = [];
  const byId = new Map(view.works.map((w) => [w.id, w]));
  const graphOf = (id: string) => byId.get(id)?.graphId;
  const unfinished = (id: string) => {
    const d = byId.get(id);
    // A dependency outside the (possibly clipped) list counts as unfinished.
    return !d || (d.stage.name !== 'done' && d.target === undefined);
  };
  const ids = [
    ...view.works.map((w) => w.id),
    ...view.escalations.flatMap((e) =>
      e.workId !== undefined && !byId.has(e.workId) ? [e.workId] : [],
    ),
  ];
  for (const id of [...new Set(ids)]) {
    const w = byId.get(id);
    // An accepted work asks nothing of anyone (F-AY): its stale records name
    // no step, no wait and no count. A cancelled one keeps only its
    // escalations (e.g. the lead replans its dependents).
    if (w && isTerminal(w) && w.stage.name !== 'cancelled') continue;
    const cancelled = w?.stage.name === 'cancelled';
    const waitsOn = cancelled ? [] : (w?.dependsOn ?? []).filter(unfinished);
    const entries = entriesOf(
      w && cancelled ? { ...w, blockers: [], stage: { name: w.stage.name, next: [] } } : w,
      id,
      view.escalations,
      waitsOn.length > 0,
    );
    const dep: DependencyWait | undefined = waitsOn.length
      ? { workId: id, on: waitsOn, code: '', records: [] }
      : undefined;
    const own: Step[] = [];
    const nobody: BlockerView[] = [];
    let answerStep: number | undefined;
    for (const e of entries) {
      // The work waits for its dependency: whoever the record names acts on
      // that other work (or on this one only once it is done).
      if (dep && e.code !== undefined && DEPENDENCY_CODES.has(e.code)) {
        if (!dep.code) dep.code = e.code;
        if (!dep.plain && e.plain) dep.plain = e.plain;
        dep.records.push(...e.records);
        continue;
      }
      if (e.actor === null) {
        nobody.push({ code: e.code ?? '', ...(e.plain ? { plain: e.plain } : {}), actor: null });
        continue;
      }
      // Waiting for an answer is a question, not a decision: the item is the
      // question of `questions` (which also says whether the lead may answer
      // it). The operator's record without a listed question is named as an
      // unlisted answer; the lead's one with an asking question is that
      // question too.
      const answer =
        (e.code !== undefined && ANSWER_CODES.has(e.code)) ||
        (e.action !== undefined && ANSWER_ACTIONS.has(e.action));
      if (answer && e.actor === 'operator') {
        answerOnly.add(id);
        if (e.step !== undefined) answerStep = Math.min(answerStep ?? e.step, e.step);
        continue;
      }
      if (answer && asking.has(id)) continue;
      own.push(stepOf(e, [id]));
    }
    const waits = dep?.code ? dep : undefined;
    if (waits) dependencies.push(waits);
    const leadFirst = own.filter(
      (s) => s.actor === 'lead' && s.code !== undefined && LEAD_FIRST_CODES.has(s.code),
    );
    // Revision 4: the harness numbers the order of removal; the panel's code
    // list is read only for revisions 0–3. A revision 4 document without
    // steps leaves the order unknown: no «сначала».
    const stepped =
      view.viewRevision >= 4 || own.some((s) => s.step !== undefined) || answerStep !== undefined;
    const before = (k: number) =>
      own
        .filter((o) => o.actor !== 'operator' && o.step !== undefined && o.step < k)
        .sort((a, b) => a.step! - b.step!);
    if (answerStep !== undefined) {
      const first = before(answerStep);
      if (first.length) questionAfter.set(id, first);
    }
    for (const s of own) {
      if (s.actor === 'operator') {
        if (stepped) {
          s.ordered = true;
          s.after = s.step === undefined ? [] : before(s.step);
        } else s.after = leadFirst;
        operator.push(s);
      } else if (s.actor === 'lead') lead.push(s);
      else other.push(s);
    }
    if (
      w &&
      !isTerminal(w) &&
      !SLOT_STAGES.has(w.stage.name) &&
      // Someone named acts on it: not "just waits its turn".
      !own.length &&
      (nobody.length || (!entries.length && !waits && isHeld(w)))
    )
      queue.push({ workId: id, blockers: nobody, unexplained: !nobody.length });
  }
  for (const e of view.escalations) {
    if (e.workId !== undefined) continue;
    const actor = actorOf(e.actor);
    const s = stepOf(
      {
        actor,
        code: e.code,
        action: e.action,
        since: e.since,
        records: [{ source: 'escalation', code: e.code, actor: e.actor, action: e.action }],
      },
      [],
      e.subject ?? '',
    );
    if (actor === 'operator') operator.push(s);
    else if (actor === 'lead') lead.push(s);
    else other.push(s);
  }
  return {
    questions,
    questionAfter,
    unlistedAnswers: [...answerOnly].filter((id) => !view.questions.some((q) => q.workId === id)),
    operator,
    lead: mergeSame(lead, graphOf),
    other: mergeSame(other, graphOf),
    dependencies,
    queue,
  };
}

const isHeld = (w: WorkView) => w.stage.name === 'stopped' || w.stage.name === 'blocked';
const isTerminal = (w: WorkView) =>
  w.stage.name === 'done' || w.stage.name === 'cancelled' || w.target !== undefined;

/**
 * Who acts on a work next, in order: lead steps that come first, then the
 * operator, then the rest. Used to say what a dependency waits for.
 */
export function actorsOn(
  steps: NextSteps,
  workId: string,
  /** With the view: questions the lead answers by the policy name the lead, not you (F-W). */
  view?: Pick<OperatorView, 'settings'>,
): StepActor[] {
  const out: StepActor[] = [];
  const add = (a: StepActor) => {
    if (!out.includes(a)) out.push(a);
  };
  const mine = (s: Step) => s.workIds.includes(workId);
  for (const s of steps.operator.filter(mine)) for (const f of s.after) add(f.actor);
  for (const f of steps.questionAfter.get(workId) ?? []) add(f.actor);
  const asking = steps.questions.filter((q) => q.workId === workId);
  const byLead =
    view !== undefined && asking.length > 0 && asking.every((q) => leadAnswers(view, q));
  if (byLead) add('lead');
  else if (asking.length || steps.unlistedAnswers.includes(workId)) add('operator');
  if (byLead && steps.unlistedAnswers.includes(workId)) add('operator');
  for (const s of steps.operator.filter(mine)) add(s.actor);
  for (const s of steps.lead.filter(mine)) add(s.actor);
  for (const s of steps.other.filter(mine)) add(s.actor);
  return out;
}

/** One part of an attempts line: harness text, or a failure group (bucket) with its count. */
export type AttemptsPart = { text: string } | { bucket: string; count: string };

/**
 * The harness attempts line (`attempts.line`, «…; отказов 4 (incomplete 2,
 * time-limit 1); …») split so that the failure group keys can be shown in
 * plain words. Only the list right after «отказов N» / `failures N` is
 * read; «и ещё N» / `and N more` and anything else stay text. A line in
 * another shape comes back as one text part.
 */
export function attemptsLineParts(line: string): AttemptsPart[] {
  const m = /((?:отказов|failures) \d+ \()([^()]*)(\))/.exec(line);
  if (!m) return [{ text: line }];
  const out: AttemptsPart[] = [{ text: line.slice(0, m.index) + m[1] }];
  m[2]!.split(', ').forEach((item, i) => {
    if (i) out.push({ text: ', ' });
    const b = /^([a-z][a-z0-9_-]*) (\d+)$/.exec(item);
    out.push(b ? { bucket: b[1]!, count: b[2]! } : { text: item });
  });
  out.push({ text: m[3]! + line.slice(m.index + m[0].length) });
  return out;
}

/**
 * A short name of a work for a sentence: the key before the colon of its
 * title («WEB-1: …» → «WEB-1»); else a readable id as is; else (an opaque
 * hash id) the title; else the id.
 */
export function workName(view: Pick<OperatorView, 'works'>, id: string): string {
  const title = view.works.find((w) => w.id === id)?.title?.trim();
  if (!title) return id;
  const key = /^([\p{L}\p{N}][\p{L}\p{N}._-]{0,23}):\s/u.exec(title);
  if (key) return key[1]!;
  // An opaque harness id (`t62c12c8100e7ce25d3e0`) says nothing to a person; a readable one stays.
  return /^[a-z]?[0-9a-f]{12,}$/.test(id) ? title : id;
}

/** Harness text with work ids replaced by their short names (`workName`). */
export function withWorkNames(view: Pick<OperatorView, 'works'>, text: string): string {
  let out = text;
  for (const w of view.works)
    if (w.id.length >= 6) out = out.split(w.id).join(workName(view, w.id));
  return out;
}

/** What a dependency is doing, for «ждёт WEB-1 (…)». */
export type DependencyState =
  | { kind: 'actors'; actors: StepActor[] }
  /** Working now (a slot stage): the harness and its agents act. */
  | { kind: 'running'; stage: string }
  /** Just waits its turn (`actor: null`), nothing is needed. */
  | { kind: 'queue' }
  /** Waits for another work itself. */
  | { kind: 'waits' }
  /** Cancelled: the dependent cannot start until its plan changes. */
  | { kind: 'cancelled' }
  /** Not in this view (a clipped list), or nothing said about it. */
  | { kind: 'unknown'; stage?: string };

/**
 * What a dependency is doing, for the dependent's line: who acts on it, or
 * that it runs, waits its turn, waits itself, or is not known here. Never
 * "nobody acts" for a work this view does not show.
 */
export function dependencyState(
  view: Pick<OperatorView, 'works'> & Partial<Pick<OperatorView, 'settings'>>,
  steps: NextSteps,
  id: string,
): DependencyState {
  const actors = actorsOn(steps, id, view.settings ? { settings: view.settings } : undefined);
  if (actors.length) return { kind: 'actors', actors };
  const w = view.works.find((x) => x.id === id);
  if (!w) return { kind: 'unknown' };
  if (w.stage.name === 'cancelled') return { kind: 'cancelled' };
  if (SLOT_STAGES.has(w.stage.name)) return { kind: 'running', stage: w.stage.name };
  // An explicit wait for its own dependency wins over a queued stage.
  if (steps.dependencies.some((d) => d.workId === id)) return { kind: 'waits' };
  if (steps.queue.some((q) => q.workId === id && !q.unexplained) || w.stage.name === 'queued')
    return { kind: 'queue' };
  return { kind: 'unknown', stage: w.stage.name };
}

/** Escalation code of a task waiting for a person's check in the task source (revision 5). */
export const SOURCE_REVIEW = 'SOURCE_REVIEW';

/**
 * Checks in the task source (revision 5): the harness groups by connector
 * (`sourceReviews[]`, with its line), and every task is also a
 * `SOURCE_REVIEW` escalation. `loose` are escalations no group lists (a
 * clipped list); `count` is the number of tasks named either way.
 */
export function sourceReviewItems(view: OperatorView): {
  groups: NonNullable<OperatorView['sourceReviews']>;
  loose: OperatorView['escalations'];
  count: number;
} {
  const groups = view.sourceReviews ?? [];
  const listed = new Set(groups.flatMap((g) => g.tasks.map((t) => t.workId)));
  const loose = view.escalations.filter(
    (e) => e.code === SOURCE_REVIEW && (e.workId === undefined || !listed.has(e.workId)),
  );
  const tasks = groups.reduce((n, g) => n + g.tasks.length, 0);
  return { groups, loose, count: tasks + loose.length };
}

/**
 * The check in the task source that waits on one work (revision 5), from
 * `sourceReviews[]` or else its `SOURCE_REVIEW` escalation; `undefined` when
 * none does. The Tasks card says it next to «принято».
 */
export function sourceReviewOf(
  view: OperatorView,
  workId: string,
): { key?: string; column?: string; since: string } | undefined {
  for (const g of view.sourceReviews ?? [])
    for (const x of g.tasks)
      if (x.workId === workId)
        return { ...(x.key ? { key: x.key } : {}), column: x.column, since: x.since };
  const e = view.escalations.find((x) => x.code === SOURCE_REVIEW && x.workId === workId);
  return e ? { ...(e.subject ? { key: e.subject } : {}), since: e.since } : undefined;
}
