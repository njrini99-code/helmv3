import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let userClient: FakeSupabase;
let adminClient: FakeSupabase;
const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(() => adminClient),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => userClient),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));

import { getGolfConversationParticipantIdentities } from '../messages';

describe('getGolfConversationParticipantIdentities', () => {
  const oldDmId = '11111111-1111-4111-8111-111111111111';
  const privateDmId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    userClient = createFakeSupabase({
      user: { id: 'viewer' },
      tables: {
        golf_conversation_participants: [
          { conversation_id: oldDmId, user_id: 'viewer' },
        ],
      },
    });
    adminClient = createFakeSupabase({
      tables: {
        golf_conversation_participants: [
          { conversation_id: oldDmId, user_id: 'viewer' },
          { conversation_id: oldDmId, user_id: 'legacy-coach' },
          { conversation_id: privateDmId, user_id: 'other-user' },
        ],
        golf_coaches: [
          { user_id: 'legacy-coach', full_name: '  Legacy Coach  ', title: 'Head Coach', avatar_url: '/coach.png' },
          { user_id: 'other-user', full_name: 'Private User', title: 'Hidden', avatar_url: '/private.png' },
        ],
        golf_players: [],
      },
    });
  });

  it('resolves historical DM members only after session membership is proven', async () => {
    const result = await getGolfConversationParticipantIdentities([oldDmId, privateDmId]);

    expect(result).toEqual({
      participants: [
        {
          conversationId: oldDmId,
          userId: 'viewer',
          name: 'Conversation member',
          subtitle: '',
          avatar: null,
          type: 'member',
        },
        {
          conversationId: oldDmId,
          userId: 'legacy-coach',
          name: 'Legacy Coach',
          subtitle: 'Head Coach',
          avatar: '/coach.png',
          type: 'coach',
        },
      ],
    });
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(result.participants.every((participant) => !('email' in participant))).toBe(true);
  });

  it('does not perform a privileged lookup for an unauthenticated caller', async () => {
    userClient = createFakeSupabase({ user: null });

    await expect(getGolfConversationParticipantIdentities([oldDmId])).resolves.toEqual({
      participants: [],
      error: 'Not authenticated',
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects malformed or oversized input before membership or profile queries', async () => {
    await expect(getGolfConversationParticipantIdentities(['not-a-uuid'])).resolves.toEqual({
      participants: [],
      error: 'Invalid conversation ids',
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();

    await expect(getGolfConversationParticipantIdentities(
      Array.from({ length: 101 }, (_, index) => `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`),
    )).resolves.toEqual({
      participants: [],
      error: 'Invalid conversation ids',
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
