/**
 * ============================================================================
 * Fairway · app-shell · more-nav (M1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * PURE + ISOMORPHIC (no React import, no 'use client'/'use server') — the
 * single overflow mechanism the More sheet (`MoreNavSheet.tsx`) and both
 * product shells (GolfHelm's `FairwayDashboardShell.tsx`, BaseballHelm's
 * `BaseballFairwayShell.tsx`) share, per docs/MOBILE_DOCTRINE.md Rule 6/10:
 * the bottom bar carries the role's 4 daily destinations; everything else the
 * rail already declares is the sheet's overflow — computed from the SAME
 * `sections` the rail renders, never a second hand-maintained list.
 *
 *   selectOverflow    — sections minus the 4 bottom-nav hrefs (deduped),
 *                        preserving the rail's own grouping + order.
 *   summarizeMoreTab  — active/badge math for the bottom bar's 5th "More"
 *                        column (lights up + carries an aggregate badge).
 *
 * Importable server-side and unit-testable without mounting any 'use client'
 * shell — mirrors nav-registry.ts's purity contract.
 * ========================================================================== */

import type { NavItem, NavSection } from './types';

/** Segment-boundary active match — the single implementation `MoreNavSheet`
 *  imports (`more-nav.ts` is "the single overflow mechanism... never a
 *  second hand-maintained list"). Exported as a plain function (no React,
 *  no 'use client' dependency introduced) so isomorphic consumers can still
 *  import this module server-side. */
export function matchActive(href: string, pathname?: string): boolean {
  if (!pathname) return false;
  const segments = href.split('/').filter(Boolean);
  if (segments.length <= 2) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

function isItemActive(item: NavItem, pathname?: string): boolean {
  return (
    item.active ??
    (item.activeMatch && pathname ? item.activeMatch(pathname) : matchActive(item.href, pathname))
  );
}

/**
 * The More sheet's content: every rail item NOT already on the bottom bar,
 * grouped exactly as the rail groups them. Filters each section's items to
 * those whose href isn't in `excludeHrefs`, dedupes repeated hrefs (a href
 * that appears in two sections — e.g. a shared "back" row — only surfaces
 * once, in its FIRST section), and drops any section left with zero items
 * (docs/MOBILE_DOCTRINE.md Rule 3: "Empty sections never render").
 */
export function selectOverflow(
  sections: readonly NavSection[],
  excludeHrefs: readonly string[],
): NavSection[] {
  const excluded = new Set(excludeHrefs);
  const seen = new Set<string>();
  const overflow: NavSection[] = [];

  for (const section of sections) {
    const items: NavItem[] = [];
    for (const item of section.items) {
      if (excluded.has(item.href) || seen.has(item.href)) continue;
      seen.add(item.href);
      items.push(item);
    }
    if (items.length > 0) overflow.push({ heading: section.heading, items });
  }

  return overflow;
}

/** The bottom bar's 5th "More" column state: lit when the current route is
 *  one of the overflow destinations; badge is the SUM of every hidden
 *  destination's unread count (undefined — never a fake 0 — when the sum is
 *  zero), so a hidden unread count is never silently lost. */
export interface MoreTabSummary {
  readonly active: boolean;
  readonly badge?: number;
}

export function summarizeMoreTab(overflow: readonly NavSection[], pathname?: string): MoreTabSummary {
  let active = false;
  let badgeSum = 0;

  for (const section of overflow) {
    for (const item of section.items) {
      if (isItemActive(item, pathname)) active = true;
      if (typeof item.badge === 'number' && item.badge > 0) badgeSum += item.badge;
    }
  }

  return { active, badge: badgeSum > 0 ? badgeSum : undefined };
}
