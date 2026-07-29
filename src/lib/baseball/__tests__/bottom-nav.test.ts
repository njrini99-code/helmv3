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
import { getProgramVariant } from '../program-type-variants';
import { isNavKeyDisabled, isRecruitingEnabled } from '../product-modules';

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
  // NOTE: `juco` reads 'stats-performance', not the §3 table's 'recruiting'.
  // That is the recruiting-sunset fallback, not table drift — see the
  // "recruiting-sunset interaction" describe at the bottom of this file, which
  // asserts both the substitution and that the §3 intent is still DECLARED in
  // program-type-variants.ts for the day the module returns.
  it.each([
    ['college', 'stats-performance'],
    ['juco', 'stats-performance'],
    ['high_school', 'development'],
    ['academy', 'development'],
    ['club', 'stats-performance'],
    ['showcase', 'stats-performance'],
  ] as const)('%s coach slot 3 (index 2) is %s', (programType, expected) => {
    expect(getBaseballBottomNavKeys(coach(programType))[2]).toBe(expected);
  });

  it('full coach key sets match the §3 table exactly', () => {
    expect(getBaseballBottomNavKeys(coach('college'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
    expect(getBaseballBottomNavKeys(coach('juco'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
    expect(getBaseballBottomNavKeys(coach('high_school'))).toEqual(['dashboard', 'team', 'development', 'messages']);
    expect(getBaseballBottomNavKeys(coach('academy'))).toEqual(['dashboard', 'team', 'development', 'messages']);
    expect(getBaseballBottomNavKeys(coach('club'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
    expect(getBaseballBottomNavKeys(coach('showcase'))).toEqual(['dashboard', 'team', 'stats-performance', 'messages']);
  });
});

describe('getBaseballBottomNavKeys — §3 table: player slot-3 differentiator', () => {
  // Same note as the coach table above: `juco`/`high_school` read
  // 'player-stats-hub' rather than the §3 table's 'player-recruiting-hub'
  // because of the recruiting sunset, not because the table changed.
  it.each([
    ['college', 'player-stats-hub'],
    ['juco', 'player-stats-hub'],
    ['high_school', 'player-stats-hub'],
    ['showcase', 'player-profile'],
    ['academy', 'player-stats-hub'],
    ['club', 'player-stats-hub'],
  ] as const)('%s player slot 3 (index 2) is %s', (programType, expected) => {
    expect(getBaseballBottomNavKeys(player(programType))[2]).toBe(expected);
  });

  it('HS and JUCO players surface Recruiting/Exposure in slot 3 once the module ships — declared, not rendered today', () => {
    // The §3 design intent ("exposure IS the defining reason an HS recruit
    // opens the app") is preserved in the variant table verbatim; only the
    // read-time gate suppresses it. Asserting the DECLARATION here keeps that
    // intent under test through the sunset instead of quietly deleting it.
    expect(getProgramVariant('high_school').playerBottomNavRows).toContain('player-recruiting-hub');
    expect(getProgramVariant('juco').playerBottomNavRows).toContain('player-recruiting-hub');
    expect(getProgramVariant('juco').coachBottomNavHubs).toContain('recruiting');
  });

  it('full player key sets match the §3 table exactly', () => {
    expect(getBaseballBottomNavKeys(player('college'))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
    expect(getBaseballBottomNavKeys(player('juco'))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
    expect(getBaseballBottomNavKeys(player('high_school'))).toEqual(['player-today', 'calendar', 'player-stats-hub', 'messages']);
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

/**
 * RESOLVED — recruiting-sunset interaction (recon item 4).
 *
 * Recruiting is disabled globally for the commercial release
 * (src/lib/baseball/product-modules.ts, sunset 2026-07-29). BaseballFairwayShell
 * no longer emits a NavItem carrying navKey 'recruiting' (coach) or
 * 'player-recruiting-hub' (player) for ANY program type — see
 * buildCoachHubSections / buildPlayerNavSections in BaseballFairwayShell.tsx
 * and coachHubs()/playerHubs() in resolve-active-hub.ts, both gated on
 * isRecruitingEnabled().
 *
 * program-type-variants.ts still DECLARES 'recruiting' (JUCO coach) and
 * 'player-recruiting-hub' (JUCO + HS player) as those modes' slot-3
 * differentiator, and that declaration is deliberately left intact — it is
 * still the right answer the day the module returns. The failure mode it
 * created was silent: BaseballFairwayShell resolves each bottom-nav key via
 * `byNavKey.get(key)` and DROPS any key with no match (`.filter(Boolean)`), so
 * those three bars rendered 3 tabs instead of 4 — an empty slot, not a
 * stale-but-harmless label, and a MOBILE_DOCTRINE Rule 10 violation.
 *
 * FIX (bottom-nav.ts `resolveDifferentiator`): the module gate is applied at
 * READ time. A differentiator naming a disabled module falls back to the same
 * always-visible, capability-free key the function already used when a mode
 * declared no differentiator at all — 'stats-performance' / 'player-stats-hub',
 * the same keys COACH_FAILCLOSED_KEYS / PLAYER_FAILCLOSED_KEYS use. No new nav
 * item was invented; the fallback was already declared in this file.
 *
 * The bar stays 4 tabs, those three modes lose their distinctiveness (Stats is
 * shared with other modes) until either recruiting returns or a deliberate
 * non-recruiting differentiator is chosen for them in program-type-variants.ts.
 * That remains an open product call — but a duller bar beats a broken one.
 */
describe('getBaseballBottomNavKeys — recruiting-sunset interaction', () => {
  const moduleIsOff = () => expect(isRecruitingEnabled()).toBe(false);

  it('still returns exactly 4 keys for every mode whose declared differentiator is sunset', () => {
    moduleIsOff();
    for (const ctx of [coach('juco'), player('juco'), player('high_school')]) {
      expect(getBaseballBottomNavKeys(ctx)).toHaveLength(4);
    }
  });

  it('substitutes Stats for the JUCO coach\'s sunset Recruiting differentiator', () => {
    moduleIsOff();
    expect(getBaseballBottomNavKeys(coach('juco'))[2]).toBe('stats-performance');
  });

  it('substitutes Stats for the JUCO + HS players\' sunset Recruiting differentiator', () => {
    moduleIsOff();
    expect(getBaseballBottomNavKeys(player('juco'))[2]).toBe('player-stats-hub');
    expect(getBaseballBottomNavKeys(player('high_school'))[2]).toBe('player-stats-hub');
  });

  it('never emits a key belonging to a disabled module, in any slot, for any role x mode', () => {
    // The general invariant behind the three cases above: whatever the variant
    // tables say, a bottom-nav key must always resolve to something the shell
    // can render. This is what stops the next sunset from silently shrinking
    // a bar again.
    for (const programType of [...BASEBALL_PROGRAM_TYPES, null]) {
      for (const ctx of [coach(programType), player(programType)]) {
        for (const key of getBaseballBottomNavKeys(ctx)) {
          expect(
            isNavKeyDisabled(key),
            `${ctx.role}/${programType ?? 'unresolved'} emitted disabled key "${key}"`,
          ).toBe(false);
        }
      }
    }
  });

  it('leaves every other mode\'s declared differentiator untouched (fallback blast radius)', () => {
    // The fallback must fire for the three sunset bars and nowhere else: for
    // every other mode, slot 3 still equals what the variant table declares.
    for (const pt of BASEBALL_PROGRAM_TYPES) {
      const declaredCoach = getProgramVariant(pt).coachBottomNavHubs[0];
      const declaredPlayer = getProgramVariant(pt).playerBottomNavRows[0];
      if (declaredCoach && !isNavKeyDisabled(declaredCoach)) {
        expect(getBaseballBottomNavKeys(coach(pt))[2], `${pt} coach`).toBe(declaredCoach);
      }
      if (declaredPlayer && !isNavKeyDisabled(declaredPlayer)) {
        expect(getBaseballBottomNavKeys(player(pt))[2], `${pt} player`).toBe(declaredPlayer);
      }
    }
  });

  it('preserves the sunset modes\' declarations rather than rewriting the variant table', () => {
    // The fix is a read-time gate, NOT an edit to program-type-variants.ts.
    // If someone "fixes" this by rewriting the table, restoration silently
    // loses the JUCO/HS design intent — so pin that it is still declared.
    expect(getProgramVariant('juco').coachBottomNavHubs[0]).toBe('recruiting');
    expect(getProgramVariant('juco').playerBottomNavRows[0]).toBe('player-recruiting-hub');
    expect(getProgramVariant('high_school').playerBottomNavRows[0]).toBe('player-recruiting-hub');
  });
});
