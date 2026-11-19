// httpViewSource.subscribe: the page side of the live stream. Typed events
// from /api/events, malformed payloads ignored, and every way a stream can
// fail (error, silence) becomes exactly one `down`, so the page polls.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  httpViewSource,
  liveEventOf,
  type EventSourceLike,
  type LiveEvent,
} from '../src/model/source.ts';

class FakeEventSource implements EventSourceLike {
  static last: FakeEventSource | undefined;
  readyState = 0;
  closed = false;
  onerror: ((e: unknown) => void) | null = null;
  listeners = new Map<string, ((e: { data?: unknown }) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, l: (e: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
  }
  emit(type: string, data: unknown) {
    for (const l of this.listeners.get(type) ?? []) l({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

test('subscribe opens /api/events with the language and work id, and passes typed events', () => {
  const src = httpViewSource('http://127.0.0.1:4790/', fetch, {
    lang: 'ru',
    eventSource: FakeEventSource,
  });
  const got: (LiveEvent | undefined)[] = [];
  const stop = src.subscribe!((e) => got.push(e), { workId: 'locale-format' });
  const es = FakeEventSource.last!;
  const u = new URL(es.url);
  assert.equal(u.pathname, '/api/events');
  assert.equal(u.searchParams.get('lang'), 'ru');
  assert.equal(u.searchParams.get('work'), 'locale-format');
  es.emit('view', { token: 'a', checkedAt: '2026-11-19T10:00:00Z' });
  es.emit('fresh', { token: 'a', checkedAt: '2026-11-19T10:00:05Z' });
  es.emit('stale', { code: 'VIEW_UNAVAILABLE', message: 'timed out', since: 'S', checkedAt: 'C' });
  es.emit('view', { token: 7 }); // malformed: ignored
  es.emit('ping', {});
  assert.deepEqual(got, [
    { kind: 'view', token: 'a', checkedAt: '2026-11-19T10:00:00Z' },
    { kind: 'fresh', token: 'a', checkedAt: '2026-11-19T10:00:05Z' },
    { kind: 'stale', code: 'VIEW_UNAVAILABLE', message: 'timed out', since: 'S', checkedAt: 'C' },
  ]);
  stop();
  assert.ok(es.closed);
  es.emit('view', { token: 'b', checkedAt: 'x' });
  assert.equal(got.length, 3, 'nothing after unsubscribe');
});

test('a stream error is one down event and closes the stream', () => {
  const src = httpViewSource('http://127.0.0.1:4790/', fetch, { eventSource: FakeEventSource });
  const got: (LiveEvent | undefined)[] = [];
  src.subscribe!((e) => got.push(e));
  const es = FakeEventSource.last!;
  es.onerror!({});
  es.onerror!({});
  es.emit('view', { token: 'a', checkedAt: 'x' });
  assert.deepEqual(got, [{ kind: 'down' }]);
  assert.ok(es.closed);
});

test('a silent stream (no event, no ping) counts as lost; pings keep it alive', async () => {
  const src = httpViewSource('http://127.0.0.1:4790/', fetch, {
    eventSource: FakeEventSource,
    silenceMs: 120,
  });
  const got: (LiveEvent | undefined)[] = [];
  const stop = src.subscribe!((e) => got.push(e));
  const es = FakeEventSource.last!;
  for (let i = 0; i < 4; i++) {
    await sleep(60);
    es.emit('ping', {});
  }
  assert.deepEqual(got, [], 'pings keep the stream');
  await sleep(200);
  assert.deepEqual(got, [{ kind: 'down' }]);
  assert.ok(es.closed);
  stop();
});

test('without an EventSource the source has no subscribe: the page polls', () => {
  const g = globalThis as { EventSource?: unknown };
  const saved = g.EventSource;
  delete g.EventSource;
  try {
    assert.equal(httpViewSource('http://127.0.0.1:4790/').subscribe, undefined);
  } finally {
    if (saved !== undefined) g.EventSource = saved;
  }
});

test('liveEventOf rejects non-JSON and missing fields; stale without since uses checkedAt', () => {
  assert.equal(liveEventOf('view', 'not json'), undefined);
  assert.equal(liveEventOf('view', 'null'), undefined);
  assert.equal(liveEventOf('fresh', JSON.stringify({ token: 'a' })), undefined);
  assert.equal(liveEventOf('other', JSON.stringify({ token: 'a', checkedAt: 'b' })), undefined);
  assert.deepEqual(
    liveEventOf('stale', JSON.stringify({ code: 'X', message: 'm', checkedAt: 'c' })),
    {
      kind: 'stale',
      code: 'X',
      message: 'm',
      since: 'c',
      checkedAt: 'c',
    },
  );
});
