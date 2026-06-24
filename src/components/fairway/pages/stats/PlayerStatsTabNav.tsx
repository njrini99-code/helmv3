'use client';

import { cn } from '@/lib/utils';
import { STATS_TAB_DEFS, type StatsTabId } from './player-stats-theme';

export interface PlayerStatsTabNavProps {
  value: StatsTabId;
  onChange: (tab: StatsTabId) => void;
  isOwnStats?: boolean;
  className?: string;
}

/** Card-style primary nav for the player stats cockpit — color + icon per section. */
export function PlayerStatsTabNav({
  value,
  onChange,
  isOwnStats = false,
  className,
}: PlayerStatsTabNavProps) {
  return (
    <div
      role="tablist"
      aria-label="Stats sections"
      className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}
    >
      {STATS_TAB_DEFS.map((tab) => {
        const active = value === tab.id;
        const Icon = tab.icon;
        const label = isOwnStats ? tab.playerLabel : tab.coachLabel;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex min-h-[72px] flex-col items-start gap-1 rounded-card border px-3 py-2.5 text-left outline-none transition-all [transition-duration:180ms]',
              'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              active
                ? cn('border-accent-600/50 shadow-soft ring-2', tab.activeRing, tab.activeBg)
                : 'border-border-subtle bg-surface hover:border-border-default hover:bg-surface-tint',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-fw-md',
                  active ? tab.activeBg : 'bg-surface-sunken',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', active ? tab.iconColor : 'text-text-tertiary')} aria-hidden />
              </span>
              <span
                className={cn(
                  'font-fw-sans text-body-sm font-semibold',
                  active ? 'text-text-primary' : 'text-text-secondary',
                )}
              >
                {label}
              </span>
            </span>
            <span className="pl-9 font-fw-sans text-caption leading-snug text-text-tertiary">{tab.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
