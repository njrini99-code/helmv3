/**
 * ============================================================================
 * Fairway · AppShell — shared types (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * Local type surface for the `app-shell` primitive group. Kept inside the group
 * folder per the Wave-1 self-containment rule — no top-level shared file.
 *
 * The nav model mirrors the STRUCTURE of `src/components/golf/layout/GolfSidebar`
 * (primary + secondary sections, icon + label + optional badge, active matching)
 * without importing or editing it. Pages feed these data shapes into the shell.
 * ========================================================================== */

import type { ComponentType, SVGAttributes } from 'react';

/** Icon component contract — matches `@/components/icons` (`IconProps`). */
export type FairwayIcon = ComponentType<{ size?: number; className?: string } & SVGAttributes<SVGElement>>;

/** A single navigation destination in the sidebar rail. */
export interface NavItem {
  /** Visible label + accessible name. */
  readonly label: string;
  /**
   * Compact label for the mobile bottom bar only. The bar splits the viewport
   * into equal columns, so at 320px a 9-character label truncates mid-word
   * ("CoachHelm" → "CoachH…", audit P-31). Rails and pop-outs always show the
   * full `label`, and `label` remains the accessible name everywhere — this
   * only shortens the glyph strip under the icon.
   */
  readonly shortLabel?: string;
  /** Destination href (rendered via the shell's `linkComponent`). */
  readonly href: string;
  /** Leading glyph. */
  readonly icon: FairwayIcon;
  /** Short operational copy shown in expanded rows and collapsed pop-outs. */
  readonly description?: string;
  /** Keyboard shortcut or route key shown as a compact hint. */
  readonly shortcut?: string;
  /** Small status label for command-center rails. */
  readonly meta?: string;
  /** Optional unread/notification count rendered as a pill. */
  readonly badge?: number;
  /** Force-mark active regardless of pathname matching (rare). */
  readonly active?: boolean;
  /**
   * Optional broader active predicate. When provided it OVERRIDES the default
   * segment-boundary `href` match — use it for rows whose destination is one
   * route but whose "section" spans a cluster of sibling routes (e.g. the
   * CoachHelm AI row, whose tab cluster lives at alerts/insights/patterns/…),
   * so the global rail keeps a current-location indicator across the cluster.
   */
  readonly activeMatch?: (pathname: string) => boolean;
  /**
   * Optional stable join key back to the source nav registry/hub id that
   * built this item (e.g. a BaseballNavHub id, a PLAYER_HUB_ROW_IDS value, or
   * a registry entry's `id`). Plain data — never a fresh element, so it can't
   * defeat `React.memo` on shell chrome. Used by BaseballFairwayShell.tsx to
   * resolve the 4 daily-loop bottom-nav keys (src/lib/baseball/bottom-nav.ts)
   * back to their built NavItem without re-deriving hrefs/labels/icons.
   * Ignored by GolfHelm (registry-built bottom nav) and Bridge.
   */
  readonly navKey?: string;
}

/** A labelled group of nav items (e.g. "Team Management", "More"). */
export interface NavSection {
  /** Section eyebrow shown above the group (omitted when the rail is collapsed). */
  readonly heading?: string;
  readonly items: readonly NavItem[];
}

/** A single crumb in the top-bar breadcrumb trail. */
export interface Breadcrumb {
  readonly label: string;
  /** When omitted, the crumb renders as plain text (the current page). */
  readonly href?: string;
}

/** Identity block shown at the top of the rail. */
export interface ShellUser {
  readonly name: string;
  readonly teamName?: string;
  readonly avatarUrl?: string;
}

/**
 * Minimal link element contract. Lets the shell render Next's `<Link>` (default)
 * or a plain `<a>` in isolation/tests without importing `next/link` here.
 */
export type ShellLinkComponent = ComponentType<{
  href: string;
  className?: string;
  children: React.ReactNode;
  'aria-current'?: 'page' | undefined;
  'aria-label'?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  title?: string;
}>;
