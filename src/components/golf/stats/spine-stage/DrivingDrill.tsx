'use client';

/**
 * ============================================================================
 * DrivingDrill — `?area=driving` (spec §5.1 "Off the tee")
 * ----------------------------------------------------------------------------
 * `SprayField` (family='driving') as the drill's signature hero — full width,
 * first element after the header — plus `RailBars` for fairway accuracy by
 * hole type/club + `DivergingBars` for the left/right miss bias (overall,
 * plus a paired driver/non-driver breakdown) below it.
 * ========================================================================== */

import dynamic from 'next/dynamic';
import { DrillPanel, RailBars, DivergingBars, useStage } from '@/components/fairway/modules';
import type { RailBarRow, DivergingRow } from '@/components/fairway/modules';
import { Skeleton, Surface, InstrumentPanel, Readout, Eyebrow } from '@/components/fairway';
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

const SprayField = dynamic(
  () => import('@/components/fairway/charts/SprayField').then((m) => m.SprayField),
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
  const distNonDriver = finite(s?.drivingDistanceNonDriverOnly);
  const fwPct = finite(s?.fairwayPercentage);

  // Tee-miss L/R split by club class — driver vs non-driver, each as its own
  // paired DivergingBars so the per-club bias reads beside the overall one.
  // A club with no L/R misses recorded stays honest (delta 0, display '—').
  const driverMissLeft = finite(s?.missLeftPctDriver);
  const driverMissRight = finite(s?.missRightPctDriver);
  const nonDriverMissLeft = finite(s?.missLeftPctNonDriver);
  const nonDriverMissRight = finite(s?.missRightPctNonDriver);
  const hasClubMiss =
    driverMissLeft !== null || driverMissRight !== null || nonDriverMissLeft !== null || nonDriverMissRight !== null;
  const clubMissMax = Math.max(
    1,
    Math.abs(driverMissLeft ?? 0),
    Math.abs(driverMissRight ?? 0),
    Math.abs(nonDriverMissLeft ?? 0),
    Math.abs(nonDriverMissRight ?? 0),
  );
  const driverMissRows: DivergingRow[] = [
    { label: 'Left', delta: -(driverMissLeft ?? 0), display: fmtPct(driverMissLeft) },
    { label: 'Right', delta: driverMissRight ?? 0, display: fmtPct(driverMissRight) },
  ];
  const nonDriverMissRows: DivergingRow[] = [
    { label: 'Left', delta: -(nonDriverMissLeft ?? 0), display: fmtPct(nonDriverMissLeft) },
    { label: 'Right', delta: nonDriverMissRight ?? 0, display: fmtPct(nonDriverMissRight) },
  ];

  return (
    <DrillPanel title="Off the tee" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow as="h3" tone="accent">Tee shot spray</Eyebrow>
          <SprayField group={sprayData?.driving ?? null} family="driving" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <InstrumentPanel depth="base" padding="md">
            <Readout value={distAvg ?? undefined} unit="yds" label="Driving distance" size="md" state={distAvg != null ? 'live' : 'awaiting'} awaitingLabel="No tee shots" />
          </InstrumentPanel>
          <InstrumentPanel depth="base" padding="md">
            <Readout value={distDriver ?? undefined} unit="yds" label="Driver only" size="md" state={distDriver != null ? 'live' : 'awaiting'} awaitingLabel="No driver shots" />
          </InstrumentPanel>
          <InstrumentPanel depth="base" padding="md">
            <Readout value={distNonDriver ?? undefined} unit="yds" label="Non-driver" size="md" state={distNonDriver != null ? 'live' : 'awaiting'} awaitingLabel="No non-driver shots" />
          </InstrumentPanel>
          <InstrumentPanel depth="base" padding="md">
            <Readout value={fwPct ?? undefined} unit="%" label="Fairways hit" size="md" state={fwPct != null ? 'live' : 'awaiting'} awaitingLabel="No tee shots" />
          </InstrumentPanel>
        </div>
        <RailBars rows={byHoleType} labelWidth={80} />
        <DivergingBars rows={missBias} max={missMax} />
        {hasClubMiss ? (
          <div className="flex flex-col gap-2">
            <Eyebrow as="h4">Tee miss by club</Eyebrow>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="font-fw-sans text-caption text-text-tertiary">Driver</span>
                <DivergingBars rows={driverMissRows} max={clubMissMax} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-fw-sans text-caption text-text-tertiary">Non-driver</span>
                <DivergingBars rows={nonDriverMissRows} max={clubMissMax} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DrillPanel>
  );
}
