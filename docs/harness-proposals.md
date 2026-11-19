# Proposed additions to devcontour-harness

These are proposals for the harness repository; none of it is implemented
here. They give the operator panel ([design.md](design.md)) one versioned,
read-only data source. They build on alpha.54 work: work stage in `status`,
review-loop summaries, `review-code` records and accepted-target drift. They
follow existing patterns: a pure projection plus a node loader, as `valueReport`
and `collectReportInput` already do. One JSON envelope on stdout, with the
same exit codes.

Sizes count production lines without generated schemas: S is under 200, M is
200–600, L is over 600.

## P1. `operatorView` projection and contract (M–L)

**Contract.** Add `src/contracts/operator-view.ts`:

- a Zod `operatorViewSchema`;
- `OPERATOR_VIEW_VERSION = 1`, `OPERATOR_VIEW_REVISION = 0`;
- `OPERATOR_VIEW_LIMITS = { works: 500, reviews: 50, findingsPerSubject: 50,
questions: 50, drift: 50, buckets: 500, windowMs: 7 days, bytes: 262144 }`.

The JSON Schema is generated as `schemas/operator-view.schema.json` by
`npm run schemas`. The field set is design.md §3. The TypeScript in this
repository (`src/model/view.ts`) is the draft.

**Projection.** Add `src/projections/operator-view.ts`, exported from
`devcontour-harness/projections` and the package root. It has no `node:*` and
no zod at runtime: the projections module stays browser-safe.

```ts
export interface OperatorViewInput {
  now: number; // injected clock
  harnessVersion: string;
  stateVersion: number;
  token: string; // dataVersion() or caller hash
  policy: ExecutionPolicyLike; // fields of design §3.1 only
  manifestLayers?: readonly string[]; // project manifest profile.layers
  works: readonly OperatorWorkInput[]; // status works + stage + attemptSummary
  reviews: readonly ReviewSubjectSummary[]; // alpha.54 h14 + code reviews
  requests: readonly RequestLike[]; // input requests (open only)
  stops: readonly { workId: string; actor: string; action: string; code: string; since: string }[];
  targets: readonly AcceptedTarget[]; // alpha.54 h10, computed by the loader
  attempts: readonly AttemptHistoryInput[]; // startedAt, finishedAt, status, failure bucket
  gateEvents: readonly { at: string; passed: boolean }[];
  calls: readonly { finishedAt?: string; costUsd: number | null }[];
  controller?: { leaseUntil: number };
  budget: BudgetOverview | undefined;
  queue: QueueStopView & Partial<QueuePause>;
}
export interface OperatorViewOptions {
  titles?: boolean; // default true; false = --no-titles
  windowMs?: number; // default 24 h
  bucketMs?: number; // default 15 min
}
export function operatorView(input: OperatorViewInput, options?: OperatorViewOptions): OperatorView;
export function maskText(text: string, max: number): string; // clipText + secret masking
```

The projection reuses existing code rather than re-deriving anything:

- `attemptSummaryOf` and `attemptSummaryLine` (report);
- `workStageOf` (alpha.54 `src/control/stage.ts`), whose pure part moves into
  projections;
- `queueStop`, `queuePause`, `workInputOf` and `leadMayAnswer` (alpha.54);
- the review subject summaries (alpha.54 `src/control/review-summary.ts`);
- the report failure buckets (`failureBucketOf`) and the shutdown rule
  (`interruptedByShutdown`).

**Loader.** Add `collectOperatorViewInput(source, options)` in
`src/control/operator-view.ts` (node). It does one `engine.read` for
everything from the store, and so takes the same snapshot as `statusOf`:

- works, attempts and requests;
- call records via `callRecords`;
- gate events from the event log, filtered to the window;
- local review records.

After the read it runs git for `acceptedTargets`, then reads the project
manifest if one is found next to the policy.

**Tests** (about 400 lines):

- `tests/operator-view.test.ts`:
  - Fixture states: empty, busy, paused, budget exceeded, escalated, drift,
    truncated.
  - Byte determinism under a fixed clock.
  - Numbers equal to `status.works[].attemptSummary`, `stage` and report
    totals on the same state.
- `tests/operator-view-secrets.test.ts`: plants a provider key, `Bearer …`,
  `user:pass@` and the home path into a work title, a question and a finding.
  None of them may appear in `JSON.stringify(view)`.
- `tests/operator-view-limits.test.ts`: the 256 KB cap, the `truncated`
  counts, and `VIEW_TRUNCATED` in warnings.
- A schema test that checks the output against
  `schemas/operator-view.schema.json`.

## P2. `harness view` (S)

```
harness view --state D [--policy F] [--no-titles] [--window 24h|7d] [--bucket 15m|1h]
             [--view-version N]
```

- **Read-only.** It never writes to the state directory, and it is listed in
  `capabilities` with `readOnly: true` and its input and response schema.
- **stdout.** The envelope `{ ok: true, data: OperatorView }`. There is no
  `--human`: the text views stay `status --human` and `explain --human`.
- **Policy.** Defaults to the binding (`binding.json`). If `--policy`
  differs, the view carries a `POLICY_DIGEST_MISMATCH` warning instead of
  failing.
- **Errors.**
  - 2: invalid input or an unknown `--view-version`.
  - 3: `STATE_NEWER_THAN_HARNESS` (the same rule as `doctor`).
  - 4: infrastructure.
  - A missing state directory is a valid empty view, not an error, so that a
    panel opened before the first run shows "no state yet".
- **Changes.** Command `view` goes into `src/cli.ts`, `allowed`/`flags` gain
  their entries, and `docs/contracts.md` gets an "OperatorView" section.
  README gets a command table row. Skill `harness` gets one line: "the
  operator panel reads `harness view`".
- **Tests.** CLI tests on the `single-task` example with the fixture
  runtime:
  - The view after `run` has one `done` work with `resultSha` equal to
    `harness result`.
  - `--no-titles` leaves no titles.
  - A missing state directory gives an empty view.

## P3. `harness serve-view` (M)

```
harness serve-view --state D [--policy F] [--port N] [--host 127.0.0.1] [--no-titles]
                   [--static DIR]
```

- **No UI dependencies.** It uses `node:http` only. `--static DIR`
  optionally serves a directory of prebuilt files, for example the UI
  bundle path given by `devcontour-harness-ui`. The harness ships no UI.
- **Endpoints.** All are GET or HEAD; everything else gets 405.
  - `/view`: the operator view, with `ETag` = `source.token` and
    `cache-control: no-store`.
  - `/events`: a Server-Sent Events stream. Each change sends
    `event: view` with data `{ token }`, and a comment heartbeat goes out
    every 15 s.
  - `/health`: `{ ok, harnessVersion, viewVersion }`.
- **Change detection.**
  - The server polls `ExecutionView.dataVersion()` every 1 s.
  - On a store without it, it hashes `status` output instead, every 2 s.
  - The view is recomputed only when the token changes or after 30 s at most,
    which keeps liveness and elapsed times fresh.
  - Drift (git) is recomputed at most every 30 s, keyed by target head.
- **Network.** It binds to loopback only, with the same rules as the UI CLI:
  - Allowed hosts are `127.0.0.1`, `::1` and `localhost`.
  - Any other host fails with `HOST_NOT_LOOPBACK`.
  - A request whose `Host` header names something else gets 421.
  - It sends the same CSP and nosniff headers.
- **Port.** With no `--port`, it probes from 4791. A busy explicit port is
  `PORT_BUSY`, exit 4.
- **stdout.** One JSON line once listening: `{ ok, url, port, readOnly: true }`.
  SIGINT and SIGTERM close it cleanly.
- **Controller.** It holds no controller lease and never claims work. It
  reads like `status`, so it can run beside `harness run`.
- **Tests.**
  - The server on the fixture state: `/view` equals `harness view` output.
  - An SSE event arrives after a `pause`.
  - The loopback and Host refusals.
  - 405 on POST.
  - It runs concurrently with `run` without a lease conflict.

## P4. Operator answers through `serve-view` (S–M, after S2)

```
harness serve-view ... --allow-answers
POST /answers  { requestId, requestVersion, answer: { option?, text? } }
```

- **Off by default.** Answers are accepted only with `--allow-answers`. At
  start the server generates a random 32-byte token and prints it in the URL
  fragment (`…/#token=…`).
- **Checks.** A write is accepted only if all of these hold:
  - an `Authorization: Bearer <token>` header;
  - an `Origin` that equals the panel origin;
  - `content-type: application/json`;
  - a body of at most 16 KB.
- **Recording.** The handler calls the same code as `harness input-answer
--actor operator --request-version V`. The rules are those of
  `input-answer`:
  - `answerableBy`;
  - stale versions are refused;
  - `OPERATOR_ANSWER_REQUIRED` keeps its meaning.
  - `--actor lead` is never accepted on this path.
- **Tests.**
  - Each refusal: no token, wrong token, wrong `Origin`, a non-JSON body, a
    stale version, an already-applied request.
  - A successful answer records `answeredBy: operator`.

## P5. Docs and catalog (S)

- `docs/contracts.md`, a new section "OperatorView": versioning rules from
  design.md §4, the limits, and the masking rules.
- `capabilities`: entries for `view` and `serve-view`.
- `ROADMAP.md`: one entry "Operator view" with the criteria above. It should
  have no reference to this package's internals beyond its name.

## Order and dependencies

1. Merge alpha.54 (h12 stage, h14 review loop, h10 review-code and drift).
   All three touch `statusDataSchema` and `statusText`, so merge them in
   sequence.
2. P1 together with P2, in one release.
3. P3 in the next release.
4. P5 alongside P1 to P3.
5. P4 only after the UI has its read-only screens and the owner approves the
   first write path.
