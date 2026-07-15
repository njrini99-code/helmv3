// =============================================================================
// src/lib/baseball/read-models/legacy-stat-adapters.ts
//
// Shared, framework/transport-free adapter that reconciles a player's
// flat-row-equivalent stat shape from up to three sources, in precedence
// order (see docs/baseball/stats-architecture.md for the full three-layer
// model this operationalizes, and issue #379 for why it exists):
//
//   1. Box-score/season game-context data (the canonical, current layer).
//   2. The legacy flat/aggregate row, ONLY when no box-score-era data exists
//      for that player (a "legacy-fallback" — never blended into a box-score
//      row for the same player, to avoid double counting the same games).
//   3. Nothing at all ("no-data") — honest, never a fabricated zero.
//
// Practice-context fields are a permanent, explicit carve-out: the canonical
// layers have no practice-session concept yet (see the design's Open
// Questions), so the adapter passes the legacy practice fields through
// UNCHANGED and keeps them in a clearly separate `practice` sub-shape so no
// caller can accidentally blend them into a game number (CANONICAL_SPEC
// §3.3 — game/practice contexts are never merged without a labeled filter).
//
// Event-derived fields (exit velocity, pitch velocity) are null-safe: they
// are populated from an explicit event-grain input (the elite-event read
// model) when one is supplied. Exit velocity has NO legacy column at all —
// it stays null unless an event input supplies it, never fabricated. Pitch
// velocity DOES have a legitimate legacy scalar (avg_pitch_velocity /
// max_pitch_velocity on the legacy aggregate row, predating the event-grain
// model) — an explicit event-grain value still wins outright when supplied,
// but the legacy scalar is a real, non-fabricated fallback when no
// event-grain reading exists, so a team that hasn't captured pitch-velocity
// events yet doesn't regress from "shows a real number" to "shows nothing".
//
// Every returned shape carries a `sourceLayer` tag so callers (and a future
// UI source chip) can label a legacy-fallback number honestly instead of
// presenting it as equally fresh as a box-score number.
//
// This module intentionally takes already-fetched rows as plain data — it
// does not import a Supabase client and does not reference deprecated table
// names, so it is NOT itself a grandfathered consumer (see
// src/lib/baseball/stat-layer-manifest.ts): callers fetch from whichever
// layer(s) they have access to and hand the shaped rows in here.
// =============================================================================

import type { BaseballDevelopmentStage, BaseballTrend } from '@/lib/types';

/** Where a player's game-context figures ultimately came from. */
export type SourceLayer = 'box-score' | 'legacy-fallback' | 'no-data';

/**
 * The legacy flat/aggregate row shape this adapter reads from, expressed as
 * a standalone interface (not importing the full generated row type) so
 * callers with a partial/query-projected row can still use the adapter.
 * Field names intentionally mirror the legacy aggregate table's columns.
 */
export interface LegacyAggregateRow {
  player_id: string;
  total_sessions: number | null;
  practice_sessions: number | null;
  game_sessions: number | null;
  career_avg: number | null;
  career_obp: number | null;
  career_slg: number | null;
  career_ops: number | null;
  practice_avg: number | null;
  game_avg: number | null;
  pressure_gap: number | null;
  recent_trend: BaseballTrend | null;
  trend_magnitude: number | null;
  trend_velocity: number | null;
  last_5_avg: number | null;
  last_10_avg: number | null;
  season_avg: number | null;
  avg_pitch_velocity: number | null;
  max_pitch_velocity: number | null;
  development_stage: BaseballDevelopmentStage | null;
  last_calculated_at: string | null;
  updated_at: string | null;
}

/**
 * Box-score/season-era game-context row (the canonical layer) — one row per
 * player, already rolled up across their box-score-tracked games (e.g. the
 * season roll-up read from stats-center.ts's underlying source, or an
 * equivalent pre-aggregated season row).
 */
export interface BoxScoreGameContextRow {
  player_id: string;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  /** Games/sessions this row covers — the box-score-aware, honest count. */
  sessions: number | null;
  last_updated: string | null;
}

/**
 * Elite event-grain derived scalars (velocity / exit-velocity style fields).
 * Every field is null-safe: omit a field (or pass no `event` input at all)
 * when no matching event-grain row exists rather than fabricating a number
 * from an unrelated legacy scalar.
 *
 * Exception: `avgPitchVelocity`/`maxPitchVelocity` DO have a legitimate
 * legacy fallback (see {@link adaptLegacyPlayerStats}) — the legacy
 * aggregate row's own `avg_pitch_velocity`/`max_pitch_velocity` columns are a
 * real, previously-captured measurement, not a fabrication. Exit velocity has
 * no such legacy column and stays event-only.
 */
export interface EventDerivedFields {
  avgExitVelocity: number | null;
  maxExitVelocity: number | null;
  avgPitchVelocity: number | null;
  maxPitchVelocity: number | null;
}

const EMPTY_EVENT_DERIVED_FIELDS: EventDerivedFields = {
  avgExitVelocity: null,
  maxExitVelocity: null,
  avgPitchVelocity: null,
  maxPitchVelocity: null,
};

/** Game-context (avg/obp/slg/ops + honest session count) for one player. */
export interface GameContext {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  /** Box-score-aware "sessions" figure — never hides real games played. */
  sessions: number;
}

/**
 * Practice-context for one player — the permanent legacy carve-out. Passed
 * through unchanged from the legacy aggregate row; never derived from or
 * blended with game-context figures.
 */
export interface PracticeContext {
  avg: number | null;
  sessions: number;
}

/**
 * Legacy-only fields with no canonical replacement yet (trend/pressure/
 * development-stage). Passed through unchanged from the legacy row.
 */
export interface LegacyExtraFields {
  pressureGap: number | null;
  recentTrend: BaseballTrend | null;
  trendMagnitude: number | null;
  trendVelocity: number | null;
  last5Avg: number | null;
  last10Avg: number | null;
  developmentStage: BaseballDevelopmentStage | null;
}

/** The unified, flat-row-equivalent shape every legacy consumer wants. */
export interface AdaptedPlayerStats {
  playerId: string;
  /** How `game` was resolved for this player — see module doc for precedence. */
  sourceLayer: SourceLayer;
  game: GameContext;
  /** Whole-row session count (game + practice + other), an honest floor. */
  totalSessions: number;
  practice: PracticeContext;
  event: EventDerivedFields;
  legacyExtras: LegacyExtraFields;
  lastCalculatedAt: string;
  updatedAt: string;
}

/** Input to {@link adaptLegacyPlayerStats} for a single player. */
export interface AdaptLegacyPlayerStatsInput {
  playerId: string;
  /** The legacy aggregate row, or null when the player has none. */
  legacy: LegacyAggregateRow | null;
  /** The box-score/season game-context row, or null when none exists yet. */
  boxScore: BoxScoreGameContextRow | null;
  /** Elite event-grain derived fields, when available. Omit when unknown. */
  event?: Partial<EventDerivedFields> | null;
}

/**
 * Resolve one player's flat-row-equivalent stat shape per the module's
 * precedence rule:
 *
 *   - Box-score row present  -> sourceLayer 'box-score'. Game-context rate
 *     fields (avg/obp/slg/ops) come from the box-score row AS-IS — never
 *     blended field-by-field with the legacy row, so a canonical row can
 *     never be quietly diluted by a stale legacy number.
 *   - No box-score row, legacy row present -> sourceLayer 'legacy-fallback'.
 *     Game-context fields come from the legacy row so a team that hasn't
 *     re-imported through the box-score pipeline doesn't regress from
 *     "shows old numbers" to "shows nothing".
 *   - Neither present -> sourceLayer 'no-data'. Every game-context field is
 *     null/zero — never fabricated.
 *
 * Session counts (`game.sessions`, `totalSessions`) are an exception to the
 * "never blended" rule: they take the MAX of the legacy and box-score counts
 * so a canonical read can never hide games a legacy row already recorded.
 *
 * Practice-context and legacy-only trend/development fields always pass
 * through the legacy row unchanged, regardless of box-score presence — the
 * canonical layers have no practice-session concept yet (permanent carve-out,
 * see module doc). Event-derived fields are populated from the `event` input
 * when supplied; `avgPitchVelocity`/`maxPitchVelocity` additionally fall back
 * to the legacy row's own `avg_pitch_velocity`/`max_pitch_velocity` columns
 * when no event-grain reading is supplied (a legitimate, previously-captured
 * measurement — not a fabrication). Exit velocity has no legacy column at
 * all and is never backfilled from anything but the `event` input.
 */
export function adaptLegacyPlayerStats(
  input: AdaptLegacyPlayerStatsInput,
): AdaptedPlayerStats {
  const { playerId, legacy, boxScore, event } = input;
  const hasBoxScore = boxScore != null;
  const sourceLayer: SourceLayer = hasBoxScore ? 'box-score' : legacy ? 'legacy-fallback' : 'no-data';

  const gameSessions = Math.max(legacy?.game_sessions ?? 0, boxScore?.sessions ?? 0);
  const totalSessions = Math.max(legacy?.total_sessions ?? 0, boxScore?.sessions ?? 0);

  const game: GameContext = hasBoxScore
    ? {
        avg: boxScore.avg,
        obp: boxScore.obp,
        slg: boxScore.slg,
        ops: boxScore.ops,
        sessions: gameSessions,
      }
    : {
        avg: legacy?.career_avg ?? null,
        obp: legacy?.career_obp ?? null,
        slg: legacy?.career_slg ?? null,
        ops: legacy?.career_ops ?? null,
        sessions: gameSessions,
      };

  const lastCalculatedAt =
    (hasBoxScore ? boxScore.last_updated : null) ?? legacy?.last_calculated_at ?? new Date().toISOString();
  const updatedAt = (hasBoxScore ? boxScore.last_updated : null) ?? legacy?.updated_at ?? lastCalculatedAt;

  return {
    playerId,
    sourceLayer,
    game,
    totalSessions,
    practice: {
      avg: legacy?.practice_avg ?? null,
      sessions: legacy?.practice_sessions ?? 0,
    },
    event: {
      // Exit velocity: event-only, null-safe — no legacy column exists at all.
      avgExitVelocity: event?.avgExitVelocity ?? EMPTY_EVENT_DERIVED_FIELDS.avgExitVelocity,
      maxExitVelocity: event?.maxExitVelocity ?? EMPTY_EVENT_DERIVED_FIELDS.maxExitVelocity,
      // Pitch velocity: an explicit event-grain reading wins outright when
      // supplied; otherwise falls back to the legacy aggregate row's own
      // avg_pitch_velocity/max_pitch_velocity columns — a real,
      // previously-captured measurement, not a fabrication (#379 residual —
      // this adapter previously never read these two legacy columns at all).
      avgPitchVelocity: event?.avgPitchVelocity ?? legacy?.avg_pitch_velocity ?? EMPTY_EVENT_DERIVED_FIELDS.avgPitchVelocity,
      maxPitchVelocity: event?.maxPitchVelocity ?? legacy?.max_pitch_velocity ?? EMPTY_EVENT_DERIVED_FIELDS.maxPitchVelocity,
    },
    legacyExtras: {
      pressureGap: legacy?.pressure_gap ?? null,
      recentTrend: legacy?.recent_trend ?? null,
      trendMagnitude: legacy?.trend_magnitude ?? null,
      trendVelocity: legacy?.trend_velocity ?? null,
      last5Avg: legacy?.last_5_avg ?? null,
      last10Avg: legacy?.last_10_avg ?? null,
      developmentStage: legacy?.development_stage ?? null,
    },
    lastCalculatedAt,
    updatedAt,
  };
}

/** Input to {@link adaptLegacyStatsMap} for a whole roster/team. */
export interface AdaptLegacyStatsMapInput {
  /** Legacy aggregate rows keyed by player_id. */
  legacyAggregates: Record<string, LegacyAggregateRow>;
  /** Box-score/season game-context rows, one per player who has any. */
  boxScoreRows: BoxScoreGameContextRow[];
  /** Elite event-grain derived fields, keyed by player_id. Optional. */
  eventDerivedByPlayer?: Record<string, Partial<EventDerivedFields>>;
}

/**
 * Batch form of {@link adaptLegacyPlayerStats} — resolves every player who
 * appears in EITHER the legacy aggregates map OR the box-score rows (a
 * player with only a box-score row and no legacy history gets a fresh
 * 'box-score' entry; a player with only a legacy row gets a 'legacy-fallback'
 * entry). Returns a NEW map keyed by player_id; never mutates its inputs.
 */
export function adaptLegacyStatsMap(
  input: AdaptLegacyStatsMapInput,
): Record<string, AdaptedPlayerStats> {
  const { legacyAggregates, boxScoreRows, eventDerivedByPlayer } = input;

  const boxScoreByPlayer = new Map<string, BoxScoreGameContextRow>();
  for (const row of boxScoreRows) {
    boxScoreByPlayer.set(row.player_id, row);
  }

  const playerIds = new Set<string>([
    ...Object.keys(legacyAggregates),
    ...boxScoreByPlayer.keys(),
  ]);

  const result: Record<string, AdaptedPlayerStats> = {};
  for (const playerId of playerIds) {
    result[playerId] = adaptLegacyPlayerStats({
      playerId,
      legacy: legacyAggregates[playerId] ?? null,
      boxScore: boxScoreByPlayer.get(playerId) ?? null,
      event: eventDerivedByPlayer?.[playerId] ?? null,
    });
  }

  return result;
}
