'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { formatBytes } from './admin-utils';

interface Props {
  health: AdminDashboardData['health'];
  errorLogs: AdminDashboardData['errorLogs'];
  loginSecurity: AdminDashboardData['loginSecurity'];
  dataQuality: AdminDashboardData['dataQuality'];
}

type HealthStatus = 'healthy' | 'warning' | 'critical';

const statusColors: Record<HealthStatus, string> = {
  healthy: 'bg-primary-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const statusBg: Record<HealthStatus, string> = {
  healthy: 'bg-primary-50/50',
  warning: 'bg-amber-50/55',
  critical: 'bg-red-50/55',
};

const statusText: Record<HealthStatus, string> = {
  healthy: 'text-primary-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

const statusLabel: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Watchlist',
  critical: 'Critical',
};

export function HealthCheckGrid({ health, errorLogs, loginSecurity, dataQuality }: Props) {
  const qualityScore = Math.round(
    (dataQuality.distancePercentage + dataQuality.liePercentage + dataQuality.clubPercentage) / 3
  );

  const diagnosticChecks: { label: string; status: HealthStatus; value: string; detail: string }[] = health.diagnostics.map((diagnostic) => ({
    label: diagnostic.label,
    status: diagnostic.status as HealthStatus,
    value: '',
    detail: diagnostic.detail,
  }));

  const checks: { label: string; status: HealthStatus; value: string; detail: string }[] = [
    ...diagnosticChecks,
    {
      label: 'Error Rate',
      status: (errorLogs.incidentCounts.openCritical > 0
        ? 'critical'
        : errorLogs.totalErrors7d > 10
          ? 'warning'
          : 'healthy') as HealthStatus,
      value: `${errorLogs.totalErrors7d}`,
      detail: errorLogs.incidentCounts.openCritical > 0
        ? `${errorLogs.incidentCounts.openCritical} open critical`
        : errorLogs.totalErrors7d > 0
          ? `${errorLogs.totalErrors7d} raw rows in 7d`
          : 'No recent raw error rows',
    },
    {
      label: 'Login Security',
      status: (loginSecurity.lockedAccounts > 0
        ? 'critical'
        : loginSecurity.failedLogins7d > 10
          ? 'warning'
          : 'healthy') as HealthStatus,
      value: `${loginSecurity.failedLogins7d}`,
      detail: loginSecurity.lockedAccounts > 0
        ? `${loginSecurity.lockedAccounts} locked accounts`
        : loginSecurity.failedLogins7d > 0
          ? `${loginSecurity.failedLogins7d} failed attempts`
          : 'No auth pressure detected',
    },
  ]
    .sort((a, b) => {
      const order: Record<HealthStatus, number> = { critical: 0, warning: 1, healthy: 2 };
      return order[a.status] - order[b.status];
    });

  const overallStatus: HealthStatus = checks.some((check) => check.status === 'critical')
    ? 'critical'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'healthy';

  const summaryTiles = [
    {
      label: 'Incident pressure',
      value: `${errorLogs.incidentCounts.open}`,
      detail: `${errorLogs.incidentCounts.active} active · ${errorLogs.incidentCounts.historical} backlog`,
      status: errorLogs.incidentCounts.open > 0 ? 'critical' : errorLogs.incidentCounts.active > 0 ? 'warning' : 'healthy',
    },
    {
      label: 'Recovery',
      value: `${errorLogs.incidentCounts.resolvedRecently}`,
      detail: `${errorLogs.incidentCounts.resolved} total resolved`,
      status: errorLogs.incidentCounts.resolvedRecently > 0 ? 'healthy' : errorLogs.incidentCounts.open > 0 ? 'warning' : 'healthy',
    },
    {
      label: 'Telemetry',
      value: `${qualityScore}%`,
      detail: `${dataQuality.totalShots.toLocaleString()} shots captured`,
      status: qualityScore >= 92 ? 'healthy' : qualityScore >= 75 ? 'warning' : 'critical',
    },
    {
      label: 'Access health',
      value: `${loginSecurity.lockedAccounts}`,
      detail: loginSecurity.failedLogins7d > 0 ? `${loginSecurity.failedLogins7d} failed attempts` : 'No lockouts',
      status: loginSecurity.lockedAccounts > 0 ? 'critical' : loginSecurity.failedLogins7d > 10 ? 'warning' : 'healthy',
    },
  ] as const;

  return (
    <div className="glass-standard rounded-2xl p-5 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/60 p-2 text-warm-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-warm-900">Health Diagnostics</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-warm-500">
            Ranked checks for app stability, data integrity, login pressure, and incident recovery.
          </p>
        </div>

        <div className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
          overallStatus === 'healthy'
            ? 'border-primary-200 bg-primary-50 text-primary-700'
            : overallStatus === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-red-200 bg-red-50 text-red-700'
        )}>
          <span className={cn('h-2.5 w-2.5 rounded-full', statusColors[overallStatus])} />
          {overallStatus === 'healthy' ? 'Command center stable' : overallStatus === 'warning' ? 'Monitor active risk' : 'Intervention required'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryTiles.map((tile) => (
          <div
            key={tile.label}
            className={cn(
              'rounded-2xl border px-4 py-3',
              tile.status === 'healthy'
                ? 'border-primary-100 bg-primary-50/55'
                : tile.status === 'warning'
                  ? 'border-amber-100 bg-amber-50/60'
                  : 'border-red-100 bg-red-50/60'
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-500">{tile.label}</p>
            <div className="mt-1 flex items-end gap-2">
              <p className="text-xl font-semibold tracking-tight text-warm-900 tabular-nums">{tile.value}</p>
              <p className="pb-1 text-xs text-warm-500">{tile.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-500">Ranked checks</p>
          <div className="mt-3 space-y-2">
            {checks.map((check) => (
              <div
                key={check.label}
                className={cn(
                  'rounded-xl border px-3.5 py-3',
                  check.status === 'healthy'
                    ? 'border-primary-100 bg-primary-50/45'
                    : check.status === 'warning'
                      ? 'border-amber-100 bg-amber-50/50'
                      : 'border-red-100 bg-red-50/50'
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', statusColors[check.status])} />
                      <p className="text-sm font-semibold text-warm-900">{check.label}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', statusBg[check.status], statusText[check.status])}>
                        {statusLabel[check.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-warm-600">{check.detail}</p>
                  </div>
                  {check.value ? (
                    <div className="rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Signal</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-warm-900">{check.value}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-500">Infra snapshot</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/70 p-3 text-center">
                <p className="text-lg font-semibold tabular-nums text-warm-900">{formatBytes(health.dbSizeBytes)}</p>
                <p className="mt-0.5 text-micro text-warm-400">Database size</p>
              </div>
              <div className="rounded-xl bg-white/70 p-3 text-center">
                <p className="text-lg font-semibold tabular-nums text-warm-900">{health.activeConnections + health.idleConnections}</p>
                <p className="mt-0.5 text-micro text-warm-400">DB connections</p>
              </div>
              <div className="rounded-xl bg-white/70 p-3 text-center">
                <p className="text-lg font-semibold tabular-nums text-warm-900">{health.activeSessions}</p>
                <p className="mt-0.5 text-micro text-warm-400">Active sessions</p>
              </div>
              <div className="rounded-xl bg-white/70 p-3 text-center">
                <p className={cn(
                  'text-lg font-semibold tabular-nums',
                  health.avgResponseTimeMs > 3000 ? 'text-amber-600' : 'text-warm-900'
                )}>
                  {health.avgResponseTimeMs}ms
                </p>
                <p className="mt-0.5 text-micro text-warm-400">Dashboard latency</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-500">Storage breakdown</p>
            {health.largestTables.length > 0 ? (
              <div className="mt-3 space-y-2">
                {health.largestTables.slice(0, 5).map((table) => {
                  const pct = health.dbSizeBytes > 0 ? (table.size_bytes / health.dbSizeBytes) * 100 : 0;
                  return (
                    <div key={table.table_name}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-warm-700">
                          {table.table_name.replace(/^(golf_|baseball_)/, '')}
                        </span>
                        <span className="tabular-nums text-warm-400">{formatBytes(table.size_bytes)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-warm-100">
                        <div
                          className="h-full rounded-full bg-primary-400"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-warm-500">No storage breakdown available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
