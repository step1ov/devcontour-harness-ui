# Proposed additions to devcontour-harness

These are proposals for the harness repository; none of it is implemented
here. Together they give the operator panel ([design.md](design.md)) one
read-only, versioned data source.

They build on alpha.54 work:

- the work stage in `status`;
- review-loop summaries;
- `review-code` records;
- drift of accepted targets.

They also follow existing harness patterns:

- a pure projection plus a node loader, as with `valueReport` and
  `collectReportInput`;
- one JSON envelope on stdout;
- the same exit codes.

Sizes count production lines, without generated schemas: S is under 200, M
is 200–600, L is over 600.

## P1. `operatorView` projection and contract (M–L)

### Contract

`src/contracts/operator-view.ts` holds:

- a Zod `operatorViewSchema` and a `workDetailViewSchema`;
- the constants `OPERATOR_VIEW_VERSION = 1` and `OPERATOR_VIEW_REVISION = 0`;
- the limits:
  ```ts
  OPERATOR_VIEW_LIMITS = {
    works: 500, reviews: 50, findingsPerSubject: 50, questions: 50,
    escalations: 50, drift: 50, roles: 100, reviewRules: 100, warnings: 20,
    detailAttempts: 20, buckets: 500, windowMs: 7 days, bytes: 262144,
  };
  ```

`npm run schemas` generates the JSON Schema
`schemas/operator-view.schema.json`. The field set is in design.md §3. The
TypeScript in this repository, `src/model/view.ts`, is the draft.

### Projection

`src/projections/operator-view.ts` is exported from
`devcontour-harness/projections` and from the package root. It uses no
`node:*` and no zod at runtime, so the projections module stays
browser-safe.

```ts
export interface OperatorQuestionInput {
  // built by the loader, already sanitized
  id: string;
  workId: string;
  kind: 'question';
  state: InputState;
  version: number;
  effectiveSeverity: number;
  createdAt: string;
  text?: string; // raw; the projection masks, then clips
  answeredBy?: 'operator' | 'lead' | 'host';
}
export interface OperatorViewInput {
  now: number; // injected clock
  harnessVersion: string;
  stateVersion: number;
  policy: ExecutionPolicyLike; // fields of design §3.1
  policyDefaults: readonly string[]; // paths filled from defaults
  manifestLayers?: readonly string[]; // project manifest profile.layers
  works: readonly OperatorWorkInput[]; // status work + stage + attemptSummaryView
  // + rechecks (evidence with recheck: true)
  counts: { byStage: Record<string, number> }; // over ALL works, before truncation
  reviews: readonly ReviewSubjectSummary[]; // alpha.54 h14 + code review records
  questions: readonly OperatorQuestionInput[];
  stops: readonly {
    workId?: string;
    subject?: string;
    actor: string;
    action: string;
    code: string;
    since: string;
  }[];
  targets: readonly AcceptedTarget[]; // alpha.54 h10, computed by the loader
  attempts: readonly AttemptHistoryInput[]; // startedAt, finishedAt, status,
  // failure bucket, interrupted, callsRecorded
  gateEvents: readonly {
    at: string;
    passed: boolean;
    applicable: boolean;
    recheck?: boolean;
    reused?: boolean;
  }[];
  calls: ValueReportInput['calls']; // the report's call input, unchanged,
  // so cost bounds follow the report rules
  controller?: { leaseUntil: number };
  budgets: BudgetOverview | undefined; // undefined = budgeting off
  queue: QueueStopView & Partial<QueuePause>;
}
export interface OperatorViewOptions {
  titles?: boolean; // default true; false = --no-titles
  windowMs?: number; // default 24 h
  bucketMs?: number; // default 15 min
}
export function operatorView(i: OperatorViewInput, o?: OperatorViewOptions): OperatorView;
export function workDetailView(i: WorkDetailInput, o?: OperatorViewOptions): WorkDetailView;
export function maskText(text: string, max: number): string; // mask first, then clip
export function viewToken(view: OperatorView | WorkDetailView): string; // sha256 of
// canonical bytes without generatedAt/token
```

The projection reuses existing code instead of re-deriving anything:

| Harness code                                                                            | Used for                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `attemptSummaryOf`, `attemptSummaryView`, `attemptSummaryLine`                          | attempt counters and the summary line                |
| `workStageOf` (alpha.54 `src/control/stage.ts`)                                         | the work stage; its pure part moves into projections |
| `queueStop`, `queuePause`, `leadMayAnswer` (alpha.54)                                   | queue state and who may answer                       |
| review subject summaries (alpha.54 `src/control/review-summary.ts`)                     | `reviews[]`                                          |
| `failureBucketOf`, `interruptedByShutdown`, `callCostKnown` and the report spend bounds | failure buckets, interruptions and spend             |

A missing input that the report would count as unknown cost (an abandoned
call, incomplete usage, an attempt without call records) makes the bound
`lower`, never an exact zero.

### Loader

`collectOperatorViewInput(source, options)` in
`src/control/operator-view.ts` runs in node.

Inside one `engine.read`, so it takes the same snapshot as `statusOf`, it
reads:

- works, attempts and input requests (mapped to `OperatorQuestionInput`);
- call records, through the report's collection;
- gate events from the event log, filtered to the window, plus the spend
  before the window;
- local review records.

After the read it:

- runs git for `acceptedTargets`;
- reads the project manifest, if one is found next to the policy;
- computes `policyDefaults` by comparing the policy file with the parsed
  policy that has defaults applied.

### Tests (about 500 lines)

- `tests/operator-view.test.ts`:
  - fixture states: empty, busy, paused, a work budget exceeded while the
    total is within, large spend before the window, escalated, drift
    including drift that could not be checked, every list truncated;
  - byte determinism under a fixed clock;
  - numbers equal to `status.works[].attemptSummary`, `stage` and the
    report totals on the same state;
  - gate series with skipped, reused, failed and rechecked gates;
  - spend with abandoned calls, incomplete usage and attempts without call
    records.
- `tests/operator-view-secrets.test.ts`: plants a provider key, a
  `Bearer …` token, `user:pass@` and the home path into a work title, a
  question, a finding, an attempt error (which reaches `queue.detail`) and a
  git error (which reaches drift). One case places the key across the clip
  boundary. None of them may appear in `JSON.stringify(view)`.
- `tests/operator-view-limits.test.ts`:
  - a worst-case document, with every list full and every string at its
    limit, is at most 256 KB of UTF-8;
  - `truncated` counts every cut list;
  - `VIEW_TOO_LARGE` instead of a partial document.
- `tests/operator-view-token.test.ts`: the token changes when a lease
  expires with no store write, and stays the same for an identical view.
- A schema test that checks the output against
  `schemas/operator-view.schema.json`.

## P2. `harness view` (S)

```
harness view --state D --policy F [--work ID] [--no-titles] [--window 24h|7d]
             [--bucket 15m|1h] [--view-version N]
```

- **Read-only.** It never writes to or creates the state directory. It is
  listed in `capabilities` with `readOnly: true` and its input and response
  schemas.
- **stdout.** The envelope `{ ok: true, data: OperatorView | WorkDetailView }`.
  There is no `--human`; the text views stay `status --human` and
  `explain --human`.
- **Policy.**
  - `--policy` is optional only when the state has a binding.
  - If `--policy` differs from the binding, the view carries a
    `POLICY_DIGEST_MISMATCH` warning and is not refused.
  - A missing state directory with `--policy` gives a valid empty view, with
    settings taken from that policy. This lets a panel opened before the
    first run say "no state yet".
  - A missing state directory without `--policy` is `POLICY_REQUIRED`
    (exit 2), and nothing is created.
- **Errors.**
  - Exit 2: invalid input, an unknown `--view-version`, an unknown `--work`.
  - Exit 3: `STATE_NEWER_THAN_HARNESS`, the same rule as `doctor`.
  - Exit 4: infrastructure, or `VIEW_TOO_LARGE`.
- **Changes in the harness.**
  - `view` in `src/cli.ts`, with its entries in `allowed` and `flags`.
  - A `docs/contracts.md` section "OperatorView".
  - A README row in the command table.
  - One line in the `harness` skill: "the operator panel reads `harness
view`".
- **Tests.** CLI tests on the `single-task` example with the fixture
  runtime:
  - after `run`, the view has one `done` work whose `resultSha` equals the
    one from `harness result`;
  - `--work` returns attempt rows;
  - `--no-titles` leaves no titles;
  - a missing state with and without `--policy` behaves as above, and no
    directory is created.

## P3. `harness serve-view` (M)

```
harness serve-view --state D --policy F [--port N] [--host 127.0.0.1] [--no-titles]
                   [--static DIR] [--allow-answers]
```

- **No UI dependencies.** It uses `node:http` only. `--static DIR`
  optionally serves prebuilt files from a directory that the caller names.
  The harness ships no UI.
- **Routes.** They are the same as the UI CLI's (design.md §6), so that
  `httpViewSource` works against both. All are GET or HEAD; anything else
  gets 405 until P4.
  - `/api/view`: content `ETag` from `viewToken`, `cache-control: no-store`.
  - `/api/view?work=<id>`
  - `/api/events`: SSE, `event: view` with data `{ token }` on every token
    change, and a comment heartbeat every 15 s.
  - `/api/health`: `{ ok, version, viewVersion, readOnly }`.
- **Recomputing.**
  - `ExecutionView.dataVersion()`, polled every 1 s, is only an
    invalidation hint.
  - The view is also recomputed every 5 s while any work is live, so that
    lease expiry and liveness, which change without a store write, are
    picked up.
  - Drift (git) is recomputed at most every 30 s, keyed by target head.
  - An event is sent only when the content token changes.
- **Network.** It binds only to loopback addresses, with the same rules as
  the UI CLI:
  - allowed hosts are `127.0.0.1`, `::1` and `localhost`;
  - any other host is `HOST_NOT_LOOPBACK`;
  - a foreign `Host` header gets 421;
  - a malformed path gets 400;
  - the same CSP and nosniff headers are sent.
- **Port.** Without `--port` it probes from 4791. A busy explicit port is
  `PORT_BUSY`, exit 4.
- **Startup output.** One JSON line on stdout once it is listening:
  `{ ok, url, port, readOnly }`. SIGINT, SIGTERM and stdin EOF close it
  cleanly. Stdin EOF covers the case where the parent UI CLI dies.
- **No lease.** It holds no controller lease and never claims work. It
  reads like `status` does, so it can run next to `harness run`.
- **Tests.**
  - On the fixture state, `/api/view` equals the output of `harness view`.
  - An SSE event arrives after a `pause`.
  - An SSE event arrives after a lease expiry with no store write.
  - The loopback, Host and 400 refusals.
  - 405 on POST without `--allow-answers`.
  - It runs at the same time as `run` without a lease conflict.

## P4. Operator answers through `serve-view` (S–M, after the UI's S2)

Transport (design.md §9):

- The browser talks only to the UI CLI, which proxies to `serve-view`.
- `serve-view --allow-answers` reads a 32-byte shared secret from stdin as
  its first line. The UI CLI generates the secret. It never appears in
  argv, the environment or stdout.
- A write is accepted only with all of these:
  - `Authorization: Bearer <secret>`;
  - `Origin` equal to the origin the UI CLI passes along with the secret;
  - `content-type: application/json`;
  - a body of at most 16 KB.

```
GET  /api/questions/<id>   → { requestId, version, state, severity, answerableBy,
                               text (masked, unclipped up to 8 KB),
                               options[{ id, label, consequence }] }
POST /api/answers          { requestId, requestVersion,
                             kind: 'clarification' | 'requirement-change',
                             optionId?, text }
```

- **Answer handling.** The handler calls the same code as `harness
input-answer --actor operator --request-version V --kind K [--option O]
--text T`:
  - `text` is required.
  - Stale versions are refused.
  - `OPERATOR_ANSWER_REQUIRED` keeps its meaning.
  - `--actor lead` is never accepted on this path.
  - Only `awaiting-answer` requests are answerable.
- **Tests.**
  - Every refusal:
    - no secret, or a wrong one;
    - wrong `Origin`;
    - a non-JSON body;
    - a body over 16 KB;
    - a stale version;
    - a request that is already answered;
    - a lead-only request.
  - A successful answer records `answeredBy: operator` and the `kind`.
  - The secret never appears in logs or responses.

## P5. Docs and catalog (S)

- `docs/contracts.md`: a new section "OperatorView" with the versioning
  rules (design.md §4), the limits and the masking rules.
- `capabilities`: entries for `view` and `serve-view`.
- `ROADMAP.md`: one entry, "Operator view", with the criteria above. It
  names this package and refers to none of its internals.

## Order and dependencies

1. Merge alpha.54: the h12 stage, the h14 review loop, h10 review-code and
   drift. All three touch `statusDataSchema` and `statusText`, so merge
   them one after another.
2. P1 and P2 ship together in one release.
3. P3 ships in the next release.
4. P5 ships alongside P1–P3.
5. P4 comes only after the UI has its read-only screens and the owner has
   approved the first write path.
