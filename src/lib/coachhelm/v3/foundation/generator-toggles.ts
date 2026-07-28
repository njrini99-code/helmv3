/**
 * Per-team toggles for individual v3 generators.
 *
 * Stored under `golf_team_coachhelm_settings.preferences` JSONB so we
 * don't have to ALTER TABLE every time a new generator wants opt-out.
 * Default for every key is `true` (opt-out, not opt-in) — teams have
 * to actively toggle off if a particular generator's insights aren't
 * useful for them.
 *
 * Resolution path: playerId → team_id (golf_team_members) →
 * golf_team_coachhelm_settings.preferences[generatorKey].
 *
 * Single round-trip per generator run. The 1-second freshness cost
 * vs caching is acceptable because generators run on cron, not on
 * user-blocking paths.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/** Keys recognized in the preferences blob. Add new keys here when a
 *  new generator wants opt-out behavior. */
export type GeneratorToggleKey =
  | 'tee_strategy_enabled'
  | 'putt_distance_enabled'
  | 'par_type_enabled'
  | 'pressure_gap_enabled'
  | 'warmup_hole_enabled'
  | 'scrambling_enabled'
  | 'putt_bias_enabled'
  | 'course_mgmt_enabled'
  | 'approach_miss_enabled';

/**
 * True when the toggle is unset OR set to a truthy value. False only
 * when the team has explicitly set `{ [key]: false }`. Errors
 * (network, missing team, etc.) fail OPEN — generators still run.
 */
export async function isGeneratorEnabledForPlayer(
  playerId: string,
  key: GeneratorToggleKey,
): Promise<boolean> {
  try {
    const admin = createAdminClient();

    // Resolve player → active team membership.
    const { data: membership } = await admin
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();

    if (!membership?.team_id) return true;

    // Read the team's preference blob. The `preferences` JSONB column
    // exists per migration 031 but isn't on the generated Database types
    // — go via fromUntyped (same pattern used elsewhere in v3 code).
    const { data: settings } = await fromUntyped(admin, 'golf_team_coachhelm_settings')
      .select('preferences')
      .eq('team_id', membership.team_id)
      .maybeSingle() as {
        data: { preferences: Record<string, unknown> | null } | null;
        error: { message: string } | null;
      };

    const prefs = (settings?.preferences ?? {}) as Record<string, unknown>;
    // Default true — only explicit false disables.
    return prefs[key] !== false;
  } catch (err) {
    await logServerError(
      `isGeneratorEnabledForPlayer(${key}) lookup failed for player=${playerId}: ${describeError(err)}`,
      { action: 'v3.toggles.isGeneratorEnabledForPlayer' },
    );
    // Fail open — a toggle lookup failure must not silently suppress
    // every insight. The Sentry log surfaces the lookup failure.
    return true;
  }
}
