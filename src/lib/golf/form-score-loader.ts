/**
 * Loads a player's Form inputs (OD-02) and computes the score: the last 20
 * completed rounds, newest first, plus the active critical/high patterns.
 * The same reads getPlayerProfile (src/app/golf/actions/coachhelm-data.ts)
 * makes, so every surface that prints "Form" prints the same number.
 *
 * Server only (takes the caller's RLS client). A failed read returns null so
 * the caller shows no Form rather than a wrong one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { computeFormScore, type FormRoundInput, type FormScore } from '@/lib/golf/form-score';

export async function loadPlayerFormScore(
  sb: SupabaseClient<Database>,
  playerId: string,
): Promise<FormScore | null> {
  const [roundsRes, patternsRes] = await Promise.all([
    sb
      .from('golf_rounds')
      .select('status, holes_played, total_score, front_nine, back_nine, total_putts, score_to_par, strokes_gained_total')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(20),
    sb
      .from('golf_patterns_v2')
      .select('severity')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .in('severity', ['critical', 'high']),
  ]);
  if (roundsRes.error || patternsRes.error) return null;
  return computeFormScore(
    (roundsRes.data ?? []) as FormRoundInput[],
    (patternsRes.data ?? []) as { severity: string | null }[],
  );
}
