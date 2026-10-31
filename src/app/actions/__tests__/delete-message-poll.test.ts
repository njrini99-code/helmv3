import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-2 (changelog 2026-10-25, slice 7): deleting a golf poll clears its payload with its text, the one write held
 * 20261025020200_golf_poll_payload_freeze allows on a poll. A golf text message and a baseball message are deleted as before.
 */
const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: vi.fn() }));
vi.mock('@/lib/validation/server-action-validator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/validation/server-action-validator')>()),
  logSecurityEvent: vi.fn(async () => {}),
}));

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  reads: [] as Array<{ table: string; fields: string }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from(table: string) {
      let fields = '';
      const chain = {
        select(value = '*') {
          fields = value;
          return chain;
        },
        eq() {
          return chain;
        },
        update(values: Record<string, unknown>) {
          state.updates.push({ table, values });
          return chain;
        },
        async single() {
          state.reads.push({ table, fields });
          return { data: state.row, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));

import { deleteMessage } from '../messages';

beforeEach(() => {
  state.reads = [];
  state.updates = [];
});

describe('deleteMessage and polls', () => {
  it('a golf poll is soft-deleted with its text and its payload cleared', async () => {
    state.row = { id: 'm1', sender_id: USER, conversation_id: 'c1', kind: 'poll' };
    expect(await deleteMessage({ messageId: 'm1', sport: 'golf' })).toEqual({ success: true });
    expect(state.reads).toEqual([{ table: 'golf_messages', fields: 'id, sender_id, conversation_id, kind' }]);
    expect(state.updates[0]).toEqual({ table: 'golf_messages', values: { is_deleted: true, content: '', payload: null } });
    // Then the conversation row, so every member's inbox drops the deleted text from its preview.
    expect(state.updates[1]).toMatchObject({ table: 'golf_conversations', values: { updated_at: expect.any(String) } });
  });

  it('a golf text message is deleted as before, its payload untouched', async () => {
    state.row = { id: 'm2', sender_id: USER, conversation_id: 'c1', kind: 'text' };
    expect(await deleteMessage({ messageId: 'm2', sport: 'golf' })).toEqual({ success: true });
    expect(state.updates[0]).toEqual({ table: 'golf_messages', values: { is_deleted: true, content: '' } });
    // Then the conversation row, so every member's inbox drops the deleted text from its preview.
    expect(state.updates[1]).toMatchObject({ table: 'golf_conversations', values: { updated_at: expect.any(String) } });
  });

  it('a baseball message reads no kind and is deleted as before', async () => {
    state.row = { id: 'm3', sender_id: USER, conversation_id: 'c1' };
    expect(await deleteMessage({ messageId: 'm3', sport: 'baseball' })).toEqual({ success: true });
    expect(state.reads).toEqual([{ table: 'baseball_messages', fields: 'id, sender_id, conversation_id' }]);
    expect(state.updates).toEqual([{ table: 'baseball_messages', values: { is_deleted: true, content: '' } }]);
  });
});
