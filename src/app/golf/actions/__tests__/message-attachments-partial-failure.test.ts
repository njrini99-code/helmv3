// =============================================================================
// src/app/golf/actions/__tests__/message-attachments-partial-failure.test.ts
//
// G-08 — a failed attachment insert used to be reported to the sender as
// SUCCESS. The `golf_messages` row commits first with `has_attachments: true`;
// when the `golf_message_attachments` insert then failed, the error was logged
// and swallowed and the action returned `{ success: true }`. Three consequences,
// all covered here:
//
//   1. The sender was told their photo had been delivered. It had not.
//   2. The row stayed flagged `has_attachments: true` with no attachment rows,
//      which MessageThreadPane reads as "the rows have not committed YET" — a
//      correct reading of the commit race it was written for, and wrong here.
//      It offers a retry that can never succeed, so the bubble stays dead.
//   3. The client-side-uploaded storage objects were left orphaned.
//
// The fix compensates instead of swallowing. These tests pin the three
// behaviours that compensation has to keep true, including the one that is
// easy to regress: a message whose TEXT survived must still fan out to its
// recipients, because it really was delivered.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'sender-1' } } })),
  attachmentInsert: vi.fn(async () => ({ error: null as unknown })),
  messageUpdate: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  messageDelete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  conversationUpdate: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  storageRemove: vi.fn(async () => ({ error: null })),
  notify: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
}));

vi.mock('next/server', () => ({
  // Run the fan-out inline so the test can assert on it deterministically.
  after: (fn: () => unknown) => { void fn(); },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    storage: { from: vi.fn(() => ({ remove: mocks.storageRemove })) },
    from: vi.fn((table: string) => {
      if (table === 'golf_conversation_participants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'p-1' } })) })),
            })),
          })),
        };
      }
      if (table === 'golf_messages') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'msg-1' }, error: null })),
            })),
          })),
          update: mocks.messageUpdate,
          delete: mocks.messageDelete,
        };
      }
      if (table === 'golf_message_attachments') {
        return { insert: mocks.attachmentInsert };
      }
      if (table === 'golf_conversations') {
        return { update: mocks.conversationUpdate };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _meta: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({
  notifyGolfMessageRecipients: mocks.notify,
}));

import { sendGolfMessageWithAttachments } from '../message-attachments';

const ATTACHMENT = {
  fileName: 'range.jpg',
  fileType: 'image' as const,
  mimeType: 'image/jpeg',
  fileSize: 1024,
  storagePath: 'golf/conv-1/range.jpg',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attachmentInsert.mockResolvedValue({ error: null });
});

describe('G-08 — attachment insert failure is reported, not swallowed', () => {
  it('does NOT report success when the attachment rows fail and there is no text', async () => {
    mocks.attachmentInsert.mockResolvedValue({ error: { message: 'insert denied' } });

    const res = await sendGolfMessageWithAttachments('conv-1', '', [ATTACHMENT]);

    // The whole point of the finding: this used to be `success: true`.
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/could not be saved/i);
  });

  it('deletes the empty message rather than leaving a blank permanently-broken bubble', async () => {
    mocks.attachmentInsert.mockResolvedValue({ error: { message: 'insert denied' } });

    await sendGolfMessageWithAttachments('conv-1', '', [ATTACHMENT]);

    expect(mocks.messageDelete).toHaveBeenCalled();
  });

  it('removes the orphaned storage objects the client already uploaded', async () => {
    mocks.attachmentInsert.mockResolvedValue({ error: { message: 'insert denied' } });

    await sendGolfMessageWithAttachments('conv-1', '', [ATTACHMENT]);

    expect(mocks.storageRemove).toHaveBeenCalledWith(['golf/conv-1/range.jpg']);
  });

  it('keeps a message whose TEXT survived, but clears has_attachments and says so', async () => {
    mocks.attachmentInsert.mockResolvedValue({ error: { message: 'insert denied' } });

    const res = await sendGolfMessageWithAttachments('conv-1', 'Bus leaves at six', [ATTACHMENT]);

    // Delivered, so still a success — but an honest one the caller can act on.
    expect(res.success).toBe(true);
    expect(res.attachmentsFailed).toBe(true);
    expect(res.error).toMatch(/attachments could not be saved/i);
    // Downgraded to text-only, so the reader stops treating it as a pending race.
    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ has_attachments: false }),
    );
    expect(mocks.messageDelete).not.toHaveBeenCalled();
  });

  it('still fans out the surviving text — an early return would deliver it silently', async () => {
    mocks.attachmentInsert.mockResolvedValue({ error: { message: 'insert denied' } });

    await sendGolfMessageWithAttachments('conv-1', 'Bus leaves at six', [ATTACHMENT]);

    expect(mocks.notify).toHaveBeenCalledWith('conv-1', 'sender-1', 'Bus leaves at six');
    expect(mocks.conversationUpdate).toHaveBeenCalled();
  });

  it('leaves the success path untouched when the attachments do insert', async () => {
    const res = await sendGolfMessageWithAttachments('conv-1', 'Here you go', [ATTACHMENT]);

    expect(res).toEqual({ success: true, messageId: 'msg-1' });
    expect(res.attachmentsFailed).toBeUndefined();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.messageDelete).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalled();
  });
});
