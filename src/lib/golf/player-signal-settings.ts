/**
 * ============================================================================
 * Per-player resolution of the coach's window / sample-size controls
 * ----------------------------------------------------------------------------
 * Three numbers that used to be hard-coded module constants are now columns on
 * `golf_coach_philosophy` (migrations 20260725090000 / 20260725140000):
 *
 *   minHolePlaysForRanking    → worst/best-hole ranking floor
 *   patternLookbackDays       → v2 pattern-mining window
 *   statsBenchmarkWindowDays  → the Stats page "last N vs previous N" split
 *   minRoundsForSignal        → how many completed rounds before CoachHelm speaks
 *
 * The settings belong to a COACH; the surfaces that consume them are keyed by
 * PLAYER. This module owns that one hop — player → active team → organization →
 * coach → philosophy — so no consumer has to re-derive it, and so the fallback
 * behaviour is identical everywhere.
 *
 * TWO NON-NEGOTIABLES.
 *
 * 1. It never throws and never blocks. Every failure path (no membership, no
 *    coach, transient DB error, migration not yet applied) returns
 *    `SIGNAL_SETTINGS_FALLBACK`, whose values ARE the constants these settings
 *    replaced. A stats page must not go blank because a config read failed.
 *
 * 2. It reads through the admin client. The philosophy row belongs to the
 *    coach, so a player's own session cannot see it under RLS — and a player's
 *    Stats page needs the same window their coach configured. The read is
 *    scoped to exactly these four config columns; nothing player-identifying
 *    or cross-tenant crosses this boundary.
 *
 * `cache()` dedupes within a single request: the Stats bundle fans out to
 * `getTrendAnalysis` and `getWorstHoleAnalysis` in parallel and both need this,
 * which would otherwise be two identical two-query round-trips.
 * ========================================================================== */

import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { PHILOSOPHY_DEFAULTS, STATS_BENCHMARK_WINDOWS } from '@/lib/coachhelm/constants';

export interface PlayerSignalSettings {
  /** Plays a hole needs before it can be ranked toughest/easiest. */
  minHolePlaysForRanking: number;
  /** Rolling window (days) for v2 pattern mining. */
  patternLookbackDays: number;
  /** Comparison window (days) for the Stats benchmark: last N vs the N before. */
  statsBenchmarkWindowDays: number;
  /** Completed rounds required before the engine will make a claim. */
  minRoundsForSignal: number;
}

/**
 * What every consumer gets when there is no coach, no philosophy row, or no
 * database. These are the values the code used before the settings existed, so
 * the fallback path is byte-for-byte the old behaviour.
 */
export const SIGNAL_SETTINGS_FALLBACK: PlayerSignalSettings = {
  minHolePlaysForRanking: PHILOSOPHY_DEFAULTS.minHolePlaysForRanking,
  patternLookbackDays: PHILOSOPHY_DEFAULTS.patternLookbackDays,
  statsBenchmarkWindowDays: PHILOSOPHY_DEFAULTS.statsBenchmarkWindowDays,
  minRoundsForSignal: PHILOSOPHY_DEFAULTS.minRoundsForSignal,
};

/**
 * Coerce one stored value into a usable number.
 *
 * The DB CHECK constraints already bound these, but this code also has to
 * survive a row written BEFORE the constraint existed and a numeric column
 * arriving as a string over PostgREST. Anything unusable falls back to the
 * constant rather than propagating a NaN into a date subtraction.
 */
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

async function resolve(playerId: string): Promise<PlayerSignalSettings> {
  if (!playerId) return SIGNAL_SETTINGS_FALLBACK;

  try {
    const admin = createAdminClient();

    const { data: membership } = await admin
      .from('golf_team_members')
      .select('golf_teams(organization_id)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    const orgId = (membership?.golf_teams as { organization_id: string } | null)?.organization_id;
    if (!orgId) return SIGNAL_SETTINGS_FALLBACK;

    // Same coach-for-organization resolution `triggerPlayerInsightsAfterRound`
    // uses, so a player's Stats page and their post-round insights agree on
    // whose settings apply.
    const { data: row } = await admin
      .from('golf_coaches')
      .select(
        'golf_coach_philosophy(min_hole_plays_for_ranking, pattern_lookback_days, stats_benchmark_window_days, min_rounds_for_signal)',
      )
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();

    // Supabase types the embedded row as object-or-array depending on the
    // inferred cardinality; normalise before reading.
    const embedded = (row as { golf_coach_philosophy?: unknown } | null)?.golf_coach_philosophy;
    const philosophy = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | Record<string, unknown>
      | null
      | undefined;
    if (!philosophy) return SIGNAL_SETTINGS_FALLBACK;

    const benchmark = num(
      philosophy.stats_benchmark_window_days,
      SIGNAL_SETTINGS_FALLBACK.statsBenchmarkWindowDays,
      1,
      365,
    );

    return {
      minHolePlaysForRanking: num(
        philosophy.min_hole_plays_for_ranking,
        SIGNAL_SETTINGS_FALLBACK.minHolePlaysForRanking,
        1,
        50,
      ),
      patternLookbackDays: num(
        philosophy.pattern_lookback_days,
        SIGNAL_SETTINGS_FALLBACK.patternLookbackDays,
        7,
        1095,
      ),
      // The benchmark is an enum, not a range — an off-list value (hand-written
      // SQL, a row from before the CHECK landed) would render a label the UI
      // has no copy for, so snap it back to the default.
      statsBenchmarkWindowDays: (STATS_BENCHMARK_WINDOWS as readonly number[]).includes(benchmark)
        ? benchmark
        : SIGNAL_SETTINGS_FALLBACK.statsBenchmarkWindowDays,
      minRoundsForSignal: num(
        philosophy.min_rounds_for_signal,
        SIGNAL_SETTINGS_FALLBACK.minRoundsForSignal,
        1,
        100,
      ),
    };
  } catch {
    // Deliberately silent. This is a config read on a read-only surface; the
    // fallback is the previous behaviour, so a failure here is invisible to the
    // user and not worth an error-log entry on every stats page load.
    return SIGNAL_SETTINGS_FALLBACK;
  }
}

/**
 * Resolve the coach-configured windows that apply to `playerId`.
 * Request-deduped; safe to call from any number of parallel consumers.
 */
export const getPlayerSignalSettings = cache(resolve);
