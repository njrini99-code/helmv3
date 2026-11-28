/**
 * Route keys (Bridge plan §2): the name of one Clubhouse screen. A key is the route template a page manifest lists
 * (`/golf/dashboard/rounds/[id]`) and, where a query view is a screen of its own, that view with any id dropped
 * (`/golf/dashboard/coachhelm?view=read&insight`). It names a screen, never a record, so no key carries an id.
 *
 * The one place a key is made: the client tags its signals with it (src/clubhouse/lib/signal-route.ts), the signal
 * route keeps a key only where the graph lists it on the signal's page (ingest.ts), and the Pages view counts the
 * graph's screens by it (page-health.ts). Pure, with no imports, so the browser bundle can share it.
 */

/** One parameter of a view: its name, and the values it takes (null: any value, an id). */
export type ViewParam = { name: string; values: readonly string[] | null };

/** A manifest view (`?view=read&insight=<id>`, `?section=team|coachhelm`) as its parameters. */
export function viewParams(view: string): ViewParam[] {
  return view
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [name = '', value = ''] = pair.split('=');
      return { name, values: value === '<id>' ? null : value.split('|') };
    });
}

/** A screen's route key: its route, then its view with any id dropped (`?view=player&player=<id>` is `?view=player&player`). */
export function routeKey(route: string, view?: string | null): string {
  if (!view) return route;
  const parts = viewParams(view).map((p) => (p.values ? `${p.name}=${p.values.join('|')}` : p.name));
  return `${route}?${parts.join('&')}`;
}

/** The fields of a graph screen a key is made from. */
export interface KeyedScreen {
  route: string;
  view?: string;
}

/** The route keys of one page's screens, in the manifest's order. */
export function pageRouteKeys(screens: readonly KeyedScreen[] | undefined): string[] {
  return [...new Set((screens ?? []).map((s) => routeKey(s.route, s.view)))];
}
