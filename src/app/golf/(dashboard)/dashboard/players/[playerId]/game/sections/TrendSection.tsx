'use client';

/**
 * TrendSection — last-10-rounds line chart.
 *
 * Sits below the six category bands. Renders a minimal line of score-to-par
 * across the rolling window, with notable rounds (those near an insight's
 * update timestamp) ringed for visual emphasis.
 *
 * Uses recharts (already a repo dependency) with an intentionally spare
 * styling. This is a scouting-report chart, not a dashboard chart — a coach
 * glances at it to read the direction of play; they don't drill into it.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from 'recharts';
import { GlassCard } from '@/components/ui/glass-card';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';

export interface TrendSectionProps {
  trend: PlayerFingerprint['trend'];
}

interface Point {
  label: string;
  round_date: string;
  score_to_par: number | null;
  course_name: string | null;
  notable: boolean;
}

export function TrendSection({ trend }: TrendSectionProps) {
  const points: Point[] = trend.rolling.map((p, i) => ({
    label: `R${i + 1}`,
    round_date: p.round_date,
    score_to_par: p.score_to_par,
    course_name: p.course_name,
    notable: p.notable,
  }));

  const withData = points.filter((p) => typeof p.score_to_par === 'number');
  const empty = withData.length < 2;

  return (
    <GlassCard
      variant="primary"
      padding="none"
      hover={false}
      className="relative overflow-hidden"
      data-testid="section-band-trend"
    >
      <div className="p-6 md:p-7 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-warm-500 font-medium">
            07 · Trend
          </p>
          <h2
            data-testid="section-heading-trend"
            className="font-[family-name:var(--font-fraunces)] text-xl md:text-2xl font-semibold text-warm-900 mt-0.5"
          >
            Last {withData.length || 0} rounds
          </h2>
        </div>

        {empty ? (
          <div
            className="flex items-center justify-center py-10 rounded-xl bg-warm-50/50 border border-warm-100"
            data-testid="trend-empty"
          >
            <p className="text-sm text-warm-500">
              Not enough rounds yet to show a trend
            </p>
          </div>
        ) : (
          <div
            className="h-56 w-full bg-white/70 rounded-xl border border-warm-200 p-3"
            data-testid="trend-chart-container"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#78716c' }}
                  axisLine={{ stroke: '#e7e5e4' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#78716c' }}
                  axisLine={{ stroke: '#e7e5e4' }}
                  tickLine={false}
                  width={28}
                />
                <ReferenceLine y={0} stroke="#a8a29e" strokeDasharray="3 3" />
                <Tooltip content={<TrendTooltip />} />
                <Line
                  type="monotone"
                  dataKey="score_to_par"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={<TrendDot />}
                  activeDot={{ r: 5, fill: '#16a34a' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  if (typeof p.score_to_par !== 'number') return null;
  return (
    <div className="rounded-lg bg-white shadow-md border border-warm-200 px-3 py-2">
      <p className="text-[10px] text-warm-500 uppercase tracking-wide">{p.round_date}</p>
      <p className="text-sm font-semibold text-warm-900 tabular-nums">
        {p.score_to_par === 0
          ? 'E'
          : p.score_to_par > 0
            ? `+${p.score_to_par}`
            : p.score_to_par}
        {' to par'}
      </p>
      {p.course_name && (
        <p className="text-[11px] text-warm-500 truncate max-w-[160px]">{p.course_name}</p>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendDot(props: any) {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number') return null;
  const notable = Boolean(payload?.notable);
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={notable ? 5 : 3}
      fill={notable ? '#f59e0b' : '#16a34a'}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
}
