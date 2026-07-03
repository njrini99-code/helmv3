'use client';

import { cn } from '@/lib/utils';

interface InfraHealthCardProps {
  apiPerf: {
    actionName: string;
    avgDurationMs: number;
    p95DurationMs: number;
    callCount: number;
    errorRate: number;
  }[];
  clientErrors: {
    message: string;
    occurrences: number;
    lastSeen: string;
    affectedPages: string[];
  }[];
  dbHealth: {
    activeConnections: number;
    idleConnections: number;
    dbSizeBytes: number;
    largestTables: { tableName: string; sizeBytes: number; rowCount: number }[];
  };
  totals: {
    totalApiCalls7d: number;
    avgResponseMs: number;
    p95ResponseMs: number;
    errorRate: number;
    totalClientErrors7d: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function responseTimeColor(ms: number): string {
  if (ms < 500) return 'text-primary-600';
  if (ms < 2000) return 'text-amber-600';
  return 'text-red-600';
}

function errorRateColor(rate: number): string {
  if (rate < 1) return 'text-primary-600';
  if (rate < 5) return 'text-amber-600';
  return 'text-red-600';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function InfraHealthCard({
  apiPerf,
  clientErrors,
  dbHealth,
  totals,
}: InfraHealthCardProps) {
  return (
    <div className="space-y-6">
      {/* API Performance + Client Errors: side by side on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Performance Section */}
        <div className="glass-standard rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-warm-900 mb-4">
            API Performance (7d)
          </h3>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-warm-500">Total Calls</p>
              <p className="text-lg font-semibold text-warm-900">
                {formatNumber(totals.totalApiCalls7d)}
              </p>
            </div>
            <div>
              <p className="text-sm text-warm-500">Avg Response</p>
              <p
                className={cn(
                  'text-lg font-semibold',
                  responseTimeColor(totals.avgResponseMs)
                )}
              >
                {totals.avgResponseMs.toFixed(0)}ms
              </p>
            </div>
            <div>
              <p className="text-sm text-warm-500">P95 Response</p>
              <p
                className={cn(
                  'text-lg font-semibold',
                  responseTimeColor(totals.p95ResponseMs)
                )}
              >
                {totals.p95ResponseMs.toFixed(0)}ms
              </p>
            </div>
            <div>
              <p className="text-sm text-warm-500">Error Rate</p>
              <p
                className={cn(
                  'text-lg font-semibold',
                  errorRateColor(totals.errorRate)
                )}
              >
                {totals.errorRate.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Actions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left py-2 pr-3 text-warm-500 font-medium">
                    Action
                  </th>
                  <th className="text-right py-2 px-3 text-warm-500 font-medium">
                    Avg
                  </th>
                  <th className="text-right py-2 px-3 text-warm-500 font-medium">
                    P95
                  </th>
                  <th className="text-right py-2 px-3 text-warm-500 font-medium">
                    Calls
                  </th>
                  <th className="text-right py-2 pl-3 text-warm-500 font-medium">
                    Errors
                  </th>
                </tr>
              </thead>
              <tbody>
                {apiPerf.map((action) => (
                  <tr
                    key={action.actionName}
                    className="border-b border-warm-100 last:border-0"
                  >
                    <td className="py-2 pr-3 text-warm-900 font-mono text-xs truncate max-w-[200px]">
                      {action.actionName}
                    </td>
                    <td
                      className={cn(
                        'py-2 px-3 text-right tabular-nums',
                        responseTimeColor(action.avgDurationMs)
                      )}
                    >
                      {action.avgDurationMs.toFixed(0)}ms
                    </td>
                    <td
                      className={cn(
                        'py-2 px-3 text-right tabular-nums',
                        responseTimeColor(action.p95DurationMs)
                      )}
                    >
                      {action.p95DurationMs.toFixed(0)}ms
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-warm-900">
                      {formatNumber(action.callCount)}
                    </td>
                    <td
                      className={cn(
                        'py-2 pl-3 text-right tabular-nums',
                        errorRateColor(action.errorRate)
                      )}
                    >
                      {action.errorRate.toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {apiPerf.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-warm-400 text-sm"
                    >
                      No API performance data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Errors Section */}
        <div className="glass-standard rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-warm-900">
              Client Errors (7d)
            </h3>
            <span className="text-sm text-warm-500">
              {formatNumber(totals.totalClientErrors7d)} total
            </span>
          </div>

          <div className="space-y-3">
            {clientErrors.map((error, idx) => (
              <div
                key={idx}
                className="border border-warm-100 rounded-xl p-3 hover:bg-cream-100 active:bg-cream-100 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p
                    className="text-sm text-warm-900 font-mono truncate flex-1"
                    title={error.message}
                  >
                    {error.message}
                  </p>
                  <span className="shrink-0 text-sm font-semibold text-red-600 tabular-nums">
                    {error.occurrences}x
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {error.affectedPages.map((page) => (
                      <span
                        key={page}
                        className="inline-block text-xs px-2 py-0.5 rounded-full bg-warm-100 text-warm-500"
                      >
                        {page}
                      </span>
                    ))}
                  </div>
                  <span className="shrink-0 text-xs text-warm-400">
                    {error.lastSeen}
                  </span>
                </div>
              </div>
            ))}
            {clientErrors.length === 0 && (
              <div className="py-8 text-center text-warm-400 text-sm">
                No client errors recorded
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Database Section (compact) */}
      <div className="glass-standard rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-warm-900 mb-4">Database</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Connection Pool */}
          <div>
            <p className="text-sm text-warm-500 mb-1">Connection Pool</p>
            <p className="text-lg font-semibold text-warm-900">
              <span className="text-primary-600">
                {dbHealth.activeConnections} active
              </span>
              {' / '}
              <span className="text-warm-400">
                {dbHealth.idleConnections} idle
              </span>
            </p>
          </div>

          {/* DB Size */}
          <div>
            <p className="text-sm text-warm-500 mb-1">Database Size</p>
            <p className="text-lg font-semibold text-warm-900">
              {formatBytes(dbHealth.dbSizeBytes)}
            </p>
          </div>

          {/* Top Tables */}
          <div className="sm:col-span-1">
            <p className="text-sm text-warm-500 mb-2">Top Tables by Size</p>
            <div className="space-y-1.5">
              {dbHealth.largestTables.slice(0, 5).map((table) => (
                <div
                  key={table.tableName}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-warm-900 font-mono text-xs truncate mr-3">
                    {table.tableName}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-warm-400 text-xs tabular-nums">
                      {formatNumber(table.rowCount)} rows
                    </span>
                    <span className="text-warm-500 text-xs tabular-nums font-medium">
                      {formatBytes(table.sizeBytes)}
                    </span>
                  </div>
                </div>
              ))}
              {dbHealth.largestTables.length === 0 && (
                <p className="text-warm-400 text-xs">No table data available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
