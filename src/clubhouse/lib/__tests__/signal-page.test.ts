import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageForPath } from '../signal-page';

const graph = JSON.parse(readFileSync(join(process.cwd(), 'docs/clubhouse/generated/bridge-graph.json'), 'utf8')) as {
  pages: Record<string, { routes: string[] }>;
};

describe('pageForPath', () => {
  it("names every route the graph lists as that route's page", () => {
    for (const [id, page] of Object.entries(graph.pages)) {
      for (const route of page.routes) {
        const path = route.replace(/\[[^\]]+\]/g, 'x1');
        // Team and player Stats share one address: the player's is the one a player sees.
        const role = id === 'P005' ? 'player' : 'coach';
        expect([path, pageForPath(path, '', role)]).toEqual([path, id]);
      }
    }
  });

  it('splits Stats by whose they are', () => {
    expect(pageForPath('/golf/dashboard/stats', '', 'coach')).toBe('P004');
    expect(pageForPath('/golf/dashboard/stats', '?player=abc', 'coach')).toBe('P005');
    expect(pageForPath('/golf/dashboard/stats', '', 'player')).toBe('P005');
  });

  it('counts the team and staff invitations under the front door, whose controls and codes they use', () => {
    expect(pageForPath('/golf/join', '', 'player')).toBe('P015');
    expect(pageForPath('/golf/join/ABC123', '', 'player')).toBe('P015');
    expect(pageForPath('/golf/staff/join/x1', '', 'coach')).toBe('P015');
  });

  it('counts an address no page claims under the shell', () => {
    expect(pageForPath('/golf/dashboard/nowhere', '', 'coach')).toBe('P001');
    expect(pageForPath('/', '', 'coach')).toBe('P001');
    expect(pageForPath('/golf/dashboard/', '', 'player')).toBe('P002');
  });
});
