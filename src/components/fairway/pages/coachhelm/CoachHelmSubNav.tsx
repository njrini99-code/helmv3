'use client';

/**
 * Fairway · CoachHelm · CoachHelmSubNav — lens-aware tab strip.
 * Team lens: Brief · Signals · Reviews · Ask
 * Players lens: Roster · Compare
 *
 * Team stats live at `/stats/team` — first-class sidebar nav, not a CoachHelm tab.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway/controls/badge';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import { resolveCoachHelmLens, type CoachHelmLens } from './CoachHelmLensSwitch';

export type CoachHelmTab =
  | 'brief'
  | 'signals'
  | 'stats'
  | 'reviews'
  | 'ask'
  | 'roster'
  | 'compare'
  | 'players'
  | 'standing'
  | 'effectiveness';

export type CoachHelmRole = 'coach' | 'player';

interface TabDef {
  tab: CoachHelmTab;
  label: string;
  href: string;
  matchPrefixes: string[];
}

const TEAM_TABS: readonly TabDef[] = [
  {
    tab: 'brief',
    label: 'Brief',
    href: coachHelmRoutes.teamBrief,
    matchPrefixes: [
      '/golf/dashboard/intelligence',
      '/golf/dashboard/coachhelm/team',
    ],
  },
  {
    tab: 'signals',
    label: 'Signals',
    href: `${coachHelmRoutes.teamSignals}?preset=inbox`,
    matchPrefixes: [
      '/golf/dashboard/alerts',
      '/golf/dashboard/insights',
      '/golf/dashboard/patterns',
      '/golf/dashboard/coachhelm/team/signals',
    ],
  },
  {
    tab: 'reviews',
    label: 'Reviews',
    href: coachHelmRoutes.teamReviews,
    matchPrefixes: ['/golf/dashboard/coachhelm/team/reviews'],
  },
  {
    tab: 'ask',
    label: 'Ask',
    href: coachHelmRoutes.ask,
    matchPrefixes: ['/golf/dashboard/coachhelm/chat'],
  },
] as const;

const PLAYERS_LENS_TABS: readonly TabDef[] = [
  {
    tab: 'roster',
    label: 'Roster',
    href: coachHelmRoutes.playersRoster,
    matchPrefixes: [
      '/golf/dashboard/development',
      '/golf/dashboard/coachhelm/players',
      '/golf/dashboard/coachhelm/genome',
      '/golf/dashboard/players',
    ],
  },
  {
    tab: 'compare',
    label: 'Compare',
    href: coachHelmRoutes.compare,
    matchPrefixes: ['/golf/dashboard/coachhelm/genome/compare'],
  },
] as const;

const PLAYER_TABS: readonly TabDef[] = [
  {
    tab: 'brief',
    label: 'Overview',
    href: '/golf/dashboard/coachhelm',
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

function resolveTabFromPath(
  pathname: string | null,
  tabs: readonly TabDef[],
  role: CoachHelmRole,
): CoachHelmTab | null {
  if (!pathname) return null;

  if (role === 'player') {
    const overview = tabs.find((t) => t.tab === 'brief');
    if (overview && pathname === overview.href) return 'brief';
  }

  let best: { tab: CoachHelmTab; len: number } | null = null;
  for (const t of tabs) {
    const prefixes = role === 'player' && t.tab === 'brief' ? [] : [t.href.split('?')[0]!, ...t.matchPrefixes];
    for (const p of prefixes) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && (!best || p.length > best.len)) {
        best = { tab: t.tab, len: p.length };
      }
    }
  }
  return best?.tab ?? null;
}

export interface CoachHelmSubNavProps {
  active: CoachHelmTab;
  role?: CoachHelmRole;
  /** Coach lens — auto-detected from pathname when omitted. */
  lens?: CoachHelmLens;
  signalCount?: number | null;
  'aria-label'?: string;
  className?: string;
}

export function CoachHelmSubNav({
  active,
  role = 'coach',
  lens,
  signalCount,
  'aria-label': ariaLabel = 'CoachHelm sections',
  className,
}: CoachHelmSubNavProps) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const reactId = React.useId();
  const underlineLayoutId = `fw-coachhelm-subnav-underline-${reactId}`;

  const resolvedLens = role === 'coach' ? (lens ?? resolveCoachHelmLens(pathname)) : 'team';
  const tabs =
    role === 'player' ? PLAYER_TABS : resolvedLens === 'players' ? PLAYERS_LENS_TABS : TEAM_TABS;

  const resolved = resolveTabFromPath(pathname, tabs, role) ?? active;

  const itemRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.tab === resolved));

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

  const showSignalBadge =
    role === 'coach' && resolvedLens === 'team' && typeof signalCount === 'number' && signalCount > 0;

  return (
    <nav
      aria-label={ariaLabel}
      data-slot="coachhelm-subnav"
      data-role={role}
      data-lens={resolvedLens}
      className={cn('w-full border-b border-border-subtle', className)}
    >
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
