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
 * Three detail sub-tabs: Scrambling detail / Efficiency (now RampMatrix-
 * banded, same grammar as PuttingDrill's make% matrix) / Misses — the new
 * up-and-down-by-miss-direction and up-and-down-by-lie (incl. fringe)
 * breakdowns plus average chip proximity, all derived purely from raw shot
 * rows in golf-stats-calculator-shots.ts (no new DB reads).
 * ========================================================================== */

import { useState } from 'react';
import { DrillPanel, RailBars, RampMatrix, RingGauge, rampBandForValue, useStage } from '@/components/fairway/modules';
import type { RailBarRow, RampCell } from '@/components/fairway/modules';
import { Eyebrow, InstrumentPanel, Readout, RadialGauge, Segmented, Surface, chartAriaLabel } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { CategoryInsightStrip } from './CategoryInsightStrip';
import { buildCategoryInsights } from './buildStatsViewModel';
import type { CategorizablePatternWithImpact } from './buildStatsViewModel';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

/** Higher-is-better banding for up-and-down %, shared by both Misses-tab
 *  matrices. Thresholds are informed estimates — no PGA benchmark is
 *  plumbed into this drill today (the PGA Tour scrambling average is
 *  ~58%; college short game runs well under that): <35% needs work,
 *  35-50% fair, 50-65% good, 65%+ ahead of the curve. */
function udBand(pct: number | null): 0 | 1 | 2 | 3 | 4 {
  return rampBandForValue(pct, [35, 50, 65]);
}

/** Lower-is-better banding for strokes-to-hole-out (around-the-green
 *  efficiency) — the inverse of the usual higher-is-better ramp. Reuses the
 *  SAME shared `rampBandForValue` (same grammar/RAMP_CLASSES as `udBand`
 *  above and PuttingDrill's make% matrix) by negating both the value and
 *  the thresholds. Thresholds are informed estimates, not a plumbed PGA
 *  benchmark: a perfect up-and-down is 2.0 strokes, a missed one is 3.0 —
 *  ≤2.2 excellent … >2.8 needs work. */
function effBand(value: number | null): 0 | 1 | 2 | 3 | 4 {
  return rampBandForValue(value === null ? null : -value, [-2.8, -2.5, -2.2]);
}

const UD_LEGEND: Array<{ band: 1 | 2 | 3 | 4; label: string }> = [
  { band: 1, label: 'Needs work' },
  { band: 2, label: 'Fair' },
  { band: 3, label: 'Good' },
  { band: 4, label: 'Ahead of the curve' },
];

const EFF_LEGEND: Array<{ band: 1 | 2 | 3 | 4; label: string }> = [
  { band: 1, label: 'Needs work' },
  { band: 2, label: 'Fair' },
  { band: 3, label: 'Good' },
  { band: 4, label: 'Excellent' },
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
}

export function ShortGameDrill({ detailedStats, patterns = [] }: ShortGameDrillProps) {
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

  const byDistance: RailBarRow[] = [
    { label: '0-10 yds', pct: finite(s?.scramblingPct0_10) ?? 0, value: fmtPct(finite(s?.scramblingPct0_10)) },
    { label: '10-20 yds', pct: finite(s?.scramblingPct10_20) ?? 0, value: fmtPct(finite(s?.scramblingPct10_20)) },
    { label: '20-30 yds', pct: finite(s?.scramblingPct20_30) ?? 0, value: fmtPct(finite(s?.scramblingPct20_30)) },
  ];

  const sandPct = finite(s?.sandSavePercentage);
  const sandAtt = s?.sandSaveAttempts ?? 0;
  const penPerRound = finite(s?.penaltiesPerRound);

  const efficiencyByDistance = [
    { label: '0-10 yds', key: '0_10', value: finite(s?.atgEfficiency0_10) },
    { label: '10-20 yds', key: '10_20', value: finite(s?.atgEfficiency10_20) },
    { label: '20+ yds', key: '20_30', value: finite(s?.atgEfficiency20_30) },
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
        band: udBand(pct),
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
    { key: 'fairway', label: 'Fairway', pct: s?.scramblingPctFairway ?? null, n: s?.scrambleFairwayAttempts ?? 0 },
    { key: 'rough', label: 'Rough', pct: s?.scramblingPctRough ?? null, n: s?.scrambleRoughAttempts ?? 0 },
    { key: 'sand', label: 'Sand', pct: s?.scramblingPctSand ?? null, n: s?.scrambleSandAttempts ?? 0 },
    { key: 'fringe', label: 'Fringe', pct: s?.scramblingPctFringe ?? null, n: s?.scrambleFringeAttempts ?? 0 },
  ] as const;
  const lieRow = {
    label: 'Up & down',
    cells: lieCols.map((col): RampCell => {
      const pct = finite(col.pct);
      return {
        value: pct === null ? '—' : `${Math.round(pct)}%`,
        n: col.n > 0 ? `n=${col.n}` : undefined,
        band: udBand(pct),
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
              <p className="mt-1 text-caption text-text-tertiary">Average strokes to hole out. Lower is better — darker cells convert in fewer strokes.</p>
            </div>
            <div className="overflow-x-auto">
              <RampMatrix
                cols={['Overall', 'Fairway', 'Rough', 'Sand']}
                rows={efficiencyByDistance.map((row) => {
                  const split = s?.atgEffByDistanceLie?.[row.key];
                  const cellFor = (v: number | null | undefined): RampCell => {
                    const val = finite(v);
                    return { value: val === null ? '—' : val.toFixed(2), band: effBand(val) };
                  };
                  return {
                    label: row.label,
                    cells: [cellFor(row.value), cellFor(split?.fairway), cellFor(split?.rough), cellFor(split?.sand)],
                  };
                })}
                legend={EFF_LEGEND}
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
                <p className="mt-1 text-caption text-text-tertiary">Conversion rate when the approach missed short, long, left, or right of the green.</p>
              </div>
              <div className="overflow-x-auto">
                <RampMatrix cols={missDirCols.map((c) => c.label)} rows={[missDirRow]} legend={UD_LEGEND} />
              </div>
              <RailBars rows={missShareRows} labelWidth={64} />
            </Surface>
            <Surface elevation="border" padding="md" className="flex flex-col gap-4">
              <div>
                <Eyebrow as="h4">Up-and-down by lie</Eyebrow>
                <p className="mt-1 text-caption text-text-tertiary">Fairway, rough, sand, and fringe chips — conversion rate and sample size.</p>
              </div>
              <div className="overflow-x-auto">
                <RampMatrix cols={lieCols.map((c) => c.label)} rows={[lieRow]} legend={UD_LEGEND} />
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
