'use client';

import { useId } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatFixed } from '../../lib/format';

type Day = { label: string; score: number | null };

/**
 * The phone's team scoring trend (P004, direction A): the team's average on each of its last ten round days as one
 * line over a faint wash, the window's mean dashed, lower scores higher (P004-D1). A finger on the plot reads a round
 * day. Loaded on its own chunk (StatsTeamPhone's `next/dynamic`), so Recharts never weighs on first paint or on
 * desktop; the page owns the accessible summary, so this is pointer-only and hidden from assistive technology.
 * Nothing animates: the line is drawn at once, and a window change swaps it.
 */
export default function TeamTrendChart({ days, mean }: { days: Day[]; mean: number }) {
  const fill = useId().replace(/:/g, '');
  const known = days.filter((d): d is { label: string; score: number } => d.score != null);
  const lo = Math.min(mean, ...known.map((d) => d.score)) - 0.4;
  const hi = Math.max(mean, ...known.map((d) => d.score)) + 0.4;
  const first = known[0]?.label;
  const last = known[known.length - 1]?.label;
  const newest = days.reduce((at, d, i) => (d.score != null ? i : at), -1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={days} margin={{ top: 10, right: 2, bottom: 0, left: 2 }} accessibilityLayer={false}>
        <defs>
          <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ch-chart-gain)" stopOpacity={0.16} />
            <stop offset="1" stopColor="var(--ch-chart-gain)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          ticks={first && last ? [first, last] : []}
          interval={0}
          tickLine={false}
          axisLine={false}
          height={22}
          tick={({ x, y, payload }: { x: number | string; y: number | string; payload: { value: string } }) => (
            <text x={x} y={Number(y) + 12} textAnchor={payload.value === first ? 'start' : 'end'} className="ch-stm-chart__t">
              {payload.value}
            </text>
          )}
        />
        {/* Reversed: a lower (better) score sits higher, the one scoring-axis convention. */}
        <YAxis hide reversed domain={[lo, hi]} />
        <ReferenceLine y={mean} stroke="var(--ch-border-strong)" strokeDasharray="3 4" />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: 'var(--ch-border-strong)', strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            const v = payload?.[0]?.value;
            if (!active || typeof v !== 'number') return null;
            return (
              <div className="ch-stm-tip">
                <span>{label}</span>
                <b className="ch-num">{formatFixed(v)}</b>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="score"
          connectNulls
          isAnimationActive={false}
          baseValue={hi}
          stroke="var(--ch-chart-gain)"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill={`url(#${fill})`}
          // The newest round day is marked, as on every Clubhouse scoring line.
          dot={(p: { index?: number; cx?: number; cy?: number }) =>
            p.index === newest && p.cx != null && p.cy != null ? (
              <circle key="newest" cx={p.cx} cy={p.cy} r={4} fill="var(--ch-chart-gain)" stroke="var(--ch-workspace)" strokeWidth={2} />
            ) : (
              <g key={`d${p.index}`} />
            )
          }
          activeDot={{ r: 5, fill: 'var(--ch-chart-gain)', stroke: 'var(--ch-workspace)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
