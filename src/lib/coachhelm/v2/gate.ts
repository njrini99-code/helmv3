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
export function isCoachHelmEnabled(): boolean {
  // Could be controlled by environment variable or feature flag
  const envFlag = process.env.NEXT_PUBLIC_COACHHELM_ENABLED;
  return envFlag !== 'false'; // Enabled by default unless explicitly disabled
}

/**
 * Gets CoachHelm settings for a user (coach or player)
 *
 * @param userId - The user's UUID (from users.id / auth.uid)
 * @returns Settings or null if not found
 */
export async function getCoachHelmSettings(
  userId: string
): Promise<CoachHelmSettings | null> {
  const supabase = await createClient();

  try {
    // Type assertion for new table - uses user_id column per migration schema
    const { data, error } = await (supabase
      .from('golf_coachhelm_settings' as 'users')
      .select('enabled, disabled_at, disabled_reason')
      .eq('user_id', userId)
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
  } catch {
    // Table doesn't exist yet - return null to use defaults (enabled)
    return null;
  }
}

/**
 * Gets team CoachHelm settings
 *
 * @param teamId - The team's UUID
 * @returns Whether team has CoachHelm enabled
 */
export async function getTeamCoachHelmSettings(
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
  } catch {
    // Table doesn't exist yet - return null to use defaults (enabled)
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

  // Check coach-level settings (using user_id from coach record)
  const coachSettings = await getCoachHelmSettings(coach.user_id);
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

  // Check user-level settings (user_id is required in schema)
  const userSettings = await getCoachHelmSettings(player.user_id);
  const userEnabled = userSettings?.enabled ?? true;

  if (!userEnabled) {
    return {
      userEnabled: false,
      teamEnabled: true,
      effectivelyEnabled: false,
      disabledReason: userSettings?.disabledReason ?? 'Disabled by user',
      disabledBy: 'user',
    };
  }

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

/**
 * Enables CoachHelm for a user
 *
 * @param userId - The user's UUID (from auth)
 */
export async function enableCoachHelm(userId: string): Promise<boolean> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from('golf_coachhelm_settings' as any) as any;
  const { error } = await table.upsert({
    user_id: userId,
    enabled: true,
  });

  return !error;
}

/**
 * Disables CoachHelm for a user
 *
 * @param userId - The user's UUID (from auth)
 * @param reason - Optional reason for disabling
 */
export async function disableCoachHelm(
  userId: string,
  reason?: string
): Promise<boolean> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from('golf_coachhelm_settings' as any) as any;
  const { error } = await table.upsert({
    user_id: userId,
    enabled: false,
    disabled_at: new Date().toISOString(),
    disabled_reason: reason ?? null,
  });

  return !error;
}

/**
 * Enables CoachHelm for a team
 *
 * @param teamId - The team's UUID
 */
export async function enableTeamCoachHelm(teamId: string): Promise<boolean> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from('golf_team_coachhelm_settings' as any) as any;
  const { error } = await table.upsert({
    team_id: teamId,
    enabled: true,
    disabled_at: null,
    disabled_by: null,
    disabled_reason: null,
  });

  return !error;
}

/**
 * Disables CoachHelm for a team
 *
 * @param teamId - The team's UUID
 * @param disabledBy - The user who disabled it
 * @param reason - Optional reason for disabling
 */
export async function disableTeamCoachHelm(
  teamId: string,
  disabledBy: string,
  reason?: string
): Promise<boolean> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from('golf_team_coachhelm_settings' as any) as any;
  const { error } = await table.upsert({
    team_id: teamId,
    enabled: false,
    disabled_at: new Date().toISOString(),
    disabled_by: disabledBy,
    disabled_reason: reason ?? null,
  });

  return !error;
}
