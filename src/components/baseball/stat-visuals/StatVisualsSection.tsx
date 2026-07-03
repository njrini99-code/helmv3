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
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Json } from '@/lib/types';
import {
  IconStar,
  IconStarFilled,
  IconBookmark,
  IconChartBar,
  IconArrowRight,
} from '@/components/icons';
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

/**
 * Whether a family has ANY source-backed points to draw. Drives the collapse
 * from a wall of identical "no captured events" frames (which reads as broken on
 * a seeded team) into ONE honest, premium family empty state. As soon as a read
 * model feeds a family real inputs, its charts render in full.
 */
function familyHasData(family: Family, data: StatVisualsData): boolean {
  const some = (...arrs: (unknown[] | undefined)[]) =>
    arrs.some((a) => Array.isArray(a) && a.length > 0);
  switch (family) {
    case 'hitting':
      return some(data.evLa, data.zoneCells, data.spray, data.countLadder, data.gamePracticeGap);
    case 'pitching':
      return some(data.pitchShape, data.command, data.decaySegments, data.pitchMix, data.release);
    case 'fielding':
      return some(data.defensiveEvents, data.catcherWorkload, data.battery);
    case 'baserunning':
      return some(data.baserunning);
    case 'performance':
      return some(data.readiness, data.liftProgression, data.pitcherWorkload);
    case 'quality':
      return some(data.sourceCoverage, data.practiceFocus, data.importDiff);
    case 'dna':
      return some(data.playerDna);
    default:
      return false;
  }
}

/**
 * One honest, on-brand empty surface for a whole family — a single glass card
 * that teaches what unlocks the charts, instead of a dead grid of empty frames.
 */
function FamilyEmptyState({ label, scope }: { label: string; scope: Scope }) {
  return (
    <div className="xl:col-span-2">
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-warm-200/70 bg-cream-100/70 px-6 py-14 text-center shadow-glass backdrop-blur-glass">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-600">
          <IconChartBar size={22} aria-hidden />
        </span>
        <div className="max-w-md space-y-1.5">
          <h3 className="text-lg font-semibold tracking-tight text-warm-900">
            {label} charts light up with captured events
          </h3>
          <p className="text-sm leading-relaxed text-warm-500">
            {scope === 'player'
              ? 'Pitch-by-pitch, batted-ball, and workload events for this player render here as they’re captured from a connected source or uploaded box score.'
              : 'These source-backed visuals draw from pitch-by-pitch, batted-ball, and workload events. Import a box score or connect a source and they populate automatically.'}
          </p>
        </div>
        {scope === 'team' && (
          <Link
            href="/baseball/dashboard/import"
            className="group mt-1 inline-flex items-center gap-1.5 rounded-full border border-warm-200 glass-standard px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
          >
            Import stats
            <IconArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        )}
      </div>
    </div>
  );
}

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

  const activeFamilyLabel =
    families.find((f) => f.value === family)?.label ?? 'These';
  const activeFamilyHasData = familyHasData(family, data);

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
          <p className="mt-0.5 max-w-xl text-sm text-warm-500">
            Every point traces back to a captured event — click a datum to open
            its source.
          </p>
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
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-[color,background-color,border-color,box-shadow] duration-200 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
                    isPinned
                      ? 'border-primary-600/40 bg-primary-50 text-primary-700 shadow-sm'
                      : 'border-warm-200 bg-cream-50 text-warm-600 hover:bg-warm-100 hover:text-warm-800',
                  )}
                >
                  {isPinned ? (
                    <IconStarFilled size={13} className="text-primary-600" aria-hidden />
                  ) : (
                    <IconStar size={13} aria-hidden />
                  )}
                  {isPinned ? 'Pinned' : 'Pin'}
                </button>
              )}
              {/* eslint-disable-next-line helm/no-raw-button */}
              <button
                type="button"
                onClick={handleSave}
                aria-label="Save this chart view"
                className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-cream-50 px-3 py-1.5 text-xs font-medium text-warm-700 transition-[color,background-color,box-shadow] duration-200 active:translate-y-px hover:bg-warm-100 hover:text-warm-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
              >
                <IconBookmark size={13} aria-hidden />
                Save view
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {!activeFamilyHasData && (
          <FamilyEmptyState label={activeFamilyLabel} scope={scope} />
        )}

        {activeFamilyHasData && family === 'dna' && (
          <PlayerDnaPanel
            className="xl:col-span-2"
            dimensions={data.playerDna ?? []}
            roleLabel={data.playerDnaRole}
          />
        )}

        {activeFamilyHasData && family === 'hitting' && (
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

        {activeFamilyHasData && family === 'pitching' && (
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

        {activeFamilyHasData && family === 'fielding' && (
          <>
            <DefensiveEventMap points={data.defensiveEvents ?? []} onPointActivate={open} />
            <CatcherWorkloadBoard points={data.catcherWorkload ?? []} />
            <BatteryMatrix className="xl:col-span-2" cells={data.battery ?? []} />
          </>
        )}

        {activeFamilyHasData && family === 'baserunning' && (
          <BaserunningBoard className="xl:col-span-2" rows={data.baserunning ?? []} />
        )}

        {activeFamilyHasData && family === 'performance' && (
          <>
            <ReadinessHeatStrip className="xl:col-span-2" rows={data.readiness ?? []} />
            <PitcherWorkloadOverlay days={data.pitcherWorkload ?? []} />
            <LiftProgressionChart
              exercise={data.liftExercise ?? 'Exercise'}
              points={data.liftProgression ?? []}
            />
          </>
        )}

        {activeFamilyHasData && family === 'quality' && (
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
