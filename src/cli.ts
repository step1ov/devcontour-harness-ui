#!/usr/bin/env node
// devcontour-harness-ui CLI: serves the read-only operator panel on loopback.
// stdout: one JSON line once listening ({ ok, url, port, readOnly }) or an
// error envelope; human hints go to stderr. Exit codes follow the harness:
// 0 success, 2 invalid input, 3 refusal, 4 infrastructure.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { langOf } from './model/i18n.ts';
import { HarnessUnavailable, probeHarness } from './server/harness.ts';
import { ServeError, startServer, type ServeOptions } from './server/serve.ts';

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

const usage = `Usage: devcontour-harness-ui (--view <file> | --demo | --state <dir> [--policy <file>])
                            [--lang ru|en] [--harness <bin>] [--port N] [--host 127.0.0.1]

  --view <file>    operator view JSON (from \`harness view\`), re-read on each request
  --demo           serve the bundled sample view
  --state <dir>    compute the view with the installed \`harness view\` on each request
                   (devcontour-harness 0.1.0-alpha.55 or newer)
  --policy <file>  policy for --state; needed while the state has no binding
  --lang ru|en     language of harness texts when the page does not ask for one;
                   default from LC_ALL, LC_MESSAGES or LANG
  --harness <bin>  harness executable for --state (default: harness on PATH)
  --port N         exact port; busy = error. Without it ports 4790-4809 are probed
  --host H         loopback only: 127.0.0.1 (default), ::1 or localhost
  --version        print the package version
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
        lang: { type: 'string' },
        harness: { type: 'string' },
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
  if (args.lang !== undefined && args.lang !== 'ru' && args.lang !== 'en')
    fail('INVALID_INPUT', `--lang: expected ru or en, got ${args.lang}.`, 2);
  const sources = [args.view !== undefined, args.demo === true, args.state !== undefined];
  if (sources.filter(Boolean).length > 1)
    fail('INVALID_INPUT', 'Pass only one of --view, --demo and --state.\n' + usage, 2);
  if (args.policy !== undefined && args.state === undefined)
    fail('INVALID_INPUT', '--policy needs --state.\n' + usage, 2);
  if (args.harness !== undefined && args.state === undefined)
    fail('INVALID_INPUT', '--harness needs --state.\n' + usage, 2);
  if (!sources.some(Boolean))
    fail('INVALID_INPUT', 'Pass --view <file>, --demo or --state <dir>.\n' + usage, 2);
  const lang =
    args.lang === 'ru' || args.lang === 'en'
      ? args.lang
      : langOf(
          [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find(
            (v) => typeof v === 'string' && v.trim() !== '',
          ),
        );
  let source: Pick<ServeOptions, 'viewFile' | 'harness' | 'workFiles' | 'localized'>;
  if (args.state !== undefined) {
    const bin = args.harness ?? 'harness';
    let support;
    try {
      support = await probeHarness(bin);
    } catch (err) {
      if (!(err instanceof HarnessUnavailable)) throw err;
      fail(
        'HARNESS_VIEW_UNAVAILABLE',
        `${err.message} --state needs devcontour-harness 0.1.0-alpha.55 or newer ` +
          '(pass --harness <bin> if it is not on PATH), or write the view to a file and pass --view <file>.',
        2,
      );
    }
    if (!support.view)
      fail(
        'HARNESS_VIEW_UNAVAILABLE',
        `The installed harness${support.version ? ' ' + support.version : ''} has no \`harness view\`. ` +
          '--state needs devcontour-harness 0.1.0-alpha.55 or newer; until then write the view ' +
          'to a file and pass --view <file>.',
        2,
      );
    source = {
      harness: {
        bin,
        state: resolve(args.state),
        ...(args.policy !== undefined ? { policy: resolve(args.policy) } : {}),
        lang: support.lang,
        defaultLang: lang,
      },
    };
  } else {
    if (args.view) source = { viewFile: resolve(args.view) };
    else {
      // The demo: the checkout's fixtures, or their copy in the package (dist/demo).
      const demo = existsSync(join(root, 'fixtures', 'view.sample.json'))
        ? join(root, 'fixtures')
        : join(root, 'dist', 'demo');
      // English files by default; Russian ones (harness texts in Russian) for `?lang=ru`.
      const files = (dir: string) => ({
        viewFile: join(dir, 'view.sample.json'),
        workFiles: {
          'locale-format': join(dir, 'work.sample.json'),
          'add-greeting': join(dir, 'work.accepted.sample.json'),
        },
      });
      source = { ...files(demo), localized: { ru: files(join(demo, 'ru')) } };
    }
  }
  const port = args.port === undefined ? undefined : Number(args.port);
  try {
    const server = await startServer({
      ...source,
      appDir: join(root, 'dist', 'app'),
      lang,
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
