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

/* ---------------------------------------------------------------------------
 * Per-tab content — VERBATIM field→row mapping from the legacy StatsTabContent.
 * Same formatters (toFixed precision, "%", " yds", " ft", made/attempts, "—").
 * ------------------------------------------------------------------------- */

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
          <StatRow label="Fairway %" value={stats.fairwayPercentage !== null ? `${stats.fairwayPercentage.toFixed(0)}%` : '—'} highlight />
          <StatRow label="Driver Fairway %" value={stats.fairwayPctDriver !== null ? `${stats.fairwayPctDriver.toFixed(0)}%` : '—'} />
          <StatRow label="Driving Distance (avg)" value={stats.drivingDistanceAvg !== null ? `${stats.drivingDistanceAvg.toFixed(0)} yds` : '—'} />
          <StatRow label="Miss Left %" value={stats.missLeftPct !== null ? `${stats.missLeftPct.toFixed(0)}%` : '—'} />
          <StatRow label="Miss Right %" value={stats.missRightPct !== null ? `${stats.missRightPct.toFixed(0)}%` : '—'} />
        </div>
      );

    case 'approach':
      return (
        <div className="space-y-1">
          <StatRow label="GIR %" value={stats.girPercentage !== null ? `${stats.girPercentage.toFixed(0)}%` : '—'} highlight />
          <StatRow label="GIR from Fairway" value={stats.girPctFromFairway !== null ? `${stats.girPctFromFairway.toFixed(0)}%` : '—'} />
          <StatRow label="GIR from Rough" value={stats.girPctFromRough !== null ? `${stats.girPctFromRough.toFixed(0)}%` : '—'} />
          <StatRow label="Approach Proximity (avg)" value={stats.approachProximityAvg !== null ? `${stats.approachProximityAvg.toFixed(0)} ft` : '—'} />
          <StatRow label="Proximity 125-150 yds" value={stats.approachProx125_150 !== null ? `${stats.approachProx125_150.toFixed(0)} ft` : '—'} />
          <StatRow label="Proximity 175-200 yds" value={stats.approachProx175_200 !== null ? `${stats.approachProx175_200.toFixed(0)} ft` : '—'} />
        </div>
      );

    case 'putting':
      return (
        <div className="space-y-1">
          <StatRow label="Putts / Round" value={stats.puttsPerRound?.toFixed(1) ?? '—'} highlight />
          <StatRow label="Putts / GIR" value={stats.puttsPerGir?.toFixed(2) ?? '—'} />
          <StatRow label="1-Putts" value={stats.onePuttsTotal?.toString() ?? '—'} />
          <StatRow label="3-Putts" value={stats.threePuttsTotal?.toString() ?? '—'} />
          <StatRow label="Make % (3-5 ft)" value={stats.puttMakePct3_5 !== null ? `${stats.puttMakePct3_5.toFixed(0)}%` : '—'} />
          <StatRow label="Make % (5-10 ft)" value={stats.puttMakePct5_10 !== null ? `${stats.puttMakePct5_10.toFixed(0)}%` : '—'} />
          <StatRow label="Make % (10-15 ft)" value={stats.puttMakePct10_15 !== null ? `${stats.puttMakePct10_15.toFixed(0)}%` : '—'} />
        </div>
      );

    case 'scrambling':
      return (
        <div className="space-y-1">
          <StatRow label="Scrambling %" value={stats.scramblingPercentage !== null ? `${stats.scramblingPercentage.toFixed(0)}%` : '—'} highlight />
          <StatRow label="Sand Save %" value={stats.sandSavePercentage !== null ? `${stats.sandSavePercentage.toFixed(0)}%` : '—'} />
          <StatRow label="Scrambles Made" value={`${stats.scramblesMade}/${stats.scrambleAttempts}`} />
          <StatRow label="Sand Saves Made" value={`${stats.sandSavesMade}/${stats.sandSaveAttempts}`} />
          <StatRow label="Scrambling from Rough" value={stats.scramblingPctRough !== null ? `${stats.scramblingPctRough.toFixed(0)}%` : '—'} />
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
