'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { HelmLiftingSport } from '@/lib/types/helm-lifting';

interface SportTab {
  sport: HelmLiftingSport;
  label: string;
  emoji: string;
}

const SPORT_TABS: SportTab[] = [
  { sport: 'baseball', label: 'Baseball', emoji: '⚾' },
  { sport: 'golf', label: 'Golf', emoji: '⛳' },
];

interface SportTabBarProps {
  /** The currently selected sport filter; null = show all */
  activeSport: HelmLiftingSport | null;
  /** Base URL for sport-filtered views; a query param `?sport=<sport>` is appended */
  baseHref: string;
}

/**
 * Horizontal sport-filter tab bar shown on the Lab dashboard home.
 * Renders an "All" tab + one tab per sport the coach has assignments for.
 */
export function SportTabBar({ activeSport, baseHref }: SportTabBarProps) {
  const tabs: Array<{ sport: HelmLiftingSport | null; label: string; emoji: string }> = [
    { sport: null, label: 'All sports', emoji: '🏋️' },
    ...SPORT_TABS,
  ];

  return (
    <div
      className="flex items-center gap-1 p-1 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 overflow-x-auto scrollbar-none"
      role="tablist"
      aria-label="Filter by sport"
    >
      {tabs.map((tab) => {
        const isActive = activeSport === tab.sport;
        const href = tab.sport ? `${baseHref}?sport=${tab.sport}` : baseHref;

        return (
          <Link
            key={tab.sport ?? 'all'}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 min-h-[40px] select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1',
              isActive
                ? 'text-primary-700'
                : 'text-warm-500 hover:text-warm-800 hover:bg-white/40'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="sport-tab-indicator"
                className="absolute inset-0 bg-white rounded-xl shadow-sm border border-white/60"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative z-10" aria-hidden="true">{tab.emoji}</span>
            <span className="relative z-10">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
