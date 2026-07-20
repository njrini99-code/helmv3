'use client';

/**
 * ============================================================================
 * DrivingDrill — `?area=driving` (spec §5.1 "Off the tee")
 * ----------------------------------------------------------------------------
 * The reused `FairwayDrivingSpray` glass chart + `RailBars` for fairway
 * accuracy by hole type/club + `DivergingBars` for the left/right miss bias.
 * ========================================================================== */

import dynamic from 'next/dynamic';
import { DrillPanel, RailBars, DivergingBars, useStage } from '@/components/fairway/modules';
import type { RailBarRow, DivergingRow } from '@/components/fairway/modules';
import { Skeleton, Surface, InstrumentPanel, Readout } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { SprayChartResponse } from '@/app/golf/actions/stats-data-types';

function ChartLoading() {
  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[200px] w-full rounded-fw-md" />
    </Surface>
  );
}

const FairwayDrivingSpray = dynamic(
  () => import('@/components/fairway/pages/coachhelm/FairwayDrivingSpray').then((m) => m.FairwayDrivingSpray),
  { ssr: false, loading: () => <ChartLoading /> },
);

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

export interface DrivingDrillProps {
  detailedStats: GolfStats | null;
  sprayData: SprayChartResponse | null;
}

export function DrivingDrill({ detailedStats, sprayData }: DrivingDrillProps) {
  const { home } = useStage();
  const s = detailedStats;

  const byHoleType: RailBarRow[] = [
    { label: 'Par 4', pct: finite(s?.fairwayPctPar4) ?? 0, value: fmtPct(finite(s?.fairwayPctPar4)) },
    { label: 'Par 5', pct: finite(s?.fairwayPctPar5) ?? 0, value: fmtPct(finite(s?.fairwayPctPar5)) },
    { label: 'Driver', pct: finite(s?.fairwayPctDriver) ?? 0, value: fmtPct(finite(s?.fairwayPctDriver)) },
    { label: 'Non-driver', pct: finite(s?.fairwayPctNonDriver) ?? 0, value: fmtPct(finite(s?.fairwayPctNonDriver)) },
  ];

  const missLeft = finite(s?.missLeftPct);
  const missRight = finite(s?.missRightPct);
  const missMax = Math.max(1, Math.abs(missLeft ?? 0), Math.abs(missRight ?? 0));
  const missBias: DivergingRow[] = [
    { label: 'Left', delta: -(missLeft ?? 0), display: fmtPct(missLeft) },
    { label: 'Right', delta: missRight ?? 0, display: fmtPct(missRight) },
  ];

  const distAvg = finite(s?.drivingDistanceAvg);
  const distDriver = finite(s?.drivingDistanceDriverOnly);
  const fwPct = finite(s?.fairwayPercentage);

  return (
    <DrillPanel title="Off the tee" backLabel="All areas" onBack={home}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <InstrumentPanel depth="base" padding="md">
              <Readout value={distAvg ?? undefined} unit="yds" label="Driving distance" size="md" state={distAvg != null ? 'live' : 'awaiting'} awaitingLabel="No tee shots" />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md">
              <Readout value={distDriver ?? undefined} unit="yds" label="Driver only" size="md" state={distDriver != null ? 'live' : 'awaiting'} awaitingLabel="No driver shots" />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md">
              <Readout value={fwPct ?? undefined} unit="%" label="Fairways hit" size="md" state={fwPct != null ? 'live' : 'awaiting'} awaitingLabel="No tee shots" />
            </InstrumentPanel>
          </div>
          <RailBars rows={byHoleType} labelWidth={80} />
          <DivergingBars rows={missBias} max={missMax} />
        </div>
        <FairwayDrivingSpray group={sprayData?.driving ?? null} />
      </div>
    </DrillPanel>
  );
}
