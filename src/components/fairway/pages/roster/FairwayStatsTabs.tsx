'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayStatsTabs (D5) — the ITS detailed-stats tab set
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy DetailedStatsTabs + StatsTabContent +
 * StatRow (src/components/golf/profile/PlayerStatsSection.tsx). This is the ONLY
 * real tab set in the player-detail performance cluster:
 *
 *   Scoring · Driving · Approach · Putting · Scrambling   (default: Scoring)
 *
 * Re-clad in the Fairway Tabs primitive (underline tabs, Radix engine, gliding
 * indicator) inside a matte Surface. The PER-TAB CONTENT (which GolfStats fields
 * map to which labeled rows + the lower-is-better "highlight") is copied
 * VERBATIM from the legacy StatsTabContent so the readout is identical.
 *
 * PURE CLIENT TAB STATE — no refetch, no mutation, no server action. It formats
 * the single GolfStats it is handed. Honest em-dash for any null metric.
 *
 * ADDITIVE ONLY — new file under pages/roster; composed by FairwayStatsSection.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/fairway/controls/tabs';

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export type FairwayStatsTab = 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling';
type ApproachLie = 'fairway' | 'rough' | 'sand';
type PuttBreak = keyof GolfStats['puttingByBreak'];

export interface FairwayStatsTabsProps {
  /** The stats to render (single round or overall). Computed by the engine. */
  stats: GolfStats;
  /** Default active tab. Defaults to "scoring" (matches legacy). */
  defaultTab?: FairwayStatsTab;
  className?: string;
}

const TABS: { id: FairwayStatsTab; label: string }[] = [
  { id: 'scoring', label: 'Scoring' },
  { id: 'driving', label: 'Driving' },
  { id: 'approach', label: 'Approach' },
  { id: 'putting', label: 'Putting' },
  { id: 'scrambling', label: 'Scrambling' },
];

interface DetailRow {
  label: string;
  value: string;
}

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function fmtPct(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : `${Math.round(n)}%`;
}

function fmtFeet(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : `${Math.round(n)} ft`;
}

function fmtNum(value: number | null | undefined, digits = 2): string {
  const n = finite(value);
  return n === null ? '—' : n.toFixed(digits);
}

function fmtInt(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : String(Math.round(n));
}

function allDash(rows: DetailRow[]): boolean {
  return rows.every((r) => r.value === '—');
}

function ToggleChip<T extends string>({
  active,
  value,
  label,
  onSelect,
}: {
  active: boolean;
  value: T;
  label: string;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'min-h-9 rounded-full border px-3.5 py-1.5 font-fw-sans text-label font-medium outline-none transition-colors [transition-duration:180ms]',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none',
        active
          ? 'border-accent-500 bg-accent-50 text-accent-700'
          : 'border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint hover:text-text-primary',
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * StatRow — re-skin of the legacy StatRow (label · value, hairline divider).
 * `highlight` keeps the legacy "this is the headline stat for the tab" cue,
 * rendered in Helm green (accent) per the lower-is-better / higher-is-better
 * semantics already baked into which row each tab marks.
 * ------------------------------------------------------------------------- */

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-2.5 last:border-0">
      <span className="font-fw-sans text-body-sm text-text-secondary">{label}</span>
      <span
        className={cn(
          'font-fw-mono text-body-sm font-medium tabular-nums',
          highlight ? 'text-accent-700' : 'text-text-primary',
        )}
        style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
      >
        {value}
      </span>
    </div>
  );
}

function BreakdownGrid({
  title,
  hint,
  rows,
  columns = 2,
}: {
  title: string;
  hint?: string;
  rows: DetailRow[];
  columns?: 2 | 3 | 4;
}) {
  const colClass =
    columns === 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : columns === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2';
  if (allDash(rows)) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h4 className="font-fw-sans text-body-sm font-medium text-text-primary">{title}</h4>
        {hint ? <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span> : null}
      </div>
      <Surface elevation="border" padding="md">
        <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-2.5', colClass)}>
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-3 border-b border-border-subtle/60 pb-2 last:border-0 last:pb-0"
            >
              <dt className="font-fw-sans text-caption text-text-secondary">{r.label}</dt>
              <dd
                className={cn(
                  'font-fw-mono text-body-sm font-medium tabular-nums',
                  r.value === '—' ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </Surface>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Per-tab content — legacy mapping plus restored lie/break controls.
 * ------------------------------------------------------------------------- */

function ApproachBody({ stats }: { stats: GolfStats }) {
  const [selectedLie, setSelectedLie] = React.useState<ApproachLie>('fairway');
  const lieRows: Record<ApproachLie, DetailRow[]> = {
    fairway: [
      { label: 'GIR from fairway', value: fmtPct(stats.girPctFromFairway) },
      { label: 'Proximity from fairway', value: fmtFeet(stats.approachProximityFairway) },
    ],
    rough: [
      { label: 'GIR from rough', value: fmtPct(stats.girPctFromRough) },
      { label: 'Proximity from rough', value: fmtFeet(stats.approachProximityRough) },
    ],
    sand: [
      { label: 'GIR from sand', value: fmtPct(stats.girPctFromSand) },
      { label: 'Proximity from sand', value: fmtFeet(stats.approachProximitySand) },
    ],
  };

  const girByDistance: DetailRow[] = [
    { label: '50-75 yds', value: fmtPct(stats.girPct50_75) },
    { label: '75-100 yds', value: fmtPct(stats.girPct75_100) },
    { label: '100-125 yds', value: fmtPct(stats.girPct100_125) },
    { label: '125-150 yds', value: fmtPct(stats.girPct125_150) },
    { label: '150-175 yds', value: fmtPct(stats.girPct150_175) },
    { label: '175-200 yds', value: fmtPct(stats.girPct175_200) },
    { label: '200-225 yds', value: fmtPct(stats.girPct200_225) },
    { label: '225+ yds', value: fmtPct(stats.girPct225Plus) },
  ];

  const efficiencyRows: DetailRow[] = [
    { label: '30-75 yds', value: fmtNum(stats.approachEff30_75[selectedLie], 2) },
    { label: '75-100 yds', value: fmtNum(stats.approachEff75_100[selectedLie], 2) },
    { label: '100-125 yds', value: fmtNum(stats.approachEff100_125[selectedLie], 2) },
    { label: '125-150 yds', value: fmtNum(stats.approachEff125_150[selectedLie], 2) },
    { label: '150-175 yds', value: fmtNum(stats.approachEff150_175[selectedLie], 2) },
    { label: '175-200 yds', value: fmtNum(stats.approachEff175_200[selectedLie], 2) },
    { label: '200-225 yds', value: fmtNum(stats.approachEff200_225[selectedLie], 2) },
    { label: '225+ yds', value: fmtNum(stats.approachEff225Plus[selectedLie], 2) },
  ];

  const lieLabel = `${selectedLie.charAt(0).toUpperCase()}${selectedLie.slice(1)}`;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <StatRow label="GIR %" value={fmtPct(stats.girPercentage)} highlight />
        <StatRow label="GIR from Fairway" value={fmtPct(stats.girPctFromFairway)} />
        <StatRow label="GIR from Rough" value={fmtPct(stats.girPctFromRough)} />
        <StatRow label="GIR from Sand" value={fmtPct(stats.girPctFromSand)} />
        <StatRow label="Approach Proximity (avg)" value={fmtFeet(stats.approachProximityAvg)} />
        <StatRow label="Proximity 125-150 yds" value={fmtFeet(stats.approachProx125_150)} />
        <StatRow label="Proximity 175-200 yds" value={fmtFeet(stats.approachProx175_200)} />
      </div>

      <div className="flex flex-wrap gap-2 px-1" aria-label="Approach lie filter">
        <ToggleChip active={selectedLie === 'fairway'} value="fairway" label="Fairway" onSelect={setSelectedLie} />
        <ToggleChip active={selectedLie === 'rough'} value="rough" label="Rough" onSelect={setSelectedLie} />
        <ToggleChip active={selectedLie === 'sand'} value="sand" label="Sand" onSelect={setSelectedLie} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownGrid title="GIR by approach distance" rows={girByDistance} columns={4} />
        <BreakdownGrid title={`${lieLabel} lie`} rows={lieRows[selectedLie]} />
        <BreakdownGrid
          title={`Efficiency from ${selectedLie}`}
          hint="Average strokes to hole out"
          rows={efficiencyRows}
          columns={4}
        />
      </div>
    </div>
  );
}

function PuttingBody({ stats }: { stats: GolfStats }) {
  const [selectedBreak, setSelectedBreak] = React.useState<PuttBreak>('left_to_right');
  const breakStats = stats.puttingByBreak[selectedBreak];
  const breakLabel =
    selectedBreak === 'left_to_right'
      ? 'Left to right'
      : selectedBreak === 'right_to_left'
        ? 'Right to left'
        : selectedBreak === 'straight'
          ? 'Straight'
          : 'Multiple breaks';

  const makeBands: DetailRow[] = [
    { label: '0-3 ft', value: fmtPct(stats.puttMakePct0_3) },
    { label: '3-5 ft', value: fmtPct(stats.puttMakePct3_5) },
    { label: '5-10 ft', value: fmtPct(stats.puttMakePct5_10) },
    { label: '10-15 ft', value: fmtPct(stats.puttMakePct10_15) },
    { label: '15-20 ft', value: fmtPct(stats.puttMakePct15_20) },
    { label: '20-25 ft', value: fmtPct(stats.puttMakePct20_25) },
    { label: '25-30 ft', value: fmtPct(stats.puttMakePct25_30) },
    { label: '30-35 ft', value: fmtPct(stats.puttMakePct30_35) },
    { label: '35+ ft', value: fmtPct(stats.puttMakePct35Plus) },
  ];
  const breakMakeBands: DetailRow[] = [
    { label: '0-3 ft', value: fmtPct(breakStats.makePct0_3) },
    { label: '3-5 ft', value: fmtPct(breakStats.makePct3_5) },
    { label: '5-10 ft', value: fmtPct(breakStats.makePct5_10) },
    { label: '10-15 ft', value: fmtPct(breakStats.makePct10_15) },
    { label: '15-20 ft', value: fmtPct(breakStats.makePct15_20) },
    { label: '20-25 ft', value: fmtPct(breakStats.makePct20_25) },
    { label: '25-30 ft', value: fmtPct(breakStats.makePct25_30) },
    { label: '30-35 ft', value: fmtPct(breakStats.makePct30_35) },
    { label: '35+ ft', value: fmtPct(breakStats.makePct35Plus) },
    { label: 'Overall make %', value: fmtPct(breakStats.overallMakePct) },
  ];
  const breakMissRows: DetailRow[] = [
    { label: 'Miss short', value: fmtPct(breakStats.missShortPct) },
    { label: 'Low side', value: fmtPct(breakStats.missLowPct) },
    { label: 'High side', value: fmtPct(breakStats.missHighPct) },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <StatRow label="Putts / Round" value={fmtNum(stats.puttsPerRound, 1)} highlight />
        <StatRow label="Putts / GIR" value={fmtNum(stats.puttsPerGir, 2)} />
        <StatRow label="1-Putts" value={fmtInt(stats.onePuttsTotal)} />
        <StatRow label="3-Putts" value={fmtInt(stats.threePuttsTotal)} />
        <StatRow label="Make % (3-5 ft)" value={fmtPct(stats.puttMakePct3_5)} />
        <StatRow label="Make % (5-10 ft)" value={fmtPct(stats.puttMakePct5_10)} />
        <StatRow label="Make % (10-15 ft)" value={fmtPct(stats.puttMakePct10_15)} />
      </div>

      <BreakdownGrid title="Make % by distance" rows={makeBands} columns={3} />

      <div className="flex flex-wrap gap-2 px-1" aria-label="Putt break filter">
        <ToggleChip active={selectedBreak === 'left_to_right'} value="left_to_right" label="L -> R" onSelect={setSelectedBreak} />
        <ToggleChip active={selectedBreak === 'right_to_left'} value="right_to_left" label="R -> L" onSelect={setSelectedBreak} />
        <ToggleChip active={selectedBreak === 'straight'} value="straight" label="Straight" onSelect={setSelectedBreak} />
        <ToggleChip active={selectedBreak === 'multiple'} value="multiple" label="Multiple" onSelect={setSelectedBreak} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownGrid
          title={`Make % by distance - ${breakLabel}`}
          hint={`${breakStats.totalPutts} putts with this break`}
          rows={breakMakeBands}
          columns={3}
        />
        <BreakdownGrid title={`Miss direction - ${breakLabel}`} rows={breakMissRows} columns={3} />
      </div>
    </div>
  );
}

function TabBody({ tab, stats }: { tab: FairwayStatsTab; stats: GolfStats }) {
  switch (tab) {
    case 'scoring':
      return (
        <div className="space-y-1">
          <StatRow label="Scoring Average" value={stats.scoringAverage?.toFixed(1) ?? '—'} highlight />
          <StatRow label="Best Round" value={stats.bestRound?.toString() ?? '—'} />
          <StatRow label="Worst Round" value={stats.worstRound?.toString() ?? '—'} />
          <StatRow label="GIR % (Par 3s)" value={stats.girPctPar3 !== null ? `${stats.girPctPar3.toFixed(0)}%` : '—'} />
          <StatRow label="GIR % (Par 4s)" value={stats.girPctPar4 !== null ? `${stats.girPctPar4.toFixed(0)}%` : '—'} />
          <StatRow label="GIR % (Par 5s)" value={stats.girPctPar5 !== null ? `${stats.girPctPar5.toFixed(0)}%` : '—'} />
          <StatRow label="Best Birdie Streak" value={stats.mostBirdiesRow?.toString() ?? '—'} />
          <StatRow label="Best Par Streak" value={stats.mostParsRow?.toString() ?? '—'} />
        </div>
      );

    case 'driving':
      return (
        <div className="space-y-1">
          <StatRow label="Fairway %" value={fmtPct(stats.fairwayPercentage)} highlight />
          <StatRow label="Driver Fairway %" value={fmtPct(stats.fairwayPctDriver)} />
          <StatRow label="Driving Distance (avg)" value={finite(stats.drivingDistanceAvg) === null ? '—' : `${Math.round(stats.drivingDistanceAvg)} yds`} />
          <StatRow label="Miss Left %" value={fmtPct(stats.missLeftPct)} />
          <StatRow label="Miss Right %" value={fmtPct(stats.missRightPct)} />
        </div>
      );

    case 'approach':
      return <ApproachBody stats={stats} />;

    case 'putting':
      return <PuttingBody stats={stats} />;

    case 'scrambling':
      return (
        <div className="space-y-1">
          <StatRow label="Scrambling %" value={fmtPct(stats.scramblingPercentage)} highlight />
          <StatRow label="Sand Save %" value={fmtPct(stats.sandSavePercentage)} />
          <StatRow label="Scrambles Made" value={`${stats.scramblesMade}/${stats.scrambleAttempts}`} />
          <StatRow label="Sand Saves Made" value={`${stats.sandSavesMade}/${stats.sandSaveAttempts}`} />
          <StatRow label="Scrambling from Rough" value={fmtPct(stats.scramblingPctRough)} />
        </div>
      );

    default:
      return null;
  }
}

/* ---------------------------------------------------------------------------
 * FairwayStatsTabs — pure client tab state via the Fairway Tabs primitive.
 * Default Scoring. No refetch — the same GolfStats feeds every tab panel.
 * ------------------------------------------------------------------------- */

export const FairwayStatsTabs = React.memo(function FairwayStatsTabs({
  stats,
  defaultTab = 'scoring',
  className,
}: FairwayStatsTabsProps) {
  return (
    <Surface padding="none" elevation="border" className={cn('overflow-hidden', className)}>
      <Tabs defaultValue={defaultTab} className="gap-0">
        <TabsList className="px-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="px-5 py-4">
            <TabBody tab={t.id} stats={stats} />
          </TabsContent>
        ))}
      </Tabs>
    </Surface>
  );
});