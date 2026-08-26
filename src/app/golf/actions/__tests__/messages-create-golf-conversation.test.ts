/**
 * Coverage for the withGolfAction retrofit on createGolfConversation.
 *
 * `createGolfConversation` throws hand-authored, user-safe messages (not raw
 * DB output) that callers read via `error.message` — see the docstring on
 * the export in ../messages.ts. withGolfAction is configured with
 * `sanitizeUnexpectedErrors: false` so those messages survive verbatim even
 * though none of them match the shared classifier's "expected" patterns
 * (the classifier tiers a real access denial as severity 'error'). These
 * tests pin that behavior, plus the two `logServerError`-then-throw sites
 * that used to be hand-rolled inline and are now the wrapper's job.
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
import { logServerError } from '@/lib/server-error-logger';

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
    // No more hand-rolled inline log for this denial — withGolfAction's own
    // catch is now the single place this failure gets recorded.
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('throws the exact "recipients not on this team" message, unsanitized, for an outsider participant', async () => {
    await expect(createGolfConversation(['stranger-user'], TEAM_ID)).rejects.toThrow(
      'One or more recipients are not on this team',
    );
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('preserves the find-existing short-circuit when no teamId is given (nothing validated, nothing new written)', async () => {
    const result = await createGolfConversation(['roster-user']);
    expect(unvalidatedMock).toHaveBeenCalledWith(['roster-user'], undefined);
    expect(result).toMatchObject({ conversationId: 'conv-1' });
  });
});
