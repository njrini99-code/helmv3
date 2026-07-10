// =============================================================================
// src/lib/baseball/__tests__/bottom-nav.test.ts
//
// M1 packet: baseball-nav-4 (docs/MOBILE_DOCTRINE.md Rule 10). Pins
// getBaseballBottomNavKeys' 4-key daily-loop result for every
// BASEBALL_PROGRAM_TYPES × role combination (the §3 table in the brief), plus
// the showcase org/team scope branch and the fail-closed default.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBaseballBottomNavKeys, type BaseballBottomNavContext } from '../bottom-nav';
import { BASEBALL_PROGRAM_TYPES, type BaseballProgramType } from '@/lib/types/baseball-settings';
import { BASEBALL_MESSAGES_NAV } from '../nav-registry';

function coach(
  programType: BaseballProgramType | null,
  showcaseScope?: BaseballBottomNavContext['showcaseScope'],
): BaseballBottomNavContext {
  return { role: 'coach', programType, showcaseScope };
}
function player(programType: BaseballProgramType | null): BaseballBottomNavContext {
  return { role: 'player', programType };
}

describe('bottom-nav.ts purity (isomorphic, no React/client directives)', () => {
  it('carries no "use client"/"use server" directive and no React import', () => {
    const source = readFileSync(join(__dirname, '..', 'bottom-nav.ts'), 'utf8');
    // Anchored full-line match — a real directive is its OWN statement line
    // (`'use client';`), so this doesn't false-positive on the module's doc
    // comments, which mention the phrase in prose (e.g. "no 'use client'").
    expect(source).not.toMatch(/^['"]use client['"];?\s*$/m);
    expect(source).not.toMatch(/^['"]use server['"];?\s*$/m);
    expect(source).not.toMatch(/from ['"]react['"]/);
  });
});

describe('getBaseballBottomNavKeys — every branch returns exactly 4 keys', () => {
  it('every program type × role produces exactly 4 keys', () => {
    for (const pt of BASEBALL_PROGRAM_TYPES) {
      expect(getBaseballBottomNavKeys(coach(pt))).toHaveLength(4);
      expect(getBaseballBottomNavKeys(player(pt))).toHaveLength(4);
    }
  });

  it('null programType (fail-closed) produces exactly 4 keys for both roles', () => {
    expect(getBaseballBottomNavKeys(coach(null))).toHaveLength(4);
    expect(getBaseballBottomNavKeys(player(null))).toHaveLength(4);
  });

  it('showcase org and team scope each produce exactly 4 keys', () => {
    expect(getBaseballBottomNavKeys(coach('showcase', 'org'))).toHaveLength(4);
    expect(getBaseballBottomNavKeys(coach('showcase', 'team'))).toHaveLength(4);
  });
});

describe('getBaseballBottomNavKeys — §3 table: universal slots', () => {
  it('coach slots 1/2 are always dashboard/team; slot 4 is always Messages', () => {
    for (const pt of BASEBALL_PROGRAM_TYPES) {
      const keys = getBaseballBottomNavKeys(coach(pt));
      expect(keys[0]).toBe('dashboard');
      expect(keys[1]).toBe('team');
      expect(keys[3]).toBe(BASEBALL_MESSAGES_NAV.id);
    }
  });

  it('player slots 1/2 are always player-today/calendar; slot 4 is always Messages', () => {
    for (const pt of BASEBALL_PROGRAM_TYPES) {
      const keys = getBaseballBottomNavKeys(player(pt));
      expect(keys[0]).toBe('player-today');
      expect(keys[1]).toBe('calendar');
      expect(keys[3]).toBe(BASEBALL_MESSAGES_NAV.id);
    }
  });

  it('Messages occupies slot 4 (index 3) for both roles across every mode — never buried', () => {
    for (const pt of [...BASEBALL_PROGRAM_TYPES, null]) {
      expect(getBaseballBottomNavKeys(coach(pt))[3]).toBe('messages');
      expect(getBaseballBottomNavKeys(player(pt))[3]).toBe('messages');
    }
  });
});

describe('getBaseballBottomNavKeys — §3 table: coach slot-3 differentiator', () => {
  it.each([
    ['college', 'stats-performance'],
    ['juco', 'recruiting'],
    ['high_school', 'development'],
    ['academy', 'development'],
    ['club', 'stats-performance'],
    ['showcase', 'stats-performance'],
  ] as const)('%s coach slot 3 (index 2) is %s', (programType, expected) => {
    expect(getBaseballBottomNavKeys(coach(programType))[2]).toBe(expected);
  });

  it('full coach key sets match the §3 table exactly', () => {
    expect(getBaseballBottomNavKeys(coach('college'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
    expect(getBaseballBottomNavKeys(coach('juco'))).toEqual(['dashboard', 'team', 'recruiting', 'messages']);
    expect(getBaseballBottomNavKeys(coach('high_school'))).toEqual(['dashboard', 'team', 'development', 'messages']);
    expect(getBaseballBottomNavKeys(coach('academy'))).toEqual(['dashboard', 'team', 'development', 'messages']);
    expect(getBaseballBottomNavKeys(coach('club'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
    expect(getBaseballBottomNavKeys(coach('showcase'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
  });
});

describe('getBaseballBottomNavKeys — §3 table: player slot-3 differentiator', () => {
  it.each([
    ['college', 'player-stats-hub'],
    ['juco', 'player-recruiting-hub'],
    ['high_school', 'player-recruiting-hub'],
    ['showcase', 'player-profile'],
    ['academy', 'player-stats-hub'],
    ['club', 'player-stats-hub'],
  ] as const)('%s player slot 3 (index 2) is %s', (programType, expected) => {
    expect(getBaseballBottomNavKeys(player(programType))[2]).toBe(expected);
  });

  it('HS and JUCO players surface Recruiting/Exposure in slot 3 — not drawer/More-only', () => {
    expect(getBaseballBottomNavKeys(player('high_school'))).toContain('player-recruiting-hub');
    expect(getBaseballBottomNavKeys(player('juco'))).toContain('player-recruiting-hub');
  });

  it('full player key sets match the §3 table exactly', () => {
    expect(getBaseballBottomNavKeys(player('college'))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
    expect(getBaseballBottomNavKeys(player('juco'))).toEqual(['player-today', 'calendar', 'player-recruiting-hub', 'messages']);
    expect(getBaseballBottomNavKeys(player('high_school'))).toEqual(['player-today', 'calendar', 'player-recruiting-hub', 'messages']);
    expect(getBaseballBottomNavKeys(player('showcase'))).toEqual(['player-today', 'calendar', 'player-profile', 'messages']);
    expect(getBaseballBottomNavKeys(player('academy'))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
    expect(getBaseballBottomNavKeys(player('club'))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
  });
});

describe('getBaseballBottomNavKeys — showcase two-level org/team scope', () => {
  it('org scope = Organization/Teams/Events/Messages', () => {
    expect(getBaseballBottomNavKeys(coach('showcase', 'org'))).toEqual([
      'organization',
      'teams',
      'events',
      'messages',
    ]);
  });

  it('team scope = Dashboard/Team/Stats/Messages (coach college default)', () => {
    expect(getBaseballBottomNavKeys(coach('showcase', 'team'))).toEqual([
      'dashboard',
      'team',
      'stats-performance',
      'messages',
    ]);
  });

  it('"Back to Organization" never appears in either showcase scope', () => {
    expect(getBaseballBottomNavKeys(coach('showcase', 'org'))).not.toContain('back-to-organization');
    expect(getBaseballBottomNavKeys(coach('showcase', 'team'))).not.toContain('back-to-organization');
  });

  it('showcaseScope takes precedence over the variant differentiator for a showcase coach', () => {
    // Even though the showcase variant's generic (non-scoped) differentiator
    // is 'stats-performance', org scope must still resolve to the org-only
    // key set, not the generic coach default.
    const org = getBaseballBottomNavKeys(coach('showcase', 'org'));
    expect(org).not.toEqual(getBaseballBottomNavKeys(coach('showcase')));
  });
});

describe('getBaseballBottomNavKeys — fail-closed default (unresolved programType)', () => {
  it('coach default is Dashboard/Team/Stats/Messages — every key always-visible', () => {
    expect(getBaseballBottomNavKeys(coach(null))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
  });

  it('player default is Today/Schedule/Stats/Messages — every key always-visible', () => {
    expect(getBaseballBottomNavKeys(player(null))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
  });
});
