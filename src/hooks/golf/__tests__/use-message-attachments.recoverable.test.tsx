import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const STALE_SEND = '33333333-3333-4333-8333-333333333333';

const sendAction = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }),
}));
vi.mock('@/lib/storage/attachments', () => ({
  STORAGE_BUCKET: 'message-attachments',
  uploadAttachment: async () => ({
    success: true,
    storagePath: `${CONVERSATION}/photo.jpg`,
    metadata: { fileName: 'photo.jpg', fileType: 'image', mimeType: 'image/jpeg', fileSize: 10 },
  }),
}));
vi.mock('@/app/golf/actions/messages', () => ({ sendGolfMessageWithAttachments: sendAction }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { useMessageAttachments } from '../use-message-attachments';

const markerKey = `helm.golf.cache.v1:pending-attachment-send:${encodeURIComponent(USER)}:${encodeURIComponent(CONVERSATION)}`;

function seedStaleMarker() {
  window.sessionStorage.setItem(markerKey, JSON.stringify({
    version: 1, userId: USER, conversationId: CONVERSATION, clientMessageId: STALE_SEND, content: 'earlier',
    replyToId: null,
    attachments: [{ id: '44444444-4444-4444-8444-444444444444', fileName: 'a.jpg', fileType: 'image', mimeType: 'image/jpeg',
      fileSize: 10, storagePath: `${CONVERSATION}/a.jpg` }],
  }));
}

const photo = () => ({ id: 'att-1', file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }) });

describe('useMessageAttachments recoverable mode', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    sendAction.mockReset();
    sendAction.mockResolvedValue({ success: true, messageId: 'm1' });
  });

  it('default (Fairway): a stored marker from an earlier unconfirmed send does not block a new attachment send', async () => {
    seedStaleMarker();
    const { result } = renderHook(() => useMessageAttachments());
    let outcome: Awaited<ReturnType<typeof result.current.sendMessageWithAttachments>> | undefined;
    await act(async () => {
      outcome = await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'hi', attachments: [photo() as never] });
    });
    expect(outcome?.success).toBe(true);
    expect(sendAction).toHaveBeenCalledTimes(1);
  });

  it('default (Fairway): a send does not leave a marker behind', async () => {
    sendAction.mockResolvedValue({ success: false, sendOutcome: 'unknown', error: 'lost' });
    const { result } = renderHook(() => useMessageAttachments());
    await act(async () => {
      await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'hi', attachments: [photo() as never] });
    });
    expect(window.sessionStorage.getItem(markerKey)).toBeNull();
  });

  it('recoverable (Clubhouse): a stored marker still holds new sends until that send is retried', async () => {
    seedStaleMarker();
    const { result } = renderHook(() => useMessageAttachments({ recoverable: true }));
    let outcome: Awaited<ReturnType<typeof result.current.sendMessageWithAttachments>> | undefined;
    await act(async () => {
      outcome = await result.current.sendMessageWithAttachments({ conversationId: CONVERSATION, content: 'hi', attachments: [photo() as never] });
    });
    expect(outcome?.success).toBe(false);
    expect(outcome?.sendOutcome).toBe('unknown');
    expect(sendAction).not.toHaveBeenCalled();
  });
});
