// =============================================================================
// src/lib/bridge/nav-registry.test.ts
//
// M1 (2026-07-10, Doctrine Rule 9) — pins Bridge's route-reveal classifier to
// reality:
//   1. Every ADMIN_NAV tab href classifies as a lateral (instant) destination.
//   2. BRIDGE_LATERAL_HREFS is derived from ADMIN_NAV, not hand-duplicated —
//      adding a tab there makes it lateral here with no second edit.
//   3. A fixture list of genuine detail leaves (a single error group, a single
//      user, a single deploy, a golf sub-page not itself in ADMIN_NAV)
//      classifies as a forward push.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { ADMIN_NAV } from '@/app/admin/_components/admin-nav';
import { BRIDGE_LATERAL_HREFS, isBridgeLateralDestination } from './nav-registry';

describe('bridge nav-registry — isBridgeLateralDestination (Doctrine Rule 9, M1)', () => {
  it('sanity: ADMIN_NAV was actually collected', () => {
    expect(ADMIN_NAV.length).toBeGreaterThan(5);
  });

  it('BRIDGE_LATERAL_HREFS is derived from ADMIN_NAV (same size, same members)', () => {
    expect(BRIDGE_LATERAL_HREFS.size).toBe(ADMIN_NAV.length);
    for (const entry of ADMIN_NAV) {
      expect(BRIDGE_LATERAL_HREFS.has(entry.href)).toBe(true);
    }
  });

  it.each(ADMIN_NAV.map((entry) => [entry.label, entry.href] as const))(
    '%s (%s) classifies as LATERAL',
    (_label, href) => {
      expect(isBridgeLateralDestination(href)).toBe(true);
    },
  );

  // Fixture list of genuine detail leaves / non-tab sub-pages — never a
  // member of ADMIN_NAV, so each must classify as a forward push.
  const detailFixtures = [
    '/admin/errors/some-fingerprint',
    '/admin/users/user-1',
    '/admin/teams/team-1',
    '/admin/golf/tracer',
  ];

  it.each(detailFixtures.map((href) => [href] as const))(
    '%s (detail leaf / non-tab sub-page) classifies as PUSH',
    (href) => {
      expect(isBridgeLateralDestination(href)).toBe(false);
    },
  );
});
