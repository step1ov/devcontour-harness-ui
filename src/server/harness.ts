// Live view route (`--state`): the view is computed by the harness the user
// installed, never by this package. `harness capabilities` decides whether
// the installed harness has `view` (0.1.0-alpha.55 or newer) and whether it
// takes `--lang`; `harness view --state <dir> [--policy <file>] [--lang ru|en]`
// prints the envelope `{ ok, data }` on stdout. The harness CLI prints JSON
// by default and has no `--json` flag, so none is passed.

import { execFile } from 'node:child_process';

export interface HarnessViewOptions {
  /** Harness executable: `harness` on PATH by default, or a path. */
  bin: string;
  state: string;
  policy?: string;
}

export interface HarnessSupport {
  /** Version from the capabilities catalog, when it names one. */
  version?: string;
  /** The catalog lists the `view` operation. */
  view: boolean;
  /** The `view` operation takes `lang` (plain strings in the requested language). */
  lang: boolean;
}

export class HarnessUnavailable extends Error {
  readonly code = 'HARNESS_VIEW_UNAVAILABLE';
}

const TIMEOUT_MS = 30_000;
// The view is at most 256 KB; the capabilities catalog carries JSON Schemas.
const MAX_BUFFER = 8 * 1024 * 1024;

interface Run {
  stdout: string;
  /** Exit code, or `undefined` when the process could not be started. */
  exit: number | undefined;
  spawnError?: string;
}

function run(bin: string, args: string[]): Promise<Run> {
  return new Promise((ok) => {
    execFile(
      bin,
      args,
      { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true },
      (err, stdout) => {
        if (!err) return ok({ stdout, exit: 0 });
        const e = err as NodeJS.ErrnoException & { code?: unknown; killed?: boolean };
        if (typeof e.code === 'number') return ok({ stdout, exit: e.code });
        ok({ stdout, exit: undefined, spawnError: e.killed ? 'timed out' : e.message });
      },
    );
  });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseEnvelope(stdout: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads `harness capabilities`. A harness that cannot be started or prints
 * no catalog is `HarnessUnavailable`; a catalog without `view` is reported
 * as `{ view: false }` so the caller can name the installed version.
 */
export async function probeHarness(bin: string): Promise<HarnessSupport> {
  const r = await run(bin, ['capabilities']);
  if (r.exit === undefined)
    throw new HarnessUnavailable(`Cannot start \`${bin} capabilities\`: ${r.spawnError}.`);
  const env = parseEnvelope(r.stdout);
  const data = env?.ok === true && isObject(env.data) ? env.data : undefined;
  if (!data)
    throw new HarnessUnavailable(`\`${bin} capabilities\` printed no capabilities catalog.`);
  const tools = Array.isArray(data.tools) ? data.tools : [];
  const view = tools.find((t) => isObject(t) && t.name === 'view') as
    { inputSchema?: { properties?: Record<string, unknown> } } | undefined;
  const props = view?.inputSchema?.properties;
  return {
    ...(typeof data.version === 'string' ? { version: data.version } : {}),
    view: view !== undefined,
    lang: isObject(props) && Object.hasOwn(props, 'lang'),
  };
}

export type HarnessViewResult =
  { ok: true; view: unknown } | { ok: false; code: string; message: string };

/** Runs `harness view` once; a harness refusal comes back as `{ ok: false }`. */
export async function harnessView(
  o: HarnessViewOptions,
  lang: 'ru' | 'en' | undefined,
): Promise<HarnessViewResult> {
  const args = ['view', '--state', o.state];
  if (o.policy !== undefined) args.push('--policy', o.policy);
  if (lang !== undefined) args.push('--lang', lang);
  const r = await run(o.bin, args);
  if (r.exit === undefined)
    return { ok: false, code: 'VIEW_UNAVAILABLE', message: `harness view: ${r.spawnError}.` };
  const env = parseEnvelope(r.stdout);
  if (env?.ok === true && 'data' in env) return { ok: true, view: env.data };
  const error = isObject(env?.error) ? env.error : undefined;
  const code = typeof error?.code === 'string' ? error.code : `exit ${r.exit}`;
  const message = typeof error?.message === 'string' ? error.message : 'no JSON envelope';
  return { ok: false, code: 'VIEW_UNAVAILABLE', message: `harness view: ${code}: ${message}` };
}
