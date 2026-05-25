'use server';

/**
 * v3 Coach Intent server actions (W27).
 *
 * RLS Pattern 2 (intent_coach_only) handles authz: the policy uses
 * current_coach_id() to ensure only the row's coach can write. These
 * actions go through the session-scoped supabase client so RLS fires.
 */

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import type { NarrativeGoal, AlertPosture } from '@/lib/coachhelm/v3/intent/types';

export interface SetIntentInput {
  player_id: string;
  narrative_goal?: NarrativeGoal;
  alert_posture?: AlertPosture;
  highlight_categories?: string[];
  notes?: string | null;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Upsert a coach's intent for one player. coach_id is derived from
 * the authenticated user; RLS rejects writes for any other coach.
 *
 * Idempotent: same (coach_id, player_id) tuple updates the same row.
 */
export async function setIntent(input: SetIntentInput): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return { ok: false, error: 'Unauthorized' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return { ok: false, error: 'Not a coach' };

    const payload: Record<string, unknown> = {
      coach_id: coach.id,
      player_id: input.player_id,
      updated_at: new Date().toISOString(),
    };
    if (input.narrative_goal !== undefined) payload.narrative_goal = input.narrative_goal;
    if (input.alert_posture !== undefined) payload.alert_posture = input.alert_posture;
    if (input.highlight_categories !== undefined) {
      payload.highlight_categories = input.highlight_categories;
    }
    if (input.notes !== undefined) payload.notes = input.notes;

    const { error } = await fromUntyped(supabase, 'golf_coach_player_intent')
      .upsert(payload, { onConflict: 'coach_id,player_id' }) as {
        error: { message: string } | null;
      };

    if (error) {
      await logServerError(`setIntent failed: ${error.message}`, {
        action: 'v3.intent.set',
      });
      return { ok: false, error: error.message };
    }

    revalidatePath('/golf/dashboard/roster');
    revalidatePath(`/golf/dashboard/roster/${input.player_id}`);
    return { ok: true };
  } catch (err) {
    await logServerError(
      `setIntent exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.intent.set' },
    );
    return { ok: false, error: 'Unexpected error' };
  }
}

/**
 * Bulk-set the SAME intent across multiple players. UI exposes this
 * for "select 4 players, set them all to bubble before tournament week."
 */
export async function bulkSetIntent(
  playerIds: string[],
  intent: Pick<SetIntentInput, 'narrative_goal' | 'alert_posture'>,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return { ok: false, error: 'Not a coach' };

    const now = new Date().toISOString();
    const rows = playerIds.map((player_id) => ({
      coach_id: coach.id,
      player_id,
      narrative_goal: intent.narrative_goal,
      alert_posture: intent.alert_posture,
      updated_at: now,
    }));

    const { error } = await fromUntyped(supabase, 'golf_coach_player_intent')
      .upsert(rows, { onConflict: 'coach_id,player_id' }) as {
        error: { message: string } | null;
      };
    if (error) return { ok: false, error: error.message };

    revalidatePath('/golf/dashboard/roster');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
