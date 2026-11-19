---
name: harness-ui
description: Start the read-only devcontour-harness operator panel for the current project on a local port, give the user the URL, and explain in plain words what they see — what waits for their answer, what runs now, reviews, settings, history and health. Use when the user wants to watch harness work in a browser, asks "what is the harness doing", or wants a dashboard of attempts, questions, budgets or reviews. Never exposes the panel beyond the local machine and never answers operator questions for the user.
---

# Harness panel

`devcontour-harness-ui` shows harness state in a browser. It is read-only:
it can not start, stop, retry or answer anything. It listens only on the
local machine (`127.0.0.1`).

Below, `$H` is the project's harness CLI
(`<tooldir>/node_modules/.bin/harness`, see the `harness` skill) and `$UI`
is the panel CLI (`<tooldir>/node_modules/.bin/devcontour-harness-ui`, or
`npx devcontour-harness-ui@<exact version>`).

## Hard rules

- **Never** pass `--host 0.0.0.0`, `::` or a LAN address, and never put the
  panel behind a tunnel, a proxy or port forwarding. The CLI refuses
  non-loopback hosts. Do not work around that.
- **Never answer operator questions on the user's behalf.** The panel lists
  questions with "Only you can answer this question". Tell the user what is
  asked and the exact command or place to answer. Do not run
  `harness input-answer --actor operator` yourself. Questions the policy
  lets the lead answer are handled by the `harness` skill rules, not by this
  panel.
- Do not edit the state directory, the policy or the view file to "fix" what
  the panel shows. The panel shows the harness. A wrong number is a finding
  for the harness, and you report it.

## 1. Find the paths

1. Repository root: `git rev-parse --show-toplevel`.
2. Policy: `<repo>/.harness/policy.json`.
3. State: `paths.state` in `<repo>/.harness/project.json`. It is outside the
   repository. If it does not exist yet, nothing has run: say so, and offer
   `--demo` to show the panel with sample data.
4. If there is no `.harness/`, the project is not set up. Use the
   `harness-setup` skill first, and do not invent paths.

## 2. Check versions

```sh
$H --version
$UI --version
```

The panel reads the operator view of the harness (`viewVersion`). Each
panel release supports one view major. A mismatch is not fatal to the
user's work: the panel shows `View version N is not supported` with a fix.
Install the matching panel version.

Live view support needs a harness with `harness view`. Check with:

```sh
$H view --state <state> --policy .harness/policy.json > /dev/null; echo $?
```

Exit 0 means it is supported. An error envelope with an unknown-command
code means this harness is older. In that case use the demo or the text
watch (step 6).

## 3. Start the panel in the background

With `harness view` available: write a snapshot outside the repository,
then serve it. The file is re-read on every request, so regenerating it
updates the open page.

```sh
VIEW_DIR=$(mktemp -d)              # outside the repository
$H view --state <state> --policy .harness/policy.json > "$VIEW_DIR/envelope.json"
node -e 'const e=require(process.argv[1]); if(!e.ok) process.exit(3); require("fs").writeFileSync(process.argv[2], JSON.stringify(e.data))' \
  "$VIEW_DIR/envelope.json" "$VIEW_DIR/view.json"
$UI --view "$VIEW_DIR/view.json" > "$VIEW_DIR/panel.out" 2> "$VIEW_DIR/panel.err" &
echo $! > "$VIEW_DIR/panel.pid"
```

Later panel releases (with `--state`) replace this with
`$UI --state <state> --policy .harness/policy.json`, which keeps itself
current. Prefer that when `$UI --help` lists `--state` as available.

Without `harness view`: `$UI --demo` serves the bundled sample. Say clearly
that this is sample data, not their project.

Port: leave `--port` out. The CLI probes 4790–4809 and takes the first free
one. Pass `--port N` only if the user asks for a specific port.

## 4. Print the URL

The first stdout line is JSON:

```json
{ "ok": true, "url": "http://127.0.0.1:4790/", "port": 4790, "readOnly": true }
```

Wait for that line in `panel.out` (poll with a timeout of a few seconds),
then give the user the `url` exactly. If the line is `"ok": false`, go to
troubleshooting with its `error.code`.

## 5. Tell the user what they will see

Say it in plain words, short:

- **Needs your answer**: questions from the executor that wait for you, how
  serious each is, and whether only you can answer.
- **Working now**: which task runs, at which stage (preparing, writing,
  checks, review, integrating), for how long, and how many attempts are used
  and left.
- **Health**: money spent so far against the budget (`≥` means at least,
  because some prices are unknown; `unknown` is never zero), whether the
  controller is alive, stalled attempts, and accepted results that changed
  afterwards.
- It is read-only: nothing they click changes the work.
- With a snapshot (`--view`), the page shows the moment of the snapshot.
  Offer to refresh it by rerunning the `$H view` lines.

## 6. Stop it

```sh
kill "$(cat "$VIEW_DIR/panel.pid")"
```

Ctrl-C works too when it runs in the foreground. Stopping the panel does
not affect harness work. For a terminal-only watch instead, use
`$H status --state <state> --human --watch` (harness alpha.54+).

## Troubleshooting

| Symptom (`error.code` or page text)     | Meaning                                              | Do                                                                                               |
| --------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PORT_BUSY`                             | the explicit port, or all of 4790–4809, are taken    | omit `--port`, or pick a free one; another panel may already be running: check `panel.pid` files |
| `HOST_NOT_LOOPBACK`                     | a non-local `--host` was passed                      | remove `--host`; never expose the panel                                                          |
| `View version N is not supported`       | harness and panel majors differ                      | install the panel version matching the harness; report both versions                             |
| "newer data, update the panel"          | harness added fields this panel ignores              | works; suggest updating the panel                                                                |
| `VIEW_UNAVAILABLE` / "not readable yet" | the view file is missing                             | rerun the `$H view` lines                                                                        |
| `HARNESS_VIEW_UNAVAILABLE`              | `--state` used with a panel or harness that lacks it | use the snapshot route (step 3)                                                                  |
| empty panel, "No state yet"             | nothing has run in this state directory              | normal before the first `harness run`                                                            |
| "The app bundle is not built"           | running from a source checkout                       | `npm run build` in the panel checkout                                                            |
