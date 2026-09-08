/**
 * G-18 — a 23505 on the message insert is reported as success only when the
 * row that already exists is provably THIS sender's message.
 *
 * The short-circuit itself is deliberate and load-bearing:
 * `withOneTransportRetry` reruns the same send with the same clientMessageId
 * after a transport death, and `retryMessage` (G-19) re-sends a failed
 * optimistic row under its original id. Both collide on `*_messages_pkey`, and
 * both must be reported as the success they are, or the caller rolls back a
 * message realtime has already delivered.
 *
 * What was missing was the other half. "The primary key is taken" is not proof
 * that WE took it, and the previous code returned `{ success: true }` on that
 * evidence alone (§17.3). This suite pins both directions: the idempotent
 * retries keep working, and a collision the database cannot confirm as ours is
 * reported as a failure instead of a phantom delivery.
 *
 * Failing closed here is only safe because G-19 landed first: the caller now
 * RETAINS the optimistic bubble and offers Retry, rather than deleting it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const OTHER_CONVERSATION = '44444444-4444-4444-8444-444444444444';
const CLIENT_MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const CONTENT = 'Range at 4, bring wedges';

const DUPLICATE_KEY = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "golf_messages_pkey"',
} as const;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({
  notifyGolfMessageRecipients: vi.fn(async () => {}),
}));

interface ExistingRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
}

interface HarnessOptions {
  /** The row the duplicate-id lookup finds, if any. */
  existingRow?: ExistingRow | null;
  /** An error from the lookup itself (RLS denial, transport, …). */
  lookupError?: { message: string; code?: string } | null;
  /** Omit to make the insert collide; supply to make it succeed. */
  insertSucceeds?: boolean;
}

/**
 * A supabase double that can distinguish the INSERT on the messages table from
 * the later duplicate-id SELECT on that SAME table — the sequencing this test
 * turns on. A table-keyed mock returning one canned response per table would
 * hand the lookup the insert's error and prove nothing.
 */
function makeHarness(opts: HarnessOptions = {}) {
  const lookups: Array<{ table: string; id: unknown }> = [];

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => {
      let mode: 'insert' | 'select' | 'update' | null = null;
      let filteredId: unknown = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};

      builder.insert = () => { mode = 'insert'; return builder; };
      builder.update = () => { mode = 'update'; return builder; };
      builder.select = () => { if (mode === null) mode = 'select'; return builder; };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      builder.eq = (column: string, value: any) => {
        if (column === 'id') filteredId = value;
        return builder;
      };
      builder.neq = () => builder;
      builder.in = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;

      builder.single = async () => {
        if (table.endsWith('_conversation_participants')) {
          return { data: { id: 'participant-row' }, error: null };
        }
        if (table.endsWith('_messages') && mode === 'insert') {
          return opts.insertSucceeds
            ? { data: { id: CLIENT_MESSAGE_ID, conversation_id: CONVERSATION, sender_id: USER, content: CONTENT }, error: null }
            : { data: null, error: { ...DUPLICATE_KEY } };
        }
        return { data: null, error: null };
      };

      builder.maybeSingle = async () => {
        if (table.endsWith('_messages') && mode === 'select') {
          lookups.push({ table, id: filteredId });
          return { data: opts.existingRow ?? null, error: opts.lookupError ?? null };
        }
        return { data: null, error: null };
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      builder.then = (res: (v: any) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej);

      return builder;
    },
  };

  return { client, lookups };
}

async function send(opts: HarnessOptions, overrides: Partial<{ content: string }> = {}) {
  const { client, lookups } = makeHarness(opts);
  vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => client }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

  const { sendMessage } = await import('@/app/actions/messages');
  const result = await sendMessage({
    conversationId: CONVERSATION,
    content: overrides.content ?? CONTENT,
    sport: 'golf',
    createNotifications: false,
    clientMessageId: CLIENT_MESSAGE_ID,
  });

  return { result, lookups };
}

describe('sendMessage — a duplicate key is only success when the row is ours (G-18)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it('reports success for the transport-retry case: same id, sender, conversation and content', async () => {
    const { result, lookups } = await send({
      existingRow: { id: CLIENT_MESSAGE_ID, conversation_id: CONVERSATION, sender_id: USER, content: CONTENT },
    });

    expect(result).toEqual({ success: true });
    // …and it earned that answer by asking, rather than assuming.
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.id).toBe(CLIENT_MESSAGE_ID);
  });

  it('does NOT report success when the colliding row belongs to another sender', async () => {
    const { result } = await send({
      existingRow: { id: CLIENT_MESSAGE_ID, conversation_id: CONVERSATION, sender_id: OTHER_USER, content: CONTENT },
    });

    expect(result.success).toBe(false);
  });

  it('does NOT report success when the colliding row is in another conversation', async () => {
    const { result } = await send({
      existingRow: { id: CLIENT_MESSAGE_ID, conversation_id: OTHER_CONVERSATION, sender_id: USER, content: CONTENT },
    });

    expect(result.success).toBe(false);
  });

  it('does NOT report success when the content differs — a different message under a reused id', async () => {
    const { result } = await send({
      existingRow: { id: CLIENT_MESSAGE_ID, conversation_id: CONVERSATION, sender_id: USER, content: 'Something else entirely' },
    });

    expect(result.success).toBe(false);
  });

  it('fails closed when RLS hides the colliding row entirely', async () => {
    // Invisible is indistinguishable from not-ours, and the only claim worth
    // making is one the database just confirmed.
    const { result, lookups } = await send({ existingRow: null });

    expect(lookups).toHaveLength(1);
    expect(result.success).toBe(false);
  });

  it('fails closed when the lookup itself errors', async () => {
    const { result } = await send({
      existingRow: { id: CLIENT_MESSAGE_ID, conversation_id: CONVERSATION, sender_id: USER, content: CONTENT },
      lookupError: { message: 'permission denied for table golf_messages', code: '42501' },
    });

    expect(result.success).toBe(false);
  });

  it('leaves an ordinary successful send untouched — no lookup, no extra round trip', async () => {
    const { result, lookups } = await send({ insertSucceeds: true });

    expect(result).toEqual({ success: true });
    expect(lookups).toHaveLength(0);
  });
});
