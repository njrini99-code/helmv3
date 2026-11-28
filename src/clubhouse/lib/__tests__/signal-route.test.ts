import { describe, expect, it } from 'vitest';
import graph from '../../../../docs/clubhouse/generated/bridge-graph.json';
import { pageForPath } from '../signal-page';
import { ROUTE_KEYS, routeForPath, routeKey } from '../signal-route';

type Screen = { route: string; view?: string; audience: string };
const screens = Object.entries(graph.pages as Record<string, { screens: Screen[] }>).flatMap(([page, p]) => p.screens.map((s) => ({ page, ...s })));

/** A real address for a template: each dynamic segment filled with an id. */
function fill(route: string): string {
  return route.replace(/\[[^\]]+\]/g, '3f9a1c2e-0000-4000-8000-00000000abcd');
}

/** A real query for a view: each `<id>` filled, each `a|b` its first value. */
function query(view: string): string {
  return view.replace(/<id>/g, 'p-7').replace(/=([\w-]+)\|[\w|-]+/g, '=$1');
}

describe('routeKey', () => {
  it('keeps a route as it is and drops the ids from a view', () => {
    expect(routeKey('/golf/dashboard/rounds/[id]')).toBe('/golf/dashboard/rounds/[id]');
    expect(routeKey('/golf/dashboard/coachhelm', '?view=ask')).toBe('/golf/dashboard/coachhelm?view=ask');
    expect(routeKey('/golf/dashboard/coachhelm', '?view=player&player=<id>')).toBe('/golf/dashboard/coachhelm?view=player&player');
    expect(routeKey('/golf/dashboard/stats', '?player=<id>')).toBe('/golf/dashboard/stats?player');
    expect(routeKey('/golf/dashboard/settings', '?section=team|coachhelm')).toBe('/golf/dashboard/settings?section=team|coachhelm');
  });
});

describe('the route list', () => {
  it('holds exactly one key for each screen in the Bridge graph', () => {
    const fromGraph = new Set(screens.map((s) => routeKey(s.route, s.view)));
    expect([...ROUTE_KEYS].sort()).toEqual([...fromGraph].sort());
  });

  it('counts every Clubhouse address that draws a screen: 56 paths and 10 query views', () => {
    expect(ROUTE_KEYS.size).toBe(66);
    expect([...ROUTE_KEYS].filter((k) => !k.includes('?'))).toHaveLength(56);
  });

  it('never carries an id', () => {
    for (const key of ROUTE_KEYS) expect(key).not.toMatch(/<id>|[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe('routeForPath', () => {
  it('finds every screen of the graph from a real address, on the page that screen belongs to', () => {
    for (const s of screens) {
      const path = fill(s.route);
      const search = s.view ? query(s.view) : '';
      expect(routeForPath(path, search), `${s.route}${s.view ?? ''}`).toBe(routeKey(s.route, s.view));
      // The page the shell counts the address under is the screen's own (Stats: by who is looking).
      const role = s.audience === 'player' ? 'player' : 'coach';
      expect(pageForPath(path, search, role), `${s.route}${s.view ?? ''} as ${role}`).toBe(s.page);
    }
  });

  it('prefers a fixed segment to a dynamic one', () => {
    expect(routeForPath('/golf/dashboard/rounds/new', '')).toBe('/golf/dashboard/rounds/new');
    expect(routeForPath('/golf/dashboard/rounds/abc', '')).toBe('/golf/dashboard/rounds/[id]');
    expect(routeForPath('/golf/dashboard/tournaments/history', '')).toBe('/golf/dashboard/tournaments/history');
    expect(routeForPath('/golf/dashboard/qualifiers/new', '')).toBe('/golf/dashboard/qualifiers/new');
  });

  it('reads a query only where a view is a screen of its own', () => {
    expect(routeForPath('/golf/dashboard/coachhelm', '?view=ask')).toBe('/golf/dashboard/coachhelm?view=ask');
    expect(routeForPath('/golf/dashboard/coachhelm', '?view=player')).toBe('/golf/dashboard/coachhelm');
    expect(routeForPath('/golf/dashboard/coachhelm', '?view=unknown')).toBe('/golf/dashboard/coachhelm');
    expect(routeForPath('/golf/dashboard/settings', '?section=coachhelm')).toBe('/golf/dashboard/settings?section=team|coachhelm');
    expect(routeForPath('/golf/dashboard/settings', '?section=account')).toBe('/golf/dashboard/settings');
    expect(routeForPath('/golf/dashboard/rounds', '?filter=week')).toBe('/golf/dashboard/rounds');
  });

  it('takes a trailing slash and a hash as the same screen', () => {
    expect(routeForPath('/golf/dashboard/roster/', '')).toBe('/golf/dashboard/roster');
    expect(routeForPath('/golf/dashboard/roster#top', '')).toBe('/golf/dashboard/roster');
  });

  it('claims no address that only redirects or shows not-found', () => {
    expect(routeForPath('/golf', '')).toBeNull();
    expect(routeForPath('/golf/dashboard/nowhere/at/all', '')).toBeNull();
    expect(routeForPath('/golf/dashboard/coachhelm/chat', '')).toBeNull();
    expect(routeForPath('/admin/clubhouse', '')).toBeNull();
  });
});
