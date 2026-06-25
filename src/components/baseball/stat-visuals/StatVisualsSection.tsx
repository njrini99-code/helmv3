'use client';

// =============================================================================
// src/components/baseball/stat-visuals/StatVisualsSection.tsx
//
// The mountable GALLERY surface for the V10 baseball stat-visual chart library.
// This is the ONE component the Stats Center and the player profile import (a
// single import line each) so the fan-out charts land in the product without
// either of those surfaces re-implementing the honesty contract or owning a
// chart file.
//
// HONESTY-FIRST MOUNT: every chart here renders inside the Foundations frame and
// degrades to its own empty / insufficient-data surface when the granular event
// data isn't wired yet (the per-chart read models are a separate packet). So the
// gallery is safe to mount TODAY: it shows truthful "no captured events" frames
// rather than fabricated charts, and lights up automatically as a read model
// starts passing chart inputs through `data`.
//
// SCOPE TABS mirror Stats Lab families (v10_premium_ui_system_by_tab §"Stats
// Lab" / §"Required Visual Families"): Hitting, Pitching, Catching & Defense,
// Baserunning, Performance, Data Quality, plus a single Player DNA when scoped
// to one player.
//
// Cream/green only. No golf labels. Role-safe: pass `scope="player"` for the
// player profile so only player-visible families render (readiness/workload
// staff context is gated upstream at the read-model layer).
// =============================================================================

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Json } from '@/lib/types';
import { TabStrip } from './chart-primitives';
import {
  // hitting
  EvLaContactMatrix,
  ZoneChaseDamageHeatmap,
  SprayChart,
  ApproachCountLadder,
  GameVsPracticeGap,
  // pitching
  PitchShapeMap,
  CommandHeatmap,
  VelocityCommandDecay,
  PitchMixOutcomeBoard,
  ReleaseConsistencyPlot,
  // fielding
  CatcherWorkloadBoard,
  BatteryMatrix,
  DefensiveEventMap,
  BaserunningBoard,
  // performance
  ReadinessHeatStrip,
  LiftProgressionChart,
  PitcherWorkloadOverlay,
  // data quality + snapshot
  PracticeFocusOutcomeBoard,
  ImportDiffViewer,
  SourceCoverageBoard,
  PlayerDnaPanel,
} from './index';
import type {
  EvLaPoint,
  ZoneCell,
  ZoneMetric,
  SprayPoint,
  CountLadderRow,
  PairedMetricRow,
  PitchShapePoint,
  MissVector,
  DecayPoint,
  PitchMixRow,
  ReleasePoint,
  CatcherWorkloadPoint,
  BatteryCell,
  DefensiveEventPoint,
  BaserunningRow,
  ReadinessRow,
  LiftProgressionPoint,
  PitcherWorkloadDay,
  PracticeFocusRow,
  ImportDiffRow,
  SourceCoverageCard,
  PlayerDnaDimension,
} from '@/lib/types/baseball-stat-visuals';

// -----------------------------------------------------------------------------
// Data payload — every field optional; missing -> the chart's empty/insufficient
// frame. A read model fills only the families it can support.
// -----------------------------------------------------------------------------

export interface StatVisualsData {
  // hitting
  evLa?: EvLaPoint[];
  zoneCells?: ZoneCell[];
  zoneTotalPitches?: number;
  zoneMetric?: ZoneMetric;
  spray?: SprayPoint[];
  countLadder?: CountLadderRow[];
  gamePracticeGap?: PairedMetricRow[];
  // pitching
  pitchShape?: PitchShapePoint[];
  command?: MissVector[];
  commandTotalPitches?: number;
  decaySegments?: DecayPoint[];
  decayOutings?: number;
  pitchMix?: PitchMixRow[];
  release?: ReleasePoint[];
  // fielding
  catcherWorkload?: CatcherWorkloadPoint[];
  battery?: BatteryCell[];
  defensiveEvents?: DefensiveEventPoint[];
  baserunning?: BaserunningRow[];
  // performance
  readiness?: ReadinessRow[];
  liftExercise?: string;
  liftProgression?: LiftProgressionPoint[];
  pitcherWorkload?: PitcherWorkloadDay[];
  // data quality
  practiceFocus?: PracticeFocusRow[];
  importDiff?: ImportDiffRow[];
  sourceCoverage?: SourceCoverageCard[];
  // snapshot (player scope)
  playerDna?: PlayerDnaDimension[];
  playerDnaRole?: string;
}

type Scope = 'team' | 'player';
type Family =
  | 'hitting'
  | 'pitching'
  | 'fielding'
  | 'baserunning'
  | 'performance'
  | 'quality'
  | 'dna';

const TEAM_FAMILIES: { value: Family; label: string }[] = [
  { value: 'hitting', label: 'Hitting' },
  { value: 'pitching', label: 'Pitching' },
  { value: 'fielding', label: 'Catching & Defense' },
  { value: 'baserunning', label: 'Baserunning' },
  { value: 'performance', label: 'Performance' },
  { value: 'quality', label: 'Data Quality' },
];

const PLAYER_FAMILIES: { value: Family; label: string }[] = [
  { value: 'dna', label: 'Player DNA' },
  { value: 'hitting', label: 'Hitting' },
  { value: 'pitching', label: 'Pitching' },
  { value: 'fielding', label: 'Catching & Defense' },
  { value: 'baserunning', label: 'Baserunning' },
  { value: 'performance', label: 'Performance' },
];

// -----------------------------------------------------------------------------
// Saved-view persistence — wires the additive baseball_stat_visual_views table
// (migration 20260624000091). The gallery stays presentational: the parent owns
// the server actions (saveStatVisualView / setStatVisualPinned) and passes the
// current user's rows in via `savedViews`. When no handlers are supplied the
// save/pin control is hidden, so existing mounts behave exactly as before.
// view_state currently captures the active family tab + zone metric — the chart
// filter state these family tabs own today; it is forward-compatible (Json) so
// per-chart filters can be merged in as those read models land.
// -----------------------------------------------------------------------------

/** The chart key a family tab's saved view is stored under. */
const VISUAL_KEY_PREFIX = 'family:' as const;
function familyVisualKey(family: Family): string {
  return `${VISUAL_KEY_PREFIX}${family}`;
}

export interface StatVisualSavedView {
  visual_key: string;
  view_state: Json;
  is_pinned: boolean;
}

export interface StatVisualsSectionProps {
  /** 'team' (Stats Center) or 'player' (player profile). Drives family set. */
  scope?: Scope;
  data?: StatVisualsData;
  /** open the source drawer for the given underlying event ids (parent-owned). */
  onOpenSources?: (ids: string[]) => void;
  /** player this gallery is scoped to (player profile); scopes saved views. */
  playerId?: string | null;
  /** the current user's saved views for this scope (from getStatVisualViews). */
  savedViews?: StatVisualSavedView[];
  /** persist the active family tab's filter state. Omit to hide the save control. */
  onSaveView?: (input: {
    visualKey: string;
    viewState: Json;
    playerId?: string | null;
    isPinned?: boolean;
  }) => void | Promise<void>;
  /** pin/unpin the active family chart to the user's snapshot. */
  onSetPinned?: (input: {
    visualKey: string;
    isPinned: boolean;
    playerId?: string | null;
  }) => void | Promise<void>;
  className?: string;
}

/**
 * Two-up responsive gallery of the V10 stat visuals, grouped into family tabs.
 * Empty families still render their charts so a coach sees the honest "no data
 * yet" frame (the spec forbids hiding the surface — it teaches what to capture).
 */
export function StatVisualsSection({
  scope = 'team',
  data = {},
  onOpenSources,
  playerId,
  savedViews,
  onSaveView,
  onSetPinned,
  className,
}: StatVisualsSectionProps) {
  const families = scope === 'player' ? PLAYER_FAMILIES : TEAM_FAMILIES;

  // Restore the saved family tab on first render (a saved view marked active, or
  // the most-recently-saved one), falling back to the first family.
  const savedByKey = React.useMemo(() => {
    const map = new Map<string, StatVisualSavedView>();
    for (const v of savedViews ?? []) map.set(v.visual_key, v);
    return map;
  }, [savedViews]);

  const initialFamily = React.useMemo<Family>(() => {
    for (const f of families) {
      const v = savedByKey.get(familyVisualKey(f.value));
      const state = v?.view_state;
      if (
        state &&
        typeof state === 'object' &&
        !Array.isArray(state) &&
        (state as Record<string, unknown>).active === true
      ) {
        return f.value;
      }
    }
    return families[0]?.value ?? 'hitting';
  }, [families, savedByKey]);

  const [family, setFamily] = React.useState<Family>(initialFamily);
  const open = onOpenSources;

  const canPersist = Boolean(onSaveView);
  const activeKey = familyVisualKey(family);
  const isPinned = savedByKey.get(activeKey)?.is_pinned ?? false;

  const handleSave = React.useCallback(() => {
    if (!onSaveView) return;
    // Capture the active family tab as this scope's filter state. `active: true`
    // marks the tab to restore on the next visit; forward-compatible Json lets
    // per-chart filters merge in as their read models land.
    void onSaveView({
      visualKey: activeKey,
      viewState: { family, active: true } as Json,
      playerId: playerId ?? null,
      isPinned,
    });
  }, [onSaveView, activeKey, family, playerId, isPinned]);

  const handleTogglePin = React.useCallback(() => {
    if (!onSetPinned) return;
    void onSetPinned({ visualKey: activeKey, isPinned: !isPinned, playerId: playerId ?? null });
  }, [onSetPinned, activeKey, isPinned, playerId]);

  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label="Stat visuals">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
            Stat visuals
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-warm-900">
            Source-backed charts
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabStrip
            ariaLabel="Visual family"
            value={family}
            onChange={setFamily}
            size="md"
            options={families}
          />
          {canPersist && (
            // Raw <button> is intentional here, matching the chart-toolbar
            // precedent in chart-primitives (TabStrip / context filter): these
            // are tight chart-toolbar controls that own their own active/hover/
            // focus contract; @/components/ui/button would import a different
            // visual language into the toolbar.
            <div className="flex items-center gap-1.5">
              {onSetPinned && (
                // eslint-disable-next-line helm/no-raw-button
                <button
                  type="button"
                  onClick={handleTogglePin}
                  aria-pressed={isPinned}
                  aria-label={isPinned ? 'Unpin this chart group' : 'Pin this chart group'}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                    isPinned
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-warm-200 bg-cream-50 text-warm-600 hover:bg-warm-100',
                  )}
                >
                  {isPinned ? 'Pinned' : 'Pin'}
                </button>
              )}
              {/* eslint-disable-next-line helm/no-raw-button */}
              <button
                type="button"
                onClick={handleSave}
                aria-label="Save this chart view"
                className="rounded-full border border-warm-200 bg-cream-50 px-3 py-1.5 text-xs font-medium text-warm-700 transition-colors hover:bg-warm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                Save view
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {family === 'dna' && (
          <PlayerDnaPanel
            className="xl:col-span-2"
            dimensions={data.playerDna ?? []}
            roleLabel={data.playerDnaRole}
          />
        )}

        {family === 'hitting' && (
          <>
            <EvLaContactMatrix points={data.evLa ?? []} onPointActivate={open} />
            <ZoneChaseDamageHeatmap
              cells={data.zoneCells ?? []}
              totalPitches={data.zoneTotalPitches ?? 0}
              metric={data.zoneMetric ?? 'chase'}
            />
            <SprayChart points={data.spray ?? []} onPointActivate={open} />
            <ApproachCountLadder rows={data.countLadder ?? []} />
            <GameVsPracticeGap className="xl:col-span-2" rows={data.gamePracticeGap ?? []} />
          </>
        )}

        {family === 'pitching' && (
          <>
            <PitchShapeMap points={data.pitchShape ?? []} onPointActivate={open} />
            <CommandHeatmap
              vectors={data.command ?? []}
              totalPitches={data.commandTotalPitches ?? 0}
              onPointActivate={open}
            />
            <VelocityCommandDecay
              segments={data.decaySegments ?? []}
              outings={data.decayOutings ?? 0}
            />
            <ReleaseConsistencyPlot points={data.release ?? []} onPointActivate={open} />
            <PitchMixOutcomeBoard className="xl:col-span-2" rows={data.pitchMix ?? []} />
          </>
        )}

        {family === 'fielding' && (
          <>
            <DefensiveEventMap points={data.defensiveEvents ?? []} onPointActivate={open} />
            <CatcherWorkloadBoard points={data.catcherWorkload ?? []} />
            <BatteryMatrix className="xl:col-span-2" cells={data.battery ?? []} />
          </>
        )}

        {family === 'baserunning' && (
          <BaserunningBoard className="xl:col-span-2" rows={data.baserunning ?? []} />
        )}

        {family === 'performance' && (
          <>
            <ReadinessHeatStrip className="xl:col-span-2" rows={data.readiness ?? []} />
            <PitcherWorkloadOverlay days={data.pitcherWorkload ?? []} />
            <LiftProgressionChart
              exercise={data.liftExercise ?? 'Exercise'}
              points={data.liftProgression ?? []}
            />
          </>
        )}

        {family === 'quality' && (
          <>
            <SourceCoverageBoard cards={data.sourceCoverage ?? []} />
            <PracticeFocusOutcomeBoard rows={data.practiceFocus ?? []} />
            <ImportDiffViewer className="xl:col-span-2" rows={data.importDiff ?? []} />
          </>
        )}
      </div>
    </section>
  );
}
