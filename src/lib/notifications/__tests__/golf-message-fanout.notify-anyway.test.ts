/**
 * P-10 Notify anyway, the fan-out half. A message the database stored with `notify_anyway` (a coach of the conversation's team chose to
 * interrupt) sends its pushes with `hold: 'bypass'`, and once a push has really gone out the message is stamped `notify_anyway_pushed_at`,
 * which is what the thread's "Notified anyway" caption keys on. Nothing here changes a message that was not flagged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const notifyNewMessageMock = vi.fn(async (..._a: unknown[]) => {});
type PushResult = { success: boolean; delivered?: number };
const sendPushNotificationMock = vi.fn(async (..._a: unknown[]): Promise<PushResult> => ({ success: true, delivered: 1 }));
const logServerErrorMock = vi.fn(async (..._a: unknown[]) => {});

vi.mock('@/lib/notifications', () => ({ notifyNewMessage: (...a: unknown[]) => notifyNewMessageMock(...a) }));
vi.mock('@/lib/notifications/push', () => ({ sendPushNotification: (...a: unknown[]) => sendPushNotificationMock(...a) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...a: unknown[]) => logServerErrorMock(...a) }));

const CONV = 'conv-1';
const SENDER = 'coach-user';
const MESSAGE = 'msg-1';

function client(tables: Record<string, Row[]>, updates?: Array<{ table: string; row: Row; filters: Array<[string, unknown]> }>, updateError?: { message: string }) {
  return {
    from: (table: string) => {
      const rows = tables[table] ?? [];
      let op = 'select';
      let payload: Row = {};
      const filters: Array<[string, unknown]> = [];
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'neq', 'in', 'insert']) builder[m] = vi.fn(() => builder);
      builder.update = vi.fn((row: Row) => {
        op = 'update';
        payload = row;
        return builder;
      });
      builder.eq = vi.fn((c: string, v: unknown) => {
        filters.push([c, v]);
        return builder;
      });
      builder.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
      builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        if (op === 'update') updates?.push({ table, row: payload, filters });
        return Promise.resolve({ data: rows, error: op === 'update' ? (updateError ?? null) : null }).then(res, rej);
      };
      return builder;
    },
  };
}

async function run(opts: { flagOn?: boolean; teamId?: string | null; participants?: number; notifyAnyway?: boolean; messageId?: string | null; pushes?: PushResult[]; pushOff?: boolean; updateError?: { message: string } }) {
  const updates: Array<{ table: string; row: Row; filters: Array<[string, unknown]> }> = [];
  const rls = client({ golf_conversations: [{ team_id: opts.teamId === undefined ? null : opts.teamId }], golf_conversation_participants: Array.from({ length: opts.participants ?? 1 }, (_, i) => ({ user_id: `p${i + 1}` })), golf_coaches: [{ full_name: 'Coach Rini' }], golf_players: [], users: [] });
  const admin = client(
    { users: [{ id: 'p1', email: 'p1@example.com', notification_preferences: opts.pushOff ? { push_messages: false } : { push_messages: true } }], golf_calendar_notifications: [] },
    updates,
    opts.updateError,
  );
  vi.doMock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => opts.flagOn === true }));
  vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => rls }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
  if (opts.pushes) for (const p of opts.pushes) sendPushNotificationMock.mockResolvedValueOnce(p);
  const { notifyGolfMessageRecipients } = await import('@/lib/notifications/golf-message-fanout');
  await notifyGolfMessageRecipients(CONV, SENDER, 'now please', opts.notifyAnyway === undefined ? undefined : { notifyAnyway: opts.notifyAnyway, messageId: opts.messageId === undefined ? MESSAGE : opts.messageId });
  return { updates };
}

beforeEach(() => {
  notifyNewMessageMock.mockClear();
  sendPushNotificationMock.mockReset();
  sendPushNotificationMock.mockResolvedValue({ success: true, delivered: 1 });
  logServerErrorMock.mockClear();
});
afterEach(() => vi.resetModules());

describe('Notify anyway in the message fan-out', () => {
  it('a flagged message sends its push with the bypass instruction and is stamped once a push went out', async () => {
    const { updates } = await run({ notifyAnyway: true });
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock.mock.calls[0]).toEqual(['new_message', 'p1', { senderName: 'Coach Rini', preview: 'now please', conversationId: CONV, hold: 'bypass' }]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe('golf_messages');
    expect(Object.keys(updates[0]!.row)).toEqual(['notify_anyway_pushed_at']);
    expect(Date.parse(String(updates[0]!.row.notify_anyway_pushed_at))).not.toBeNaN();
    expect(updates[0]!.filters).toEqual([['id', MESSAGE]]);
  });

  it('is not stamped when no push went out (the recipient turned message pushes off, or the send failed)', async () => {
    expect((await run({ notifyAnyway: true, pushOff: true })).updates).toHaveLength(0);
    expect(sendPushNotificationMock).not.toHaveBeenCalled();
    vi.resetModules();
    sendPushNotificationMock.mockReset();
    sendPushNotificationMock.mockResolvedValue({ success: false });
    expect((await run({ notifyAnyway: true })).updates).toHaveLength(0);
  });

  it('is not stamped when the push reported success without reaching a device (opted out, no device, only queued)', async () => {
    // sendPushNotification answers { success: true } with no `delivered` for all three; a caption over any of them would promise a delivery
    // nobody can confirm.
    sendPushNotificationMock.mockResolvedValue({ success: true });
    expect((await run({ notifyAnyway: true })).updates).toHaveLength(0);
    vi.resetModules();
    sendPushNotificationMock.mockReset();
    sendPushNotificationMock.mockResolvedValue({ success: true, delivered: 0 });
    expect((await run({ notifyAnyway: true })).updates).toHaveLength(0);
  });

  it('is not stamped without a message id', async () => {
    expect((await run({ notifyAnyway: true, messageId: null })).updates).toHaveLength(0);
  });

  it('a message that was not flagged is sent exactly as before, with no hold instruction and no stamp', async () => {
    const plain = await run({});
    expect(sendPushNotificationMock.mock.calls[0]![2]).toEqual({ senderName: 'Coach Rini', preview: 'now please', conversationId: CONV });
    expect(plain.updates).toHaveLength(0);
    vi.resetModules();
    sendPushNotificationMock.mockClear();
    const off = await run({ notifyAnyway: false });
    expect(sendPushNotificationMock.mock.calls[0]![2]).not.toHaveProperty('hold');
    expect(off.updates).toHaveLength(0);
  });

  it('a stamp that fails is logged and never fails the send', async () => {
    const { updates } = await run({ notifyAnyway: true, updateError: { message: 'denied' } });
    expect(updates).toHaveLength(1);
    expect(logServerErrorMock.mock.calls.some(([m]) => String(m).includes('Notify anyway stamp failed'))).toBe(true);
    expect(notifyNewMessageMock).toHaveBeenCalledTimes(1);
  });
});

describe('the class hold instruction in the message fan-out', () => {
  const TEAM = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';
  const holds = () => sendPushNotificationMock.mock.calls.map((c) => (c[2] as Record<string, unknown>).hold);

  it('flag off: no instruction at all, whatever the conversation', async () => {
    await run({ teamId: TEAM });
    expect(holds()).toEqual([undefined]);
    expect(sendPushNotificationMock.mock.calls[0]![2]).not.toHaveProperty('hold');
  });

  it('flag on: a team 1:1 is a coach DM hold carrying the conversation and the message', async () => {
    await run({ flagOn: true, teamId: TEAM, messageId: MESSAGE, notifyAnyway: false });
    expect(holds()).toEqual([{ group: 'coach_dm', conversationId: CONV, messageId: MESSAGE }]);
  });

  it('flag on: more than one other participant is a group hold', async () => {
    await run({ flagOn: true, teamId: TEAM, participants: 3 });
    expect(holds().every((h) => (h as { group: string }).group === 'group')).toBe(true);
    expect(holds()[0]).not.toHaveProperty('messageId');
  });

  it('flag on: a conversation with no team is never held (bypass)', async () => {
    await run({ flagOn: true, teamId: null });
    expect(holds()).toEqual(['bypass']);
  });

  it('a Notify anyway message is bypass whatever the conversation', async () => {
    await run({ flagOn: true, teamId: TEAM, notifyAnyway: true });
    expect(holds()).toEqual(['bypass']);
  });
});
