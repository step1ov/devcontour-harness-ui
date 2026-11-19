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

Source: the execution policy bound to the state (`binding.json`) or the one
passed with `--policy`. The view carries `policyDigest`. If the two
policies differ, `health.warnings` gets `POLICY_DIGEST_MISMATCH`.

| View field                                                     | Harness source                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `approvalMode`                                                 | `approvalMode` (`agent` \| `operator`, default `agent`)                             |
| `mode`, `concurrency`                                          | `mode`, `concurrency` (1–4, default 2)                                              |
| `roles[] {role, writer, repositoryId?}`                        | `roles.<id>.writer`, `repositories[].roles` overrides                               |
| `reviews[] {kind, reviewer, alternates, vendor}`               | `review.plan / contract / code` (`ReviewRule`)                                      |
| `thresholds.inputSeverity`                                     | `inputPolicy.threshold` (1–11, default 7; 11 = autonomous)                          |
| `thresholds.leadAnswersMaxSeverity`                            | `inputPolicy.leadAnswers.maxSeverity` (alpha.54; absent = none)                     |
| `thresholds.criticalPaths`                                     | `inputPolicy.criticalPaths.length` (count only, not the paths)                      |
| `thresholds.maxAttempts / repairBudget`                        | `maxAttempts` (default 3), `repairBudget` (default 6)                               |
| `thresholds.maxNeutralFailures`                                | `MAX_NEUTRAL_FAILURES`                                                              |
| `thresholds.reviewRoundCap`                                    | `reviewRoundCap(policy)` (today `maxAttempts * 2`)                                  |
| `thresholds.reviewEscalationRounds`                            | `REVIEW_ESCALATION_ROUNDS` (3)                                                      |
| `budgets[] {scope, usd?, timeMs?}`                             | `budgets.work / group / total`                                                      |
| `budgetOnUnknown`                                              | `budgets.onUnknown`                                                                 |
| `timeouts {runTimeoutMs, leaseMs, gateTimeoutFloorMs?, stall}` | the same policy fields; `stallSweep` or `DEFAULT_STALL_SWEEP`                       |
| `lean.state`                                                   | the project manifest `profile.layers` contains `lean`; `unknown` without a manifest |

Gate commands, `writePaths`, prompts, tool profiles and prices are not part
of the view.

### 3.2 works[]

One entry per work order, ordered as `status` orders them. Limit: 500.

| Field                                                             | Harness source                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id, graphId, status, resultSha?`                                 | `status.works[]`                                                                                                                                       |
| `title?`                                                          | graph node title, clipped to 120 chars; dropped with `--no-titles`                                                                                     |
| `stage {name, step?, since?, next[], needs?}`                     | `status.works[].stage` (alpha.54: `queued, blocked, prepare, writer, gates, review, integration, input, stopped, done, cancelled`)                     |
| `attempts {used, max, left, failed, rechecks, interrupted, line}` | `attemptSummary` (`attemptSummaryOf`): `rechecks` counts gate rechecks and uncounted environment failures; `interrupted` counts shutdown interruptions |
| `liveness?`                                                       | `status.works[].liveness` (`quiet`, `stalled`; `active` when moving)                                                                                   |
| `runtime?, model?`                                                | the active attempt                                                                                                                                     |
| `blockers[]`                                                      | `engine.blockers` codes                                                                                                                                |
| `question?`                                                       | `status.works[].input` (`requestId, state, severity`)                                                                                                  |
| `spend {calls, usd: Bounded, durationMs}`                         | `stage.spend` (the work's own call records)                                                                                                            |

`Bounded = {value, bound: exact | lower | unknown}` keeps the report rule:
an unknown price shows as `unknown`, a partial sum as `≥ $x`, never as zero.

### 3.3 reviews[]

One entry per review subject: plan, contract (alpha.54
`reviewSubjectSummary`) and code (alpha.54 `review-code` records). Limit:
50 subjects, 50 findings each.

- `kind, subject, workId?, approved`
- `rounds {used, max}`: `max` is `null` when the subject has no cap
- `open {blocking, notes}`, `accepted` (findings accepted as limitations)
- `reviewer`, `sameVendor`: the reviewer binding actually used
- `spend {calls, usd}`
- `findings[] {id, severity, status, rounds?, disposition?, title?}`:
  - `status` is one of `open`, `closed`, `withdrawn`, `accepted-limitation`.
  - `disposition` is `{decision: accepted-limitation | continue, by: lead | operator, round}`.
  - The reason text is not included.
  - `title` is the finding message clipped to 120 chars and masked (§9).
- `escalation? {requestId, findings[], answered}`: an open blocking finding
  that went past `reviewEscalationRounds`. The operator answers it.
- `line`: the harness one-line summary.

### 3.4 questions[] and escalations[]

`questions[]` lists open executor questions (`kind: question`) in the
states `awaiting-answer`, `answered-not-applied` and `carry-stale`. Each
entry has `requestId, workId, state, version, severity, createdAt`, plus:

- `answerableBy`: `operator` when `severity >
leadAnswersMaxSeverity` or no `leadAnswers` is set. Otherwise it is
  `operator-or-lead`. This follows `leadMayAnswer`.
- `answeredBy?`: alpha.54 `input.answeredBy`.
- `title?`: the question text clipped to 200 chars and masked. Options and
  attachments are left out. The full text stays behind `harness input-show`.

`escalations[]` lists everything else that waits for a person or for the
lead. Each entry is `{workId?, subject?, code, actor, action, since}`:

- stops whose `explain` diagnosis names `actor: operator | lead`;
- review escalations;
- a queue pause by the operator or by the budget.

The panel shows the actor and the action. It never acts on them.

### 3.5 drift[]

Accepted results whose target ref has moved since acceptance. The source is
alpha.54 `acceptedTargetSchema`:

- `workId, repositoryId, ref, acceptedSha, head?`
- `commitsSinceAccepted?`, `filesSinceAccepted?`, `diverged?`
- `unavailable?`: the reason when git could not be read.

Computing drift needs git, so the node loader computes it and passes it in;
the pure projection only copies it. The list holds only rows with commits
since acceptance, divergence, or `unavailable`. Limit: 50.

### 3.6 progress

- `total`, `done`, `waitingOperator`, `byStage: Record<stage, count>`
- `queue {paused, reason?, detail?, actor?, action?}`: from `queueStop` and
  `queuePause`, as in `status --detail`.

### 3.7 history

The series behind the charts. Every series has one value per bucket.
`from`, `to` and `bucketMs` are explicit. The default window is 24 h in
15-minute buckets (96 values). The loader accepts other windows within
the limits: up to 7 days and 500 buckets.

| Series                       | Unit / rule                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `load`                       | peak number of concurrent attempts in the bucket (from `startedAt` / `finishedAt`)                                        |
| `attemptsStarted`            | attempts claimed in the bucket                                                                                            |
| `attemptsFailed`             | attempts that finished `failed` / `expired` in the bucket; shutdown interruptions excluded (report rule)                  |
| `gatesPassed`, `gatesFailed` | `attempt.gate` events in the bucket, rechecks included                                                                    |
| `spendUsd`                   | known cost of call records finished in the bucket; `spendBound` is `lower` if any call in the window has an unknown price |
| `budgetUsd?`                 | the `total` budget, for the "spend vs budget" line                                                                        |

Attempts per hour on the History screen are summed from these buckets in
the UI. Re-bucketing is display work, not derivation.

### 3.8 health

- `controller {present, leaseUntil?}`: from `controller()` and the lease
  clock.
- `stalledAttempts`, `quietAttempts`: from attempt liveness.
- `environmentFailures`: attempts in the history window whose failure
  bucket is `environment`.
- `budget {state: within | exceeded | undetermined, scope?, spentUsd}`:
  from `budgetOverview`.
- `warnings[] {code, message}`: for example `POLICY_DIGEST_MISMATCH`,
  `VIEW_TRUNCATED`, `DRIFT_UNAVAILABLE`, `STATE_NEWER_THAN_HARNESS`.

### 3.9 Limits and determinism

- The whole document is capped at 256 KB. Over a limit, lists are cut, and
  `truncated` carries the number of omitted entries per list.
- For the same state, policy, clock and options, the output is the same
  bytes (sorted keys, no maps).
- `source.token` is an opaque change token. It is `ExecutionView.dataVersion()`
  when the store has one, otherwise a hash of the view. Equal tokens mean
  an unchanged view, and the server uses the token for `ETag` and for SSE
  change events.

## 4. Versioning and compatibility

- **`viewVersion`** (integer major) changes only when a field is removed,
  renamed or changes meaning. **`viewRevision`** grows on additive change:
  a new optional field, a new enum value, a new section.
- **Readers.** The UI accepts its own major and any revision. It ignores
  unknown fields. It shows unknown enum values as raw text (for example, a
  new stage name). When `viewRevision` is newer than the build knows, the UI
  shows "newer data, update the panel for full detail". It refuses any other
  major with `VIEW_VERSION_UNSUPPORTED` and a fix hint, and does not guess.
  The tested rule is `checkView` in `src/model/compat.ts`.
- **Producers.** The harness keeps a released major for the whole `0.1.x`
  alpha line. When a new major appears, `harness view --view-version N`
  keeps the previous major available for at least one minor release.
- **Package versions.** The peer range `devcontour-harness
  > =0.1.0-alpha.53 <0.2.0`is advisory. The view version decides
compatibility.`devcontour-harness-ui --check`(slice S3) runs`harness
  > --version`and`harness view --json`and prints`{harness, ui, viewVersion, compatible, fix?}`.
- **`stateVersion`** is copied through so the panel can tell "old state,
  new harness" (a warning) from "no state" (an empty view).

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

At 390 px the two columns stack: pipeline, attempts, spend and blockers,
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

Each value shows its unit, and "default" when it comes from the default.
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
npx devcontour-harness-ui --view view.json         # a file written by `harness view --json`
npx devcontour-harness-ui --demo                   # bundled sample
npx devcontour-harness-ui --state <dir> --policy <file> [--port N]   # slice S3
npx devcontour-harness-ui --from http://127.0.0.1:4791/              # slice S3, a running serve-view
```

- **Output.** stdout gets one JSON line when the panel is listening:
  `{"ok":true,"url":"http://127.0.0.1:4790/","port":4790,"readOnly":true,"version":…}`.
  A refusal prints `{"ok":false,"error":{code,message}}`. Exit codes match
  the harness: 2 invalid input, 3 refusal, 4 infrastructure. Human hints go
  to stderr.
- **Port.** With no `--port`, the CLI probes 4790–4809 and takes the first
  free port. An explicit `--port` that is busy is the error `PORT_BUSY`; it
  is never switched silently.
- **Bind.** `127.0.0.1` by default. `::1` and `localhost` are allowed.
  Any other host, including `0.0.0.0` and `::`, is the error
  `HOST_NOT_LOOPBACK`, and there is no override flag.
- **Read-only.** Only GET and HEAD are served; anything else gets 405.
- **Data path.**
  - `--view`: the file is re-read on each request, with a SHA-256 `ETag`.
  - `--state` (S3): the CLI starts `harness serve-view` as a child process
    on an ephemeral loopback port and proxies `/api/view` and
    `/api/events` to it. The view is computed by the harness the user
    installed, never by this package. The child is stopped with the panel.
- **No telemetry.** No analytics, no font or CDN requests, and no update
  check. The bundle is self-contained.
- **Updates.** Polling every 5 s, paused while the tab is hidden, with
  `If-None-Match`. From S3 the CLI also supports SSE `/api/events`, which
  sends `{token}` on change, and the app reloads the view on each event.

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

- **Network.** The panel listens on loopback only (§6), with no override.
  Each request's `Host` header must name the loopback listener
  (`127.0.0.1:<port>`, `localhost:<port>`, `[::1]:<port>`). Anything else
  gets 421, which guards against DNS rebinding.
- **Response headers.**
  - `Content-Security-Policy: default-src 'self'; script-src 'self';
style-src 'self'; connect-src 'self'; frame-ancestors 'none';
base-uri 'none'; form-action 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY`
- **Static files.** Paths are resolved inside the app directory; anything
  outside gets 404.
- **No secrets in the view.** The projection includes no:
  - prompts, executor output, logs or log paths;
  - environment variables or tokens;
  - gate commands or tool profiles;
  - absolute paths (the home directory becomes `~`, other paths stay
    relative to the repository);
  - finding or question bodies beyond the clipped title.
- **Masking.** Titles pass through `clipText`, then a masking step that
  replaces token-like strings (provider key prefixes, `Bearer …`, long
  base64 or hex runs, `user:pass@` in URLs) with `‹masked›`.
  `--no-titles` drops all titles, as in `report --no-titles`. A test
  plants known secrets in state and asserts they are absent from the view
  bytes.
- **Write path (S5).** Only `harness serve-view` accepts answers, and only
  when started with `--allow-answers`. The CLI generates a per-start random
  token and passes it to the browser in the URL fragment, so it is never
  logged or sent as a Referer. A write must pass all of these checks:
  - an `Authorization` header with the token;
  - `Origin` equal to the panel origin;
  - JSON only;
  - the `request-version` it answers.

  The harness records the answer with `--actor operator`. Agents never use
  this path. The skill forbids answering for the user.

- **Supply chain.** Dependencies are exact versions. The runtime bundle has
  only React. The CLI imports only `node:*`.

## 10. Slices

Every slice ends green on `npm test && npm run build`, has no network in
tests, and leaves fixtures in `fixtures/`. A slice that touches the harness
lands there first, under the harness rules: independent acceptance and a
round limit.

**S0: scaffold (this commit).**

- Contents: the view type, `checkView`, `ViewSource`, Overview, the
  loopback CLI with `--view` and `--demo`, the sample fixture and the
  skill.
- Acceptance:
  - `npm install && npm test && npm run build` pass.
  - The CLI refuses `0.0.0.0`.
  - An explicit busy port is an error.
  - A foreign `Host` gets 421.
  - POST gets 405.
  - An incompatible view gets 409 with its code.
  - Overview renders without forms.

**S1: schema in the harness** (proposals P1, P2).

- Contents:
  - `operatorView` and `harness view --json` land in the harness.
  - The UI imports the type from `devcontour-harness/projections`.
  - A contract test checks the local fixture set against
    `schemas/operator-view.schema.json`.
- Fixture set: empty state, busy, paused by operator, budget exceeded,
  escalated review, drift, a question only the operator may answer,
  truncated, and a newer revision.
- Acceptance:
  - Every fixture passes the schema.
  - The view of the harness `single-task` example equals
    `harness view` output byte for byte.
  - Numbers match `status` and `report` on the same state:
    - attempts against `attemptSummary`;
    - spend against the report;
    - stage against `status.works[].stage`.
  - The secret-planting test passes.

**S2: read-only screens.**

- Contents: Work detail, Reviews, Settings, History, Health, hash routing,
  empty, incompatible and lost states, and dark mode.
- Acceptance:
  - Each screen renders every fixture without throwing.
  - Each fixture has a snapshot of its key text.
  - Playwright at 1280 px and 390 px shows no horizontal scroll.
  - axe reports no serious violations.
  - Charts have text summaries.
  - No `<form>` element anywhere.
- Tests:
  - `renderToStaticMarkup` per screen and fixture;
  - one Playwright smoke against `--demo`.

**S3: live runtime** (proposal P3).

- Contents: `--state/--policy` through a `harness serve-view` child,
  `--from <url>`, SSE, `--check`, and the skill updated to the live route.
- Acceptance:
  - A change in state reaches the browser within 2 s.
  - Killing the panel stops the child.
  - A mismatched harness prints `compatible:false` with a fix.
  - No state directory gives an empty view, not an error.
- Tests: CLI integration on the harness fixture runtime (no live models).

**S4: DevContour embedding.**

- Contents:
  - A `labels` prop.
  - DevContour adapter guidance.
  - The parts in §8 replaced in DevContour.
- Acceptance:
  - DevContour's e2e and visual checks stay green.
  - The token mapping covers every `--hui-*` variable.
  - There is one implementation per screen, with no copies left in
    DevContour.

**S5: operator answers** (proposal P4).

- Contents: an answer form for the questions the operator may answer,
  through `serve-view --allow-answers`.
- Acceptance:
  - The answer is recorded with `actor: operator` and the request version.
  - A stale version is refused and shown.
  - Missing token, wrong `Origin` or a non-JSON body gets 403 or 415.
  - The lead-only path is not exposed.
- Tests:
  - server tests for each refusal;
  - a component test showing that the form does nothing without
    `onAnswer`.

## 11. Open decisions

1. **Language.** Labels are English, with Russian through `labels` (S4).
   Alternatively, labels could be bilingual from S2.
2. **Who computes drift for `serve-view`.** Drift needs git on each
   recompute. One option is to cache it per target head, recomputing only
   when `rev-parse` changes. The other is to compute it only on explicit
   refresh.
3. **CheckPanel.** It could move as a view revision with a check section.
   Or it could stay in DevContour while the property-check contract is
   still changing.
4. **History windows.** The proposal is 24 h by default and 7 d on
   request. Longer windows would need pre-aggregation in the harness.
5. **Package home.** This could be a separate repository, as now, or a
   workspace of the harness repository. A separate repository keeps React
   out of the harness. A workspace keeps the schema and the UI in one PR.
