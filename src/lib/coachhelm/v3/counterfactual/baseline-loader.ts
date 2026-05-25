/**
 * v3 counterfactual — player baseline loader.
 *
 * Reads the player's rolling scoring average from `golf_player_stats_cache`.
 * Pulled out into its own module so consumers can cache the result across
 * many per-metric counterfactual computations within a single render.
 *
 * Returns null when:
 *   - The player has no stats cache row (cold-start <5 rounds).
 *   - The cache's scoring_average is null.
 *
 * Callers should treat null as "no projection" and suppress the
 * counterfactual line.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export async function loadPlayerScoringBaseline(
  playerId: string,
): Promise<number | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('golf_player_stats_cache')
    .select('scoring_average, rounds_played')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.rounds_played === null || data.rounds_played < 5) return null;
  return data.scoring_average ?? null;
}
