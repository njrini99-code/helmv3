'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconActivity, IconRefresh } from '@/components/icons';
import {
  getTemplatePerformance,
  getTimeToOpenDistribution,
  getClickDestinations,
  getDeliverabilitySummary,
  type InsightsWindow,
  type TemplatePerformanceRow,
  type TimeToOpenBucket,
  type ClickDestinationRow,
  type DeliverabilitySummary,
} from '@/app/golf/actions/crm-insights';
import { DeliverabilityCards } from './DeliverabilityCards';
import { TemplatePerformanceTable } from './TemplatePerformanceTable';
import { TimeToOpenChart } from './TimeToOpenChart';
import { ClickHeatmap } from './ClickHeatmap';

// ============================================================================
// InsightsDashboard — top-level orchestrator for `/golf/admin/crm/insights`.
// ============================================================================
// Loads four data slices in parallel for the active window (7d/30d/90d) and
// distributes each to its presentation component. Re-fetches when the window
// changes; provides a manual refresh button as a backup.
// ============================================================================

const WINDOWS: { id: InsightsWindow; label: string }[] = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
];

export function InsightsDashboard() {
  const [window, setWindow] = useState<InsightsWindow>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DeliverabilitySummary | null>(null);
  const [templates, setTemplates] = useState<TemplatePerformanceRow[]>([]);
  const [buckets, setBuckets] = useState<TimeToOpenBucket[]>([]);
  const [clickDestinations, setClickDestinations] = useState<ClickDestinationRow[]>([]);

  const fetchAll = useCallback(async (w: InsightsWindow) => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, b, c] = await Promise.all([
        getDeliverabilitySummary(w),
        getTemplatePerformance(w),
        getTimeToOpenDistribution(w),
        getClickDestinations(w, 25),
      ]);
      setSummary(s);
      setTemplates(t);
      setBuckets(b);
      setClickDestinations(c);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load insights';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(window);
  }, [window, fetchAll]);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-warm-900 tracking-tight">Insights</h2>
          <p className="text-sm text-warm-500 mt-1">
            Per-template performance, time-to-open distribution, and top-clicked
            destinations across your CRM email program.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Window switcher */}
          <div
            role="tablist"
            aria-label="Insights time window"
            className="inline-flex items-center bg-white/70 backdrop-blur-xl border border-white/20 rounded-full p-1 shadow-glass-sm"
          >
            {WINDOWS.map((w) => {
              const isActive = w.id === window;
              return (
                <button
                  key={w.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setWindow(w.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                    isActive
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-warm-600 hover:text-warm-900',
                  )}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => fetchAll(window)}
            disabled={loading}
            aria-label="Refresh insights"
            className={cn(
              'inline-flex items-center justify-center w-9 h-9 rounded-full',
              'bg-white/70 border border-white/30 backdrop-blur-xl shadow-glass-sm',
              'text-warm-600 hover:text-warm-900 hover:bg-white/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50/70 backdrop-blur-xl border border-red-200/60 rounded-2xl p-4 flex items-start gap-3">
          <IconActivity size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Couldn’t load insights</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => fetchAll(window)}
            className="text-xs font-semibold text-red-700 hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── KPI row ── */}
      <DeliverabilityCards summary={summary} loading={loading} />

      {/* ── Two-column: chart + heatmap ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeToOpenChart buckets={buckets} loading={loading} />
        <ClickHeatmap rows={clickDestinations} loading={loading} />
      </div>

      {/* ── Template table ── */}
      <TemplatePerformanceTable rows={templates} loading={loading} />
    </div>
  );
}
