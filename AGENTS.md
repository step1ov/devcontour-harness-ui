# Agent instructions: devcontour-harness-ui

Rules for agents (Claude Code, Codex and others) working in this repository.

## Checks

```sh
npm test            # node:test via tsx: model, components (renderToStaticMarkup), server, CLI
npm run typecheck
npm run build       # tsc library build + Vite app bundle into dist/
npm run test:e2e    # build, then Playwright (local Chromium) against --demo at 1280 and 390 px
```

Every change ends green on `npm test && npm run typecheck && npm run build`.
New tests go in `tests/*.test.ts` or `tests/*.test.tsx`. Tests never use the
network beyond loopback, never call live models, and never delete paths
they did not create.

`spawn EPERM` or a sandbox or network refusal is neither a pass nor a
proven defect. Rerun it the environment's usual way, or report it as
blocked with the command and the message.

## Boundaries

- **No push, no publish.** Agents do not add remotes, do not push, do not
  publish to npm, and do not change the version or dependencies without an
  explicit instruction. The owner makes the first push.
- **Read-only panel.** Do not add write endpoints, forms or actions without
  an approved slice. The first write path (operator answers) is S5 in
  `docs/design.md`. It goes through the harness, with `--actor operator`.
- **Loopback only.** Do not add a flag or default that binds beyond
  `127.0.0.1` / `::1` / `localhost`, and do not weaken the Host check, CSP
  or method allow-list.
- **The harness owns the data.** Components render the operator view and
  derive no numbers. If a number is wrong or missing, the fix is a harness
  proposal (`docs/harness-proposals.md`), not a UI computation.
- **No telemetry**, no CDN or font requests, and no update checks.

## Privacy

Public files (`docs/`, `README.md`, `skills/`, code, fixtures, commit
messages) contain no customer, pilot or private project names, no local
paths, and no comparisons with third-party projects. Review notes, pilot
data and comparisons stay in the ignored `.private/`. Do not add them with
`git add -f`, and do not ship them in the package. Fixtures use invented
projects only.

## Review

A change is accepted by an agent of a different model than the one that
wrote it. The reviewer lists every finding in one pass, and the author fixes
the cause of each finding with a regression test. The loop is capped at 8
rounds; after that, the decision goes to the owner.

## Commits

Commit messages are in English.
