// Live view route (`--state`): the view is computed by the harness the user
// installed, never by this package. `harness capabilities` decides whether
// the installed harness has `view` (0.1.0-alpha.55 or newer) and whether it
// takes `--lang`; `harness view --state <dir> [--policy <file>] [--lang ru|en]`
// prints the envelope `{ ok, data }` on stdout. The harness CLI prints JSON
// by default and has no `--json` flag, so none is passed.

import { spawn, type ChildProcess } from 'node:child_process';

export interface HarnessViewOptions {
  /** Harness executable: `harness` on PATH by default, or a path. */
  bin: string;
  state: string;
  policy?: string;
  /** History window passed as `--window` (`24h` or `7d`); absent = the harness default (24 h). */
  window?: string;
  /** Deadline of one harness run; default 30 s. */
  timeoutMs?: number;
}

export interface HarnessSupport {
  /** Version from the capabilities catalog, when it names one. */
  version?: string;
  /** The catalog lists the `view` operation. */
  view: boolean;
  /** The `view` operation takes `lang` (plain strings in the requested language). */
  lang: boolean;
  /** The `view` operation takes `window` (history window). */
  window: boolean;
  /** `viewVersion` the `view` operation declares in its output schema, when it names one. */
  viewVersion?: number;
}

export class HarnessUnavailable extends Error {
  readonly code = 'HARNESS_VIEW_UNAVAILABLE';
}

const TIMEOUT_MS = 30_000;
/** After SIGTERM, how long a run may take to exit before SIGKILL. */
const KILL_GRACE_MS = 2_000;
// The view is at most 256 KB; the capabilities catalog carries JSON Schemas.
const MAX_BUFFER = 8 * 1024 * 1024;
const posix = process.platform !== 'win32';

interface Run {
  stdout: string;
  /** Exit code, or `undefined` when the process could not be started or finish. */
  exit: number | undefined;
  spawnError?: string;
}

/** Harness runs still alive; `stopHarnessRuns` ends them on shutdown. */
const active = new Set<ChildProcess>();

function signal(child: ChildProcess, sig: NodeJS.Signals) {
  try {
    // The run is its own process group, so a wrapper (sh, npx) and its
    // children go with it.
    if (posix && child.pid !== undefined) process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch {
    // Already gone.
  }
}

/** SIGTERM now, SIGKILL after the grace period if it is still running. */
function terminate(child: ChildProcess) {
  signal(child, 'SIGTERM');
  const t = setTimeout(() => signal(child, 'SIGKILL'), KILL_GRACE_MS);
  t.unref();
  child.once('exit', () => clearTimeout(t));
}

/**
 * Terminates every running harness process (panel shutdown) and resolves
 * once they exited; one that ignores SIGTERM is killed after the grace period.
 */
export function stopHarnessRuns(): Promise<void> {
  const exits = [...active].map(
    (child) =>
      new Promise<void>((ok) => {
        if (child.exitCode !== null || child.signalCode !== null) return ok();
        const t = setTimeout(ok, KILL_GRACE_MS + 1_000);
        child.once('exit', () => {
          clearTimeout(t);
          ok();
        });
        terminate(child);
      }),
  );
  return Promise.all(exits).then(() => undefined);
}

/**
 * Runs the harness with a hard deadline: the promise settles at the deadline
 * even if the process ignores SIGTERM (it is then killed after a grace period).
 */
function run(bin: string, args: string[], timeoutMs = TIMEOUT_MS): Promise<Run> {
  return new Promise((ok) => {
    let settled = false;
    const done = (r: Run) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      ok(r);
    };
    let child: ChildProcess;
    try {
      child = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'ignore'],
        detached: posix,
        windowsHide: true,
      });
    } catch (err) {
      ok({ stdout: '', exit: undefined, spawnError: (err as Error).message });
      return;
    }
    active.add(child);
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout!.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BUFFER) {
        terminate(child);
        done({ stdout: '', exit: undefined, spawnError: 'output exceeds 8 MB' });
      } else chunks.push(c);
    });
    const deadline = setTimeout(() => {
      terminate(child);
      done({ stdout: '', exit: undefined, spawnError: `timed out after ${timeoutMs} ms` });
    }, timeoutMs);
    child.once('error', (err) => {
      active.delete(child);
      done({ stdout: '', exit: undefined, spawnError: err.message });
    });
    child.once('close', (code, sig) => {
      active.delete(child);
      const stdout = Buffer.concat(chunks).toString('utf8');
      if (code === null)
        done({ stdout, exit: undefined, spawnError: `terminated by ${sig ?? 'a signal'}` });
      else done({ stdout, exit: code });
    });
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
  const data = r.exit === 0 && env?.ok === true && isObject(env.data) ? env.data : undefined;
  if (!data)
    throw new HarnessUnavailable(`\`${bin} capabilities\` printed no capabilities catalog.`);
  const tools = Array.isArray(data.tools) ? data.tools : [];
  const view = tools.find((t) => isObject(t) && t.name === 'view') as
    { inputSchema?: { properties?: Record<string, unknown> }; outputSchema?: unknown } | undefined;
  const props = view?.inputSchema?.properties;
  const viewVersion = declaredViewVersion(view?.outputSchema);
  return {
    ...(typeof data.version === 'string' ? { version: data.version } : {}),
    view: view !== undefined,
    lang: isObject(props) && Object.hasOwn(props, 'lang'),
    window: isObject(props) && Object.hasOwn(props, 'window'),
    ...(viewVersion !== undefined ? { viewVersion } : {}),
  };
}

/**
 * The `viewVersion` constant of the `view` output schema: the overview branch
 * (`properties.viewVersion.const`) of a plain object or `anyOf`/`oneOf` schema.
 */
function declaredViewVersion(schema: unknown): number | undefined {
  if (!isObject(schema)) return undefined;
  const branches = [
    schema,
    ...(['anyOf', 'oneOf'] as const).flatMap((k) =>
      Array.isArray(schema[k]) ? (schema[k] as unknown[]) : [],
    ),
  ];
  for (const b of branches) {
    const props = isObject(b) && isObject(b.properties) ? b.properties : undefined;
    const v = props && isObject(props.viewVersion) ? props.viewVersion.const : undefined;
    if (typeof v === 'number' && Number.isInteger(v)) return v;
  }
  return undefined;
}

/** `harness --version`: the version from its envelope, or `undefined` when it does not answer. */
export async function harnessVersion(bin: string): Promise<string | undefined> {
  const r = await run(bin, ['--version']);
  const env = r.exit === 0 ? parseEnvelope(r.stdout) : undefined;
  const data = env?.ok === true && isObject(env.data) ? env.data : undefined;
  return typeof data?.harness === 'string' ? data.harness : undefined;
}

export type HarnessViewResult =
  { ok: true; view: unknown } | { ok: false; code: string; message: string };

/**
 * Runs `harness view` once (`--work <id>` for the work detail document); a
 * harness refusal comes back as `{ ok: false }`. The work id is passed as
 * `--work=<id>` so an id can never be read as another flag.
 */
export async function harnessView(
  o: HarnessViewOptions,
  lang: 'ru' | 'en' | undefined,
  workId?: string,
): Promise<HarnessViewResult> {
  const args = ['view', '--state', o.state];
  if (o.policy !== undefined) args.push('--policy', o.policy);
  if (lang !== undefined) args.push('--lang', lang);
  if (o.window !== undefined) args.push('--window', o.window);
  if (workId !== undefined) args.push(`--work=${workId}`);
  const r = await run(o.bin, args, o.timeoutMs);
  if (r.exit === undefined)
    return { ok: false, code: 'VIEW_UNAVAILABLE', message: `harness view: ${r.spawnError}.` };
  const env = parseEnvelope(r.stdout);
  // Success needs both: exit 0 and a success envelope.
  if (r.exit === 0 && env?.ok === true && 'data' in env) return { ok: true, view: env.data };
  const error = isObject(env?.error) ? env.error : undefined;
  const code = typeof error?.code === 'string' && env?.ok === false ? error.code : `exit ${r.exit}`;
  const message =
    env?.ok === false && typeof error?.message === 'string'
      ? error.message
      : env?.ok === true
        ? 'a success envelope with a nonzero exit'
        : 'no JSON envelope';
  return { ok: false, code: 'VIEW_UNAVAILABLE', message: `harness view: ${code}: ${message}` };
}
