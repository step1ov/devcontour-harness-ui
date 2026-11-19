# devcontour-harness-ui: design

Status: draft for `0.1.0-alpha.0`. Applies to view version 1.

## 1. Goals

The harness is headless. Its state is spread across `status`, `explain`,
`report`, `handoff`, review records and the event log. Each of these answers
one question, in JSON or terminal text. An operator watching a run, or a
person the lead agent works for, needs one place that shows:

- what needs their answer now;
- what runs now, at which stage, after how many attempts and rechecks;
- how reviews converge: rounds, open and decided findings, escalations;
- which settings are in force: who writes, who reviews, thresholds,
  budgets, timeouts;
- how the run went over time: load, failures, gates, spend against budget;
- whether the machinery is healthy: controller, stalled attempts,
  environment failures, budget state, drift of accepted results.

Goals:

1. **Data stays in the harness.** The panel renders a document the harness
   computes, the _operator view_. The panel derives no numbers of its own.
   The view is a pure projection over state and policy, with its own
   `viewVersion`.
2. **One component set, two hosts.** The standalone app (`npx
devcontour-harness-ui`) and DevContour render the same React components
   from the same view type. DevContour feeds them from its own store.
3. **Read-only first.** The first release has no write path. The first
   write, later, is the operator's answer to an executor question, recorded
   with `--actor operator`.
4. **Local and quiet.** The panel listens on loopback only. It makes no
   outbound requests and sends no telemetry. Secrets never enter the view.

Non-goals: editing policy or the graph, starting or stopping runs, remote
or multi-user access, product features of DevContour (product memory,
releases, boards), and a hosted service.

## 2. Architecture

```
            harness core (devcontour-harness)                 this package
 ┌──────────────────────────────────────────────┐   ┌──────────────────────────────┐
 │ state dir + policy                           │   │ devcontour-harness-ui        │
 │   │                                          │   │                              │
 │   ▼ collectOperatorViewInput (node, git)     │   │  model/  view types, checkView│
 │   ▼ operatorView(input) ─ pure, browser-safe │──▶│  components/  React, CSS vars │
 │        │                                     │   │  app/  standalone bundle      │
 │        ├─ harness view --json      (stdout)  │   │  cli  loopback static server  │
 │        └─ harness serve-view  GET /view, SSE │   └──────────────┬───────────────┘
 └──────────────────────────────────────────────┘                  │ npm dependency
                                                                   ▼ (build time)
                                           DevContour web panel: same components,
                                           ViewSource adapter over its own store
```

- `operatorView` lives in `devcontour-harness/projections`. That module is
  already browser-safe (no `node:*`) and already holds the shared
  projections (`attemptView`, `queueStop`, `workInputOf`). The node-side
  loader follows the report pattern: `valueReport` is pure,
  `collectReportInput` reads the store. Proposals are in
  [harness-proposals.md](harness-proposals.md).
- The UI package never imports harness internals. It depends on the view
  type only. Until the harness exports that type, the UI keeps a local copy
  (`src/model/view.ts`). A test checks the copy against the harness schema
  once the schema exists (slice S1).
- `devcontour-harness` is an optional peer dependency. The standalone CLI
  needs it only to compute live views. `--view <file>` and `--demo` work
  without it.

## 3. Operator view schema (version 1)

One JSON document. The field names follow the harness contracts they are
projected from. The authoritative TypeScript is `src/model/view.ts`.
Proposal P1 moves it to a Zod contract in the harness, with a generated
JSON Schema `schemas/operator-view.schema.json`.

```
OperatorView {
  viewVersion: 1            // major; breaking change = new number
  viewRevision: int         // additive changes inside the major
  generatedAt: ISO          // projection clock (injected in tests)
  source { producer, producerVersion, stateVersion, token }
  settings, works[], reviews[], questions[], escalations[], drift[],
  progress, history, health, truncated?
}
```

### 3.1 settings

The source is the execution policy bound to the state (`binding.json`), or
the one passed with `--policy`. The view carries `policyDigest`. If the two
policies differ, `health.warnings` gets `POLICY_DIGEST_MISMATCH`.

`settings.defaulted` lists the dotted paths whose value came from a harness
default rather than the policy file. The Settings screen shows "default"
only for those paths.

| View field                                                                    | Harness source                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `approvalMode`                                                                | `approvalMode` (`agent` \| `operator`, default `agent`)                                         |
| `mode`, `concurrency`                                                         | `mode`, `concurrency` (1–4, default 2)                                                          |
| `roles[] {role, writer, repositoryId?}`                                       | `roles.<id>.writer`, overridden per repository by `repositories[].roles`                        |
| `reviews[] {kind, scope, repositoryId?, role?, reviewer, alternates, vendor}` | the effective `ReviewRule` per scope (see below)                                                |
| `thresholds.inputSeverity`                                                    | `inputPolicy.threshold` (1–11, default 7; 11 = autonomous)                                      |
| `thresholds.leadAnswersMaxSeverity`                                           | `inputPolicy.leadAnswers.maxSeverity` (alpha.54; absent means none)                             |
| `thresholds.criticalPaths`                                                    | `inputPolicy.criticalPaths.length`: the count only, not the paths                               |
| `thresholds.maxAttempts / repairBudget`                                       | `maxAttempts` (default 3), `repairBudget` (default 6)                                           |
| `thresholds.maxNeutralFailures`                                               | `MAX_NEUTRAL_FAILURES`                                                                          |
| `thresholds.reviewRoundCap`                                                   | `reviewRoundCap(policy)` (today `maxAttempts * 2`)                                              |
| `thresholds.reviewEscalationRounds`                                           | `REVIEW_ESCALATION_ROUNDS` (3)                                                                  |
| `budgets[] {scope, usd?, timeMs?}`                                            | `budgets.work / group / total`                                                                  |
| `budgetOnUnknown`                                                             | `budgets.onUnknown`                                                                             |
| `timeouts {runTimeoutMs, leaseMs, gateTimeoutFloorMs?, stall}`                | the same policy fields; `stallSweep`, or `DEFAULT_STALL_SWEEP` when absent                      |
| `lean.state`                                                                  | `on` when the project manifest's `profile.layers` contains `lean`; `unknown` without a manifest |

Review rules have scopes:

- Plan and contract rules are global.
- A code review resolves role → repository → global, like `codeReview()` in
  the harness. `reviews[]` therefore holds one global `code` rule plus one
  entry for each repository or role that overrides it (`scope`,
  `repositoryId`, `role`).
- The Settings screen shows the effective reviewer for each role and
  repository pair, and where that reviewer comes from.

Gate commands, `writePaths`, prompts, tool profiles and prices are not
part of the view.

### 3.2 works[]

One entry per work order, in the order `status` lists them. Limit: 500.
Overview counts come from `progress`, not from this list (§3.6).

| Field                                         | Harness source                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id, graphId, status, resultSha?`             | `status.works[]`                                                                                                                   |
| `title?`                                      | graph node title, masked and clipped to 120 chars (§9); dropped with `--no-titles`                                                 |
| `stage {name, step?, since?, next[], needs?}` | `status.works[].stage` (alpha.54: `queued, blocked, prepare, writer, gates, review, integration, input, stopped, done, cancelled`) |
| `attempts.used / max / left`                  | `attemptSummaryView()`: counted `work.attempt` against `maxAttempts`                                                               |
| `attempts.failed`                             | `attemptSummaryOf()`: counted failures; shutdown interruptions excluded                                                            |
| `attempts.interrupted`                        | attempts with `interruptedByShutdown`; they use no attempt                                                                         |
| `attempts.rechecks`                           | evidence records with `recheck: true` across the work's attempts                                                                   |
| `attempts.neutral {used, max}`                | `work.neutralFailures` against `MAX_NEUTRAL_FAILURES`                                                                              |
| `attempts.line`                               | `attemptSummaryLine`                                                                                                               |
| `liveness?`                                   | `status.works[].liveness` (`quiet`, `stalled`; `active` when moving)                                                               |
| `runtime?, model?`                            | the active attempt                                                                                                                 |
| `blockers[]`                                  | `engine.blockers` codes                                                                                                            |
| `question?`                                   | `status.works[].input` (`requestId, state, severity`)                                                                              |
| `spend {calls, usd: Bounded, durationMs}`     | `stage.spend`: the work's own call records, under the report's cost rules (§3.7)                                                   |

`Bounded = {value, bound: exact | lower | unknown}` keeps the report rule:

- an unknown price shows as `unknown`;
- a partial sum shows as `≥ $x`;
- neither is ever shown as zero.

Per-attempt rows are not in this document; they are in the work detail
document (§3.10).

### 3.3 reviews[]

One entry per review subject: plan and contract (alpha.54
`reviewSubjectSummary`), and code (alpha.54 `review-code` records). Limits:
50 subjects, and 50 findings per subject.

- `kind, subject, workId?, approved`
- `rounds {used, max}`: `max` is `null` when the subject has no cap.
- `open {blocking, notes}`, plus `accepted`: findings accepted as
  limitations.
- `reviewer`, `sameVendor`: the reviewer binding actually used.
- `spend {calls, usd}`
- `findings[] {id, severity, status, rounds?, disposition?, title?}`:
  - `status` is one of `open`, `closed`, `withdrawn` or
    `accepted-limitation`.
  - `disposition` is `{decision: accepted-limitation | continue, by: lead | operator, round}`.
    The reason text is not included.
  - `title` is the finding message, masked and then clipped to 120 chars
    (§9).
- `escalation? {requestId, findings[], answered}`: an open blocking finding
  that has gone past `reviewEscalationRounds`. Only the operator decides it.
- `line`: the harness one-line summary.

### 3.4 questions[] and escalations[]

`questions[]` lists executor questions (`kind: question`) in every open
input state of the harness (`inputStates`):

- `awaiting-answer`
- `answered-not-applied`
- `applied-awaiting-claim`
- `delivered`
- `carry-stale`

Only `awaiting-answer` asks for an answer. The panel words the other states
by who acts next:

- `answered-not-applied`: the lead or the controller applies the answer.
- `applied-awaiting-claim`: the answer waits for the next attempt.
- `delivered`: nobody needs to act.
- `carry-stale`: the lead carries the answer again or withdraws it.

Each entry has `requestId, workId, state, version, severity, createdAt`,
plus:

- `answerableBy`: `operator-or-lead` only when `leadAnswers` is set and
  `severity ≤ leadAnswersMaxSeverity`, the same rule as `leadMayAnswer`.
  Otherwise it is `operator`. A reader that sees any other value treats it
  as `operator`.
- `answeredBy?`: alpha.54 `input.answeredBy`.
- `title?`: the question text, masked and then clipped to 200 chars. Options
  and attachments are left out. The full text is behind `harness input-show`
  until S5, when an authenticated detail route serves it (§9).

The existing `RequestLike` has neither `workId`, question text nor answer
actor. The node loader therefore passes sanitized question summaries
(`OperatorQuestionInput` in proposal P1). The pure projection never reads
raw requests.

`escalations[]` lists everything else that waits for a person or for the
lead. Each entry is `{workId?, subject?, code, actor, action, since}`:

- stops whose `explain` diagnosis names `actor: operator | lead`;
- review escalations;
- a queue pause by the operator or by the budget.

Limit: 50. The panel shows the actor and the action, and never acts on them.

### 3.5 drift[]

Accepted results whose target ref has moved since acceptance. The source is
alpha.54 `acceptedTargetSchema`:

- `workId, repositoryId, ref, acceptedSha, head?`
- `commitsSinceAccepted?, filesSinceAccepted?, diverged?`
- `unavailable?`: the reason when git could not be read. It is masked and
  clipped.

Computing drift needs git, so the node loader computes it and passes it in;
the pure projection only copies it. The list holds only rows with commits
since acceptance, divergence, or `unavailable`. Limit: 50. Totals over all
accepted works are in `health.drift`.

### 3.6 progress

All counts are over every work order in the state, never over the
truncated `works` list:

- `total`, `done`, `waitingOperator`
- `byStage: Record<stage, count>`
- `running`: works in a slot-holding stage (prepare, writer, gates, review,
  integration).

`queue {paused, reason?, detail?, actor?, action?}` comes from `queueStop`
and `queuePause`, as in `status --detail`. `queue.detail` is free text
derived from attempt errors, so it is masked and then clipped like a title
(§9). With `--no-titles` it is dropped.

### 3.7 history

The series behind the charts. Every series has one value per bucket, and
`from`, `to` and `bucketMs` are explicit. The default window is 24 h in
15-minute buckets (96 values). The loader accepts other windows within the
limits: up to 7 days and up to 500 buckets.

| Series                       | Unit and rule                                                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load`                       | Peak number of concurrent attempts in the bucket, from `startedAt` / `finishedAt`.                                                                                                                                                       |
| `attemptsStarted`            | Attempts claimed in the bucket.                                                                                                                                                                                                          |
| `attemptsFailed`             | Attempts that finished `failed` or `expired` in the bucket. Shutdown interruptions are excluded (report rule).                                                                                                                           |
| `gatesPassed`, `gatesFailed` | Applicable `attempt.gate` results in the bucket, rechecks included. A skipped or not-applicable gate is in neither series.                                                                                                               |
| `gatesReused`                | Integration gates satisfied by reused candidate evidence. They are counted only here, not as passes.                                                                                                                                     |
| `spendUsd`                   | Cost of calls finished in the bucket that the report counts as known.                                                                                                                                                                    |
| `spendBound`                 | `exact` only if no call in the window has an unknown cost under the report rules. Those rules cover the call outcome, the cost source, usage completeness, and attempts with no call records (`callsRecorded`). Otherwise it is `lower`. |
| `spendOpeningUsd`            | Spend before `from`, as a `Bounded`. The cumulative curve starts at this value, so earlier spend is not lost.                                                                                                                            |
| `budgetUsd?`                 | The `total` budget, drawn as the "spend vs budget" line.                                                                                                                                                                                 |

Attempts per hour on the History screen are summed from these buckets in
the UI. Re-bucketing is display work, not derivation.

### 3.8 health

- `controller {present, leaseUntil?}`: from `controller()` and the lease
  clock.
- `stalledAttempts`, `quietAttempts`: from attempt liveness.
- `environmentFailures`: attempts in the history window whose failure
  bucket is `environment`.
- `budgeting`: `off` when `budgetOverview` returns nothing, meaning the
  policy has no budgets.
- `budgets[] {scope, id?, state, spentUsd, limitUsd?, spentMs?, limitMs?}`:
  one row for each budgeted scope instance (total, each group, each work),
  from `budgetOverview`. The Overview shows the worst state. A work budget
  that is exceeded while the total is within limits shows as exceeded.
- `spentTotalUsd`: all known spend in the state, independent of budgets.
- `drift {checked, drifted, unavailable}`: counts over all accepted works.
  `unavailable` is shown as "not checked", never as zero drift.
- `warnings[] {code, message}`, for example `POLICY_DIGEST_MISMATCH`,
  `VIEW_TRUNCATED`, `DRIFT_UNAVAILABLE` or `STATE_NEWER_THAN_HARNESS`.
  Messages are fixed templates plus masked values. Limit: 20.

### 3.9 Limits, size and change token

**Size.** Every list has a limit:

| List                  | Limit |
| --------------------- | ----- |
| `works`               | 500   |
| `reviews`             | 50    |
| findings, per subject | 50    |
| `questions`           | 50    |
| `escalations`         | 50    |
| `drift`               | 50    |
| `settings.roles`      | 100   |
| `settings.reviews`    | 100   |
| `settings.budgets`    | 3     |
| `warnings`            | 20    |
| history buckets       | 500   |

Every free string is masked, then clipped (§9). Settings strings are model
names, ids and enums. Ids follow the graph and policy schemas, which bound
their length. With these limits the largest possible document is
computable. A test builds it with every list full and every string at its
limit, and asserts that it is at most 256 KB of UTF-8.

- When a list goes over its limit, the projection cuts it deterministically
  (it keeps the first entries in harness order) and `truncated` counts the
  omitted entries for that list.
- If a document would still exceed the cap, the projection refuses it with
  `VIEW_TOO_LARGE` (exit 4). It never returns a partial document.

**Determinism.** For the same state, policy, clock and options, the output
is the same bytes: keys are sorted and no maps are used.

**Change token.** `source.token` is derived from content. It is the SHA-256
of the canonical view bytes without `generatedAt` and `source.token`.

- The store counter `ExecutionView.dataVersion()` is only an invalidation
  hint for the server. Lease expiry, liveness, git drift, policy files and
  window boundaries all change the view without a store write.
- The server recomputes on a hint, and at least every 5 s while any work is
  live.
- `ETag` and SSE events use the content token, so equal tokens really mean
  an equal view.

### 3.10 Work detail document

`harness view --work <id>` (route `/api/view?work=<id>`) returns a
`WorkDetailView`. It shares `viewVersion` and `viewRevision` with the
overview document, and has:

- `work`: the same `WorkView`.
- `attempts[]`: newest first, at most 20. Each row has:
  - `attempt, status, failureBucket?, interrupted?`
  - `runtime, model?, startedAt, finishedAt?`
  - `stages[] {stage, durationMs?, outcome?}`
- `reviews[]`, `questions[]` and `drift?` for that work.

Per-attempt rows live only in this document, so they never inflate the
overview.

## 4. Versioning and compatibility

**Version fields.**

- `viewVersion` is the integer major. It changes only when a field is
  removed, renamed, or changes meaning.
- `viewRevision` grows on additive changes: a new optional field, a new
  enum value or a new section.
- A new enum value is additive only when the reader's fallback is safe.
  When no safe fallback exists, the change is a new major.

**Readers** (`checkView` in `src/model/compat.ts`, tested):

- The UI accepts its own major and any revision, and ignores unknown
  fields.
- Every field a component reads is checked first. A malformed document is
  refused with `NOT_A_VIEW` and the paths at fault, instead of throwing
  during render.
- Unknown values read conservatively:
  - an unknown stage shows as raw text;
  - an unknown cost bound shows as `unknown`;
  - an unknown `answerableBy` means only the operator answers;
  - an unknown question state means "inspect before acting";
  - an unknown budget state counts as `undetermined`.
- Lookups use own properties only, so `__proto__` and similar keys are
  shown as text.
- When `viewRevision` is newer than the build knows, the app shows "newer
  data, update the panel for full detail".
- Any other major is refused with `VIEW_VERSION_UNSUPPORTED` and a fix
  hint. The UI does not guess.
- An HTTP 409 keeps its code and message through `httpViewSource`.

**Producers.** The harness keeps a released major for the whole `0.1.x`
alpha line. When a new major appears, `harness view --view-version N` keeps
the previous major available for at least one minor release.

**Package versions.** The peer range for `devcontour-harness`
(`>=0.1.0-alpha.53 <0.2.0`) is advisory; the view version decides
compatibility. `devcontour-harness-ui --check` (slice S3) runs:

- `harness --version`
- `harness capabilities`, which must list `view`
- `harness view`

It then prints `{harness, ui, viewVersion, compatible, fix?}`.

**`stateVersion`** is copied through, so the panel can tell "old state, new
harness" (a warning) from "no state" (an empty view).

## 5. Screens

Six screens. Navigation is a hash route (`#/`, `#/work/<id>`, `#/reviews`,
`#/settings`, `#/history`, `#/health`), so the standalone bundle needs no
server routing. Every screen works at 390 px with no horizontal page
scroll. Tables become stacked cards below 640 px. Charts keep their
`viewBox` and are drawn in inline SVG, with no chart library. Each chart has
a text summary and a screen-reader data table.

### 5.1 Overview (`#/`)

```
Desktop (≥ 1024 px)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Harness   [Queue running]   3 of 9 accepted   budget ≥ $6.02 / $40 [within] │
├───────────────────────────────────┬─────────────────────────────────────────┤
│ Needs your answer (1)             │ Working now (1 of 2 slots)              │
│ [sev 8] export-csv                │ locale-format  [Checks] candidate-test… │
│   Which delimiter should …        │   7m 50s · 2 attempts: 1 failed, 1 left │
│   Only you can answer · q-17 v1   │                                         │
├───────────────────────────────────┤ Waiting / blocked                       │
│ Escalations (0)                   │ docs-page   [Queued] dependency         │
├───────────────────────────────────┴─────────────────────────────────────────┤
│ Load 24h ▁▁▁▁▂▃▂▅▃▂  Failures/h ▁▁▁▁▁▁█▁   Controller ✓  Stalled 0  Drift 1  │
└─────────────────────────────────────────────────────────────────────────────┘

390 px
┌──────────────────────────┐
│ Harness  [Queue running] │
│ 3 of 9 · ≥ $6.02 / $40   │
├──────────────────────────┤
│ Needs your answer (1)    │
│ [sev 8] export-csv       │
│ Which delimiter …        │
├──────────────────────────┤
│ Working now (1 of 2)     │
│ locale-format [Checks]   │
│ 7m 50s · 1 left          │
├──────────────────────────┤
│ Budget  Controller       │
│ Stalled Drift            │
└──────────────────────────┘
```

The order is fixed on every width: questions first, then running work, then
health. A question that only the operator may answer says so in words.
Until slice S5 the panel shows the request id and version and the exact
command the operator runs. It never offers a button that answers for them.

### 5.2 Work detail (`#/work/<id>`)

```
┌───────────────────────────────────────────────────────────────┐
│ ← locale-format   Format dates by locale     [Checks] active  │
│ Pipeline: prepare ✓ → writer ✓ → gates ● → review → integrate │
│ Step candidate-test:unit · since 11:52 · 7m 50s               │
├───────────────────────────────┬───────────────────────────────┤
│ Attempts 2 of 3 (1 left)      │ Spend ≥ $3.40 · 5 calls · 31m │
│ #2 running  claude · writer   │ Blockers: —                   │
│ #1 failed   check (lint)  12m │ Question: —                   │
│ rechecks 1 · interrupted 0    │ Result: —                     │
├───────────────────────────────┴───────────────────────────────┤
│ Reviews of this work: code r1 · open 0 blocking / 1 note      │
│ Drift after acceptance: —                                     │
└───────────────────────────────────────────────────────────────┘
```

The attempt rows come from the work detail document (§3.10). At 390 px the
two columns stack in this order: pipeline, attempts, spend and blockers,
reviews, drift. The pipeline becomes a vertical list.

### 5.3 Reviews (`#/reviews`)

```
┌────────────────────────────────────────────────────────────────────┐
│ Subject      Kind   Rounds  Open (blk/notes)  Accepted  Reviewer   │
│ g1           plan   2 / 6   0 / 1             0         codex      │
│ add-greeting code   1 / 6   0 / 0             0         codex      │
├────────────────────────────────────────────────────────────────────┤
│ ▸ g1 plan — approved after 2 rounds, 1 open note                   │
│   F1 high   closed                 round 1                         │
│   F2 note   open                   2 rounds                        │
│   F7 high   accepted-limitation    by operator, round 4            │
│   ⚠ escalation q-21: F9 open 3 rounds — operator decides           │
└────────────────────────────────────────────────────────────────────┘
```

At 390 px each subject is a card with its findings collapsed. The
same-vendor flag shows as a badge whenever `sameVendor` is true.

### 5.4 Settings (`#/settings`, read-only)

The screen has these groups:

- **Who works**: roles, then writer runtime, model and effort.
- **Who reviews**: plan, contract and code, each with its reviewer,
  alternates and vendor rule.
- **When to ask you**: the input threshold in words ("questions of severity
  7 and above wait for an answer; the lead may answer up to 4"), and the
  number of critical paths.
- **Limits**: attempts, repair budget, review round cap and escalation
  rounds.
- **Budgets**: per scope, and what happens on an unknown price.
- **Timeouts**: run, lease, gate floor, quiet and stalled thresholds with
  their action.
- **Lean layer** and concurrency.

Each value shows its unit. A value shows "default" only when its path is in
`settings.defaulted`. Each role and repository pair shows its effective
code reviewer and where that reviewer comes from.
At 390 px it is a single column of definition lists. The policy digest is
in the footer.

### 5.5 History (`#/history`)

Four charts share one time axis:

1. Load: stacked peak of concurrent attempts per bucket, with a dashed line
   at `concurrency`.
2. Attempts started and failed per hour.
3. Gates passed vs failed.
4. Cumulative spend against the budget line. The curve is dashed and
   labelled "lower bound" when `spendBound` is `lower`.

The window selector (24 h, 7 d) applies only when the producer supplies
that window. At 390 px the charts stack full width at 120 px height, with
3 axis labels.

### 5.6 Health (`#/health`)

The screen shows:

- controller presence and lease;
- stalled and quiet attempts, linked to work detail;
- environment failures in the window;
- budget state;
- drift rows (ref, accepted → head, commits and files since, diverged);
- warnings with codes;
- versions: harness, UI, view and state.

At 390 px it is one column.

### 5.7 Common rules

- **States.** Each screen has four:
  - Loading.
  - Empty: "No state yet — run `harness run` first".
  - Incompatible: the `checkView` message.
  - Connection lost: the last view stays on screen with a banner.
- **Accessibility.** Colour is never the only signal; every badge has text.
  Focus is visible. Live regions announce the count of waiting questions
  only.
- **Dark mode.** `prefers-color-scheme`, overridable by `data-theme` on the
  root.

## 6. Standalone runtime

```sh
npx devcontour-harness-ui --view view.json          # bare view or the `harness view` envelope
npx devcontour-harness-ui --demo                    # bundled sample
npx devcontour-harness-ui --state <dir> --policy <file> [--port N]   # slice S3
npx devcontour-harness-ui --from http://127.0.0.1:4791/              # slice S3, a running serve-view
```

**Wire contract.** One contract covers both the UI CLI and the proposed
`harness serve-view` (P3), so `httpViewSource` works against either.

- `GET /api/view` returns the bare view, with a content `ETag` and
  `cache-control: no-store`.
- `GET /api/view?work=<id>` returns the work detail document (§3.10).
- `GET /api/events` is the SSE stream. It sends `event: view`, with data
  `{token}`, whenever the content token changes.
- `GET /api/health` returns `{ok, version, readOnly}`.

Refusals:

- 409 `{error:{code,message}}` when the view is incompatible.
- 503 `VIEW_UNAVAILABLE` when no view exists yet.

`--view` accepts either the bare view or the envelope exactly as
`harness view` prints it (`{ok:true,data}`). An error envelope is reported
as `NOT_A_VIEW`.

**Output.** When the panel is listening, stdout gets one JSON line:
`{"ok":true,"url":"http://127.0.0.1:4790/","port":4790,"readOnly":true,"version":…}`.

- A refusal prints `{"ok":false,"error":{code,message}}`.
- Exit codes match the harness: 2 invalid input, 3 refusal, 4
  infrastructure.
- Human hints go to stderr.

**Port.** With no `--port`, the CLI probes 4790–4809 and takes the first
free port. A busy explicit `--port` is the error `PORT_BUSY`; it never
switches silently.

**Bind.** The CLI binds `127.0.0.1` by default; `::1` and `localhost` are
also allowed. Any other host, including `0.0.0.0` and `::`, is the error
`HOST_NOT_LOOPBACK`, and no flag overrides that.

**Request handling.**

- Only GET and HEAD are served; anything else gets 405.
- A malformed path or a NUL byte gets 400.
- A handler failure gets 500 without stopping the server.
- Static files must stay inside the app directory, checked both on the
  lexical path and on the real path, so symlinks cannot escape it.

**Data path.**

- `--view`: the file is re-read on each request.
- `--state` (S3): the CLI starts `harness serve-view` as a child process on
  an ephemeral loopback port and proxies `/api/*` to it.
  - The view is always computed by the harness the user installed, never
    by this package.
  - The child is stopped together with the panel.
- `--from <url>` (S3) proxies to a `serve-view` that is already running.
  The URL is checked before any request:
  - it must use `http:`;
  - its host must be the literal `127.0.0.1` or `[::1]`, or `localhost`
    resolved to a loopback address;
  - it must carry no credentials;
  - its path must be `/` or empty.
- The proxy never follows redirects, and it rejects any response whose
  socket peer is not a loopback address.

**No telemetry.** No analytics, no font or CDN requests, and no update
check. The bundle is self-contained.

**Updates.** The app polls every 5 s with `If-None-Match`, and pauses
polling while the tab is hidden. From S3 it also listens to
`/api/events` and reloads the view on each event.

## 7. Embedding API (DevContour)

DevContour adds `devcontour-harness-ui` as an exact build-time dependency
and bundles the components with Vite. There is no runtime microfrontend,
iframe or second server.

```ts
import {
  Overview,
  WorkDetail,
  Reviews,
  Settings,
  History,
  Health, // S2
  type OperatorView,
  type ViewSource,
  checkView,
} from 'devcontour-harness-ui';
import 'devcontour-harness-ui/styles.css';

interface ViewSource {
  load(signal?: AbortSignal): Promise<ViewCheck>;
  subscribe?(onChange: () => void): () => void;
}
```

- **Data.** Components take `view: OperatorView` as a prop and never fetch.
  The host owns loading. DevContour implements `ViewSource` over its store.
  Two ways to do that:
  - Call `operatorView(collectOperatorViewInput(...))` from the harness
    package on the server, inside the same transaction it uses for
    `statusOf`, and serve it at its own `/api/harness/view`.
  - Or map its existing summaries into the view type. Only the first keeps
    the numbers identical to `harness view`, so it is the recommended way.
- **Navigation.** Components accept callbacks (`onOpenWork(id)`,
  `onOpenReview(subject)`) and never touch `location`. The standalone app
  wires them to hash routes; DevContour wires them to its query-string
  navigation.
- **Theming.** Every colour, radius, font and spacing value is a `--hui-*`
  custom property on `.hui`. DevContour maps its tokens on a wrapper, for
  example `--hui-accent: var(--data-accent)` and `--hui-bad:
var(--status-failed)`. There are no class overrides and no Tailwind
  dependency in this package. Styles use `:where()` so the host's
  specificity wins.
- **Labels.** Labels are English in `0.1`. A `labels` prop (a partial
  dictionary) lets DevContour pass its Russian strings. It is planned for
  S4; until then DevContour wraps the components.
- **Writes.** The S5 answer form takes an `onAnswer(requestId, version,
answer)` callback. The host performs the write with its own CSRF and
  actor rules. The component never posts.

## 8. What moves from DevContour and what stays

Harness-generic parts move here as view-driven components. Each one is
replaced in DevContour by the package component once that component's
slice lands.

| DevContour part (src/web)                                                                      | Goes to                                                | Slice |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----- |
| Home "harness" tile: slots, attempts 24 h by kind, failing gates, budget, usage, server health | `Health` + Overview strip                              | S2    |
| `LoadChart`, `HourlyChart` (hand SVG)                                                          | `History` charts                                       | S2    |
| `Workers.tsx`: `Phases`, `WorkerCards` (without the activity tail)                             | Overview "working now", Work detail pipeline           | S2    |
| `LiveWork.tsx`: attempt rows, `LivenessNote`, `AttemptTimeline`                                | Overview, Work detail                                  | S2    |
| `ProgressPanel.tsx`: stage sentence, gate coverage table, review/findings list, setup          | Work detail, Reviews, Settings                         | S2    |
| `Settings.tsx` model slots and `InputPolicy.tsx` threshold, **read view only**                 | Settings                                               | S2    |
| `CheckPanel.tsx` (properties, cases, recovery)                                                 | later: needs a check section in the view (revision 1+) | —     |

These stay in DevContour:

- product preparation tiles (product, architecture, design);
- releases, ChangeSets and coverage;
- board and ChangeSet workflow rows;
- the product journal labels;
- the editable model and threshold forms (they write DevContour's
  workspace config through its own two-step preview/apply);
- the live activity tail of a run (`api/runs/:id/activity`), which carries
  executor output and is not part of the view;
- layout tokens (sidebar, inspector, canvas).

The coupling to cut on the way:

- Components fetch `/api/...` themselves; they will take data as props.
- Types are imported from `core/model.ts`; they will come from the view
  type.
- Labels are hard-coded.
- Styling relies on Tailwind classes; it will move to `--hui-*` variables.

## 9. Security

**Network.**

- The panel listens on loopback only (§6), and nothing overrides that.
- Each request's `Host` header must name the loopback listener:
  `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`. Anything else
  gets 421, which guards against DNS rebinding.
- The `--from` proxy target is restricted to loopback, with no redirects
  (§6).

**Response headers.**

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`

**Static files.** A file must stay inside the app directory on both its
lexical path and its real path. A symlink that leaves the directory gets
404, and a malformed path gets 400. Both rules are tested.

**What the view never contains.**

- prompts, executor output, logs or log paths;
- environment variables or tokens;
- gate commands or tool profiles;
- absolute paths: the home directory becomes `~`, and other paths stay
  relative to the repository;
- finding or question bodies beyond the masked, clipped title.

**Masking.** It applies to every free-text field of the view, not only
titles:

- titles;
- `progress.queue.detail`;
- `warnings[].message`;
- `drift[].unavailable`;
- `stage.step`;
- `line` fields.

A secret could be cut in half at the clip boundary and slip through, so
masking runs **before** clipping. The masking step:

1. Replaces token-like strings with `‹masked›`. These are provider key
   prefixes, `Bearer …`, long base64 or hex runs, and `user:pass@` in URLs.
2. Replaces the home directory with `~`.
3. Clips the text to the field limit.

`--no-titles` drops titles, `queue.detail` and finding titles, as
`report --no-titles` does.

The P1 tests plant a provider key, a bearer token, URL credentials and the
home path into a work title, a question, a finding, an attempt error that
feeds `queue.detail`, and a git error that feeds drift. One case places the
key across the clip boundary. In every case the view bytes must not contain
any of the planted values.

**Write path (S5).**

There is one origin. The browser only ever talks to the UI CLI. The UI CLI
proxies `POST /api/answers` and `GET /api/questions/<id>` to its
`serve-view` child. `connect-src 'self'` therefore holds, and the browser
never makes a cross-port request.

The browser is authenticated by a one-time code exchanged for a session
cookie:

- When writes are enabled, the UI CLI prints a URL that carries a one-time
  code in the fragment (`#code=…`).
- On first load, the app sends the code once in the body of `POST
/api/session`.
- The server answers with an `HttpOnly; SameSite=Strict; Path=/api` cookie
  and invalidates the code.
- The app removes the fragment with `history.replaceState`.
- A code that leaked into a log or chat is useless after that first
  exchange.
- Codes expire after 10 minutes. Ordinary log lines never print the code;
  only the one startup line does.

The CLI and `serve-view` share a separate secret:

- The UI CLI generates a random 32-byte secret.
- It hands the secret to the `serve-view` child through the child's stdin,
  never through argv, the environment or stdout.
- It sends the secret as `Authorization: Bearer` on every proxied write.
- `serve-view --allow-answers` reads the secret from stdin and accepts
  writes only with it.

Every write must also pass these checks:

- the session cookie;
- `Origin` equal to the panel origin;
- `content-type: application/json`;
- a body of at most 16 KB.

What a failed check returns:

| Failure                       | Response |
| ----------------------------- | -------- |
| missing or bad session cookie | 403      |
| wrong `Origin`                | 403      |
| body is not JSON              | 415      |
| body over 16 KB               | 413      |

**Answer contract.** The request body maps one to one onto `harness
input-answer`:

```
{ requestId, requestVersion, kind: 'clarification' | 'requirement-change',
  optionId?, text }
```

- `text` is required, because `answerInput` requires it.
- `kind` defaults to `clarification` only when the user picks nothing.
- The form shows the full decision context before it allows an answer:
  - the unclipped (but masked) question text;
  - the options with their consequences;
  - the severity;
  - who may answer.

  It reads this context from the authenticated `GET /api/questions/<id>`.

- The harness records the answer with `actor: operator`. A stale version
  gets `REQUEST_VERSION_STALE` and is shown. Requests the operator may not
  answer, and any lead path, are not exposed.
- Agents never use this path, and the skill forbids answering for the user.

**Supply chain.** Dependencies are exact versions. The runtime bundle
contains only React, and the CLI imports only `node:*`.

## 10. Slices

Every slice ends green on `npm test && npm run typecheck && npm run build`.
Tests use no network beyond loopback, and their fixtures live in
`fixtures/`. A slice that touches the harness lands there first, under the
harness rules: independent acceptance and a round limit. Acceptance
criteria check the meaning shown on screen, not just that rendering
succeeds.

**S0: scaffold (this repository's first commits).**

- Contents:
  - the view type and `checkView`, which validates nested fields;
  - `ViewSource`, with typed 409 refusals;
  - Overview;
  - the loopback CLI with `--view` (bare view or envelope) and `--demo`;
  - the sample fixture and the skill.
- Acceptance and tests (`tests/*.test.ts*`):
  - Hosting refusals:
    - `0.0.0.0`, `::` and LAN addresses are refused;
    - a busy explicit port is an error;
    - a foreign `Host` gets 421;
    - POST gets 405;
    - a malformed path gets 400, and the server keeps serving;
    - a symlink escape gets 404.
  - View handling:
    - an incompatible view gets 409 and keeps its message through
      `httpViewSource`;
    - malformed sections are refused before render;
    - unknown values read conservatively.
  - Overview rendering:
    - only `awaiting-answer` questions are asked;
    - the running count comes from `progress`, with a truncation note;
    - the worst budget scope is shown, and "no budget" when there are none;
    - drift that could not be checked is not shown as zero;
    - no form elements.
  - `--hui-*` custom properties are declared only on `:root`.

**S1: schema in the harness** (proposals P1, P2).

- Contents:
  - `operatorView` and `harness view` land in the harness.
  - The UI imports the type from `devcontour-harness/projections`.
  - A contract test checks every fixture against
    `schemas/operator-view.schema.json`.
- The fixture set:
  - empty state;
  - busy, paused by the operator;
  - work budget exceeded while the total is within limits;
  - large spend before the window;
  - escalated review;
  - drift, including drift that could not be checked;
  - a question in each input state, one of them only the operator may
    answer;
  - every list truncated;
  - a newer revision;
  - a worst-case size document.
- Acceptance:
  - Every fixture passes the schema.
  - The view of the harness `single-task` example equals `harness view`
    output byte for byte.
  - Numbers match `status` and `report` on the same state: attempts, the
    neutral counter, rechecks, spend bounds, gates (skipped and reused
    separately) and stage.
  - The secret-planting test passes, including a key across the clip
    boundary.
  - The worst-case document is at most 256 KB.
  - The content token changes when a lease expires with no store write.

**S2: read-only screens.**

- Contents:
  - Work detail (using the `--work` document), Reviews, Settings (with
    `defaulted` provenance and scoped review rules), History, Health;
  - hash routing;
  - empty, incompatible, lost and newer-revision states;
  - dark mode.
- Acceptance:
  - For each fixture, every screen shows the expected key text: counts,
    bounds, actors and states.
  - Playwright at 1280 px and 390 px shows no horizontal scroll.
  - axe reports no serious violations.
  - Charts have text summaries.
  - The cumulative spend chart starts at `spendOpeningUsd`.
  - There is no `<form>` element anywhere.
  - A browser test confirms that `--hui-*` set on a wrapper changes the
    computed colours.
- Tests:
  - `renderToStaticMarkup` for each screen and fixture;
  - one Playwright smoke run against `--demo`.

**S3: live runtime** (proposal P3).

- Contents:
  - `--state/--policy` through a `serve-view` child;
  - `--from <url>`, with the loopback-only checks;
  - SSE;
  - `--check`;
  - the skill updated to the live route.
- Acceptance:
  - A change in state reaches the browser within 2 s.
  - Killing the panel stops the child.
  - A mismatched harness prints `compatible:false` with a fix.
  - A missing state directory together with a policy gives an empty view.
    Without a policy it gives `POLICY_REQUIRED`, and no directory is
    created.
  - `--from` refuses non-loopback, credentialed and redirecting targets.
- Tests: CLI integration on the harness fixture runtime, with no live
  models.

**S4: DevContour embedding.**

- Contents:
  - a `labels` prop;
  - adapter guidance for DevContour;
  - the parts listed in §8 replaced in DevContour.
- Acceptance:
  - DevContour's e2e and visual checks stay green.
  - The token mapping covers every `--hui-*` variable.
  - Each screen has one implementation, with no copies left in DevContour.

**S5: operator answers** (proposal P4).

- Contents: an answer form for `awaiting-answer` questions the operator
  may answer, through the single-origin proxy described in §9.
- Acceptance:
  - The answer is recorded with `actor: operator`, the request version and
    `kind`.
  - The full masked question and its options are shown before answering.
  - A stale version is refused and shown.
  - Each refusal returns its status:
    - missing or used code, or missing cookie: 403;
    - wrong `Origin`: 403;
    - non-JSON body: 415;
    - body over 16 KB: 413.
  - The code and the shared secret never appear in logs, view responses or
    argv.
- Tests:
  - server tests for each refusal;
  - a browser test that answers end to end on the fixture runtime;
  - a component test showing the form does nothing without `onAnswer`.

## 11. Open decisions

1. **Language.** Labels are English, with Russian supplied through `labels`
   (S4). The alternative is bilingual labels from S2.
2. **Drift cost in `serve-view`.** Drift needs git. The proposal caches it
   per target head and recomputes at most every 30 s. The alternative is to
   compute it only on explicit refresh.
3. **CheckPanel.** It could move as a view revision with a check section.
   Or it could stay in DevContour while the property-check contract is
   still changing.
4. **History windows.** The proposal is 24 h by default and 7 days on
   request. Longer windows would need pre-aggregation in the harness.
5. **Package home.** This package could stay a separate repository, as now,
   or become a workspace of the harness repository. A separate repository
   keeps React out of the harness. A workspace puts the schema and the UI in
   one PR.
6. **First write.** S5 needs the owner's approval of the single-origin
   design. That design covers the one-time code, the cookie, and the secret
   piped to the child over stdin.
