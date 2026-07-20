'use client';

/**
 * ============================================================================
 * PuttingDrill — `?area=putting` (spec §5.1)
 * ----------------------------------------------------------------------------
 * RampMatrix (make% by break × distance — the ONLY place this matrix renders
 * on the surface, per the plan's dedupe rule) + a break-overview `RailBars` +
 * an `RxCard` prescription + a plain-language cost line + the existing
 * `LeakMap` chart (make% vs PGA Tour by distance, reused verbatim).
 * ========================================================================== */

import dynamic from 'next/dynamic';
import {
  DrillPanel,
  RampMatrix,
  RailBars,
  RxCard,
  useStage,
  rampBandForValue,
} from '@/components/fairway/modules';
import type { RampCell, RailBarRow } from '@/components/fairway/modules';
import { Skeleton, Surface, type LeakMapBucket } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { LeakBucket, PlayerLeakMaps } from '@/app/golf/actions/stats-leak-maps-types';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';

function ChartLoading() {
  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[200px] w-full rounded-fw-md" />
    </Surface>
  );
}

const LeakMap = dynamic(
  () => import('@/components/fairway/charts/LeakMap').then((m) => m.LeakMap),
  { ssr: false, loading: () => <ChartLoading /> },
);

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}
function toBuckets(buckets: LeakBucket[]): LeakMapBucket[] {
  return buckets.map((b) => ({ label: b.label, teamValue: b.team_value, pgaValue: b.pga_value, sampleN: b.sample_n }));
}

const BREAK_COLS: ReadonlyArray<{ colLabel: string; breakKey: keyof GolfStats['puttingByBreak'] }> = [
  { colLabel: 'L → R', breakKey: 'left_to_right' },
  { colLabel: 'Straight', breakKey: 'straight' },
  { colLabel: 'R → L', breakKey: 'right_to_left' },
  { colLabel: 'Multiple', breakKey: 'multiple' },
];

const DISTANCE_BANDS: ReadonlyArray<{
  label: string;
  field: keyof GolfStats['puttingByBreak']['straight'];
  pgaMetricId: string | null;
}> = [
  { label: '0-3ft', field: 'makePct0_3', pgaMetricId: null },
  { label: '3-5ft', field: 'makePct3_5', pgaMetricId: 'putts_made_3_5ft_pct' },
  { label: '5-10ft', field: 'makePct5_10', pgaMetricId: 'putts_made_5_10ft_pct' },
  { label: '10-15ft', field: 'makePct10_15', pgaMetricId: 'putts_made_10_15ft_pct' },
  { label: '15-20ft', field: 'makePct15_20', pgaMetricId: 'putts_made_15_25ft_pct' },
  { label: '20-25ft', field: 'makePct20_25', pgaMetricId: 'putts_made_15_25ft_pct' },
  { label: '25-30ft', field: 'makePct25_30', pgaMetricId: 'putts_made_25_plus_ft_pct' },
  { label: '30-35ft', field: 'makePct30_35', pgaMetricId: 'putts_made_25_plus_ft_pct' },
  { label: '35+ft', field: 'makePct35Plus', pgaMetricId: 'putts_made_25_plus_ft_pct' },
];

/** Band thresholds for the ramp: proportional to the PGA standard when known
 *  (no standard yet for 0-3ft, so it uses a flat near-automatic-make scale). */
function bandThresholds(pga: number | null): [number, number, number] {
  if (pga === null) return [70, 85, 95];
  return [pga * 0.6, pga * 0.85, pga * 1.05];
}

export interface PuttingDrillProps {
  detailedStats: GolfStats | null;
  leakMaps: PlayerLeakMaps | null;
  standingByMetric: Map<string, PlayerStandingRow>;
  weaknesses: StatisticalStrengthWeakness[];
}

export function PuttingDrill({ detailedStats, leakMaps, standingByMetric, weaknesses }: PuttingDrillProps) {
  const { home } = useStage();
  const puttingByBreak = detailedStats?.puttingByBreak ?? null;

  const rows = DISTANCE_BANDS.map((band) => ({
    label: band.label,
    cells: BREAK_COLS.map((col): RampCell => {
      const breakStats = puttingByBreak?.[col.breakKey];
      const pct = finite(breakStats?.[band.field] as number | null | undefined);
      const pga = band.pgaMetricId ? finite(standingByMetric.get(band.pgaMetricId)?.pga_value ?? null) : null;
      return {
        value: pct === null ? '—' : `${Math.round(pct)}`,
        band: rampBandForValue(pct, bandThresholds(pga)),
      };
    }),
  }));

  const breakOverviewRows: RailBarRow[] = BREAK_COLS.map((col) => {
    const breakStats = puttingByBreak?.[col.breakKey];
    const pct = finite(breakStats?.overallMakePct);
    return { label: col.colLabel, pct: pct ?? 0, value: fmtPct(pct) };
  });

  // Worst single cell across the matrix — the Rx target.
  let worst: { band: string; distance: string; pct: number } | null = null;
  for (const band of DISTANCE_BANDS) {
    for (const col of BREAK_COLS) {
      const breakStats = puttingByBreak?.[col.breakKey];
      const pct = finite(breakStats?.[band.field] as number | null | undefined);
      if (pct === null) continue;
      if (worst === null || pct < worst.pct) worst = { band: col.colLabel, distance: band.label, pct };
    }
  }

  const puttingCost = weaknesses
    .filter((w) => w.subcategory === 'putting')
    .reduce((sum, w) => sum + Math.abs(w.strokeImpact), 0);

  return (
    <DrillPanel title="Putting" backLabel="All areas" onBack={home}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <RampMatrix
            cols={BREAK_COLS.map((c) => c.colLabel)}
            rows={rows}
            legend={[
              { band: 1, label: 'Well behind Tour' },
              { band: 2, label: 'Behind' },
              { band: 3, label: 'Near Tour' },
              { band: 4, label: 'Ahead of Tour' },
            ]}
          />
          <RailBars rows={breakOverviewRows} labelWidth={64} />
        </div>
        <div className="flex flex-col gap-4">
          {worst ? (
            <RxCard title="Work on next">
              {worst.distance} putts breaking {worst.band.toLowerCase()} are converting at {Math.round(worst.pct)}%
              — the weakest cell on the board. Block practice there first.
            </RxCard>
          ) : null}
          {puttingCost > 0 ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              Putting is costing an estimated {puttingCost.toFixed(1)} strokes per round vs the field.
            </p>
          ) : null}
          <LeakMap
            title="Putt make %"
            overline="Putting"
            subtitle="Make rate by distance vs PGA Tour"
            takeaway="Bands below the dashed Tour line are where putts are leaking."
            direction="higher_better"
            unit="percent"
            data={leakMaps ? toBuckets(leakMaps.putting) : []}
          />
        </div>
      </div>
    </DrillPanel>
  );
}
