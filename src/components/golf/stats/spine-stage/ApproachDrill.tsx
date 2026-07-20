'use client';

/**
 * ============================================================================
 * ApproachDrill — `?area=approach` (spec §5.1)
 * ----------------------------------------------------------------------------
 * GIR-by-distance `RailBars` (0-3 through 225+ yd bands) + the reused
 * `LeakMap` proximity chart (lower-is-better feet vs PGA Tour).
 * ========================================================================== */

import dynamic from 'next/dynamic';
import { RotateCw } from 'lucide-react';
import { DrillPanel, RailBars, useStage } from '@/components/fairway/modules';
import type { RailBarRow } from '@/components/fairway/modules';
import { Button, InlineNotice, Skeleton, Surface, type LeakMapBucket } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { LeakBucket, PlayerLeakMaps } from '@/app/golf/actions/stats-leak-maps-types';

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

/**
 * P354 · The scoped leak-map failure notice, ported verbatim from
 * FairwayStatsCockpit's `LeakLoadError`. Rendered instead of the bare
 * (empty-data) `LeakMap` when the leak-map fetch genuinely FAILED, so a
 * backend error reads honestly as "couldn't load — retry" rather than being
 * masked as the insufficient-data empty state.
 */
function LeakLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <InlineNotice
      tone="danger"
      title="Couldn’t load the leak map"
      action={
        <Button
          variant="secondary"
          size="sm"
          busy={retrying}
          leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
          onClick={onRetry}
        >
          Try again
        </Button>
      }
    >
      The strokes-gained leak detail failed to load. Your other stats are
      up to date — retry to pull the make-rate and proximity bands.
    </InlineNotice>
  );
}

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}
function toBuckets(buckets: LeakBucket[]): LeakMapBucket[] {
  return buckets.map((b) => ({ label: b.label, teamValue: b.team_value, pgaValue: b.pga_value, sampleN: b.sample_n }));
}

const GIR_BANDS: ReadonlyArray<{ label: string; field: keyof GolfStats }> = [
  { label: '50-75 yds', field: 'girPct50_75' },
  { label: '75-100 yds', field: 'girPct75_100' },
  { label: '100-125 yds', field: 'girPct100_125' },
  { label: '125-150 yds', field: 'girPct125_150' },
  { label: '150-175 yds', field: 'girPct150_175' },
  { label: '175-200 yds', field: 'girPct175_200' },
  { label: '200-225 yds', field: 'girPct200_225' },
  { label: '225+ yds', field: 'girPct225Plus' },
];

export interface ApproachDrillProps {
  detailedStats: GolfStats | null;
  leakMaps: PlayerLeakMaps | null;
  /** True when the leak-map fetch genuinely FAILED (distinct from no-data). */
  leakError?: boolean;
  onRetryLeak?: () => void;
  retryingLeak?: boolean;
}

export function ApproachDrill({
  detailedStats,
  leakMaps,
  leakError = false,
  onRetryLeak,
  retryingLeak = false,
}: ApproachDrillProps) {
  const { home } = useStage();
  const s = detailedStats;

  const girRows: RailBarRow[] = GIR_BANDS.map((band) => {
    const raw = s ? (s[band.field] as unknown as number | null) : null;
    const pct = finite(raw);
    return { label: band.label, pct: pct ?? 0, value: fmtPct(pct), dim: pct === null };
  });

  const byLie: RailBarRow[] = [
    { label: 'Fairway', pct: finite(s?.girPctFromFairway) ?? 0, value: fmtPct(finite(s?.girPctFromFairway)) },
    { label: 'Rough', pct: finite(s?.girPctFromRough) ?? 0, value: fmtPct(finite(s?.girPctFromRough)) },
    { label: 'Sand', pct: finite(s?.girPctFromSand) ?? 0, value: fmtPct(finite(s?.girPctFromSand)) },
  ];

  return (
    <DrillPanel title="Approach" backLabel="All areas" onBack={home}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <RailBars rows={girRows} labelWidth={84} />
          <RailBars rows={byLie} labelWidth={84} />
        </div>
        {leakError ? (
          <LeakLoadError onRetry={() => onRetryLeak?.()} retrying={retryingLeak} />
        ) : (
          <LeakMap
            title="Approach proximity"
            overline="Approach"
            subtitle="Average proximity to the hole by approach distance vs PGA Tour"
            takeaway="Bands above the dashed Tour line leave you farther from the hole than Tour."
            direction="lower_better"
            unit="feet"
            data={leakMaps ? toBuckets(leakMaps.approach) : []}
          />
        )}
      </div>
    </DrillPanel>
  );
}
