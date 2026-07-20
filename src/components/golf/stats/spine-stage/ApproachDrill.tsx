'use client';

/**
 * ============================================================================
 * ApproachDrill — `?area=approach` (spec §5.1)
 * ----------------------------------------------------------------------------
 * `SprayField` (family='approach') as the drill's signature hero — full
 * width, first element after the header — a `BandHistogram` for GIR by
 * approach-distance band (0-3 through 225+ yds; only a percentage is tracked
 * per band, so `n` is honestly `null` rather than fabricated), GIR-by-lie
 * `RailBars`, and the reused `LeakMap` proximity chart (lower-is-better feet
 * vs PGA Tour).
 * ========================================================================== */

import dynamic from 'next/dynamic';
import { RotateCw } from 'lucide-react';
import { DrillPanel, RailBars, useStage } from '@/components/fairway/modules';
import type { RailBarRow } from '@/components/fairway/modules';
import { Button, Eyebrow, InlineNotice, Skeleton, Surface, type LeakMapBucket } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { LeakBucket, PlayerLeakMaps } from '@/app/golf/actions/stats-leak-maps-types';
import type { SprayChartResponse } from '@/app/golf/actions/stats-data-types';
import type { BandHistogramBand } from '@/components/fairway/charts/BandHistogram';

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

const BandHistogram = dynamic(
  () => import('@/components/fairway/charts/BandHistogram').then((m) => m.BandHistogram),
  { ssr: false, loading: () => <ChartLoading /> },
);

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

/** Real-summary aria-label for the GIR-by-distance BandHistogram — the ONE
 *  non-interactive AT channel, so it must actually describe the data rather
 *  than just naming the chart (mirrors SprayField's `buildSprayAriaSummary`). */
function buildGirBandsAriaSummary(bands: BandHistogramBand[]): string {
  const withData = bands.filter(
    (b): b is BandHistogramBand & { pct: number } => b.pct !== null && Number.isFinite(b.pct),
  );
  if (withData.length === 0) return 'Greens in regulation percentage by approach distance band. No data yet.';
  const best = withData.reduce((a, b) => (b.pct > a.pct ? b : a));
  const worst = withData.reduce((a, b) => (b.pct < a.pct ? b : a));
  return (
    `Greens in regulation percentage by approach distance band. ` +
    `Best at ${best.label} (${Math.round(best.pct)}%), worst at ${worst.label} (${Math.round(worst.pct)}%).`
  );
}

export interface ApproachDrillProps {
  detailedStats: GolfStats | null;
  leakMaps: PlayerLeakMaps | null;
  sprayData: SprayChartResponse | null;
  /** True when the leak-map fetch genuinely FAILED (distinct from no-data). */
  leakError?: boolean;
  onRetryLeak?: () => void;
  retryingLeak?: boolean;
}

export function ApproachDrill({
  detailedStats,
  leakMaps,
  sprayData,
  leakError = false,
  onRetryLeak,
  retryingLeak = false,
}: ApproachDrillProps) {
  const { home } = useStage();
  const s = detailedStats;

  // GIR by approach distance — only a percentage is tracked per band (no
  // per-band attempt count on `GolfStats`), so `n` stays honestly `null`
  // rather than fabricating a sample size (BandHistogram falls back to the
  // pct-scaled height when `n` is absent).
  const girBands: BandHistogramBand[] = GIR_BANDS.map((band) => {
    const raw = s ? (s[band.field] as unknown as number | null) : null;
    return { label: band.label, n: null, pct: finite(raw) };
  });

  const byLie: RailBarRow[] = [
    { label: 'Fairway', pct: finite(s?.girPctFromFairway) ?? 0, value: fmtPct(finite(s?.girPctFromFairway)) },
    { label: 'Rough', pct: finite(s?.girPctFromRough) ?? 0, value: fmtPct(finite(s?.girPctFromRough)) },
    { label: 'Sand', pct: finite(s?.girPctFromSand) ?? 0, value: fmtPct(finite(s?.girPctFromSand)) },
  ];

  return (
    <DrillPanel title="Approach" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow as="h3" tone="accent">Approach shot spray</Eyebrow>
          <SprayField group={sprayData?.approach ?? null} family="approach" />
        </div>
        <div className="flex flex-col gap-2">
          <Eyebrow as="h4">GIR by distance</Eyebrow>
          <BandHistogram bands={girBands} ariaLabel={buildGirBandsAriaSummary(girBands)} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <RailBars rows={byLie} labelWidth={84} />
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
      </div>
    </DrillPanel>
  );
}
