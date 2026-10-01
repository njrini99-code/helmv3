import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const ACTION = 'golf.messages.createGolfConversation';

/**
 * Every auth user id that may take part in a conversation scoped to `teamId`.
 *
 * Deliberately the SAME audience the new-message picker offers
 * (FairwayNewMessageSheet): the team's roster (golf_team_members →
 * golf_players) plus the coaches of that team — both the explicitly staffed
 * ones (golf_team_coach_staff → golf_coaches, the canonical team-scoped
 * relation) and the coaches of the owning organization, which is how a coach
 * with no staff row still resolves a team (see resolve-team.ts). Building the
 * set as a superset of what the UI can offer means this check can only reject
 * a participant the UI would never have proposed.
 *
 * Read with the SERVICE-ROLE client on purpose. This set is only ever used to
 * DENY, so reading it under the caller's RLS would turn a policy that hides a
 * row from that caller into a false "not on this team" rejection of a
 * legitimate teammate. Nothing here is returned to the caller — only
 * membership booleans are.
 *
 * Returns `null` when the probe itself failed (team missing, or a query
 * errored). `null` is NOT "empty audience"; callers must treat it as unknown
 * and fail closed rather than as a denial they can describe.
 */
export async function resolveGolfTeamAudience(teamId: string): Promise<Set<string> | null> {
  const admin = createAdminClient();

  const { data: team, error: teamError } = await admin
    .from('golf_teams')
    .select('id, organization_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError || !team) {
    await logServerError(
      `[createGolfConversation] Team lookup failed for team ${teamId}: ${describeError(teamError)}`,
      { action: ACTION, metadata: { teamId } },
    );
    return null;
  }

  const audience = new Set<string>();

  // Roster: golf_team_members → golf_players.user_id
  const { data: members, error: membersError } = await admin
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId);

  if (membersError) {
    await logServerError(
      `[createGolfConversation] Roster lookup failed for team ${teamId}: ${describeError(membersError)}`,
      { action: ACTION, metadata: { teamId } },
    );
    return null;
  }

  const playerIds = (members ?? []).map((m) => m.player_id).filter(Boolean);
  if (playerIds.length > 0) {
    const { data: players, error: playersError } = await admin
      .from('golf_players')
      .select('user_id')
      .in('id', playerIds);

    if (playersError) {
      await logServerError(
        `[createGolfConversation] Player lookup failed for team ${teamId}: ${describeError(playersError)}`,
        { action: ACTION, metadata: { teamId } },
      );
      return null;
    }

    for (const player of players ?? []) {
      if (player.user_id) audience.add(player.user_id);
    }
  }

  // Staffed coaches: golf_team_coach_staff → golf_coaches.user_id
  const { data: staff, error: staffError } = await admin
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', teamId);

  if (staffError) {
    await logServerError(
      `[createGolfConversation] Coach staff lookup failed for team ${teamId}: ${describeError(staffError)}`,
      { action: ACTION, metadata: { teamId } },
    );
    return null;
  }

  const staffCoachIds = (staff ?? []).map((s) => s.coach_id).filter(Boolean);
  if (staffCoachIds.length > 0) {
    const { data: staffCoaches, error: staffCoachesError } = await admin
      .from('golf_coaches')
      .select('user_id')
      .in('id', staffCoachIds);

    if (staffCoachesError) {
      await logServerError(
        `[createGolfConversation] Staff coach lookup failed for team ${teamId}: ${describeError(staffCoachesError)}`,
        { action: ACTION, metadata: { teamId } },
      );
      return null;
    }

    for (const coach of staffCoaches ?? []) {
      if (coach.user_id) audience.add(coach.user_id);
    }
  }

  // Organization coaches — the same fallback the picker and resolve-team.ts use
  // for coaches who have no golf_team_coach_staff row yet. Still tenant-scoped:
  // the org comes from the team row, never from the caller.
  if (team.organization_id) {
    const { data: orgCoaches, error: orgCoachesError } = await admin
      .from('golf_coaches')
      .select('user_id')
      .eq('organization_id', team.organization_id);

    if (orgCoachesError) {
      await logServerError(
        `[createGolfConversation] Org coach lookup failed for team ${teamId}: ${describeError(orgCoachesError)}`,
        { action: ACTION, metadata: { teamId } },
      );
      return null;
    }

    for (const coach of orgCoaches ?? []) {
      if (coach.user_id) audience.add(coach.user_id);
    }
  }

  return audience;
}

/**
 * Throws unless the caller and every requested participant are in `teamId`'s
 * audience. Called by the shared createConversation for every golf
 * conversation, so no exported entry point can add an outsider: the golf
 * wrapper in actions/golf/messages.ts runs the same check first with richer
 * telemetry, and this is the floor under every other path.
 */
export async function assertGolfConversationAudience(
  callerUserId: string,
  participantUserIds: string[],
  teamId: string,
): Promise<void> {
  const audience = await resolveGolfTeamAudience(teamId);
  if (!audience) throw new Error('Could not verify team access. Please try again.');
  if (!audience.has(callerUserId)) throw new Error('You do not have access to this team');
  const outsiders = participantUserIds.filter((id) => id && id !== callerUserId && !audience.has(id));
  if (outsiders.length > 0) throw new Error('One or more recipients are not on this team');
}
