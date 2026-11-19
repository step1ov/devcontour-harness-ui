// Data adapter: how a host feeds the components. The standalone app uses
// `httpViewSource` against the local CLI; DevContour implements `ViewSource`
// over its own store. Components never fetch on their own.

import { checkView, type ViewCheck } from './compat.ts';

export interface ViewSource {
  /** Current view; rejects only on transport failure, not on an old version. */
  load(signal?: AbortSignal): Promise<ViewCheck>;
  /** Optional push of changes; returns an unsubscribe function. */
  subscribe?(onChange: () => void): () => void;
}

/** A fixed document (tests, previews, a host snapshot). */
export function staticViewSource(view: unknown): ViewSource {
  return { load: async () => checkView(view) };
}

/** Read-only GET of `<base>/api/view` (the CLI and the proposed `harness serve-view`). */
export function httpViewSource(base: string, fetchImpl: typeof fetch = fetch): ViewSource {
  const url = new URL('api/view', base.endsWith('/') ? base : base + '/').toString();
  return {
    async load(signal) {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        ...(signal ? { signal } : {}),
      });
      if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
      return checkView(await res.json());
    },
  };
}
