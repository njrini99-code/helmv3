import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION = 'reply-conversation';
const PARENT = '66666666-6666-4666-8666-666666666666';
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  attachmentSend: vi.fn(),
  upload: vi.fn(),
  rows: [] as Record<string, unknown>[],
  projections: [] as string[],
  inserted: null as null | ((payload: { new: Record<string, unknown> }) => void),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
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
import { useMessageAttachments } from '../use-message-attachments';
import { __resetCachedResourcesForTests } from '@/lib/golf/client-resource-cache';

beforeEach(() => {
  __resetCachedResourcesForTests();
  mock.rows = [];
  mock.projections = [];
  mock.inserted = null;
  mock.send.mockReset().mockResolvedValue({ success: true });
  mock.attachmentSend.mockReset().mockResolvedValue({ success: true });
  mock.upload.mockReset();
});

async function loadedHook() {
  const hook = renderHook(() => useGolfMessages(CONVERSATION, 'viewer', { deferMarkRead: true }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('Golf replies across message loading and send lifecycle', () => {
  it('fetches and retains a persisted reply link without inventing an unloaded parent', async () => {
    mock.rows = [{ id: 'child', conversation_id: CONVERSATION, sender_id: 'other', content: 'Reply text', created_at: '2026-10-02T12:00:00Z', reply_to_id: PARENT }];
    const { result } = await loadedHook();
    expect(mock.projections[0]?.split(',').map(field => field.trim())).toContain('reply_to_id');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.reply_to_id).toBe(PARENT);
    expect(result.current.messages.some(message => message.id === PARENT)).toBe(false);
  });

  it('preserves the quoted parent in optimistic state, refusal, and manual Retry with the same message ID', async () => {
    let resolveSend!: (value: { success: boolean; error: string }) => void;
    mock.send.mockImplementationOnce(() => new Promise(resolve => { resolveSend = resolve; }));
    const { result } = await loadedHook();
    let sending!: Promise<unknown>;
    act(() => { sending = result.current.sendMessage('Reply text', PARENT).catch(error => error); });
    const optimistic = result.current.messages[0]!;
    expect(optimistic.reply_to_id).toBe(PARENT);
    expect(mock.send).toHaveBeenLastCalledWith(CONVERSATION, 'Reply text', optimistic.id, PARENT);
    await act(async () => { resolveSend({ success: false, error: 'Denied' }); await sending; });
    expect(result.current.messages[0]).toMatchObject({ id: optimistic.id, reply_to_id: PARENT, sendFailed: true });
    await act(async () => { expect(await result.current.retryMessage(optimistic.id)).toBe(true); });
    expect(mock.send).toHaveBeenLastCalledWith(CONVERSATION, 'Reply text', optimistic.id, PARENT);
    expect(result.current.messages[0]).toMatchObject({ id: optimistic.id, reply_to_id: PARENT, sendFailed: false });
  });

  it('reuses the reply target and optimistic ID after a Safari transport failure', async () => {
    mock.send.mockRejectedValueOnce(new TypeError('Load failed'));
    const { result } = await loadedHook();
    await act(async () => { expect(await result.current.sendMessage('Reply text', PARENT)).toBe(true); });
    expect(mock.send).toHaveBeenCalledTimes(2);
    expect(mock.send.mock.calls[1]).toEqual(mock.send.mock.calls[0]);
    expect(mock.send.mock.calls[0]?.[3]).toBe(PARENT);
  });

  it('reconciles a realtime reply with its optimistic row using the server link', async () => {
    const { result } = await loadedHook();
    await act(async () => { await result.current.sendMessage('Reply text', PARENT); });
    const optimistic = result.current.messages[0]!;
    act(() => { mock.inserted?.({ new: { ...optimistic, reply_to_id: PARENT } }); });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ id: optimistic.id, reply_to_id: PARENT });
  });

  it('preserves ordinary sends as the existing three-argument action call', async () => {
    const { result } = await loadedHook();
    await act(async () => { await result.current.sendMessage('Plain text'); });
    expect(mock.send.mock.calls[0]).toHaveLength(3);
    expect(result.current.messages[0]?.reply_to_id).toBeNull();
  });

  it('forwards an attachment reply link and leaves omitted replies as the original action signature', async () => {
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT }); });
    expect(mock.attachmentSend).toHaveBeenLastCalledWith(CONVERSATION, 'Reply text', [], PARENT);
    await act(async () => { await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Plain text' }); });
    expect(mock.attachmentSend).toHaveBeenLastCalledWith(CONVERSATION, 'Plain text', []);
  });

  it('keeps the reply target while uploading and sending a real attachment metadata payload', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => {
      await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
        attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg', { type: 'image/jpeg' }), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] });
    });
    expect(mock.upload).toHaveBeenCalledTimes(1);
    expect(mock.attachmentSend).toHaveBeenLastCalledWith(CONVERSATION, 'Reply text', [expect.objectContaining({ ...metadata, storagePath: 'golf/range.jpg' })], PARENT);
  });
});
