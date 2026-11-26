// Operator view: the read-only document the panel renders. The schema is
// owned by devcontour-harness (`operatorViewSchema` in its
// src/contracts/operator-view.ts, JSON Schema schemas/operator-view.schema.json
// and schemas/work-detail-view.schema.json, harness 0.1.0-alpha.68, view
// version 1, revision 8; every revision 1–8 field is optional, so alpha.55
// (revision 0), alpha.56 (1), alpha.57/58 (2), alpha.59 (3), alpha.60–.62
// (4), alpha.65 (5), alpha.66 (6) and alpha.67 (7) documents have the same type). These types mirror it field by field; tests/contract.test.ts
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

/**
 * The kind of a review subject (`reviews[].kind`): revision 9 (harness
 * 0.1.0-alpha.69) adds `release` — the acceptance review of the release.
 */
export type ReviewSubjectKind = ReviewKind | 'release';

/**
 * `settings.harnessMode` (revision 9, harness 0.1.0-alpha.69): `light` (the
 * default, `default: true` — the policy has no field) or `strict`; revision
 * 11 (harness 0.1.0-alpha.73) adds `thin` — the light environment with one
 * writer session per work, checks on a clean checkout and one review.
 * `writeGuard` — whether the write boundary is in force.
 */
export interface HarnessModeView {
  mode: 'light' | 'strict' | 'thin';
  default: boolean;
  writeGuard: boolean;
}

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
    /**
     * Revision 9: light mode — plan (and contract) review rounds have no
     * limit; the budget is the release time and cost. `reviewRoundCap` is
     * then the strict mode's limit.
     */
    reviewRoundsUnlimited?: boolean;
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
  /**
   * Who decides (revision 6, harness alpha.66): the attempt limit, the
   * recovery rule and whether the lead answers technical questions — each
   * value, where it comes from and one sentence in both languages; the
   * summary in one phrase and an unusual combination. Absent = an older harness.
   */
  decisions?: DecisionSettingsView;
  /** Revision 9: the harness mode; absent = an older harness. */
  harnessMode?: HarnessModeView;
}

/** The keys of `settings.decisions.items[]` (harness alpha.66). */
export type DecisionSettingKey =
  | 'maxAttempts'
  | 'recovery.mode'
  | 'recovery.diagnoseAfter'
  | 'recovery.leadResets'
  | 'inputPolicy.leadAnswers.technical';

/** A text the harness gives in both languages; the panel picks the current one. */
export interface Bilingual {
  ru: string;
  en: string;
}

/** `settings.decisions` (revision 6): the same texts as `doctor` and `status --human`. */
export interface DecisionSettingsView {
  /** At most 10. */
  items: {
    key: DecisionSettingKey;
    value: number | boolean | string;
    /** `policy` — the policy field; `derived` — from a neighbouring setting; `default`. */
    source: 'policy' | 'derived' | 'default';
    explain: Bilingual;
  }[];
  /** «после 2 отказов — разбор ведущего; …; дальше — вы». */
  summary: Bilingual;
  /** An allowed but unusual combination, named. */
  warning?: Bilingual;
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

/** One review subject (plan, contract, code or, from revision 9, release) with its round counters. */
export interface ReviewSubjectView {
  kind: ReviewSubjectKind;
  subject: string;
  workId?: string;
  approved: boolean;
  /**
   * `used` — counted in the current epoch (harness alpha.68); `remaining` —
   * left to the limit (`null` without one); `free` — re-reviews of an
   * unchanged plan that spent no round (revision 8).
   */
  rounds: { used: number; max: number | null; remaining?: number | null; free?: number };
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

/** Kinds of a track step (revision 6). */
export type TrackStepKind =
  | 'code'
  | 'checks'
  | 'review'
  | 'integration'
  | 'question'
  | 'diagnosis'
  | 'reset'
  | 'user-decision'
  | 'accepted';

/** States of a track step (revision 6). */
export type TrackStepState =
  'planned' | 'current' | 'passed' | 'failed' | 'waiting' | 'skipped' | 'decision';

/** One step of the whole path of a work (`works[].track.steps[]`, revision 6). */
export interface TrackStep {
  kind: TrackStepKind;
  /** Attempt number; planned attempts continue the numbering. */
  attempt?: number;
  state: TrackStepState;
  /** Ready label in the view language («код», «разбор ведущего»), at most 80. */
  label: string;
  at?: string;
  /** Short plain reason: why it failed, what was decided. At most 200. */
  reason?: string;
  /** A step of a rework after acceptance (the rework number). */
  rework?: number;
  /**
   * Who acts at a decision or wait step (harness alpha.66): the lead, a
   * person (`user`) or the harness itself. Absent on attempt steps.
   */
  actor?: 'lead' | 'user' | 'harness';
  /**
   * Revision 8 (harness alpha.68), diagnosis steps: `true` — the work is
   * held until the lead diagnoses (DIAGNOSIS_REQUIRED, exhaustion); `false`
   * — the harness retries by itself and the lead may diagnose.
   */
  required?: boolean;
}

/**
 * The whole path of a work (revision 6): the attempts by step (code →
 * checks → review → integration), the lead's and people's decisions between
 * them, the current point and the planned rest. At most 120 steps; the
 * earliest are dropped first (`truncated`).
 */
export interface WorkTrack {
  steps: TrackStep[];
  truncated?: number;
}

export interface WorkView {
  id: string;
  graphId: string;
  title?: string;
  status: string;
  /** Revision 6: the plan of the work is not approved yet and nothing ran — «ещё не утверждена». */
  planned?: true;
  /**
   * Revision 6: a rework an older harness cancelled together with the work
   * is shown as the accepted work (`done`, the earlier result);
   * `restoredLine` says so («принято на <sha>; доработка отменена»).
   */
  restoredFrom?: 'cancelled-rework';
  restoredLine?: string;
  /**
   * Revision 7 (harness alpha.67): a harness infrastructure work (environment
   * bridges, gate wrappers, acceptance tests in `.harness/`). Otherwise a
   * normal task: attempts, gates, review, forecast and path. Absent = a
   * product work (or an older harness).
   */
  kind?: 'infra' | (string & {});
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
    /**
     * Runs in all, uncounted ones included (a writer question, an environment
     * refusal, a stop); present only when it differs from `used` (revision 5).
     */
    runs?: number;
    /**
     * A rework after acceptance (harness alpha.66): a new revision changed
     * the task of the accepted work. The counters are the rework's only;
     * `acceptedSha`/`acceptedAt` — the earlier acceptance; `fresh` — the
     * rework has its own attempt limit.
     */
    rework?: { revision: number; fresh: boolean; acceptedSha: string; acceptedAt?: string };
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
      /**
       * Revision 10 (harness alpha.70): the failure-cause reference,
       * `docs/failure-causes.md#kind-<class>` or `#cause-<cause>`.
       */
      reference?: string;
      /** Revision 10: the same document in the harness repository of this version. */
      referenceUrl?: string;
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
  /** Revision 6: the whole path of the work. Absent = an older harness or dropped for size. */
  track?: WorkTrack;
  /** Revision 8: a new plan revision reopened the accepted work; the rework is not accepted yet. */
  reopened?: ReopenedView;
  /** Revision 8: the last applied independent review round per attempt and phase, at most 40. */
  attemptReviews?: AttemptReviewResult[];
  /**
   * Revision 10: the writer's follow-up tasks and split proposals, at most
   * 20, with the lead's decision (`harness proposal`; the panel only shows them).
   */
  proposals?: ProposalView[];
  /** Revision 10: the work's spend, total and by attempt (no work-list limit). */
  cost?: WorkCostView;
}

/** `works[].cost` (revision 10). */
export interface WorkCostView extends CostAmountView {
  byAttempt: AttemptCostView[];
  /** Earlier attempts over the limit of `byAttempt`. */
  byAttemptTruncated: number;
}

/** One attempt's spend (revision 10). */
export interface AttemptCostView extends CostAmountView {
  runId: string;
  attempt?: number;
}

/** `works[].proposals[]` (revision 10). */
export interface ProposalView {
  id: string;
  /** `follow-up` — a task for the rest outside the criteria; `split` — split the work. */
  kind: 'follow-up' | 'split';
  status: 'proposed' | 'accepted' | 'rejected';
  /** The attempt that proposed it. */
  attempt: number;
  /** For a split without a title the harness says «разделение на N части». */
  title?: string;
  /** The writer's words: the goal and why it is outside the work. */
  goal?: string;
  reason?: string;
  /** Parts of a split. */
  parts?: number;
  /** The decision of the lead or the operator, with its basis. */
  decision?: { by: 'lead' | 'operator'; at: string; reason?: string };
}

/**
 * `works[].attemptReviews[].secondPass` (revision 10): the second review
 * pass tries to refute each blocking finding of the first.
 */
export interface SecondPassView {
  mode: 'on-reject' | 'always';
  /** `failed` — the second call failed; the first pass stands. */
  status: 'ran' | 'failed';
  /** Findings of the first pass the second refuted. */
  refuted: number;
  /** Findings the first pass missed (`always` only). */
  missed: number;
  /** The rejection of the first pass was lifted. */
  overturned?: true;
  /** The refuted findings with the basis of each, masked, at most 20. */
  refutedFindings?: { finding: string; basis: string }[];
}

/** `works[].reopened` (revision 8): why an accepted work is in work again. */
export interface ReopenedView {
  at: string;
  /** Who approved the reopening revision; absent while it is not approved. */
  by?: 'lead' | 'operator';
  revision: number;
  /** `fresh` — its own attempt limit; `carried` — the limit carried over. */
  budget: 'fresh' | 'carried';
  acceptedSha: string;
  /** Counted attempts of the accepted revision. */
  spent: number;
  /** The harness phrase for the card. */
  reason: string;
}

/** `works[].attemptReviews[]` (revision 8). Lead code reviews (`reviews[kind=code]`) are not here. */
export interface AttemptReviewResult {
  attempt: number;
  phase: 'candidate' | 'integration';
  /** `invalid` — only off-protocol or unsafe replies. */
  verdict: 'approved' | 'rejected' | 'invalid';
  /** Open blocking findings of the round. */
  findings: number;
  /** Other open findings. */
  notes: number;
  at: string;
  /** An attempt of the earlier (accepted) revision of the work, before the rework. */
  earlier?: true;
  /** Revision 10: the second review pass; absent = one pass or an older harness. */
  secondPass?: SecondPassView;
}

/** `forecast.progress.works[].stageProgress` (revision 8): the running attempt's stage. */
export interface StageProgressView {
  stage: 'code' | 'checks' | 'review' | 'integration';
  /** Share of the attempt at the start (`from`) and end (`to`) of the stage, 0..1. */
  from: number;
  to: number;
  since?: string;
  typicalMs?: number;
  samples?: number;
}

/** `forecast.progress.growth` (revision 8): the last plan growth. */
export interface ForecastGrowthView {
  at: string;
  added: string[];
  before: number;
  after: number;
  by: 'works' | 'outline';
  reason?: string;
  line: string;
}

/** How much of an outline part has harness works (revision 8). */
export type OutlineFill = 'registered' | 'partial' | 'unregistered';

/** A component of a release outline stage (revision 8). */
export interface OutlineComponentView {
  id: string;
  title?: string;
  size?: 'S' | 'M' | 'L';
  tasks?: number;
  actor: 'writers' | 'environment' | 'owner';
  state: OutlineFill;
  units: number;
  registered: number;
  percent: number;
  works?: string[];
}

/** One stage of the lead's release outline (revision 8). */
export interface OutlineStageView {
  id: string;
  title?: string;
  kind: 'infra' | 'product' | 'deploy' | 'other';
  state: OutlineFill;
  units: number;
  registered: number;
  percent: number;
  components: OutlineComponentView[];
}

/** `forecast.outline` (revision 8): the lead's release outline, or the hint that there is none. */
export interface ForecastOutlineView {
  state: 'recorded' | 'missing';
  code?: 'RELEASE_OUTLINE_MISSING';
  revision?: number;
  recordedAt?: string;
  units?: number;
  registered?: number;
  unregistered?: number;
  beyond?: number;
  stages?: OutlineStageView[];
  line: string;
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

/** Accepted works waiting in the task source for a person's check (revision 5). */
export interface SourceReview {
  connector: string;
  provider: string;
  tasks: { taskId: string; key?: string; workId: string; column: string; since: string }[];
  /** «ждут вашей проверки в Relay: WEB-1, WEB-2». */
  line: string;
}

/**
 * The setup document (revision 5, `setupViewSchema`): `harness view
 * --repository <root>` before the harness is set up in the project (no
 * `.harness/project.json`, no policy or binding). The panel keeps reading
 * until an overview comes.
 */
export interface SetupView {
  viewVersion: typeof VIEW_VERSION;
  viewRevision: number;
  generatedAt: string;
  source: OperatorView['source'];
  stage: { name: 'setup'; lines: string[]; progress?: SetupProgressView };
  setup: { waitingFor: 'project' | 'policy' };
}

/** A setup step (revision 7, harness alpha.67), in the harness order. */
export type SetupStepId = 'profile' | 'init' | 'doctor' | 'smoke' | 'probe' | 'gates' | 'connector';

/**
 * `done`, `failed`, `pending` (not done yet), `skipped` (not needed: no
 * connector, the tasks are graph files), `unknown` (the outcome is not
 * recorded: doctor only reads). The panel reads any other value as `unknown`
 * (`setupProgressOf`).
 */
export type SetupStepState = 'done' | 'failed' | 'pending' | 'skipped' | 'unknown';

export interface SetupStepView {
  id: SetupStepId;
  state: SetupStepState;
  /** When the step was last recorded. */
  at?: string;
  /** Duration of the step's last pass (smoke, gates), when recorded. */
  elapsedMs?: number;
  /** The harness line in Russian and in English (both are always sent). */
  line: string;
  lineEn: string;
}

/**
 * Setup progress (revision 7, harness alpha.67, `stage.progress` of the
 * overview and of the setup document), while there are no works yet: the
 * steps with their state and time, the setup time against a soft budget
 * (30 min by default). `line` is not one of `stage.lines`.
 */
export interface SetupProgressView {
  /** Start of setup: the earliest record (`.harness/` files, the first smoke or gates). */
  since?: string;
  elapsedMs?: number;
  budgetMs: number;
  /** Setup takes longer than the budget: new infrastructure code goes into the plan as infra works. */
  overBudget: boolean;
  steps: SetupStepView[];
  line: string;
  lineEn: string;
}

/**
 * `forecast.progress.release.review` (revision 9, harness 0.1.0-alpha.69):
 * the acceptance review of the release — whether `release done` waits for
 * it, its state, the round, open and blocking findings, the release base
 * and where it comes from, and the harness line.
 */
export interface ReleaseReviewView {
  required: boolean;
  status: 'not-run' | 'stale' | 'findings' | 'approved';
  round?: number;
  open?: number;
  blocking?: number;
  base?: string;
  baseSource?: 'register' | 'outline' | 'attempt';
  head?: string;
  target?: string;
  at?: string;
  line: string;
}

/**
 * `forecast.progress.release.docs` (revision 10, harness 0.1.0-alpha.70):
 * a work labelled `docs`, after every root work, accepted before the release
 * acceptance. `works` — the docs works; `missingRoots` — roots it does not follow.
 */
export interface ReleaseDocsView {
  mode: 'required' | 'advisory' | 'off';
  status: 'off' | 'no-works' | 'missing' | 'not-after-roots' | 'pending' | 'done';
  works: string[];
  missingRoots?: string[];
  line?: string;
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
    /**
     * Tasks added to the release after it started (revision 5), at most 10:
     * «добавлена задача WEB-3 (задач 2 → 3)».
     */
    added?: {
      key: string;
      workId?: string;
      at: string;
      before: number;
      after: number;
      line: string;
    }[];
    /** Readiness of each unfinished work and its counted attempt (revision 5), at most 50. */
    works?: {
      workId: string;
      key?: string;
      percent: number;
      attempt?: { n: number; max: number };
      /** `repair`: the running attempt fixes the last review; `answer`: it goes on after a question. */
      retry?: 'repair' | 'answer';
      /** A rework after acceptance: `percent` is the rework's; the work is already `done`. */
      rework?: true;
      /** Revision 8: the stage of the running attempt and its share span. */
      stageProgress?: StageProgressView;
      line: string;
    }[];
    /** Revision 8: the last plan growth. */
    growth?: ForecastGrowthView;
    /** Revision 8: «если ведущий не добавит задач» — the lead's last stretch with an open session. */
    conditional?: true;
    /** Revision 8: no outline and every work is infrastructure — its estimated share of the release. */
    infraShare?: { share: number; line: string };
    /** Open reworks after acceptance (harness alpha.66). Absent = none. */
    rework?: number;
    /**
     * Revision 6: planned (not yet approved) tasks, weight 0; `line` —
     * «по утверждённому плану ~X %; с планируемыми (N задач, не утверждены: …) ~Y %».
     */
    planned?: { count: number; keys: string[]; line: string };
    /** Revision 6: the approved plan only (comes with `planned`). */
    approved?: {
      percent: number;
      total: number;
      done: number;
      left: number;
      loMs?: number;
      hiMs?: number;
    };
    /** Revision 6: the lead's steps, 10 % of the release in equal parts (`weight` — share of the release). */
    lead?: {
      steps: {
        step: 'plan' | 'questions' | 'delivery' | 'report';
        weight: number;
        done: boolean;
      }[];
      weighted: number;
      total: number;
    };
    /**
     * Revision 6: the release state — `in-work`, `code-accepted` (the code is
     * accepted, the lead's final report is not written), `done`
     * (`harness release done`). Only `done` is 100 %.
     */
    release?: {
      state: 'in-work' | 'code-accepted' | 'done';
      doneAt?: string;
      /** The lead's final report, at most 2000. */
      summary?: string;
      line: string;
      /** Revision 9: the release acceptance review; absent = an older harness. */
      review?: ReleaseReviewView;
      /** Revision 10: the docs step of the release; absent = off or an older harness. */
      docs?: ReleaseDocsView;
    };
  };
  time: {
    /** Start of the release (revision 5: the first scope snapshot or the first attempt). */
    startedAt?: string;
    /** The release is finished (revision 5): the end of the last attempt; `elapsedMs` stops there. */
    finishedAt?: string;
    /** From the start of the first attempt of the scope; absent = not started. */
    elapsedMs?: number;
    /** Absent below the sample minimum: unknown, never zero. */
    remaining?: { loMs: number; hiMs: number; samples: number; attemptsPerTask: number };
    /** Revision 5: a rough range from 1–4 finished attempts of the release. */
    rough?: { loMs: number; hiMs: number; samples: number; attemptsPerTask: number };
    /** Revision 5: what «осталось» is based on. Absent = an older harness. */
    estimate?: 'precise' | 'rough' | 'unknown' | 'nothing';
    /** Revision 6: the dependency chain of unfinished works (task shares): the lower end is not shorter. */
    chain?: number;
    /** Revision 6: the lead's own work, a separate share, by the project history. */
    lead?: { ms: number; samples: number; line: string };
    /** Works waiting for a person or the lead now, and the longest wait; not in the forecast. */
    humanWait: { works: number; ms: number; since?: string };
    /** Revision 8: the unregistered parts of the release outline, estimated by size. */
    outline?: {
      units: number;
      ownerUnits?: number;
      loMs?: number;
      hiMs?: number;
      basis: 'attempts' | 'default';
      line: string;
    };
    /** Revision 8: the code is accepted and the lead finishes — start, duration, estimate exceeded. */
    finishing?: { since?: string; elapsedMs?: number; exceeded?: true };
    line: string;
  };
  /** Revision 8: the lead's release outline, or the hint that there is none. */
  outline?: ForecastOutlineView;
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
  /** Harness alpha.67: `harness cleanup` reconciled a smoke environment record (neutral). */
  | 'environment.reconciled'
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
  /**
   * Accepted works left in the task source for a person to check (revision
   * 5); each task is also an escalation `SOURCE_REVIEW` (actor operator).
   */
  sourceReviews?: SourceReview[];
  /** Project stage (revision 5): `setup` while there are no works yet. */
  stage?: { name: 'setup' | 'work'; lines: string[]; progress?: SetupProgressView };
  /** Release forecast (revision 4). Absent = an older harness or an empty scope. */
  forecast?: ForecastView;
  /** Updates (revision 4). Absent = no updates config and no check. */
  updates?: UpdatesView;
  /** Revision 6: planned tasks without a harness work — «ещё не утверждена» cards, at most 200. */
  planned?: PlannedTaskView[];
  /** Revision 6: the lead's session and journal. Absent = an older harness or dropped for size. */
  lead?: LeadView;
  /** Revision 6: what is used — models, isolation, tools, services, checks. */
  resources?: ResourcesView;
  /** Harness alpha.66: running previews of the result, at least 1 and at most 20. Absent = none runs. */
  previews?: PreviewView[];
  /** Revision 10: spend by work and attempt, role and model. Absent = an older harness. */
  costs?: CostsView;
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
      | 'whatsNew'
      // Revision 5.
      | 'sourceReviews'
      | 'forecastWorks'
      // Revision 6.
      | 'planned'
      | 'leadNotes'
      | 'resources'
      | 'previews'
      // Revision 8.
      | 'attemptReviews',
      number
    >
  >;
}

/**
 * A planned task without a harness work (revision 6): an «ещё не утверждена»
 * card, no attempts and no actions. `from`: `validated` — in the checked but
 * not approved snapshot of the task source; `read` — only in its last read.
 */
export interface PlannedTaskView {
  id: string;
  connector: string;
  taskId: string;
  key?: string;
  title?: string;
  status: 'planned';
  from: 'validated' | 'read';
  graphId?: string;
  dependsOn?: string[];
  line: string;
}

/**
 * The lead (revision 6): the `harness lead begin|end` session (a lease until
 * `until`), the last note and the journal newest first — notes, the lead's
 * harness commands, the release summary.
 */
export interface LeadView {
  active: boolean;
  since?: string;
  until?: string;
  endedAt?: string;
  lastNote?: { at: string; plain: string };
  /** At most 20; more in `truncated.leadNotes`. */
  notes: { at: string; kind: string; action: string; workId?: string; plain: string }[];
  line: string;
}

/**
 * Why a gate is held (`resources.gates.held[].cause`, revision 9): a check
 * sandbox refusal, or `gate-definition` — the gate failed without naming a
 * cause (harness 0.1.0-alpha.69).
 */
export type HeldGateCause =
  'sandbox-process-list' | 'sandbox-signal' | 'sandbox-browser' | 'gate-definition';

/** Network of a role or of the checks in plain words. */
export type ResourcesNetwork = 'closed' | 'loopback' | 'domains' | 'open' | 'mixed';

/** «Что задействовано» (revision 6): every line is the harness's, in plain words. */
export interface ResourcesView {
  roles: {
    role: string;
    kind: 'writer' | 'reviewer' | 'lead';
    review?: 'plan' | 'contract' | 'code';
    alternate?: true;
    runtime: string;
    /** For a person: OpenAI, Anthropic, fixture. */
    vendor: string;
    model?: string;
    effort?: string;
    repositoryId?: string;
    network?: ResourcesNetwork;
    line: string;
  }[];
  isolation: {
    sandbox: 'os' | 'none';
    writers: ResourcesNetwork;
    gates: ResourcesNetwork;
    domains: number;
    line: string;
  };
  toolchain: { tools: { name: string; version: string; repositoryId?: string }[]; line: string };
  dependencyStore: {
    state: 'on' | 'off' | 'partial';
    repositories: { repositoryId: string; manager: string; seeds?: number }[];
    line: string;
  };
  services: {
    /** `@workspace` — the joint check. */
    repositoryId: string;
    name: string;
    engine?: 'docker';
    scope: 'attempt' | 'workspace';
    running: number;
    stopped: number;
    leftover: number;
    since?: string;
    leftoverRuns?: string[];
    line: string;
  }[];
  gates: {
    total: number;
    workspace: number;
    repositories: { repositoryId: string; count: number }[];
    line: string;
    /**
     * Gates held by a refusal without a retry (`ENVIRONMENT_GATE_HELD`,
     * harness alpha.66): works that need them are not issued; `workId` is
     * the work whose attempt failed. At most 10.
     */
    held?: { repositoryId: string; gate: string; workId: string; cause?: HeldGateCause }[];
    /** The same in plain words; also the first of `lines`. */
    heldLine?: string;
  };
  /** Short lines for the home screen, at most 8. */
  lines: string[];
  truncated?: { roles?: number; tools?: number; services?: number; receipts?: number };
}

/**
 * A running preview of the result (harness alpha.66, `harness
 * preview-start`): a loopback address the harness proxies, what it shows and
 * when it stops by itself.
 */
export interface PreviewView {
  id: string;
  repositoryId: string;
  title?: string;
  /** Always `http://127.0.0.1:<port>/`. */
  url: string;
  ref: string;
  sha: string;
  workId?: string;
  startedAt: string;
  expiresAt: string;
  state: 'running';
}

/** The writer session of a thin mode attempt (revision 11). */
export type WriterSession = 'fresh' | 'resumed' | 'fallback';

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
   * Revision 11 (harness 0.1.0-alpha.73, thin mode): the writer session of
   * the attempt — `fresh` a new one, `resumed` the work's session continued,
   * `fallback` a new one in place of a lost or overflowed session.
   */
  writerSession?: WriterSession;
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
      | 'dependsOn'
      // Revision 8.
      | 'attemptReviews',
      number
    >
  >;
}

/** A sum of call costs (revision 10). `lower`: some calls have no price, the sum is a lower bound. */
export interface CostAmountView {
  usd: number;
  bound: 'exact' | 'lower';
  calls: number;
  /** Calls without a price; above zero with `bound: lower`. */
  unpricedCalls: number;
}

export type CostRole = 'writer' | 'reviewer' | 'planner' | 'lead' | 'other';

/**
 * `costs` (revision 10, harness 0.1.0-alpha.70): the whole install
 * (`total`), the current release (`release`, calls after the last `release
 * done`; `since` — that moment, absent = all calls), by role, by model with
 * its vendor and by work with its attempts. Sorted by spend by the harness.
 */
export interface CostsView {
  total: CostAmountView;
  /** `sinceRelease: false` — no release done yet: all calls (no `since`). */
  release: CostAmountView & { since?: string; sinceRelease: boolean };
  byRole: ({ role: CostRole } & CostAmountView)[];
  byModel: ({ runtime: string; vendor: string; model: string } & CostAmountView)[];
  /** Models over the limit of `byModel`. */
  byModelTruncated: number;
  byWork: ({
    workId: string;
    /** The latest attempts (at most 20); earlier ones in `attemptsTruncated`. */
    attempts: AttemptCostView[];
    attemptsTruncated: number;
  } & CostAmountView)[];
  /** Works over the limit of `byWork` (a work's whole spend: `works[].cost`). */
  byWorkTruncated: number;
}
