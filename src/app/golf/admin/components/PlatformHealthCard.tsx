'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconActivity, IconClock } from '@/components/icons';

interface Props {
  health: AdminDashboardData['health'];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const statusColors = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const statusTextColors = {
  healthy: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

const statusBgColors = {
  healthy: 'bg-emerald-50',
  warning: 'bg-amber-50',
  critical: 'bg-red-50',
};

export function PlatformHealthCard({ health }: Props) {
  const overallHealth = health.diagnostics.some((d) => d.status === 'critical')
    ? 'critical'
    : health.diagnostics.some((d) => d.status === 'warning')
      ? 'warning'
      : 'healthy';

  const freshnessLabel =
    health.dataFreshness === 'live' ? 'Live' : health.dataFreshness === 'stale' ? 'Stale' : 'No Data';

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconActivity size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Platform Health</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Pulsing status dot */}
          <div className="relative flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', statusColors[overallHealth])}>
              <div className={cn('absolute w-2 h-2 rounded-full animate-ping', statusColors[overallHealth], 'opacity-75')} />
            </div>
            <span className={cn('text-xs font-medium', statusTextColors[overallHealth])}>
              {overallHealth === 'healthy' ? 'All Systems Go' : overallHealth === 'warning' ? 'Needs Attention' : 'Issues Detected'}
            </span>
          </div>
        </div>
      </div>

      {/* System diagnostics */}
      <div className="space-y-2 mb-5">
        {health.diagnostics.map((d) => (
          <div
            key={d.label}
            className={cn(
              'flex items-center justify-between rounded-xl px-3 py-2.5',
              statusBgColors[d.status]
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className={cn('w-1.5 h-1.5 rounded-full', statusColors[d.status])} />
              <span className="text-sm font-medium text-warm-700">{d.label}</span>
            </div>
            <span className={cn('text-xs', statusTextColors[d.status])}>{d.detail}</span>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{health.roundsToday}</p>
          <p className="text-[11px] text-warm-500 mt-0.5">Rounds Today</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{health.systemErrors7d}</p>
          <p className="text-[11px] text-warm-500 mt-0.5">Errors (7d)</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{health.avgResponseTimeMs}ms</p>
          <p className="text-[11px] text-warm-500 mt-0.5">API Speed</p>
        </div>
      </div>

      {/* Timestamps */}
      <div className="border-t border-warm-100 pt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <IconClock size={12} className="text-warm-400" />
          <span className="text-xs text-warm-400">Last Pulse</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex justify-between">
            <span className="text-warm-500">Last Round</span>
            <span className="text-warm-600 font-medium">{timeAgo(health.lastRoundSubmitted)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-warm-500">Last Insight</span>
            <span className="text-warm-600 font-medium">{timeAgo(health.lastInsightGenerated)}</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            health.dataFreshness === 'live' ? 'bg-emerald-500' : health.dataFreshness === 'stale' ? 'bg-amber-500' : 'bg-red-500',
          )} />
          <span className="text-[11px] text-warm-400">Data Status: {freshnessLabel}</span>
        </div>
      </div>
    </div>
  );
}
