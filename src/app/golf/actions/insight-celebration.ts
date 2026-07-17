'use server';

/**
 * Insight celebration — Wave 1D.
 *
 * Writes `metadata.celebration_shown_at` onto a resolved insight the first
 * time the player sees the celebration treatment in `<ResolutionCelebration>`.
 * The presence of this key is the idempotency flag — subsequent visits render
 * the resolved card without confetti.
 *
 * We're deliberately appending to `metadata`, not mutating the row status. The
 * insight already carries `status='resolved'` + `resolved_at`; this action
 * only records that the *UI treatment* was delivered once.
 *
 * Auth: the player must own the insight (self-access). We don't let coaches
 * "shown" a player's celebration — that'd muddy re-entry logic for the
 * player's next session. Ownership is verified via `verifyPlayerAccess` after
 * loading the insight's `player_id`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import type { Database } from '@/lib/types/database';
import { withAdminObserved } from '@/lib/admin/observed-action';

type CoachInsightRow = Database['public']['Tables']['golf_coach_insights']['Row'];

export interface MarkCelebrationResult {
  success: boolean;
  /** Present when we updated the row this call. */
  celebration_shown_at?: string;
  error?: string;
}

/**
 * Stamp `metadata.celebration_shown_at` with the current ISO timestamp on the
 * given insight. Idempotent — if the key is already present we return success
 * without a write.
 *
 * `supabaseOverride` is accepted so tests can inject a mock client. In
 * production callers should omit it and let the action build its own.
 */
async function markCelebrationShownImpl(
  insightId: string,
  supabaseOverride?: SupabaseClient,
): Promise<MarkCelebrationResult> {
  if (!insightId) {
    return { success: false, error: 'Missing insight id' };
  }

  const supabase = supabaseOverride ?? (await createClient());
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Load the row so we can (a) verify ownership, (b) short-circuit when the
  // celebration has already been shown, and (c) merge into existing metadata
  // instead of clobbering it.
  const { data: row, error: loadError } = await supabase
    .from('golf_coach_insights')
    .select('id, player_id, metadata')
    .eq('id', insightId)
    .maybeSingle();

  if (loadError) {
    await logServerError(
      `markCelebrationShown.load failed: ${loadError.message}`,
      {
        action: 'insight-celebration.markCelebrationShown',
        featureArea: 'insights',
        extra: { insightId, errorCode: loadError.code },
      },
    );
    return { success: false, error: 'Failed to load insight' };
  }

  if (!row) {
    return { success: false, error: 'Insight not found' };
  }

  const typedRow = row as Pick<CoachInsightRow, 'id' | 'player_id' | 'metadata'>;
  if (!typedRow.player_id) {
    return { success: false, error: 'Insight has no owner' };
  }

  // Only the player who owns the insight can mark the celebration shown.
  // Coaches viewing a player's resolved insight should never flip this flag.
  const access = await verifyPlayerAccess(typedRow.player_id, user.id, supabase);
  if (!access.allowed || access.reason !== 'self') {
    return { success: false, error: 'Forbidden' };
  }

  const existingMetadata = (typedRow.metadata ?? {}) as Record<string, unknown>;
  const alreadyShown = typeof existingMetadata.celebration_shown_at === 'string';
  if (alreadyShown) {
    return {
      success: true,
      celebration_shown_at: existingMetadata.celebration_shown_at as string,
    };
  }

  const shownAt = new Date().toISOString();
  const nextMetadata = {
    ...existingMetadata,
    celebration_shown_at: shownAt,
  };

  // Cast: Supabase's generated `Json` type doesn't accept `Record<string, unknown>`
  // directly because `unknown` is wider than `Json`. The shape we write is
  // serializable JSON (strings, numbers, plain objects), so this cast is sound.
  const { error: updateError } = await supabase
    .from('golf_coach_insights')
    .update({ metadata: nextMetadata as never })
    .eq('id', insightId);

  if (updateError) {
    await logServerError(
      `markCelebrationShown.update failed: ${updateError.message}`,
      {
        action: 'insight-celebration.markCelebrationShown',
        featureArea: 'insights',
        extra: { insightId, errorCode: updateError.code },
      },
    );
    return { success: false, error: 'Failed to update insight' };
  }

  // NOTE: /golf/dashboard/my-insights is a permanent redirect shim to
  // /golf/dashboard/coachhelm (see surface-registry.ts `my-insights`,
  // legacy:true/hidden:true) — it never renders cached content of its own, so
  // revalidating it was a stale no-op. /golf/dashboard/coachhelm below is the
  // real target that actually renders the celebration treatment.
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/coachhelm');

  return { success: true, celebration_shown_at: shownAt };
}

const observedMarkCelebrationShown = withAdminObserved(
  'markCelebrationShown',
  { sport: 'golf', feature: 'player_coachhelm_dashboard' },
  markCelebrationShownImpl,
);

export async function markCelebrationShown(insightId: string, supabaseOverride?: SupabaseClient): Promise<MarkCelebrationResult> {
  return observedMarkCelebrationShown(insightId, supabaseOverride);
}
