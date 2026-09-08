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
import { withGolfAction, captureGolfActionError } from '@/lib/golf/with-golf-action';
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
  getGolfGroupAddCandidates,
  addGolfGroupMember,
  removeGolfGroupMember,
  leaveGolfGroup,
} from '@/app/actions/messages';
import {
  sendGolfMessageWithAttachments,
  getGolfMessageAttachments,
  deleteGolfMessageAttachment,
  getSignedUrlsForAttachments,
} from './message-attachments';

const ACTION = 'golf.messages.createGolfConversation';
const MAX_IDENTITY_CONVERSATIONS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GolfConversationParticipantIdentity {
  conversationId: string;
  userId: string;
  name: string;
  subtitle: string;
  avatar: string | null;
  type: 'coach' | 'player' | 'member';
}

interface ConversationParticipantRow {
  conversation_id: string | null;
  user_id: string | null;
}

interface CoachIdentityRow {
  user_id: string | null;
  full_name: string | null;
  title: string | null;
  avatar_url: string | null;
}

interface PlayerIdentityRow {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  graduation_year: number | null;
  avatar_url: string | null;
}

/**
 * Resolve names for conversation members after proving the caller belongs to
 * each requested conversation. The profile tables intentionally remain behind
 * the service-role client: their customer-facing RLS policies hide some
 * legitimate historical counterparts. The caller's membership is checked
 * with the session client first, and only those conversation ids are sent to
 * the privileged lookup.
 */
export async function getGolfConversationParticipantIdentities(
  conversationIds: string[],
): Promise<{ participants: GolfConversationParticipantIdentity[]; error?: string }> {
  // Server actions are callable endpoints: do not trust the TypeScript
  // annotation at runtime, and bound the request before any database query.
  if (!Array.isArray(conversationIds) || conversationIds.length > MAX_IDENTITY_CONVERSATIONS) {
    return { participants: [], error: 'Invalid conversation ids' };
  }
  if (conversationIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    return { participants: [], error: 'Invalid conversation ids' };
  }
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) return { participants: [] };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { participants: [], error: 'Not authenticated' };

    // This is the authorization boundary. No service-role profile query runs
    // until the session client has proved membership for the requested ids.
    const { data: memberships, error: membershipError } = await supabase
      .from('golf_conversation_participants')
      .select('conversation_id')
      .in('conversation_id', ids)
      .eq('user_id', user.id);
    if (membershipError) {
      await logServerError(
        `[getGolfConversationParticipantIdentities] Membership probe failed: ${describeError(membershipError)}`,
        { action: 'messages.getGolfConversationParticipantIdentities' },
      );
      return { participants: [], error: 'Could not verify conversation access' };
    }

    const authorizedIds = [...new Set((memberships ?? [])
      .map((row) => row.conversation_id)
      .filter((id): id is string => typeof id === 'string' && ids.includes(id)))];
    if (authorizedIds.length === 0) return { participants: [] };

    const admin = createAdminClient();
    const { data: participantRows, error: participantError } = await admin
      .from('golf_conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', authorizedIds);
    if (participantError) {
      await logServerError(
        `[getGolfConversationParticipantIdentities] Participant lookup failed: ${describeError(participantError)}`,
        { action: 'messages.getGolfConversationParticipantIdentities' },
      );
      return { participants: [], error: 'Could not load conversation members' };
    }

    const rows = (participantRows ?? []) as ConversationParticipantRow[];
    const userIds = [...new Set(rows
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (userIds.length === 0) return { participants: [] };

    // Query only profile rows belonging to already-authorized conversation
    // members. Never select users.email or query a global directory.
    const [{ data: coaches, error: coachError }, { data: players, error: playerError }] = await Promise.all([
      admin
        .from('golf_coaches')
        .select('user_id, full_name, title, avatar_url')
        .in('user_id', userIds),
      admin
        .from('golf_players')
        .select('user_id, first_name, last_name, graduation_year, avatar_url')
        .in('user_id', userIds),
    ]);
    if (coachError || playerError) {
      await logServerError(
        `[getGolfConversationParticipantIdentities] Profile lookup failed: ${describeError(coachError ?? playerError)}`,
        { action: 'messages.getGolfConversationParticipantIdentities' },
      );
      return { participants: [], error: 'Could not load conversation identities' };
    }

    const coachByUserId = new Map<string, CoachIdentityRow>();
    for (const coach of (coaches ?? []) as CoachIdentityRow[]) {
      if (coach.user_id) coachByUserId.set(coach.user_id, coach);
    }
    const playerByUserId = new Map<string, PlayerIdentityRow>();
    for (const player of (players ?? []) as PlayerIdentityRow[]) {
      if (player.user_id) playerByUserId.set(player.user_id, player);
    }

    const seen = new Set<string>();
    const participants: GolfConversationParticipantIdentity[] = [];
    for (const row of rows) {
      if (!row.conversation_id || !row.user_id) continue;
      const key = `${row.conversation_id}:${row.user_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const coach = coachByUserId.get(row.user_id);
      if (coach) {
        participants.push({
          conversationId: row.conversation_id,
          userId: row.user_id,
          name: coach.full_name?.trim() || 'Coach',
          subtitle: coach.title?.trim() || 'Golf Coach',
          avatar: coach.avatar_url,
          type: 'coach',
        });
        continue;
      }

      const player = playerByUserId.get(row.user_id);
      if (player) {
        participants.push({
          conversationId: row.conversation_id,
          userId: row.user_id,
          name: [player.first_name, player.last_name].filter(Boolean).join(' ').trim() || 'Player',
          subtitle: player.graduation_year ? `Class of ${player.graduation_year}` : 'Golf Player',
          avatar: player.avatar_url,
          type: 'player',
        });
        continue;
      }

      participants.push({
        conversationId: row.conversation_id,
        userId: row.user_id,
        name: 'Conversation member',
        subtitle: '',
        avatar: null,
        type: 'member',
      });
    }

    return { participants };
  } catch (error) {
    await logServerError(
      `[getGolfConversationParticipantIdentities] ${describeError(error)}`,
      { action: 'messages.getGolfConversationParticipantIdentities' },
    );
    return { participants: [], error: 'Could not load conversation identities' };
  }
}

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
 *
 * Wrapped in `withGolfAction` (see src/lib/golf/with-golf-action.ts) for the
 * shared classify -> RLS-denial-capture -> log sequence this file used to
 * hand-roll at the two `logServerError`-then-`throw` sites below.
 * `sanitizeUnexpectedErrors: false` keeps every thrown message here exactly
 * as authored: none of them are raw DB output (`AUDIENCE_UNAVAILABLE` and
 * the two denials below are hand-written, user-safe strings), and callers
 * read `error.message` directly, so the wrapper's default generic-message
 * sanitization would only replace a specific, actionable denial with a
 * useless one.
 *
 * The two tenancy denials below (not `AUDIENCE_UNAVAILABLE`, which is a real
 * infra failure, not a denial) additionally call `captureGolfActionError`
 * immediately before throwing — a second, deliberate log call, not
 * redundancy left over from the retrofit. The wrapper's own catch classifies
 * and logs every throw generically, but its `contextFrom` only sees the
 * ORIGINAL call args (`participantUserIds`, `teamId`); it cannot see
 * `user.id` or the resolved `outsiders` list, both computed here inside
 * `fn`. Losing who was denied and which recipients were rejected on an
 * authorization-denial path is a worse outcome than one extra
 * `logServerException` row per denial, so this file captures that identity
 * explicitly rather than relying on the generic wrapper log to carry it.
 */
async function createGolfConversationImpl(participantUserIds: string[], teamId?: string) {
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
      // withGolfAction's own catch below still logs this throw, but its
      // `contextFrom` only sees the ORIGINAL call args (participantUserIds,
      // teamId) — it has no way to see `user.id`, which is resolved here
      // inside `fn`. On a security-relevant denial like this, losing WHO was
      // denied is worse than one extra admin_events row for the same event,
      // so capture the identity explicitly before throwing.
      const error = new Error('You do not have access to this team');
      captureGolfActionError(error, {
        action: ACTION,
        featureArea: 'golf-messaging',
        feature: 'messaging',
        userId: user.id,
        userEmail: user.email,
        teamId,
        rls: { table: 'golf_conversation_participants', verb: 'insert' },
      });
      throw error;
    }

    const outsiders = requestedIds.filter((id) => !audience.has(id));
    if (outsiders.length > 0) {
      // Same gap as above, plus the actual target: `outsiders` only exists
      // inside `fn` and is lost the moment this throws unless captured here.
      // Never put the ids in the thrown MESSAGE — `sanitizeUnexpectedErrors:
      // false` on the wrapper rethrows this unsanitized to the caller, and
      // the ids belong in server-side telemetry, not in a response body.
      const error = new Error('One or more recipients are not on this team');
      captureGolfActionError(error, {
        action: ACTION,
        featureArea: 'golf-messaging',
        feature: 'messaging',
        userId: user.id,
        userEmail: user.email,
        teamId,
        rls: { table: 'golf_conversation_participants', verb: 'insert' },
        metadata: { outsiderCount: outsiders.length, outsiderIds: outsiders },
      });
      throw error;
    }
  }

  return createGolfConversationUnvalidated(participantUserIds, teamId);
}

export const createGolfConversation = withGolfAction(
  'createGolfConversation',
  {
    featureArea: 'golf-messaging',
    feature: 'messaging',
    // The delegate's real write is the participant fan-out, not the
    // conversation row itself — see resolveGolfTeamAudience's own docstring
    // and src/app/actions/messages.ts's createGolfConversationImpl.
    rlsContext: { table: 'golf_conversation_participants', verb: 'insert' },
    contextFrom: (_participantUserIds: string[], teamId?: string) => ({ teamId: teamId ?? null }),
    sanitizeUnexpectedErrors: false,
  },
  createGolfConversationImpl,
);

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
  // Group membership. Unlike createGolfConversation these are NOT re-declared
  // with an extra audience probe: the shared implementations are already
  // bounded to the conversation's own team by RLS (a candidate must satisfy
  // golf_user_on_conversation_team, and the actor must be the creator), so
  // there is no wider audience here for a probe to narrow.
  getGolfGroupAddCandidates,
  addGolfGroupMember,
  removeGolfGroupMember,
  leaveGolfGroup,
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
