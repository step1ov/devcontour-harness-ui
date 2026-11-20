// Operator view: the read-only document the panel renders. The schema is
// owned by devcontour-harness (`operatorViewSchema` in its
// src/contracts/operator-view.ts, JSON Schema schemas/operator-view.schema.json
// and schemas/work-detail-view.schema.json, harness 0.1.0-alpha.60, view
// version 1, revision 4; every revision 1–4 field is optional, so alpha.55
// (revision 0), alpha.56 (1), alpha.57/58 (2) and alpha.59 (3) documents have
// the same type). These types mirror it field by field; tests/contract.test.ts
// validates the fixtures against copies of the harness JSON Schemas. A host
// adapter that builds a view from its own store follows the same schema.
// Pure types: no node:*, no React.

/** Major version of the view document. Bumped only on a breaking change. */
export const VIEW_VERSION = 1 as const;

/** A sum with an honest bound: `unknown` is never shown as zero. */
export interface Bounded {
  value: number;
  bound: 'exact' | 'lower' | 'unknown';
}

export type Runtime = 'claude' | 'codex' | (string & {});
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | (string & {});
export type Actor = 'operator' | 'lead' | 'controller' | 'host' | (string & {});

/** Policy `RuntimeBinding` without the tool profile internals. */
export interface Binding {
  runtime: Runtime;
  model?: string;
  effort?: Effort;
}

export interface RoleBinding {
  /** Policy role id (`roles.<id>`). */
  role: string;
  writer: Binding;
  /** Set when a repository overrides the role (`repositories[].roles`). */
  repositoryId?: string;
}

export type ReviewKind = 'plan' | 'contract' | 'code';

export interface ReviewRuleView {
  kind: ReviewKind;
  /**
   * Where the effective rule comes from. Code review resolves
   * role -> repository -> global (`codeReview` in the harness policy).
   */
  scope: 'global' | 'repository' | 'role';
  repositoryId?: string;
  role?: string;
  reviewer: Binding;
  alternates: Binding[];
  vendor: 'different-vendor' | 'same-vendor-allowed';
}

export interface ViewSettings {
  /** Digest of the policy the view was computed from. */
  policyDigest: string;
  approvalMode: 'agent' | 'operator';
  mode: 'live' | 'fixture';
  concurrency: number;
  roles: RoleBinding[];
  reviews: ReviewRuleView[];
  thresholds: {
    /** `inputPolicy.threshold`: questions at or above it wait for an answer (11 = autonomous). */
    inputSeverity: number;
    /** `inputPolicy.leadAnswers.maxSeverity`; absent = the lead answers no blocking question. */
    leadAnswersMaxSeverity?: number;
    /**
     * `inputPolicy.leadAnswers.technical` (harness alpha.55): the lead answers
     * technical questions with a recorded reason. Questions that change the
     * result for the user always go to the operator. Absent = no.
     */
    leadAnswersTechnical?: boolean;
    criticalPaths: number;
    maxAttempts: number;
    repairBudget: number;
    maxNeutralFailures: number;
    /** Review rounds per subject (`maxAttempts * 2` in the harness today). */
    reviewRoundCap: number;
    /** Rounds without a decision after which a blocking finding goes to the operator. */
    reviewEscalationRounds: number;
  };
  budgets: {
    scope: 'work' | 'group' | 'total';
    usd?: number;
    timeMs?: number;
  }[];
  budgetOnUnknown?: 'stop' | 'continue';
  timeouts: {
    runTimeoutMs: number;
    leaseMs: number;
    gateTimeoutFloorMs?: number;
    stall: { intervalMs: number; quietMs: number; stalledMs: number; action: 'stop' | 'report' };
  };
  /** Lean profile layer from the project manifest; `unknown` without a manifest. */
  lean: { state: 'on' | 'off' | 'unknown' };
  /**
   * View paths (dotted, relative to `settings`) whose value came from harness
   * defaults, not the policy file, sorted: e.g. `approvalMode`,
   * `thresholds.repairBudget`, `thresholds.maxAttempts`, `timeouts.stall`.
   */
  defaulted: string[];
}

/** `status.works[].stage.name` (harness alpha.54). Unknown values are shown as is. */
export type WorkStage =
  | 'queued'
  | 'blocked'
  | 'prepare'
  | 'writer'
  | 'gates'
  | 'review'
  | 'integration'
  | 'input'
  | 'stopped'
  | 'done'
  | 'cancelled'
  | (string & {});

export type FindingStatus = 'open' | 'closed' | 'withdrawn' | 'accepted-limitation' | (string & {});

export interface FindingView {
  id: string;
  severity: string;
  status: FindingStatus;
  rounds?: number;
  disposition?: {
    decision: 'accepted-limitation' | 'continue';
    by: 'lead' | 'operator';
    round: number;
  };
  /** Clipped, masked one-liner; absent when titles are off. */
  title?: string;
}

/** One review subject (plan, contract or code) with its round counters. */
export interface ReviewSubjectView {
  kind: ReviewKind;
  subject: string;
  workId?: string;
  approved: boolean;
  rounds: { used: number; max: number | null };
  open: { blocking: number; notes: number };
  accepted: number;
  reviewer?: Binding;
  sameVendor?: boolean;
  spend: { calls: number; usd: Bounded };
  findings: FindingView[];
  escalation?: { requestId: string; findings: string[]; answered: boolean };
  line?: string;
}

export interface OperatorQuestion {
  requestId: string;
  workId: string;
  state:
    | 'awaiting-answer'
    | 'answered-not-applied'
    | 'applied-awaiting-claim'
    | 'delivered'
    | 'carry-stale'
    /** Detail of a closed work only (harness alpha.56): the request was cancelled or replaced. */
    | 'cancelled'
    | 'superseded'
    | (string & {});
  version: number;
  severity: number;
  /** Who may answer under the policy: severity above `leadAnswersMaxSeverity` is operator-only. */
  answerableBy: 'operator' | 'operator-or-lead';
  /**
   * Whether the answer changes the result for the user (harness alpha.55).
   * Harness always emits it (`user-visible` when the request has none); the
   * schema keeps it optional for other producers. Absent or unknown reads as
   * `user-visible`: only the operator answers.
   */
  impact?: 'user-visible' | 'technical' | (string & {});
  /** One plain line: what changes for the user. Masked and clipped (200). */
  plain?: string;
  answeredBy?: 'operator' | 'lead' | 'host';
  /** Who answered last and on what grounds (revision 1, harness alpha.56). */
  answerBasis?: AnswerBasis;
  /** Clipped and masked by the projection. */
  title?: string;
  createdAt: string;
  /** Answer options of the writer, at most 10, one may be recommended (revision 4). */
  options?: QuestionOption[];
  /** The writer's rationale (revision 4). Masked, clipped (200); absent with `--no-titles`. */
  rationale?: string;
  /**
   * Where the applied answer is (revision 4): with the running attempt
   * («ждать нечего») or with a finished one that did not pass it on («его
   * получит следующая попытка»).
   */
  line?: string;
}

/** One answer option of a writer question (revision 4, harness alpha.60). */
export interface QuestionOption {
  id: string;
  label: string;
  recommended?: true;
}

/** Grounds of the last answer to a question (revision 1, harness alpha.56). */
export interface AnswerBasis {
  by: 'operator' | 'lead' | 'host';
  /** Policy rule the lead answered under; absent for an operator or host answer. */
  rule?: 'technical' | 'severity';
  /** The lead's reason (required for a technical answer). Masked, clipped (200); absent with `--no-titles`. */
  reason?: string;
  /** Impact of the question when it was answered (`technical`, `user-visible`). */
  impact: string;
  at: string;
  /** Ready line in the view language: «ответил ведущий (технический вопрос): <причина>». */
  line: string;
}

export interface Escalation {
  workId?: string;
  subject?: string;
  code: string;
  actor: Actor;
  action: string;
  since: string;
}

/** Post-acceptance drift of the target ref (`acceptedTargetSchema`). */
export interface DriftView {
  workId: string;
  repositoryId: string;
  ref: string;
  acceptedSha: string;
  head?: string;
  commitsSinceAccepted?: number;
  filesSinceAccepted?: number;
  diverged?: true;
  unavailable?: string;
}

/** Why a work waits, in plain words (harness alpha.55). */
export interface BlockerView {
  /** Engine blocker code, e.g. `DEPENDENCY_INCOMPLETE`, `INPUT_REQUIRED`. */
  code: string;
  /** Fixed plain text for the code (≤ 160); absent = the harness gave no explanation. */
  plain?: string;
  /** Who has to act; `null` = nobody, the work just waits its turn. */
  actor: Actor | null;
  /**
   * Order of removal when different people remove the blockers (revision 4,
   * harness alpha.60): 1 goes first (a plan approval before an attempt reset).
   */
  step?: number;
}

/** Observed duration of a stage in this state (P2); a range, never a promise. */
export interface TypicalDuration {
  p50Ms: number;
  p90Ms: number;
  samples: number;
}

/** Where an accepted result is (P2). The remote state is read from the local remote-tracking ref, never fetched. */
export interface TargetView {
  repositoryId: string;
  ref: string;
  acceptedSha?: string;
  remote: {
    state: 'pushed' | 'not-pushed' | 'unknown' | (string & {});
    trackingRef?: string;
    /**
     * Why the state is unknown, in the requested language. Masked and clipped
     * (200). Harness 0.1.0-alpha.55 and .56 do not read the tracking ref and
     * always send `unknown` with a reason.
     */
    reason?: string;
    /**
     * When git on this machine last updated the tracking ref (its reflog),
     * revision 2 (harness alpha.57). Absent without a reflog, and before.
     */
    checkedAt?: string;
    /**
     * Ready line in the view language (revision 2, harness alpha.57): «уже в
     * удалённой ветке origin/main», «принято локально; в удалённой ветке
     * origin/main ещё нет», «неизвестно (нет удалённой ветки)». Clipped (200).
     */
    line?: string;
  };
}

export interface WorkView {
  id: string;
  graphId: string;
  title?: string;
  status: string;
  stage: {
    name: WorkStage;
    step?: string;
    since?: string;
    next: string[];
    needs?: { actor: Actor | null; action: string };
    /** Observed duration of this stage (P2); absent below the sample minimum. */
    typical?: TypicalDuration;
  };
  attempts: {
    used: number;
    max: number;
    left: number;
    /** Counted failures (`attemptSummaryOf`), shutdown interruptions excluded. */
    failed: number;
    /** Shutdown interruptions (`interruptedByShutdown`); they use no attempt. */
    interrupted: number;
    /** Gate evidence records with `recheck: true` across the work's attempts. */
    rechecks: number;
    /** Uncounted (neutral) failures: `work.neutralFailures` against `MAX_NEUTRAL_FAILURES`. */
    neutral: { used: number; max: number };
    /** One-line summary computed by the harness; never re-derived here. */
    line?: string;
    /** Why the previous attempt stopped (harness alpha.55). */
    lastFailure?: {
      attempt: number;
      /** Report failure bucket (`failureBucketOf`), e.g. `environment`, `defect`. */
      bucket: string;
      /** Plain sentence, e.g. "environment: the port is busy". Masked and clipped (160). */
      plain: string;
      at?: string;
      /**
       * Engine failure class (`failureKind`: `environment`, `needs-input`,
       * `needs-lead`, `timeout`…), revision 4 (harness alpha.60). Absent = unknown.
       */
      kind?: string;
      /** Whether the attempt counts against the limit (revision 4). Absent = unknown. */
      counted?: boolean;
    };
  };
  liveness?: 'active' | 'quiet' | 'stalled';
  runtime?: Runtime;
  model?: string;
  /** Why the work waits; empty = nothing blocks it. Replaces the draft `string[]`. */
  blockers: BlockerView[];
  /** Work ids this work depends on, from the graph (P2, run plan strip); at most 50. */
  dependsOn?: string[];
  /** Accepted locally and, as far as the local tracking ref knows, on the remote (P2). */
  target?: TargetView;
  /** `line` (revision 4): where the applied answer is, in the view language. */
  question?: Pick<OperatorQuestion, 'requestId' | 'state' | 'severity' | 'line'>;
  spend: { calls: number; usd: Bounded; durationMs: number };
  resultSha?: string;
}

export interface ViewProgress {
  /** Counts over all works, never over the (possibly truncated) `works` list. */
  total: number;
  byStage: Record<string, number>;
  /** Works in a stage that holds a worker slot (prepare, writer, gates, review, integration). */
  running: number;
  done: number;
  waitingOperator: number;
  queue: {
    paused: boolean;
    reason?: string;
    detail?: string;
    actor?: Actor;
    action?: string;
    /**
     * Who moves the queue (revision 4, harness alpha.60): `running` — a live
     * controller, a running attempt or a plan review in a live run;
     * `not-running` — nobody runs, only a new start moves the open works.
     * Absent = an older harness.
     */
    runner?: 'running' | 'not-running';
    /**
     * Harness 0.1.0-alpha.62: nothing has run with this state directory yet
     * (no state, or no works, attempts, call records or controller); `line`
     * then says how the first run starts. Absent = a state that ran, or an
     * older harness.
     */
    neverRun?: boolean;
    /** Who starts the run again when nobody runs (`lead`: `harness run`). */
    restartBy?: Actor;
    /** The same as a plain line («очередь стоит — никто не запущен; …»). */
    line?: string;
  };
}

/** Fixed-width buckets ending at `to`; every series has one value per bucket. */
export interface ViewHistory {
  from: string;
  to: string;
  bucketMs: number;
  /** Peak concurrent attempts in the bucket. */
  load: number[];
  attemptsStarted: number[];
  attemptsFailed: number[];
  /** Applicable gate results; skipped (not-applicable) gates are in neither series. */
  gatesPassed: number[];
  gatesFailed: number[];
  /** Integration gates whose candidate evidence was reused (counted only here). */
  gatesReused: number[];
  /** Known spend of calls finished in the bucket (report cost rules). */
  spendUsd: number[];
  /** Bound over the whole window: `lower` if any call in it has no known cost. */
  spendBound: Bounded['bound'];
  /** Spend before `from`, so the cumulative curve starts at the right height. */
  spendOpeningUsd: Bounded;
  budgetUsd?: number;
  /** Window totals computed by the harness (revision 1, harness alpha.56); absent before. */
  totals?: HistoryTotals;
}

/** Window totals (revision 1): the same rules as the series, summed by the harness. */
export interface HistoryTotals {
  attemptsStarted: number;
  attemptsFailed: number;
  /** Failed attempts by failure bucket; the values sum to `attemptsFailed`. */
  failuresByBucket: Record<string, number>;
  gatesPassed: number;
  gatesFailed: number;
  gatesReused: number;
  /** Review rounds in the window: plan, contract, `review-code` and reviews inside attempts. */
  reviewRounds: { plan: number; contract: number; code: number; attempt: number };
  /** Spend of the window with an honest bound. */
  spendUsd: Bounded;
  /** Window time during which at least one attempt ran. */
  wallMs: number;
  /** Sum of attempt durations (parallel attempts add up). */
  attemptMs: number;
  /** Peak concurrent attempts. */
  loadPeak: number;
}

export interface ViewHealth {
  controller: { present: boolean; leaseUntil?: string };
  stalledAttempts: number;
  quietAttempts: number;
  environmentFailures: number;
  /** `off` when the policy has no budgets (`budgetOverview` returns nothing). */
  budgeting: 'on' | 'off';
  /** One row per budgeted scope instance (total, each group, each work). */
  budgets: {
    scope: 'work' | 'group' | 'total';
    id?: string;
    state: 'within' | 'exceeded' | 'undetermined';
    spentUsd: Bounded;
    limitUsd?: number;
    spentMs?: number;
    limitMs?: number;
  }[];
  /** All known spend in the state, independent of budgets. */
  spentTotalUsd: Bounded;
  /** Drift counts over all accepted works, not over the `drift` list. */
  drift: { checked: number; drifted: number; unavailable: number };
  /** Plain `message` in the requested language (`--lang`); codes are stable. */
  warnings: { code: ViewWarningCode; message: string }[];
  /** Compatibility with each task source by its last observation (revision 4). */
  sources?: SourceHealth[];
}

/** One task source in health (revision 4, harness alpha.60). */
export interface SourceHealth {
  connector: string;
  provider: string;
  /** `recommended`, `below-recommended`; unknown values are shown as is. */
  level?: string;
  /** Whether the source declared the task context. */
  taskContext?: boolean;
  contractVersion?: number;
  /** Plain line in the view language. */
  line?: string;
  checkedAt: string;
}

/**
 * A task of the run slice (revision 4, harness alpha.60): every task of the
 * last snapshot of each connector, ready or not. `in-harness` has a
 * `workId`; `not-ready` has the first snapshot reason in `plain`;
 * `not-handed-over` has a snapshot and no work yet.
 */
export interface ScopeTaskView {
  id: string;
  connector: string;
  key?: string;
  title?: string;
  workId?: string;
  state: 'in-harness' | 'not-handed-over' | 'not-ready';
  plain?: string;
}

/** An owner question the lead wrote in the task source (revision 4). Read-only: answered there. */
export interface SourceQuestion {
  connector: string;
  provider: string;
  id: string;
  /** Document key in the source. */
  ref: string;
  title?: string;
  question?: string;
  options?: string[];
  recommendation?: string;
  /** Provisional answer the work goes on with meanwhile. */
  provisional?: string;
  /** Task keys it is about. */
  tasks?: string[];
  /** Page of the document in the source's web UI. */
  url?: string;
  /** When the connector last read it (not a live read). */
  readAt: string;
}

/** Release forecast (revision 4, harness alpha.60, proposal P11): an observation, not a promise. */
export interface ForecastView {
  progress: {
    /** Rounded share of the weighted scope; never 100 while tasks are left. */
    percent: number;
    weighted: number;
    total: number;
    done: number;
    inWork: number;
    left: number;
    /** `scope`: the run slice of the connector; `works`: harness works only. */
    basis: 'scope' | 'works';
    line: string;
  };
  time: {
    startedAt?: string;
    /** From the start of the first attempt of the scope; absent = not started. */
    elapsedMs?: number;
    /** Absent below the sample minimum: unknown, never zero. */
    remaining?: { loMs: number; hiMs: number; samples: number; attemptsPerTask: number };
    /** Works waiting for a person or the lead now, and the longest wait; not in the forecast. */
    humanWait: { works: number; ms: number; since?: string };
    line: string;
  };
  /** The assumptions in words, in the view language. */
  assumptions: string[];
}

/** Updates of the harness and the panel by the last `harness update --check` (revision 4). */
export interface UpdatesView {
  state: 'up-to-date' | 'available' | 'needs-decision' | 'unavailable' | 'not-checked';
  mode: 'auto' | 'notify' | 'off';
  current: { harness: string; ui?: string };
  available?: { harness: string; ui?: string };
  checkedAt?: string;
  /** «Доступна … — что нового · как обновить». */
  line: string;
  whatsNew?: string[];
  /** The harness command that installs it. */
  command?: string;
}

/**
 * `health.warnings[].code` values harness 0.1.0-alpha.55 emits. Unknown codes
 * from a newer producer are shown with their message as is.
 */
export type ViewWarningCode =
  | 'POLICY_DIGEST_MISMATCH'
  | 'STATE_NOT_FOUND'
  | 'DRIFT_UNAVAILABLE'
  | 'VIEW_TRUNCATED'
  | (string & {});

/**
 * Who acted in an activity entry (harness alpha.57): the controller started an
 * attempt or a check, accepted a work or escalated; the writer asked; the
 * reviewer gave a verdict; the lead, the operator or the host answered. The
 * schema keeps it an open string: an unknown actor is shown as is.
 */
export type ActivityActor =
  'controller' | 'writer' | 'reviewer' | 'lead' | 'operator' | 'host' | (string & {});

/** Event codes of `activity[].action` that harness alpha.57 emits; others are shown as is. */
export type ActivityAction =
  | 'attempt.started'
  | 'attempt.failed'
  | 'attempt.cancelled'
  | 'attempt.expired'
  | 'attempt.interrupted'
  | 'work.accepted'
  | 'gate.passed'
  | 'gate.failed'
  | 'gate.recheck'
  | 'gate.reused'
  | 'gate.not-launched'
  | 'review.approved'
  | 'review.changes-requested'
  | 'review.escalated'
  | 'question.asked'
  | 'question.answered'
  | (string & {});

/**
 * One entry of "who did what" (revision 2, harness alpha.57): an event of the
 * history window, newest first, from records the harness already keeps.
 */
export interface ActivityEntry {
  at: string;
  actor: ActivityActor;
  /** Event code, e.g. `attempt.started`, `gate.failed`, `question.answered`. */
  action: ActivityAction;
  workId?: string;
  subject?: string;
  /** Plain sentence. Masked and clipped (200). */
  plain: string;
}

/**
 * A decision taken during the run (P2), including temporary ones. Required
 * combinations (design §3.9): `temporary` needs `revisit`, `technical-answer`
 * needs `requestId` and `reason`, `accepted-limitation` needs `findingId`.
 * Texts are masked and clipped: title and revisit 200, reason 400.
 */
export interface DecisionView {
  id: string;
  kind: 'accepted-limitation' | 'technical-answer' | 'continue' | (string & {});
  by: 'lead' | 'operator';
  at: string;
  workId?: string;
  subject?: string;
  findingId?: string;
  requestId?: string;
  /** Temporary: to be revisited when `revisit` holds. */
  temporary: boolean;
  revisit?: string;
  title?: string;
  reason?: string;
}

/**
 * The overview document (`harness view --state <dir> [--lang ru|en]`). Every
 * plain string (`plain`, `line`, `reason`, warning messages) comes from the
 * harness in the requested language; details quoted from external output
 * (e.g. a lint message) are not translated. Codes and ids are never localized.
 */
export interface OperatorView {
  viewVersion: typeof VIEW_VERSION;
  /** Additive revision inside a major version; the UI ignores unknown fields. */
  viewRevision: number;
  generatedAt: string;
  source: {
    producer: string;
    producerVersion: string;
    stateVersion: number;
    /** Content token: SHA-256 of the canonical view bytes; equal token = same view. */
    token: string;
  };
  settings: ViewSettings;
  works: WorkView[];
  reviews: ReviewSubjectView[];
  questions: OperatorQuestion[];
  escalations: Escalation[];
  drift: DriftView[];
  progress: ViewProgress;
  history: ViewHistory;
  health: ViewHealth;
  /**
   * Events of the history window, newest first, at most 50 (revision 2,
   * harness alpha.57); omitted ones are counted in `truncated.activity`.
   * Absent = the producer keeps no feed; `[]` = nothing happened in the window.
   */
  activity?: ActivityEntry[];
  /** At most 50 (P2). Absent = the producer reports no decisions. */
  decisions?: DecisionView[];
  /** The whole run slice, at most 200 tasks (revision 4). Absent = no connector. */
  scope?: { total?: number; tasks: ScopeTaskView[] };
  /**
   * Why `scope` is absent (harness 0.1.0-alpha.62): `no-snapshot` — no
   * connector has read the tracker tasks yet; `unreadable` — a connector
   * database exists but this harness could not read it. Absent = `scope` is present, was
   * dropped for size (`truncated.scope`), or an older harness.
   */
  scopeReason?: 'no-snapshot' | 'unreadable';
  /** Open owner questions from the task source, at most 50 (revision 4). */
  sourceQuestions?: SourceQuestion[];
  /** Release forecast (revision 4). Absent = an older harness or an empty scope. */
  forecast?: ForecastView;
  /** Updates (revision 4). Absent = no updates config and no check. */
  updates?: UpdatesView;
  /** Entries omitted by the projection's per-list limits, by list. */
  truncated?: Partial<
    Record<
      | 'works'
      | 'reviews'
      | 'findings'
      | 'questions'
      | 'escalations'
      | 'drift'
      | 'roles'
      | 'reviewRules'
      | 'warnings'
      | 'budgets'
      | 'blockers'
      | 'dependsOn'
      | 'alternates'
      | 'activity'
      | 'decisions'
      | 'scope'
      | 'sourceQuestions'
      // Harness 0.1.0-alpha.61: works that lost their revision 4 fields for
      // size, and `updates.whatsNew` items over 10. Typed, not shown yet.
      | 'workFields'
      | 'whatsNew',
      number
    >
  >;
}

/** One attempt row of the work detail document. */
export interface AttemptRow {
  attempt: number;
  status: string;
  /** Report failure bucket (`failureBucketOf`), e.g. `defect`, `environment`. */
  failureBucket?: string;
  interrupted?: true;
  runtime: Runtime;
  model?: string;
  startedAt: string;
  finishedAt?: string;
  /**
   * Timed stages of the attempt as the harness records them: `prepare` and
   * `integration-prepare` (revision 3, harness alpha.59: preparing the
   * dependencies is its own stage), `dependency-store`, `implementation`,
   * `candidate-test:<gate>`, `candidate-review`, `integration-…`. `unused`
   * (revision 3): the stage ran but had nothing to do (a dependency store
   * that did not deploy a seed); it closes `passed`.
   */
  stages: { stage: string; durationMs?: number; outcome?: 'passed' | 'failed'; unused?: true }[];
}

/**
 * How one check was done (harness alpha.55). Never a bare "checked".
 * `executed` needs `by` and `attempt`, `reused` needs `attempt`; a review row
 * is never `executed`; a gate still running is `not-run` / `not-checked`.
 */
export interface VerificationRow {
  /** Gate id (`gate@consumer` for a consumer gate), or the review subject for review rows. */
  gate: string;
  kind: 'gate' | 'review';
  /** Evidence phase of a gate row: candidate or integration. */
  phase?: 'candidate' | 'integration';
  /**
   * `skipped` = the gate does not apply; `not-run` = it applies but did not
   * run (yet). Unknown values are shown as is, never as passed.
   */
  result: 'passed' | 'failed' | 'reused' | 'skipped' | 'not-run' | (string & {});
  /** executed = ran now; reused = earlier evidence; read = reviewer read the diff and ran nothing. */
  how: 'executed' | 'reused' | 'read' | 'not-checked' | (string & {});
  /** `harness` for an executed gate; the reviewer runtime for a review row. */
  by?: string;
  attempt?: number;
  at?: string;
}

/**
 * Work detail: a second document (`harness view --work <id>`, `/api/view?work=<id>`)
 * so that per-attempt rows never inflate the overview document.
 */
export interface WorkDetailView {
  viewVersion: typeof VIEW_VERSION;
  viewRevision: number;
  generatedAt: string;
  source: OperatorView['source'];
  work: WorkView;
  /** Newest first, at most 20. */
  attempts: AttemptRow[];
  /** At most 50. Absent = the producer has no verification rows: shown as "no data", never as checked. */
  verification?: VerificationRow[];
  reviews: ReviewSubjectView[];
  questions: OperatorQuestion[];
  drift?: DriftView;
  truncated?: Partial<
    Record<
      | 'attempts'
      | 'findings'
      | 'verification'
      | 'stages'
      | 'reviews'
      | 'questions'
      | 'blockers'
      | 'dependsOn',
      number
    >
  >;
}
