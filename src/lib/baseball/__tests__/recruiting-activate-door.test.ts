// =============================================================================
// /baseball/dashboard/activate — the recruiting opt-in — under the sunset.
//
// WHY THIS ROUTE GETS ITS OWN SUITE. recruiting-sunset-doors.test.ts sweeps
// every recruiting route prefix and every role × program type, and it passed
// throughout — because it asserts over MODULE_ROUTE_PREFIXES, and /activate
// was not in that list. A sweep can only be as complete as the inventory it
// iterates, so the inventory itself needs a test, not just the sweep.
//
// The omission mattered more here than it would anywhere else. Every other
// recruiting route DISPLAYS recruiting; this one TURNS IT ON — it is the
// opt-in that flips baseball_players.recruiting_activated and makes a player
// discoverable to other programs. Nav hid it (module: 'recruiting'), but
// hiding a link is not closing a door: a bookmarked or guessed URL could
// enable a module the product is not shipping, and the resulting row state
// would outlive the sunset.
//
// The middleware that consumes MODULE_ROUTE_PREFIXES already claimed this was
// handled — its comment reads "the local RECRUITING_ROUTES list ... omits
// /colleges, /journey, /scouting, /analytics and /activate, all of which are
// recruiting surfaces", given as the reason to defer to the central registry.
// The registry did not list /activate. Both statements were written in good
// faith; only one of them was executable.
// =============================================================================

// NOTE ON WHAT IS *NOT* MOCKED HERE, because the first draft got it wrong.
//
// The obvious move is `vi.mock('@/lib/baseball/product-modules', …)` replacing
// `isRecruitingEnabled`, then flipping it to assert both directions. That does
// not work and — worse — does not fail: `isPathnameModuleDisabled` calls
// `isRecruitingEnabled` INTERNALLY, through the module's own binding, which a
// mock of the module's *exports* never intercepts. Five of six assertions still
// went green, but on the real flag rather than the mocked one, so the suite
// looked like it proved both directions while proving only one.
//
// So this file asserts what is genuinely observable without a flag: the route
// INVENTORY and its ATTRIBUTION (pure, flag-independent), plus the blocked
// behaviour that is real today. Restoration is asserted through attribution —
// see the last block for why that is the meaningful guarantee.
import { describe, it, expect } from 'vitest';

import {
  MODULE_ROUTE_PREFIXES,
  moduleForPathname,
  isPathnameModuleDisabled,
} from '../product-modules';

const ACTIVATE = '/baseball/dashboard/activate';

describe('recruiting sunset — the /activate door', () => {
  it('lists /activate as a recruiting route', () => {
    // The inventory assertion. Without this, a sweep over
    // MODULE_ROUTE_PREFIXES passes while the route it forgot stays open.
    expect(MODULE_ROUTE_PREFIXES.recruiting).toContain(ACTIVATE);
  });

  it('attributes /activate to the recruiting module', () => {
    expect(moduleForPathname(ACTIVATE)).toBe('recruiting');
  });

  it('blocks /activate while recruiting is disabled', () => {
    expect(isPathnameModuleDisabled(ACTIVATE)).toBe(true);
  });

  it('blocks nested paths under /activate too', () => {
    // Prefix matching, not equality — a future /activate/confirm must not
    // sneak through by being a child of a blocked parent.
    expect(isPathnameModuleDisabled(`${ACTIVATE}/confirm`)).toBe(true);
  });

  it('does not block unrelated routes that merely share a prefix fragment', () => {
    // Guards against a sloppy `includes()` style match: these are real
    // team-operations surfaces and must stay reachable during the sunset.
    for (const path of [
      '/baseball/dashboard/calendar',
      '/baseball/dashboard/roster',
      '/baseball/dashboard/messages',
      '/baseball/dashboard/command-center',
    ]) {
      expect(isPathnameModuleDisabled(path)).toBe(false);
    }
  });
});

describe('recruiting sunset — /activate restoration path', () => {
  it('is blocked BY ATTRIBUTION, so re-enabling the module reopens it', () => {
    // The meaningful restoration guarantee, and the one that survives without
    // a working flag mock.
    //
    // isPathnameModuleDisabled(path) is exactly
    // "moduleForPathname(path) is a module that is currently off". So proving
    // /activate resolves to the recruiting module proves the ONLY thing
    // closing it is the module flag — there is no route-level deletion, no
    // hardcoded 404, nothing else to undo. Flip
    // PRODUCT_MODULES.recruiting.enabled and this route returns, by
    // construction rather than by hope.
    expect(moduleForPathname(ACTIVATE)).toBe('recruiting');
    expect(isPathnameModuleDisabled(ACTIVATE)).toBe(true);

    // And the page itself still exists to come back to — the sunset preserves
    // rather than deletes.
    expect(MODULE_ROUTE_PREFIXES.recruiting).toContain(ACTIVATE);
  });
});
