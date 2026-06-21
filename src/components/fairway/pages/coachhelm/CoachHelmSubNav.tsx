'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · CoachHelmSubNav — THE keystone sub-nav primitive
 * ----------------------------------------------------------------------------
 * The persistent 5-tab underline strip that unifies the CoachHelm cluster:
 *   Brief · Signals · Players · Effectiveness · Ask
 *
 * ENGINE (blueprint subNavEngine — explicit):
 *   • Each tab is a REAL Next <Link> to its route (full SSR per route) — this is
 *     NOT a Radix ToggleGroup value-emitter and NOT ViewHeaderSegments. The
 *     surfaces live in 4 different folder trees so a single route-group layout
 *     cannot wrap them; the sub-nav is a shared COMPONENT instead.
 *   • Active tab is resolved by a longest-prefix `usePathname()` ROUTE→TAB map,
 *     so /coachhelm/genome/[id] and /development both light the Players tab.
 *   • Each surface ALSO passes an explicit `active` prop as the SSR-known
 *     fallback so the correct tab paints before hydration (no flash) — the prop
 *     wins until the client pathname resolves to a known tab.
 *   • aria-current='page' on the active tab; roving tabindex (only the active
 *     tab is in the tab order, arrows move focus); visible green focus-visible
 *     ring; a slow framer-motion `layoutId` underline glides between tabs
 *     (honors prefers-reduced-motion).
 *   • The Signals tab carries the ambient unread badge (urgent/high open
 *     signals) sourced ONCE by the shell (getAlertCounts → signalCount).
 *
 * PLAYER VARIANT (cohesion: PLAYER SHELL VARIANT):
 *   role='player' shows Brief + Players ONLY (Ask / Effectiveness / Signals-as-
 *   triage hidden). The player surfaces still mount the same shell + sub-nav.
 *
 * ADDITIVE ONLY — imported by nothing in the live app. Renders correctly inside
 * a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway/controls/badge';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';

/* ---------------------------------------------------------------------------
 * Tab vocabulary
 * ------------------------------------------------------------------------- */

/** The canonical CoachHelm shell tabs (the union the shell shares). */
export type CoachHelmTab = 'brief' | 'signals' | 'players' | 'standing' | 'effectiveness' | 'ask';

/** Which role's tab set is shown. */
export type CoachHelmRole = 'coach' | 'player';

interface TabDef {
  tab: CoachHelmTab;
  label: string;
  /** The canonical destination route for this tab. */
  href: string;
  /**
   * Route prefixes that should resolve to this tab (longest-prefix wins). The
   * canonical `href` is always included implicitly.
   */
  matchPrefixes: string[];
}

/**
 * The route→tab map. Order is the visual tab order; matching uses the LONGEST
 * matching prefix across ALL tabs so nested leaves (genome detail, compare)
 * resolve to Players, and the three Signals routes (alerts/insights/patterns)
 * all resolve to Signals.
 */
const TABS: readonly TabDef[] = [
  {
    tab: 'brief',
    label: 'Brief',
    href: '/golf/dashboard/intelligence',
    matchPrefixes: ['/golf/dashboard/intelligence'],
  },
  {
    tab: 'signals',
    label: 'Signals',
    href: '/golf/dashboard/alerts',
    matchPrefixes: [
      '/golf/dashboard/alerts',
      '/golf/dashboard/insights',
      '/golf/dashboard/patterns',
    ],
  },
  {
    tab: 'players',
    label: 'Players',
    href: '/golf/dashboard/development',
    matchPrefixes: [
      '/golf/dashboard/development',
      '/golf/dashboard/coachhelm/genome',
      // The coach player-detail surfaces (AI Insight + its /game fingerprint leaf)
      // live under /players/[id]; they are the Players-tab leaves, so they must
      // light the Players tab to read as part of the CoachHelm cluster (P410).
      '/golf/dashboard/players',
      '/golf/dashboard/my-development',
    ],
  },
  {
    tab: 'effectiveness',
    label: 'Effectiveness',
    href: '/golf/dashboard/analytics/coachhelm',
    matchPrefixes: ['/golf/dashboard/analytics/coachhelm'],
  },
  {
    tab: 'ask',
    label: 'Ask',
    href: '/golf/dashboard/coachhelm/chat',
    matchPrefixes: ['/golf/dashboard/coachhelm/chat'],
  },
] as const;

/**
 * The player tab set — the single CoachHelm home: Overview · Development ·
 * Game Profile · Standing. Brief ("Overview") points at the player front door;
 * Development, Game Profile and Standing fold the former standalone
 * /my-development, /my-game-profile and /my-standing routes into the same shell
 * so a player has ONE AI surface instead of scattered routes.
 *
 * Game Profile reuses the coach-only `'effectiveness'` slot as its internal tab
 * key purely so it has a distinct identity in the player set without widening the
 * shared `CoachHelmTab` union (the coach `'effectiveness'` tab never appears in
 * the player set, so there is no collision) — its visible label + route are the
 * player's genome view (/my-game-profile).
 */
const PLAYER_TABS: readonly TabDef[] = [
  {
    tab: 'brief',
    label: 'Overview',
    href: '/golf/dashboard/coachhelm',
    // exact-only match below; the coachhelm root is the player front door, and
    // its nested /chat + /genome routes belong to OTHER tabs, so we match exact.
    matchPrefixes: [],
  },
  {
    tab: 'players',
    label: 'Development',
    href: '/golf/dashboard/my-development',
    matchPrefixes: ['/golf/dashboard/my-development'],
  },
  {
    tab: 'effectiveness',
    label: 'Game Profile',
    href: '/golf/dashboard/my-game-profile',
    matchPrefixes: ['/golf/dashboard/my-game-profile'],
  },
  {
    tab: 'standing',
    label: 'Standing',
    href: '/golf/dashboard/my-standing',
    matchPrefixes: ['/golf/dashboard/my-standing'],
  },
] as const;

/**
 * Resolve the active tab from a pathname using longest-prefix matching across
 * the given tab set. Returns null when nothing matches (caller falls back to the
 * SSR-known `active` prop).
 */
function resolveTabFromPath(
  pathname: string | null,
  tabs: readonly TabDef[],
  role: CoachHelmRole,
): CoachHelmTab | null {
  if (!pathname) return null;

  // Player "Overview" (the coachhelm front door) is matched EXACTLY so deeper
  // /coachhelm/* routes (chat, genome) don't accidentally claim it.
  if (role === 'player') {
    const overview = tabs.find((t) => t.tab === 'brief');
    if (overview && pathname === overview.href) return 'brief';
  }

  let best: { tab: CoachHelmTab; len: number } | null = null;
  for (const t of tabs) {
    const prefixes = role === 'player' && t.tab === 'brief' ? [] : [t.href, ...t.matchPrefixes];
    for (const p of prefixes) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && (!best || p.length > best.len)) {
        best = { tab: t.tab, len: p.length };
      }
    }
  }
  return best?.tab ?? null;
}

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export interface CoachHelmSubNavProps {
  /**
   * The SSR-known active tab — paints the correct tab before hydration so there
   * is no flash. Once the client pathname resolves to a known tab, that wins.
   */
  active: CoachHelmTab;
  /** Coach (5 tabs) or player (Brief + Players only). Default 'coach'. */
  role?: CoachHelmRole;
  /**
   * Unread urgent/high open-signal count for the Signals tab badge. `null` /
   * `0` / undefined → no badge (honest: never a fake "0"). Coach only.
   *
   * P414 — ONE SOURCE contract: this is the SAME number as the sidebar
   * "CoachHelm AI" cluster badge (FairwayDashboardShell badges.coachhelm). Both
   * derive from getAlertCounts().counts.critical (open urgent+high insights), so
   * the two never contradict when both are visible on a CoachHelm screen. The
   * only intentional divergence: the insights page passes `null` here to defer
   * to its on-page "Urgent + high" tile (the sidebar badge stays as the rail
   * cue). Callers MUST keep seeding this from getAlertCounts().counts.critical.
   */
  signalCount?: number | null;
  /** Accessible label for the nav landmark. Default "CoachHelm sections". */
  'aria-label'?: string;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * CoachHelmSubNav
 * ------------------------------------------------------------------------- */

export function CoachHelmSubNav({
  active,
  role = 'coach',
  signalCount,
  'aria-label': ariaLabel = 'CoachHelm sections',
  className,
}: CoachHelmSubNavProps) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const reactId = React.useId();
  const underlineLayoutId = `fw-coachhelm-subnav-underline-${reactId}`;

  const tabs = role === 'player' ? PLAYER_TABS : TABS;

  // Client pathname wins once it resolves to a known tab; else the SSR `active`.
  const resolved = resolveTabFromPath(pathname, tabs, role) ?? active;

  // Roving tabindex: only the active tab is in the tab order; arrows move focus.
  const itemRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.tab === resolved),
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      const count = tabs.length;
      if (count === 0) return;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = (activeIndex + 1) % count;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (activeIndex - 1 + count) % count;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      itemRefs.current[next]?.focus();
    },
    [activeIndex, tabs.length],
  );

  // The Signals badge: coach only, and only when there is a real count > 0.
  const showSignalBadge =
    role === 'coach' && typeof signalCount === 'number' && signalCount > 0;

  return (
    <nav
      aria-label={ariaLabel}
      data-slot="coachhelm-subnav"
      data-role={role}
      className={cn('w-full border-b border-border-subtle', className)}
    >
      {/* A real navigation list of route links — NOT a tablist. Each item is a
          Next <Link> that navigates to a route, with aria-current="page" on the
          active one; a role="tablist" of non-tab links is an invalid ARIA
          pattern (WCAG 2.2 4.1.2). The <nav aria-label> landmark supplies the
          accessible grouping; roving tabindex + arrow keys remain as a keyboard
          enhancement over the link list. */}
      <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t, i) => {
          const isActive = t.tab === resolved;
          const isSignals = t.tab === 'signals';
          return (
            <li key={t.tab} className="relative">
              <Link
                href={t.href}
                ref={(node) => {
                  itemRefs.current[i] = node;
                }}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={onKeyDown}
                data-active={isActive ? '' : undefined}
                className={cn(
                  'group relative inline-flex select-none items-center gap-2 whitespace-nowrap rounded-fw-sm px-3.5 pb-3 pt-2.5',
                  'font-fw-sans text-label font-medium',
                  fwTransition,
                  fwFocusRing,
                  isActive
                    ? 'text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                <span className="relative">{t.label}</span>

                {/* Signals unread badge — coach only, real count only. */}
                {isSignals && showSignalBadge ? (
                  <Badge
                    tone="accent"
                    size="sm"
                    numeric
                    aria-label={`${signalCount} unread urgent or high signals`}
                  >
                    {signalCount}
                  </Badge>
                ) : null}

                {/* The gliding active underline (layoutId; honors reduced-motion). */}
                {isActive ? (
                  <motion.span
                    layoutId={reduceMotion ? undefined : underlineLayoutId}
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-500"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 360, damping: 34, mass: 0.7 }
                    }
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
