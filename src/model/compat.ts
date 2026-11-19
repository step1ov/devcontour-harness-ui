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

import { VIEW_VERSION, type OperatorView, type WorkDetailView } from './view.ts';

export type ViewCheck =
  | { ok: true; view: OperatorView; newerRevision: boolean }
  | {
      ok: false;
      code: 'NOT_A_VIEW' | 'VIEW_VERSION_UNSUPPORTED' | 'VIEW_UNAVAILABLE';
      message: string;
    };

/** Highest `viewRevision` this build knows how to render in full. */
export const KNOWN_VIEW_REVISION = 1;

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

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

// A small declarative shape checker: each check pushes the path of every
// field that does not have the type the harness schema gives it. Unknown
// fields are ignored; enumerations are read as strings (unknown values get
// the conservative reading at render time).
type Check = (v: unknown, path: string, out: string[]) => void;
const leaf =
  (ok: (v: unknown) => boolean): Check =>
  (v, path, out) => {
    if (!ok(v)) out.push(path);
  };
const S = leaf((v) => typeof v === 'string');
const N = leaf((v) => typeof v === 'number' && Number.isFinite(v));
const C = leaf((v) => Number.isSafeInteger(v) && (v as number) >= 0);
const B = leaf((v) => typeof v === 'boolean');
const I = leaf(isInstant);
const opt =
  (c: Check): Check =>
  (v, path, out) => {
    if (v !== undefined) c(v, path, out);
  };
const nul =
  (c: Check): Check =>
  (v, path, out) => {
    if (v !== null) c(v, path, out);
  };
/** An array of at most `max` entries (the harness schema limits, design §3.10). */
const arr =
  (c: Check, max: number): Check =>
  (v, path, out) => {
    if (!Array.isArray(v) || v.length > max) return void out.push(path);
    v.forEach((x, i) => c(x, `${path}[${i}]`, out));
  };
const rec =
  (c: Check): Check =>
  (v, path, out) => {
    if (!isObject(v)) return void out.push(path);
    for (const [k, x] of Object.entries(v)) c(x, `${path}.${k}`, out);
  };
const obj =
  (shape: Record<string, Check>): Check =>
  (v, path, out) => {
    if (!isObject(v)) return void out.push(path);
    for (const [k, c] of Object.entries(shape))
      c(Object.hasOwn(v, k) ? v[k] : undefined, path ? `${path}.${k}` : k, out);
  };
const bounded = obj({ value: N, bound: S });

const binding = obj({ runtime: S, model: opt(S), effort: opt(S) });
const source = obj({ producer: S, producerVersion: S, stateVersion: N, token: S });
const settings = obj({
  policyDigest: S,
  approvalMode: S,
  mode: S,
  concurrency: C,
  roles: arr(obj({ role: S, writer: binding, repositoryId: opt(S) }), 100),
  reviews: arr(
    obj({
      kind: S,
      scope: S,
      repositoryId: opt(S),
      role: opt(S),
      reviewer: binding,
      alternates: arr(binding, 10),
      vendor: S,
    }),
    100,
  ),
  thresholds: obj({
    inputSeverity: N,
    leadAnswersMaxSeverity: opt(N),
    leadAnswersTechnical: opt(B),
    criticalPaths: N,
    maxAttempts: N,
    repairBudget: N,
    maxNeutralFailures: N,
    reviewRoundCap: N,
    reviewEscalationRounds: N,
  }),
  budgets: arr(obj({ scope: S, usd: opt(N), timeMs: opt(N) }), 3),
  budgetOnUnknown: opt(S),
  timeouts: obj({
    runTimeoutMs: N,
    leaseMs: N,
    gateTimeoutFloorMs: opt(N),
    stall: obj({ intervalMs: N, quietMs: N, stalledMs: N, action: S }),
  }),
  lean: obj({ state: S }),
  defaulted: arr(S, 50),
});
const work = obj({
  id: S,
  graphId: S,
  title: opt(S),
  status: S,
  stage: obj({
    name: S,
    step: opt(S),
    since: opt(I),
    next: arr(S, 10),
    needs: opt(obj({ actor: nul(S), action: S })),
    typical: opt(obj({ p50Ms: N, p90Ms: N, samples: N })),
  }),
  attempts: obj({
    used: C,
    max: C,
    left: C,
    failed: C,
    interrupted: C,
    rechecks: C,
    neutral: obj({ used: C, max: C }),
    line: opt(S),
    lastFailure: opt(obj({ attempt: C, bucket: S, plain: S, at: opt(I) })),
  }),
  liveness: opt(S),
  runtime: opt(S),
  model: opt(S),
  blockers: arr(obj({ code: S, plain: opt(S), actor: nul(S) }), 10),
  dependsOn: opt(arr(S, 50)),
  target: opt(
    obj({
      repositoryId: S,
      ref: S,
      acceptedSha: opt(S),
      remote: obj({ state: S, trackingRef: opt(S), reason: opt(S) }),
    }),
  ),
  question: opt(obj({ requestId: S, state: S, severity: N })),
  spend: obj({ calls: N, usd: bounded, durationMs: N }),
  resultSha: opt(S),
});
const review = obj({
  kind: S,
  subject: S,
  workId: opt(S),
  approved: B,
  rounds: obj({ used: N, max: nul(N) }),
  open: obj({ blocking: N, notes: N }),
  accepted: N,
  reviewer: opt(binding),
  sameVendor: opt(B),
  spend: obj({ calls: N, usd: bounded }),
  findings: arr(
    obj({
      id: S,
      severity: S,
      status: S,
      rounds: opt(N),
      disposition: opt(obj({ decision: S, by: S, round: N })),
      title: opt(S),
    }),
    50,
  ),
  escalation: opt(obj({ requestId: S, findings: arr(S, 50), answered: B })),
  line: opt(S),
});
const question: Check = (v, path, out) => {
  obj({
    state: S,
    answerableBy: S,
    impact: opt(S),
    plain: opt(S),
    answeredBy: opt(S),
    answerBasis: opt(obj({ by: S, rule: opt(S), reason: opt(S), impact: S, at: I, line: S })),
    title: opt(S),
    createdAt: I,
  })(v, path, out);
  if (!isObject(v)) return;
  // Paths kept from the first gate: ids and counts are reported together.
  if (typeof v.requestId !== 'string' || typeof v.workId !== 'string')
    out.push(`${path}.requestId`);
  if (!Number.isSafeInteger(v.severity) || !Number.isSafeInteger(v.version))
    out.push(`${path}.severity`);
  else if ((v.severity as number) < 0 || (v.version as number) < 0) out.push(`${path}.severity`);
};
const drift = obj({
  workId: S,
  repositoryId: S,
  ref: S,
  acceptedSha: S,
  head: opt(S),
  commitsSinceAccepted: opt(N),
  filesSinceAccepted: opt(N),
  diverged: opt(B),
  unavailable: opt(S),
});
const overview = obj({
  viewRevision: C,
  generatedAt: I,
  source,
  settings,
  works: arr(work, 500),
  reviews: arr(review, 50),
  questions: arr(question, 50),
  escalations: arr(
    obj({ workId: opt(S), subject: opt(S), code: S, actor: S, action: S, since: I }),
    50,
  ),
  drift: arr(drift, 50),
  progress: obj({
    total: C,
    byStage: rec(C),
    running: C,
    done: C,
    waitingOperator: C,
    queue: obj({ paused: B, reason: opt(S), detail: opt(S), actor: opt(S), action: opt(S) }),
  }),
  history: obj({
    from: I,
    to: I,
    bucketMs: N,
    load: arr(N, 500),
    attemptsStarted: arr(N, 500),
    attemptsFailed: arr(N, 500),
    gatesPassed: arr(N, 500),
    gatesFailed: arr(N, 500),
    gatesReused: arr(N, 500),
    spendUsd: arr(N, 500),
    spendBound: S,
    spendOpeningUsd: bounded,
    budgetUsd: opt(N),
    totals: opt(
      obj({
        attemptsStarted: C,
        attemptsFailed: C,
        failuresByBucket: rec(C),
        gatesPassed: C,
        gatesFailed: C,
        gatesReused: C,
        reviewRounds: obj({ plan: C, contract: C, code: C, attempt: C }),
        spendUsd: bounded,
        wallMs: C,
        attemptMs: C,
        loadPeak: C,
      }),
    ),
  }),
  health: obj({
    controller: obj({ present: B, leaseUntil: opt(I) }),
    stalledAttempts: C,
    quietAttempts: C,
    environmentFailures: C,
    budgeting: S,
    budgets: arr(
      obj({
        scope: S,
        id: opt(S),
        state: S,
        spentUsd: bounded,
        limitUsd: opt(N),
        spentMs: opt(N),
        limitMs: opt(N),
      }),
      50,
    ),
    spentTotalUsd: bounded,
    drift: obj({ checked: C, drifted: C, unavailable: C }),
    warnings: arr(obj({ code: S, message: S }), 20),
  }),
  activity: opt(
    arr(obj({ at: I, actor: S, action: S, workId: opt(S), subject: opt(S), plain: S }), 50),
  ),
  decisions: opt(
    arr(
      obj({
        id: S,
        kind: S,
        by: S,
        at: I,
        workId: opt(S),
        subject: opt(S),
        findingId: opt(S),
        requestId: opt(S),
        temporary: B,
        revisit: opt(S),
        title: opt(S),
        reason: opt(S),
      }),
      50,
    ),
  ),
  truncated: opt(rec(C)),
});
const detail = obj({
  viewRevision: C,
  generatedAt: I,
  source,
  work,
  attempts: arr(
    obj({
      attempt: C,
      status: S,
      failureBucket: opt(S),
      interrupted: opt(B),
      runtime: S,
      model: opt(S),
      startedAt: I,
      finishedAt: opt(I),
      stages: arr(obj({ stage: S, durationMs: opt(N), outcome: opt(S) }), 50),
    }),
    20,
  ),
  verification: opt(
    arr(
      obj({
        gate: S,
        kind: S,
        phase: opt(S),
        result: S,
        how: S,
        by: opt(S),
        attempt: opt(N),
        at: opt(I),
      }),
      50,
    ),
  ),
  reviews: arr(review, 50),
  questions: arr(question, 50),
  drift: opt(drift),
  truncated: opt(rec(C)),
});

function versionRefusal(value: unknown): Extract<ViewCheck, { ok: false }> | undefined {
  if (!isObject(value) || typeof value.viewVersion !== 'number')
    return { ok: false, code: 'NOT_A_VIEW', message: 'The document has no numeric viewVersion.' };
  if (value.viewVersion !== VIEW_VERSION)
    return {
      ok: false,
      code: 'VIEW_VERSION_UNSUPPORTED',
      message:
        `View version ${value.viewVersion} is not supported by this panel ` +
        `(expects ${VIEW_VERSION}). Install a matching devcontour-harness-ui.`,
    };
  return undefined;
}

function shapeRefusal(
  shape: Check,
  value: unknown,
  what: string,
): Extract<ViewCheck, { ok: false }> | undefined {
  const bad: string[] = [];
  shape(value, '', bad);
  if (!bad.length) return undefined;
  return {
    ok: false,
    code: 'NOT_A_VIEW',
    message: `The ${what} is malformed: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ', …' : ''}.`,
  };
}

export type WorkDetailCheck =
  { ok: true; detail: WorkDetailView; newerRevision: boolean } | Extract<ViewCheck, { ok: false }>;

/** The same gate for the work detail document (`harness view --work <id>`). */
export function checkWorkDetail(value: unknown): WorkDetailCheck {
  const refused = versionRefusal(value) ?? shapeRefusal(detail, value, 'work detail');
  if (refused) return refused;
  return {
    ok: true,
    detail: value as unknown as WorkDetailView,
    newerRevision: ((value as Obj).viewRevision as number) > KNOWN_VIEW_REVISION,
  };
}

export function checkView(value: unknown): ViewCheck {
  const refused = versionRefusal(value) ?? shapeRefusal(overview, value, 'view');
  if (refused) return refused;
  return {
    ok: true,
    view: value as unknown as OperatorView,
    newerRevision: ((value as Obj).viewRevision as number) > KNOWN_VIEW_REVISION,
  };
}
