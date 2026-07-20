'use client';

/**
 * "Weekly Pulse" KPI trend strip — first card on the CRM Dashboard tab.
 *
 * Fetches getWeeklyKpis(8) on mount (own data, per house convention — no
 * props threaded from page.tsx). Renders 5 metric tiles (Sent, Opens,
 * Clicks, Replies, Stage-ups), each showing the current (partial) week's
 * value, its delta vs. the last full week, and an 8-week sparkline.
 *
 * Pure derivation (delta direction, sparkline point normalization) lives in
 * the colocated leaf module weekly-pulse-math.ts so it's unit-testable
 * without mounting this component.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getWeeklyKpis, type WeeklyKpiRow } from '@/app/golf/actions/crm-kpis';
import { deltaFor, sparkPoints, type WeeklyKpiMetricKey } from './weekly-pulse-math';

const METRICS: ReadonlyArray<{ key: WeeklyKpiMetricKey; label: string }> = [
  { key: 'sent', label: 'Sent' },
  { key: 'opened', label: 'Opens' },
  { key: 'clicked', label: 'Clicks' },
  { key: 'replied', label: 'Replies' },
  { key: 'stage_advances', label: 'Stage-ups' },
];

const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 20;

export function WeeklyPulse() {
  const [rows, setRows] = useState<WeeklyKpiRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWeeklyKpis(8).then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading — initial fetch still in flight.
  if (rows === null) {
    return (
      <div className="glass-standard rounded-2xl p-5 shadow-glass">
        <PulseHeader />
        <div className="skeleton-shimmer block h-24 rounded-xl bg-warm-100/60 mt-4" />
      </div>
    );
  }

  // No data yet (fresh tenant, or the action degraded to [] on error) — the
  // action already logs the failure case, so this component just stays
  // quiet rather than showing an empty/zeroed card.
  const allZero = rows.length === 0
    || rows.every((row) => METRICS.every(({ key }) => row[key] === 0));
  if (allZero) return null;

  return (
    <div className="glass-standard rounded-2xl p-5 shadow-glass">
      <PulseHeader />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
        {METRICS.map(({ key, label }) => (
          <MetricTile key={key} rows={rows} metricKey={key} label={label} />
        ))}
      </div>
    </div>
  );
}

function PulseHeader() {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <p className="text-micro uppercase tracking-wider font-semibold text-warm-500">
          Last 8 weeks
        </p>
        <h3 className="text-sm font-semibold text-warm-900 mt-0.5">Weekly pulse</h3>
      </div>
      <p className="text-micro text-warm-400 flex-shrink-0">This week so far</p>
    </div>
  );
}

function MetricTile({
  rows,
  metricKey,
  label,
}: {
  rows: WeeklyKpiRow[];
  metricKey: WeeklyKpiMetricKey;
  label: string;
}) {
  const delta = deltaFor(rows, metricKey);
  const diff = Math.abs(delta.current - delta.previous);
  const points = sparkPoints(rows, metricKey, SPARK_WIDTH, SPARK_HEIGHT);

  return (
    <div className="min-w-0">
      <p className="text-micro uppercase tracking-wider font-semibold text-warm-500 truncate">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums text-warm-900 mt-1">
        {delta.current}
      </p>
      <p
        className={cn(
          'text-micro tabular-nums mt-0.5',
          delta.direction === 'up' && 'text-primary-700',
          delta.direction === 'down' && 'text-warm-500',
          delta.direction === 'flat' && 'text-warm-400',
        )}
      >
        {delta.direction === 'up' && `▲ ${diff} vs last full wk`}
        {delta.direction === 'down' && `▼ ${diff} vs last full wk`}
        {delta.direction === 'flat' && '— flat'}
      </p>
      <Sparkline points={points} />
    </div>
  );
}

/** Small inline SVG sparkline — last point (current week) emphasized with a dot. */
function Sparkline({ points }: { points: string }) {
  if (!points) return null;

  const lastPointStr = points.split(' ').pop();
  const [lastX, lastY] = (lastPointStr ?? '0,0').split(',').map(Number);

  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      width="100%"
      height={SPARK_HEIGHT}
      preserveAspectRatio="none"
      className="mt-2 text-primary-600/60"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" />
    </svg>
  );
}
