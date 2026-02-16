'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { Activity, Clock, Users, Globe } from 'lucide-react';
import { timeAgo, formatBytes } from './admin-utils';

interface Props {
  health: AdminDashboardData['health'];
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
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <Activity size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Platform Health</h3>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Real-time active users (from auth sessions) */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Users size={13} className="text-warm-400" />
          <span className="text-xs font-medium text-warm-500">Active Users (Real-Time)</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers1h}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">Now</p>
          </div>
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers24h}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">24h</p>
          </div>
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers7d}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">7d</p>
          </div>
          <div className="bg-white/50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.realActiveUsers30d}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">30d</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] text-warm-400">
            {health.usersSignedInToday} signed in today
          </span>
          <span className="text-[10px] text-warm-400">
            {health.totalAuthUsers} total accounts
          </span>
        </div>
      </div>

      {/* System diagnostics with gradient backgrounds */}
      <div className="space-y-1.5 mb-5">
        {health.diagnostics.map((d) => (
          <div
            key={d.label}
            className={cn(
              'flex items-center justify-between rounded-xl px-3 py-2 transition-all duration-300',
              statusGradients[d.status]
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColors[d.status])} />
              <span className="text-sm font-medium text-warm-700">{d.label}</span>
            </div>
            <span className={cn('text-xs text-right', statusTextColors[d.status])}>{d.detail}</span>
          </div>
        ))}
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{health.roundsToday}</p>
          <p className="text-[11px] text-warm-500 mt-0.5">Rounds Today</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className={cn(
            'text-xl font-semibold tabular-nums',
            health.systemErrors7d > 0 ? 'text-red-600' : 'text-warm-900'
          )}>
            {health.systemErrors7d}
          </p>
          <p className="text-[11px] text-warm-500 mt-0.5">Errors (7d)</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{health.avgResponseTimeMs}ms</p>
          <p className="text-[11px] text-warm-500 mt-0.5">API Speed</p>
        </div>
      </div>

      {/* Infrastructure stats */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Globe size={13} className="text-warm-400" />
          <span className="text-xs font-medium text-warm-500">Infrastructure</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Database</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{formatBytes(health.dbSizeBytes)}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Connections</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">
              {health.activeConnections} active · {health.idleConnections} idle
            </span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Sessions</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">
              {health.activeSessions} active / {health.totalSessions}
            </span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Dormant Users</span>
            <span className={cn(
              'text-xs font-medium tabular-nums',
              health.usersNeverSignedIn > 5 ? 'text-amber-600' : 'text-warm-700'
            )}>
              {health.usersNeverSignedIn} never signed in
            </span>
          </div>
        </div>

        {/* Top tables by size */}
        {health.largestTables.length > 0 && (
          <div className="mt-3">
            <span className="text-[10px] text-warm-400 uppercase tracking-wider font-medium">Storage Breakdown</span>
            <div className="mt-1.5 space-y-1">
              {health.largestTables.slice(0, 5).map((t) => {
                const pct = health.dbSizeBytes > 0 ? (t.size_bytes / health.dbSizeBytes) * 100 : 0;
                return (
                  <div key={t.table_name} className="flex items-center gap-2">
                    <span className="text-[11px] text-warm-500 w-28 truncate">{t.table_name.replace('golf_', '')}</span>
                    <div className="flex-1 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-warm-400 tabular-nums w-16 text-right">
                      {formatBytes(t.size_bytes)}
                    </span>
                    <span className="text-[10px] text-warm-300 tabular-nums w-12 text-right">
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
          <Clock size={12} className="text-warm-400" />
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
            health.dataFreshness === 'live' ? 'bg-primary-500' : health.dataFreshness === 'stale' ? 'bg-amber-500' : 'bg-red-500',
          )} />
          <span className="text-[11px] text-warm-400">Data Status: {freshnessLabel}</span>
        </div>
      </div>
    </div>
  );
}
