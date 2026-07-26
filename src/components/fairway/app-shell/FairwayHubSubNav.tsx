'use client';

/**
 * ============================================================================
 * Fairway · app-shell · FairwayHubSubNav — the shared sub-tab strip for
 * GolfHelm's grouped-hub rail items (WAVE W2, 2026-07-09).
 * ----------------------------------------------------------------------------
 * The ONE reusable sub-nav primitive for every golf hub that owns more than
 * one destination (Team, Calendar, Rounds & Stats, Messages, Operations for
 * coach; Team for player) — see src/lib/golf/nav-registry.ts, which supplies
 * `tabs` via resolveActiveGolfHub(pathname, role). Rendered ONCE at the shell
 * level (FairwayDashboardShell), above `{children}`, so every leaf route in a
 * hub gets the strip automatically — no per-page edits (mirrors BaseballHelm's
 * proven HubSubNav / resolve-active-hub pattern).
 *
 * The CoachHelm AI cluster is the one exception: it already has its own
 * dedicated 5-tab (coach) / 4-tab (player) strip
 * (src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx, rendered
 * per-page via <CoachHelmShell>) — this component is never used for that
 * cluster, so there is no double sub-nav on CoachHelm pages.
 *
 * Same engine as CoachHelmSubNav / BaseballHelm's HubSubNav: real Next
 * <Link>s (not a Radix tablist of non-tab links — invalid ARIA), longest-
 * prefix active resolution so nested leaves (rounds/[id], qualifiers/[id],
 * roster/[id]) still light their parent tab, aria-current="page", roving
 * tabindex + arrow-key movement, a visible focus ring, and a slow
 * framer-motion underline (honors prefers-reduced-motion).
 *
 * PURE PRESENTATION. No data fetching, no Supabase.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import type { GolfSubTab } from '@/lib/golf/nav-registry';

export interface FairwayHubSubNavProps {
  /** The tabs for this hub, in visual order (from a GolfHubDef). */
  tabs: readonly GolfSubTab[];
  /** Accessible label for the nav landmark (e.g. "Team sections"). */
  ariaLabel: string;
  className?: string;
}

/** Longest-prefix match across every tab's href + matchPrefixes. */
function resolveActiveTabId(pathname: string | null, tabs: readonly GolfSubTab[]): string | null {
  if (!pathname) return null;
  let best: { id: string; len: number } | null = null;
  for (const t of tabs) {
    const prefixes = [t.href, ...(t.matchPrefixes ?? [])];
    for (const p of prefixes) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && (!best || p.length > best.len)) {
        best = { id: t.id, len: p.length };
      }
    }
  }
  return best?.id ?? null;
}

export function FairwayHubSubNav({ tabs, ariaLabel, className }: FairwayHubSubNavProps) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const reactId = React.useId();
  const underlineLayoutId = `fw-hub-subnav-underline-${reactId}`;

  // Scroll affordance (#167/#180): this strip has no per-tab wrap or clip —
  // `whitespace-nowrap` + `overflow-x-auto` already let a tab's full label
  // scroll into view rather than clipping mid-word — but with the scrollbar
  // hidden (`[scrollbar-width:none]`) there was previously zero visual signal
  // that more tabs exist off-screen. `useScrollFade` supplies the same
  // real alpha `mask-image` edge-bleed used by ViewHeader's segment strip and
  // StatStrip's rail — it fades only the edge(s) that actually have hidden
  // content (none at rest if every tab fits).
  const { ref: fadeRef, fadeStyle } = useScrollFade<HTMLUListElement>('x');

  const resolved = resolveActiveTabId(pathname, tabs) ?? tabs[0]?.id ?? null;

  // Roving tabindex: only the active tab is in the tab order; arrows move focus.
  const itemRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === resolved));

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

  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      data-slot="fairway-hub-subnav"
      // Sticky beneath the glass top bar so the strip stays reachable while a
      // long leaf page scrolls. `--golf-mobile-header-offset` is set on the
      // shared AppShell content column (topbar height + safe-area-inset) —
      // the same var its sibling sticky headers (ViewAsBanner, the
      // new-round/continue-round in-progress bars) key off of, so this strip
      // never collides with the top bar under a notch/safe-area on mobile.
      // An opaque fill (not the previous `/80 backdrop-blur-xl`, which was a
      // no-op — this element never had scrolled content behind it while
      // static) — now that it sticks, the fill needs to be solid so it fully
      // occludes content scrolling underneath rather than reading as a glass
      // surface floating over it.
      //
      // At `<md` that fill is `bg-surface`, matching FairwayTopBar directly
      // above it. AppShell renders the two as ONE sticky chrome unit and the
      // bar drops its own hairline (`flush`) so they read as one continuous
      // surface — but the bar is `bg-surface` on phone and this strip was
      // `bg-canvas`, so the "one surface" was visibly two tones with a seam
      // across it. With cards (`bg-surface`) sliding under a `bg-canvas`
      // strip, the clipped card edge read as a rendering fault rather than as
      // content passing behind chrome. `md:bg-canvas` keeps desktop exactly as
      // it was — there the bar is translucent glass, not a matte surface.
      className={cn(
        'sticky top-[var(--golf-mobile-header-offset)] z-raised w-full border-b border-border-subtle bg-surface md:bg-canvas',
        className,
      )}
    >
      {/* A real navigation list of route links — NOT a tablist (WCAG 2.2 4.1.2). */}
      <ul
        ref={fadeRef}
        style={fadeStyle}
        className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t, i) => {
          const isActive = t.id === resolved;
          const Icon = t.icon;
          return (
            <li key={t.id} className="relative shrink-0">
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
                  // 44px tap-target floor (WCAG 2.2 AA 2.5.8) without growing
                  // the visible row — an invisible hit-slop pseudo-element
                  // expands the clickable box vertically only (this strip's
                  // real height feeds LargeTitleContext's SUB_NAV_OFFSET_PX
                  // math, so the VISIBLE row must stay exactly as tall as it
                  // renders today). Mirrors CLOSE_BUTTON_CLASS's hit-slop
                  // pattern in overlays/_shared.ts.
                  "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
                  fwTransition,
                  fwFocusRing,
                  // Match the icon directly below, which has always been
                  // accent-600 when active — the LABEL was the odd one out,
                  // leaving every hub sub-tab half-green/half-graphite.
                  // accent-700 for text on canvas (5.02:1, AA); the icon can
                  // stay 600 because non-text only needs 3:1.
                  isActive ? 'text-accent-700' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {Icon ? (
                  <Icon
                    size={16}
                    aria-hidden="true"
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'text-accent-600' : 'text-text-tertiary group-hover:text-text-secondary',
                    )}
                  />
                ) : null}
                <span className="relative">{t.label}</span>

                {isActive ? (
                  <motion.span
                    layoutId={reduceMotion ? undefined : underlineLayoutId}
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-500"
                    transition={
                      reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 34, mass: 0.7 }
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

export default FairwayHubSubNav;
