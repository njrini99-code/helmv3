// =============================================================================
// src/lib/types/baseball-stat-visuals.ts
//
// Hand-written TypeScript types for the V10 baseball STAT-VISUAL chart library
// (src/components/baseball/stat-visuals/*). These are the render-side input
// contracts each chart consumes — they are deliberately decoupled from the raw
// event-row tables (baseball-stat-events.ts) so a read model can shape a small,
// already-aggregated payload for a chart without leaking the whole event row.
//
// WHY THIS FILE EXISTS (per packet guardrails: "hand-write TS types for new
// tables into your own src/lib/types/ file"): the stat-visual fan-out introduces
// new chart-input shapes + one additive table (baseball_stat_visual_views, see
// supabase/migrations/...). The generated database.ts does not (yet) reflect the
// additive migration, so this file hand-mirrors it AND defines the pure chart
// input contracts. Once the migration is applied + database.ts regenerated, the
// table row type collapses to a thin alias.
//
// OWNERSHIP: this file + a one-line re-export in src/lib/types/index.ts (NOT the
// generated database.ts). No golf labels. Cream/green look is enforced in the
// components, not here (pure types, no styling).
// =============================================================================

import type {
  BaseballDataContext,
  BaseballMetricConfidence,
  BaseballBattedBallType,
} from './baseball-stat-events';
import type { Json } from './baseball-extended';
import type {
  SourceTrust,
  SourceProvenance,
} from '@/components/baseball/source-trust/source-trust-types';

// -----------------------------------------------------------------------------
// Shared per-point provenance the charts thread into the frame + drawer.
// -----------------------------------------------------------------------------

/**
 * The provenance every chart datum carries so a chart-click can open the source
 * drawer (V10 §"Every chart point should open the source drawer when feasible").
 * Both fields are optional: a chart may have only a chart-level source chip.
 */
export interface ChartPointSource {
  trust?: SourceTrust;
  provenance?: SourceProvenance;
}

/** A click handler the charts call when a datum (or its row) is activated. */
export type ChartPointActivate = (
  point: { id: string; source?: ChartPointSource },
) => void;

// -----------------------------------------------------------------------------
// Hitting — EV/LA contact matrix
// -----------------------------------------------------------------------------

/** Outcome family used to color contact-quality points (not color-only — also
 *  surfaced as a labeled legend + in the table fallback). */
export type BattedBallOutcome =
  | 'hit'
  | 'out'
  | 'hard_out'
  | 'extra_base'
  | 'soft_contact'
  | 'unknown';

export interface EvLaPoint {
  id: string;
  /** Exit velocity (mph). null points are excluded — never plotted as 0. */
  exitVelocity: number | null;
  /** Launch angle (deg). null points are excluded — never plotted as 0. */
  launchAngle: number | null;
  outcome: BattedBallOutcome;
  battedBallType: BaseballBattedBallType | null;
  context: BaseballDataContext;
  pitchType: string | null;
  countState: string | null;
  date: string | null;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Hitting / Pitching — strike-zone heatmaps (chase / damage / command)
// -----------------------------------------------------------------------------

/** One of the 13 standard buckets: 9 in-zone (3x3) + 4 chase quadrants. */
export interface ZoneCell {
  /** 1–9 for in-zone (row-major top-left=1), 'chase_*' for outer quadrants. */
  zoneId: string;
  /** count of pitches seen in this cell (drives the heat). */
  pitches: number;
  /** rate in [0,1] for the active metric (chase / whiff / damage / take). */
  rate: number | null;
  /** secondary count for the table fallback (e.g. swings, hard contact). */
  secondary?: number;
}

export type ZoneMetric =
  | 'chase'
  | 'whiff'
  | 'damage'
  | 'take_correct'
  | 'two_strike_chase'
  | 'command';

// -----------------------------------------------------------------------------
// Hitting — spray chart
// -----------------------------------------------------------------------------

export interface SprayPoint {
  id: string;
  /** spray angle in deg: -45 = pull-LHB foul line ... +45. */
  sprayAngle: number | null;
  /** distance (ft) used for radial placement; null falls to a banded ring. */
  distance: number | null;
  exitVelocity: number | null;
  battedBallType: BaseballBattedBallType | null;
  outcome: BattedBallOutcome;
  context: BaseballDataContext;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Hitting — approach count ladder
// -----------------------------------------------------------------------------

export type CountBucket =
  | 'first_pitch'
  | 'hitter_ahead'
  | 'even'
  | 'pitcher_ahead'
  | 'two_strike';

export interface CountLadderRow {
  bucket: CountBucket;
  pitches: number;
  swingRate: number | null;
  chaseRate: number | null;
  whiffRate: number | null;
  hardHitRate: number | null;
  /** short outcome summary, e.g. ".310 / 2 K". */
  outcomeLabel: string | null;
}

// -----------------------------------------------------------------------------
// Game-vs-practice contact gap (paired bullets)
// -----------------------------------------------------------------------------

export interface PairedMetricRow {
  metricKey: string;
  label: string;
  /** higher-is-better drives the delta tone; some metrics invert (chase/K). */
  higherIsBetter: boolean;
  /** the "translation target" (official game) value. */
  gameValue: number | null;
  gameSample: number;
  /** the practice/cage value. */
  practiceValue: number | null;
  practiceSample: number;
  /** display unit suffix, e.g. "mph", "%". */
  unit?: string;
}

// -----------------------------------------------------------------------------
// Pitching — pitch-shape map (HB/IVB)
// -----------------------------------------------------------------------------

export interface PitchShapePoint {
  id: string;
  pitchType: string;
  horizontalBreak: number | null;
  inducedVerticalBreak: number | null;
  velocity: number | null;
  spinRate: number | null;
  context: BaseballDataContext;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Pitching — command heatmap miss vectors
// -----------------------------------------------------------------------------

export interface MissVector {
  id: string;
  /** normalized [-1,1] plate side of the actual location. */
  actualX: number | null;
  /** normalized [-1,1] plate height of the actual location. */
  actualY: number | null;
  /** normalized intended target, when known (drives the vector). */
  targetX: number | null;
  targetY: number | null;
  pitchType: string | null;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Pitching — velocity / command decay trend
// -----------------------------------------------------------------------------

export interface DecayPoint {
  /** pitch-count segment label, e.g. "1-15". */
  segment: string;
  pitches: number;
  velocity: number | null;
  strikeRate: number | null;
  missRate: number | null;
  /** inning band for the background, when known. */
  inning?: number | null;
}

// -----------------------------------------------------------------------------
// Pitching — pitch-mix & outcome board
// -----------------------------------------------------------------------------

export interface PitchMixRow {
  pitchType: string;
  usagePct: number | null;
  strikeRate: number | null;
  whiffRate: number | null;
  cswRate: number | null;
  chaseRate: number | null;
  hardHitRate: number | null;
  pitches: number;
}

// -----------------------------------------------------------------------------
// Pitching — release consistency
// -----------------------------------------------------------------------------

export interface ReleasePoint {
  id: string;
  pitchType: string;
  releaseSide: number | null;
  releaseHeight: number | null;
  extension: number | null;
  date: string | null;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Catching — workload + battery matrix
// -----------------------------------------------------------------------------

export interface CatcherWorkloadPoint {
  date: string;
  inningsCaught: number | null;
  bullpensCaught: number | null;
  throws: number | null;
  readiness: number | null;
}

export interface BatteryCell {
  pitcherId: string;
  pitcherName: string;
  catcherId: string;
  catcherName: string;
  innings: number;
  strikeRate: number | null;
  /** honest note when sample is too thin to claim impact. */
  thinSample: boolean;
}

// -----------------------------------------------------------------------------
// Defense — event map
// -----------------------------------------------------------------------------

export interface DefensiveEventPoint {
  id: string;
  /** normalized field coords [0,1] (home = 0.5,1 bottom-center). */
  fieldX: number | null;
  fieldY: number | null;
  position: string | null;
  result: 'out' | 'hit' | 'error' | 'unknown';
  context: BaseballDataContext;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Baserunning — speed & decision board
// -----------------------------------------------------------------------------

export interface BaserunningRow {
  playerId: string;
  playerName: string;
  sixtyTime: number | null;
  homeToFirst: number | null;
  firstToThird: number | null;
  stolenBases: number | null;
  caughtStealing: number | null;
  baserunningOuts: number | null;
}

// -----------------------------------------------------------------------------
// Arm Board — throw distance vs velocity scatter, colored by position group
// -----------------------------------------------------------------------------

export interface ArmBoardPoint {
  id: string;
  /** Player display name. */
  playerName: string;
  /** Distance of the throw in feet. null → excluded (never plotted as 0). */
  throwDistance: number | null;
  /** Peak velocity of the throw in mph. null → excluded. */
  throwVelocity: number | null;
  /** Broad position group for color coding (not color-only — also in legend/table). */
  positionGroup: 'infield' | 'outfield' | 'catcher' | 'pitcher' | 'other';
  /** Session date for x-axis / tooltip context. */
  date: string | null;
  /** Raw context label (bullpen, game, combine, etc.). */
  context: import('./baseball-stat-events').BaseballDataContext;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Speed & Decision Board — sprint splits + decision efficiency per player
// -----------------------------------------------------------------------------

export interface SpeedDecisionRow {
  playerId: string;
  playerName: string;
  /** 60-yard dash in seconds — the canonical speed benchmark. null = not yet captured. */
  sixtyTime: number | null;
  /** Home-to-first in seconds. null = not captured. */
  homeToFirst: number | null;
  /** First-to-third in seconds. null = not captured. */
  firstToThird: number | null;
  /**
   * Decision efficiency — ratio of "correct" aggressive decisions (advancing /
   * stealing when successful) to total aggressive decisions; range [0,1].
   * null = fewer than 3 decisions (never fabricated as 0%).
   */
  decisionEfficiency: number | null;
  /** Raw counts for honest display: correct aggressive plays, total attempted. */
  correctDecisions: number | null;
  totalDecisions: number | null;
  /** SB/CS for context. */
  stolenBases: number | null;
  caughtStealing: number | null;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Readiness — heat strip
// -----------------------------------------------------------------------------

export type ReadinessCellStatus =
  | 'ready'
  | 'limited'
  | 'high_soreness'
  | 'missing';

export interface ReadinessRow {
  playerId: string;
  playerName: string;
  positionGroup: string | null;
  /** one cell per day in the window; ordered oldest -> newest. */
  cells: Array<{ date: string; status: ReadinessCellStatus; score: number | null }>;
}

// -----------------------------------------------------------------------------
// Lift progression
// -----------------------------------------------------------------------------

export interface LiftProgressionPoint {
  date: string;
  actualLoad: number | null;
  targetLoad: number | null;
  reps: number | null;
  rpe: number | null;
}

// -----------------------------------------------------------------------------
// Pitcher workload overlay (stacked bars + readiness line)
// -----------------------------------------------------------------------------

export interface PitcherWorkloadDay {
  date: string;
  gamePitches: number;
  bullpenPitches: number;
  highIntentThrows: number;
  readiness: number | null;
  velocity: number | null;
}

// -----------------------------------------------------------------------------
// Practice-focus -> outcome board
// -----------------------------------------------------------------------------

export type EffectivenessStatus =
  | 'too_early'
  | 'not_enough_sample'
  | 'correlated_not_proven'
  | 'moved_up'
  | 'moved_down'
  | 'no_change';

export interface PracticeFocusRow {
  id: string;
  focus: string;
  players: number;
  date: string;
  targetMetric: string;
  status: EffectivenessStatus;
  /** baseline -> latest, when a data window exists. */
  baseline: number | null;
  latest: number | null;
  confidence: BaseballMetricConfidence;
  nextAction: string | null;
  source?: ChartPointSource;
}

// -----------------------------------------------------------------------------
// Import diff viewer
// -----------------------------------------------------------------------------

export type ImportDiffKind = 'added' | 'changed' | 'duplicate' | 'warning';

export interface ImportDiffRow {
  id: string;
  kind: ImportDiffKind;
  player: string | null;
  field: string;
  before: string | null;
  after: string | null;
  note: string | null;
}

// -----------------------------------------------------------------------------
// Source coverage board
// -----------------------------------------------------------------------------

export type SourceFreshness = 'fresh' | 'stale' | 'missing';

export interface SourceCoverageCard {
  sourceId: string;
  provider: string;
  freshness: SourceFreshness;
  lastReceived: string | null;
  lastReviewed: string | null;
  lastSuccess: string | null;
  pendingWarnings: number;
  mappedPlayers: number;
  confidence: BaseballMetricConfidence;
}

// -----------------------------------------------------------------------------
// Player DNA panel (radar + grouped-bar fallback)
// -----------------------------------------------------------------------------

export interface PlayerDnaDimension {
  key: string;
  label: string;
  /** normalized [0,1] for the radar; null renders a gap (never a fake 0). */
  value: number | null;
  /** raw display value for the bar fallback + tooltip, e.g. "92 mph". */
  rawLabel: string | null;
  sample: number;
  confidence: BaseballMetricConfidence;
}

// -----------------------------------------------------------------------------
// baseball_stat_visual_views  (ADDITIVE — persists a coach's saved chart filter
// state + which charts they pinned to a player profile. Mirrors the
// supabase/migrations/20260624000090_baseball_stat_visual_views.sql migration.)
// -----------------------------------------------------------------------------

export interface BaseballStatVisualView {
  id: string;
  team_id: string;
  /** the owning coach (baseball_coaches.id); views are per-coach, not global. */
  created_by_coach_id: string | null;
  /**
   * stable chart key, e.g. 'family:hitting', 'ev_la_matrix'. Stored in the
   * deployed table's `view_name` column and aliased back to `visual_key` by the
   * getStatVisualViews read so the gallery contract stays stable.
   */
  visual_key: string;
  /** optional player this saved view is scoped to. */
  player_id: string | null;
  /**
   * serialized filter/tab state (context filter, pitch-type tab, window).
   * Stored in the deployed table's `config_json` column, aliased to `view_state`.
   */
  view_state: Json;
  /** whether the chart is pinned to the coach's snapshot. */
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}
