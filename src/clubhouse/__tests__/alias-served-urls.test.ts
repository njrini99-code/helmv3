import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A30: the addresses next.config actually serves, not the route folders. Every redirect that lands inside the dashboard
 * lands on a Clubhouse screen or on an alias whose layout redirects into one, so an old link (a push, an email, a bookmark)
 * never ends on "hasn't been rebuilt yet". A player's old pages under /players/<id> are aliased whole.
 */

import { isAliased, isRebuilt } from '../shell/nav';

const UUID = '0b6c1d2e-3f40-4a51-8b62-7c83d94e0f15';
const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');

/** Each redirect's source and destination, in the order the config lists them. */
const redirects = [...config.matchAll(/source:\s*'([^']+)'[\s\S]{0,400}?destination:\s*'([^']+)'/g)].map((m) => ({ source: m[1]!, destination: m[2]! }));
/** A served address: each `:param` (and any pattern on it) filled with a uuid, the query left off. */
const served = (dest: string) => dest.replace(/:\w+(\([^)]*(?:\([^)]*\)[^)]*)*\))?/g, UUID).split('?')[0]!;

describe('the addresses next.config serves open Clubhouse (A30)', () => {
  it('reads the redirects', () => {
    expect(redirects.length).toBeGreaterThan(10);
  });

  it('every redirect into the dashboard lands on a rebuilt screen or an alias, for a coach', () => {
    const dashboard = redirects.filter((r) => r.destination.startsWith('/golf/dashboard'));
    expect(dashboard.length).toBeGreaterThan(5);
    for (const r of dashboard) {
      const to = served(r.destination);
      expect(isRebuilt(to, 'coach') || isAliased(to), `${r.source} -> ${to}`).toBe(true);
    }
  });

  it("a player's old pages are aliased: the profile, its game, its print and its genome", () => {
    for (const tail of ['', '/game', '/game/print', '/genome']) expect(isAliased(`/golf/dashboard/players/${UUID}${tail}`), tail || '(profile)').toBe(true);
  });
});
