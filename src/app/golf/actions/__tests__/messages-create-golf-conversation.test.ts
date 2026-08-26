/**
 * Coverage for the withGolfAction retrofit on createGolfConversation.
 *
 * `createGolfConversation` throws hand-authored, user-safe messages (not raw
 * DB output) that callers read via `error.message` — see the docstring on
 * the export in ../messages.ts. withGolfAction is configured with
 * `sanitizeUnexpectedErrors: false`, and the two tenancy-denial messages
 * below are also anchored in observe-action-result.ts's
 * EXPECTED_SOFT_FAILURE_PATTERNS (severity 'warning', not 'error') — either
 * one is enough on its own to rethrow the original message unsanitized;
 * together they mean this denial no longer pages Sentry for routine misuse.
 *
 * The retrofit initially DROPPED the two `logServerError`-then-throw sites
 * this file used to hand-roll, on the theory that withGolfAction's own catch
 * covers the identical failure once, not twice. That went too far: the
 * wrapper's `contextFrom` only sees the ORIGINAL call args
 * (participantUserIds, teamId) and cannot see `user.id` or the resolved
 * `outsiders` list, both computed inside `fn` — so the denial's forensic
 * detail (who was denied, which recipients were rejected) was lost, not just
 * duplicated. createGolfConversationImpl now calls `captureGolfActionError`
 * with that detail immediately before each throw, so TWO logServerException
 * calls land per denial: the wrapper's generic one, and this identity-
 * carrying one. These tests pin both messages AND that pairing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let userFake: FakeSupabase;
let adminFake: FakeSupabase;

const { unvalidatedMock } = vi.hoisted(() => ({
  unvalidatedMock: vi.fn(async (participantUserIds: string[], teamId?: string) => ({
    conversationId: 'conv-1',
    participantUserIds,
    teamId,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => userFake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/app/actions/messages', () => ({
  createGolfConversation: unvalidatedMock,
  sendGolfMessage: vi.fn(),
  markGolfMessagesAsRead: vi.fn(),
  createGolfTeamBroadcast: vi.fn(),
  getGolfTeamPlayersForBroadcast: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
  getGolfPlayerUserId: vi.fn(),
  searchGolfMessages: vi.fn(),
  getGolfActiveTeamConversationIds: vi.fn(),
}));

vi.mock('@/app/golf/actions/message-attachments', () => ({
  sendGolfMessageWithAttachments: vi.fn(),
  getGolfMessageAttachments: vi.fn(),
  deleteGolfMessageAttachment: vi.fn(),
  getSignedUrlsForAttachments: vi.fn(),
}));

import { createGolfConversation } from '../messages';
import { logServerError, logServerException } from '@/lib/server-error-logger';

const TEAM_ID = 'team-1';

function makeAdminFake(): FakeSupabase {
  return createFakeSupabase({
    tables: {
      golf_teams: [{ id: TEAM_ID, organization_id: 'org-1' }],
      // Roster: player-1's account is user 'roster-user'.
      golf_team_members: [{ team_id: TEAM_ID, player_id: 'player-1' }],
      golf_players: [{ id: 'player-1', user_id: 'roster-user' }],
      // No explicit staff row — the coach resolves via the org fallback.
      golf_team_coach_staff: [],
      golf_coaches: [{ id: 'coach-1', user_id: 'coach-user', organization_id: 'org-1' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminFake = makeAdminFake();
  userFake = createFakeSupabase({ user: { id: 'coach-user' } });
});

describe('createGolfConversation — withGolfAction retrofit', () => {
  it('throws "Unauthorized" verbatim when nobody is signed in', async () => {
    userFake = createFakeSupabase({ user: null });
    await expect(createGolfConversation(['roster-user'], TEAM_ID)).rejects.toThrow('Unauthorized');
  });

  it('delegates to the shared implementation once the caller and every participant are in the team audience', async () => {
    const result = await createGolfConversation(['roster-user'], TEAM_ID);
    expect(result).toEqual({
      conversationId: 'conv-1',
      participantUserIds: ['roster-user'],
      teamId: TEAM_ID,
    });
    expect(unvalidatedMock).toHaveBeenCalledWith(['roster-user'], TEAM_ID);
  });

  it('throws the exact "not on this team" message, unsanitized, when the caller is outside the audience', async () => {
    userFake = createFakeSupabase({ user: { id: 'outsider-user' } });
    await expect(createGolfConversation(['roster-user'], TEAM_ID)).rejects.toThrow(
      'You do not have access to this team',
    );
    // Never the hand-rolled logServerError this file used before the
    // withGolfAction retrofit.
    expect(logServerError).not.toHaveBeenCalled();

    // withGolfAction's own catch records this denial generically, but its
    // contextFrom only sees the ORIGINAL call args — it cannot see `user.id`,
    // resolved inside fn. createGolfConversationImpl captures that identity
    // explicitly via captureGolfActionError before throwing, so it must NOT
    // be the wrapper's single log for this denial: two logServerException
    // calls, one carrying the denied caller's identity.
    expect(logServerException).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (logServerException as any).mock.calls as Array<[Error, Record<string, unknown>, string?]>;
    const identityCall = calls.find(([, ctx]) => ctx.userId === 'outsider-user');
    expect(identityCall).toBeDefined();
    expect(identityCall?.[1]).toMatchObject({ teamId: TEAM_ID, featureArea: 'golf-messaging' });
    // The wrapper's own generic call still fires, without that identity.
    expect(calls.some(([, ctx]) => ctx.userId == null)).toBe(true);
  });

  it('throws the exact "recipients not on this team" message, unsanitized, for an outsider participant', async () => {
    await expect(createGolfConversation(['stranger-user'], TEAM_ID)).rejects.toThrow(
      'One or more recipients are not on this team',
    );
    expect(logServerError).not.toHaveBeenCalled();

    // Same identity gap as above, plus the actual rejected recipient ids —
    // `outsiders` only exists inside fn and is otherwise lost the moment
    // this throws.
    expect(logServerException).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (logServerException as any).mock.calls as Array<[Error, Record<string, unknown>, string?]>;
    const identityCall = calls.find(([, ctx]) => ctx.userId === 'coach-user');
    expect(identityCall).toBeDefined();
    expect(identityCall?.[1]).toMatchObject({
      teamId: TEAM_ID,
      metadata: { outsiderCount: 1, outsiderIds: ['stranger-user'] },
    });
  });

  it('preserves the find-existing short-circuit when no teamId is given (nothing validated, nothing new written)', async () => {
    const result = await createGolfConversation(['roster-user']);
    expect(unvalidatedMock).toHaveBeenCalledWith(['roster-user'], undefined);
    expect(result).toMatchObject({ conversationId: 'conv-1' });
  });
});
