// =============================================================================
// src/lib/bridge/nav-registry.ts
//
// M1 (2026-07-10) — Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md): "Tab switches
// are instant." Bridge (the /admin super-admin console) previously had NO
// route-reveal architecture at all — navigation was an abrupt content cut.
// This module is Bridge's half of the single shared classifier every
// dashboard's `template.tsx` calls into (src/lib/motion/route-motion.ts's
// useRouteRevealMotion): it says which pathnames are registered LATERAL
// destinations (instant tab swap) vs. everything else (a forward/detail push,
// which reveals).
//
// PURE + ISOMORPHIC: no 'use client' / 'use server', no Supabase, no React
// runtime — only data + a pure function, safe to import from server or
// client code alike (mirrors src/lib/golf/nav-registry.ts and
// src/lib/baseball/nav-registry.ts exactly).
// =============================================================================

import { ADMIN_NAV } from '@/app/admin/_components/admin-nav';

/**
 * Every primary Bridge tab (src/app/admin/_components/admin-nav.ts's
 * ADMIN_NAV — Overview, Activity, Errors, Auth & Sign-ins, Golf, Baseball,
 * Ben + Leah, Work log, Users & Teams, Jobs & Integrity, Deploys & Infra,
 * Health). Derived from ADMIN_NAV directly rather than hand-listed, so this
 * Set can never drift from the tab bar it is meant to classify — adding a
 * new ADMIN_NAV entry makes it lateral automatically, with no second edit.
 */
export const BRIDGE_LATERAL_HREFS: ReadonlySet<string> = new Set(ADMIN_NAV.map((entry) => entry.href));

/**
 * True when `pathname` is a registered lateral navigation destination (one of
 * Bridge's primary tabs). A detail leaf that hangs off a tab (e.g. a single
 * error group under /admin/errors, a single deploy under /admin/deploys) is
 * never a member of this Set, so it correctly falls through to a "push"
 * reveal with zero maintenance per new detail route.
 */
export function isBridgeLateralDestination(pathname: string): boolean {
  return BRIDGE_LATERAL_HREFS.has(pathname);
}
