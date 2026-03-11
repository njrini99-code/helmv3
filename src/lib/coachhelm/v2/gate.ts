/**
 * CoachHelm V2 Gate
 *
 * Controls access to CoachHelm features based on user and team settings.
 * Provides functions to check if CoachHelm is enabled for a user.
 *
 * Note: Uses type assertions because the tables are created via migration
 * and aren't in the generated database types yet.
 */

import { createClient } from '@/lib/supabase/server';
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

/**
 * Checks if CoachHelm is enabled globally (feature flag)
 *
 * @returns Whether CoachHelm V2 is enabled globally
 */
function isCoachHelmEnabled(): boolean {
  // Could be controlled by environment variable or feature flag
  const envFlag = process.env.NEXT_PUBLIC_COACHHELM_ENABLED;
  return envFlag !== 'false'; // Enabled by default unless explicitly disabled
}

/**
 * Gets CoachHelm settings for a coach.
 *
 * Production RLS on golf_coachhelm_settings is keyed off coach_id, so coach
 * lookups must use the coach record rather than auth user_id.
 */
async function getCoachHelmCoachSettings(
  coachId: string
): Promise<CoachHelmSettings | null> {
  const supabase = await createClient();

  try {
    // Type assertion for new table - live production schema is keyed by coach_id
    const { data, error } = await (supabase
      .from('golf_coachhelm_settings' as 'users')
      .select('enabled, disabled_at, disabled_reason')
      .eq('coach_id', coachId)
      .maybeSingle() as unknown as Promise<{
      data: CoachHelmSettingsRow | null;
      error: Error | null;
    }>);

    if (error || !data) {
      return null;
    }

    return {
      enabled: data.enabled,
      disabledAt: data.disabled_at ?? null,
      disabledReason: data.disabled_reason ?? null,
    };
  } catch (err) {
    console.error('[CoachHelm] Failed to fetch coach CoachHelm settings:', err);
    return null;
  }
}

/**
 * Gets team CoachHelm settings
 *
 * @param teamId - The team's UUID
 * @returns Whether team has CoachHelm enabled
 */
async function getTeamCoachHelmSettings(
  teamId: string
): Promise<{ enabled: boolean; disabledReason: string | null } | null> {
  const supabase = await createClient();

  try {
    const { data, error } = await (supabase
      .from('golf_team_coachhelm_settings' as 'users')
      .select('enabled, disabled_reason, disabled_at')
      .eq('team_id', teamId)
      .maybeSingle() as unknown as Promise<{
      data: TeamCoachHelmSettingsRow & { disabled_at?: string | null } | null;
      error: Error | null;
    }>);

    if (error || !data) {
      // Table may not exist or no settings configured - return null to use defaults
      return null;
    }

    return {
      enabled: data.enabled,
      disabledReason: data.disabled_reason,
    };
  } catch (err) {
    // Table doesn't exist yet - return null to use defaults (enabled)
    console.error('[CoachHelm] Failed to fetch team CoachHelm settings:', err);
    return null;
  }
}

/**
 * Checks if CoachHelm is enabled for a specific coach
 *
 * This checks both global feature flag, user settings, and team settings.
 *
 * @param coachId - The coach's UUID (from golf_coaches table)
 * @returns Full status including whether enabled and why disabled
 */
export async function isCoachHelmEnabledForCoach(
  coachId: string
): Promise<CoachHelmStatus> {
  // Check global flag first
  if (!isCoachHelmEnabled()) {
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: 'CoachHelm is disabled globally',
      disabledBy: null,
    };
  }

  const supabase = await createClient();

  // Get coach record with team via organization
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('user_id, organization_id')
    .eq('id', coachId)
    .single();

  if (coachError || !coach) {
    return {
      userEnabled: true,
      teamEnabled: true,
      effectivelyEnabled: true,
      disabledReason: null,
      disabledBy: null,
    };
  }

  // Check coach-level settings using coach_id, which matches production RLS.
  const coachSettings = await getCoachHelmCoachSettings(coachId);
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

  // Check team-level settings if coach has an organization (find team via org)
  if (coach.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (team) {
      const teamSettings = await getTeamCoachHelmSettings(team.id);
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
 * @param playerId - The player's UUID (from golf_players table)
 * @returns Full status including whether enabled and why disabled
 */
export async function isCoachHelmEnabledForPlayer(
  playerId: string
): Promise<CoachHelmStatus> {
  // Check global flag first
  if (!isCoachHelmEnabled()) {
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: 'CoachHelm is disabled globally',
      disabledBy: null,
    };
  }

  const supabase = await createClient();

  // Get player record with team via golf_team_members
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('user_id, team:golf_team_members(team_id)')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return {
      userEnabled: true,
      teamEnabled: true,
      effectivelyEnabled: true,
      disabledReason: null,
      disabledBy: null,
    };
  }

  // Player-specific CoachHelm rows are not part of the live production contract.
  // Check team-level settings if player has a team
  const teamMembership = Array.isArray(player.team) ? player.team[0] : player.team;
  const playerTeamId = teamMembership?.team_id;
  if (playerTeamId) {
    const teamSettings = await getTeamCoachHelmSettings(playerTeamId);
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
