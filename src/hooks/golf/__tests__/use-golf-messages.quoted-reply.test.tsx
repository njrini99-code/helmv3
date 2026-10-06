import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION = 'reply-conversation';
const PARENT = '66666666-6666-4666-8666-666666666666';
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
import { useMessageAttachments } from '../use-message-attachments';
import { __resetCachedResourcesForTests, clearAllCachedResources } from '@/lib/golf/client-resource-cache';

beforeEach(() => {
  __resetCachedResourcesForTests();
  window.sessionStorage.clear();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null });
  mock.rows = [];
  mock.projections = [];
  mock.inserted = null;
  mock.send.mockReset().mockResolvedValue({ success: true });
  mock.attachmentSend.mockReset().mockResolvedValue({ success: true });
  mock.upload.mockReset();
  mock.remove.mockReset().mockResolvedValue({ error: null });
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
    expect(mock.attachmentSend).toHaveBeenLastCalledWith(CONVERSATION, 'Reply text', [expect.objectContaining({ ...metadata, id: expect.any(String), storagePath: 'golf/range.jpg' })], PARENT, expect.any(String), 'viewer');
  });

  it('preserves the delivered-text/unsaved-attachments outcome instead of reducing it to a successful whole send', async () => {
    const partial = { success: true, messageId: 'delivered-text', attachmentsFailed: true, error: 'Your message was sent, but the attachments could not be saved.' };
    mock.attachmentSend.mockResolvedValue(partial);
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    const { result } = renderHook(() => useMessageAttachments());
    let outcome!: Awaited<ReturnType<typeof result.current.sendMessageWithAttachments>>;
    await act(async () => {
      outcome = await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Delivered text', replyToId: PARENT,
        attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] });
    });
    expect(outcome.attachmentsFailed).toBe(true);
    expect(outcome).toEqual(partial);
    expect(mock.attachmentSend.mock.calls[0]?.[3]).toBe(PARENT);
  });

  it('retries a lost Safari response using identical database IDs and upload paths without uploading twice', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockRejectedValueOnce(new TypeError('Load failed'));
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => {
      expect((await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
        attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] })).success).toBe(true);
    });
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.attachmentSend).toHaveBeenCalledTimes(2);
    expect(mock.attachmentSend.mock.calls[1]).toEqual(mock.attachmentSend.mock.calls[0]);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('retains unknown attempts for manual Retry and blocks a different payload or no-file send meanwhile', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockResolvedValue({ success: false, sendOutcome: 'unknown', error: 'Unconfirmed' });
    const options = { conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' as const }] };
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { expect(await result.current.sendMessageWithAttachments(options)).toMatchObject({ sendOutcome: 'unknown' }); });
    const original = mock.attachmentSend.mock.calls[0];
    await act(async () => {
      expect(await result.current.sendMessageWithAttachments({ ...options, content: 'Different text' })).toMatchObject({ sendOutcome: 'unknown' });
      expect(await result.current.sendMessageWithAttachments({ ...options, attachments: [] })).toMatchObject({ sendOutcome: 'unknown' });
    });
    expect(mock.attachmentSend).toHaveBeenCalledTimes(2);
    mock.attachmentSend.mockResolvedValue({ success: true });
    await act(async () => { expect((await result.current.sendMessageWithAttachments(options)).success).toBe(true); });
    expect(mock.attachmentSend.mock.calls[2]).toEqual(original);
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('does not delete potentially committed storage when cancellation arrives after the server request starts', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    let rejectSend!: (error: Error) => void;
    mock.attachmentSend.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSend = reject; }));
    const controller = new AbortController();
    const { result } = renderHook(() => useMessageAttachments());
    let sending!: ReturnType<typeof result.current.sendMessageWithAttachments>;
    act(() => { sending = result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT, signal: controller.signal,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] }); });
    await waitFor(() => expect(mock.attachmentSend).toHaveBeenCalledOnce());
    await act(async () => { controller.abort(); rejectSend(new Error('Response unavailable')); expect(await sending).toMatchObject({ sendOutcome: 'unknown' }); });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('persists an exact authenticated request before writing and resumes after remount without File objects or reupload', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockImplementation(async () => {
      const marker = window.sessionStorage.getItem(`helm.golf.cache.v1:pending-attachment-send:viewer:${CONVERSATION}`);
      expect(JSON.parse(marker!)).toMatchObject({ userId: 'viewer', content: 'Reply text', replyToId: PARENT });
      expect(marker).not.toContain('previewUrl');
      return { success: false, sendOutcome: 'unknown' };
    });
    const original = renderHook(() => useMessageAttachments());
    await act(async () => { await original.result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] }); });
    const sent = mock.attachmentSend.mock.calls[0];
    original.unmount();
    const recovered = renderHook(() => useMessageAttachments());
    await act(async () => {
      expect(await recovered.result.current.getPendingAttachmentSend(CONVERSATION)).toMatchObject({ clientMessageId: sent?.[4], content: 'Reply text', replyToId: PARENT,
        attachments: [expect.objectContaining({ id: (sent?.[2] as { id: string }[])[0]?.id, fileName: 'range.jpg', storagePath: 'golf/range.jpg' })] });
    });
    mock.attachmentSend.mockResolvedValue({ success: true });
    await act(async () => { expect((await recovered.result.current.retryPendingAttachmentSend(CONVERSATION)).success).toBe(true); });
    expect(mock.attachmentSend.mock.calls[2]).toEqual(sent);
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(await recovered.result.current.getPendingAttachmentSend(CONVERSATION)).toBeNull();
  });

  it('never starts a server write when Safari denies persistence of the retry identity', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    const deny = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage denied', 'QuotaExceededError'); });
    try {
      const { result } = renderHook(() => useMessageAttachments());
      await act(async () => { expect(await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
        attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] })).toMatchObject({ success: false, sendOutcome: 'refused' }); });
      expect(mock.attachmentSend).not.toHaveBeenCalled();
    } finally { deny.mockRestore(); }
  });

  it('does not add a remote auth read to ordinary thread opening when no pending marker exists', async () => {
    const { result } = renderHook(() => useMessageAttachments());
    expect(await result.current.getPendingAttachmentSend(CONVERSATION)).toBeNull();
    expect(mock.getUser).not.toHaveBeenCalled();
  });

  it('isolates pending metadata by authenticated viewer and clears it on existing sign-out cache cleanup', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockResolvedValue({ success: false, sendOutcome: 'unknown' });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] }); });
    mock.getUser.mockResolvedValue({ data: { user: { id: 'another-viewer' } }, error: null });
    expect(await result.current.getPendingAttachmentSend(CONVERSATION)).toBeNull();
    expect(await result.current.retryPendingAttachmentSend(CONVERSATION)).toMatchObject({ success: false, sendOutcome: 'refused' });
    expect(mock.attachmentSend).toHaveBeenCalledTimes(2);
    clearAllCachedResources();
    expect(window.sessionStorage.getItem(`helm.golf.cache.v1:pending-attachment-send:viewer:${CONVERSATION}`)).toBeNull();
  });

  it('does not repopulate a logged-out session marker when authentication resolves after cache cleanup', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.getUser.mockResolvedValueOnce({ data: { user: { id: 'viewer' } }, error: null });
    mock.getUser.mockImplementationOnce(async () => { clearAllCachedResources(); return { data: { user: { id: 'viewer' } }, error: null }; });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { expect(await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Reply text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] })).toMatchObject({ sendOutcome: 'unknown' }); });
    expect(mock.attachmentSend).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each([false, true])('never clears a newer marker or publishes an old success after late completion (logout=%s)', async logout => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    let resolveSend!: (value: { success: true }) => void;
    mock.attachmentSend.mockImplementationOnce(() => new Promise(resolve => { resolveSend = resolve; }));
    const { result } = renderHook(() => useMessageAttachments());
    let sending!: ReturnType<typeof result.current.sendMessageWithAttachments>;
    act(() => { sending = result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Original text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] }); });
    await waitFor(() => expect(mock.attachmentSend).toHaveBeenCalledOnce());
    const key = `helm.golf.cache.v1:pending-attachment-send:viewer:${CONVERSATION}`;
    const newer = { ...JSON.parse(window.sessionStorage.getItem(key)!), clientMessageId: '77777777-7777-4777-8777-777777777777', content: 'New session draft' };
    if (logout) clearAllCachedResources();
    window.sessionStorage.setItem(key, JSON.stringify(newer));
    await act(async () => { resolveSend({ success: true }); expect(await sending).toMatchObject({ success: false, sendOutcome: 'unknown' }); });
    expect(JSON.parse(window.sessionStorage.getItem(key)!)).toEqual(newer);
  });

  it('never resends old content under a new viewer during the automatic transport retry delay', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockImplementationOnce(async () => {
      clearAllCachedResources();
      mock.getUser.mockResolvedValue({ data: { user: { id: 'new-viewer' } }, error: null });
      throw new TypeError('Load failed');
    });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { expect(await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Old viewer text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] })).toMatchObject({ sendOutcome: 'unknown' }); });
    expect(mock.attachmentSend).toHaveBeenCalledOnce();
    expect(mock.attachmentSend.mock.calls[0]?.[5]).toBe('viewer');
    expect(window.sessionStorage.length).toBe(0);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('rejects an old cached retry before it can overwrite a newer marker, and explicit recovery uses the newer identity', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockResolvedValue({ success: false, sendOutcome: 'unknown' });
    const options = { conversationId: CONVERSATION, content: 'Old text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' as const }] };
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { await result.current.sendMessageWithAttachments(options); });
    const key = `helm.golf.cache.v1:pending-attachment-send:viewer:${CONVERSATION}`;
    const newer = { ...JSON.parse(window.sessionStorage.getItem(key)!), clientMessageId: '77777777-7777-4777-8777-777777777777', content: 'New pending text',
      attachments: [{ ...metadata, id: '88888888-8888-4888-8888-888888888888', storagePath: 'golf/new.jpg' }] };
    window.sessionStorage.setItem(key, JSON.stringify(newer));
    await act(async () => { expect(await result.current.sendMessageWithAttachments(options)).toMatchObject({ sendOutcome: 'unknown' }); });
    expect(mock.attachmentSend).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.sessionStorage.getItem(key)!)).toEqual(newer);
    mock.attachmentSend.mockResolvedValue({ success: true });
    await act(async () => { expect((await result.current.retryPendingAttachmentSend(CONVERSATION)).success).toBe(true); });
    expect(mock.attachmentSend.mock.calls[2]).toEqual([CONVERSATION, newer.content, newer.attachments, PARENT, newer.clientMessageId, 'viewer']);
    expect(await result.current.getPendingAttachmentSend(CONVERSATION)).toBeNull();
  });

  it('keeps an earlier unknown write unconfirmed when a replay is refused before writing', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockResolvedValue({ success: false, sendOutcome: 'unknown' });
    const first = renderHook(() => useMessageAttachments());
    await act(async () => { await first.result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Previously sent text', replyToId: PARENT,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] }); });
    first.unmount();
    const key = `helm.golf.cache.v1:pending-attachment-send:viewer:${CONVERSATION}`;
    const marker = window.sessionStorage.getItem(key);
    mock.attachmentSend.mockResolvedValue({ success: false, sendOutcome: 'refused', error: 'Not a participant' });
    const recovered = renderHook(() => useMessageAttachments());
    await act(async () => { expect(await recovered.result.current.retryPendingAttachmentSend(CONVERSATION)).toMatchObject({ sendOutcome: 'unknown' }); });
    expect(window.sessionStorage.getItem(key)).toBe(marker);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('waits for late successful sibling uploads before cleaning a batch whose other file failed', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    let finishLate!: (value: unknown) => void;
    mock.upload.mockResolvedValueOnce({ success: true, storagePath: 'golf/early.jpg', metadata })
      .mockResolvedValueOnce({ success: false, error: 'Upload refused' })
      .mockImplementationOnce(() => new Promise(resolve => { finishLate = resolve; }));
    const { result } = renderHook(() => useMessageAttachments());
    let sending!: ReturnType<typeof result.current.sendMessageWithAttachments>;
    act(() => { sending = result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Text',
      attachments: [1, 2, 3].map(n => ({ id: `photo-${n}`, file: new File(['photo'], `${n}.jpg`), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' })) }); });
    await waitFor(() => expect(mock.upload).toHaveBeenCalledTimes(3));
    expect(mock.remove).not.toHaveBeenCalled();
    await act(async () => { finishLate({ success: true, storagePath: 'golf/late.jpg', metadata }); expect(await sending).toMatchObject({ success: false, sendOutcome: 'refused' }); });
    expect(mock.remove).toHaveBeenCalledWith(['golf/early.jpg', 'golf/late.jpg']);
    expect(mock.attachmentSend).not.toHaveBeenCalled();
  });

  it('honors cancellation after successful uploads but before the first server write', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    const controller = new AbortController();
    mock.upload.mockImplementation(async () => { controller.abort(); return { success: true, storagePath: 'golf/range.jpg', metadata }; });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { expect(await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Text', signal: controller.signal,
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] })).toMatchObject({ cancelled: true }); });
    expect(mock.remove).toHaveBeenCalledWith(['golf/range.jpg']);
    expect(mock.attachmentSend).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('cleans uploaded objects only for a fresh definitively refused request', async () => {
    const metadata = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024 };
    mock.upload.mockResolvedValue({ success: true, storagePath: 'golf/range.jpg', metadata });
    mock.attachmentSend.mockResolvedValue({ success: false, sendOutcome: 'refused', error: 'Insert refused' });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => { expect(await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'Text',
      attachments: [{ id: 'photo', file: new File(['photo'], 'range.jpg'), previewUrl: '', metadata, uploadProgress: 0, status: 'pending' }] })).toMatchObject({ sendOutcome: 'refused' }); });
    expect(mock.remove).toHaveBeenCalledWith(['golf/range.jpg']);
    expect(await result.current.getPendingAttachmentSend(CONVERSATION)).toBeNull();
  });
});
