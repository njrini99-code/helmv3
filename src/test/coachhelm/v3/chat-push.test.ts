/**
 * W32 — pushTravelBriefToChat unit tests.
 *
 * Uses fake-supabase to verify the correct insert shape without a real DB.
 */

import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { pushTravelBriefToChat } from '@/lib/coachhelm/v3/qualifying/chat-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Sb = SupabaseClient<Database>;

function fakeWithConversations(conversations: Record<string, unknown>[] = []) {
  return createFakeSupabase({
    tables: {
      golf_coachhelm_chat_conversations: conversations,
      golf_coachhelm_chat_messages: [],
    },
  }) as unknown as Sb;
}

describe('pushTravelBriefToChat', () => {
  it('creates a new conversation when none exists', async () => {
    const sb = fakeWithConversations([]);
    await pushTravelBriefToChat(sb, 'coach-1', '# Brief content');

    const { data: convos } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_conversations')
      .select('*');
    expect(convos).toHaveLength(1);
    expect((convos![0] as Record<string, unknown>).coach_id).toBe('coach-1');
    expect((convos![0] as Record<string, unknown>).title).toBe('Qualifying Updates');
  });

  it('reuses existing conversation with matching title', async () => {
    const sb = fakeWithConversations([
      {
        id: 'conv-existing',
        coach_id: 'coach-1',
        title: 'Qualifying Updates',
        pinned: false,
        archived_at: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    ]);
    await pushTravelBriefToChat(sb, 'coach-1', '# Another brief');

    const { data: convos } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_conversations')
      .select('*');
    expect(convos).toHaveLength(1);
  });

  it('inserts an assistant message with the brief content', async () => {
    const sb = fakeWithConversations([]);
    const briefText = '## Travel Brief\n\nSelected players...';
    await pushTravelBriefToChat(sb, 'coach-1', briefText);

    const { data: msgs } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_messages')
      .select('*');
    expect(msgs).toHaveLength(1);
    const msg = msgs![0] as Record<string, unknown>;
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe(briefText);
  });

  it('links message to the correct conversation', async () => {
    const sb = fakeWithConversations([
      {
        id: 'conv-42',
        coach_id: 'coach-1',
        title: 'Qualifying Updates',
        pinned: false,
        archived_at: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    ]);
    await pushTravelBriefToChat(sb, 'coach-1', 'brief');

    const { data: msgs } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_messages')
      .select('*');
    expect((msgs![0] as Record<string, unknown>).conversation_id).toBe('conv-42');
  });
});
