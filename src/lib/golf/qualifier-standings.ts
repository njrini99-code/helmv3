import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Re-derive one player's stored aggregate for one qualifier from their
 * completed rounds in it.
 *
 * `golf_qualifier_entries` carries BOTH the fact that a player is in a
 * qualifier and their running totals (`score`, `total_score`, `total_to_par`,
 * `rounds_completed`). The coach's leaderboard does not read those —
 * `get_qualifier_leaderboard` recomputes live from `golf_rounds` — but the
 * player's own "my qualifiers" card does, so the two disagree whenever this
 * is not run.
 *
 * Extracted from `golf.ts` on 2026-08-31 so the round-type change can run it
 * too. Submitting a round was previously the ONLY thing that did, which was
 * correct while a round's qualifier identity was fixed at creation; once a
 * round can be moved into or out of a qualifier after the fact, the totals on
 * BOTH sides of that move go stale. `golf.ts` is a `'use server'` module, so
 * a shared helper cannot live there — every export of one is an action.
 *
 * Deliberately NOT the `public.update_qualifier_leaderboard` SQL function,
 * which computes the same thing: it is not SECURITY DEFINER, so it writes
 * under the caller's RLS and a player-session write silently matches no row.
 * (Measured 2026-08-31: nothing in the repo or the database called it — no
 * trigger is wired to it and no code path invoked it.)
 *
 * Uses the admin client because a player may submit their own score but never
 * writes the coach-owned aggregate directly. Every result is inspected:
 * PostgREST reports a zero-row UPDATE with no error, which is what previously
 * left production aggregates stale with nothing logged.
 *
 * Throws on failure. Callers decide whether that is fatal — at submit it is
 * logged and swallowed, because the round itself is already saved.
 */
export async function updateQualifierEntryStats(
  qualifierId: string,
  playerId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: rounds, error: roundsError } = await admin
    .from('golf_rounds')
    .select('total_score, score_to_par')
    .eq('qualifier_id', qualifierId)
    .eq('player_id', playerId)
    .eq('status', 'completed');

  if (roundsError) {
    throw new Error(`Could not read completed qualifier rounds: ${roundsError.message}`);
  }

  // Filter out rounds with null total_score to avoid summing 0 in place of missing data
  const scoredRounds = ((rounds ?? []) as Array<{
    total_score: number | null;
    score_to_par: number | null;
  }>).filter((round): round is { total_score: number; score_to_par: number | null } => round.total_score != null);

  const totalScore = scoredRounds.reduce((sum, round) => sum + round.total_score, 0);
  const totalToPar = scoredRounds.reduce((sum, round) => sum + (round.score_to_par ?? 0), 0);
  const roundsCompleted = scoredRounds.length;

  const { data: updatedEntry, error: updateError } = await admin
    .from('golf_qualifier_entries')
    .update({
      score: totalScore,
      total_score: totalScore,
      total_to_par: totalToPar,
      rounds_completed: roundsCompleted,
    })
    .eq('qualifier_id', qualifierId)
    .eq('player_id', playerId)
    .select('id')
    .maybeSingle();

  if (updateError) {
    throw new Error(`Could not update qualifier entry aggregate: ${updateError.message}`);
  }
  if (!updatedEntry) {
    throw new Error('Qualifier entry aggregate update matched no row');
  }
}
