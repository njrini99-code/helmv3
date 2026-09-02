/**
 * The one "what qualifier round number is this?" decision, shared by
 * `getNextQualifierRoundNumber` (golf.ts) and `savePartialRound`'s no-id
 * derivation.
 *
 * Before 2026-09-02 these were two independent implementations that could
 * disagree, and `savePartialRound`'s copy only ever looked at COMPLETED
 * rounds. `golf_rounds_qualifier_player_round_number_uq`
 * (`supabase/migrations/20260823000000_preserve_started_round_identity.sql`)
 * is NOT scoped to `status = 'in_progress'` — its predicate is
 * `qualifier_id IS NOT NULL AND qualifier_round_number IS NOT NULL AND
 * status IS DISTINCT FROM 'abandoned'` — so a number an IN-PROGRESS round
 * already holds is exactly as taken as one a completed round holds. A
 * derivation that only checks completed rounds can therefore mint a number
 * that collides with the player's own still-open round the moment their
 * client loses its local round id, and the resulting INSERT fails 23505 —
 * repeatably, since re-deriving after the failure produces the same number
 * again. The fix is structural: always check for an in-progress round FIRST
 * and, when one exists, return it for REUSE instead of deriving a number to
 * insert with.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface QualifierRoundNumberOk {
  success: true;
  roundNumber: number;
  /**
   * Set when an in-progress round for this exact (qualifier, player) slot
   * already exists. The caller MUST reuse this round rather than insert a
   * second one — deriving a "fresh" number and inserting would either
   * collide with this row's number (23505) or, if the numbers happen to
   * differ, leave the player with two open attempts at once.
   */
  activeRoundId?: string;
}

export interface QualifierRoundNumberErr {
  success: false;
  error: string;
  code?: string;
  /**
   * True for a read failure the caller may treat as "skip derivation and
   * retry next tick" rather than a hard stop — mirrors the pre-existing
   * `priorRoundsError` behaviour in `savePartialRound`: a failed history
   * read must never be interpreted as "no prior rounds" and mint slot 1.
   */
  transient?: boolean;
}

export type QualifierRoundNumberResult = QualifierRoundNumberOk | QualifierRoundNumberErr;

/**
 * Resolve the qualifier round number a no-number save/start should use.
 *
 * Order of decisions:
 * 1. An in-progress round for this (qualifier, player) already owns a
 *    number → return it for reuse (`activeRoundId` set).
 * 2. More than one in-progress round exists (should be prevented upstream,
 *    kept as a defensive check) → refuse rather than guess.
 * 3. Otherwise derive the first UNUSED CONFIGURED number among the player's
 *    COMPLETED rounds, capped at `num_rounds` — not `max(completed) + 1`,
 *    which skips a recoverable gap (1 and 3 completed → next is 2, not 4)
 *    and can falsely report the cap reached.
 * 4. No configured number is free → a clear, actionable error instead of
 *    inserting with a number that will 23505 or silently double up.
 *
 * Pass `numRounds` when the caller already has `golf_qualifiers.num_rounds`
 * (e.g. `getNextQualifierRoundNumber`, which fetches the qualifier row for
 * its own status check) to avoid a second query.
 */
export async function resolveQualifierRoundNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  params: { qualifierId: string; playerId: string; numRounds?: number },
): Promise<QualifierRoundNumberResult> {
  const { qualifierId, playerId } = params;

  const { data: activeRounds, error: activeErr } = await supabase
    .from('golf_rounds')
    .select('id, qualifier_round_number')
    .eq('qualifier_id', qualifierId)
    .eq('player_id', playerId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(2);

  if (activeErr) {
    return {
      success: false,
      error: 'We could not verify your saved qualifier round. Please try again before starting.',
      transient: true,
    };
  }

  const active = (activeRounds ?? []) as Array<{ id: string; qualifier_round_number: number | null }>;
  if (active.length > 1) {
    return {
      success: false,
      error:
        'You have more than one saved round for this qualifier. Do not start another one; use Continue Round so your existing scorecards stay intact.',
    };
  }
  const onlyActive = active.length === 1 ? active[0] : undefined;
  if (onlyActive) {
    return {
      success: true,
      roundNumber: onlyActive.qualifier_round_number ?? 1,
      activeRoundId: onlyActive.id,
    };
  }

  let numRounds = params.numRounds;
  if (numRounds == null) {
    const { data: qualifier, error: qualifierErr } = await supabase
      .from('golf_qualifiers')
      .select('num_rounds')
      .eq('id', qualifierId)
      .maybeSingle();
    if (qualifierErr) {
      return {
        success: false,
        error: 'We could not verify this qualifier. Please try again.',
        transient: true,
      };
    }
    numRounds = (qualifier as { num_rounds?: number } | null)?.num_rounds ?? 1;
  }

  const { data: completedRounds, error: completedErr } = await supabase
    .from('golf_rounds')
    .select('qualifier_round_number')
    .eq('qualifier_id', qualifierId)
    .eq('player_id', playerId)
    .eq('status', 'completed');

  if (completedErr) {
    return {
      success: false,
      error: 'We could not verify your qualifier round history. Please try again.',
      transient: true,
    };
  }

  const completedNumbers = new Set(
    ((completedRounds ?? []) as Array<{ qualifier_round_number: number | null }>)
      .map((r) => r.qualifier_round_number)
      .filter((n): n is number => typeof n === 'number'),
  );

  const unusedConfiguredRounds = Array.from(
    { length: numRounds },
    (_, index) => index + 1,
  ).filter((roundNumber) => !completedNumbers.has(roundNumber));
  const nextRoundNumber = unusedConfiguredRounds[0];

  if (nextRoundNumber === undefined) {
    const roundLabel = numRounds === 1 ? 'round' : 'rounds';
    return {
      success: false,
      code: 'qualifier_round_limit_reached',
      error: `This qualifier is still open, but your coach configured ${numRounds} ${roundLabel}. You have submitted ${numRounds} of ${numRounds}. Ask a coach to raise the round count before starting another round.`,
    };
  }

  return { success: true, roundNumber: nextRoundNumber };
}
