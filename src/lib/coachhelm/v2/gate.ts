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
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachHelmSettings, CoachHelmStatus } from './types';

// Internal types for database rows (tables created via migration)
interface CoachHelmSettingsRow {
  enabled: boolean;
  disabled_at?: string | null;
  disabled_reason?: string | null;
}

interface TeamCoachHelmSettingsRow {
  enabled: boolean;
  disabled_reason: string | null;
}

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
    const fromFn = (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: CoachHelmSettingsRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }).from;

    const { data, error } = await fromFn
      .call(supabase, 'golf_coachhelm_settings')
      .select('enabled, disabled_at, disabled_reason')
      .eq('coach_id', coachId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      enabled: data.enabled,
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
    const fromFn = (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: (TeamCoachHelmSettingsRow & { disabled_at?: string | null }) | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }).from;

    const { data, error } = await fromFn
      .call(supabase, 'golf_team_coachhelm_settings')
      .select('enabled, disabled_reason, disabled_at')
      .eq('team_id', teamId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      enabled: data.enabled,
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

  const supabase = (supabaseOverride ?? (await createClient())) as SupabaseClient;

  // Get coach record with team via organization
  const fromFn = (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          single: () => Promise<{
            data: { user_id: string | null; organization_id: string | null } | null;
            error: { message: string } | null;
          }>;
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  }).from;

  const { data: coach, error: coachError } = await fromFn
    .call(supabase, 'golf_coaches')
    .select('user_id, organization_id')
    .eq('id', coachId)
    .single();

  if (coachError) {
    await logServerError('gate.isCoachHelmEnabledForCoach lookup failed', {
      action: 'gate.isCoachHelmEnabledForCoach',
      featureArea: 'coachhelm.gate',
      metadata: { coachId, dbError: coachError as unknown },
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

  // Check team-level settings if coach has an organization
  if (coach.organization_id) {
    const { data: team } = await fromFn
      .call(supabase, 'golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (team) {
      const teamSettings = await getTeamCoachHelmSettings(team.id, supabase);
      const teamEnabled = teamSettings?.enabled ?? true;

      if (!teamEnabled) {
        return {
          userEnabled: true,
          teamEnabled: false,
          effectivelyEnabled: false,
          disabledReason: teamSettings?.disabledReason ?? 'Disabled by team',
          disabledBy: 'team',
        };
      }
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

  const supabase = (supabaseOverride ?? (await createClient())) as SupabaseClient;

  const fromFn = (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          single: () => Promise<{
            data: {
              user_id: string | null;
              team:
                | { team_id: string | null }
                | Array<{ team_id: string | null }>
                | null;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  }).from;

  const { data: player, error: playerError } = await fromFn
    .call(supabase, 'golf_players')
    .select('user_id, team:golf_team_members(team_id)')
    .eq('id', playerId)
    .single();

  if (playerError) {
    await logServerError('gate.isCoachHelmEnabledForPlayer lookup failed', {
      action: 'gate.isCoachHelmEnabledForPlayer',
      featureArea: 'coachhelm.gate',
      metadata: { playerId, dbError: playerError as unknown },
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

  // Check team-level settings if player has a team
  const teamMembership = Array.isArray(player.team) ? player.team[0] : player.team;
  const playerTeamId = teamMembership?.team_id ?? null;
  if (playerTeamId) {
    const teamSettings = await getTeamCoachHelmSettings(playerTeamId, supabase);
    const teamEnabled = teamSettings?.enabled ?? true;

    if (!teamEnabled) {
      return {
        userEnabled: true,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: teamSettings?.disabledReason ?? 'Disabled by coach',
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
