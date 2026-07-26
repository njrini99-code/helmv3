/**
 * Tests for src/lib/notifications/golf-message-fanout.ts.
 *
 * THE BUG THESE LOCK DOWN. The recipient lookup was
 * `supabase.from('users').select('id, email').in('id', recipientUserIds)` on
 * the CALLER's RLS-scoped client. `public.users` has exactly two SELECT
 * policies — `users_select_own` (auth.uid() = id) and `admin_read_all`
 * (is_admin()) — so a coach reading a player's row satisfies neither and the
 * query returned `[]`: not an error, not null, just nothing.
 *
 * The guard was `if (!recipientProfiles) return;`, and `[]` is truthy, so
 * execution fell through into three `.map()` calls over an empty array. No
 * email, no push, no in-app bell — and the whole function is wrapped in a
 * "never block message delivery" try/catch, so nothing was logged either.
 *
 * Confirmed in production before the fix: 31 golf messages sent, and ZERO
 * rows of notification_type='message' in golf_calendar_notifications across
 * the table's entire history.
 *
 * So the two properties worth pinning are (1) the recipient lookup must go
 * through the SERVICE-ROLE client, and (2) an empty recipient set must be
 * loud, never a silent return.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const notifyNewMessageMock = vi.fn(async (..._a: unknown[]) => {});
const sendPushNotificationMock = vi.fn(async (..._a: unknown[]) => ({ success: true }));
const logServerErrorMock = vi.fn(async (..._a: unknown[]) => {});

vi.mock('@/lib/notifications', () => ({
  notifyNewMessage: (...a: unknown[]) => notifyNewMessageMock(...a),
}));
vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: (...a: unknown[]) => sendPushNotificationMock(...a),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...a: unknown[]) => logServerErrorMock(...a),
}));

/**
 * Minimal chainable Supabase stub. `tables` maps a table name to the rows the
 * terminal await resolves to; `onFrom` records which client saw which table,
 * which is the whole point of the first test.
 */
function makeClient(tables: Record<string, Row[]>, onFrom: (t: string) => void) {
  return {
    from: vi.fn((table: string) => {
      onFrom(table);
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ['select', 'eq', 'neq', 'in', 'insert']) builder[m] = vi.fn(chain);
      builder.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
      builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res, rej);
      return builder;
    }),
  };
}

const CONV = 'conv-1';
const SENDER = 'sender-1';
const RECIPIENT = 'recipient-1';

async function runFanout(opts: {
  rlsUsersRows: Row[];
  adminUsersRows: Row[];
}): Promise<{ rlsTables: string[]; adminTables: string[] }> {
  const rlsTables: string[] = [];
  const adminTables: string[] = [];

  const rls = makeClient(
    {
      golf_conversation_participants: [{ user_id: RECIPIENT }],
      golf_coaches: [{ full_name: 'Coach Rini' }],
      golf_players: [],
      users: opts.rlsUsersRows,
    },
    (t) => rlsTables.push(t),
  );
  const admin = makeClient(
    { users: opts.adminUsersRows, golf_calendar_notifications: [] },
    (t) => adminTables.push(t),
  );

  vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => rls }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));

  const { notifyGolfMessageRecipients } = await import('@/lib/notifications/golf-message-fanout');
  await notifyGolfMessageRecipients(CONV, SENDER, 'see you at 6');
  return { rlsTables, adminTables };
}

describe('notifyGolfMessageRecipients', () => {
  beforeEach(() => {
    notifyNewMessageMock.mockClear();
    sendPushNotificationMock.mockClear();
    logServerErrorMock.mockClear();
  });
  afterEach(() => vi.resetModules());

  it('resolves recipient emails through the SERVICE-ROLE client, not the caller RLS client', async () => {
    const { rlsTables, adminTables } = await runFanout({
      // What RLS actually hands a coach asking for a player's row.
      rlsUsersRows: [],
      adminUsersRows: [{ id: RECIPIENT, email: 'player@example.com' }],
    });

    // The admin client must be the one that reads `users` for recipients.
    expect(adminTables).toContain('users');
    // Participants stay on the RLS client — that read IS the authorization
    // boundary (the sender must be in the conversation to see them), so it
    // must NOT be escalated.
    expect(rlsTables).toContain('golf_conversation_participants');
  });

  it('sends push + email + in-app to every recipient even though RLS returns none', async () => {
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [{ id: RECIPIENT, email: 'player@example.com' }],
    });

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      'new_message',
      RECIPIENT,
      expect.objectContaining({ senderName: 'Coach Rini', conversationId: CONV }),
    );
    expect(notifyNewMessageMock).toHaveBeenCalledTimes(1);
  });

  it('an empty recipient set is LOGGED and sends nothing — never a silent return', async () => {
    await runFanout({ rlsUsersRows: [], adminUsersRows: [] });

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
    expect(notifyNewMessageMock).not.toHaveBeenCalled();
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('resolved to 0 user rows'),
      expect.objectContaining({ action: 'notifications.notifyGolfMessageRecipients' }),
    );
  });
});
