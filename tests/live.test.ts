// Live updates (slice S3): /api/events pushes a change of the content token,
// confirms unchanged checks on the live route, reports a failing harness as
// stale, backs off while nothing changes, and runs nothing at all while no
// page holds a stream.

import { strict as assert } from 'node:assert';
import { request, type IncomingMessage } from 'node:http';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  contentToken,
  digestOf,
  fileDigestOf,
  localDigestOf,
  startServer,
  type RunningServer,
} from '../src/server/serve.ts';
import { MAX_BUFFERED, MAX_STREAMS, writeEvent } from '../src/server/live.ts';
import { MAX_RUNS, RECENT_MAX, RecentCache } from '../src/server/serve.ts';
import { fakeHarness, runsIn } from './fake-harness.ts';

const sample = fileURLToPath(new URL('../fixtures/view.sample.json', import.meta.url));
const appDir = mkdtempSync(join(tmpdir(), 'hui-live-app-'));
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** A scratch directory this test made; removed only by its own path. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'hui-live-'));
  return {
    dir,
    remove: () => {
      if (!dir.startsWith(join(tmpdir(), 'hui-live-'))) throw new Error('refusing rm');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Writes the sample view for a "state" named `content` (a question title
 * differs); `clock` moves only the projection clock fields, which are not a
 * change. By default the document is what harness alpha.55 sends (revision
 * 0): its `source.token` also hashes the clock, so it differs on every run.
 * `revision: 1` is harness alpha.56: the token depends on the content only.
 */
function writeView(
  file: string,
  content: string,
  clock = '2026-11-19T10:00:00.000Z',
  revision: 0 | 1 = 0,
  token = 'harness-token-' + content,
) {
  const v = JSON.parse(readFileSync(sample, 'utf8'));
  v.questions[0].title = 'Q ' + content;
  v.generatedAt = clock;
  v.history.to = clock;
  if (revision === 0) {
    v.viewRevision = 0;
    for (const q of v.questions) delete q.answerBasis;
    delete v.history.totals;
    v.source.token = 'harness-token-' + content + clock;
  } else {
    v.viewRevision = 1;
    v.source.token = token;
  }
  writeFileSync(file, JSON.stringify(v));
}
/** The identity the server gives a revision 1 document with this harness token. */
const harnessId = (token: string) => 'harness:' + createHash('sha256').update(token).digest('hex');
/** The digest the server reports for the file as written now. */
const digestNow = (file: string) => fileDigestOf(JSON.parse(readFileSync(file, 'utf8')));

/** One request on its own connection (no keep-alive across servers on a reused port). */
function http(url: string, method = 'GET') {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (ok, fail) => {
      const req = request(url, { method, agent: false }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body }));
      });
      req.on('error', fail);
      req.end();
    },
  );
}

interface Event {
  event: string;
  data: Record<string, unknown>;
  at: number;
}

/** A raw SSE client: collects events; `next` waits for one of a kind. */
function stream(url: string) {
  const events: Event[] = [];
  const waiters: (() => void)[] = [];
  let res: IncomingMessage | undefined;
  const opened = new Promise<IncomingMessage>((ok, fail) => {
    const req = request(url, { agent: false, headers: { accept: 'text/event-stream' } }, (r) => {
      res = r;
      let buf = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev && data) {
            events.push({ event: ev, data: JSON.parse(data), at: Date.now() });
            waiters.splice(0).forEach((w) => w());
          }
        }
      });
      ok(r);
    });
    req.on('error', fail);
    req.end();
  });
  return {
    opened,
    events,
    async next(kind: string, timeoutMs = 5000, after = 0): Promise<Event> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = events.slice(after).find((e) => e.event === kind);
        if (found) return found;
        const left = deadline - Date.now();
        if (left <= 0)
          throw new Error(`no ${kind} event in ${timeoutMs} ms: ${JSON.stringify(events)}`);
        await Promise.race([new Promise<void>((ok) => waiters.push(ok)), sleep(left)]);
      }
    },
    close: () => res?.destroy(),
  };
}

async function waitFor(cond: () => boolean, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) return false;
    await sleep(20);
  }
  return true;
}

function liveSetup(o: { refuseWhile?: string; hang?: boolean; timeoutMs?: number } = {}) {
  const s = scratch();
  const viewFile = join(s.dir, 'view.json');
  const countFile = join(s.dir, 'runs');
  const state = join(s.dir, 'state');
  writeView(viewFile, 'token-a');
  const fake = fakeHarness({
    view: true,
    lang: true,
    viewFile,
    countFile,
    ...(o.refuseWhile ? { refuseWhile: o.refuseWhile } : {}),
    ...(o.hang ? { hang: true } : {}),
  });
  return {
    ...s,
    viewFile,
    countFile,
    state,
    fake,
    start: (intervals?: { minMs: number; maxMs: number; activeMaxMs: number }) =>
      startServer({
        harness: {
          bin: fake.bin,
          state,
          lang: true,
          defaultLang: 'en',
          ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
        },
        appDir,
        version: 'test',
        ...(intervals ? { liveIntervals: intervals } : {}),
      }),
    cleanup() {
      fake.remove();
      s.remove();
    },
  };
}

test('live route: no page, no harness run; a stream checks at once and stops with the page', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    server = await l.start({ minMs: 100, maxMs: 200, activeMaxMs: 100 });
    await sleep(1200);
    assert.deepEqual(runsIn(l.countFile), [], 'no harness run without a page');
    assert.deepEqual(server.live(), { watches: 0, streams: 0, checks: 0, hints: 0 });
    const es = stream(server.url + 'api/events?lang=ru');
    const first = await es.next('view');
    const a = first.data.token;
    assert.match(String(a), /^[0-9a-f]{64}$/);
    assert.ok(!Number.isNaN(Date.parse(String(first.data.checkedAt))));
    assert.match(runsIn(l.countFile)[0]!, /^view --state .* --lang ru$/);
    // Unchanged content is confirmed, not pushed as a change.
    const fresh = await es.next('fresh');
    assert.equal(fresh.data.token, a);
    es.close();
    assert.ok(await waitFor(() => server!.live().watches === 0, 2000), 'watch ends with the page');
    await sleep(100); // a check already running may finish
    const after = runsIn(l.countFile).length;
    await sleep(800);
    assert.equal(runsIn(l.countFile).length, after, 'no harness run after the page left');
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('live route: a state change reaches the stream within 2 s at the default intervals', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    server = await l.start();
    const es = stream(server.url + 'api/events');
    await es.next('view');
    const seen = es.events.length;
    // Let the watch back off past its first interval, then write the "state".
    await sleep(2500);
    writeView(l.viewFile, 'token-b');
    // The store write: the hint (state.sqlite mtime) checks at once.
    mkdirSync(l.state, { recursive: true });
    writeFileSync(join(l.state, 'state.sqlite'), 'x');
    const changedAt = Date.now();
    const changed = await es.next('view', 4000, seen);
    assert.notEqual(changed.data.token, es.events[0]!.data.token);
    assert.ok(changed.at - changedAt <= 2000, `pushed after ${changed.at - changedAt} ms`);
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('live route: checks back off while nothing changes and reset after a change', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    server = await l.start({ minMs: 100, maxMs: 800, activeMaxMs: 800 });
    const es = stream(server.url + 'api/events');
    await es.next('view');
    await sleep(2000);
    // 100, 200, 400, 800, 800 … ≈ 4–5 checks in 2 s (a fixed 100 ms would be ~15).
    const idle = runsIn(l.countFile).length;
    assert.ok(idle >= 3 && idle <= 7, `idle runs: ${idle}`);
    const gaps = es.events
      .filter((e) => e.event === 'fresh' || e.event === 'view')
      .map((e, i, a) => (i ? e.at - a[i - 1]!.at : 0))
      .slice(1);
    assert.ok(gaps.at(-1)! > gaps[0]! * 2, `gaps grow: ${gaps.join(',')}`);
    // A change resets the interval: the next confirmation comes after minMs, not 800 ms.
    const n = es.events.length;
    writeView(l.viewFile, 'token-c');
    mkdirSync(l.state, { recursive: true });
    writeFileSync(join(l.state, 'state.sqlite'), 'y');
    const changed = await es.next('view', 3000, n);
    const fresh = await es.next('fresh', 3000, es.events.indexOf(changed) + 1);
    assert.ok(fresh.at - changed.at < 500, `after a change: ${fresh.at - changed.at} ms`);
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('live route: a failing harness is stale with the first failure time, then recovers', async () => {
  const s = scratch();
  const flag = join(s.dir, 'refuse');
  const l = liveSetup({ refuseWhile: flag });
  let server: RunningServer | undefined;
  try {
    writeFileSync(flag, '');
    server = await l.start({ minMs: 100, maxMs: 200, activeMaxMs: 200 });
    const es = stream(server.url + 'api/events');
    const a = await es.next('stale');
    assert.equal(a.data.code, 'VIEW_UNAVAILABLE');
    assert.match(String(a.data.message), /STATE_BUSY: state is busy/);
    const n = es.events.length;
    const b = await es.next('stale', 3000, n);
    // The streak keeps its first failure time.
    assert.equal(b.data.since, a.data.since);
    assert.ok(Date.parse(String(b.data.checkedAt)) > Date.parse(String(a.data.checkedAt)));
    // No view was ever sent while failing: unknown is never shown as current.
    assert.equal(es.events.filter((e) => e.event === 'view').length, 0);
    unlinkSync(flag);
    const ok = await es.next('view', 3000);
    assert.match(String(ok.data.token), /^[0-9a-f]{64}$/);
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
    s.remove();
  }
});

test('live route: a harness that hangs past the deadline is stale (timed out)', async () => {
  const l = liveSetup({ hang: true, timeoutMs: 300 });
  let server: RunningServer | undefined;
  try {
    server = await l.start({ minMs: 100, maxMs: 200, activeMaxMs: 200 });
    const es = stream(server.url + 'api/events');
    const stale = await es.next('stale', 5000);
    assert.match(String(stale.data.message), /timed out after 300 ms/);
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('live route: the GET right after a pushed change reuses that harness run', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    server = await l.start({ minMs: 60_000, maxMs: 60_000, activeMaxMs: 60_000 });
    const es = stream(server.url + 'api/events?lang=en');
    const pushed = await es.next('view');
    assert.equal(runsIn(l.countFile).length, 1);
    const r = await http(server.url + 'api/view?lang=en');
    assert.equal(r.status, 200);
    assert.equal(digestOf(JSON.parse(r.body)), pushed.data.token, 'the pushed document is served');
    // The page learns the identity of what it shows from the response.
    assert.equal(r.headers['x-hui-digest'], pushed.data.token);
    assert.equal(runsIn(l.countFile).length, 1, 'no second run for the GET');
    await sleep(1600);
    await http(server.url + 'api/view?lang=en');
    assert.equal(runsIn(l.countFile).length, 2, 'an older result is not reused');
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('file route: a rewritten file is pushed; a missing one is stale; restoring it is said', async () => {
  const s = scratch();
  const file = join(s.dir, 'view.json');
  writeView(file, 'file-a');
  const server = await startServer({ viewFile: file, appDir, version: 'test' });
  try {
    const health = JSON.parse((await http(server.url + 'api/health')).body) as { live: string };
    assert.equal(health.live, 'file');
    const es = stream(server.url + 'api/events');
    const a = (await es.next('view')).data.token;
    assert.equal(a, digestNow(file));
    assert.equal((await http(server.url + 'api/view')).headers['x-hui-digest'], a);
    const n = es.events.length;
    writeView(file, 'file-b');
    const b = digestNow(file);
    // Another mtime even on a coarse clock.
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const t0 = Date.now();
    const changed = await es.next('view', 3000, n);
    assert.equal(changed.data.token, b);
    assert.ok(Date.now() - t0 <= 2000);
    // A new generatedAt alone is a new snapshot: the snapshot time is its content.
    const v = JSON.parse(readFileSync(file, 'utf8'));
    v.generatedAt = '2026-11-19T11:00:00.000Z';
    const before = es.events.length;
    writeFileSync(file, JSON.stringify(v));
    utimesSync(file, new Date(), new Date(Date.now() + 10000));
    const snap = await es.next('view', 3000, before);
    assert.notEqual(snap.data.token, b);
    assert.equal(
      es.events.filter((e) => e.event === 'fresh').length,
      0,
      'no fresh while unchanged',
    );
    const saved = readFileSync(file);
    unlinkSync(file);
    const stale = await es.next('stale', 3000);
    assert.match(String(stale.data.message), /not readable/);
    // The same bytes back: no change, but the recovery is said (fresh), or the
    // page would keep its stale warning forever.
    const m = es.events.length;
    writeFileSync(file, saved);
    const back = await es.next('fresh', 3000, m);
    assert.equal(back.data.token, snap.data.token);
    es.close();
  } finally {
    await server.close();
    s.remove();
  }
});

test('/api/events: HEAD, unknown work ids, the stream cap and shutdown', async () => {
  const server = await startServer({
    viewFile: sample,
    workFiles: {},
    appDir,
    version: 'test',
  });
  const open: ReturnType<typeof stream>[] = [];
  try {
    const head = await http(server.url + 'api/events', 'HEAD');
    assert.equal(head.status, 200);
    assert.match(String(head.headers['content-type']), /^text\/event-stream/);
    assert.equal(head.headers['cache-control'], 'no-store');
    assert.ok(head.headers['content-security-policy']);
    assert.equal((await http(server.url + 'api/events?work=../x')).status, 404);
    // A file view without that work has nothing to watch.
    assert.equal((await http(server.url + 'api/events?work=nope')).status, 503);
    for (let i = 0; i < MAX_STREAMS; i++) {
      const es = stream(server.url + 'api/events');
      open.push(es);
      await es.opened;
    }
    assert.ok(await waitFor(() => server.live().streams === MAX_STREAMS, 2000));
    const over = await http(server.url + 'api/events');
    assert.equal(over.status, 503);
    // All streams share one watch of the file.
    assert.equal(server.live().watches, 1);
  } finally {
    await server.close();
  }
  assert.deepEqual(
    { ...server.live(), checks: 0, hints: 0 },
    { watches: 0, streams: 0, checks: 0, hints: 0 },
  );
  for (const es of open) es.close();
});

test('live route: a run that differs only in the clock fields is fresh, not a change', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    server = await l.start({ minMs: 100, maxMs: 100, activeMaxMs: 100 });
    const es = stream(server.url + 'api/events');
    const first = await es.next('view');
    // Another projection clock: generatedAt, source.token and the window end move.
    writeView(l.viewFile, 'token-a', '2026-11-19T10:00:40.000Z');
    const n = es.events.length;
    await sleep(600);
    const later = es.events.slice(n).filter((e) => e.event !== 'ping');
    assert.ok(later.length >= 2, JSON.stringify(later));
    assert.ok(later.every((e) => e.event === 'fresh' && e.data.token === first.data.token));
    // A real change is still a change.
    writeView(l.viewFile, 'token-z', '2026-11-19T10:00:40.000Z');
    const changed = await es.next('view', 2000, es.events.length);
    assert.notEqual(changed.data.token, first.data.token);
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('live route on alpha.56: equal tokens are fresh, a new token is a change, the GET matches', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    writeView(l.viewFile, 'r1-a', '2026-11-19T10:00:00.000Z', 1);
    server = await l.start({ minMs: 100, maxMs: 100, activeMaxMs: 100 });
    const es = stream(server.url + 'api/events?lang=en');
    const first = await es.next('view');
    assert.equal(first.data.token, harnessId('harness-token-r1-a'));
    const r = await http(server.url + 'api/view?lang=en');
    assert.equal(r.headers['x-hui-digest'], first.data.token, 'the page learns the same identity');
    // Another projection clock, and the window moved by hours, not a minute:
    // the alpha.55 digest would call this a change; the content token does not.
    writeView(l.viewFile, 'r1-a', '2026-11-19T13:30:00.000Z', 1);
    const n = es.events.length;
    await sleep(600);
    const later = es.events.slice(n).filter((e) => e.event !== 'ping');
    assert.ok(later.length >= 2, JSON.stringify(later));
    assert.ok(later.every((e) => e.event === 'fresh' && e.data.token === first.data.token));
    // The harness says the content changed: a change, with its token.
    writeView(l.viewFile, 'r1-b', '2026-11-19T13:30:00.000Z', 1);
    const changed = await es.next('view', 2000, es.events.length);
    assert.equal(changed.data.token, harnessId('harness-token-r1-b'));
    const after = await http(server.url + 'api/view?lang=en');
    assert.equal(after.headers['x-hui-digest'], changed.data.token, 'GET follows the change');
    // Any token string, even one a header cannot carry raw, gives the same
    // identity on the stream and in the header.
    for (const odd of ['aa11 ', 'токен', 'a\nb', ' ']) {
      writeView(l.viewFile, 'r1-odd', '2026-11-19T13:30:00.000Z', 1, odd);
      const pushed = await es.next('view', 2000, es.events.length);
      assert.equal(pushed.data.token, harnessId(odd), JSON.stringify(odd));
      const got = await http(server.url + 'api/view?lang=en');
      assert.equal(got.status, 200, JSON.stringify(odd));
      assert.equal(got.headers['x-hui-digest'], pushed.data.token, JSON.stringify(odd));
    }
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('live route across harness versions: 55 uses the local digest, 56 the token, back to 55 again', async () => {
  const l = liveSetup();
  let server: RunningServer | undefined;
  try {
    server = await l.start({ minMs: 100, maxMs: 100, activeMaxMs: 100 });
    const es = stream(server.url + 'api/events');
    const first = await es.next('view');
    assert.match(String(first.data.token), /^[0-9a-f]{64}$/, 'a local digest, not the token');
    // Same content, another clock: the alpha.55 token changed, the digest did not.
    writeView(l.viewFile, 'token-a', '2026-11-19T10:00:30.000Z');
    let n = es.events.length;
    await sleep(400);
    const quiet = es.events.slice(n).filter((e) => e.event !== 'ping');
    assert.ok(quiet.length >= 1, 'checks did run');
    assert.ok(
      quiet.every((e) => e.event === 'fresh'),
      JSON.stringify(quiet),
    );
    // An upgrade to alpha.56 is one change (another identity), then stable.
    writeView(l.viewFile, 'token-a', '2026-11-19T10:00:30.000Z', 1);
    const upgraded = await es.next('view', 2000, es.events.length);
    assert.equal(upgraded.data.token, harnessId('harness-token-token-a'));
    assert.equal(
      (await http(server.url + 'api/view')).headers['x-hui-digest'],
      upgraded.data.token,
    );
    // A rollback to alpha.55: the local digest again, equal to the first one
    // (same content), and the GET agrees.
    writeView(l.viewFile, 'token-a', '2026-11-19T10:00:50.000Z');
    const back = await es.next('view', 2000, es.events.length);
    assert.equal(back.data.token, first.data.token);
    assert.equal((await http(server.url + 'api/view')).headers['x-hui-digest'], back.data.token);
    n = es.events.length;
    await sleep(400);
    const stable = es.events.slice(n).filter((e) => e.event !== 'ping');
    assert.ok(
      stable.length >= 1 && stable.every((e) => e.event === 'fresh'),
      JSON.stringify(stable),
    );
    es.close();
  } finally {
    await server?.close();
    l.cleanup();
  }
});

test('digestOf of an alpha.55 document ignores the clock within a minute, not across one', () => {
  const v = JSON.parse(readFileSync(sample, 'utf8'));
  v.viewRevision = 0;
  v.history.from = '2026-11-18T10:00:01.000Z';
  v.history.to = '2026-11-19T10:00:01.000Z';
  const d = digestOf(v);
  const moved = structuredClone(v);
  moved.generatedAt = '2030-01-01T00:00:00.000Z';
  moved.source.token = 'other';
  moved.history.from = '2026-11-18T10:00:59.999Z';
  moved.history.to = '2026-11-19T10:00:59.999Z';
  assert.equal(digestOf(moved), d);
  // The window labels the History screen shows move with the minute.
  const offset = structuredClone(v);
  offset.history.to = '2026-11-19T10:00:01.000+01:00';
  assert.notEqual(digestOf(offset), d, 'an offset an hour away is another instant');
  const sameInstant = structuredClone(v);
  sameInstant.history.to = '2026-11-19T11:00:30.000+01:00';
  assert.equal(digestOf(sameInstant), d, 'the same minute written with an offset');
  const nextMinute = structuredClone(v);
  nextMinute.history.to = '2026-11-19T10:01:00.000Z';
  assert.notEqual(digestOf(nextMinute), d);
  const changed = structuredClone(v);
  changed.history.load[0] = (changed.history.load[0] ?? 0) + 1;
  assert.notEqual(digestOf(changed), d);
  const producer = structuredClone(v);
  producer.source.producerVersion = 'x';
  assert.notEqual(digestOf(producer), d);
  // Revision 0 never trusts the harness token: it is the local digest.
  assert.equal(contentToken(v), undefined);
  assert.equal(d, localDigestOf(v));
  assert.match(d, /^[0-9a-f]{64}$/);
});

test('digestOf of an alpha.56 document is the harness content token, nothing else', () => {
  const v = JSON.parse(readFileSync(sample, 'utf8'));
  v.viewRevision = 1;
  v.source.token = 'aa11';
  const id = harnessId('aa11');
  assert.equal(digestOf(v), id);
  // Clock fields and even content the token does not change are not a change:
  // the harness owns the identity from revision 1.
  const clock = structuredClone(v);
  clock.generatedAt = '2030-01-01T00:00:00.000Z';
  clock.history.to = '2030-01-01T00:00:00.000Z';
  assert.equal(digestOf(clock), id);
  const sameToken = structuredClone(v);
  sameToken.questions[0].title = 'another title, same token';
  assert.equal(digestOf(sameToken), id, 'the token, not a local hash, decides');
  const other = structuredClone(v);
  other.source.token = 'bb22';
  assert.equal(digestOf(other), harnessId('bb22'));
  // Any later revision keeps the content-only token.
  assert.equal(digestOf({ ...v, viewRevision: 7 }), id);
  // Header-safe for any token string: only hex after the prefix.
  for (const odd of ['aa11 ', 'токен', 'a\nb'])
    assert.match(digestOf({ ...v, source: { ...v.source, token: odd } }), /^harness:[0-9a-f]{64}$/);
  // Never the same identity as a local digest of the same bytes.
  assert.notEqual(digestOf(v), localDigestOf(v));
  // A revision 1 document without a usable token falls back to the local digest.
  for (const token of ['', 7, null, undefined]) {
    const bad = structuredClone(v);
    bad.source.token = token;
    assert.equal(digestOf(bad), localDigestOf(bad), String(token));
  }
  for (const rev of [0, -1, 0.5, '1', undefined])
    assert.equal(contentToken({ ...v, viewRevision: rev }), undefined, String(rev));
});

test('a watch that stopped never starts its queued harness run', async () => {
  const s = scratch();
  const countFile = join(s.dir, 'runs');
  const fake = fakeHarness({ view: true, lang: true, hang: true, countFile });
  const server = await startServer({
    harness: { bin: fake.bin, state: '/s', lang: true, defaultLang: 'en', timeoutMs: 1500 },
    appDir,
    version: 'test',
  });
  try {
    // MAX_RUNS hanging detail runs hold every slot.
    const held = Array.from({ length: MAX_RUNS }, (_, i) => http(server.url + `api/work/w${i}`));
    assert.ok(await waitFor(() => runsIn(countFile).length === MAX_RUNS, 5000));
    // The stream's first check queues behind them; the page leaves at once.
    const es = stream(server.url + 'api/events');
    await es.opened;
    es.close();
    assert.ok(await waitFor(() => server.live().watches === 0, 2000));
    await Promise.all(held);
    await sleep(500);
    assert.equal(
      runsIn(countFile).filter((r) => !r.includes('--work=')).length,
      0,
      'the overview run of the gone page never started',
    );
  } finally {
    await server.close();
    fake.remove();
    s.remove();
  }
});

test('a stream that stops reading is dropped instead of buffering without bound', () => {
  let destroyed = false;
  const written: string[] = [];
  const res = {
    writableEnded: false,
    writableLength: 0,
    write: (c: string) => written.push(c) > 0,
    destroy: () => {
      destroyed = true;
      return res;
    },
  };
  writeEvent(res as never, 'ping', {});
  assert.equal(written.length, 1);
  res.writableLength = MAX_BUFFERED + 1;
  writeEvent(res as never, 'ping', {});
  assert.equal(written.length, 1, 'nothing more is queued');
  assert.ok(destroyed);
});

test('the reuse cache expires entries, forgets refusals and holds at most RECENT_MAX', () => {
  let now = 1_000;
  const c = new RecentCache<string>(1_500, RECENT_MAX, () => now);
  c.set('a', 'A');
  assert.equal(c.get('a'), 'A');
  now += 1_499;
  assert.equal(c.get('a'), 'A', 'still within the reuse time');
  now += 1;
  assert.equal(c.get('a'), undefined, 'expired at RECENT_MS');
  // Expired entries go on any write, so idle keys never pile up.
  c.set('b', 'B');
  now += 2_000;
  c.set('c', 'C');
  assert.equal(c.size, 1);
  // A refusal replaces and forgets the last good result of that key.
  c.set('c', undefined);
  assert.equal(c.get('c'), undefined);
  assert.equal(c.size, 0);
  // Arbitrary keys (work ids) cannot grow it: the oldest go first.
  for (let i = 0; i <= RECENT_MAX; i++) c.set('w' + i, String(i));
  assert.equal(c.size, RECENT_MAX);
  assert.equal(c.get('w0'), undefined, 'the oldest was dropped');
  assert.equal(c.get('w1'), '1');
  assert.equal(c.get('w' + RECENT_MAX), String(RECENT_MAX));
});
