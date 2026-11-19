// Operator view: the read-only document the panel renders. It is produced by
// the harness core (proposed `operatorView` projection, `harness view --json`)
// or by a host adapter from its own store. This file mirrors view version 1
// described in docs/design.md, "Operator view schema"; field names follow the
// harness contracts they are projected from. Pure types: no node:*, no React.

/** Major version of the view document. Bumped only on a breaking change. */
export const VIEW_VERSION = 1 as const;

/** A sum with an honest bound: `unknown` is never shown as zero. */
export interface Bounded {
  value: number;
  bound: 'exact' | 'lower' | 'unknown';
}

export type Runtime = 'claude' | 'codex' | (string & {});
export type Effort = 'low' | 'medium' | 'high' | 'xhigh';
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
  state: 'awaiting-answer' | 'answered-not-applied' | 'carry-stale' | (string & {});
  version: number;
  severity: number;
  /** Who may answer under the policy: severity above `leadAnswersMaxSeverity` is operator-only. */
  answerableBy: 'operator' | 'operator-or-lead';
  answeredBy?: 'operator' | 'lead' | 'host';
  /** Clipped and masked by the projection. */
  title?: string;
  createdAt: string;
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
  };
  attempts: {
    used: number;
    max: number;
    left: number;
    failed: number;
    /** Gate rechecks and uncounted environment failures. */
    rechecks: number;
    interrupted: number;
    /** One-line summary computed by the harness; never re-derived here. */
    line?: string;
  };
  liveness?: 'active' | 'quiet' | 'stalled';
  runtime?: Runtime;
  model?: string;
  blockers: string[];
  question?: Pick<OperatorQuestion, 'requestId' | 'state' | 'severity'>;
  spend: { calls: number; usd: Bounded; durationMs: number };
  resultSha?: string;
}

export interface ViewProgress {
  total: number;
  byStage: Record<string, number>;
  done: number;
  waitingOperator: number;
  queue: {
    paused: boolean;
    reason?: string;
    detail?: string;
    actor?: Actor;
    action?: string;
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
  gatesPassed: number[];
  gatesFailed: number[];
  /** Known spend per bucket; `spendBound` says whether unknown prices exist. */
  spendUsd: number[];
  spendBound: Bounded['bound'];
  budgetUsd?: number;
}

export interface ViewHealth {
  controller: { present: boolean; leaseUntil?: string };
  stalledAttempts: number;
  quietAttempts: number;
  environmentFailures: number;
  budget: { state: 'within' | 'exceeded' | 'undetermined'; scope?: string; spentUsd: Bounded };
  warnings: { code: string; message: string }[];
}

export interface OperatorView {
  viewVersion: typeof VIEW_VERSION;
  /** Additive revision inside a major version; the UI ignores unknown fields. */
  viewRevision: number;
  generatedAt: string;
  source: {
    producer: string;
    producerVersion: string;
    stateVersion: number;
    /** Opaque change token (store data version); equal token = same view. */
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
  /** Counts cut by the projection's size limits. */
  truncated?: Partial<Record<'works' | 'reviews' | 'questions' | 'findings', number>>;
}
