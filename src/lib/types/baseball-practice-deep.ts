// =============================================================================
// src/lib/types/baseball-practice-deep.ts
//
// Packet: practice-intel
//
// HAND-WRITTEN Row/Insert types for the practice DEEPENING surface created by
// supabase/migrations/20260624000200_baseball_practice_deepening.sql:
//   * EXTRA columns added to baseball_practice_blocks (description, station_type,
//     group_label, equipment, measurement_target, is_measured, source_reason,
//     source_insight_id, visibility)
//   * baseball_practice_scrimmages
//   * baseball_practice_lineup_slots
//
// We cannot run `db:types` regen in this environment (no live apply), so these
// mirror the migration DDL exactly. They EXTEND — never edit — the Wave-8
// baseball-practice.ts types and the Wave-1 baseball-extended.ts barrel.
// =============================================================================

import type { BaseballPracticeBlockRow } from './baseball-practice';

// ---- Shared vocab (mirror the CHECK constraints) ----------------------------

/** baseball_practice_blocks.visibility (V2 role-permission matrix). */
export type BaseballBlockVisibility = 'staff_only' | 'player_visible' | 'restricted';

/** baseball_practice_scrimmages.mode (V7 Scrimmage Modes). */
export type BaseballScrimmageMode =
  | 'intrasquad'
  | 'situational'
  | 'pitcher_live_ab'
  | 'defense_only'
  | 'bullpen_live';

/** baseball_practice_scrimmages.status. */
export type BaseballScrimmageStatus = 'draft' | 'published' | 'completed';

/** Intrasquad squad split. */
export type BaseballScrimmageSide = 'blue' | 'white';

/**
 * V7 labeled defensive positions. NOTE: these are BASEBALL positions only —
 * never golf labels. `bench` and `bullpen` are holding slots, not field spots.
 */
export type BaseballDefensivePosition =
  | 'P'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF'
  | 'DH'
  | 'bench'
  | 'bullpen';

/** The nine field positions (excludes DH / bench / bullpen) used by conflict checks. */
export const FIELD_POSITIONS: readonly BaseballDefensivePosition[] = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF',
] as const;

// ---- baseball_practice_blocks (deepened) ------------------------------------

/**
 * The columns the 0200 migration adds to baseball_practice_blocks. Kept separate
 * so the Wave-8 BaseballPracticeBlockRow stays the canonical base; this is the
 * superset the deepened planner reads/writes.
 */
export interface BaseballPracticeBlockDeepFields {
  description: string | null;
  station_type: string | null;
  group_label: string | null;
  equipment: string | null;
  measurement_target: string | null;
  is_measured: boolean;
  source_reason: string | null;
  source_insight_id: string | null;
  visibility: BaseballBlockVisibility;
}

/** Full deepened block row (base Wave-8 fields + 0200 columns). */
export type BaseballPracticeBlockDeepRow = BaseballPracticeBlockRow &
  BaseballPracticeBlockDeepFields;

// ---- baseball_practice_scrimmages -------------------------------------------

export interface BaseballScrimmageRow {
  id: string;
  team_id: string;
  practice_id: string | null;
  block_id: string | null;
  title: string;
  mode: BaseballScrimmageMode;
  status: BaseballScrimmageStatus;
  notes: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  // --- Recap / scoring (migration 0210). All optional + back-compatible.
  //     Development-side outing result; never the official record. ---
  /** Runs for Team Blue (intrasquad) or the offense tally. NULL = unscored. */
  blue_score: number | null;
  /** Runs for Team White (intrasquad) or the defense tally. NULL = unscored. */
  white_score: number | null;
  /** Innings actually played (development context). */
  innings_played: number | null;
  /** Human-entered note on the outing (NOT a generated summary). */
  result_note: string | null;
  /** When the scrimmage was scored / closed out (set with status='completed'). */
  completed_at: string | null;
}

export interface BaseballScrimmageInsert {
  id?: string;
  team_id: string;
  practice_id?: string | null;
  block_id?: string | null;
  title: string;
  mode?: BaseballScrimmageMode;
  status?: BaseballScrimmageStatus;
  notes?: string | null;
  published_at?: string | null;
}

// ---- baseball_practice_lineup_slots -----------------------------------------

export interface BaseballLineupSlotRow {
  id: string;
  team_id: string;
  scrimmage_id: string;
  player_id: string;
  side: BaseballScrimmageSide | null;
  defensive_position: BaseballDefensivePosition | null;
  batting_order: number | null;
  inning_start: number | null;
  inning_end: number | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BaseballLineupSlotInsert {
  id?: string;
  team_id: string;
  scrimmage_id: string;
  player_id: string;
  side?: BaseballScrimmageSide | null;
  defensive_position?: BaseballDefensivePosition | null;
  batting_order?: number | null;
  inning_start?: number | null;
  inning_end?: number | null;
  note?: string | null;
}

// ---- Composite read shapes used by the deepened UI --------------------------

/** A lineup slot enriched with the player's display name + handedness flags. */
export interface BaseballLineupSlotWithPlayer extends BaseballLineupSlotRow {
  player_name: string;
  /** 'L' | 'R' | 'S' | null — batting handedness (rename of golf handedness). */
  bats: string | null;
  /** 'L' | 'R' | null — throwing hand. */
  throws: string | null;
  /** The player's listed primary position (eligibility hint). */
  primary_position: string | null;
}

/** A scrimmage with its assigned slots (builder read). */
export interface BaseballScrimmageWithDetail extends BaseballScrimmageRow {
  slots: BaseballLineupSlotWithPlayer[];
}

// ---- Practice Intelligence (V5 Intelligence Rail / Board) -------------------

/**
 * A converted-or-convertible signal shown on the Practice Intelligence Board.
 * Built from a baseball_coach_insights row. Honesty: confidence + visibility +
 * generated_at travel with it; an unconverted signal is "new", a converted one
 * carries the block id it produced.
 */
export interface PracticeSignal {
  insightId: string;
  title: string;
  /** The body/summary of the insight (V2 AI contract summary). */
  summary: string | null;
  /** insight_type bucket -> a suggested station_type for the generated block. */
  insightType: string;
  /** Normalized [0,1] confidence; null when the engine did not record one. */
  confidence: number | null;
  /** V2 visibility — staff_only signals never seed a player_visible block. */
  visibility: BaseballBlockVisibility;
  /** ISO timestamp the signal was generated (for staleness display). */
  generatedAt: string | null;
  /** Subject player when the signal is player-specific. */
  playerId: string | null;
  playerName: string | null;
  /** Disposition: 'new' | 'converted' | 'dismissed'. */
  disposition: 'new' | 'converted' | 'dismissed';
  /** When converted, the block id the signal produced (source -> action). */
  convertedBlockId: string | null;
}

/**
 * A suggested practice block the Intelligence Board proposes from a signal. The
 * coach edits before it lands on the time rail (V5: "The coach edits before
 * publish"). NEVER auto-published.
 */
export interface SuggestedPracticeBlock {
  /** The signal this suggestion derives from. */
  sourceInsightId: string;
  headline: string;
  description: string | null;
  stationType: string;
  groupLabel: string | null;
  /** Default duration on the 5-min rail. */
  durationMin: number;
  measurementTarget: string | null;
  /** The source reason carried onto the block (V5 outline "source reason"). */
  sourceReason: string;
  /** Inherited from the signal — a staff_only signal yields a staff_only block. */
  visibility: BaseballBlockVisibility;
}
