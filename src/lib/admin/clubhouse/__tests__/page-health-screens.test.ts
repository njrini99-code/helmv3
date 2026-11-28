import { describe, expect, it } from 'vitest';
import graphJson from '../../../../../docs/clubhouse/generated/bridge-graph.json';
import type { BridgeGraph, GraphScreen } from '../graph';
import { coverageOf, coverageWords, pageHealth, screenCount, screenName, screenWords } from '../page-health';
import { pageRouteKeys } from '../route-key';
import { NOW, h } from './fixtures-live';

/**
 * Screen coverage on the Pages view: every route the app router serves is a screen the Bridge counts, so silence is
 * counted against the real 66, not against 17 pages.
 */

const rounds: GraphScreen[] = [
  { route: '/golf/dashboard/rounds', audience: 'shared', name: 'Rounds (coach: team rounds; player: their library)' },
  { route: '/golf/dashboard/rounds/[id]', audience: 'shared', name: 'Round review' },
  { route: '/golf/dashboard/rounds/new', audience: 'player', name: 'Round entry' },
  { route: '/golf/dashboard/live', audience: 'coach', name: 'Live' },
];

describe('screenCount', () => {
  it('credits the screen a row names', () => {
    const c = screenCount([h({ page_id: 'P011', route: '/golf/dashboard/rounds/new', role: 'player' })], rounds);
    expect(c.heard.map((s) => s.name)).toEqual(['Round entry']);
    expect(c).toMatchObject({ total: 4, untold: 0 });
    expect(c.silent.map((s) => s.name)).toEqual(['Rounds', 'Round review', 'Live']);
  });

  it('with no route, credits a screen only when the role leaves just one', () => {
    const one: GraphScreen[] = [{ route: '/golf/dashboard/messages', audience: 'shared', name: 'Messages' }];
    expect(screenCount([h({ route: '', role: 'coach' })], one).heard).toHaveLength(1);
    // A coach on Rounds could be on any of three screens: nothing is guessed, the signals are counted as untold.
    const c = screenCount([h({ route: '', role: 'coach', signal_count: 5 }), h({ route: undefined, role: 'player', signal_count: 2 })], rounds);
    expect(c.heard).toHaveLength(0);
    expect(c.untold).toBe(7);
  });

  it('a key the page does not list is untold, never a screen', () => {
    const c = screenCount([h({ route: '/golf/dashboard/elsewhere', role: 'coach' })], rounds);
    expect(c).toMatchObject({ heard: [], untold: 1 });
  });

  it('a signed-out row fits only a signed-out screen', () => {
    const auth: GraphScreen[] = [
      { route: '/golf/login', audience: 'signed-out', name: 'Sign in' },
      { route: '/golf/welcome', audience: 'shared', name: 'Welcome (just signed up)' },
    ];
    expect(screenCount([h({ route: '', role: 'signed-out' })], auth).heard.map((s) => s.name)).toEqual(['Sign in']);
  });

  it('names a screen without its manifest gloss, and counts it in words', () => {
    expect(screenName({ route: '/a', name: 'Settings: CoachHelm (old deep link; a player lands on Account)' })).toBe('Settings: CoachHelm');
    expect(screenName({ route: '/golf/dashboard/coachhelm', view: '?view=read&insight=<id>' })).toBe('/golf/dashboard/coachhelm?view=read&insight');
    expect(screenWords({ total: 1, heard: [], silent: [], untold: 0 })).toBeNull();
    const one = [{ key: 'a', name: 'A' }];
    expect(screenWords({ total: 7, heard: one, silent: [], untold: 0 })).toBe('1 of 7 screens');
    expect(screenWords({ total: 7, heard: one, silent: [], untold: 3 })).toBe('at least 1 of 7 screens');
    expect(screenWords({ total: 7, heard: [], silent: [], untold: 3 })).toBe('screen not known yet');
    expect(screenWords({ total: 2, heard: [...one, { key: 'b', name: 'B' }], silent: [], untold: 3 })).toBe('all 2 screens');
  });
});

describe('coverage over the real graph', () => {
  const graph = graphJson as unknown as BridgeGraph;
  const allKeys = new Set(Object.values(graph.pages).flatMap((p) => pageRouteKeys(p.screens)));

  it('counts 66 screens across 17 pages: the denominator is every route, not every page', () => {
    expect(Object.keys(graph.pages)).toHaveLength(17);
    expect(allKeys.size).toBe(66);
    const c = coverageOf(pageHealth([], graph, { w: '7d', now: NOW }), graph);
    expect(c).toMatchObject({ heard: 0, total: 17, screensHeard: 0, screensTotal: 66, untold: [] });
    // Every screen is listed once, under the first page that has it.
    expect(c.silentScreens.reduce((a, g) => a + g.screens.length, 0)).toBe(66);
    expect(c.silentScreens.every((g) => g.pageSilent)).toBe(true);
  });

  it('reads today: Home and Messages report as a coach, so 2 of 17 pages and 2 of 66 screens', () => {
    const rows = [h({ page_id: 'P002', kind: 'view', outcome: '', role: 'coach' }), h({ page_id: 'P007', kind: 'view', outcome: '', role: 'coach' })];
    const c = coverageOf(pageHealth(rows, graph, { w: '7d', now: NOW }), graph);
    expect(coverageWords(c)).toBe('Heard from 2 of 17 pages and 2 of 66 screens');
    expect(c.silentScreens.map((g) => g.page)).not.toContain('P002');
    expect(c.silentScreens.reduce((a, g) => a + g.screens.length, 0)).toBe(64);
  });

  it('a screen two pages share counts once: a player on My stats also covers the coach route it shares', () => {
    const rows = [h({ page_id: 'P005', route: '/golf/dashboard/stats', role: 'player', kind: 'view', outcome: '' })];
    const c = coverageOf(pageHealth(rows, graph, { w: '7d', now: NOW }), graph);
    expect(c.screensHeard).toBe(1);
    const p4 = c.silentScreens.find((g) => g.page === 'P004');
    expect(p4).toMatchObject({ pageSilent: true, screens: [] });
  });

  it('with the route stored, one row per screen credits each', () => {
    const rows = [...allKeys].map((key) => {
      const page = Object.entries(graph.pages).find(([, p]) => pageRouteKeys(p.screens).includes(key))![0];
      return h({ page_id: page, route: key, kind: 'view', outcome: '' });
    });
    const c = coverageOf(pageHealth(rows, graph, { w: '7d', now: NOW }), graph);
    expect(coverageWords(c)).toBe('Heard from all 17 pages and all 66 screens');
    expect(c.silentScreens).toEqual([]);
  });
});
