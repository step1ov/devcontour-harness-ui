#!/usr/bin/env node
// devcontour-harness-ui CLI: serves the read-only operator panel on loopback.
// stdout: one JSON line once listening ({ ok, url, port, readOnly }) or an
// error envelope; human hints go to stderr. Exit codes follow the harness:
// 0 success, 2 invalid input, 3 refusal, 4 infrastructure.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ServeError, startServer } from './server/serve.ts';

/** Package root: the nearest ancestor whose package.json is this package. */
function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const file = join(dir, 'package.json');
    if (
      existsSync(file) &&
      JSON.parse(readFileSync(file, 'utf8')).name === 'devcontour-harness-ui'
    ) {
      return dir;
    }
    const up = dirname(dir);
    if (up === dir) throw new Error('package root of devcontour-harness-ui not found');
    dir = up;
  }
}

const usage = `Usage: devcontour-harness-ui (--view <file> | --demo) [--port N] [--host 127.0.0.1]

  --view <file>   operator view JSON (from \`harness view --json\`), re-read on each request
  --demo          serve the bundled sample view
  --state <dir>   planned: compute the view with \`harness view\` (not available yet)
  --port N        exact port; busy = error. Without it ports 4790-4809 are probed
  --host H        loopback only: 127.0.0.1 (default), ::1 or localhost
  --version       print the package version
`;

function fail(code: string, message: string, exit: number): never {
  process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n');
  process.stderr.write(message + '\n');
  process.exit(exit);
}

async function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        view: { type: 'string' },
        demo: { type: 'boolean' },
        state: { type: 'string' },
        policy: { type: 'string' },
        port: { type: 'string' },
        host: { type: 'string' },
        version: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      strict: true,
    }).values;
  } catch (err) {
    fail('INVALID_INPUT', (err as Error).message + '\n' + usage, 2);
  }
  const root = packageRoot();
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
  if (args.help) return void process.stdout.write(usage);
  if (args.version) return void process.stdout.write(version + '\n');
  if (args.state !== undefined || args.policy !== undefined) {
    fail(
      'HARNESS_VIEW_UNAVAILABLE',
      '--state/--policy need a harness release with `harness view --json` (proposed). ' +
        'Until then write the view to a file and pass --view <file>.',
      2,
    );
  }
  if (!args.view && !args.demo) fail('INVALID_INPUT', 'Pass --view <file> or --demo.\n' + usage, 2);
  const viewFile = args.view ? resolve(args.view) : join(root, 'fixtures', 'view.sample.json');
  const port = args.port === undefined ? undefined : Number(args.port);
  try {
    const server = await startServer({
      viewFile,
      appDir: join(root, 'dist', 'app'),
      ...(args.host ? { host: args.host } : {}),
      ...(port !== undefined ? { port } : {}),
      version,
    });
    process.stdout.write(
      JSON.stringify({ ok: true, url: server.url, port: server.port, readOnly: true, version }) +
        '\n',
    );
    process.stderr.write(`Harness panel (read-only): ${server.url}  — stop with Ctrl-C\n`);
    const stop = () => void server.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (err) {
    if (err instanceof ServeError) {
      fail(err.code, err.message, err.code === 'PORT_BUSY' ? 4 : 2);
    }
    fail('INFRASTRUCTURE', (err as Error).message, 4);
  }
}

void main();
