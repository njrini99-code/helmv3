import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-10 Notify anyway, the send half. The flag is written only when the sender asked, the sport is golf and `class_awareness_v1` is on (so
 * a send never names a column a held migration has not added). The fan-out is told the flag as the database KEPT it: the trigger resets it for
 * anyone who is not a coach of the conversation's team.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const CONTENT = 'Can you step out for two minutes';

const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));
const fanout = vi.hoisted(() => ({ notify: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: fanout.notify }));

function harness(stored: { notify_anyway?: boolean } | 'duplicate' = {}) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        neq() { return chain; },
        insert(row: Record<string, unknown>) { inserts.push({ table, row }); return chain; },
        update() { return chain; },
        async single() {
          if (table.endsWith('_conversation_participants')) return { data: { id: 'member' }, error: null };
          if (stored === 'duplicate') return { data: null, error: { code: '23505', message: 'duplicate key' } };
          return { data: { id: MESSAGE, created_at: '2026-10-26T14:00:00Z', ...stored }, error: null };
        },
        async maybeSingle() {
          return { data: stored === 'duplicate' ? { id: MESSAGE, conversation_id: CONVERSATION, sender_id: USER, content: CONTENT, reply_to_id: null } : null, error: null };
        },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return chain;
    },
  };
  vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => client }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
  return { inserts };
}

async function send(stored: Parameters<typeof harness>[0], opts?: { notifyAnyway?: boolean }) {
  const evidence = harness(stored);
  const { sendGolfMessage } = await import('@/app/actions/messages');
  const result = await sendGolfMessage(CONVERSATION, CONTENT, MESSAGE, null, opts);
  return { result, ...evidence };
}
const messageInsert = (inserts: Array<{ table: string; row: Record<string, unknown> }>) => inserts.find((i) => i.table === 'golf_messages')?.row;

beforeEach(() => {
  vi.resetModules();
  fanout.notify.mockClear();
  flag.on = true;
});

describe('sendGolfMessage with Notify anyway', () => {
  it('writes the flag when asked, and tells the fan-out the flag the database kept', async () => {
    const { result, inserts } = await send({ notify_anyway: true }, { notifyAnyway: true });
    expect(result.success).toBe(true);
    expect(messageInsert(inserts)).toMatchObject({ id: MESSAGE, sender_id: USER, notify_anyway: true });
    expect(fanout.notify).toHaveBeenCalledWith(CONVERSATION, USER, CONTENT, { notifyAnyway: true, messageId: MESSAGE });
  });

  it('when the trigger reset the flag (not a coach of the conversation’s team) the fan-out is told it was not flagged: the push goes out as it always would', async () => {
    const { inserts } = await send({ notify_anyway: false }, { notifyAnyway: true });
    expect(messageInsert(inserts)).toMatchObject({ notify_anyway: true });
    // With the flag on the fan-out learns the message id (so a held push can be dropped if the player reads it first), never a bypass.
    expect(fanout.notify).toHaveBeenCalledWith(CONVERSATION, USER, CONTENT, { notifyAnyway: false, messageId: MESSAGE });
  });

  it('a send that did not ask never names the column', async () => {
    const { inserts } = await send({});
    expect(messageInsert(inserts)).not.toHaveProperty('notify_anyway');
    expect(fanout.notify).toHaveBeenCalledWith(CONVERSATION, USER, CONTENT, { notifyAnyway: false, messageId: MESSAGE });
  });

  it('with the flag off an asked-for flag is ignored, so no send depends on a held migration', async () => {
    flag.on = false;
    const { inserts } = await send({ notify_anyway: true }, { notifyAnyway: true });
    expect(messageInsert(inserts)).not.toHaveProperty('notify_anyway');
    // Even if a row came back flagged, nothing asked for it: the fan-out is not told to bypass.
    expect(fanout.notify).toHaveBeenCalledWith(CONVERSATION, USER, CONTENT, undefined);
  });

  it('an idempotent duplicate carries no stored flag: the fan-out runs as a plain message', async () => {
    const { result } = await send('duplicate', { notifyAnyway: true });
    expect(result.success).toBe(true);
    expect(fanout.notify).toHaveBeenCalledWith(CONVERSATION, USER, CONTENT, { notifyAnyway: false, messageId: MESSAGE });
  });
});
