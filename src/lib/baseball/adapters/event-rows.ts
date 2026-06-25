// =============================================================================
// src/lib/baseball/adapters/event-rows.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The CANONICAL EVENT-ROW shapes a concrete vendor adapter emits, one per
// event-grain table in 20260624000080_baseball_elite_stat_event_model.sql.
//
// This is the bridge the legacy flat path never had: instead of mapping 12 flat
// columns into baseball_player_stats, a concrete adapter produces typed
// pitch / batted-ball / swing rows that commit into the event tables, carrying
// data_context + trust_tier + source_id + import_run_id + external IDs exactly as
// the schema (and the V6 stat-universe + V10 visual contracts) require.
//
// PURE: no DB, no DOM, no 'use server'. The keys here are the EXACT column names
// of the destination tables (see baseball-stat-events.ts), minus the
// server-managed columns (id / team_id / created_at / source_id / import_run_id /
// player FKs) which the commit writer fills from run context + matched players.
// =============================================================================

import type { BaseballDataContext } from '@/lib/types/baseball-stat-events';

/** Which event-grain table a canonical row targets. */
export type EventGrain = 'pitch' | 'batted_ball' | 'swing';

/** Provenance + matching envelope carried by every canonical event row. */
export interface CanonicalEventEnvelope {
  /** 1-based source-file row this came from (for the diff viewer + warnings). */
  sourceRowNumber: number;
  /** The vendor's player handle, used by matchPlayers (name + optional ext id). */
  externalPlayerName: string | null;
  externalPlayerId: string | null;
  /**
   * For pitchers/batters that are the OTHER party in a pitch (e.g. TrackMan
   * carries both). Only the PRIMARY player (per grain) is matched + RLS-scoped;
   * the secondary is stored as an external name unless it also matches.
   */
  externalSecondaryName?: string | null;
  /** Stable per-event id from the vendor (dedupe key against the event table). */
  externalEventId: string | null;
  /** When the vendor measured this event, if present (ISO). */
  measuredAt: string | null;
  dataContext: BaseballDataContext;
}

/** Pitch-grain canonical row → baseball_pitch_events column subset. */
export interface CanonicalPitchRow extends CanonicalEventEnvelope {
  grain: 'pitch';
  /** Which roster player this row's PRIMARY is — pitcher for pitch events. */
  primaryRole: 'pitcher';
  fields: {
    pitch_number: number | null;
    pitch_type: string | null;
    pitch_call: string | null;
    pitch_result: string | null;
    velocity: number | null;
    spin_rate: number | null;
    spin_axis: number | null;
    spin_efficiency: number | null;
    induced_vertical_break: number | null;
    horizontal_break: number | null;
    release_height: number | null;
    release_side: number | null;
    extension: number | null;
    plate_height: number | null;
    plate_side: number | null;
    is_in_zone: boolean | null;
    is_swing: boolean | null;
    is_whiff: boolean | null;
    batter_handedness: 'L' | 'R' | 'S' | null;
  };
}

/** Batted-ball-grain canonical row → baseball_batted_ball_events column subset. */
export interface CanonicalBattedBallRow extends CanonicalEventEnvelope {
  grain: 'batted_ball';
  /** Batter is the primary for contact-quality events. */
  primaryRole: 'batter';
  fields: {
    exit_velocity: number | null;
    launch_angle: number | null;
    spray_angle: number | null;
    distance: number | null;
    hang_time: number | null;
    batted_ball_type: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | null;
    is_hard_hit: boolean | null;
    is_barrel: boolean | null;
    is_sweet_spot: boolean | null;
    result: string | null;
    pitch_type: string | null;
  };
}

/** Swing-grain canonical row → baseball_swing_events column subset. */
export interface CanonicalSwingRow extends CanonicalEventEnvelope {
  grain: 'swing';
  primaryRole: 'player';
  fields: {
    bat_speed: number | null;
    attack_angle: number | null;
    vertical_bat_angle: number | null;
    on_plane_efficiency: number | null;
    time_to_contact: number | null;
    rotational_acceleration: number | null;
    connection_score: number | null;
    early_connection: number | null;
    connection_at_impact: number | null;
    peak_hand_speed: number | null;
    power_score: number | null;
    max_barrel_speed: number | null;
    max_acceleration: number | null;
    impact_momentum: number | null;
    contact_point: string | null;
  };
}

export type CanonicalEventRow =
  | CanonicalPitchRow
  | CanonicalBattedBallRow
  | CanonicalSwingRow;

/** The DB table a grain commits into. */
export const GRAIN_TO_TABLE: Record<EventGrain, string> = {
  pitch: 'baseball_pitch_events',
  batted_ball: 'baseball_batted_ball_events',
  swing: 'baseball_swing_events',
};

/** The external-id column used as the per-grain duplicate key in each table. */
export const GRAIN_TO_EXTERNAL_ID_COLUMN: Record<EventGrain, string> = {
  pitch: 'external_pitch_id',
  batted_ball: 'external_event_id',
  swing: 'external_swing_id',
};

/** The primary-player FK column (the one RLS scopes + matchPlayers fills). */
export const GRAIN_TO_PRIMARY_FK: Record<EventGrain, string> = {
  pitch: 'pitcher_id',
  batted_ball: 'batter_id',
  swing: 'player_id',
};

// -----------------------------------------------------------------------------
// Shared, source-agnostic DERIVED-FLAG helpers (V6 elite stat universe). A vendor
// row often carries the raw measurement but not the derived classification; we
// compute the same flags every adapter relies on so "barrel"/"hard hit" mean the
// same thing regardless of source. These are intentionally conservative: a flag
// stays null when the inputs are missing (honest, never a false negative=false).
// -----------------------------------------------------------------------------

/** Hard-hit = EV >= 95 mph (the standard college/MLB threshold). */
export function deriveHardHit(exitVelocity: number | null): boolean | null {
  if (exitVelocity == null) return null;
  return exitVelocity >= 95;
}

/**
 * Barrel approximation (Statcast-style): EV >= 98 and LA in the productive
 * window that widens with EV. Conservative single-band so we never overclaim.
 */
export function deriveBarrel(
  exitVelocity: number | null,
  launchAngle: number | null,
): boolean | null {
  if (exitVelocity == null || launchAngle == null) return null;
  if (exitVelocity < 98) return false;
  // Window widens ~1deg low / ~1deg high per mph above 98, clamped to 8..50.
  const over = exitVelocity - 98;
  const low = Math.max(8, 26 - over);
  const high = Math.min(50, 30 + over);
  return launchAngle >= low && launchAngle <= high;
}

/** Sweet-spot = LA in [8, 32] (the contact-quality "sweet spot" band). */
export function deriveSweetSpot(launchAngle: number | null): boolean | null {
  if (launchAngle == null) return null;
  return launchAngle >= 8 && launchAngle <= 32;
}

/** Classify batted-ball type from launch angle when the vendor omits it. */
export function deriveBattedBallType(
  launchAngle: number | null,
): CanonicalBattedBallRow['fields']['batted_ball_type'] {
  if (launchAngle == null) return null;
  if (launchAngle < 10) return 'ground_ball';
  if (launchAngle < 25) return 'line_drive';
  if (launchAngle < 50) return 'fly_ball';
  return 'popup';
}
