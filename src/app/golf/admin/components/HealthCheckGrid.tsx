'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { formatBytes } from './admin-utils';

interface Props {
  health: AdminDashboardData['health'];
  errorLogs: AdminDashboardData['errorLogs'];
  loginSecurity: AdminDashboardData['loginSecurity'];
}

const statusColors = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const statusBg = {
  healthy: 'bg-emerald-50/50',
  warning: 'bg-amber-50/50',
  critical: 'bg-red-50/50',
};

const statusText = {
  healthy: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

export function HealthCheckGrid({ health, errorLogs, loginSecurity }: Props) {
  // Build comprehensive health checks
  const checks: { label: string; status: 'healthy' | 'warning' | 'critical'; value: string; detail: string }[] = [];

  // From diagnostics
  for (const d of health.diagnostics) {
    checks.push({ label: d.label, status: d.status, value: '', detail: d.detail });
  }

  // Error rate check
  const errorStatus = errorLogs.criticalErrors7d > 0 ? 'critical' as const
    : errorLogs.totalErrors7d > 10 ? 'warning' as const
    : 'healthy' as const;
  checks.push({
    label: 'Error Rate',
    status: errorStatus,
    value: `${errorLogs.totalErrors7d}`,
    detail: errorLogs.criticalErrors7d > 0
      ? `${errorLogs.criticalErrors7d} critical`
      : errorLogs.totalErrors7d > 0
        ? `${errorLogs.totalErrors7d} errors (7d)`
        : 'No errors',
  });

  // Login security check
  const loginStatus = loginSecurity.lockedAccounts > 0 ? 'warning' as const : 'healthy' as const;
  checks.push({
    label: 'Login Security',
    status: loginStatus,
    value: '',
    detail: loginSecurity.lockedAccounts > 0
      ? `${loginSecurity.lockedAccounts} locked`
      : loginSecurity.failedLogins7d > 0
        ? `${loginSecurity.failedLogins7d} failed attempts`
        : 'No issues',
  });

  const overallStatus = checks.some(c => c.status === 'critical') ? 'critical'
    : checks.some(c => c.status === 'warning') ? 'warning'
    : 'healthy';

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-warm-900">System Health</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <div className={cn('w-2.5 h-2.5 rounded-full', statusColors[overallStatus])} />
            <div className={cn('absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-75', statusColors[overallStatus])} />
          </div>
          <span className={cn('text-xs font-medium', statusText[overallStatus])}>
            {overallStatus === 'healthy' ? 'All Systems Go' : overallStatus === 'warning' ? 'Needs Attention' : 'Issues Detected'}
          </span>
        </div>
      </div>

      {/* Health checks grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className={cn(
              'flex items-center justify-between rounded-xl px-3.5 py-2.5 transition-all duration-200',
              statusBg[check.status]
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className={cn('w-2 h-2 rounded-full', statusColors[check.status])} />
                {check.status !== 'healthy' && (
                  <div className={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-50', statusColors[check.status])} />
                )}
              </div>
              <span className="text-sm font-medium text-warm-700 truncate">{check.label}</span>
            </div>
            <span className={cn('text-xs text-right shrink-0 ml-2', statusText[check.status])}>
              {check.detail}
            </span>
          </div>
        ))}
      </div>

      {/* Infrastructure stats */}
      <div className="mt-5 pt-4 border-t border-warm-100">
        <span className="text-[10px] text-warm-400 uppercase tracking-wider font-medium">Infrastructure</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
          <div className="bg-white/50 rounded-xl p-3 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{formatBytes(health.dbSizeBytes)}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">Database</p>
          </div>
          <div className="bg-white/50 rounded-xl p-3 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.activeConnections + health.idleConnections}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">Connections</p>
          </div>
          <div className="bg-white/50 rounded-xl p-3 text-center">
            <p className="text-lg font-semibold text-warm-900 tabular-nums">{health.activeSessions}</p>
            <p className="text-[10px] text-warm-400 mt-0.5">Sessions</p>
          </div>
          <div className="bg-white/50 rounded-xl p-3 text-center">
            <p className={cn(
              'text-lg font-semibold tabular-nums',
              health.avgResponseTimeMs > 3000 ? 'text-amber-600' : 'text-warm-900'
            )}>{health.avgResponseTimeMs}ms</p>
            <p className="text-[10px] text-warm-400 mt-0.5">API Speed</p>
          </div>
        </div>

        {/* Top tables */}
        {health.largestTables.length > 0 && (
          <div className="mt-3">
            <span className="text-[10px] text-warm-400 uppercase tracking-wider font-medium">Storage Breakdown</span>
            <div className="mt-1.5 space-y-1">
              {health.largestTables.slice(0, 5).map((t) => {
                const pct = health.dbSizeBytes > 0 ? (t.size_bytes / health.dbSizeBytes) * 100 : 0;
                return (
                  <div key={t.table_name} className="flex items-center gap-2">
                    <span className="text-[11px] text-warm-500 w-28 truncate">{t.table_name.replace(/^(golf_|baseball_)/, '')}</span>
                    <div className="flex-1 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-warm-400 tabular-nums w-16 text-right">{formatBytes(t.size_bytes)}</span>
                    <span className="text-[10px] text-warm-300 tabular-nums w-12 text-right">{t.row_count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
