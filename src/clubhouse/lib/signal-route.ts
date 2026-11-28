/**
 * Which Clubhouse screen an address is, as a route key (Bridge plan §2): the route template a page manifest lists
 * (`/golf/dashboard/rounds/[id]`), and, where a query view is a screen of its own, that view (`?view=ask`). A route key
 * names a screen, never a record: a dynamic segment stays its template, and a view keeps only the names of the
 * parameters that hold an id (`?view=read&insight`), so no key carries an id.
 *
 * Every screen in docs/clubhouse/generated/bridge-graph.json has one key (`routeKey(screen.route, screen.view)`), and
 * these lists hold the same ones: the test keeps them in step with the graph. A signal carries its key, so the Bridge
 * can say which of Clubhouse's screens reported, not only which of its pages. Keys are made in one place
 * (src/lib/admin/clubhouse/route-key.ts), shared with the server.
 */
import { routeKey, type ViewParam, viewParams } from '@/lib/admin/clubhouse/route-key';

export { routeKey };

/** Every address Clubhouse draws a screen at (the manifests' `screens`, without their views). */
const TEMPLATES: readonly string[] = [
  '/golf/coach',
  '/golf/coach/pending',
  '/golf/dashboard',
  '/golf/dashboard/calendar',
  '/golf/dashboard/calendar/hours',
  '/golf/dashboard/classes',
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/live',
  '/golf/dashboard/messages',
  '/golf/dashboard/practice',
  '/golf/dashboard/practice/drills',
  '/golf/dashboard/practice/drills/[drillId]',
  '/golf/dashboard/practice/format',
  '/golf/dashboard/practice/groups',
  '/golf/dashboard/practice/plan/[planId]',
  '/golf/dashboard/practice/plan/[planId]/edit',
  '/golf/dashboard/practice/print/[planId]',
  '/golf/dashboard/practice/templates',
  '/golf/dashboard/qualifiers',
  '/golf/dashboard/qualifiers/[id]',
  '/golf/dashboard/qualifiers/[id]/edit',
  '/golf/dashboard/qualifiers/[id]/selection',
  '/golf/dashboard/qualifiers/new',
  '/golf/dashboard/recruiting',
  '/golf/dashboard/roster',
  '/golf/dashboard/rounds',
  '/golf/dashboard/rounds/[id]',
  '/golf/dashboard/rounds/continue/[id]',
  '/golf/dashboard/rounds/course/[key]',
  '/golf/dashboard/rounds/new',
  '/golf/dashboard/rounds/recover',
  '/golf/dashboard/settings',
  '/golf/dashboard/settings/coaching-intelligence',
  '/golf/dashboard/settings/notifications',
  '/golf/dashboard/stats',
  '/golf/dashboard/team-hub',
  '/golf/dashboard/tournaments',
  '/golf/dashboard/tournaments/[id]',
  '/golf/dashboard/tournaments/[id]/edit',
  '/golf/dashboard/tournaments/[id]/lineup',
  '/golf/dashboard/tournaments/[id]/live',
  '/golf/dashboard/tournaments/compare',
  '/golf/dashboard/tournaments/history',
  '/golf/dashboard/tournaments/links',
  '/golf/dashboard/tournaments/new',
  '/golf/dashboard/whats-new',
  '/golf/demo',
  '/golf/forgot-password',
  '/golf/join',
  '/golf/join/[code]',
  '/golf/login',
  '/golf/player',
  '/golf/reset-password',
  '/golf/signup',
  '/golf/staff/join/[token]',
  '/golf/welcome',
];

/** The query views that are screens of their own, as the manifests write them (`<id>`: any value; `a|b`: one of). */
const VIEWS: Readonly<Record<string, readonly string[]>> = {
  '/golf/dashboard/stats': ['?player=<id>'],
  '/golf/dashboard/settings': ['?section=team|coachhelm', '?section=golf'],
  '/golf/dashboard/coachhelm': [
    '?view=ask',
    '?view=read&insight=<id>',
    '?view=player&player=<id>',
    '?view=track-record',
    '?view=monday-brief',
    '?view=standing',
    '?view=deep-dive',
  ],
};

type Template = { route: string; parts: string[]; views: { key: string; params: ViewParam[] }[] };

const PARSED: readonly Template[] = TEMPLATES.map((route) => ({
  route,
  parts: route.split('/').filter(Boolean),
  views: (VIEWS[route] ?? []).map((view) => ({ key: routeKey(route, view), params: viewParams(view) })),
}));

/** Every route key: one for each address and each query view that is its own screen. */
export const ROUTE_KEYS: ReadonlySet<string> = new Set(PARSED.flatMap((t) => [t.route, ...t.views.map((v) => v.key)]));

const DYNAMIC = /^\[[^\]]+\]$/;

/** The template an address fills, preferring a fixed segment to a dynamic one (`rounds/new` over `rounds/[id]`). */
function templateFor(pathname: string): Template | null {
  const parts = pathname.replace(/[?#].*$/, '').split('/').filter(Boolean);
  let best: Template | null = null;
  let bestFixed = -1;
  for (const t of PARSED) {
    if (t.parts.length !== parts.length) continue;
    let fixed = 0;
    let fits = true;
    for (let i = 0; i < parts.length; i += 1) {
      const want = t.parts[i]!;
      if (want === parts[i]) fixed += 1;
      else if (!DYNAMIC.test(want)) {
        fits = false;
        break;
      }
    }
    if (fits && fixed > bestFixed) {
      best = t;
      bestFixed = fixed;
    }
  }
  return best;
}

/**
 * The route key of a Clubhouse address (path and query), or null for one no screen claims (a redirect, the not-found
 * page, anything outside /golf). The query counts only where a view is a screen of its own; a filter or a hash does not
 * change the screen.
 */
export function routeForPath(pathname: string, search: string): string | null {
  const t = templateFor(pathname);
  if (!t) return null;
  if (!t.views.length || !search) return t.route;
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  let best: { key: string; params: ViewParam[] } | null = null;
  for (const v of t.views) {
    const fits = v.params.every((p) => {
      const got = q.get(p.name);
      return got !== null && got !== '' && (p.values === null || p.values.includes(got));
    });
    if (fits && (!best || v.params.length > best.params.length)) best = v;
  }
  return best?.key ?? t.route;
}
