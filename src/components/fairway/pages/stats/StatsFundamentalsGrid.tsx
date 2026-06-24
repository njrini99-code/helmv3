'use client';

import { cn } from '@/lib/utils';
import { MetricCard, type ReadoutDelta } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { Flag, Target, TrendingDown, CircleDot } from 'lucide-react';
import { StatsStaggerGrid, StatsStaggerItem } from './StatsSection';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function toMetricDelta(delta: ReadoutDelta | undefined, goodWhenLower = false) {
  if (!delta) return undefined;
  const improved =
    delta.direction === 'flat'
      ? null
      : goodWhenLower
        ? delta.direction === 'down'
        : delta.direction === 'up';
  return {
    value: delta.value,
    direction:
      delta.direction === 'flat'
        ? ('neutral' as const)
        : improved
          ? ('up' as const)
          : ('down' as const),
    label: delta.caption,
  };
}

const TILES = [
  {
    key: 'scoring',
    label: 'Scoring average',
    icon: Target,
    tint: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    iconCls: 'text-violet-700',
    goodWhenLower: true,
  },
  {
    key: 'gir',
    label: 'Greens in regulation',
    icon: CircleDot,
    tint: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    iconCls: 'text-emerald-700',
    goodWhenLower: false,
  },
  {
    key: 'fairways',
    label: 'Fairways hit',
    icon: Flag,
    tint: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    iconCls: 'text-sky-700',
    goodWhenLower: false,
  },
  {
    key: 'putts',
    label: 'Putts per round',
    icon: TrendingDown,
    tint: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    iconCls: 'text-amber-800',
    goodWhenLower: true,
  },
] as const;

export interface StatsFundamentalsGridProps {
  detailedStats: GolfStats | null;
  vitalsDeltas: {
    fairways?: ReadoutDelta;
    gir?: ReadoutDelta;
    putts?: ReadoutDelta;
  };
  className?: string;
}

/** Color-coded fundamentals grid — the player's at-a-glance traditional stats. */
export function StatsFundamentalsGrid({
  detailedStats,
  vitalsDeltas,
  className,
}: StatsFundamentalsGridProps) {
  const scoringAvg = finite(detailedStats?.scoringAverage);
  const rounds = detailedStats?.roundsPlayed ?? 0;
  const fwPct = finite(detailedStats?.fairwayPercentage);
  const fwOpps = detailedStats?.fairwayOpportunities ?? 0;
  const girPct = finite(detailedStats?.girPercentage);
  const girOpps = detailedStats?.girOpportunities ?? 0;
  const putts = finite(detailedStats?.puttsPerRound);
  const puttSamples = detailedStats?.totalPutts ?? 0;

  const values: Record<string, { value: number | null; suffix?: string; decimals: number; delta?: ReturnType<typeof toMetricDelta>; live: boolean }> = {
    scoring: { value: scoringAvg, decimals: 1, live: scoringAvg != null },
    gir: { value: girPct, suffix: '%', decimals: 0, delta: toMetricDelta(vitalsDeltas.gir), live: girPct != null && girOpps > 0 },
    fairways: { value: fwPct, suffix: '%', decimals: 0, delta: toMetricDelta(vitalsDeltas.fairways), live: fwPct != null && fwOpps > 0 },
    putts: { value: putts, decimals: 1, delta: toMetricDelta(vitalsDeltas.putts, true), live: putts != null && puttSamples > 0 },
  };

  return (
    <StatsStaggerGrid className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const v = values[tile.key]!;
        return (
          <StatsStaggerItem key={tile.key}>
          <div
            className={cn('h-full rounded-card border p-1', tile.tint, tile.border)}
          >
            <div className="mb-1 flex items-center gap-1.5 px-2 pt-1">
              <Icon className={cn('h-3.5 w-3.5', tile.iconCls)} aria-hidden />
              <span className="font-fw-sans text-caption font-medium text-text-secondary">{tile.label}</span>
            </div>
            {v.live && v.value != null ? (
              <MetricCard
                className="border-0 bg-transparent shadow-none"
                label=""
                value={v.value}
                suffix={v.suffix}
                decimals={v.decimals}
                delta={v.delta}
                goodDirection={tile.goodWhenLower ? 'down' : 'up'}
                density="compact"
              />
            ) : (
              <div className="px-3 pb-3">
                <p className="font-fw-mono text-h3 tabular-nums text-text-tertiary">—</p>
                <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                  {rounds > 0 ? `${rounds} rounds logged` : 'Log rounds to populate'}
                </p>
              </div>
            )}
          </div>
          </StatsStaggerItem>
        );
      })}
    </StatsStaggerGrid>
  );
}
