import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import type { CoachType } from '@/app/baseball/actions/discover';
import {
  getCoachRosterPlayerIds,
  isPlayerProfilePrivate,
} from '@/lib/baseball/player-visibility';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type RecruitabilityDenialReason =
  | 'player_not_found'
  | 'recruiting_off'
  | 'college_player'
  | 'coach_type_mismatch'
  | 'on_own_roster'
  | 'not_on_discoverable_team'
  | 'profile_private';

export interface RecruitabilityResult {
  allowed: boolean;
  reason?: RecruitabilityDenialReason;
}

async function getDiscoverableTeamPlayerIds(supabase: Supabase): Promise<Set<string>> {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .in('type', ['high_school', 'showcase', 'juco']);

  if (!orgs?.length) return new Set();

  const orgIds = orgs.map((o) => o.id);
  const { data: teams } = await supabase
    .from('baseball_teams')
    .select('id')
    .in('organization_id', orgIds);

  if (!teams?.length) return new Set();

  const teamIds = teams.map((t) => t.id);
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  return new Set((members ?? []).map((m) => m.player_id).filter(Boolean));
}

/**
 * Server-side recruitability gate — mirrors Discover eligibility (#402).
 * Call before watchlist writes and recruiting engagement events.
 */
export async function assertCoachCanRecruitPlayer(
  supabase: Supabase,
  coachId: string,
  coachType: CoachType,
  playerId: string,
): Promise<RecruitabilityResult> {
  if (coachType === 'high_school' || coachType === 'showcase') {
    return { allowed: false, reason: 'coach_type_mismatch' };
  }

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id, recruiting_activated, player_type')
    .eq('id', playerId)
    .maybeSingle();

  if (!player) {
    return { allowed: false, reason: 'player_not_found' };
  }

  if (player.player_type === 'college') {
    return { allowed: false, reason: 'college_player' };
  }

  if (!player.recruiting_activated) {
    return { allowed: false, reason: 'recruiting_off' };
  }

  if (coachType === 'juco' && player.player_type === 'juco') {
    return { allowed: false, reason: 'coach_type_mismatch' };
  }

  if (await isPlayerProfilePrivate(supabase, playerId)) {
    return { allowed: false, reason: 'profile_private' };
  }

  const rosterIds = await getCoachRosterPlayerIds(supabase, coachId);
  if (rosterIds.has(playerId)) {
    return { allowed: false, reason: 'on_own_roster' };
  }

  const discoverableIds = await getDiscoverableTeamPlayerIds(supabase);
  if (!discoverableIds.has(playerId)) {
    return { allowed: false, reason: 'not_on_discoverable_team' };
  }

  return { allowed: true };
}
