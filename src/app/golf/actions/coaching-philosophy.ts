'use server';

/**
 * Coaching Philosophy Server Actions
 *
 * Replaces direct supabase-from-client writes to golf_coach_philosophy.
 * Keeps ownership checks + revalidatePath on the server so the coach-side
 * screens (insights, alerts, patterns) pick up threshold / sensitivity
 * changes immediately.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';

type PhilosophyDbPatch = Record<string, unknown>;

const ALLOWED_DB_COLUMNS = new Set<string>([
  'priority_ball_striking',
  'priority_short_game',
  'priority_putting',
  'priority_course_management',
  'priority_mental_game',
  'alert_sensitivity',
  'decline_threshold',
  'pressure_gap_threshold',
  'bubble_zone_range',
  'weight_historical',
  'weight_recent_form',
  'weight_tournament',
  'weight_qualifying',
  'weight_subjective',
  'alert_scoring_decline',
  'alert_stat_regression',
  'alert_tournament_pressure',
  'alert_plateau',
  'alert_bubble_player',
  'alert_surge_player',
  'alert_streaks',
  'alert_recurring_weakness',
  'alert_closing_holes',
  'alert_par_3_issues',
  'show_strokes_gained',
  'show_advanced_stats',
  'insight_verbosity',
  // Signal controls (migration 20260725090000).
  'min_insight_confidence',
  'min_rounds_for_signal',
  'alert_digest',
  // Window controls (migration 20260725140000).
  'min_hole_plays_for_ranking',
  'pattern_lookback_days',
  'stats_benchmark_window_days',
  // Email digest opt-out (2026-07-25). This column was already the gate that
  // BOTH recurring coach emails honour — `coach-morning-digest/route.ts` sends
  // only when `email_digest_enabled !== false`, and `v3/weekly-coach-email`
  // skips the coach outright when it is false — but it had no UI anywhere, so
  // coaches received both with no way to opt out. Surfaced in Settings →
  // Notifications; allowed here so that toggle can persist.
  'email_digest_enabled',
]);

/**
 * Sanitize an incoming patch so a client can only ever update known columns
 * on its own philosophy row. Silently drops unknown keys.
 */
function sanitizePatch(patch: Record<string, unknown>): PhilosophyDbPatch {
  const out: PhilosophyDbPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED_DB_COLUMNS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export interface SaveCoachingPhilosophyResult {
  success: boolean;
  error?: string;
}

async function revalidateCoachingPhilosophyPathsImpl(): Promise<void> {
  revalidatePath('/golf/dashboard/settings/coaching-intelligence');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/alerts');
  revalidatePath('/golf/dashboard/patterns');
  revalidatePath('/golf/dashboard/intelligence');
}

const observedRevalidateCoachingPhilosophyPaths = withAdminObserved(
  'revalidateCoachingPhilosophyPaths',
  { sport: 'golf', feature: 'coaching_intelligence_settings' },
  revalidateCoachingPhilosophyPathsImpl,
);

export async function revalidateCoachingPhilosophyPaths(): Promise<void> {
  return observedRevalidateCoachingPhilosophyPaths();
}

/**
 * Upsert a coach's philosophy row. Verifies the current user owns the
 * `coach_id` (maps to golf_coaches.user_id === auth.uid()).
 *
 * NOTE: Not currently wired into a runtime caller — the settings UI saves
 * via the `useCoachPhilosophy` hook's own update path. Kept (and exercised
 * by src/test/golf/actions/coaching-philosophy.test.ts) as the hardened,
 * server-side save path; do not delete without migrating the hook first.
 */
async function saveCoachingPhilosophyImpl(
  coachId: string,
  patch: Record<string, unknown>,
): Promise<SaveCoachingPhilosophyResult> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Verify the coach row belongs to this user.
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError) {
    await logServerError(`saveCoachingPhilosophy: coach lookup failed: ${coachError.message}`, {
      action: 'coaching_philosophy.save',
      userId: user.id,
      metadata: { coachId },
    });
    return { success: false, error: 'Coach lookup failed' };
  }

  if (!coach) {
    return { success: false, error: 'Forbidden' };
  }

  const safePatch = sanitizePatch(patch);
  if (Object.keys(safePatch).length === 0) {
    return { success: true };
  }

  const { error: upsertError } = await supabase
    .from('golf_coach_philosophy')
    .upsert({ coach_id: coachId, ...safePatch }, { onConflict: 'coach_id' });

  if (upsertError) {
    await logServerError(`saveCoachingPhilosophy upsert failed: ${upsertError.message}`, {
      action: 'coaching_philosophy.save',
      userId: user.id,
      metadata: { coachId, errorCode: upsertError.code },
    });
    return { success: false, error: 'Failed to save philosophy' };
  }

  // Every coach-side screen is downstream of philosophy thresholds, so
  // revalidate them all. Without this, sensitivity/threshold changes
  // won't affect the next insight generation run until the next hard
  // refresh.
  await revalidateCoachingPhilosophyPaths();

  return { success: true };
}

const observedSaveCoachingPhilosophy = withAdminObserved(
  'saveCoachingPhilosophy',
  { sport: 'golf', feature: 'coaching_intelligence_settings' },
  saveCoachingPhilosophyImpl,
);

export async function saveCoachingPhilosophy(
  coachId: string,
  patch: Record<string, unknown>,
): Promise<SaveCoachingPhilosophyResult> {
  return observedSaveCoachingPhilosophy(coachId, patch);
}
