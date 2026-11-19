# devcontour-harness-ui

Read-only operator panel for [devcontour-harness](https://github.com/step1ov/devcontour-harness).
It is two things:

- a React component library;
- a small standalone app that a local CLI serves on `127.0.0.1`.

Both render the harness _operator view_: one versioned JSON document that
the harness computes from its state and policy. The panel derives no
numbers of its own.

> Status: `0.1.0-alpha.0`, a scaffold. The Overview screen works from a
> view file. The live `--state` route waits for `harness view` /
> `harness serve-view`; see the [harness proposals](docs/harness-proposals.md).
> [Design](docs/design.md) covers the schema, the screens, security and the
> slices.

## Quick start

Requires Node.js ≥ 24.3.

```sh
npm install
npm test
npm run build
node dist/lib/cli.js --demo          # sample data
# → {"ok":true,"url":"http://127.0.0.1:4790/","port":4790,"readOnly":true,...}
```

Open the printed URL. To show a real project, write the view with a harness
that has `harness view` and serve the file:

```sh
harness view --state <state> --policy .harness/policy.json > envelope.json
# take `data` from the envelope into view.json
node dist/lib/cli.js --view view.json
```

CLI flags:

- `--view <file>` and `--demo`;
- `--port N` (exact; busy means an error). Without it, ports 4790–4809 are
  probed.
- `--host`, loopback only: `127.0.0.1`, `::1` or `localhost`. Anything else
  is refused.

stdout gets one JSON line, and hints go to stderr. Exit codes are 0, 2
(input), 3 (refusal) and 4 (infrastructure).

The skill [`skills/harness-ui/SKILL.md`](skills/harness-ui/SKILL.md) lets a
project's lead agent start the panel and explain it to the user.

## Embedding

```tsx
import { Overview, staticViewSource, checkView } from 'devcontour-harness-ui';
import 'devcontour-harness-ui/styles.css';

<Overview view={view} onOpenWork={(id) => navigate(id)} />;
```

- Components take the view as a prop and never fetch.
- Hosts implement `ViewSource` over their own store.
- Theming is done with `--hui-*` CSS variables on an ancestor element.

`devcontour-harness-ui/model` exports the types, `checkView` and the data
sources without React.

## Security

- Loopback only, with no override.
- The `Host` header must name the loopback listener.
- GET and HEAD only.
- A strict CSP.
- No telemetry and no outbound requests.

The view contains no prompts, logs, tokens or absolute paths; see design §9.

## License

MIT
