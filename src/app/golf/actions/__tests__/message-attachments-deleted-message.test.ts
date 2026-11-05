// getGolfMessageAttachments must not sign URLs for a deleted message's files (audit Messages L7).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parent: { data: { is_deleted: false } as { is_deleted: boolean | null } | null, error: null as unknown },
  attachmentReads: 0,
  signed: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` } })),
}));

vi.mock('next/server', () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    storage: { from: () => ({ createSignedUrl: mocks.signed }) },
    from: (table: string) => {
      if (table === 'golf_messages') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => mocks.parent }) }) };
      }
      if (table === 'golf_message_attachments') {
        mocks.attachmentReads += 1;
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ id: 'a-1', file_name: 'a.png', file_type: 'image', mime_type: 'image/png', file_size: 1, storage_path: 'p/a.png', created_at: '' }],
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

import { getGolfMessageAttachments } from '../message-attachments';

beforeEach(() => {
  mocks.parent = { data: { is_deleted: false }, error: null };
  mocks.attachmentReads = 0;
  mocks.signed.mockClear();
});

describe('getGolfMessageAttachments on a deleted message', () => {
  it('returns no files and signs nothing', async () => {
    mocks.parent = { data: { is_deleted: true }, error: null };
    const res = await getGolfMessageAttachments('m-1');
    expect(res).toEqual({ attachments: [] });
    expect(mocks.attachmentReads).toBe(0);
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it('still signs a live message\'s files', async () => {
    const res = await getGolfMessageAttachments('m-1');
    expect(res.attachments).toHaveLength(1);
    expect(res.attachments?.[0]?.url).toBe('https://signed/p/a.png');
  });
});
