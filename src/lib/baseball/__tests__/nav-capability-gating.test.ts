// =============================================================================
// Regression test for the "Routes & Nav — capability context wiring" fix.
//
// THE BUG: the dashboard layouts never passed a resolved navContext to the
// shell, so the nav was filtered with an EMPTY capability map and every
// capability-gated coach vertical was permanently hidden — even for a head
// coach who implicitly holds every capability server-side.
//
// These tests lock the contract end-to-end at the registry layer (the pure,
// isomorphic boundary the layouts now feed via getBaseballNavContext):
//   1. The old empty-capability fallback hides ALL six gated coach entries.
//   2. A fully-resolved head-coach capability map reveals ALL six.
//   3. A partial (specialized-staff) map reveals exactly the held entries.
//   4. Players never see capability-gated entries.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  BASEBALL_NAV_REGISTRY,
  getPrimaryBaseballNav,
  getSecondaryBaseballNav,
  getVisibleBaseballNav,
  type BaseballNavContext,
} from '../nav-registry';
import {
  BASEBALL_CAPABILITY_KEYS,
  type BaseballCapabilityMap,
} from '../capabilities';
import { STAFF_CAPABILITY_ROUTES } from '@/lib/supabase/middleware';

// The six capability-gated coach feature verticals that were orphaned-in-practice.
const GATED_ENTRY_IDS = [
  'import-center', // can_manage_imports
  'postgame-review', // can_manage_stats
  'practice-effectiveness', // can_manage_practice
  'staff-decision-room', // can_manage_settings
  'staff-settings', // can_invite_staff
  'program-settings', // can_manage_settings
] as const;

function allCaps(value: boolean): BaseballCapabilityMap {
  return BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as BaseballCapabilityMap);
}

function visibleIds(ctx: BaseballNavContext): Set<string> {
  return new Set(getVisibleBaseballNav(ctx).map((e) => e.id));
}

describe('baseball nav capability gating (context-wiring regression)', () => {
  it('REPRODUCES THE BUG: empty capability map hides every gated coach entry', () => {
    // This is exactly the fail-closed fallback the shell used when no navContext
    // was passed: { role: 'coach', capabilities: {} }.
    const fallback: BaseballNavContext = { role: 'coach', capabilities: {} };
    const ids = visibleIds(fallback);
    for (const id of GATED_ENTRY_IDS) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('THE FIX: a head coach (all caps resolved) sees ALL six gated entries', () => {
    const headCoach: BaseballNavContext = {
      role: 'coach',
      capabilities: allCaps(true),
    };
    const ids = visibleIds(headCoach);
    for (const id of GATED_ENTRY_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('the two secondary (More) gated entries appear for a head coach', () => {
    const headCoach: BaseballNavContext = {
      role: 'coach',
      capabilities: allCaps(true),
    };
    const secondaryIds = getSecondaryBaseballNav(headCoach).map((e) => e.id);
    expect(secondaryIds).toContain('staff-settings');
    expect(secondaryIds).toContain('program-settings');
  });

  it('partial (specialized staff) caps reveal exactly the held gated entries', () => {
    // A stats analyst: only can_manage_stats. Should see Postgame Review but NOT
    // Import Center / Practice Effectiveness / Decision Room / Settings.
    const analyst: BaseballNavContext = {
      role: 'coach',
      capabilities: { ...allCaps(false), can_manage_stats: true },
    };
    const ids = visibleIds(analyst);
    expect(ids.has('postgame-review')).toBe(true);
    expect(ids.has('import-center')).toBe(false);
    expect(ids.has('practice-effectiveness')).toBe(false);
    expect(ids.has('staff-decision-room')).toBe(false);
    expect(ids.has('staff-settings')).toBe(false);
    expect(ids.has('program-settings')).toBe(false);
  });

  it('ungated coach surfaces stay visible regardless of capabilities', () => {
    const fallback: BaseballNavContext = { role: 'coach', capabilities: {} };
    const primaryIds = getPrimaryBaseballNav(fallback).map((e) => e.id);
    // Command Center / Signals / Roster / Stats Center / Practice / Performance
    // are role-gated only (requiredCapability: null) and must always show.
    expect(primaryIds).toContain('command-center');
    expect(primaryIds).toContain('signals');
    expect(primaryIds).toContain('roster');
    expect(primaryIds).toContain('stats-center');
  });

  // ===========================================================================
  // Middleware <-> registry mirror guard.
  //
  // Defense-in-depth: every registry entry that declares a requiredCapability is
  // ALSO gated in middleware (STAFF_CAPABILITY_ROUTES) so an unauthorized staffer
  // is redirected BEFORE the page renders, not just shown the page's own
  // authorized:false envelope. This guard fails CI if the two ever drift —
  // closing the "completeness" gap where practice-effectiveness (and historically
  // postgame) were registry-gated but absent from middleware.
  // ===========================================================================
  describe('middleware mirrors the registry requiredCapability map', () => {
    const middlewareMap = new Map(
      STAFF_CAPABILITY_ROUTES.map(([route, cap]) => [route, cap]),
    );

    it('every registry capability-gated route is gated in middleware with the SAME capability', () => {
      for (const entry of BASEBALL_NAV_REGISTRY) {
        if (!entry.requiredCapability) continue;
        expect(
          middlewareMap.has(entry.href),
          `nav-registry entry "${entry.id}" (${entry.href}) requires ${entry.requiredCapability} but is NOT in middleware STAFF_CAPABILITY_ROUTES`,
        ).toBe(true);
        expect(
          middlewareMap.get(entry.href),
          `middleware capability for ${entry.href} must match the registry's requiredCapability`,
        ).toBe(entry.requiredCapability);
      }
    });

    it('the two formerly-missing routes are present (regression lock)', () => {
      expect(middlewareMap.get('/baseball/dashboard/practice-effectiveness')).toBe(
        'can_manage_practice',
      );
      expect(middlewareMap.get('/baseball/dashboard/postgame')).toBe(
        'can_manage_stats',
      );
    });

    it('every middleware route maps to a known capability and a real registry surface (or an allowlisted write sub-route)', () => {
      // stats/upload is a finer write sub-route of Stats Center with no own
      // registry row; it is the only allowed entry without a 1:1 registry href.
      const ALLOWLISTED_NON_REGISTRY = new Set(['/baseball/dashboard/stats/upload']);
      const registryHrefs = new Set(BASEBALL_NAV_REGISTRY.map((e) => e.href));
      for (const [route, cap] of STAFF_CAPABILITY_ROUTES) {
        // STAFF_CAPABILITY_ROUTES types the capability column as a plain string
        // (config shape); widen the typed key list to compare membership.
        expect(
          (BASEBALL_CAPABILITY_KEYS as readonly string[]).includes(cap),
          `middleware route ${route} maps to unknown capability ${cap}`,
        ).toBe(true);
        if (ALLOWLISTED_NON_REGISTRY.has(route)) continue;
        expect(
          registryHrefs.has(route),
          `middleware route ${route} has no matching nav-registry entry (and is not an allowlisted write sub-route)`,
        ).toBe(true);
      }
    });
  });

  it('players never see capability-gated coach entries (even with caps set)', () => {
    // Defence in depth: even a forged player context carrying caps must not
    // reveal staff entries — the registry hides gated entries from non-coaches.
    const player: BaseballNavContext = {
      role: 'player',
      capabilities: allCaps(true),
    };
    const ids = visibleIds(player);
    for (const id of GATED_ENTRY_IDS) {
      expect(ids.has(id)).toBe(false);
    }
  });
});
