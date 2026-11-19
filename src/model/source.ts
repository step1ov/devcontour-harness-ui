// Data adapter: how a host feeds the components. The standalone app uses
// `httpViewSource` against the local CLI; DevContour implements `ViewSource`
// over its own store. Components never fetch on their own.
//
// Wire contract (docs/design.md §6): `GET <base>/api/view` returns the bare
// view with an ETag; a compatibility refusal is HTTP 409 with
// `{ error: { code, message } }`. The UI CLI and the proposed
// `harness serve-view` serve the same routes.

import { checkView, type ViewCheck } from './compat.ts';

export interface ViewSource {
  /** Current view or a typed refusal; rejects only on transport failure. */
  load(signal?: AbortSignal): Promise<ViewCheck>;
  /** Optional push of changes; returns an unsubscribe function. */
  subscribe?(onChange: () => void): () => void;
}

/** A fixed document (tests, previews, a host snapshot). */
export function staticViewSource(view: unknown): ViewSource {
  return { load: async () => checkView(view) };
}

const refusalCodes = new Set(['NOT_A_VIEW', 'VIEW_VERSION_UNSUPPORTED', 'VIEW_UNAVAILABLE']);

export function httpViewSource(base: string, fetchImpl: typeof fetch = fetch): ViewSource {
  const url = new URL('api/view', base.endsWith('/') ? base : base + '/').toString();
  return {
    async load(signal) {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        ...(signal ? { signal } : {}),
      });
      if (res.ok) return checkView(await res.json());
      // A typed refusal keeps its code and fix hint instead of becoming a
      // generic transport error.
      const body = (await res.json().catch(() => undefined)) as
        { error?: { code?: unknown; message?: unknown } } | undefined;
      const code = body?.error?.code;
      if (typeof code === 'string' && refusalCodes.has(code)) {
        return {
          ok: false,
          code: code as 'NOT_A_VIEW',
          message: typeof body?.error?.message === 'string' ? body.error.message : code,
        };
      }
      throw new Error(`GET ${url}: ${res.status}`);
    },
  };
}
