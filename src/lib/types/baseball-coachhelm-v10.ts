// =============================================================================
// baseball-coachhelm-v10.ts
//
// Hand-aligned TypeScript types for the V10 CoachHelm baseball engine columns
// added by:
//   supabase/migrations/20260624000210_baseball_coachhelm_v10_ranking_and_outcome_ledger.sql
//
// WHY THIS FILE EXISTS
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT reflect freshly-written-but-not-yet-applied migrations (we cannot
//   db:types regen — no live apply; prod GolfHelm shares the DB). This file
//   hand-mirrors the EXACT columns the V10 migration adds, so the engine write
//   layer + read paths compile against the new shape today.
//
//   Column names/types match the SQL byte-for-byte (text→string, numeric→number,
//   integer→number, timestamptz→string ISO, NULLable→`| null`).
//
// OWNERSHIP: part of the Wave-10 coachhelm/baseball ownership set. The single
//   re-export wiring into src/lib/types/index.ts is left to the integration
//   agent (we do NOT edit index.ts here).
// =============================================================================

/**
 * Improvement-signed verdict the outcome ledger records, mirroring the engine's
 * honest effectiveness language. Never overclaims: a thin window is
 * 'too_early'/'insufficient_sample', not a false 'improved'.
 */
export type BaseballActionOutcomeVerdict =
  | 'improved'
  | 'no_change'
  | 'regressed'
  | 'too_early'
  | 'insufficient_sample';

/**
 * Columns the V10 migration ADDS to baseball_coach_insights (ranking). Compose
 * with the base BaseballCoachInsight + the attribution columns for the full row.
 */
export interface BaseballCoachInsightV10RankingColumns {
  /** integer NULL — multi-factor rank score (higher = more attention-worthy). */
  rank_score: number | null;
  /** timestamptz NULL — when the rank was last computed. */
  ranked_at: string | null;
}

/**
 * Outcome-attribution columns the V10 migration ADDS to baseball_actions — the
 * source → signal → action → did-it-move ledger. Every field nullable: an action
 * with no measurable target metric, or one not yet measured, leaves them null.
 */
export interface BaseballActionOutcomeColumns {
  /** text NULL — canonical metric the action targeted (e.g. 'two_strike_chase_pct'). */
  outcome_metric: string | null;
  /** numeric NULL — metric value at action-creation (the comparison baseline). */
  outcome_baseline_value: number | null;
  /** numeric NULL — later observed metric value (filled by the outcome sweep). */
  outcome_observed_value: number | null;
  /** integer NULL — observations the observed value rests on. */
  outcome_sample_n: number | null;
  /**
   * numeric NULL — IMPROVEMENT-SIGNED movement: (observed − baseline) ×
   * registry improvement sign. Positive = right way, negative = wrong way, NULL
   * = unmeasured or a neutral_threshold metric (sign 0). NEVER inferred from the
   * raw delta — the registry resolves the sign.
   */
  outcome_movement: number | null;
  /** text NULL — honest verdict tier (see {@link BaseballActionOutcomeVerdict}). */
  outcome_verdict: BaseballActionOutcomeVerdict | null;
}

/** Insert shape: every V10 column is optional (nullable / engine-filled). */
export type BaseballCoachInsightV10RankingInsert =
  Partial<BaseballCoachInsightV10RankingColumns>;
export type BaseballActionOutcomeInsert = Partial<BaseballActionOutcomeColumns>;

/**
 * MATURITY / repeat-validation counters the migration
 * 20260624001300_baseball_coachhelm_insight_maturity_counters ADDS to
 * baseball_coach_insights. They let the engine recognize a signal that has
 * re-fired across runs and promote lifecycle_state -> 'matured' while still
 * active (the spec's "repeated trend (matured)" PROMOTE term). Hand-mirrored
 * because the generated db types lag the unapplied migration.
 */
export interface BaseballCoachInsightMaturityColumns {
  /**
   * integer (DEFAULT 1) — how many engine runs have re-emitted this dedupe_key.
   * 1 on first insert, incremented on every subsequent re-fire of the SAME
   * (team_id, dedupe_key). Drives the >= 3 maturity promotion.
   */
  observation_count: number;
  /**
   * timestamptz NULL — when the signal was FIRST detected. Stable across
   * re-fires (set once on first insert, never overwritten). The "how long has
   * this persisted" clock; an old first_detected_at also promotes to matured.
   */
  first_detected_at: string | null;
  /** timestamptz NULL — the most recent run that re-emitted this signal. */
  last_seen_at: string | null;
}

/** Insert shape for the maturity counters (engine-filled). */
export type BaseballCoachInsightMaturityInsert =
  Partial<BaseballCoachInsightMaturityColumns>;
