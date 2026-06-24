'use client';

import { MetricCard, Surface } from '@/components/fairway';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import { finite, toMetricDelta, buildVitalDelta } from './fairway-stats-utils';
import { MotionDiv, useStatsMotion } from './fairway-stats-motion';
import { StatsStaggerGrid, StatsStaggerItem } from './StatsSection';

export function FairwayPeriodCompareBand({ trendData }: { trendData: TrendAnalysisResponse | null }) {
  const motion = useStatsMotion();
  const cmp = trendData?.periodComparison;
  if (!cmp) return null;

  const cr = cmp.last30Days.roundCount;
  const pr = cmp.previous30Days.roundCount;
  if (cr <= 0 && pr <= 0) return null;

  const scoringDelta = buildVitalDelta({
    current: cmp.last30Days.scoringAvg,
    previous: cmp.previous30Days.scoringAvg,
    currentRounds: cr,
    previousRounds: pr,
    goodWhenLower: true,
    digits: 1,
  });
  const girDelta = buildVitalDelta({
    current: cmp.last30Days.girPct,
    previous: cmp.previous30Days.girPct,
    currentRounds: cr,
    previousRounds: pr,
    percent: true,
  });
  const fwDelta = buildVitalDelta({
    current: cmp.last30Days.fairwayPct,
    previous: cmp.previous30Days.fairwayPct,
    currentRounds: cr,
    previousRounds: pr,
    percent: true,
  });
  const puttsDelta = buildVitalDelta({
    current: cmp.last30Days.puttsPerRound,
    previous: cmp.previous30Days.puttsPerRound,
    currentRounds: cr,
    previousRounds: pr,
    goodWhenLower: true,
    digits: 1,
  });

  return (
    <MotionDiv {...motion.section}>
      <Surface
        elevation="shadow"
        padding="md"
        className="border-l-[3px] border-l-emerald-600 bg-gradient-to-br from-emerald-500/8 via-surface to-surface"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-emerald-800">
              Last 30 days
            </p>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Compared to the previous 30-day window
            </p>
          </div>
          <span className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 font-fw-sans text-caption text-text-tertiary">
            {cr} rounds vs {pr} prior
          </span>
        </div>
        <StatsStaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {finite(cmp.last30Days.scoringAvg) != null ? (
            <StatsStaggerItem key="score">
              <MetricCard
                label="Scoring avg"
                value={cmp.last30Days.scoringAvg!}
                decimals={1}
                goodDirection="down"
                delta={toMetricDelta(scoringDelta, true)}
                density="compact"
              />
            </StatsStaggerItem>
          ) : null}
          {finite(cmp.last30Days.girPct) != null ? (
            <StatsStaggerItem key="gir">
              <MetricCard
                label="GIR"
                value={cmp.last30Days.girPct!}
                suffix="%"
                decimals={0}
                delta={toMetricDelta(girDelta)}
                density="compact"
              />
            </StatsStaggerItem>
          ) : null}
          {finite(cmp.last30Days.fairwayPct) != null ? (
            <StatsStaggerItem key="fw">
              <MetricCard
                label="Fairways"
                value={cmp.last30Days.fairwayPct!}
                suffix="%"
                decimals={0}
                delta={toMetricDelta(fwDelta)}
                density="compact"
              />
            </StatsStaggerItem>
          ) : null}
          {finite(cmp.last30Days.puttsPerRound) != null ? (
            <StatsStaggerItem key="putts">
              <MetricCard
                label="Putts / round"
                value={cmp.last30Days.puttsPerRound!}
                decimals={1}
                goodDirection="down"
                delta={toMetricDelta(puttsDelta, true)}
                density="compact"
              />
            </StatsStaggerItem>
          ) : null}
        </StatsStaggerGrid>
      </Surface>
    </MotionDiv>
  );
}
