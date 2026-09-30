// =============================================================================
// src/app/golf/actions/__tests__/message-attachments-conversation-files.test.ts
//
// getGolfConversationFiles (D-48) lists a conversation's shared files for the
// phone's Details. Three things it must keep true:
//
//   1. Only a participant gets anything: the membership check runs first, and
//      a non-participant is refused before golf_message_attachments is read.
//   2. It returns metadata only. Storage paths and signed URLs never leave
//      this action (team-communications: attachments must not expose storage
//      paths broadly); opening a file signs it per message instead.
//   3. Files on deleted messages are left out.
//   4. It is HELD (D-61): it answers only where the Clubhouse UI is on for the
//      caller's role, and refuses before any read everywhere else.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } as { user: { id: string } | null } })),
  membership: { data: { id: 'p-1' } as unknown, error: null as unknown },
  files: { data: [] as unknown[], error: null as unknown },
  attachmentReads: 0,
  notFilters: [] as unknown[][],
  eqFilters: [] as unknown[][],
  logServerError: vi.fn(async () => undefined),
  clubhouse: true,
  role: 'coach' as 'coach' | 'player' | null,
  isClubhouseFor: vi.fn((role: string | null | undefined) => (role === 'coach' || role === 'player') && mocks.clubhouse),
}));

vi.mock('next/server', () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: vi.fn() }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: mocks.isClubhouseFor }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn(async () => ({ userId: 'u-1', role: mocks.role })) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn((table: string) => {
      if (table === 'golf_conversation_participants') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => mocks.membership }) }) }) };
      }
      if (table === 'golf_message_attachments') {
        mocks.attachmentReads += 1;
        const chain = {
          eq: (...args: unknown[]) => (mocks.eqFilters.push(args), chain),
          not: (...args: unknown[]) => (mocks.notFilters.push(args), chain),
          order: () => chain,
          limit: async () => mocks.files,
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  })),
}));

import { getGolfConversationFiles } from '../message-attachments';

const row = (id: string, deleted: boolean | null) => ({
  id,
  message_id: `m-${id}`,
  file_name: `${id}.pdf`,
  mime_type: 'application/pdf',
  file_size: 48 * 1024,
  created_at: '2026-10-14T15:02:00Z',
  storage_path: `team/conv/${id}.pdf`,
  message: { conversation_id: 'c-1', sender_id: 'u-2', is_deleted: deleted },
});

describe('getGolfConversationFiles', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    mocks.membership = { data: { id: 'p-1' }, error: null };
    mocks.files = { data: [], error: null };
    mocks.attachmentReads = 0;
    mocks.notFilters = [];
    mocks.eqFilters = [];
    mocks.clubhouse = true;
    mocks.role = 'coach';
    mocks.isClubhouseFor.mockClear();
  });

  it('is HELD: refuses before any read unless the Clubhouse UI is on for the caller', async () => {
    mocks.clubhouse = false;
    const res = await getGolfConversationFiles('c-1');
    expect(res).toEqual({ error: 'Not available' });
    expect(mocks.isClubhouseFor).toHaveBeenCalledWith('coach');
    expect(mocks.attachmentReads).toBe(0);
    mocks.clubhouse = true;
    mocks.role = null;
    expect(await getGolfConversationFiles('c-1')).toEqual({ error: 'Not available' });
    mocks.role = 'player';
    expect((await getGolfConversationFiles('c-1')).error).toBeUndefined();
  });

  it('refuses someone who is not in the conversation, before reading any file', async () => {
    mocks.membership = { data: null, error: null };
    const res = await getGolfConversationFiles('c-1');
    expect(res.error).toMatch(/not a participant/i);
    expect(res.files).toBeUndefined();
    expect(mocks.attachmentReads).toBe(0);
  });

  it('reads only the conversation asked for, for a caller in more than one', async () => {
    await getGolfConversationFiles('c-A');
    expect(mocks.eqFilters).toEqual([['message.conversation_id', 'c-A']]);
  });

  it('refuses a signed-out caller', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await getGolfConversationFiles('c-1')).error).toBe('Unauthorized');
  });

  it('returns metadata only, newest first as read, without deleted messages', async () => {
    mocks.files = { data: [row('a', false), row('b', true), row('c', null)], error: null };
    const res = await getGolfConversationFiles('c-1');
    expect(res.files?.map((f) => f.id)).toEqual(['a', 'c']);
    expect(res.files?.[0]).toEqual({ id: 'a', messageId: 'm-a', fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 48 * 1024, sentAt: '2026-10-14T15:02:00Z', senderId: 'u-2' });
    expect(JSON.stringify(res)).not.toMatch(/storage|team\/conv|signed/i);
  });

  it('leaves deleted messages out in the query, so they take no slots under the cap', async () => {
    await getGolfConversationFiles('c-1');
    expect(mocks.notFilters).toEqual([['message.is_deleted', 'is', true]]);
  });

  it('reports a failed read as an error, and logs it', async () => {
    mocks.files = { data: [], error: { message: 'boom' } };
    const res = await getGolfConversationFiles('c-1');
    expect(res.error).toBe('Failed to load files');
    expect(mocks.logServerError).toHaveBeenCalled();
  });
});
