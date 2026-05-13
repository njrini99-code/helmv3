/**
 * CoachHelm V2 Gate
 *
 * Controls access to CoachHelm features based on user and team settings.
 * Provides functions to check if CoachHelm is enabled for a user.
 *
 * Fail-closed contract (LIVE-17): when the coach/player record cannot be
 * loaded due to a DB error, the gate returns `effectivelyEnabled=false`
 * rather than the prior behavior of treating transient errors as "enabled".
 * A missing row (data=null, error=null) still falls back to the enabled
 * default — only DB-level errors trigger the fail-closed path.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachHelmSettings, CoachHelmStatus } from './types';

const LOOKUP_FAILED_REASON = 'Coach record lookup failed';
const PLAYER_LOOKUP_FAILED_REASON = 'Player record lookup failed';

/**
 * Checks if CoachHelm is enabled globally (feature flag)
 *
 * @returns Whether CoachHelm V2 is enabled globally
 */
function isCoachHelmEnabled(): boolean {
  const envFlag = process.env.NEXT_PUBLIC_COACHHELM_ENABLED;
  return envFlag !== 'false';
}

/**
 * Gets CoachHelm settings for a coach.
 */
async function getCoachHelmCoachSettings(
  coachId: string,
  supabase: SupabaseClient,
): Promise<CoachHelmSettings | null> {
  try {
    const { data, error } = await supabase
      .from('golf_coachhelm_settings')
      .select('enabled, disabled_at, disabled_reason')
      .eq('coach_id', coachId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      // DB column is `boolean | null`; default null/undefined to true
      // (the legacy local type narrowed this to `boolean`).
      enabled: data.enabled ?? true,
      disabledAt: data.disabled_at ?? null,
      disabledReason: data.disabled_reason ?? null,
    };
  } catch (err) {
    await logServerError('gate.getCoachHelmCoachSettings threw', {
      action: 'gate.getCoachHelmCoachSettings',
      featureArea: 'coachhelm.gate',
      metadata: { coachId, error: String(err) },
    });
    return null;
  }
}

/**
 * Gets team CoachHelm settings
 */
async function getTeamCoachHelmSettings(
  teamId: string,
  supabase: SupabaseClient,
): Promise<{ enabled: boolean; disabledReason: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from('golf_team_coachhelm_settings')
      .select('enabled, disabled_reason, disabled_at')
      .eq('team_id', teamId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      // DB column is `boolean | null`; default null/undefined to true
      // (callers already use `?? true` downstream — preserves runtime behavior).
      enabled: data.enabled ?? true,
      disabledReason: data.disabled_reason,
    };
  } catch (err) {
    await logServerError('gate.getTeamCoachHelmSettings threw', {
      action: 'gate.getTeamCoachHelmSettings',
      featureArea: 'coachhelm.gate',
      metadata: { teamId, error: String(err) },
    });
    return null;
  }
}

/**
 * Checks if CoachHelm is enabled for a specific coach
 *
 * This checks the global feature flag, coach settings, and team settings.
 * On DB error during the primary coach lookup, returns `effectivelyEnabled=false`
 * (fail-closed) — LIVE-17.
 *
 * @param coachId          The coach's UUID (from golf_coaches table)
 * @param supabaseOverride Optional injected client (tests)
 */
export async function isCoachHelmEnabledForCoach(
  coachId: string,
  supabaseOverride?: SupabaseClient,
): Promise<CoachHelmStatus> {
  if (!isCoachHelmEnabled()) {
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: 'CoachHelm is disabled globally',
      disabledBy: null,
    };
  }

  const supabase = (supabaseOverride ?? (createAdminClient())) as SupabaseClient;

  // Get coach record with team via organization
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('user_id, organization_id')
    .eq('id', coachId)
    .single();

  if (coachError) {
    await logServerError('gate.isCoachHelmEnabledForCoach lookup failed', {
      action: 'gate.isCoachHelmEnabledForCoach',
      featureArea: 'coachhelm.gate',
      metadata: { coachId, dbError: coachError },
    });
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: LOOKUP_FAILED_REASON,
      disabledBy: null,
    };
  }

  if (!coach) {
    // No error, just no row — fall back to enabled default for backward
    // compatibility (prior behavior for missing records).
    return {
      userEnabled: true,
      teamEnabled: true,
      effectivelyEnabled: true,
      disabledReason: null,
      disabledBy: null,
    };
  }

  // Check coach-level settings
  const coachSettings = await getCoachHelmCoachSettings(coachId, supabase);
  const userEnabled = coachSettings?.enabled ?? true;

  if (!userEnabled) {
    return {
      userEnabled: false,
      teamEnabled: true,
      effectivelyEnabled: false,
      disabledReason: coachSettings?.disabledReason ?? 'Disabled by user',
      disabledBy: 'user',
    };
  }

  // Check team-level settings across every team the coach staffs. A coach is
  // gated as disabled only when ALL staffed teams have CoachHelm disabled —
  // otherwise CoachHelm runs for the still-enabled team. Resolving via
  // golf_team_coach_staff avoids the old "pick first team in the org" bug
  // that silently misread the wrong team's settings in multi-team orgs.
  const { data: staffedTeams } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);

  const teamIds = (staffedTeams ?? [])
    .map((s) => s.team_id)
    .filter((id): id is string => !!id);

  if (teamIds.length > 0) {
    let allDisabled = true;
    let firstDisabledReason: string | null = null;
    for (const teamId of teamIds) {
      const teamSettings = await getTeamCoachHelmSettings(teamId, supabase);
      const teamEnabled = teamSettings?.enabled ?? true;
      if (teamEnabled) {
        allDisabled = false;
        break;
      }
      firstDisabledReason ??= teamSettings?.disabledReason ?? null;
    }

    if (allDisabled) {
      return {
        userEnabled: true,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: firstDisabledReason ?? 'Disabled by team',
        disabledBy: 'team',
      };
    }
  }

  return {
    userEnabled: true,
    teamEnabled: true,
    effectivelyEnabled: true,
    disabledReason: null,
    disabledBy: null,
  };
}

/**
 * Checks if CoachHelm is enabled for a specific player
 *
 * Fail-closed on DB lookup errors (LIVE-17).
 *
 * @param playerId         The player's UUID (from golf_players table)
 * @param supabaseOverride Optional injected client (tests)
 */
export async function isCoachHelmEnabledForPlayer(
  playerId: string,
  supabaseOverride?: SupabaseClient,
): Promise<CoachHelmStatus> {
  if (!isCoachHelmEnabled()) {
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: 'CoachHelm is disabled globally',
      disabledBy: null,
    };
  }

  const supabase = (supabaseOverride ?? (createAdminClient())) as SupabaseClient;

  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('user_id')
    .eq('id', playerId)
    .single();

  if (playerError) {
    await logServerError('gate.isCoachHelmEnabledForPlayer lookup failed', {
      action: 'gate.isCoachHelmEnabledForPlayer',
      featureArea: 'coachhelm.gate',
      metadata: { playerId, dbError: playerError },
    });
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: PLAYER_LOOKUP_FAILED_REASON,
      disabledBy: null,
    };
  }

  if (!player) {
    return {
      userEnabled: true,
      teamEnabled: true,
      effectivelyEnabled: true,
      disabledReason: null,
      disabledBy: null,
    };
  }

  // Players on multiple teams: gate as disabled only when EVERY active team
  // has CoachHelm disabled. Otherwise CoachHelm runs (the still-enabled team
  // governs). Previous code read player.team[0] — an arbitrary first
  // membership — which could read the wrong team's setting.
  const { data: memberships } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active');

  const playerTeamIds = (memberships ?? [])
    .map((m) => m.team_id)
    .filter((id): id is string => !!id);

  if (playerTeamIds.length > 0) {
    let allDisabled = true;
    let firstDisabledReason: string | null = null;
    for (const teamId of playerTeamIds) {
      const teamSettings = await getTeamCoachHelmSettings(teamId, supabase);
      const teamEnabled = teamSettings?.enabled ?? true;
      if (teamEnabled) {
        allDisabled = false;
        break;
      }
      firstDisabledReason ??= teamSettings?.disabledReason ?? null;
    }

    if (allDisabled) {
      return {
        userEnabled: true,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: firstDisabledReason ?? 'Disabled by coach',
        disabledBy: 'coach',
      };
    }
  }

  return {
    userEnabled: true,
    teamEnabled: true,
    effectivelyEnabled: true,
    disabledReason: null,
    disabledBy: null,
  };
}
