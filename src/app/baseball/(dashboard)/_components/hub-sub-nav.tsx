'use client';

// =============================================================================
// HubSubNav — the shared horizontal sub-tab strip for BaseballHelm grouped hubs.
//
// The grouped-hubs nav architecture (approved 2026-06-24) condenses the old flat
// 11–13 sidebar tabs into a handful of top-level HUBS (Team, Stats, Development,
// Management, Recruiting, Academics). Each hub is a route segment whose layout.tsx
// renders THIS strip above {children} — a row of real <Link> tabs over the hub's
// EXISTING leaf routes. The strip is purely ADDITIVE: every leaf route keeps its
// own page; the hub adds a navigation layer above them so the sidebar can stay
// lean while every surface remains one click away.
//
// Modeled on the proven CoachHelm sub-nav primitive (Fairway): real route <Link>s
// (NOT a Radix tablist of non-tab links — invalid ARIA), longest-prefix active
// resolution so nested leaves still light their parent tab, aria-current="page"
// on the active tab, roving tabindex + arrow-key movement, a visible focus ring,
// and a slow framer-motion underline that glides between tabs (reduced-motion
// honored). Light-mode tokens (cream surface, helm-green accent) because hub
// pages render on the cream dashboard gradient — the dark styling stays on the
// sidebar.
//
// PURE PRESENTATION. No data, no Supabase, no server actions. Each hub's layout
// passes its own tab list + accessible label.
// =============================================================================

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { BaseballNavIcon } from '@/lib/baseball/nav-registry';
import type { BaseballCapability } from '@/lib/baseball/capabilities';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HubSubNavTab {
  /** Stable id (React key, active resolution, test anchor). */
  id: string;
  /** Human label rendered on the tab. */
  label: string;
  /** Canonical destination route (absolute, starts with /baseball). */
  href: string;
  /** Optional leading icon (the GolfHelm icon set). */
  icon?: BaseballNavIcon;
  /**
   * Extra route prefixes (besides `href`) that should light THIS tab. Used when a
   * tab owns nested leaf routes (e.g. /stats/games, /stats/season under Stats).
   * Longest-prefix wins across every tab so the deepest leaf still resolves to
   * its parent tab.
   */
  matchPrefixes?: readonly string[];
  /** Staff capability required to show this tab (coaches only). */
  requiredCapability?: BaseballCapability;
  /** Staff must hold at least one of these capabilities (#370 / #408). */
  requiredAnyCapabilities?: readonly BaseballCapability[];
  /**
   * When set, this tab is only visible when the active team's program_type is
   * in this list (#367 — showcase-only org surfaces). Copied verbatim from the
   * registry entry's `allowedProgramTypes` by hub-definitions.ts — never
   * re-declared, so it can never drift from the registry's gate.
   */
  allowedProgramTypes?: readonly BaseballProgramType[];
}

export interface HubSubNavProps {
  /** The tabs for this hub, in visual order. */
  tabs: readonly HubSubNavTab[];
  /** Accessible label for the nav landmark (e.g. "Team sections"). */
  ariaLabel: string;
  className?: string;
}

// -----------------------------------------------------------------------------
// Active-tab resolution — longest-prefix match across all tabs.
// -----------------------------------------------------------------------------

function resolveActiveTabId(
  pathname: string | null,
  tabs: readonly HubSubNavTab[],
): string | null {
  if (!pathname) return null;
  let best: { id: string; len: number } | null = null;
  for (const t of tabs) {
    const prefixes = [t.href, ...(t.matchPrefixes ?? [])];
    for (const p of prefixes) {
      if (
        (pathname === p || pathname.startsWith(`${p}/`)) &&
        (!best || p.length > best.len)
      ) {
        best = { id: t.id, len: p.length };
      }
    }
  }
  return best?.id ?? null;
}

// -----------------------------------------------------------------------------
// HubSubNav
// -----------------------------------------------------------------------------

export function HubSubNav({ tabs, ariaLabel, className }: HubSubNavProps) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const reactId = React.useId();
  const underlineLayoutId = `bb-hub-subnav-underline-${reactId}`;

  // Active tab: first tab as the safe default until the pathname resolves.
  const resolvedId = resolveActiveTabId(pathname, tabs) ?? tabs[0]?.id ?? null;

  // Roving tabindex: only the active tab is in the tab order; arrows move focus.
  const itemRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === resolvedId),
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

  if (tabs.length === 0) return null;

  return (
    <LazyMotion features={domAnimation} strict>
      <nav
        aria-label={ariaLabel}
        data-slot="hub-sub-nav"
        className={cn(
          'sticky top-0 z-20 w-full',
          'border-b border-warm-200/70 bg-cream-50/80 backdrop-blur-xl',
          className,
        )}
      >
        <ul className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t, i) => {
            const isActive = t.id === resolvedId;
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
                    'group relative inline-flex select-none items-center gap-2 whitespace-nowrap',
                    'rounded-t-lg px-3.5 pb-3 pt-3 text-sm font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-cream-50',
                    isActive
                      ? 'text-primary-700'
                      : 'text-warm-500 hover:text-warm-800',
                  )}
                >
                  {Icon && (
                    <Icon
                      size={16}
                      aria-hidden="true"
                      className={cn(
                        'flex-shrink-0 transition-colors duration-150',
                        isActive
                          ? 'text-primary-600'
                          : 'text-warm-400 group-hover:text-warm-600',
                      )}
                    />
                  )}
                  <span className="relative">{t.label}</span>

                  {/* The gliding active underline (layoutId; honors reduced-motion). */}
                  {isActive && (
                    <m.span
                      layoutId={reduceMotion ? undefined : underlineLayoutId}
                      aria-hidden="true"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-600"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 360, damping: 34, mass: 0.7 }
                      }
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </LazyMotion>
  );
}
