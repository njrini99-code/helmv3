import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const LIVE_REPLY_ID = '33333333-3333-4333-8333-333333333333';
const DELETED_REPLY_ID = '44444444-4444-4444-8444-444444444444';

let supabase: FakeSupabase;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => supabase) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({
  notifyGolfMessageRecipients: vi.fn(async () => {}),
}));

import { sendMessage } from '../messages';

function participantFake(messages: Array<Record<string, unknown>>): FakeSupabase {
  return createFakeSupabase({
    user: { id: 'golfer-user' },
    tables: {
      golf_conversation_participants: [
        { id: 'participant-1', conversation_id: CONVERSATION_ID, user_id: 'golfer-user' },
      ],
      golf_conversations: [{ id: CONVERSATION_ID }],
      golf_messages: messages,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendMessage — golf reply target boundary', () => {
  it('accepts a live reply target from the same conversation', async () => {
    supabase = participantFake([
      { id: LIVE_REPLY_ID, conversation_id: CONVERSATION_ID, is_deleted: false },
    ]);

    await expect(sendMessage({
      conversationId: CONVERSATION_ID,
      content: 'Following up',
      sport: 'golf',
      createNotifications: false,
      replyToId: LIVE_REPLY_ID,
    })).resolves.toEqual({ success: true });
  });

  it('rejects a reply target from another conversation as unavailable', async () => {
    supabase = participantFake([
      { id: LIVE_REPLY_ID, conversation_id: OTHER_CONVERSATION_ID, is_deleted: false },
    ]);

    await expect(sendMessage({
      conversationId: CONVERSATION_ID,
      content: 'Following up',
      sport: 'golf',
      createNotifications: false,
      replyToId: LIVE_REPLY_ID,
    })).resolves.toEqual({ success: false, error: 'Reply message is unavailable' });
  });

  it('rejects a deleted reply target as unavailable', async () => {
    supabase = participantFake([
      { id: DELETED_REPLY_ID, conversation_id: CONVERSATION_ID, is_deleted: true },
    ]);

    await expect(sendMessage({
      conversationId: CONVERSATION_ID,
      content: 'Following up',
      sport: 'golf',
      createNotifications: false,
      replyToId: DELETED_REPLY_ID,
    })).resolves.toEqual({ success: false, error: 'Reply message is unavailable' });
  });
});
