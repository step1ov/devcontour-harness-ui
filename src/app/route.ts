// Hash routes of the standalone app (design §5): `#/`, `#/tasks`,
// `#/work/<id>`, `#/decisions`, `#/activity[?work=&actor=]`, `#/history`,
// `#/health`, `#/lead` (the last four form «Журнал»), `#/settings`. The old
// `#/reviews` is kept as a redirect to `#/tasks` (`redirectOf`). A second `#` names an anchor inside the screen
// (`#/work/<id>#verification`). Pure, so it is unit-tested.

export type Screen =
  | 'overview'
  | 'tasks'
  | 'work'
  | 'reviews'
  | 'decisions'
  | 'activity'
  | 'settings'
  | 'history'
  | 'health'
  | 'lead'
  | 'unknown';

export interface Route {
  screen: Screen;
  workId?: string;
  anchor?: string;
  filter?: { workId?: string; actor?: string };
}

const simple: Record<string, Screen> = {
  '': 'overview',
  '/': 'overview',
  '/tasks': 'tasks',
  '/reviews': 'reviews',
  '/decisions': 'decisions',
  '/activity': 'activity',
  '/settings': 'settings',
  '/history': 'history',
  '/health': 'health',
  '/lead': 'lead',
};

const decode = (s: string): string | undefined => {
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
};

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathAndQuery = '', anchor] = raw.split('#', 2);
  const [path = '', query = ''] = pathAndQuery.split('?', 2);
  const withAnchor = (r: Route): Route => (anchor ? { ...r, anchor } : r);
  if (path.startsWith('/work/')) {
    const id = decode(path.slice('/work/'.length));
    return id ? withAnchor({ screen: 'work', workId: id }) : { screen: 'unknown' };
  }
  if (!Object.hasOwn(simple, path)) return { screen: 'unknown' };
  const screen = simple[path]!;
  if (screen === 'activity') {
    const q = new URLSearchParams(query);
    const filter: { workId?: string; actor?: string } = {};
    const w = q.get('work');
    const a = q.get('actor');
    if (w) filter.workId = w;
    if (a) filter.actor = a;
    return withAnchor({ screen, filter });
  }
  return withAnchor({ screen });
}

export const workHash = (id: string) => '#/work/' + encodeURIComponent(id);

export function activityHash(filter: { workId?: string; actor?: string }): string {
  const q = new URLSearchParams();
  if (filter.workId) q.set('work', filter.workId);
  if (filter.actor) q.set('actor', filter.actor);
  const s = q.toString();
  return '#/activity' + (s ? '?' + s : '');
}

/** A retired route and where it lives now: `#/reviews` → `#/tasks` (alpha.4). */
export function redirectOf(route: Route): string | undefined {
  return route.screen === 'reviews' ? '#/tasks' : undefined;
}
