/**
 * P-2 D22: the fan-out's options for a message kind with its own words. `previewText` stays the email preview; a
 * `pushBody` replaces the push preview and the Bell message; `titleFor` names the Bell title and the push title.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const notifyNewMessage = vi.fn(async (..._a: unknown[]) => {});
const sendPushNotification = vi.fn(async (..._a: unknown[]) => ({ success: true }));
const inserted: Row[][] = [];

vi.mock('@/lib/notifications', () => ({ notifyNewMessage: (...a: unknown[]) => notifyNewMessage(...a) }));
vi.mock('@/lib/notifications/push', () => ({ sendPushNotification: (...a: unknown[]) => sendPushNotification(...a) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
// This file is about the message kinds' words, not the class gate: with class_awareness_v1 on under vitest the push data would also carry a hold instruction.
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

function client(tables: Record<string, Row[]>) {
  return {
    from: vi.fn((table: string) => {
      const rows = tables[table] ?? [];
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in']) b[m] = vi.fn(() => b);
      b.insert = vi.fn((r: Row[]) => {
        inserted.push(r);
        return b;
      });
      b.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej);
      return b;
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  inserted.length = 0;
  const rls = client({ golf_conversation_participants: [{ user_id: 'r1' }], golf_coaches: [{ full_name: 'Coach Reyes' }], golf_players: [], users: [] });
  const admin = client({ users: [{ id: 'r1', email: 'r1@helm.test', notification_preferences: { push_messages: true, email_messages: true } }], golf_calendar_notifications: [] });
  vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => rls }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
});
afterEach(() => vi.clearAllMocks());

describe('notifyGolfMessageRecipients options (P-2 D22)', () => {
  it('a poll: email keeps "Poll: …", push and the Bell say "Poll from Coach Reyes" and the push body', async () => {
    const { notifyGolfMessageRecipients } = await import('../golf-message-fanout');
    await notifyGolfMessageRecipients('c1', 's1', 'Poll: Which van?', { titleFor: (n) => `Poll from ${n}`, pushBody: 'Which van? Voting ends in 1 day.' });
    expect(notifyNewMessage).toHaveBeenCalledWith('r1', 'r1@helm.test', 'Coach Reyes', 'Poll: Which van?', 'c1', 'golf');
    expect(sendPushNotification).toHaveBeenCalledWith('new_message', 'r1', expect.objectContaining({ title: 'Poll from Coach Reyes', preview: 'Which van? Voting ends in 1 day.' }));
    expect(inserted[0]![0]).toMatchObject({ title: 'Poll from Coach Reyes', message: 'Which van? Voting ends in 1 day.' });
  });

  it('a plain message is unchanged', async () => {
    const { notifyGolfMessageRecipients } = await import('../golf-message-fanout');
    await notifyGolfMessageRecipients('c1', 's1', 'Bus at 6');
    expect(sendPushNotification).toHaveBeenCalledWith('new_message', 'r1', { senderName: 'Coach Reyes', preview: 'Bus at 6', conversationId: 'c1' });
    expect(inserted[0]![0]).toMatchObject({ title: 'Message from Coach Reyes', message: 'Bus at 6' });
  });
});
