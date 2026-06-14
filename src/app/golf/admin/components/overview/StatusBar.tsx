'use client';

import { cn } from '@/lib/utils';

interface StatusBarProps {
  healthScore: number;
  openIncidents: number;
  activeUsersWeek: number;
  roundsThisWeek: number;
}

export function StatusBar({
  healthScore,
  openIncidents,
  activeUsersWeek,
  roundsThisWeek,
}: StatusBarProps) {
  // Status is driven by open incidents, NOT healthScore alone
  const incidents = Number(openIncidents);
  const healthStatus =
    incidents === 0
      ? 'healthy'
      : healthScore < 40
        ? 'critical'
        : 'warning';

  const healthLabel =
    healthStatus === 'healthy'
      ? 'Healthy'
      : healthStatus === 'warning'
        ? 'Warning'
        : 'Critical';

  const dotColor =
    healthStatus === 'healthy'
      ? 'bg-primary-500'
      : healthStatus === 'warning'
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="glass-premium rounded-2xl px-4 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-y-2 gap-x-3">
      {/* Health status */}
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', dotColor)} />
        <span className="text-xs sm:text-sm font-semibold tabular-nums text-warm-900">
          {healthLabel}
        </span>
      </div>

      <span className="hidden sm:block w-px h-4 bg-warm-200" aria-hidden="true" />

      {/* Open incidents */}
      <span
        className={cn(
          'text-xs sm:text-sm font-semibold tabular-nums',
          incidents > 0 ? 'text-red-600' : 'text-primary-600'
        )}
      >
        {incidents} open incident{incidents !== 1 ? 's' : ''}
      </span>

      <span className="hidden sm:block w-px h-4 bg-warm-200" aria-hidden="true" />

      {/* Active users */}
      <span className="text-xs sm:text-sm font-semibold tabular-nums text-warm-900">
        {Number(activeUsersWeek)} active this week
      </span>

      <span className="hidden sm:block w-px h-4 bg-warm-200" aria-hidden="true" />

      {/* Rounds */}
      <span className="text-xs sm:text-sm font-semibold tabular-nums text-warm-900">
        {Number(roundsThisWeek)} round{Number(roundsThisWeek) !== 1 ? 's' : ''} this week
      </span>
    </div>
  );
}
