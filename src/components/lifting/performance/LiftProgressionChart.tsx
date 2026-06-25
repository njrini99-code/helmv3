'use client';

// =============================================================================
// src/components/lifting/performance/LiftProgressionChart.tsx
//
// Helm Lifting Lab — per-exercise lift progression chart.
// Features:
//   • Exercise selector dropdown
//   • Metric tabs: Est. 1RM / Top Load / Volume / RPE trend
//   • Smooth area line + gradient fill
//   • PR markers (gold star dots with tooltip)
//   • 30-day change badge
//   • Honest empty state
// =============================================================================

import { useState, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Cell,
} from 'recharts';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { IconChart, IconAward, IconTrendingUp } from '@/components/icons';
import type { ExerciseProgression } from '@/app/lifting/actions/performance-profile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  progressions: ExerciseProgression[];
  loading?: boolean;
}

type MetricKey = 'est1RM' | 'loadLbs' | 'volume' | 'rpe';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'est1RM',  label: 'Est. 1RM' },
  { key: 'loadLbs', label: 'Top Load' },
  { key: 'volume',  label: 'Volume'   },
  { key: 'rpe',     label: 'RPE'      },
];

// ---------------------------------------------------------------------------
// Chart row type — unified shape across all metrics
// ---------------------------------------------------------------------------

interface ChartRow {
  date: string;
  rawDate: string;
  value: number | null;
  isPR?: boolean;
  rpe?: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(ymd: string): string {
  const [, mm, dd] = ymd.split('-');
  return `${mm}/${dd}`;
}

function fmtValue(v: number | null | undefined, metric: MetricKey): string {
  if (v == null) return '—';
  switch (metric) {
    case 'est1RM':
    case 'loadLbs': return `${v} lbs`;
    case 'volume':  return `${v.toLocaleString()} lbs`;
    case 'rpe':     return `${v} RPE`;
    default:        return String(v);
  }
}

// RPE color — calm heat, not neon
function rpeBarColor(rpe: number | null): string {
  if (rpe == null) return '#e7e5e4';
  if (rpe <= 6) return '#86efac';   // soft green
  if (rpe <= 7) return '#fde68a';   // soft amber
  if (rpe <= 8) return '#fdba74';   // orange-ish
  if (rpe <= 9) return '#f87171';   // soft red
  return '#dc2626';                  // red-600
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipEntry {
  payload?: {
    date?: string;
    value?: number | null;
    isPR?: boolean;
    rpe?: number | null;
    rawDate?: string;
  };
}

function CustomTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  metric: MetricKey;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const isPR = d?.isPR;
  const rpe = d?.rpe;
  const v = d?.value;

  return (
    <div className="rounded-2xl glass-standard px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-warm-900">{label}</p>
      {v != null && (
        <p className="mt-0.5 text-warm-600">{fmtValue(v, metric)}</p>
      )}
      {rpe != null && metric !== 'rpe' && (
        <p className="mt-0.5 text-warm-400">RPE {rpe}</p>
      )}
      {isPR && (
        <p className="mt-0.5 font-semibold text-amber-600">Personal Record</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta badge
// ---------------------------------------------------------------------------

function ChangeBadge({ change, metric }: { change: number; metric: MetricKey }) {
  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.5;
  const label = isNeutral
    ? 'Stable'
    : `${isPositive ? '+' : ''}${fmtValue(change, metric)}`;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-xs font-semibold ${
        isNeutral
          ? 'bg-warm-100 text-warm-500'
          : isPositive
            ? 'bg-primary-50 text-primary-700'
            : 'bg-red-50 text-red-600'
      }`}
    >
      <IconTrendingUp
        size={12}
        style={{ transform: change < 0 ? 'scaleY(-1)' : undefined }}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiftProgressionChart({ progressions, loading = false }: Props) {
  const prefersReduced = useReducedMotion();
  const [selectedExercise, setSelectedExercise] = useState<string | null>(
    progressions[0]?.exercise_id ?? null,
  );
  const [metric, setMetric] = useState<MetricKey>('est1RM');

  const exerciseId = selectedExercise ?? progressions[0]?.exercise_id ?? null;

  const currentProgression = useMemo(
    () => progressions.find((p) => p.exercise_id === exerciseId) ?? null,
    [progressions, exerciseId],
  );

  const prDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const pr of currentProgression?.prMarkers ?? []) {
      s.add(pr.achieved_at.slice(0, 10));
    }
    return s;
  }, [currentProgression]);

  // Build weekly volume from weeklyVolume record
  const volumeData = useMemo<ChartRow[]>(() => {
    if (!currentProgression) return [];
    return Object.entries(currentProgression.weeklyVolume)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, vol]) => ({
        date: fmtDate(week),
        rawDate: week,
        value: vol,
      }));
  }, [currentProgression]);

  const chartData = useMemo<ChartRow[]>(() => {
    if (!currentProgression) return [];
    if (metric === 'volume') return volumeData;

    return currentProgression.topSets.map((s) => {
      let value: number | null = null;
      if (metric === 'est1RM') value = s.est1RM ?? s.loadLbs;
      else if (metric === 'loadLbs') value = s.loadLbs;
      else if (metric === 'rpe') value = s.rpe;

      return {
        date: fmtDate(s.sessionDate),
        rawDate: s.sessionDate,
        value,
        isPR: prDateSet.has(s.sessionDate),
        rpe: s.rpe,
      };
    });
  }, [currentProgression, metric, prDateSet, volumeData]);

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1]?.value ?? null : null;
  const firstValue = chartData.length > 0 ? chartData[0]?.value ?? null : null;
  const change =
    latestValue != null && firstValue != null && chartData.length >= 2
      ? latestValue - firstValue
      : null;

  const isRpeMetric = metric === 'rpe';
  const isVolumeMetric = metric === 'volume';

  // RPE domain 0–10
  const yDomain: [number | 'auto', number | 'auto'] = isRpeMetric ? [0, 10] : ['auto', 'auto'];

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-44 rounded-lg" />
          <Skeleton className="mt-2 h-8 w-full rounded-xl" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (progressions.length === 0) {
    return (
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconChart size={18} className="text-primary-600" />
            <h3 className="font-semibold text-warm-900">Lift Progression</h3>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<IconChart size={24} />}
            title="No lift data yet"
            description="Complete sessions with logged sets to see your progression here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader className="space-y-3">
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconChart size={18} className="text-primary-600" />
            <h3 className="font-semibold text-warm-900">Lift Progression</h3>
          </div>

          {/* Exercise selector */}
          <div className="shrink-0 max-w-[180px]">
            <Select
              value={exerciseId ?? ''}
              onChange={(v) => setSelectedExercise(v)}
              options={progressions.map((p) => ({ value: p.exercise_id, label: p.exercise_name }))}
            />
          </div>
        </div>

        {/* Metric tabs */}
        <div
          className="flex items-center gap-1 rounded-xl bg-warm-100 p-1"
          role="group"
          aria-label="Metric"
        >
          {METRICS.map((m) => (
            <Button
              key={m.key}
              type="button"
              variant="ghost"
              onClick={() => setMetric(m.key)}
              aria-pressed={metric === m.key}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
                metric === m.key
                  ? 'bg-cream-50 text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-700'
              }`}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {/* Stats row */}
        {currentProgression && latestValue != null && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                Latest
              </p>
              <p className="text-xl font-bold text-warm-900">{fmtValue(latestValue, metric)}</p>
            </div>
            {change != null && (
              <div>
                <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                  Change
                </p>
                <div className="mt-0.5">
                  <ChangeBadge change={change} metric={metric} />
                </div>
              </div>
            )}
            {currentProgression.prMarkers.length > 0 && (
              <div className="ml-auto">
                <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
                  PRs
                </p>
                <p className="flex items-center gap-1 font-semibold text-amber-600">
                  <IconAward size={14} />
                  {currentProgression.prMarkers.length}
                </p>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {chartData.length === 0 ? (
          <EmptyState
            icon={<IconChart size={24} />}
            title="No data for this exercise"
            description="Complete sessions with logged sets to see your progression."
          />
        ) : isVolumeMetric ? (
          /* Volume bar chart */
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                }
              />
              <Tooltip
                content={<CustomTooltip metric={metric} />}
                cursor={{ fill: 'rgba(22,163,74,0.05)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill="rgba(22,163,74,0.65)"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : isRpeMetric ? (
          /* RPE colored bar chart */
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                axisLine={false}
                tickLine={false}
                width={32}
                ticks={[0, 2, 4, 6, 7, 8, 9, 10]}
              />
              <Tooltip
                content={<CustomTooltip metric={metric} />}
                cursor={{ fill: 'rgba(22,163,74,0.05)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={rpeBarColor(entry.rpe ?? null)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          /* 1RM / Top Load smooth area + line with PR markers */
          <>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="liftGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#a8a29e' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#a8a29e' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  content={<CustomTooltip metric={metric} />}
                  cursor={{ stroke: '#16a34a', strokeWidth: 1, strokeOpacity: 0.3 }}
                />

                {/* Area fill */}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill="url(#liftGradient)"
                  activeDot={false}
                  connectNulls
                  animationDuration={prefersReduced ? 0 : 600}
                />

                {/* Main line */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
                  connectNulls
                  animationDuration={prefersReduced ? 0 : 600}
                />

                {/* PR reference dots */}
                {chartData
                  .filter((d) => d.isPR && d.value != null)
                  .map((d) => (
                    <ReferenceDot
                      key={d.rawDate}
                      x={d.date}
                      y={d.value ?? 0}
                      r={8}
                      fill="#f59e0b"
                      stroke="#fff"
                      strokeWidth={2}
                      label={{
                        value: '★',
                        position: 'top',
                        fontSize: 10,
                        fill: '#f59e0b',
                        dy: -2,
                      }}
                    />
                  ))}
              </ComposedChart>
            </ResponsiveContainer>

            {/* PR legend */}
            {currentProgression && currentProgression.prMarkers.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-micro text-warm-400">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 ring-1 ring-amber-300" />
                PR markers highlighted on chart
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
