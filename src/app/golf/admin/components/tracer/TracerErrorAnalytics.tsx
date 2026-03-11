'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertTriangle, XCircle } from 'lucide-react';
import { AdminAreaChart, AdminDonutChart, AdminProgressBar } from '../AdminChart';
import { timeAgo } from '../admin-utils';
import type { ErrorGroup, AffectedPlayer, DailyCount, TracerErrorLog } from './tracer-types';

// ============================================================================
// TYPES
// ============================================================================

interface TracerErrorAnalyticsProps {
  errorGroups: ErrorGroup[];
  affectedPlayers: AffectedPlayer[];
  dailyErrorCounts: DailyCount[];
  recentErrors: TracerErrorLog[];
  totalErrors7d: number;
  criticalErrors7d: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GLASS_CARD = cn(
  'bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl',
  'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
);

const TIME_RANGES = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]['label'];

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  error: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-blue-50 text-blue-700',
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-red-500',
  error: 'border-red-400',
  warning: 'border-amber-400',
  info: 'border-blue-400',
};

const SEVERITY_DONUT_COLORS: Record<string, string> = {
  critical: '#EF4444',
  error: '#F87171',
  warning: '#F59E0B',
  info: '#3B82F6',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function filterByDays(data: DailyCount[], days: number): DailyCount[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

// ============================================================================
// EXPANDABLE ERROR ROW
// ============================================================================

function ErrorRow({ error }: { error: TracerErrorLog }) {
  const [expanded, setExpanded] = useState(false);
  const severity = error.severity ?? 'info';
  const context = error.context as Record<string, unknown> | null;

  const action = context?.action as string | undefined;
  const roundId = context?.roundId as string | undefined;
  const userEmail = context?.userEmail as string | undefined;

  return (
    <div
      className={cn(
        'border-l-[3px] px-4 py-3 transition-colors',
        SEVERITY_BORDER[severity] ?? SEVERITY_BORDER.info,
        expanded ? 'bg-warm-50/40' : 'hover:bg-white/40'
      )}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 text-left"
      >
        {/* Expand icon */}
        <span className="mt-0.5 text-warm-400 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity badge */}
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.info
              )}
            >
              {severity}
            </span>

            {/* Action badge */}
            {action && (
              <span className="font-mono bg-warm-100/50 px-1.5 py-0.5 rounded text-[11px] text-warm-600">
                {action}
              </span>
            )}

            {/* Inline context badges */}
            {roundId && (
              <span className="text-[10px] text-warm-500 bg-warm-100/40 px-1.5 py-0.5 rounded font-mono">
                {truncate(roundId, 12)}
              </span>
            )}
            {userEmail && (
              <span className="text-[10px] text-warm-500 bg-warm-100/40 px-1.5 py-0.5 rounded">
                {userEmail}
              </span>
            )}
          </div>

          {/* Message */}
          <p className="text-sm text-warm-700 mt-1 leading-relaxed">
            {error.message}
          </p>
        </div>

        {/* Timestamp */}
        <span className="text-[11px] text-warm-400 tabular-nums shrink-0 mt-0.5">
          {timeAgo(error.created_at)}
        </span>
      </button>

      {/* Expanded context */}
      {expanded && context && (
        <div className="mt-3 ml-6">
          <pre className="text-xs text-warm-600 bg-warm-100/50 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
            {JSON.stringify(context, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TracerErrorAnalytics({
  errorGroups,
  affectedPlayers,
  dailyErrorCounts,
  recentErrors,
  totalErrors7d,
  criticalErrors7d,
}: TracerErrorAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  // ------------------------------------------------------------------
  // Computed data
  // ------------------------------------------------------------------

  // Filter daily error counts by selected time range
  const filteredDailyData = useMemo(() => {
    const rangeCfg = TIME_RANGES.find((r) => r.label === timeRange);
    const days = rangeCfg?.days ?? 7;
    return filterByDays(dailyErrorCounts, days);
  }, [dailyErrorCounts, timeRange]);

  // Transform to chart data
  const trendChartData = useMemo(
    () =>
      filteredDailyData.map((d) => ({
        label: formatDateLabel(d.date),
        value: d.count,
      })),
    [filteredDailyData]
  );

  // Error distribution by severity
  const severityDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const err of recentErrors) {
      const sev = err.severity ?? 'info';
      counts[sev] = (counts[sev] ?? 0) + 1;
    }
    // Stable order: critical, error, warning, info
    const order = ['critical', 'error', 'warning', 'info'];
    return order
      .filter((sev) => (counts[sev] ?? 0) > 0)
      .map((sev) => ({
        label: sev.charAt(0).toUpperCase() + sev.slice(1),
        value: counts[sev] ?? 0,
        color: SEVERITY_DONUT_COLORS[sev] ?? '#94A3B8',
      }));
  }, [recentErrors]);

  // Top 5 affected players
  const topPlayers = useMemo(() => affectedPlayers.slice(0, 5), [affectedPlayers]);
  const maxPlayerErrors = topPlayers.length > 0 ? topPlayers[0]!.errorCount : 1;

  // Recent errors capped at 20
  const displayErrors = useMemo(() => recentErrors.slice(0, 20), [recentErrors]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* SUMMARY STAT PILLS                                                 */}
      {/* ================================================================== */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <XCircle size={16} className="text-red-500" />
          <span className="text-sm text-warm-600">
            <span className="font-semibold text-warm-900 tabular-nums">{totalErrors7d}</span>{' '}
            errors (7d)
          </span>
        </div>
        {criticalErrors7d > 0 && (
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600" />
            <span className="text-sm text-red-600 font-medium tabular-nums">
              {criticalErrors7d} critical
            </span>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* 1. ERROR TREND CHART                                               */}
      {/* ================================================================== */}
      <div className={cn(GLASS_CARD, 'p-5')}>
        {/* Time range toggle */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-warm-900">Error Trend</h3>
          <div className="flex items-center gap-1 bg-warm-100/50 rounded-lg p-0.5">
            {TIME_RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setTimeRange(r.label)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                  timeRange === r.label
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-500 hover:text-warm-700'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <AdminAreaChart
          data={trendChartData}
          title="Error Trend"
          color="#EF4444"
          height={220}
        />
      </div>

      {/* ================================================================== */}
      {/* 2. ERROR DISTRIBUTION + MOST AFFECTED PLAYERS                      */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Donut */}
        <div className={cn(GLASS_CARD, 'p-5')}>
          <AdminDonutChart
            data={severityDistribution}
            title="Error Distribution"
            size={150}
          />
        </div>

        {/* Right: Most Affected Players */}
        <div className={cn(GLASS_CARD, 'p-5')}>
          <h4 className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-4">
            Most Affected Players
          </h4>

          {topPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-warm-100/80 flex items-center justify-center mb-3">
                <AlertTriangle size={18} className="text-warm-400" />
              </div>
              <p className="text-sm font-medium text-warm-600 mb-1">No affected players</p>
              <p className="text-xs text-warm-400">No players have encountered errors recently</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topPlayers.map((player) => (
                <AdminProgressBar
                  key={player.player_id}
                  label={player.player_name}
                  value={player.errorCount}
                  max={maxPlayerErrors}
                  color="#EF4444"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 3. ERROR GROUPING TABLE                                            */}
      {/* ================================================================== */}
      <div className={cn(GLASS_CARD, 'overflow-hidden')}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wider">
            Error Groups
          </h3>
        </div>

        {errorGroups.length === 0 ? (
          <div className="px-5 pb-6 text-center">
            <p className="text-warm-400 text-sm">No grouped errors</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100/60">
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                    Message
                  </th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                    First Seen
                  </th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-medium text-warm-400 uppercase tracking-wider">
                    Players
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100/40">
                {errorGroups.map((group) => (
                  <tr
                    key={group.key}
                    className="hover:bg-white/40 transition-colors"
                  >
                    {/* Severity badge */}
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                          SEVERITY_BADGE[group.severity] ?? SEVERITY_BADGE.info
                        )}
                      >
                        {group.severity}
                      </span>
                    </td>

                    {/* Message (truncated) */}
                    <td className="px-5 py-3">
                      <span
                        className="text-warm-700"
                        title={group.message}
                      >
                        {truncate(group.message, 80)}
                      </span>
                    </td>

                    {/* Count */}
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-warm-900 tabular-nums">
                        {group.count}
                      </span>
                    </td>

                    {/* First Seen */}
                    <td className="px-5 py-3">
                      <span className="text-warm-500 text-xs tabular-nums">
                        {timeAgo(group.firstSeen)}
                      </span>
                    </td>

                    {/* Last Seen */}
                    <td className="px-5 py-3">
                      <span className="text-warm-500 text-xs tabular-nums">
                        {timeAgo(group.lastSeen)}
                      </span>
                    </td>

                    {/* Affected Players count */}
                    <td className="px-5 py-3 text-right">
                      <span className="text-warm-600 tabular-nums">
                        {group.affectedPlayers.length}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* 4. RECENT ERROR LIST                                               */}
      {/* ================================================================== */}
      <div className={cn(GLASS_CARD, 'overflow-hidden')}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wider">
            Recent Errors
          </h3>
        </div>

        {displayErrors.length === 0 ? (
          <div className="px-5 pb-6 text-center">
            <p className="text-warm-400 text-sm">No recent errors</p>
          </div>
        ) : (
          <div className="divide-y divide-warm-100/40 max-h-[600px] overflow-y-auto">
            {displayErrors.map((error, i) => (
              <ErrorRow key={error.id ?? i} error={error} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
