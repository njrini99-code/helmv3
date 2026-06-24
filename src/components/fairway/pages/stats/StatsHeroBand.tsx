'use client';

/**
 * Compact stats hero — one scan row for SG verdict + fundamentals.
 * Replaces stacked accent InstrumentPanels that made the page feel samey.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  MetricCard,
  Surface,
  InsufficientData,
  StandingStrip,
  type ReadoutDelta,
} from '@/components/fairway';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { MotionDiv, useStatsMotion } from './fairway-stats-motion';
import { StatsStaggerGrid, StatsStaggerItem } from './StatsSection';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function formatSg(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return 'E';
  const fixed = Math.abs(value).toFixed(2);
  return value > 0 ? `+${fixed}` : `−${fixed}`;
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

export interface StatsHeroBandProps {
  sgTotal: PlayerStandingRow | null;
  standingRows?: PlayerStandingRow[] | null;
  detailedStats: GolfStats | null;
  gainLeak: { best: { label: string }; worst: { label: string } } | null;
  vitalsDeltas: {
    fairways?: ReadoutDelta;
    gir?: ReadoutDelta;
    putts?: ReadoutDelta;
  };
  className?: string;
}

export function StatsHeroBand({
  sgTotal,
  standingRows,
  detailedStats,
  gainLeak,
  vitalsDeltas,
  className,
}: StatsHeroBandProps) {
  const motion = useStatsMotion();
  const standingByMetric = useMemo(() => {
    const map = new Map<string, PlayerStandingRow>();
    for (const row of standingRows ?? []) map.set(row.metric_id, row);
    return map;
  }, [standingRows]);

  const girStanding = standingByMetric.get('gir_pct') ?? null;
  const sgCfg = getMetricRenderConfig('sg_total');
  const sgValue = finite(sgTotal?.player_value);
  const scoringAvg = finite(detailedStats?.scoringAverage);
  const rounds = detailedStats?.roundsPlayed ?? 0;
  const fwPct = finite(detailedStats?.fairwayPercentage);
  const fwOpps = detailedStats?.fairwayOpportunities ?? 0;
  const girPct = finite(detailedStats?.girPercentage);
  const girOpps = detailedStats?.girOpportunities ?? 0;
  const putts = finite(detailedStats?.puttsPerRound);
  const puttSamples = detailedStats?.totalPutts ?? 0;

  const verdict: string | null = (() => {
    if (sgValue === null) return null;
    const head =
      sgValue >= 0
        ? `Gaining ${formatSg(sgValue)} strokes per round on the field`
        : `${formatSg(sgValue)} strokes per round vs Tour`;
    if (gainLeak) {
      const clean = (l: string) => l.toLowerCase().replace(/^sg:\s*/, '');
      return `${head}. Strongest in ${clean(gainLeak.best.label)}; leaking in ${clean(gainLeak.worst.label)}.`;
    }
    return `${head}.`;
  })();

  return (
    <MotionDiv {...motion.hero}>
      <Surface
        elevation="shadow"
        padding="lg"
        className={cn(
          'border-l-[3px] border-l-accent-600 bg-gradient-to-br from-accent-600/12 via-surface to-surface',
          className,
        )}
      >
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] lg:items-start">
          <div className="flex flex-col gap-4">
            {sgTotal && sgCfg ? (
              <div className="flex flex-col gap-1">
                <StandingStrip
                  metric_id="sg_total"
                  metric_label={sgCfg.display_label}
                  player_value={sgTotal.player_value}
                  team_avg={sgTotal.team_avg}
                  team_n={sgTotal.team_n}
                  team_pct={sgTotal.team_pct}
                  pga_value={sgTotal.pga_value}
                  is_womens={sgTotal.is_womens}
                  direction={sgCfg.direction}
                  unit={sgCfg.unit}
                  scale={sgCfg.default_scale}
                  size="card"
                />
                {sgTotal.team_pct != null && sgTotal.team_n > 1 ? (
                  <p className="px-1 font-fw-sans text-caption text-text-tertiary">
                    {Math.round(sgTotal.team_pct)}th percentile on team ({sgTotal.team_n} players)
                  </p>
                ) : null}
              </div>
            ) : (
              <InsufficientData
                compact
                title="SG standing warming up"
                description="Strokes gained vs Tour fills in after 5+ rounds with shot detail."
                unit="rounds"
              />
            )}
            {verdict ? (
              <p className="font-fw-sans text-body-sm leading-relaxed text-text-secondary">{verdict}</p>
            ) : null}
          </div>

          <StatsStaggerGrid className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {scoringAvg != null ? (
              <StatsStaggerItem>
                <MetricCard
                  label="Scoring avg"
                  value={scoringAvg}
                  decimals={1}
                  goodDirection="down"
                  density="compact"
                />
              </StatsStaggerItem>
            ) : (
              <StatsStaggerItem>
                <AwaitingMetric label="Scoring avg" have={rounds} />
              </StatsStaggerItem>
            )}
            <StatsStaggerItem>
              <MetricCard label="Rounds" value={rounds} decimals={0} density="compact" />
            </StatsStaggerItem>
            {fwPct != null && fwOpps > 0 ? (
              <StatsStaggerItem>
                <MetricCard
                  label="Fairways"
                  value={fwPct}
                  suffix="%"
                  decimals={0}
                  delta={toMetricDelta(vitalsDeltas.fairways)}
                  density="compact"
                />
              </StatsStaggerItem>
            ) : (
              <StatsStaggerItem>
                <AwaitingMetric label="Fairways" />
              </StatsStaggerItem>
            )}
            {girPct != null && girOpps > 0 ? (
              <StatsStaggerItem>
                <MetricCard
                  label="GIR"
                  value={girPct}
                  suffix="%"
                  decimals={0}
                  delta={toMetricDelta(vitalsDeltas.gir)}
                  density="compact"
                  footnote={
                    girStanding?.team_pct != null
                      ? `${Math.round(girStanding.team_pct)}th on team`
                      : undefined
                  }
                />
              </StatsStaggerItem>
            ) : (
              <StatsStaggerItem>
                <AwaitingMetric label="GIR" />
              </StatsStaggerItem>
            )}
            {putts != null && puttSamples > 0 ? (
              <StatsStaggerItem>
                <MetricCard
                  label="Putts / round"
                  value={putts}
                  decimals={1}
                  goodDirection="down"
                  delta={toMetricDelta(vitalsDeltas.putts, true)}
                  density="compact"
                />
              </StatsStaggerItem>
            ) : (
              <StatsStaggerItem>
                <AwaitingMetric label="Putts / round" />
              </StatsStaggerItem>
            )}
          </StatsStaggerGrid>
        </div>
      </div>
      </Surface>
    </MotionDiv>
  );
}

function AwaitingMetric({ label, have = 0 }: { label: string; have?: number }) {
  return (
    <div className="flex min-h-[88px] flex-col justify-center rounded-card border border-border-subtle bg-surface-sunken px-3 py-2.5">
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">{label}</span>
      <span className="mt-1 font-fw-mono text-h3 tabular-nums text-text-tertiary">—</span>
      {have > 0 ? (
        <span className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{have} rounds logged</span>
      ) : (
        <span className="mt-0.5 font-fw-sans text-caption text-text-tertiary">Awaiting data</span>
      )}
    </div>
  );
}
