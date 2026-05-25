/**
 * v3 Goals loader.
 *
 * Read-side queries against golf_goals + golf_goal_suggestions. RLS
 * (Pattern 1 — player owns rows; coach sees assigned+shared) handles
 * authz; this module just composes the queries.
 *
 * Server actions (createGoal, accept, dismiss, etc.) live in
 * src/app/golf/actions/v3/goals.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { Goal, GoalSuggestion } from './types';

/**
 * Load every goal for a player. Ordered by state (active first), then
 * ends_at ascending so soonest-due bubbles to the top.
 */
export async function loadPlayerGoals(playerId: string): Promise<Goal[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('golf_goals')
    .select('*')
    .eq('player_id', playerId)
    .order('state', { ascending: true })
    .order('ends_at', { ascending: true });
  if (error) {
    throw new Error(`loadPlayerGoals(${playerId}): ${error.message}`);
  }
  return (data ?? []) as unknown as Goal[];
}

/**
 * Convenience — just the active subset.
 */
export async function loadActiveGoals(playerId: string): Promise<Goal[]> {
  const all = await loadPlayerGoals(playerId);
  return all.filter((g) => g.state === 'active');
}

/**
 * Load pending suggestions for a player (state = 'pending' AND not expired).
 * Returns up to `limit` newest-first.
 */
export async function loadPendingGoalSuggestions(
  playerId: string,
  limit = 3,
): Promise<GoalSuggestion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('golf_goal_suggestions')
    .select('*')
    .eq('player_id', playerId)
    .eq('state', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('suggested_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`loadPendingGoalSuggestions(${playerId}): ${error.message}`);
  }
  return (data ?? []) as unknown as GoalSuggestion[];
}
