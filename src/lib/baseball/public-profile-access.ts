import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { getDefaultProgramSettings } from '@/lib/baseball/program-type-variants';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';

export type PublicProfileAccessReason =
  | 'self'
  | 'staff'
  | 'public'
  | 'not_found'
  | 'recruiting_off'
  | 'college_player'
  | 'profile_private'
  | 'program_disabled'
  | 'coaches_only';

export interface PublicProfileAccessResult {
  allowed: boolean;
  reason: PublicProfileAccessReason;
  displayName: string | null;
}

function formatName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || null;
}

async function coachHasTeamAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  teamId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('coach_id', coachId)
    .eq('team_id', teamId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Canonical public-profile gate (#401) — same contract as public stats RPC:
 * recruiting on, visibility public (or coaches_only for authenticated coaches),
 * program public_profiles_enabled, or explicit self/staff access.
 */
export async function resolvePublicProfileAccess(
  playerId: string,
  viewerUserId?: string | null,
): Promise<PublicProfileAccessResult> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id, user_id, first_name, last_name, recruiting_activated, player_type')
    .eq('id', playerId)
    .maybeSingle();

  if (!player) {
    return { allowed: false, reason: 'not_found', displayName: null };
  }

  const displayName = formatName(player.first_name, player.last_name);

  if (viewerUserId && player.user_id === viewerUserId) {
    return { allowed: true, reason: 'self', displayName };
  }

  let viewerCoachId: string | null = null;
  if (viewerUserId) {
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', viewerUserId)
      .maybeSingle();
    viewerCoachId = coach?.id ?? null;

    if (viewerCoachId) {
      const { data: memberships } = await supabase
        .from('baseball_team_members')
        .select('team_id')
        .eq('player_id', playerId);

      for (const membership of memberships ?? []) {
        if (await coachHasTeamAccess(supabase, viewerCoachId, membership.team_id)) {
          return { allowed: true, reason: 'staff', displayName };
        }
      }
    }
  }

  if (player.player_type === 'college') {
    return { allowed: false, reason: 'college_player', displayName: null };
  }

  if (!player.recruiting_activated) {
    return { allowed: false, reason: 'recruiting_off', displayName: null };
  }

  const { data: settings } = await supabase
    .from('baseball_player_settings')
    .select('profile_visibility')
    .eq('player_id', playerId)
    .maybeSingle();

  const visibility = settings?.profile_visibility ?? 'public';
  if (visibility === 'private') {
    return { allowed: false, reason: 'profile_private', displayName: null };
  }
  if (visibility === 'coaches_only' && !viewerCoachId) {
    return { allowed: false, reason: 'coaches_only', displayName: null };
  }

  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .limit(1)
    .maybeSingle();

  if (member?.team_id) {
    const { data: programSettings } = await fromUntyped(supabase, 'baseball_program_settings')
      .select('public_profiles_enabled')
      .eq('team_id', member.team_id)
      .maybeSingle();
    const { data: teamRow } = await fromUntyped(supabase, 'baseball_teams')
      .select('program_type')
      .eq('id', member.team_id)
      .maybeSingle();
    const programType = (
      (teamRow as { program_type?: string } | null)?.program_type ?? 'college'
    ) as BaseballProgramType;
    const defaults = getDefaultProgramSettings(programType);
    const publicEnabled = programSettings
      ? Boolean((programSettings as { public_profiles_enabled?: boolean }).public_profiles_enabled)
      : defaults.public_profiles_enabled;
    if (!publicEnabled) {
      return { allowed: false, reason: 'program_disabled', displayName: null };
    }
  }

  return { allowed: true, reason: visibility === 'coaches_only' ? 'coaches_only' : 'public', displayName };
}
