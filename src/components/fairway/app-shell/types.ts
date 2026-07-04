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
