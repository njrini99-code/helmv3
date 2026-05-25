/**
 * W30.5 — supplemental data loaders for composite rules that need
 * raw hole-sequence or lie-typed shot rows beyond what Tier-1
 * insights expose.
 *
 * All three loaders share a window (default 90 days, completed
 * rounds only) and return `[]` on failure so rules can no-op
 * gracefully when data is missing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ApproachShotWithLie,
  CompositeContext,
  HoleScore,
  ShortGameShot,
} from './types';

type Sb = SupabaseClient<Database>;

const DEFAULT_WINDOW_DAYS = 90;

async function recentCompletedRoundIds(
  supabase: Sb,
  playerId: string,
  windowDays: number,
): Promise<string[]> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', since);
  return (data ?? []).map((r) => r.id);
}

/**
 * Per-hole scores for the player's recent rounds. Used by closing-hole
 * fatigue, doubles-after-bogey, and front-9 starter rules.
 */
export async function loadHoleScores(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<HoleScore[]> {
  const supabase = createAdminClient();
  const roundIds = await recentCompletedRoundIds(supabase, playerId, windowDays);
  if (roundIds.length === 0) return [];

  const { data, error } = await supabase
    .from('golf_holes')
    .select('round_id, hole_number, par, score')
    .in('round_id', roundIds)
    .not('score', 'is', null);
  if (error || !data) return [];

  return data
    .filter((r) => r.score !== null && typeof r.par === 'number')
    .map((r) => ({
      round_id: r.round_id,
      hole_number: r.hole_number,
      par: r.par,
      score: r.score as number,
    }));
}

/**
 * Short-game shots: pitch/chip from rough or bunker, started within
 * 40 yards of the green. Approximation of "short side" attempts.
 */
export async function loadShortGameShots(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<ShortGameShot[]> {
  const supabase = createAdminClient();
  const roundIds = await recentCompletedRoundIds(supabase, playerId, windowDays);
  if (roundIds.length === 0) return [];

  const { data, error } = await fromUntyped(supabase, 'golf_shots')
    .select(
      'round_id, hole_number, lie_before, distance_to_hole_before, distance_to_hole_after',
    )
    .in('round_id', roundIds)
    .in('shot_type', ['chip', 'pitch'])
    .in('lie_before', ['rough', 'heavy_rough', 'light_rough', 'bunker']) as {
      data: ShortGameShot[] | null;
      error: { message: string } | null;
    };
  if (error || !data) return [];

  return data.filter(
    (s) =>
      typeof s.distance_to_hole_before === 'number' &&
      s.distance_to_hole_before <= 40 &&
      typeof s.distance_to_hole_after === 'number' &&
      typeof s.lie_before === 'string',
  );
}

/**
 * Approach shots from flyer-prone lies (light rough). The classic
 * flyer-lie failure mode is the ball coming out hot and ending up
 * past the green — `distance_to_hole_after` is on the long side.
 */
export async function loadFlyerLieShots(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<ApproachShotWithLie[]> {
  const supabase = createAdminClient();
  const roundIds = await recentCompletedRoundIds(supabase, playerId, windowDays);
  if (roundIds.length === 0) return [];

  const { data, error } = await fromUntyped(supabase, 'golf_shots')
    .select(
      'round_id, hole_number, lie_before, distance_to_hole_before, distance_to_hole_after',
    )
    .in('round_id', roundIds)
    .eq('shot_type', 'approach')
    .eq('lie_before', 'light_rough') as {
      data: ApproachShotWithLie[] | null;
      error: { message: string } | null;
    };
  if (error || !data) return [];

  return data.filter(
    (s) =>
      typeof s.distance_to_hole_before === 'number' &&
      typeof s.distance_to_hole_after === 'number',
  );
}

/** Load all three supplemental sources in parallel. */
export async function loadCompositeContext(playerId: string): Promise<CompositeContext> {
  const [hole_scores, short_game_shots, flyer_lie_shots] = await Promise.all([
    loadHoleScores(playerId),
    loadShortGameShots(playerId),
    loadFlyerLieShots(playerId),
  ]);
  return { hole_scores, short_game_shots, flyer_lie_shots };
}
