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
  const healthStatus =
    healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'warning' : 'critical';

  const healthLabel =
    healthStatus === 'healthy'
      ? 'Healthy'
      : healthStatus === 'warning'
        ? 'Warning'
        : 'Critical';

  const dotColor =
    healthStatus === 'healthy'
      ? 'bg-green-500'
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
          Number(openIncidents) > 0 ? 'text-red-600' : 'text-green-600'
        )}
      >
        {Number(openIncidents)} open incident{Number(openIncidents) !== 1 ? 's' : ''}
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
