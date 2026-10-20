'use client';

/**
 * ============================================================================
 * ShortGameDrill — `?area=short-game` (spec §5.1)
 * ----------------------------------------------------------------------------
 * Top: `CategoryInsightStrip` ("what CoachHelm sees" for the short-game
 * category). Short game has no round-level trend series anywhere in the
 * codebase (`buildCategoryTrends(...).short_game` is always `null`) — the
 * strip renders insights-only and handles the missing series gracefully
 * (no sparkline/delta chip), same contract every other drill's strip honors.
 *
 * HERO — a scrambling instrument cluster: one large `RadialGauge` reading
 * overall `scramblingPercentage` (an honest "awaiting" dial when there are no
 * scramble attempts yet) with a "n of n made" mono sub-line, flanked by three
 * small `RingGauge` rings for the fairway/rough/sand splits. A lie with no
 * attempts renders a dim ghost ring + em-dash rather than a fabricated 0%.
 *
 * Below the hero: scrambling by distance (`RailBars`) plus sand-save and
 * penalty headline readouts. The old by-lie `RailBars` row was dropped — it
 * now exactly duplicates the three flanking rings above.
 *
 * Three detail sub-tabs: Scrambling detail / Efficiency / Misses — the new
 * up-and-down-by-miss-direction and up-and-down-by-lie (incl. fringe)
 * breakdowns plus average chip proximity, all derived purely from raw shot
 * rows in golf-stats-calculator-shots.ts (no new DB reads).
 *
 * TOUR-ONLY GRADING (owner decision Q-93). The only colour-graded cells are
 * the up-and-down rates by lie (fairway, rough, sand), graded against the
 * Tour's scrambling rate for that lie (`TOUR_STANDARDS[tour].scramblingPct`:
 * PGA Tour for men's teams, LPGA Tour for women's). Everything the Tour has no
 * standard for (up-and-down by miss direction, fringe, strokes to hole out)
 * draws neutral: the old hand-set "college short game" bands are gone.
 * ========================================================================== */

import { useState } from 'react';
import { DrillPanel, RailBars, RampMatrix, RingGauge, rampBandForValue, useStage } from '@/components/fairway/modules';
import type { RailBarRow, RampCell } from '@/components/fairway/modules';
import { Eyebrow, InstrumentPanel, Readout, RadialGauge, Segmented, Surface, chartAriaLabel } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { TOUR_STANDARDS, tourLabel, type TourKey } from '@/lib/golf/benchmarks/tour';
import { CategoryInsightStrip } from './CategoryInsightStrip';
import { buildCategoryInsights } from './buildStatsViewModel';
import type { CategorizablePatternWithImpact } from './buildStatsViewModel';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

/**
 * Scrambling by distance band, without inventing a zero.
 *
 * These rows did `finite(...) ?? 0`, so a null — which `safePercent` returns
 * precisely when the denominator is zero — rendered a 0% bar. "Scrambling from
 * 20+ yds: 0%" for a player who has never had a 20+ yard scramble reads
 * identically to one who has had eight and converted none.
 *
 * THE LAST BAND IS "20+ yds". `scramblingPct20_30` keeps its historical key
 * (Clubhouse and other readers import the field), but it is every scramble
 * from more than 20 yd, uncapped (golf-stats-calculator-shots.ts `else`
 * branch), not 20-30 yd.
 *
 * Live. Measured 2026-08-17 across the 42 players with completed rounds:
 * 5 have ZERO shots in the 20+ yd band and 12 more have between one and four
 * — 17 of 42 affected, comparable in reach to the GIR-from-sand case. The 0-10
 * band has 2 players at zero; 10-20 has none.
 *
 * A REAL 0% stays undimmed: eight scrambles from that band and none converted
 * is a finding, not missing data.
 */
export function buildScramblingByDistanceRows(s: GolfStats | null): RailBarRow[] {
  const bands: Array<[string, number | null]> = [
    ['0-10 yds', finite(s?.scramblingPct0_10)],
    ['10-20 yds', finite(s?.scramblingPct10_20)],
    ['20+ yds', finite(s?.scramblingPct20_30)],
  ];
  return bands.map(([label, pct]) => ({
    label,
    pct: pct ?? 0,
    value: fmtPct(pct),
    dim: pct === null,
  }));
}

/** The lies the Tour publishes a scrambling rate for (`scrambling_pct_*`). */
type TourLie = keyof (typeof TOUR_STANDARDS)['pga']['scramblingPct'];

/** Higher-is-better ramp band for an up-and-down % by lie, proportional to the
 *  Tour's scrambling rate for that lie (the same 0.6 / 0.85 / 1.05 fractions
 *  PuttingDrill's make-rate ramp uses). Neutral (band 0) when the tour is
 *  unknown or the lie has no Tour standard (fringe): there is nothing honest to
 *  grade against. */
function udBand(pct: number | null, tour: TourKey | null, lie: TourLie | null): 0 | 1 | 2 | 3 | 4 {
  if (tour === null || lie === null) return 0;
  const tourPct = TOUR_STANDARDS[tour].scramblingPct[lie];
  return rampBandForValue(pct, [tourPct * 0.6, tourPct * 0.85, tourPct * 1.05]);
}

/** Same band wording PuttingDrill's make-rate legend uses. */
const UD_LEGEND: Array<{ band: 1 | 2 | 3 | 4; label: string }> = [
  { band: 1, label: 'Well behind Tour' },
  { band: 2, label: 'Behind' },
  { band: 3, label: 'Near Tour' },
  { band: 4, label: 'Ahead of Tour' },
];

/**
 * A dim, honest placeholder for a lie ring with no recorded attempts — a
 * static sunken track + em-dash, never a fabricated 0% arc. Mirrors
 * `RingGauge`'s geometry so it reads as the same instrument, just asleep.
 */
function GhostRing({ size }: { size: number }) {
  const strokeWidth = Math.max(2, size / 7.5);
  const r = size / 2 - strokeWidth / 2 - 1;
  return (
    <span
      role="img"
      aria-label="No scramble attempts recorded"
      className="inline-flex items-center gap-2 opacity-40"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fw-color-surface-sunken)"
          strokeWidth={strokeWidth}
        />
      </svg>
      <b className="font-fw-mono text-body-sm font-normal not-italic tabular-nums text-text-tertiary">
        —
      </b>
    </span>
  );
}

/** One flanking lie ring — label above, ring (or ghost) below. */
function LieRing({ label, pct }: { label: string; pct: number | null }) {
  // `RingGauge`/`GhostRing` carry their own generic role="img" aria-label
  // (a composite score / a bare "no attempts" string) that says nothing
  // about scrambling or which lie this is. Hide that inner label from the
  // accessibility tree and speak a real one — "<Lie> scrambling: N%" or
  // "<Lie> scrambling: no attempts recorded" — from this wrapper instead.
  const ariaLabel = chartAriaLabel(
    `${label} scrambling`,
    pct === null ? 'No attempts recorded' : `${Math.round(pct)}%`,
  );
  return (
    <InstrumentPanel depth="base" padding="sm" className="flex min-h-[112px] flex-col items-center justify-center gap-2 overflow-clip">
      <span className="font-fw-sans text-caption font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </span>
      <span role="img" aria-label={ariaLabel}>
        <span aria-hidden="true">
          {pct === null ? <GhostRing size={48} /> : <RingGauge value={pct} size={48} />}
        </span>
      </span>
    </InstrumentPanel>
  );
}

export interface ShortGameDrillProps {
  detailedStats: GolfStats | null;
  /** CoachHelm's mined patterns (`getPlayerPatterns`) — feeds the "What
   *  CoachHelm sees" short-game-category insights via `buildCategoryInsights`.
   *  No `trends` prop: short game's own trend is always `null`
   *  (`buildCategoryTrends(...).short_game`, no round-level scrambling series
   *  exists anywhere in the codebase) — `CategoryInsightStrip` renders
   *  insights-only, with no series/delta/trendLabel wired. */
  patterns?: ReadonlyArray<CategorizablePatternWithImpact>;
  /** The tour the up-and-down-by-lie cells are graded against, resolved once by
   *  the stage (`resolveStageTour`): PGA Tour for a men's team, LPGA Tour for a
   *  women's team. Null (not known yet) draws every cell neutral. */
  tour?: TourKey | null;
}

export function ShortGameDrill({ detailedStats, patterns = [], tour = null }: ShortGameDrillProps) {
  const { home } = useStage();
  const s = detailedStats;
  const [detail, setDetail] = useState<'scrambling' | 'efficiency' | 'misses'>('scrambling');

  const shortGameInsights = buildCategoryInsights(patterns).short_game;

  const scramblingPct = finite(s?.scramblingPercentage);
  const scrambleAttempts = s?.scrambleAttempts ?? 0;
  const scramblesMade = s?.scramblesMade ?? 0;

  const lieRings: Array<{ label: string; pct: number | null }> = [
    { label: 'Fairway', pct: finite(s?.scramblingPctFairway) },
    { label: 'Rough', pct: finite(s?.scramblingPctRough) },
    { label: 'Sand', pct: finite(s?.scramblingPctSand) },
  ];

  const byDistance: RailBarRow[] = buildScramblingByDistanceRows(s);

  const sandPct = finite(s?.sandSavePercentage);
  const sandAtt = s?.sandSaveAttempts ?? 0;
  const penPerRound = finite(s?.penaltiesPerRound);

  const efficiencyByDistance = [
    { label: '0-10 yds', key: '0_10', value: finite(s?.atgEfficiency0_10) },
    { label: '10-20 yds', key: '10_20', value: finite(s?.atgEfficiency10_20) },
    // Key `20_30` is historical: the band runs from 20 yd out to the 50 yd
    // around-the-green threshold (AROUND_GREEN_THRESHOLD_YARDS).
    { label: '20-50 yds', key: '20_30', value: finite(s?.atgEfficiency20_30) },
  ] as const;

  // --- Misses tab data prep -------------------------------------------------
  const missDirCols: ReadonlyArray<{ key: 'short' | 'long' | 'left' | 'right'; label: string }> = [
    { key: 'short', label: 'Short' },
    { key: 'long', label: 'Long' },
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' },
  ];
  const missDirRow = {
    label: 'Up & down',
    cells: missDirCols.map((col): RampCell => {
      const bucket = s?.scramblingByMissDirection?.[col.key];
      const pct = finite(bucket?.pct ?? null);
      return {
        value: pct === null ? '—' : `${Math.round(pct)}%`,
        n: bucket && bucket.attempts > 0 ? `n=${bucket.attempts}` : undefined,
        // The Tour publishes no scrambling rate by miss direction: neutral.
        band: 0,
      };
    }),
  };
  const missShareRows: RailBarRow[] = missDirCols.map((col) => {
    const bucket = s?.scramblingByMissDirection?.[col.key];
    const share = finite(bucket?.shareOfMisses ?? null);
    return {
      label: col.label,
      pct: share ?? 0,
      value: share === null ? '—' : `${Math.round(share)}%`,
      dim: share === null,
    };
  });

  const lieCols = [
    { key: 'fairway', label: 'Fairway', tourLie: 'fairway', pct: s?.scramblingPctFairway ?? null, n: s?.scrambleFairwayAttempts ?? 0 },
    { key: 'rough', label: 'Rough', tourLie: 'rough', pct: s?.scramblingPctRough ?? null, n: s?.scrambleRoughAttempts ?? 0 },
    { key: 'sand', label: 'Sand', tourLie: 'sand', pct: s?.scramblingPctSand ?? null, n: s?.scrambleSandAttempts ?? 0 },
    // The Tour publishes no fringe scrambling rate: the cell stays neutral.
    { key: 'fringe', label: 'Fringe', tourLie: null, pct: s?.scramblingPctFringe ?? null, n: s?.scrambleFringeAttempts ?? 0 },
  ] as const satisfies ReadonlyArray<{ key: string; label: string; tourLie: TourLie | null; pct: number | null; n: number }>;
  const lieRow = {
    label: 'Up & down',
    cells: lieCols.map((col): RampCell => {
      const pct = finite(col.pct);
      return {
        value: pct === null ? '—' : `${Math.round(pct)}%`,
        n: col.n > 0 ? `n=${col.n}` : undefined,
        band: udBand(pct, tour, col.tourLie),
      };
    }),
  };

  const proximityOverall = finite(s?.atgProximityAvg);
  const proximityByLie: Array<{ label: string; value: number | null }> = [
    { label: 'Fairway', value: finite(s?.atgProximityByLie?.fairway) },
    { label: 'Rough', value: finite(s?.atgProximityByLie?.rough) },
    { label: 'Sand', value: finite(s?.atgProximityByLie?.sand) },
  ];

  return (
    <DrillPanel title="Short game" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <CategoryInsightStrip insights={shortGameInsights} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Scrambling', value: scramblingPct, unit: '%', digits: 0, awaiting: 'No scrambles' },
            { label: 'Around-green efficiency', value: finite(s?.atgEfficiencyAvg), digits: 2, awaiting: 'No shots' },
            { label: 'Sand saves', value: sandPct, unit: '%', digits: 0, awaiting: 'No bunkers' },
            { label: 'Penalties / round', value: penPerRound, digits: 2, awaiting: 'No rounds' },
          ].map((item) => (
            <InstrumentPanel key={item.label} depth="base" padding="md" className="min-h-[116px]">
              <Readout value={item.value ?? undefined} unit={item.unit} format={{ maximumFractionDigits: item.digits }} label={item.label} size="sm" state={item.value !== null ? 'live' : 'awaiting'} awaitingLabel={item.awaiting} />
            </InstrumentPanel>
          ))}
        </div>

        <Segmented
          value={detail}
          onValueChange={setDetail}
          options={[{ value: 'scrambling', label: 'Scrambling detail' }, { value: 'efficiency', label: 'Efficiency' }, { value: 'misses', label: 'Misses' }]}
          size="lg"
          fullWidth
          aria-label="Short game detail"
        />

        {detail === 'scrambling' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Surface elevation="shadow" padding="md" className="flex flex-col gap-3">
              <Eyebrow as="h4">Scrambling by distance</Eyebrow>
              <RailBars rows={byDistance} labelWidth={72} />
              <p className="text-caption text-text-tertiary">{scramblesMade} of {scrambleAttempts} total scramble attempts converted</p>
            </Surface>
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <Eyebrow as="h4">Scrambling by lie</Eyebrow>
              <RailBars rows={lieRings.map((ring) => ({ label: ring.label, pct: ring.pct ?? 0, value: fmtPct(ring.pct), dim: ring.pct === null }))} labelWidth={72} />
              <p className="text-caption text-text-tertiary">Sand saves: {s?.sandSavesMade ?? 0} of {sandAtt}</p>
            </Surface>
          </div>
        ) : null}

        {detail === 'efficiency' ? (
          <Surface elevation="shadow" padding="md" className="space-y-4 overflow-hidden">
            <div>
              <Eyebrow as="h4">Short-game efficiency by distance and lie</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Average strokes to hole out. Lower is better. Not graded: the Tour publishes no strokes-to-hole-out standard for short game.</p>
            </div>
            <div className="overflow-x-auto">
              <RampMatrix
                cols={['Overall', 'Fairway', 'Rough', 'Sand']}
                rows={efficiencyByDistance.map((row) => {
                  const split = s?.atgEffByDistanceLie?.[row.key];
                  // Band 0 = neutral: no honest Tour value to grade a cell against.
                  const cellFor = (v: number | null | undefined): RampCell => {
                    const val = finite(v);
                    return { value: val === null ? '—' : val.toFixed(2), band: 0 };
                  };
                  return {
                    label: row.label,
                    cells: [cellFor(row.value), cellFor(split?.fairway), cellFor(split?.rough), cellFor(split?.sand)],
                  };
                })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[{ label: 'Fairway', value: s?.atgEffFairway }, { label: 'Rough', value: s?.atgEffRough }, { label: 'Sand', value: s?.atgEffSand }].map((item) => (
                <InstrumentPanel key={item.label} depth="base" padding="sm"><Readout value={finite(item.value) ?? undefined} format={{ maximumFractionDigits: 2 }} label={`${item.label} efficiency`} size="sm" state={finite(item.value) !== null ? 'live' : 'awaiting'} awaitingLabel="No shots" /></InstrumentPanel>
              ))}
            </div>
          </Surface>
        ) : null}

        {detail === 'misses' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Surface elevation="shadow" padding="md" className="flex flex-col gap-4">
              <div>
                <Eyebrow as="h4">Up-and-down by miss direction</Eyebrow>
                <p className="mt-1 text-caption text-text-tertiary">Conversion rate when the approach missed short, long, left, or right of the green. Not graded: the Tour publishes no standard by miss direction.</p>
              </div>
              <div className="overflow-x-auto">
                <RampMatrix cols={missDirCols.map((c) => c.label)} rows={[missDirRow]} />
              </div>
              <RailBars rows={missShareRows} labelWidth={64} />
            </Surface>
            <Surface elevation="border" padding="md" className="flex flex-col gap-4">
              <div>
                <Eyebrow as="h4">Up-and-down by lie</Eyebrow>
                <p className="mt-1 text-caption text-text-tertiary">
                  Fairway, rough, sand, and fringe chips, conversion rate and sample size.
                  {tour ? ` Fairway, rough and sand are coloured against the ${tourLabel(tour)}; fringe has no Tour standard.` : ''}
                </p>
              </div>
              <div className="overflow-x-auto">
                <RampMatrix cols={lieCols.map((c) => c.label)} rows={[lieRow]} legend={tour ? UD_LEGEND : undefined} />
              </div>
            </Surface>
            <Surface elevation="shadow" padding="md" className="flex flex-col gap-3 lg:col-span-2">
              <div>
                <Eyebrow as="h4">Proximity after the chip</Eyebrow>
                <p className="mt-1 text-caption text-text-tertiary">Average distance left on the green after a chip or pitch that found the putting surface. Lower is better.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <InstrumentPanel depth="raised" padding="sm">
                  <Readout value={proximityOverall ?? undefined} unit="ft" format={{ maximumFractionDigits: 1 }} label="Overall" size="sm" state={proximityOverall !== null ? 'live' : 'awaiting'} awaitingLabel="No chips on the green" />
                </InstrumentPanel>
                {proximityByLie.map((item) => (
                  <InstrumentPanel key={item.label} depth="base" padding="sm">
                    <Readout value={item.value ?? undefined} unit="ft" format={{ maximumFractionDigits: 1 }} label={item.label} size="sm" state={item.value !== null ? 'live' : 'awaiting'} awaitingLabel="No data" />
                  </InstrumentPanel>
                ))}
              </div>
            </Surface>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
          <Eyebrow as="h3" tone="accent">Short-game visuals</Eyebrow>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-stretch">
            <RadialGauge className="h-full" title="Scrambling" overline="Short game" value={scramblingPct ?? undefined} max={100} samples={scrambleAttempts} minSamples={1} unit="scrambles" takeaway={scramblingPct !== null ? `${scramblesMade} of ${scrambleAttempts} scrambles converted` : undefined} size="md" />
            <Surface elevation="border" padding="md" className="grid grid-cols-1 items-center gap-3 min-[430px]:grid-cols-3">
              {lieRings.map((ring) => <LieRing key={ring.label} label={ring.label} pct={ring.pct} />)}
            </Surface>
          </div>
        </div>
      </div>
    </DrillPanel>
  );
}
