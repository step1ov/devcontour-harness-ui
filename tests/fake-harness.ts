// A fake `harness` executable for the live route tests. It answers
// `capabilities` like the real CLI (with or without `view`, with or without
// `lang`) and `view` with the sample fixture, recording its argv in a
// warning so a test can see which flags were passed.

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/view.sample.json', import.meta.url));
const workFixture = fileURLToPath(new URL('../fixtures/work.sample.json', import.meta.url));

export interface FakeHarness {
  bin: string;
  /** Where a hanging `view` writes its pid. */
  pidFile: string;
  /** Removes only the directory this helper created. */
  remove(): void;
}

export function fakeHarness(o: {
  view: boolean;
  lang: boolean;
  version?: string;
  /** `view` answers with this harness error envelope (exit 2). */
  refuse?: { code: string; message: string };
  /** Exit code after a success envelope (a misbehaving wrapper). */
  exitCode?: number;
  /** `view` and `capabilities` ignore SIGTERM and never answer. */
  hang?: boolean;
  /** `view` reads its overview from this file instead of the sample (a test changes it). */
  viewFile?: string;
  /** Each `view` run appends one line to this file (counts runs). */
  countFile?: string;
  /** `view` declares this viewVersion in its output schema (default 1); `null` = no schema. */
  viewVersion?: number | null;
  /** `view` takes `--window`. */
  window?: boolean;
  /** `view` refuses while this file exists (a test switches failures on and off). */
  refuseWhile?: string;
}): FakeHarness {
  const dir = mkdtempSync(join(tmpdir(), 'hui-fake-harness-'));
  const bin = join(dir, 'harness');
  const pidFile = join(dir, 'pid');
  const tools: Record<string, unknown>[] = [{ name: 'init', inputSchema: { properties: {} } }];
  const declared = o.viewVersion === undefined ? 1 : o.viewVersion;
  if (o.view)
    tools.push({
      name: 'view',
      inputSchema: {
        properties: {
          state: {},
          policy: {},
          ...(o.lang ? { lang: {} } : {}),
          ...(o.window ? { window: {} } : {}),
        },
      },
      ...(declared !== null
        ? {
            outputSchema: {
              anyOf: [
                {
                  type: 'object',
                  properties: { viewVersion: { type: 'number', const: declared } },
                },
                { type: 'object', properties: { work: {} } },
              ],
            },
          }
        : {}),
    });
  const script = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
const out = (v) => process.stdout.write(JSON.stringify(v) + '\\n');
const count = ${JSON.stringify(o.countFile ?? null)};
if (count && argv[0] === 'view') fs.appendFileSync(count, argv.join(' ') + '\\n');
if (${Boolean(o.hang)} && argv[0] !== '--version') {
  process.on('SIGTERM', () => {});
  fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
  setInterval(() => {}, 1000);
} else if (argv[0] === '--version') {
  out({ apiVersion: 'devcontour-harness/v1alpha1', command: 'version', ok: true,
    data: { harness: ${JSON.stringify(o.version ?? '0.1.0-alpha.55')}, apiVersion: 'devcontour-harness/v1alpha1' } });
} else if (argv[0] === 'capabilities') {
  out({ apiVersion: 'devcontour-harness/v1alpha1', command: 'capabilities', ok: true,
    data: { name: 'devcontour-harness', version: ${JSON.stringify(o.version ?? '0.1.0-alpha.55')},
      protocolVersion: 1, tools: ${JSON.stringify(tools)} } });
  process.exitCode = ${o.exitCode ?? 0};
} else if (argv[0] === 'view' && ${o.view}) {
  const refuseWhile = ${JSON.stringify(o.refuseWhile ?? null)};
  const refuse = refuseWhile && fs.existsSync(refuseWhile)
    ? { code: 'STATE_BUSY', message: 'state is busy' }
    : ${JSON.stringify(o.refuse ?? null)};
  if (refuse) {
    out({ apiVersion: 'devcontour-harness/v1alpha1', command: 'view', ok: false,
      error: { code: refuse.code, class: 'input', message: refuse.message, issues: [] } });
    process.exit(2);
  }
  const work = argv.find((a) => a.startsWith('--work='));
  if (work && work !== '--work=locale-format') {
    out({ apiVersion: 'devcontour-harness/v1alpha1', command: 'view', ok: false,
      error: { code: 'INVALID_INPUT', class: 'input', message: 'no work ' + work.slice(7), issues: [] } });
    process.exit(2);
  }
  const view = JSON.parse(fs.readFileSync(work ? ${JSON.stringify(workFixture)} : ${JSON.stringify(o.viewFile ?? fixture)}, 'utf8'));
  // The argv is recorded where each document has free text: a warning or the producer.
  if (work) view.source.producer = JSON.stringify(argv);
  else view.health.warnings = [{ code: 'ARGS', message: JSON.stringify(argv) }];
  out({ apiVersion: 'devcontour-harness/v1alpha1', command: 'view', ok: true, data: view });
  process.exitCode = ${o.exitCode ?? 0};
} else {
  out({ ok: false, error: { code: 'INVALID_INPUT', message: 'unknown command ' + argv[0] } });
  process.exit(2);
}
`;
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return {
    bin,
    pidFile,
    remove: () => {
      // Guard: only the directory mkdtemp made above, never a reported path.
      if (!dir.startsWith(join(tmpdir(), 'hui-fake-harness-'))) throw new Error('refusing rm');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** `view` runs the fake harness recorded in its `countFile`. */
export const runsIn = (countFile: string): string[] => {
  try {
    return readFileSync(countFile, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

/** The argv the fake harness recorded in the served view. */
export const recordedArgs = (view: { health: { warnings: { message: string }[] } }): string[] =>
  JSON.parse(view.health.warnings[0]!.message) as string[];
