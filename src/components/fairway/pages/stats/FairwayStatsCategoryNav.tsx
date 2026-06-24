'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { StatsCategory } from '@/components/golf/stats/GolfStatsDisplay';
import { STATS_CATEGORY_DEFS } from './player-stats-theme';
import { MotionButton, useStatsMotion } from './fairway-stats-motion';

export interface FairwayStatsCategoryNavProps {
  value: StatsCategory;
  onChange: (category: StatsCategory) => void;
  className?: string;
}

/** Scrollable category chips — green accent on active, icon + hint per area. */
export function FairwayStatsCategoryNav({
  value,
  onChange,
  className,
}: FairwayStatsCategoryNavProps) {
  const statsMotion = useStatsMotion();
  const reduced = useReducedMotion();

  return (
    <div className={cn('relative -mx-1', className)}>
      <div
        role="tablist"
        aria-label="Stats categories"
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STATS_CATEGORY_DEFS.map((cat, index) => {
          const active = value === cat.id;
          const Icon = cat.icon;
          return (
            <MotionButton
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(cat.id)}
              layout={!reduced}
              initial={statsMotion.reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              whileHover={statsMotion.reduced ? undefined : { y: -2, transition: { duration: 0.12 } }}
              whileTap={statsMotion.reduced ? undefined : { scale: 0.98 }}
              className={cn(
                'relative flex min-w-[128px] shrink-0 flex-col gap-0.5 rounded-card border px-3 py-2.5 text-left outline-none',
                'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                active
                  ? cn('shadow-soft ring-2', cat.activeRing, cat.activeBg, cat.activeBorder)
                  : 'border-border-subtle bg-surface hover:border-accent-600/25 hover:bg-accent-600/5',
              )}
            >
              {active && !reduced ? (
                <motion.span
                  layoutId="stats-category-active-glow"
                  className={cn('pointer-events-none absolute inset-0 rounded-card opacity-40', cat.activeBg)}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              ) : null}
              <span className="relative flex items-center gap-2">
                <motion.span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-fw-md',
                    active ? cat.activeBg : 'bg-surface-sunken',
                  )}
                  animate={
                    active && !reduced
                      ? { scale: [1, 1.08, 1], transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
                      : { scale: 1 }
                  }
                >
                  <Icon
                    className={cn('h-3.5 w-3.5', active ? cat.iconColor : 'text-text-tertiary')}
                    aria-hidden
                  />
                </motion.span>
                <span
                  className={cn(
                    'font-fw-sans text-body-sm font-semibold leading-tight',
                    active ? 'text-text-primary' : 'text-text-secondary',
                  )}
                >
                  {cat.shortLabel}
                </span>
              </span>
              <span className="relative pl-9 font-fw-sans text-caption leading-snug text-text-tertiary">
                {cat.hint}
              </span>
            </MotionButton>
          );
        })}
      </div>
    </div>
  );
}
