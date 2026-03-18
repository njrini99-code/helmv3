'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconActivity, IconClock, IconUsers, IconGlobe } from '@/components/icons';
import { timeAgo, formatBytes } from './admin-utils';

interface Props {
  health: AdminDashboardData['health'];
  infraHealth?: AdminDashboardData['infraHealth'];
  statsCacheLastUpdated?: string | null;
}

const statusColors = {
  healthy: 'bg-primary-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const statusTextColors = {
  healthy: 'text-primary-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

const statusGradients = {
  healthy: 'bg-gradient-to-r from-primary-50/80 to-primary-50/30',
  warning: 'bg-gradient-to-r from-amber-50/80 to-amber-50/30',
  critical: 'bg-gradient-to-r from-red-50/80 to-red-50/30',
};

export function PlatformHealthCard({ health, infraHealth, statsCacheLastUpdated }: Props) {
  const overallHealth = health.diagnostics.some((d) => d.status === 'critical')
    ? 'critical'
    : health.diagnostics.some((d) => d.status === 'warning')
      ? 'warning'
      : 'healthy';

  const freshnessLabel =
    health.dataFreshness === 'live' ? 'Live' : health.dataFreshness === 'stale' ? 'Stale' : 'No Data';

  return (
    <div className="glass-standard rounded-2xl p-4 sm:p-5 md:p-6 transition-all duration-200 hover:bg-white/80 active:bg-white/90 hover:shadow-card-hover">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconActivity size={18} />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-warm-900">Platform Health</h3>
        </div>
        <div className="relative flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', statusColors[overallHealth])}>
            <div className={cn(
              'absolute w-2 h-2 rounded-full animate-ping',
              statusColors[overallHealth],
              'opacity-75'
            )} />
          </div>
          <span className={cn('text-xs font-medium', statusTextColors[overallHealth])}>
            {overallHealth === 'healthy'
              ? 'All Systems Go'
              : overallHealth === 'warning'
                ? 'Needs Attention'
                : 'Issues Detected'}
          </span>
        </div>
      </div>

      {/* Real-time active users — 4-col grid (2+2 on very narrow, 4 on sm+) */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <IconUsers size={13} className="text-warm-400" />
          <span className="text-xs font-medium text-warm-500">Active Users (Real-Time)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers1h}</p>
            <p className="text-[11px] sm:text-micro text-warm-400 mt-0.5">Now</p>
          </div>
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers24h}</p>
            <p className="text-[11px] sm:text-micro text-warm-400 mt-0.5">24h</p>
          </div>
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers7d}</p>
            <p className="text-[11px] sm:text-micro text-warm-400 mt-0.5">7d</p>
          </div>
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers30d}</p>
            <p className="text-[11px] sm:text-micro text-warm-400 mt-0.5">30d</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 mt-2 px-1">
          <span className="text-[11px] sm:text-micro text-warm-400">
            {health.usersSignedInToday} signed in today
          </span>
          <span className="text-[11px] sm:text-micro text-warm-400">
            {health.totalAuthUsers} total accounts
          </span>
        </div>
      </div>

      {/* System diagnostics */}
      <div className="space-y-1.5 mb-5">
        {health.diagnostics.map((d) => (
          <div
            key={d.label}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-all duration-300',
              statusGradients[d.status]
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColors[d.status])} />
              <span className="text-xs sm:text-sm font-medium text-warm-700 truncate">{d.label}</span>
            </div>
            <span className={cn('text-xs text-right shrink-0', statusTextColors[d.status])}>
              {d.detail}
            </span>
          </div>
        ))}
      </div>

      {/* Quick stats — 3 equal cols, responsive text */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mb-5">
        <div className="bg-white/50 rounded-xl p-2.5 sm:p-3 text-center">
          <p className="text-lg sm:text-xl font-semibold text-warm-900 tabular-nums">
            {health.roundsToday}
          </p>
          <p className="text-[10px] sm:text-label text-warm-500 mt-0.5 leading-tight">
            Rounds Today
          </p>
        </div>
        <div className="bg-white/50 rounded-xl p-2.5 sm:p-3 text-center">
          <p className={cn(
            'text-lg sm:text-xl font-semibold tabular-nums',
            health.systemErrors7d > 0 ? 'text-red-600' : 'text-warm-900'
          )}>
            {health.systemErrors7d}
          </p>
          <p className="text-[10px] sm:text-label text-warm-500 mt-0.5 leading-tight">
            Errors (7d)
          </p>
        </div>
        <div className="bg-white/50 rounded-xl p-2.5 sm:p-3 text-center overflow-hidden">
          <p className="text-base sm:text-xl font-semibold text-warm-900 tabular-nums truncate">
            {Math.round(infraHealth?.totals?.avgResponseMs ?? 0)}ms
          </p>
          <p className="text-[10px] sm:text-label text-warm-500 mt-0.5 leading-tight">
            API Latency
          </p>
        </div>
      </div>

      {/* Infrastructure stats */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <IconGlobe size={13} className="text-warm-400" />
          <span className="text-xs font-medium text-warm-500">Infrastructure</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="bg-white/40 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-warm-500">Database</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">
              {formatBytes(health.dbSizeBytes)}
            </span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-warm-500 shrink-0">Connections</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums text-right">
              {health.activeConnections} active · {health.idleConnections} idle
            </span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-warm-500 shrink-0">Sessions</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums text-right">
              {health.activeSessions} active / {health.totalSessions}
            </span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-warm-500">Dormant Users</span>
            <span className={cn(
              'text-xs font-medium tabular-nums text-right',
              health.usersNeverSignedIn > 5 ? 'text-amber-600' : 'text-warm-700'
            )}>
              <span className="hidden sm:inline">{health.usersNeverSignedIn} never signed in</span>
              <span className="sm:hidden">{health.usersNeverSignedIn} never in</span>
            </span>
          </div>
        </div>

        {/* Storage breakdown */}
        {health.largestTables.length > 0 && (
          <div className="mt-3">
            <span className="text-[11px] sm:text-micro text-warm-400 uppercase tracking-wider font-medium">
              Storage Breakdown
            </span>
            <div className="mt-1.5 space-y-1">
              {health.largestTables.slice(0, 5).map((t) => {
                const pct = health.dbSizeBytes > 0 ? (t.size_bytes / health.dbSizeBytes) * 100 : 0;
                return (
                  <div key={t.table_name} className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-[10px] sm:text-label text-warm-500 w-20 sm:w-28 truncate shrink-0">
                      {t.table_name.replace('golf_', '')}
                    </span>
                    <div className="flex-1 h-1.5 bg-warm-100 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <span className="text-[10px] sm:text-micro text-warm-400 tabular-nums w-12 sm:w-16 text-right shrink-0">
                      {formatBytes(t.size_bytes)}
                    </span>
                    <span className="hidden sm:inline text-micro text-warm-300 tabular-nums w-12 text-right shrink-0">
                      {t.row_count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="border-t border-warm-100 pt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <IconClock size={12} className="text-warm-400" />
          <span className="text-xs text-warm-400">Last Pulse</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-warm-500">Last Round</span>
            <span className="text-warm-600 font-medium tabular-nums">
              {timeAgo(health.lastRoundSubmitted)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-warm-500">Last Insight</span>
            <span className="text-warm-600 font-medium tabular-nums">
              {timeAgo(health.lastInsightGenerated)}
            </span>
          </div>
          {statsCacheLastUpdated !== undefined && (
            <div className="flex justify-between gap-2">
              <span className="text-warm-500">Stats Cache</span>
              <span className="text-warm-600 font-medium tabular-nums">
                {timeAgo(statsCacheLastUpdated ?? null)}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            health.dataFreshness === 'live'
              ? 'bg-primary-500'
              : health.dataFreshness === 'stale'
                ? 'bg-amber-500'
                : 'bg-red-500',
          )} />
          <span className="text-[11px] sm:text-label text-warm-400">
            Data Status: {freshnessLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
