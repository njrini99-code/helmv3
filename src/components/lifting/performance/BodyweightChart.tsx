'use client';

// =============================================================================
// src/components/lifting/performance/BodyweightChart.tsx
//
// Helm Lifting Lab — premium bodyweight trend chart.
// Smooth area line + goal/target band, 7/30/90/season range toggle,
// 30-day delta badge, annotation markers (nutrition plan, missed check-ins).
// Honest empty state: only plots real data; never fabricates points.
// =============================================================================

import { useState, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { IconActivity, IconTrendingUp } from '@/components/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BodyweightEntry {
  entry_date: string; // YYYY-MM-DD
  weight_lbs: number;
}

/** Optional annotation that appears as a reference line on the chart. */
export interface BodyweightAnnotation {
  date: string; // YYYY-MM-DD
  /** 'nutrition_assigned' | 'missed_checkin' */
  type: 'nutrition_assigned' | 'missed_checkin';
  label?: string;
}

type RangeKey = '7d' | '30d' | '90d' | 'season';

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d',     label: '7D',     days: 7    },
  { key: '30d',    label: '30D',    days: 30   },
  { key: '90d',    label: '90D',    days: 90   },
  { key: 'season', label: 'Season', days: null },
];

interface Props {
  entries: BodyweightEntry[];
  /** Goal weight in lbs — rendered as a shaded target band ±2 lbs. */
  goalWeightLbs?: number | null;
  /** Annotations shown as reference lines on the chart. */
  annotations?: BodyweightAnnotation[];
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(ymd: string): string {
  const [, mm, dd] = ymd.split('-');
  return `${mm}/${dd}`;
}

function fmtWeight(v: number): string {
  return `${v.toFixed(1)} lbs`;
}

function filterByRange(entries: BodyweightEntry[], days: number | null): BodyweightEntry[] {
  if (!days) return entries;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return entries.filter((e) => e.entry_date >= cutStr);
}

function filterAnnotationsByRange(
  annotations: BodyweightAnnotation[],
  days: number | null,
): BodyweightAnnotation[] {
  if (!days) return annotations;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return annotations.filter((a) => a.date >= cutStr);
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  payload?: {
    date?: string;
    rawDate?: string;
    weight?: number;
    annotationType?: string;
  };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const weight = d?.weight;
  const annotationType = d?.annotationType;

  return (
    <div className="rounded-2xl border border-white/40 glass-standard px-3 py-2 shadow-lg backdrop-blur-xl text-xs">
      <p className="font-semibold text-warm-900">{label}</p>
      {weight != null && (
        <p className="mt-0.5 text-warm-600">{fmtWeight(weight)}</p>
      )}
      {annotationType === 'nutrition_assigned' && (
        <p className="mt-0.5 text-primary-600 font-medium">Nutrition plan assigned</p>
      )}
      {annotationType === 'missed_checkin' && (
        <p className="mt-0.5 text-amber-600 font-medium">Missed check-in</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta badge
// ---------------------------------------------------------------------------

function DeltaBadge({ change }: { change: number }) {
  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.1;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-xs font-semibold ${
        isNeutral
          ? 'bg-warm-100 text-warm-500'
          : isPositive
            ? 'bg-amber-50 text-amber-700'
            : 'bg-primary-50 text-primary-700'
      }`}
    >
      <IconTrendingUp
        size={12}
        style={{ transform: change < 0 ? 'scaleY(-1)' : undefined }}
      />
      {isNeutral ? 'Stable' : `${isPositive ? '+' : ''}${change.toFixed(1)} lbs`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BodyweightChart({
  entries,
  goalWeightLbs = null,
  annotations = [],
  loading = false,
}: Props) {
  const prefersReduced = useReducedMotion();
  const [range, setRange] = useState<RangeKey>('30d');

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [entries],
  );

  const rangeObj = RANGES.find((r) => r.key === range)!;

  const filtered = useMemo(
    () => filterByRange(sorted, rangeObj.days),
    [sorted, rangeObj.days],
  );

  const visibleAnnotations = useMemo(
    () => filterAnnotationsByRange(annotations, rangeObj.days),
    [annotations, rangeObj.days],
  );

  // Build annotation date set for fast lookup
  const annotationMap = useMemo(() => {
    const m = new Map<string, BodyweightAnnotation>();
    for (const a of visibleAnnotations) m.set(a.date, a);
    return m;
  }, [visibleAnnotations]);

  const delta30d = useMemo(() => {
    // 30-day delta regardless of selected range
    const last30 = filterByRange(sorted, 30);
    if (last30.length < 2) return null;
    const diff = last30[last30.length - 1]!.weight_lbs - last30[0]!.weight_lbs;
    return Math.round(diff * 10) / 10;
  }, [sorted]);

  const current = filtered.length > 0 ? filtered[filtered.length - 1]!.weight_lbs : null;
  const avgWeight = useMemo(() => {
    if (filtered.length === 0) return null;
    const sum = filtered.reduce((acc, e) => acc + e.weight_lbs, 0);
    return Math.round((sum / filtered.length) * 10) / 10;
  }, [filtered]);

  const chartData = filtered.map((e) => {
    const ann = annotationMap.get(e.entry_date);
    return {
      date: fmtDate(e.entry_date),
      rawDate: e.entry_date,
      weight: e.weight_lbs,
      annotationType: ann?.type,
    };
  });

  const minW = filtered.length > 0 ? Math.min(...filtered.map((e) => e.weight_lbs)) : 0;
  const maxW = filtered.length > 0 ? Math.max(...filtered.map((e) => e.weight_lbs)) : 0;
  const domainPad = 4;

  // Goal band bounds
  const goalBandLow = goalWeightLbs != null ? goalWeightLbs - 2 : null;
  const goalBandHigh = goalWeightLbs != null ? goalWeightLbs + 2 : null;

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-56 rounded-lg" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconActivity size={18} className="text-primary-600" />
            <h3 className="font-semibold text-warm-900">Bodyweight</h3>
          </div>

          {/* Range picker */}
          <div
            className="flex items-center gap-1 rounded-xl bg-warm-100 p-1"
            role="group"
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <Button
                key={r.key}
                type="button"
                variant="ghost"
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
                  range === r.key
                    ? 'bg-cream-50 text-warm-900 shadow-sm'
                    : 'text-warm-500 hover:text-warm-700'
                }`}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Stat row */}
        {filtered.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div>
              <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                Current
              </p>
              <p className="text-xl font-bold text-warm-900">
                {current != null ? fmtWeight(current) : '—'}
              </p>
            </div>

            {delta30d !== null && (
              <div>
                <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                  30-day change
                </p>
                <div className="mt-0.5">
                  <DeltaBadge change={delta30d} />
                </div>
              </div>
            )}

            {avgWeight !== null && (
              <div>
                <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                  Avg
                </p>
                <p className="font-semibold text-warm-700">{fmtWeight(avgWeight)}</p>
              </div>
            )}

            {goalWeightLbs != null && (
              <div>
                <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                  Goal
                </p>
                <p className="font-semibold text-primary-600">{fmtWeight(goalWeightLbs)}</p>
              </div>
            )}
          </div>
        )}

        {/* Annotation legend */}
        {visibleAnnotations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {visibleAnnotations.some((a) => a.type === 'nutrition_assigned') && (
              <span className="flex items-center gap-1.5 text-micro text-warm-400">
                <span className="inline-block h-px w-4 border-t-2 border-dashed border-primary-400" />
                Nutrition assigned
              </span>
            )}
            {visibleAnnotations.some((a) => a.type === 'missed_checkin') && (
              <span className="flex items-center gap-1.5 text-micro text-warm-400">
                <span className="inline-block h-px w-4 border-t-2 border-dashed border-amber-400" />
                Missed check-in
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconActivity size={24} />}
            title="No weight entries yet"
            description="Weight entries will appear here once your athlete logs check-ins."
          />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="bwGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e7e5e4"
                vertical={false}
              />

              {/* Goal band — shaded reference area */}
              {goalBandLow != null && goalBandHigh != null && (
                <ReferenceArea
                  y1={goalBandLow}
                  y2={goalBandHigh}
                  fill="rgba(22,163,74,0.07)"
                  stroke="rgba(22,163,74,0.2)"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
              )}

              {/* Annotation reference lines */}
              {visibleAnnotations.map((a) => (
                <ReferenceLine
                  key={`${a.type}-${a.date}`}
                  x={fmtDate(a.date)}
                  stroke={a.type === 'nutrition_assigned' ? '#16a34a' : '#f59e0b'}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                />
              ))}

              {/* Average reference */}
              {avgWeight !== null && (
                <ReferenceLine
                  y={avgWeight}
                  stroke="#a8a29e"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
              )}

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[
                  Math.min(minW - domainPad, goalBandLow ?? Infinity, minW - domainPad),
                  Math.max(maxW + domainPad, goalBandHigh ?? -Infinity, maxW + domainPad),
                ]}
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v: number) => `${v}`}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: '#16a34a', strokeWidth: 1, strokeOpacity: 0.3 }}
              />

              {/* Area fill under the line */}
              <Area
                type="monotone"
                dataKey="weight"
                stroke="none"
                fill="url(#bwGradient)"
                activeDot={false}
                animationDuration={prefersReduced ? 0 : 600}
              />

              {/* Line */}
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#16a34a"
                strokeWidth={2.5}
                dot={
                  filtered.length <= 14
                    ? { r: 3, fill: '#16a34a', stroke: '#fff', strokeWidth: 1.5 }
                    : false
                }
                activeDot={{ r: 5, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={prefersReduced ? 0 : 600}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Goal band legend */}
        {goalWeightLbs != null && filtered.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-micro text-warm-400">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary-100 ring-1 ring-primary-200" />
            Goal range ±2 lbs ({fmtWeight(goalBandLow!)} – {fmtWeight(goalBandHigh!)})
          </div>
        )}
      </CardContent>
    </Card>
  );
}
