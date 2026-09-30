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
 * vs the team's Tour: PGA Tour for men's teams, LPGA Tour for women's).
 * ========================================================================== */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { DrillPanel, RailBars, RampMatrix, rampBandForValue, useStage } from '@/components/fairway/modules';
import type { RailBarRow, RampCell } from '@/components/fairway/modules';
import {
  Button,
  Eyebrow,
  InlineNotice,
  InstrumentPanel,
  Readout,
  Ribbon,
  Segmented,
  Skeleton,
  Sparkline,
  Surface,
  type LeakMapBucket,
  type ReadoutDelta,
  type RibbonPoint,
} from '@/components/fairway';
import { CategoryInsightStrip } from './CategoryInsightStrip';
import { buildCategoryInsights, buildCategoryTrends } from './buildStatsViewModel';
import type { CategorizablePatternWithImpact, CategoryTrend } from './buildStatsViewModel';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { LeakBucket, PlayerLeakMaps } from '@/app/golf/actions/stats-leak-maps-types';
import type { SprayChartResponse, TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { BandHistogramBand } from '@/components/fairway/charts/BandHistogram';
import { tourLabel, type TourKey } from '@/lib/golf/benchmarks/tour';

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
      up to date. Retry to pull the make-rate and proximity bands.
    </InlineNotice>
  );
}

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

/**
 * GIR by approach lie, without inventing a zero.
 *
 * These rows used to do `finite(...) ?? 0`, so a null — which `safePercent`
 * returns precisely when the denominator is zero — rendered a 0% bar. "GIR from
 * Sand: 0%" for a player who has never had an approach from a bunker reads
 * identically to one who has been in six and missed every green, on the panel
 * whose whole job is diagnosing where approaches go wrong.
 *
 * Live, and worse than the bento's equivalent. Measured 2026-08-17 across the
 * 42 players with completed rounds: 6 have ZERO sand approaches and render the
 * fabricated 0%, and 14 more have between one and four. Nearly half the roster
 * sees a GIR-from-sand number it cannot act on. Fairway and rough are never at
 * zero, so the false value is specific to the lie that is genuinely rare.
 *
 * A REAL 0% stays undimmed — six approaches from sand and no greens is a
 * finding, and must not be swept in with the no-data case.
 *
 * THE SAMPLE SIZE, closed in a second pass. `girByLie` had always computed
 * `{made, total}` for all three lies (golf-stats-calculator-shots.ts:2798-2801)
 * while the interface exposed only `girCountFromFairway` and
 * `girCountFromRough` — the denominator for the one lie that is genuinely thin
 * was computed and discarded. `girCountFromSand` now exists alongside its two
 * siblings, so "GIR from Sand: 33%" can no longer hide that it came off three
 * attempts.
 */
export function buildGirByLieRows(s: GolfStats | null): RailBarRow[] {
  // `n=` rather than made/attempts: `girCountFrom*` is the TOTAL, and the made
  // counts are not exposed. Deriving them from pct x total would be
  // reconstructing data rather than reporting it. `n=` is the convention this
  // codebase already uses for exactly this — `RampCell.n`, and ShortGameDrill's
  // own miss-direction row. Omitted at zero attempts, where the value is
  // already an em-dash and "n=0" would be noise.
  const countOf = (n: number | null | undefined): string | undefined =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? `n=${n}` : undefined;

  const rows: Array<[string, number | null, string | undefined]> = [
    ['Fairway', finite(s?.girPctFromFairway), countOf(s?.girCountFromFairway)],
    ['Rough', finite(s?.girPctFromRough), countOf(s?.girCountFromRough)],
    ['Sand', finite(s?.girPctFromSand), countOf(s?.girCountFromSand)],
  ];
  return rows.map(([label, pct, sample]) => ({
    label,
    pct: pct ?? 0,
    value: fmtPct(pct),
    dim: pct === null,
    sample,
  }));
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

/**
 * The Efficiency matrix's distance bands (average strokes to hole out and
 * proximity, by approach lie).
 *
 * UNGRADED BY DESIGN. These cells used to be coloured against hand-set
 * "college-golf targets" (owner decision Q-93 removes every college or
 * division yardstick). The Tour has no strokes-to-hole-out standard by lie, and
 * its proximity standard is published only for 50-125, 125-175 and 175+ yd:
 * none of these eight bands lines up with one of those, so a cell cannot be
 * compared with a Tour number without inventing one. The honest Tour
 * comparison for proximity is the `LeakMap` at the foot of the drill, which
 * uses the Tour's own bands.
 */
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

/** Miss-direction percentages read as "how pronounced is this tendency", not
 *  good/bad — darker = a MORE dominant leak direction for that distance band,
 *  matching RampMatrix's own "darkest = strongest" contract directly (no
 *  inversion needed, unlike the lower-is-better efficiency/proximity columns
 *  above). */
const MISS_PCT_THRESHOLDS: [number, number, number] = [15, 30, 50];

type ApproachDetail = 'gir' | 'efficiency' | 'misses';

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return finite(value) === null ? '—' : finite(value)!.toFixed(digits);
}

/** Adapt a `CategoryTrend`'s pre-formatted, direction-aware delta into a
 *  `Readout`'s `delta` shape — mirrors DrivingDrill's `readoutDeltaFromTrend`
 *  verbatim: the numeric `value` is the SAME first→last diff
 *  `buildCategoryTrend` computed (so `direction`'s glyph/sign agree with the
 *  displayed text), `format` renders the trend's OWN text rather than
 *  re-deriving it, and `direction` is remapped from the trend's `good`-aware
 *  semantic (never the raw up/down a lower-is-better metric would otherwise
 *  mis-color — bug #915's class of defect; GIR is higher-is-better today, but
 *  this keeps the convention consistent with the other drills). */
function readoutDeltaFromTrend(trend: CategoryTrend | null | undefined, caption: string): ReadoutDelta | undefined {
  if (!trend?.delta || trend.series.length < 2) return undefined;
  const last = trend.series[trend.series.length - 1];
  const first = trend.series[0];
  if (last === undefined || first === undefined) return undefined;
  const diff = last - first;
  const { delta } = trend;
  return {
    value: diff,
    direction: delta.direction === 'flat' ? 'flat' : delta.good ? 'up' : 'down',
    format: () => delta.text,
    caption,
  };
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
  /** The tour this player's references come from, resolved once by the stage
   *  (`resolveStageTour`); falls back to the leak map's own `tour`. Null keeps
   *  the label neutral ("the Tour"). */
  tour?: TourKey | null;
  /** True when the leak-map fetch genuinely FAILED (distinct from no-data). */
  leakError?: boolean;
  onRetryLeak?: () => void;
  retryingLeak?: boolean;
  /** CoachHelm's mined patterns (`getPlayerPatterns`) — feeds the "What
   *  CoachHelm sees" approach-category insights via `buildCategoryInsights`. */
  patterns?: ReadonlyArray<CategorizablePatternWithImpact>;
  /** `getTrendAnalysis`'s round-level trend series — the `gir` series feeds
   *  both the GIR-by-round Ribbon and the GIR Readout's delta + inline
   *  sparkline via `buildCategoryTrends`. */
  trends?: TrendAnalysisResponse['trends'] | null;
}

export function ApproachDrill({
  detailedStats,
  leakMaps,
  sprayData,
  tour: tourProp = null,
  leakError = false,
  onRetryLeak,
  retryingLeak = false,
  patterns = [],
  trends = null,
}: ApproachDrillProps) {
  const { home } = useStage();
  const s = detailedStats;
  const tour: TourKey | null = tourProp ?? leakMaps?.tour ?? null;
  const [detail, setDetail] = useState<ApproachDetail>('gir');

  const categoryInsights = buildCategoryInsights(patterns);
  const categoryTrends = buildCategoryTrends(trends);
  const approachInsights = categoryInsights.approach;
  const approachTrend = categoryTrends.approach;
  const girRibbonPoints: RibbonPoint[] = (trends?.gir ?? []).map((p) => ({ x: p.date, y: p.value }));
  const girDelta = readoutDeltaFromTrend(approachTrend, approachTrend?.deltaWindow ?? `across ${approachTrend?.series.length ?? 0} rounds`);
  // The GIR KPI card's inline sparkline — gated on a REAL >=2-round trend (not
  // just a non-null `approachTrend`, which can still be a single point with
  // no meaningful delta) so the card never claims a "trend" it can't back.
  const girHero =
    approachTrend && approachTrend.series.length >= 2
      ? { series: approachTrend.series, roundCount: approachTrend.series.length }
      : null;

  // GIR by approach distance — only a percentage is tracked per band (no
  // per-band attempt count on `GolfStats`), so `n` stays honestly `null`
  // rather than fabricating a sample size (BandHistogram falls back to the
  // pct-scaled height when `n` is absent).
  const girBands: BandHistogramBand[] = GIR_BANDS.map((band) => {
    const raw = s ? (s[band.field] as unknown as number | null) : null;
    return { label: band.label, n: null, pct: finite(raw) };
  });

  const byLie: RailBarRow[] = buildGirByLieRows(s);

  const missRows: RailBarRow[] = [
    { label: 'Short', pct: finite(s?.approachMissShortPct) ?? 0, value: fmtPct(finite(s?.approachMissShortPct)) },
    { label: 'Long', pct: finite(s?.approachMissLongPct) ?? 0, value: fmtPct(finite(s?.approachMissLongPct)) },
    { label: 'Left', pct: finite(s?.approachMissLeftPct) ?? 0, value: fmtPct(finite(s?.approachMissLeftPct)) },
    { label: 'Right', pct: finite(s?.approachMissRightPct) ?? 0, value: fmtPct(finite(s?.approachMissRightPct)) },
  ];

  return (
    <DrillPanel title="Approach" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <CategoryInsightStrip
          insights={approachInsights}
          series={approachTrend?.series}
          delta={approachTrend?.delta}
          trendLabel={approachTrend?.label ?? 'Greens in regulation'}
          goodDirection="up"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <InstrumentPanel
            depth="base"
            padding="md"
            eyebrow={girHero ? `${girHero.roundCount}-round trend` : undefined}
            className="flex min-h-[112px] flex-col gap-3"
          >
            <Readout
              value={finite(s?.girPercentage) ?? undefined}
              unit="%"
              format={{ maximumFractionDigits: 0 }}
              label="GIR"
              size="sm"
              state={finite(s?.girPercentage) !== null ? 'live' : 'awaiting'}
              awaitingLabel="No data"
              delta={girDelta}
            />
            {girHero ? (
              <InstrumentPanel depth="inset" padding="sm">
                <Sparkline data={girHero.series} goodDirection="up" label="GIR by round" width={140} height={28} />
              </InstrumentPanel>
            ) : null}
          </InstrumentPanel>

          {[
            { label: 'GIR / round', value: finite(s?.girPerRound), digits: 1 },
            // Total = union of EVERY logged approach finish (hit + miss),
            // same canonical unit (ft) as the two cards beside it — directly
            // comparable, per the partner's "total proximity" definition.
            { label: 'Proximity · total', value: finite(s?.approachProximityAvg), unit: 'ft', digits: 1 },
            { label: 'Proximity · hit GIR', value: finite(s?.approachProximityWhenHitGreen), unit: 'ft', digits: 1 },
            { label: 'Proximity · missed GIR', value: finite(s?.approachProximityWhenMissedGreen), unit: 'ft', digits: 1 },
          ].map((item) => (
            <InstrumentPanel key={item.label} depth="base" padding="md" className="min-h-[112px]">
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
              <p className="mt-1 text-caption text-text-tertiary">Average strokes to hole out and proximity to the hole. Lower is better. These bands are not graded: the Tour publishes proximity only for 50-125, 125-175 and 175+ yd, so the proximity chart below is where you compare with {tourLabel(tour)}.</p>
            </div>
            <div className="overflow-x-auto">
              <RampMatrix
                cols={['Proximity', 'Fairway', 'Rough', 'Sand']}
                rows={APPROACH_DETAIL_BANDS.map((band) => {
                  const eff = s?.[band.efficiency];
                  const prox = finite(s?.[band.proximity]);
                  // Band 0 = neutral: no honest Tour value to grade a cell against.
                  const cells: RampCell[] = [
                    { value: prox === null ? '—' : `${prox.toFixed(1)} ft`, band: 0 },
                    { value: fmtNumber(eff?.fairway, 2), band: 0 },
                    { value: fmtNumber(eff?.rough, 2), band: 0 },
                    { value: fmtNumber(eff?.sand, 2), band: 0 },
                  ];
                  return { label: band.label, cells };
                })}
              />
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
              <p className="text-caption text-text-tertiary">Share of tracked misses in each direction. Darker cells are a more dominant tendency.</p>
              <div className="overflow-x-auto">
                <RampMatrix
                  cols={['n', 'Short', 'Long', 'Left', 'Right']}
                  rows={APPROACH_DETAIL_BANDS.map((band) => {
                    const miss = s?.approachMissByBand?.[band.miss];
                    const cells: RampCell[] = [
                      { value: miss?.total !== undefined ? String(miss.total) : '—', band: 0 },
                      { value: fmtPct(finite(miss?.short)), band: rampBandForValue(finite(miss?.short), MISS_PCT_THRESHOLDS) },
                      { value: fmtPct(finite(miss?.long)), band: rampBandForValue(finite(miss?.long), MISS_PCT_THRESHOLDS) },
                      { value: fmtPct(finite(miss?.left)), band: rampBandForValue(finite(miss?.left), MISS_PCT_THRESHOLDS) },
                      { value: fmtPct(finite(miss?.right)), band: rampBandForValue(finite(miss?.right), MISS_PCT_THRESHOLDS) },
                    ];
                    return { label: band.label, cells };
                  })}
                  legend={[
                    { band: 4, label: 'Dominant tendency' },
                    { band: 3, label: 'Frequent' },
                    { band: 2, label: 'Occasional' },
                    { band: 1, label: 'Rare' },
                  ]}
                />
              </div>
            </Surface>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border-subtle pt-6">
          <Eyebrow as="h3" tone="accent">GIR trend</Eyebrow>
          <Ribbon
            title="Greens in regulation by round"
            overline="Trend"
            data={girRibbonPoints}
            valueFormatter={(v) => `${Math.round(v)}%`}
            seriesName="GIR"
            goodDirection="up"
            height={200}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-border-subtle pt-6">
          <Eyebrow as="h3" tone="accent">Approach visuals</Eyebrow>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          {leakError ? (
            <LeakLoadError onRetry={() => onRetryLeak?.()} retrying={retryingLeak} />
          ) : (
            <LeakMap
              title="Approach proximity"
              overline="Approach"
              subtitle={`Average proximity to the hole by approach distance vs ${tourLabel(tour)}`}
              referenceLabel={tour ? tourLabel(tour) : undefined}
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
