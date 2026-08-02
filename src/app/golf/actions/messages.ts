/**
 * Golf Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * and attachment actions from @/app/golf/actions/message-attachments
 * Maintained for backward compatibility with existing imports.
 *
 * NOT a pure re-export shim any more: `createGolfConversation` is re-declared
 * here so the golf surface gets participant-tenancy validation before the
 * shared implementation inserts participant rows (see the note on that
 * function). Everything else is still a straight re-export.
 */
'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  sendGolfMessage,
  createGolfConversation as createGolfConversationUnvalidated,
  markGolfMessagesAsRead,
  createGolfTeamBroadcast,
  getGolfTeamPlayersForBroadcast,
  updateGolfMessage,
  deleteGolfMessage,
  getGolfPlayerUserId,
  searchGolfMessages,
  getGolfActiveTeamConversationIds,
} from '@/app/actions/messages';
import {
  sendGolfMessageWithAttachments,
  getGolfMessageAttachments,
  deleteGolfMessageAttachment,
  getSignedUrlsForAttachments,
} from './message-attachments';

const ACTION = 'golf.messages.createGolfConversation';

/** Probe failed — we never learned the answer, so we cannot grant access. */
const AUDIENCE_UNAVAILABLE = 'Could not verify team access. Please try again.';

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
async function resolveGolfTeamAudience(teamId: string): Promise<Set<string> | null> {
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
 * Create (or find) a golf conversation, validating participant tenancy first.
 *
 * The shared implementation inserts every caller-supplied participant user id
 * verbatim, and RLS does not stop it: `golf_participants_insert_v2`
 * deliberately lets the conversation CREATOR add any user_id. So a caller who
 * knows an arbitrary auth user id could add that user to a conversation on a
 * team they have nothing to do with, and the next `sendGolfMessage` would fan
 * an email/push out to them from Helm's own infrastructure. This wrapper is
 * the gate: the caller and every requested participant must belong to
 * `teamId`'s audience (roster + that team's coaches) before anything is
 * written.
 *
 * When `teamId` is absent nothing is validated here, and nothing can be
 * created either: the shared implementation requires a team id for every golf
 * conversation and throws without one. The only path that still succeeds is
 * its find-existing short-circuit, which returns a conversation the caller is
 * already a participant of — no new participant row, no new recipient. That
 * behaviour is preserved exactly.
 *
 * Return shape is unchanged (`{ conversationId }`, throwing on failure) —
 * callers read `result.conversationId` directly.
 */
export async function createGolfConversation(participantUserIds: string[], teamId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (teamId) {
    const requestedIds = [...new Set(participantUserIds.filter(Boolean))].filter(
      (id) => id !== user.id,
    );

    const audience = await resolveGolfTeamAudience(teamId);
    if (!audience) {
      throw new Error(AUDIENCE_UNAVAILABLE);
    }

    if (!audience.has(user.id)) {
      await logServerError(
        `[createGolfConversation] Caller is not part of team ${teamId}`,
        { action: ACTION, metadata: { teamId, userId: user.id } },
      );
      throw new Error('You do not have access to this team');
    }

    const outsiders = requestedIds.filter((id) => !audience.has(id));
    if (outsiders.length > 0) {
      await logServerError(
        `[createGolfConversation] Rejected ${outsiders.length} participant(s) outside team ${teamId}`,
        { action: ACTION, metadata: { teamId, userId: user.id, outsiders } },
      );
      throw new Error('One or more recipients are not on this team');
    }
  }

  return createGolfConversationUnvalidated(participantUserIds, teamId);
}

export {
  // Golf messaging functions
  sendGolfMessage,
  markGolfMessagesAsRead,
  createGolfTeamBroadcast,
  getGolfTeamPlayersForBroadcast,
  updateGolfMessage,
  deleteGolfMessage,
  getGolfPlayerUserId,
  searchGolfMessages,
  getGolfActiveTeamConversationIds,
  // Alias for backward compatibility
  getGolfPlayerUserId as getPlayerUserId,
  // Attachment actions
  sendGolfMessageWithAttachments,
  getGolfMessageAttachments,
  deleteGolfMessageAttachment,
  getSignedUrlsForAttachments,
};

// NOTE: do NOT re-export types from this module with `export type { … }`.
// Next.js's 'use server' transform registers every name in an export
// specifier list as a server action, so the emitted module evaluates a
// runtime reference to a type that does not exist — `ReferenceError:
// MessageSearchResult is not defined` — which takes down EVERY action on
// this surface (send, mark-as-read, edit, delete), not just the type.
// `export interface`/`export type X = …` declarations are erased normally
// and stay safe; only the specifier-list form leaks. Consumers import
// these types from their canonical plain modules instead:
//   MessageSearchResult  → '@/app/actions/messages'
//   AttachmentUploadData → '@/app/golf/actions/message-attachments'
