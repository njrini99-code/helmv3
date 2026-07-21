'use client';

/**
 * ============================================================================
 * PuttingDrill — `?area=putting` (spec §5.1)
 * ----------------------------------------------------------------------------
 * HERO: `MakeCurve` — overall (all-break) ALL-PUTT make% by distance band
 * (every putt on the hole, made = holed — same semantic as `puttMakePct*`
 * and the `LeakMap` below; NOT first-putt-only, see golf-stats-calculator
 * -shots.ts:1985-1996), dot radius/hollow-below-8 keyed to the real per-band
 * attempt count. n comes from the exact top-level `puttMakeCount*` field
 * where the calculator exposes one (5 of the 9 bands); the remaining 4
 * bands (20ft+) have no top-level count, so n falls back to the four
 * break-type cells summed — an undercount when a putt has no tagged break,
 * but the best available signal for those bands (see `heroPoints` below).
 *
 * Then: efficiency `Readout`s (putts/hole, putts/GIR, 3-putts/round,
 * 1-putts total, approach-putt avg leave) + RampMatrix (make% by break ×
 * distance — the ONLY place this matrix renders on the surface, per the
 * plan's dedupe rule, now with a per-cell n= sample badge) + a break-overview
 * `RailBars` + miss-direction `RailBars` (overall, and per-break where the
 * calculator exposes it) + an n-gated `RxCard` prescription + a plain-
 * language cost line + the existing `LeakMap` chart (make% vs PGA Tour by
 * distance, reused verbatim).
 * ========================================================================== */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import {
  DrillPanel,
  RampMatrix,
  RailBars,
  RxCard,
  useStage,
  rampBandForValue,
} from '@/components/fairway/modules';
import type { RampCell, RailBarRow } from '@/components/fairway/modules';
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
import { chartAriaLabel } from '@/components/fairway/charts/theme';
import type { MakeCurvePoint } from '@/components/fairway/charts/MakeCurve';
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

const MakeCurve = dynamic(
  () => import('@/components/fairway/charts/MakeCurve').then((m) => m.MakeCurve),
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

type BreakStats = GolfStats['puttingByBreak']['straight'];

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}
function toBuckets(buckets: LeakBucket[]): LeakMapBucket[] {
  return buckets.map((b) => ({ label: b.label, teamValue: b.team_value, pgaValue: b.pga_value, sampleN: b.sample_n }));
}
/** Reads a `countX` field off a break-stats cell without an `any`/unsafe cast. */
function countAt(breakStats: BreakStats | undefined, field: keyof BreakStats): number {
  const v = breakStats?.[field];
  return typeof v === 'number' ? v : 0;
}

const BREAK_COLS: ReadonlyArray<{ colLabel: string; breakKey: keyof GolfStats['puttingByBreak'] }> = [
  { colLabel: 'L → R', breakKey: 'left_to_right' },
  { colLabel: 'Straight', breakKey: 'straight' },
  { colLabel: 'R → L', breakKey: 'right_to_left' },
  { colLabel: 'Multiple', breakKey: 'multiple' },
];

/** The 9 overall (all-break) ALL-PUTT make% fields on `GolfStats` (every
 *  putt on the hole, made = holed — not first-putt-only) — literal union
 *  (not `keyof GolfStats`) so indexing stays `number | null`, never the
 *  full cross-type `GolfStats` value union. Feeds the hero curve. */
type PuttMakePctField =
  | 'puttMakePct0_3'
  | 'puttMakePct3_5'
  | 'puttMakePct5_10'
  | 'puttMakePct10_15'
  | 'puttMakePct15_20'
  | 'puttMakePct20_25'
  | 'puttMakePct25_30'
  | 'puttMakePct30_35'
  | 'puttMakePct35Plus';

/** The 5 (of 9) bands where `GolfStats` exposes an exact top-level attempt
 *  count for the `PuttMakePctField` above — NOT subject to the nullable-
 *  `putt_break` undercount the break-type sum has (see `heroPoints`). No
 *  such field exists for 20-25ft and up. */
type PuttMakeCountField =
  | 'puttMakeCount0_3'
  | 'puttMakeCount3_5'
  | 'puttMakeCount5_10'
  | 'puttMakeCount10_15'
  | 'puttMakeCount15_20';

const DISTANCE_BANDS: ReadonlyArray<{
  label: string;
  field: keyof BreakStats;
  /** The per-cell attempt count backing `field` — feeds the matrix's n=
   *  badge and the RxCard's sample-size gate. */
  countField: keyof BreakStats;
  pgaMetricId: string | null;
  /** All-break aggregate ALL-PUTT make% for the hero `MakeCurve`. */
  overallField: PuttMakePctField;
  /** Exact top-level attempt count backing `overallField`, when the
   *  calculator exposes one (5 of 9 bands) — see `heroPoints`. `null` for
   *  the 4 bands (20ft+) with no top-level count, where n falls back to
   *  the break-type sum. */
  overallCountField: PuttMakeCountField | null;
}> = [
  { label: '0-3ft', field: 'makePct0_3', countField: 'count0_3', pgaMetricId: null, overallField: 'puttMakePct0_3', overallCountField: 'puttMakeCount0_3' },
  { label: '3-5ft', field: 'makePct3_5', countField: 'count3_5', pgaMetricId: 'putts_made_3_5ft_pct', overallField: 'puttMakePct3_5', overallCountField: 'puttMakeCount3_5' },
  { label: '5-10ft', field: 'makePct5_10', countField: 'count5_10', pgaMetricId: 'putts_made_5_10ft_pct', overallField: 'puttMakePct5_10', overallCountField: 'puttMakeCount5_10' },
  { label: '10-15ft', field: 'makePct10_15', countField: 'count10_15', pgaMetricId: 'putts_made_10_15ft_pct', overallField: 'puttMakePct10_15', overallCountField: 'puttMakeCount10_15' },
  { label: '15-20ft', field: 'makePct15_20', countField: 'count15_20', pgaMetricId: 'putts_made_15_25ft_pct', overallField: 'puttMakePct15_20', overallCountField: 'puttMakeCount15_20' },
  { label: '20-25ft', field: 'makePct20_25', countField: 'count20_25', pgaMetricId: 'putts_made_15_25ft_pct', overallField: 'puttMakePct20_25', overallCountField: null },
  { label: '25-30ft', field: 'makePct25_30', countField: 'count25_30', pgaMetricId: 'putts_made_25_plus_ft_pct', overallField: 'puttMakePct25_30', overallCountField: null },
  { label: '30-35ft', field: 'makePct30_35', countField: 'count30_35', pgaMetricId: 'putts_made_25_plus_ft_pct', overallField: 'puttMakePct30_35', overallCountField: null },
  { label: '35+ft', field: 'makePct35Plus', countField: 'count35Plus', pgaMetricId: 'putts_made_25_plus_ft_pct', overallField: 'puttMakePct35Plus', overallCountField: null },
];

/** Band thresholds for the ramp: proportional to the PGA standard when known
 *  (no standard yet for 0-3ft, so it uses a flat near-automatic-make scale). */
function bandThresholds(pga: number | null): [number, number, number] {
  if (pga === null) return [70, 85, 95];
  return [pga * 0.6, pga * 0.85, pga * 1.05];
}

/** Minimum tracked putts a cell needs before it can drive the "Work on next"
 *  Rx — matches the CoachHelm 8-per-distance-bucket insight floor so a
 *  single missed putt (1 attempt, 0%) can't outrank a well-sampled cell. */
const RX_MIN_N = 8;

const PUTTING_DISTANCE_DETAIL = [
  { label: '0-3ft', key: '0_3', make: 'puttMakePct0_3', efficiency: 'puttEff0_5', proximity: 'puttProximity0_5' },
  { label: '3-5ft', key: '3_5', make: 'puttMakePct3_5', efficiency: 'puttEff0_5', proximity: 'puttProximity0_5' },
  { label: '5-10ft', key: '5_10', make: 'puttMakePct5_10', efficiency: 'puttEff5_10', proximity: 'puttProximity5_10' },
  { label: '10-15ft', key: '10_15', make: 'puttMakePct10_15', efficiency: 'puttEff10_15', proximity: 'puttProximity10_15' },
  { label: '15-20ft', key: '15_20', make: 'puttMakePct15_20', efficiency: 'puttEff15_20', proximity: 'puttProximity15_20' },
  { label: '20-25ft', key: '20_25', make: 'puttMakePct20_25', efficiency: 'puttEff20_25', proximity: 'puttProximity20Plus' },
  { label: '25-30ft', key: '25_30', make: 'puttMakePct25_30', efficiency: 'puttEff25_30', proximity: 'puttProximity20Plus' },
  { label: '30-35ft', key: '30_35', make: 'puttMakePct30_35', efficiency: 'puttEff30_35', proximity: 'puttProximity20Plus' },
  { label: '35+ft', key: '35_plus', make: 'puttMakePct35Plus', efficiency: 'puttEff35Plus', proximity: 'puttProximity20Plus' },
] as const satisfies ReadonlyArray<{
  label: string;
  key: string;
  make: PuttMakePctField;
  efficiency: keyof GolfStats;
  proximity: keyof GolfStats;
}>;

type PuttingDetail = 'distance' | 'breaks' | 'misses';

export interface PuttingDrillProps {
  detailedStats: GolfStats | null;
  leakMaps: PlayerLeakMaps | null;
  standingByMetric: Map<string, PlayerStandingRow>;
  weaknesses: StatisticalStrengthWeakness[];
  /** True when the leak-map fetch genuinely FAILED (distinct from no-data). */
  leakError?: boolean;
  onRetryLeak?: () => void;
  retryingLeak?: boolean;
}

export function PuttingDrill({
  detailedStats,
  leakMaps,
  standingByMetric,
  weaknesses,
  leakError = false,
  onRetryLeak,
  retryingLeak = false,
}: PuttingDrillProps) {
  const { home } = useStage();
  const s = detailedStats;
  const [detail, setDetail] = useState<PuttingDetail>('distance');
  const puttingByBreak = s?.puttingByBreak ?? null;

  // --- Hero: overall (all-break) ALL-PUTT make% by distance band ---------
  // n prefers the EXACT top-level attempt count (`puttMakeCount*`, 5 of 9
  // bands) that backs `overallField` 1:1. For the other 4 bands (20ft+),
  // no top-level count exists, so n falls back to summing the four
  // break-type cells — an undercount whenever a putt has no tagged break
  // (`putt_break` is nullable), but still the best available signal there.
  const heroPoints: MakeCurvePoint[] = DISTANCE_BANDS.map((band) => ({
    label: band.label,
    pct: finite(s?.[band.overallField]),
    n: band.overallCountField
      ? (s?.[band.overallCountField] ?? 0)
      : BREAK_COLS.reduce((sum, col) => sum + countAt(puttingByBreak?.[col.breakKey], band.countField), 0),
  }));
  const heroAriaLabel = chartAriaLabel(
    'Putt make curve: make percentage by distance',
    heroPoints
      .map((p) => (p.pct === null ? `${p.label} no data` : `${p.label} ${Math.round(p.pct)}% on ${p.n ?? 0} putts`))
      .join(', '),
  );

  const rows = DISTANCE_BANDS.map((band) => ({
    label: band.label,
    cells: BREAK_COLS.map((col): RampCell => {
      const breakStats = puttingByBreak?.[col.breakKey];
      const pct = finite(breakStats?.[band.field] as number | null | undefined);
      const n = countAt(breakStats, band.countField);
      const pga = band.pgaMetricId ? finite(standingByMetric.get(band.pgaMetricId)?.pga_value ?? null) : null;
      return {
        value: pct === null ? '—' : `${Math.round(pct)}`,
        // Sample-size badge so a 1-putt "0%" cell doesn't read as trustworthy
        // as a 40-putt one — omitted (not "n=0") when the cell has no data.
        n: n > 0 ? `n=${n}` : undefined,
        band: rampBandForValue(pct, bandThresholds(pga)),
      };
    }),
  }));

  const breakOverviewRows: RailBarRow[] = BREAK_COLS.map((col) => {
    const breakStats = puttingByBreak?.[col.breakKey];
    const pct = finite(breakStats?.overallMakePct);
    return { label: col.colLabel, pct: pct ?? 0, value: fmtPct(pct) };
  });

  // Worst single cell across the matrix WITH enough tracked putts to trust —
  // the Rx target. A cell below RX_MIN_N never qualifies, so a single missed
  // 3-footer (1 attempt, 0%) can't outrank a well-sampled weak cell.
  let worst: { band: string; distance: string; pct: number; n: number } | null = null;
  for (const band of DISTANCE_BANDS) {
    for (const col of BREAK_COLS) {
      const breakStats = puttingByBreak?.[col.breakKey];
      const pct = finite(breakStats?.[band.field] as number | null | undefined);
      const n = countAt(breakStats, band.countField);
      if (pct === null || n < RX_MIN_N) continue;
      if (worst === null || pct < worst.pct) worst = { band: col.colLabel, distance: band.label, pct, n };
    }
  }

  const puttingCost = weaknesses
    .filter((w) => w.subcategory === 'putting')
    .reduce((sum, w) => sum + Math.abs(w.strokeImpact), 0);

  // --- Putting efficiency readouts (FIX 4) ---------------------------------
  const puttsPerHole = finite(s?.puttsPerHole);
  const puttsPerGir = finite(s?.puttsPerGir);
  const threePuttsPerRound = finite(s?.threePuttsPerRound);
  // Raw total, not a rate — 0 is a real (if rare) reading, distinct from
  // "no stats loaded yet" (finite(undefined) → null → awaiting).
  const onePuttsTotal = finite(s?.onePuttsTotal);
  const approachPuttAvgLeave = finite(s?.approachPuttAvgLeave);

  const efficiencyReadouts: Array<{
    label: string;
    value: number | null;
    unit?: string;
    format?: { maximumFractionDigits: number };
    awaitingLabel: string;
  }> = [
    { label: 'Putts / hole', value: puttsPerHole, format: { maximumFractionDigits: 2 }, awaitingLabel: 'No putts' },
    { label: 'Putts / GIR', value: puttsPerGir, format: { maximumFractionDigits: 2 }, awaitingLabel: 'No GIR putts' },
    { label: '3-putts / round', value: threePuttsPerRound, format: { maximumFractionDigits: 2 }, awaitingLabel: 'No rounds' },
    { label: '1-putts (total)', value: onePuttsTotal, awaitingLabel: 'No putts' },
    { label: 'Approach-putt avg leave', value: approachPuttAvgLeave, unit: 'ft', format: { maximumFractionDigits: 1 }, awaitingLabel: 'No leave data' },
  ];

  // --- Miss direction (overall) — first-putt misses with a tagged
  // direction. Low/high are amateur/pro break-read misses, not L/R. ---------
  const missLeft = finite(s?.puttMissLeftPct);
  const missRight = finite(s?.puttMissRightPct);
  const missShort = finite(s?.puttMissShortPct);
  const missLong = finite(s?.puttMissLongPct);
  const missLow = finite(s?.puttMissLowPct);
  const missHigh = finite(s?.puttMissHighPct);
  const overallMissRows: RailBarRow[] = [
    { label: 'Left', pct: missLeft ?? 0, value: fmtPct(missLeft), dim: missLeft === null },
    { label: 'Right', pct: missRight ?? 0, value: fmtPct(missRight), dim: missRight === null },
    { label: 'Short', pct: missShort ?? 0, value: fmtPct(missShort), dim: missShort === null },
    { label: 'Long', pct: missLong ?? 0, value: fmtPct(missLong), dim: missLong === null },
    { label: 'Low', pct: missLow ?? 0, value: fmtPct(missLow), dim: missLow === null },
    { label: 'High', pct: missHigh ?? 0, value: fmtPct(missHigh), dim: missHigh === null },
  ];
  const hasOverallMissData = [missLeft, missRight, missShort, missLong, missLow, missHigh].some((v) => v !== null);

  // --- Miss tendency by break — short/low/high only (the calculator does
  // not split left/right per break, only overall). Groups with no tagged
  // misses for that break are omitted rather than shown as an empty rail. --
  const breakMissGroups = BREAK_COLS.map((col) => {
    const breakStats = puttingByBreak?.[col.breakKey];
    const short = finite(breakStats?.missShortPct);
    const low = finite(breakStats?.missLowPct);
    const high = finite(breakStats?.missHighPct);
    const rows: RailBarRow[] = [
      { label: 'Short', pct: short ?? 0, value: fmtPct(short), dim: short === null },
      { label: 'Low', pct: low ?? 0, value: fmtPct(low), dim: low === null },
      { label: 'High', pct: high ?? 0, value: fmtPct(high), dim: high === null },
    ];
    return { label: col.colLabel, rows, hasData: short !== null || low !== null || high !== null };
  }).filter((g) => g.hasData);

  return (
    <DrillPanel title="Putting" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
          {efficiencyReadouts.map((r) => (
            <InstrumentPanel key={r.label} depth="base" padding="md" className="min-h-[112px]">
              <Readout
                value={r.value ?? undefined}
                format={r.format}
                unit={r.unit}
                label={r.label}
                size="sm"
                state={r.value != null ? 'live' : 'awaiting'}
                awaitingLabel={r.awaitingLabel}
              />
            </InstrumentPanel>
          ))}
        </div>

        <Segmented
          value={detail}
          onValueChange={setDetail}
          options={[
            { value: 'distance', label: 'Distance' },
            { value: 'breaks', label: 'Breaks' },
            { value: 'misses', label: 'Misses' },
          ]}
          size="lg"
          fullWidth
          aria-label="Putting detail"
        />

        {detail === 'distance' ? (
          <Surface elevation="shadow" padding="md" className="space-y-4 overflow-hidden">
            <div>
              <Eyebrow as="h4">Putting by distance</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Make rate, where first putts start, average leave, and strokes to hole out.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] border-separate border-spacing-y-2 text-left">
                <thead className="text-eyebrow uppercase tracking-wide text-text-tertiary"><tr><th className="px-3">Distance</th><th className="px-3">Make</th><th className="px-3">First-putt share</th><th className="px-3">Avg leave</th><th className="px-3">Efficiency</th><th className="px-3">Proximity</th></tr></thead>
                <tbody>{PUTTING_DISTANCE_DETAIL.map((band) => {
                  const num = (value: unknown, digits = 1) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
                  return (
                    <tr key={band.key} className="bg-surface-sunken font-fw-mono text-caption tabular-nums text-text-secondary">
                      <th className="rounded-l-fw-sm px-3 py-3 font-fw-sans font-medium text-text-primary">{band.label}</th>
                      <td className="px-3">{num(s?.[band.make], 0)}%</td>
                      <td className="px-3">{num(s?.firstPuttDistanceByBand?.[band.key], 0)}%</td>
                      <td className="px-3">{num(s?.approachPuttAvgLeaveByBand?.[band.key], 1)} ft</td>
                      <td className="px-3">{num(s?.[band.efficiency], 2)}</td>
                      <td className="rounded-r-fw-sm px-3">{num(s?.[band.proximity], 1)} ft</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </Surface>
        ) : null}

        {detail === 'breaks' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Surface elevation="shadow" padding="md" className="space-y-4 overflow-hidden">
              <div>
                <Eyebrow as="h4">Make rate by distance and break</Eyebrow>
                <p className="mt-1 text-caption text-text-tertiary">Swipe the table on smaller screens.</p>
              </div>
              <div className="overflow-x-auto">
                <RampMatrix cols={BREAK_COLS.map((c) => c.colLabel)} rows={rows} legend={[{ band: 1, label: 'Well behind Tour' }, { band: 2, label: 'Behind' }, { band: 3, label: 'Near Tour' }, { band: 4, label: 'Ahead of Tour' }]} />
              </div>
              <RailBars rows={breakOverviewRows} labelWidth={64} />
            </Surface>
            <div className="flex flex-col gap-4">
              <RxCard title="Work on next">
                {worst ? `${worst.distance} putts breaking ${worst.band.toLowerCase()} are converting at ${Math.round(worst.pct)}% (n=${worst.n}) — the weakest reliable practice target.` : `No distance × break cell has ${RX_MIN_N} tracked putts yet, so there is not a reliable practice target.`}
              </RxCard>
              {puttingCost > 0 ? <p className="font-fw-sans text-caption text-text-tertiary">Putting is costing an estimated {puttingCost.toFixed(1)} strokes per round vs the field.</p> : null}
            </div>
          </div>
        ) : null}

        {detail === 'misses' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <Surface elevation="shadow" padding="md" className="space-y-3">
              <Eyebrow as="h4">Overall miss direction</Eyebrow>
              <p className="text-caption text-text-tertiary">Low = didn’t break enough · High = broke too much.</p>
              {hasOverallMissData ? <RailBars rows={overallMissRows} labelWidth={56} /> : <p className="text-body-sm text-text-tertiary">No tagged misses yet.</p>}
            </Surface>
            <Surface elevation="border" padding="md" className="space-y-3">
              <Eyebrow as="h4">Miss tendency by break</Eyebrow>
              {breakMissGroups.length > 0 ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{breakMissGroups.map((g) => <div key={g.label} className="flex flex-col gap-1.5"><span className="font-fw-sans text-caption text-text-tertiary">{g.label}</span><RailBars rows={g.rows} labelWidth={40} /></div>)}</div> : <p className="text-body-sm text-text-tertiary">No break-tagged misses yet.</p>}
            </Surface>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
          <Eyebrow as="h3" tone="accent">Putting visuals</Eyebrow>
          <MakeCurve points={heroPoints} ariaLabel={heroAriaLabel} />
          {leakError ? <LeakLoadError onRetry={() => onRetryLeak?.()} retrying={retryingLeak} /> : <LeakMap title="Putt make %" overline="Putting" subtitle="Make rate by distance vs PGA Tour" takeaway="Bands below the dashed Tour line are where putts are leaking." direction="higher_better" unit="percent" data={leakMaps ? toBuckets(leakMaps.putting) : []} />}
        </div>
      </div>
    </DrillPanel>
  );
}
