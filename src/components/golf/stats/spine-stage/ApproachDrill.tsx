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
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { DrillPanel, RailBars, useStage } from '@/components/fairway/modules';
import type { RailBarRow } from '@/components/fairway/modules';
import {
  Button,
  Eyebrow,
  InlineNotice,
  InstrumentPanel,
  Readout,
  Segmented,
  Skeleton,
  Surface,
  type LeakMapBucket,
} from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { LeakBucket, PlayerLeakMaps } from '@/app/golf/actions/stats-leak-maps-types';
import type { SprayChartResponse } from '@/app/golf/actions/stats-data-types';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { BandHistogramBand } from '@/components/fairway/charts/BandHistogram';
import type { CoachHelmPattern } from './StatsSpineStage';
import { StatCategoryBrief, findCategoryPattern } from './StatCategoryBrief';
import { cn } from '@/lib/utils';

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

const APPROACH_DETAIL_BANDS = [
  { label: '30-75 yds', efficiency: 'approachEff30_75', proximity: 'approachProx30_75', miss: '30_75' },
  { label: '75-100 yds', efficiency: 'approachEff75_100', proximity: 'approachProx75_100', miss: '75_100' },
  { label: '100-125 yds', efficiency: 'approachEff100_125', proximity: 'approachProx100_125', miss: '100_125' },
  { label: '125-150 yds', efficiency: 'approachEff125_150', proximity: 'approachProx125_150', miss: '125_150' },
  { label: '150-175 yds', efficiency: 'approachEff150_175', proximity: 'approachProx150_175', miss: '150_175' },
  { label: '175-200 yds', efficiency: 'approachEff175_200', proximity: 'approachProx175_200', miss: '175_200' },
  { label: '200-225 yds', efficiency: 'approachEff200_225', proximity: 'approachProx200_225', miss: '200_225' },
  { label: '225+ yds', efficiency: 'approachEff225Plus', proximity: 'approachProx225Plus', miss: '225_plus' },
] as const;

type ApproachDetail = 'gir' | 'efficiency' | 'misses';

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return finite(value) === null ? '—' : finite(value)!.toFixed(digits);
}

function efficiencyTone(value: number | null | undefined, values: Array<number | null | undefined>): string {
  const current = finite(value);
  const valid = values.map(finite).filter((item): item is number => item !== null);
  if (current === null || valid.length < 2) return 'bg-surface-sunken text-text-tertiary';
  const best = Math.min(...valid);
  const worst = Math.max(...valid);
  if (current === best) return 'bg-accent-50 text-accent-800 ring-1 ring-inset ring-accent-200';
  if (current === worst && worst - best > 0.2) return 'bg-fw-warning/10 text-fw-warning';
  return 'bg-surface-sunken/70 text-text-secondary';
}

function missTone(value: number | null | undefined): string {
  const current = finite(value);
  if (current === null) return 'text-text-tertiary';
  if (current >= 35) return 'bg-fw-danger/10 font-semibold text-fw-danger';
  if (current >= 22) return 'bg-fw-warning/10 font-medium text-fw-warning';
  return 'bg-accent-50 text-accent-800';
}

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
  trendData?: TrendAnalysisResponse | null;
  patterns?: CoachHelmPattern[];
}

export function ApproachDrill({
  detailedStats,
  leakMaps,
  sprayData,
  leakError = false,
  onRetryLeak,
  retryingLeak = false,
  trendData = null,
  patterns = [],
}: ApproachDrillProps) {
  const { home } = useStage();
  const s = detailedStats;
  const [detail, setDetail] = useState<ApproachDetail>('gir');
  const categoryPattern = findCategoryPattern(patterns, ['approach', 'gir', 'green', 'iron']);

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

  const missRows: RailBarRow[] = [
    { label: 'Short', pct: finite(s?.approachMissShortPct) ?? 0, value: fmtPct(finite(s?.approachMissShortPct)) },
    { label: 'Long', pct: finite(s?.approachMissLongPct) ?? 0, value: fmtPct(finite(s?.approachMissLongPct)) },
    { label: 'Left', pct: finite(s?.approachMissLeftPct) ?? 0, value: fmtPct(finite(s?.approachMissLeftPct)) },
    { label: 'Right', pct: finite(s?.approachMissRightPct) ?? 0, value: fmtPct(finite(s?.approachMissRightPct)) },
  ];

  return (
    <DrillPanel title="Approach" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[
            { label: 'GIR', value: finite(s?.girPercentage), unit: '%', digits: 0 },
            { label: 'GIR / round', value: finite(s?.girPerRound), digits: 1 },
            { label: 'Approach proximity', value: finite(s?.approachProximityAvg), unit: 'ft', digits: 1 },
            { label: 'Proximity · GIR', value: finite(s?.approachProximityWhenHitGreen), unit: 'ft', digits: 1 },
            { label: 'Proximity · missed GIR', value: finite(s?.approachProximityWhenMissedGreen), unit: 'ft', digits: 1 },
          ].map((item) => (
            <InstrumentPanel key={item.label} depth="base" padding="md" className="min-h-[112px] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent-200 hover:shadow-raise motion-reduce:hover:translate-y-0">
              <Readout
                value={item.value ?? undefined}
                unit={item.unit}
                format={{ maximumFractionDigits: item.digits }}
                label={item.label}
                size="sm"
                state={item.value !== null ? 'live' : 'awaiting'}
                awaitingLabel="No data"
              />
            </InstrumentPanel>
          ))}
        </div>

        <StatCategoryBrief
          category="Approach"
          metricLabel="GIR %"
          series={trendData?.trends.gir.map((point) => point.value) ?? []}
          pattern={categoryPattern}
          fallbackInsight={
            finite(s?.girPercentage) !== null
              ? `${Math.round(finite(s?.girPercentage) ?? 0)}% GIR is shaping the scoring ceiling.`
              : 'Approach trends will sharpen as more rounds are tracked.'
          }
          fallbackAction={
            finite(s?.approachProximityAvg) !== null
              ? `Average proximity is ${fmtNumber(s?.approachProximityAvg, 1)} ft. Use the distance and lie splits below to find the most actionable band.`
              : 'Track approach distance and lie so CoachHelm can separate contact quality from target selection.'
          }
        />

        <Segmented
          value={detail}
          onValueChange={setDetail}
          options={[
            { value: 'gir', label: 'GIR detail' },
            { value: 'efficiency', label: 'Efficiency' },
            { value: 'misses', label: 'Misses' },
          ]}
          size="lg"
          fullWidth
          aria-label="Approach detail"
        />

        {detail === 'gir' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Surface elevation="shadow" padding="md" className="flex flex-col gap-3">
              <Eyebrow as="h4">GIR by distance</Eyebrow>
              <BandHistogram bands={girBands} ariaLabel={buildGirBandsAriaSummary(girBands)} />
            </Surface>
            <Surface elevation="border" padding="md" className="space-y-3">
              <Eyebrow as="h4">GIR by lie</Eyebrow>
              <RailBars rows={byLie} labelWidth={84} />
            </Surface>
          </div>
        ) : null}

        {detail === 'efficiency' ? (
          <Surface elevation="shadow" padding="md" className="space-y-4 overflow-hidden">
            <div>
              <Eyebrow as="h4">Approach efficiency by distance and lie</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Average strokes to hole out. Lower is better.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-y-2 text-left">
                <thead className="text-eyebrow uppercase tracking-wide text-text-tertiary">
                  <tr><th className="px-3 py-1">Distance</th><th className="px-3">Proximity</th><th className="px-3">Fairway</th><th className="px-3">Rough</th><th className="px-3">Sand</th></tr>
                </thead>
                <tbody>
                  {APPROACH_DETAIL_BANDS.map((band) => {
                    const eff = s?.[band.efficiency];
                    const rowEfficiency = [eff?.fairway, eff?.rough, eff?.sand];
                    return (
                      <tr key={band.label} className="font-fw-mono text-caption tabular-nums text-text-secondary">
                        <th className="rounded-l-fw-sm border-y border-l border-border-subtle bg-surface px-3 py-3 font-fw-sans font-medium text-text-primary">{band.label}</th>
                        <td className="border-y border-border-subtle bg-surface px-3">{fmtNumber(s?.[band.proximity], 1)} ft</td>
                        <td className={cn('border-y border-border-subtle px-3', efficiencyTone(eff?.fairway, rowEfficiency))}>{fmtNumber(eff?.fairway, 2)}</td>
                        <td className={cn('border-y border-border-subtle px-3', efficiencyTone(eff?.rough, rowEfficiency))}>{fmtNumber(eff?.rough, 2)}</td>
                        <td className={cn('rounded-r-fw-sm border-y border-r border-border-subtle px-3', efficiencyTone(eff?.sand, rowEfficiency))}>{fmtNumber(eff?.sand, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Surface>
        ) : null}

        {detail === 'misses' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <Surface elevation="shadow" padding="md" className="space-y-3">
              <Eyebrow as="h4">Overall miss pattern</Eyebrow>
              <RailBars rows={missRows} labelWidth={64} />
              <p className="text-caption text-text-tertiary">{s?.approachMissTotal ?? 0} tracked approach misses</p>
            </Surface>
            <Surface elevation="border" padding="md" className="space-y-3 overflow-hidden">
              <Eyebrow as="h4">Misses by distance</Eyebrow>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-caption">
                  <thead className="text-eyebrow uppercase tracking-wide text-text-tertiary"><tr><th className="p-2 text-left">Distance</th><th>Short</th><th>Long</th><th>Left</th><th>Right</th><th>n</th></tr></thead>
                  <tbody>{APPROACH_DETAIL_BANDS.map((band) => {
                    const miss = s?.approachMissByBand?.[band.miss];
                    return <tr key={band.label} className="border-t border-border-subtle font-fw-mono tabular-nums"><th className="p-2 text-left font-fw-sans font-medium">{band.label}</th><td className={cn('rounded-fw-sm px-2 py-2 text-center', missTone(miss?.short))}>{fmtPct(finite(miss?.short))}</td><td className={cn('rounded-fw-sm px-2 py-2 text-center', missTone(miss?.long))}>{fmtPct(finite(miss?.long))}</td><td className={cn('rounded-fw-sm px-2 py-2 text-center', missTone(miss?.left))}>{fmtPct(finite(miss?.left))}</td><td className={cn('rounded-fw-sm px-2 py-2 text-center', missTone(miss?.right))}>{fmtPct(finite(miss?.right))}</td><td className="text-center text-text-tertiary">{miss?.total ?? '—'}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </Surface>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border-subtle pt-6">
          <Eyebrow as="h3" tone="accent">Approach visuals</Eyebrow>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
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
            <SprayField group={sprayData?.approach ?? null} family="approach" compact />
          </div>
        </div>
      </div>
    </DrillPanel>
  );
}
