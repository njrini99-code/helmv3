/**
 * v3 Coach Intent loader (W27).
 *
 * Server-side reads of golf_coach_player_intent. RLS Pattern 2 means
 * only the row's coach can SELECT — so this loader is appropriate only
 * from coach-context server actions / route handlers.
 *
 * For engine paths that need to read intent for ANY coach (e.g., the
 * orchestrator computing alert_posture multipliers), use the admin
 * client which bypasses RLS.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { CoachPlayerIntent } from './types';
import { DEFAULT_NARRATIVE_GOAL, DEFAULT_ALERT_POSTURE } from './types';

/**
 * Load all intent rows for one coach (their entire roster).
 * Returns a Map keyed by player_id for O(1) lookup at render time.
 */
export async function loadCoachIntents(coachId: string): Promise<Map<string, CoachPlayerIntent>> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_coach_player_intent')
    .select('coach_id, player_id, narrative_goal, alert_posture, highlight_categories, notes, updated_at')
    .eq('coach_id', coachId) as {
      data: CoachPlayerIntent[] | null;
      error: { message: string } | null;
    };
  if (error) {
    throw new Error(`loadCoachIntents(${coachId}): ${error.message}`);
  }
  const map = new Map<string, CoachPlayerIntent>();
  for (const row of data ?? []) {
    map.set(row.player_id, row);
  }
  return map;
}

/**
 * Load the intent for one (coach, player) pair. Returns a synthesized
 * default row when no DB row exists yet — keeps consumer code simple.
 */
export async function loadIntent(coachId: string, playerId: string): Promise<CoachPlayerIntent> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_coach_player_intent')
    .select('*')
    .eq('coach_id', coachId)
    .eq('player_id', playerId)
    .maybeSingle() as {
      data: CoachPlayerIntent | null;
      error: { message: string } | null;
    };
  if (error) {
    throw new Error(`loadIntent(${coachId}, ${playerId}): ${error.message}`);
  }
  return data ?? {
    coach_id: coachId,
    player_id: playerId,
    narrative_goal: DEFAULT_NARRATIVE_GOAL,
    alert_posture: DEFAULT_ALERT_POSTURE,
    highlight_categories: [],
    notes: null,
    updated_at: new Date().toISOString(),
  };
}
