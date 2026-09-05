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
 *
 * 2026-09-04: a THIRD property. Email was removed from this path by owner
 * instruction — a chat message is not an email, and an active thread mailed
 * every participant once per message. Push and the in-app bell remain. The
 * assertion below is inverted rather than deleted, so that re-adding a
 * per-message email fails here instead of quietly shipping.
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

  it('still reaches a recipient RLS cannot see, via the admin fallback', async () => {
    // The contract here was never "email"; it is that a recipient the RLS
    // query returns none of is still resolved through the admin client and
    // still notified. Email happened to be the channel that proved it, and
    // this branch removed email — so the assertion moved to the bell, which
    // is unconditional and is how the message is discovered at all.
    const adminTablesSeen: string[] = [];
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [{ id: RECIPIENT, email: 'player@example.com' }],
    }).then((r) => adminTablesSeen.push(...r.adminTables));

    expect(adminTablesSeen).toContain('golf_calendar_notifications');
  });

  /**
   * DELIVERY PREFERENCES. This fan-out emailed AND pushed AND belled every
   * other participant unconditionally — it read `users.notification_preferences`
   * nowhere, so the Messages toggles in the settings panel did nothing for the
   * one category they name. In a 12-player group chat a single coach post was
   * twelve emails; a player told their coach "Stop spamming my email" on
   * 2026-08-31 after 33 notifications in one day, and the only remedy offered
   * was "just turn the notifications off" — which was true, because the
   * specific toggle they had was read by nothing.
   *
   * The gate is `gatedDelivery` from CoachHelm v3, already used elsewhere and
   * already carrying these exact keys and defaults. No second gate was built.
   */
  it('never emails, whatever email_messages says — the channel is gone, not gated', async () => {
    // Stronger than the gate this replaces. `email_messages: true` is the
    // documented DEFAULT, so a test that only proves "off means no mail"
    // would still pass if the channel came back on by accident for everyone
    // who never touched the toggle. Asserting it with the preference ON is
    // what actually pins the removal.
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [
        {
          id: RECIPIENT,
          email: 'player@example.com',
          notification_preferences: { email_messages: true },
        },
      ],
    });

    expect(notifyNewMessageMock).not.toHaveBeenCalled();
  });

  it('honours quiet_mode? NO — messages are quiet-exempt and still deliver', async () => {
    // DELIVERY_NOTIFICATION_GROUPS marks the messages category quietExempt,
    // so quiet mode must not silence a direct message. Pinned so a later
    // change to the gate cannot quietly swallow team messages.
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [
        {
          id: RECIPIENT,
          email: 'player@example.com',
          notification_preferences: { quiet_mode: true, push_messages: true },
        },
      ],
    });

    // Asserted on PUSH, the outbound channel that remains. `push_messages` is
    // set explicitly because its documented default is OFF — without it this
    // would pass for the wrong reason.
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT push by default — push_messages defaults OFF, and the code used to ignore that', async () => {
    // The settings panel has always rendered this toggle as off by default
    // while the fan-out pushed anyway, so the UI was lying about what the
    // product does. This is a real behaviour change and is called out in the
    // PR: a recipient who never opted in stops receiving message pushes.
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [{ id: RECIPIENT, email: 'player@example.com' }],
    });

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  it('DOES push a recipient who opted in', async () => {
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [
        {
          id: RECIPIENT,
          email: 'player@example.com',
          notification_preferences: { push_messages: true },
        },
      ],
    });

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      'new_message',
      RECIPIENT,
      expect.objectContaining({ senderName: 'Coach Rini', conversationId: CONV }),
    );
    // Email is not a channel any more (this branch removed it by owner
    // instruction), so the assertion is unconditional rather than
    // preference-dependent: no message ever mails anyone.
    expect(notifyNewMessageMock).not.toHaveBeenCalled();
  });

  it('still writes the in-app bell for someone who muted email AND push', async () => {
    // The bell is how a recipient discovers the message at all. Suppressing it
    // would hide mail rather than quiet it.
    const adminTablesSeen: string[] = [];
    const before = notifyNewMessageMock.mock.calls.length;
    await runFanout({
      rlsUsersRows: [],
      adminUsersRows: [
        {
          id: RECIPIENT,
          email: 'player@example.com',
          notification_preferences: { email_messages: false, push_messages: false },
        },
      ],
    }).then((r) => adminTablesSeen.push(...r.adminTables));

    expect(notifyNewMessageMock.mock.calls.length).toBe(before);
    expect(sendPushNotificationMock).not.toHaveBeenCalled();
    expect(adminTablesSeen).toContain('golf_calendar_notifications');
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
