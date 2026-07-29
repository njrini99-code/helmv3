'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconActivity, IconRefresh, IconWarning } from '@/components/icons';
import {
  getTemplatePerformance,
  getTimeToOpenDistribution,
  getClickDestinations,
  getDeliverabilitySummary,
  getCrmFunnel,
  type InsightsWindow,
  type TemplatePerformanceRow,
  type TimeToOpenBucket,
  type ClickDestinationRow,
  type DeliverabilitySummary,
  type CrmFunnel,
} from '@/app/golf/actions/crm-insights';
import {
  CRM_DANGER_ACTION_CLASS,
  CRM_ICON_ACTION_CLASS,
  CRM_TERTIARY_ACTION_CLASS,
  SEGMENTED_TABLIST_CLASS,
  segmentedTabClass,
} from '@/app/golf/admin/crm/page-contracts';
import { DeliverabilityCards } from './DeliverabilityCards';
import { FunnelCard } from './FunnelCard';
import { TemplatePerformanceTable } from './TemplatePerformanceTable';
import { TimeToOpenChart } from './TimeToOpenChart';
import { ClickHeatmap } from './ClickHeatmap';
import { Button, IconButton } from '@/components/ui/button';

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
  // True when 1+ (but not all) of the five slices failed to load this
  // fetch — the widgets that did load still render; this just adds a
  // compact, non-blocking notice instead of hiding everything behind the
  // full-page error state below.
  const [partialFailure, setPartialFailure] = useState(false);

  const [summary, setSummary] = useState<DeliverabilitySummary | null>(null);
  const [templates, setTemplates] = useState<TemplatePerformanceRow[]>([]);
  const [buckets, setBuckets] = useState<TimeToOpenBucket[]>([]);
  const [clickDestinations, setClickDestinations] = useState<ClickDestinationRow[]>([]);
  const [funnel, setFunnel] = useState<CrmFunnel | null>(null);

  const fetchAll = useCallback(async (w: InsightsWindow) => {
    setLoading(true);
    setError(null);
    setPartialFailure(false);

    // Promise.allSettled (not Promise.all) so one failed RPC doesn't
    // discard the other four slices that loaded fine. Every action in
    // crm-insights.ts rejects consistently on RPC failure (see that
    // file's header), so a rejection here always means a real failure,
    // never a genuinely-empty result.
    const [s, t, b, c, f] = await Promise.allSettled([
      getDeliverabilitySummary(w),
      getTemplatePerformance(w),
      getTimeToOpenDistribution(w),
      getClickDestinations(w, 25),
      getCrmFunnel(w),
    ]);

    const results = [s, t, b, c, f];
    const failedCount = results.filter((r) => r.status === 'rejected').length;

    if (failedCount === results.length) {
      // Every slice failed — nothing meaningful to render. Fall back to
      // the existing full-page error banner (with Retry) instead of an
      // amber notice over five empty widgets.
      const firstRejected = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      const msg =
        firstRejected?.reason instanceof Error
          ? firstRejected.reason.message
          : 'Failed to load insights';
      setError(msg);
      setLoading(false);
      return;
    }

    if (s.status === 'fulfilled') setSummary(s.value);
    if (t.status === 'fulfilled') setTemplates(t.value);
    if (b.status === 'fulfilled') setBuckets(b.value);
    if (c.status === 'fulfilled') setClickDestinations(c.value);
    if (f.status === 'fulfilled') setFunnel(f.value);

    setPartialFailure(failedCount > 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll(window);
  }, [window, fetchAll]);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">Analytics overview</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Per-template performance, time-to-open distribution, and top-clicked
            destinations across your CRM email program.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Window switcher — shared segmented-tablist spec (page-contracts.ts)
              so this is the same control as the Inbox sections / other CRM
              sub-tabs, not a one-off that renders every pill solid green. */}
          <div
            role="tablist"
            aria-label="Insights time window"
            className={SEGMENTED_TABLIST_CLASS}
          >
            {WINDOWS.map((w) => {
              const isActive = w.id === window;
              return (
                <Button variant="ghost"
                  key={w.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setWindow(w.id)}
                  className={segmentedTabClass(isActive)}
                >
                  {w.label}
                </Button>
              );
            })}
          </div>
          <IconButton variant="default"
            type="button"
            onClick={() => fetchAll(window)}
            disabled={loading}
            aria-label="Refresh insights"
            className={cn(CRM_ICON_ACTION_CLASS, 'disabled:cursor-not-allowed disabled:opacity-50')}
          >
            <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {error && (
        <div className="bg-fw-danger-bg/70 backdrop-blur-xl border border-fw-danger/25 rounded-card p-4 flex items-start gap-3">
          <IconActivity size={16} className="text-fw-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fw-danger-ink">Couldn’t load insights</p>
            <p className="text-xs text-fw-danger-ink mt-0.5">{error}</p>
          </div>
          <Button variant="danger"
            onClick={() => fetchAll(window)}
            className={CRM_DANGER_ACTION_CLASS}
          >
            Retry
          </Button>
        </div>
      )}

      {!error && partialFailure && (
        <div className="bg-fw-warning-bg/70 backdrop-blur-xl border border-fw-warning-ring rounded-card px-4 py-2.5 flex items-center gap-2.5">
          <IconWarning size={14} className="text-fw-warning-ink flex-shrink-0" />
          <p className="text-xs font-medium text-fw-warning-ink flex-1">
            Some analytics failed to load — refresh
          </p>
          <Button variant="ghost"
            onClick={() => fetchAll(window)}
            className={CRM_TERTIARY_ACTION_CLASS}
          >
            Refresh
          </Button>
        </div>
      )}

      {/* ── KPI row ── */}
      <DeliverabilityCards summary={summary} loading={loading} />

      {/* ── Outreach funnel (full-width) ── */}
      <FunnelCard funnel={funnel} loading={loading} />

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
