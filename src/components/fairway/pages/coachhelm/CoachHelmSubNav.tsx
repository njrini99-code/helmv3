'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · CoachHelmSubNav — THE keystone sub-nav primitive
 * ----------------------------------------------------------------------------
 * Historically the persistent 5-tab underline strip that unified the coach
 * CoachHelm cluster (Brief · Signals · Players · Effectiveness · Ask). The
 * Spine & Stage redesign (2026-07-19, plan Task 9) folded Signals/Players/
 * Effectiveness into `?view=` drills of the Brief home itself (mirroring
 * Task 8's player consolidation below) — the STAGE is the coach's nav for
 * that content now, so the coach strip collapses to the single Brief tab,
 * same shape as the player strip's single Overview tab.
 *
 * ENGINE (blueprint subNavEngine — explicit):
 *   • Each tab is a REAL Next <Link> to its route (full SSR per route) — this is
 *     NOT a Radix ToggleGroup value-emitter and NOT ViewHeaderSegments. The
 *     surfaces live in 4 different folder trees so a single route-group layout
 *     cannot wrap them; the sub-nav is a shared COMPONENT instead.
 *   • A collapsed single-tab strip (coach Brief-only, player Overview-only)
 *     matches its href EXACTLY — deeper nested routes (chat, genome, the
 *     `?view=`/`?filter=` stage drills) never fight it for the active state;
 *     the stage itself owns navigation identity below that one front door.
 *   • Each surface ALSO passes an explicit `active` prop as the SSR-known
 *     fallback so the correct tab paints before hydration (no flash) — the prop
 *     wins until the client pathname resolves to a known tab.
 *   • aria-current='page' on the active tab; roving tabindex (only the active
 *     tab is in the tab order, arrows move focus); visible green focus-visible
 *     ring; a slow framer-motion `layoutId` underline glides between tabs
 *     (honors prefers-reduced-motion).
 *
 * LIVE — unconditional, no redesign flag. Rendered by every CoachHelmShell
 * mount (~15 live coach + player route surfaces, including the legacy
 * Signals/Players/Effectiveness monoliths now mounted INSIDE the Brief
 * home's stage drills). Renders inside a `.fairway-ds` scope on a
 * `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway/controls/badge';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';
import { surfaceName } from '@/lib/golf/surface-registry';

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
 * The coach tab set — a single Brief entry. Signals, Players, and
 * Effectiveness used to be sibling tabs pointing at standalone /alerts
 * (+ /insights, /patterns), /development, and /analytics/coachhelm routes;
 * the Spine & Stage redesign (2026-07-19, plan Task 9) folded all three into
 * `?view=` drills of the Brief home itself, so the STAGE is the coach's nav
 * for that content now — a persistent strip of tabs that all led back to the
 * same page would be redundant chrome. Their `surface-registry.ts` entries
 * are `legacy: true, hidden: true`; this strip still renders the ONE tab a
 * coach-role `CoachHelmShell` mount needs — including the legacy Signals/
 * Players/Effectiveness monoliths now mounted INSIDE the Brief home's own
 * stage drills, which still pass `active="signals"` etc. for parity; those
 * values simply aren't in this collapsed tab set, so they render no strip
 * tab of their own (matched to the single Brief tab via the exact-href rule
 * below instead).
 */
const COACH_TABS: readonly TabDef[] = [
  {
    tab: 'brief',
    label: surfaceName('brief'),
    href: '/golf/dashboard/intelligence',
    // exact-only match below; the intelligence root is the coach front door,
    // and its `?view=`/`?filter=` stage drills all share that SAME pathname.
    matchPrefixes: [],
  },
] as const;

/**
 * The player tab set — a single Overview entry. Development, Game Profile,
 * and Standing used to be sibling tabs pointing at standalone /my-development,
 * /my-game-profile and /my-standing routes; the Spine & Stage redesign
 * (2026-07-19, plan Task 8) folded all three into `?view=` drills of the
 * Overview home itself, so the STAGE is the player's nav for that content now
 * — a persistent strip of "tabs" that all led back to the same page would be
 * redundant chrome. Their `surface-registry.ts` entries are `legacy: true,
 * hidden: true`; this strip still renders the ONE tab a player-role
 * `CoachHelmShell` mount needs (e.g. the player Stats identity shell, which
 * uses `active="brief" role="player"` to show "you are in your CoachHelm AI
 * context" — see `FairwayPlayerStats.tsx`).
 */
const PLAYER_TABS: readonly TabDef[] = [
  {
    tab: 'brief',
    label: surfaceName('overview'),
    href: '/golf/dashboard/coachhelm',
    // exact-only match below; the coachhelm root is the player front door, and
    // its nested /chat + /genome routes belong to OTHER tabs, so we match exact.
    matchPrefixes: [],
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
): CoachHelmTab | null {
  if (!pathname) return null;

  // A collapsed single-tab strip (coach Brief-only, player Overview-only) is
  // the cluster's front door — match it EXACTLY so deeper nested routes
  // (chat, genome, the `?view=`/`?filter=` stage drills sharing that SAME
  // pathname) never fight it for the active state; the stage/subroute owns
  // its own identity below that one front door, not this strip.
  if (tabs.length === 1) {
    const only = tabs[0]!;
    return pathname === only.href ? only.tab : null;
  }

  let best: { tab: CoachHelmTab; len: number } | null = null;
  for (const t of tabs) {
    const prefixes = [t.href, ...t.matchPrefixes];
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
  /** Coach (single Brief tab) or player (single Overview tab). Default 'coach'. */
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

  const tabs = role === 'player' ? PLAYER_TABS : COACH_TABS;

  // Client pathname wins once it resolves to a known tab; else the SSR `active`.
  const resolved = resolveTabFromPath(pathname, tabs) ?? active;

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
