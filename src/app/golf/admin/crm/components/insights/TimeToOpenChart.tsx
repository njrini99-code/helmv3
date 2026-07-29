'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { IconClock } from '@/components/icons';
import type { TimeToOpenBucket } from '@/app/golf/actions/crm-insights';

// ============================================================================
// TimeToOpenChart — vertical bar chart of seconds-to-first-open buckets.
// Wraps the histogram returned by `get_crm_time_to_open` (six fixed buckets:
// 0-1m, 1-10m, 10m-1h, 1h-4h, 4h-1d, >1d).
// ============================================================================

interface TimeToOpenChartProps {
  buckets: TimeToOpenBucket[];
  loading?: boolean;
}

// Display order is the natural bucket order; ensure all 6 buckets render even
// when the RPC returns sparse rows (a missing bucket = 0).
const BUCKET_ORDER: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: '0-60',         label: '0-1m',   min: 0,     max: 60 },
  { key: '60-600',       label: '1-10m',  min: 60,    max: 600 },
  { key: '600-3600',     label: '10m-1h', min: 600,   max: 3600 },
  { key: '3600-14400',   label: '1h-4h',  min: 3600,  max: 14400 },
  { key: '14400-86400',  label: '4h-1d',  min: 14400, max: 86400 },
  { key: '86400-999999', label: '>1d',    min: 86400, max: 999999 },
];

function buildSeries(buckets: TimeToOpenBucket[]) {
  const map = new Map<string, number>();
  for (const b of buckets) {
    map.set(`${b.bucket_min}-${b.bucket_max}`, b.count);
  }
  return BUCKET_ORDER.map((b) => ({
    label: b.label,
    count: map.get(b.key) ?? 0,
  }));
}

export function TimeToOpenChart({ buckets, loading }: TimeToOpenChartProps) {
  const series = buildSeries(buckets);
  const total = series.reduce((sum, b) => sum + b.count, 0);

  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5">
        <div className="h-[260px] bg-surface-sunken rounded-fw-sm animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-fw-sm bg-fw-warning-bg text-fw-warning-ink flex items-center justify-center">
            <IconClock size={14} />
          </span>
          <h3 className="text-sm font-semibold text-text-primary">Time to first open</h3>
        </div>
        <span className="text-xs text-text-tertiary tabular-nums">
          {total.toLocaleString()} opens tracked
        </span>
      </div>

      {total === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-text-tertiary">No opens tracked in window</p>
          <p className="text-xs text-text-tertiary mt-1">
            Once recipients open emails, their time-to-open distribution will plot here.
          </p>
        </div>
      ) : (
        <div className="px-3 pt-4 pb-3">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#f5f5f4" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#78716c' }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#78716c' }}
                width={32}
              />
              <Tooltip
                cursor={{ fill: 'rgba(22,163,74,0.06)' }}
                content={<TimeToOpenTooltip />}
              />
              <Bar dataKey="count" fill="var(--fw-color-accent-500)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Custom tooltip — recharts' built-in formatter prop has a finicky generic
// signature; rendering a small content component is cleaner and matches the
// `<ChartTooltip>` pattern used in admin/components/BusinessIntelligenceTab.
// ----------------------------------------------------------------------------
function TimeToOpenTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.97)',
        border: '1px solid rgba(229,229,229,0.8)',
        borderRadius: 12,
        padding: '8px 10px',
        fontSize: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ color: '#78716c' }}>Within {label}</div>
      <div style={{ color: '#1c1917', fontWeight: 600, marginTop: 2 }}>
        {value.toLocaleString()} opens
      </div>
    </div>
  );
}
