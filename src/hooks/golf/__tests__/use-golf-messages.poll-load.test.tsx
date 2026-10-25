/**
 * A poll (premium features P-2) must arrive from the DATABASE as a poll.
 *
 * A poll is `kind = 'poll'` with its question in `payload`; Clubhouse draws the
 * card from those two columns and falls back to the plain-text `content`
 * without them. The thread fetch did not select them, so a poll drew as a card
 * only for whoever had the thread open when the realtime INSERT (the full row)
 * arrived, and as text for everyone who opened the thread later: the same
 * shape as the has_attachments bug (use-golf-messages.attachment-flag.test.ts).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION = 'poll-conversation';
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  attachmentSend: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getUser: vi.fn(),
  rows: [] as Record<string, unknown>[],
  projections: [] as string[],
  inserted: null as null | ((payload: { new: Record<string, unknown> }) => void),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: mock.getUser },
  storage: { from: () => ({ remove: mock.remove }) },
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['eq', 'in', 'neq', 'not', 'gt', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.select = (fields: string) => { if (table === 'golf_messages') mock.projections.push(fields); return chain; };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'golf_messages' ? [...mock.rows] : [], error: null }).then(resolve);
    return chain;
  },
  channel: () => {
    const channel = {
      on: (_kind: string, filter: { table?: string; event?: string }, callback: typeof mock.inserted) => {
        if (filter.table === 'golf_messages' && filter.event === 'INSERT') mock.inserted = callback;
        return channel;
      },
      subscribe: () => channel,
      send: vi.fn(),
    };
    return channel;
  },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
  markGolfMessagesAsRead: async () => ({ success: true }),
  sendGolfMessage: mock.send,
  sendGolfMessageWithAttachments: mock.attachmentSend,
  updateGolfMessage: vi.fn(), deleteGolfMessage: vi.fn(),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/lib/storage/attachments', () => ({ uploadAttachment: mock.upload, STORAGE_BUCKET: 'golf-attachments' }));

import { useGolfMessages } from '../use-golf-messages';
import { __resetCachedResourcesForTests } from '@/lib/golf/client-resource-cache';

const POLL_PAYLOAD = { v: 1, question: 'Van time?', options: [{ id: 'o1', label: '7:00' }, { id: 'o2', label: '7:30' }] };

beforeEach(() => {
  __resetCachedResourcesForTests();
  window.sessionStorage.clear();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null });
  mock.rows = [];
  mock.projections = [];
  mock.inserted = null;
});

async function loadedHook() {
  const hook = renderHook(() => useGolfMessages(CONVERSATION, 'viewer', { deferMarkRead: true }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useGolfMessages · a poll loads as a poll (P-2)', () => {
  it('selects kind and payload on the thread fetch, beside the columns it already needed', async () => {
    await loadedHook();
    const fields = mock.projections[0]?.split(',').map((field) => field.trim()) ?? [];
    expect(fields).toEqual(expect.arrayContaining(['kind', 'payload', 'content', 'has_attachments', 'reply_to_id']));
  });

  it('keeps a loaded poll row\'s kind and payload, so the thread draws the card on open', async () => {
    mock.rows = [{
      id: 'poll-1', conversation_id: CONVERSATION, sender_id: 'coach', content: 'Poll: Van time?\n7:00\n7:30',
      created_at: '2026-10-24T12:00:00Z', is_deleted: false, kind: 'poll', payload: POLL_PAYLOAD,
    }];
    const { result } = await loadedHook();
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ kind: 'poll', payload: POLL_PAYLOAD });
  });
});
