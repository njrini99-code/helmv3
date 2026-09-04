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
import type { GolfMessageParticipantIdentity } from '@/lib/golf/message-participant-identity';
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
async function createGolfConversationImpl(participantUserIds: string[], teamId?: string, title?: string) {
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

  return title === undefined
    ? createGolfConversationUnvalidated(participantUserIds, teamId)
    : createGolfConversationUnvalidated(participantUserIds, teamId, title);
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
    contextFrom: (_participantUserIds: string[], teamId?: string, _title?: string) => ({ teamId: teamId ?? null }),
    sanitizeUnexpectedErrors: false,
  },
  createGolfConversationImpl,
);

/**
 * Resolve display-only identities for people who share a conversation with the
 * caller. The membership check happens before service-role reads, so this is
 * never a general people directory.
 *
 * `avatar_url` was historically populated only by one profile flow. Some
 * people have a real image in the public `avatars` bucket but a null roster
 * URL; Messaging should use that existing photo rather than manufacture
 * initials for them.
 */
export async function getGolfMessageParticipantIdentities(
  requestedConversationIds: string[],
): Promise<GolfMessageParticipantIdentity[]> {
  if (requestedConversationIds.length === 0) return [];

  const conversationIds = [...new Set(requestedConversationIds)]
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    .slice(0, 250);
  if (conversationIds.length === 0) return [];

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: callerMemberships, error: membershipError } = await supabase
      .from('golf_conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id)
      .in('conversation_id', conversationIds);
    if (membershipError) throw membershipError;

    const authorizedConversationIds = [...new Set(
      (callerMemberships ?? []).map((membership) => membership.conversation_id),
    )];
    if (authorizedConversationIds.length === 0) return [];

    const admin = createAdminClient();
    const { data: participantRows, error: participantError } = await admin
      .from('golf_conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', authorizedConversationIds);
    if (participantError) throw participantError;

    const conversationIdsByUserId = new Map<string, string[]>();
    for (const participant of participantRows ?? []) {
      const knownConversationIds = conversationIdsByUserId.get(participant.user_id) ?? [];
      if (!knownConversationIds.includes(participant.conversation_id)) {
        knownConversationIds.push(participant.conversation_id);
      }
      conversationIdsByUserId.set(participant.user_id, knownConversationIds);
    }
    const userIds = [...new Set((participantRows ?? []).map((participant) => participant.user_id))];
    if (userIds.length === 0) return [];

    const [{ data: coaches, error: coachError }, { data: players, error: playerError }] = await Promise.all([
      admin.from('golf_coaches').select('user_id, full_name, title, avatar_url').in('user_id', userIds),
      admin.from('golf_players').select('user_id, first_name, last_name, graduation_year, avatar_url').in('user_id', userIds),
    ]);
    if (coachError) throw coachError;
    if (playerError) throw playerError;

    // Objects are stored as `avatars/<user-id>/<file>`. Use the Storage API
    // instead of querying `storage.objects`: PostgREST deliberately does not
    // expose the storage schema, even to a service-role client.
    const avatarBucket = admin.storage.from('avatars');
    const { data: rootEntries, error: rootError } = await avatarBucket.list('', { limit: 1000 });
    if (rootError) throw rootError;
    const ownersWithImages = new Set((rootEntries ?? []).map((entry) => entry.name));
    const candidateOwnerIds = userIds.filter((id) => ownersWithImages.has(id));
    const storedAvatarByUserId = new Map<string, string>();
    await Promise.all(candidateOwnerIds.map(async (userId) => {
      const { data: files, error: fileError } = await avatarBucket.list(userId, {
        limit: 1,
        sortBy: { column: 'updated_at', order: 'desc' },
      });
      if (fileError || !files?.[0]) return;
      storedAvatarByUserId.set(userId, `${userId}/${files[0].name}`);
    }));
    const avatarUrlFor = (userId: string, linkedAvatar: string | null) => {
      if (linkedAvatar) return linkedAvatar;
      const path = storedAvatarByUserId.get(userId);
      return path ? avatarBucket.getPublicUrl(path).data.publicUrl : null;
    };

    const identities = new Map<string, GolfMessageParticipantIdentity>();
    for (const coach of coaches ?? []) {
      if (!coach.user_id) continue;
      identities.set(coach.user_id, {
        userId: coach.user_id,
        conversationIds: conversationIdsByUserId.get(coach.user_id) ?? [],
        name: coach.full_name || 'Coach',
        subtitle: coach.title || 'Golf Coach',
        avatarUrl: avatarUrlFor(coach.user_id, coach.avatar_url),
        type: 'coach',
      });
    }
    for (const player of players ?? []) {
      if (!player.user_id) continue;
      identities.set(player.user_id, {
        userId: player.user_id,
        conversationIds: conversationIdsByUserId.get(player.user_id) ?? [],
        name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player',
        subtitle: player.graduation_year ? `Class of ${player.graduation_year}` : 'Golf Player',
        avatarUrl: avatarUrlFor(player.user_id, player.avatar_url),
        type: 'player',
      });
    }
    return [...identities.values()];
  } catch (error) {
    await logServerError(
      `[getGolfMessageParticipantIdentities] ${describeError(error)}`,
      { action: 'messages.getGolfMessageParticipantIdentities' },
    );
    return [];
  }
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
