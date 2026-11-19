// Data adapter: how a host feeds the components. The standalone app uses
// `httpViewSource` against the local CLI; DevContour implements `ViewSource`
// over its own store. Components never fetch on their own.
//
// Wire contract (docs/design.md §6): `GET <base>/api/view[?lang=ru|en]`
// returns the bare view with an ETag; `GET <base>/api/work/<id>[?lang=]`
// returns the work detail document (`harness view --work <id>`). `lang` asks
// the harness for plain strings in that language (a file view ignores it); a
// compatibility refusal is HTTP 409 and an unavailable document 503, both with
// `{ error: { code, message } }`. The UI CLI and the proposed
// `harness serve-view` serve the same routes.

import { checkView, checkWorkDetail, type ViewCheck, type WorkDetailCheck } from './compat.ts';

export interface ViewSource {
  /** Current view or a typed refusal; rejects only on transport failure. */
  load(signal?: AbortSignal): Promise<ViewCheck>;
  /** Work detail document or a typed refusal; absent = the host has no detail route. */
  loadWork?(workId: string, signal?: AbortSignal): Promise<WorkDetailCheck>;
  /** Optional push of changes; returns an unsubscribe function. */
  subscribe?(onChange: () => void): () => void;
}

/** A fixed document (tests, previews, a host snapshot), with optional work details by id. */
export function staticViewSource(view: unknown, works: Record<string, unknown> = {}): ViewSource {
  return {
    load: async () => checkView(view),
    loadWork: async (id) =>
      Object.hasOwn(works, id)
        ? checkWorkDetail(works[id])
        : { ok: false, code: 'VIEW_UNAVAILABLE', message: `No work detail for ${id}.` },
  };
}

const refusalCodes = new Set(['NOT_A_VIEW', 'VIEW_VERSION_UNSUPPORTED', 'VIEW_UNAVAILABLE']);

export interface HttpViewSourceOptions {
  /** UI language, passed as `?lang=` so the harness writes plain strings in it. */
  lang?: 'ru' | 'en';
}

export function httpViewSource(
  base: string,
  fetchImpl: typeof fetch = fetch,
  options: HttpViewSourceOptions = {},
): ViewSource {
  const root = base.endsWith('/') ? base : base + '/';
  const urlOf = (path: string) => {
    const u = new URL(path, root);
    if (options.lang) u.searchParams.set('lang', options.lang);
    return u.toString();
  };
  async function get<T>(url: string, gate: (v: unknown) => T, signal?: AbortSignal) {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
    if (res.ok) return gate(await res.json());
    // A typed refusal keeps its code and fix hint instead of becoming a
    // generic transport error.
    const body = (await res.json().catch(() => undefined)) as
      { error?: { code?: unknown; message?: unknown } } | undefined;
    const code = body?.error?.code;
    if (typeof code === 'string' && refusalCodes.has(code)) {
      return {
        ok: false as const,
        code: code as 'NOT_A_VIEW',
        message: typeof body?.error?.message === 'string' ? body.error.message : code,
      };
    }
    throw new Error(`GET ${url}: ${res.status}`);
  }
  const viewUrl = urlOf('api/view');
  return {
    load: (signal) => get(viewUrl, checkView, signal),
    loadWork: (id, signal) =>
      get(urlOf('api/work/' + encodeURIComponent(id)), checkWorkDetail, signal),
  };
}
