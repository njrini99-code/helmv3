import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const OTHER_CONVERSATION = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const PARENT = '66666666-6666-4666-8666-666666666666';
const CONTENT = 'See you there';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: vi.fn() }));

interface Options {
  signedIn?: boolean;
  member?: boolean;
  parent?: { id: string; conversation_id: string } | null;
  parentError?: boolean;
  duplicate?: { reply_to_id: string | null };
}

function harness(options: Options = {}) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const reads: Array<{ table: string; fields: string; filters: Record<string, unknown> }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.signedIn === false ? null : { id: USER } } }) },
    from(table: string) {
      let mode = 'select';
      let fields = '';
      const filters: Record<string, unknown> = {};
      const chain = {
        select(value = '*') { fields = value; return chain; },
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        neq() { return chain; },
        insert(row: Record<string, unknown>) { mode = 'insert'; inserts.push({ table, row }); return chain; },
        update() { mode = 'update'; return chain; },
        async single() {
          if (table.endsWith('_conversation_participants')) {
            reads.push({ table, fields, filters: { ...filters } });
            return { data: options.member === false ? null : { id: 'member' }, error: null };
          }
          return options.duplicate
            ? { data: null, error: { code: '23505', message: 'duplicate key' } }
            : { data: { id: MESSAGE }, error: null };
        },
        async maybeSingle() {
          reads.push({ table, fields, filters: { ...filters } });
          if (filters.id === PARENT) {
            return { data: options.parent === undefined ? { id: PARENT, conversation_id: CONVERSATION } : options.parent,
              error: options.parentError ? { message: 'read failed' } : null };
          }
          return { data: options.duplicate ? { id: MESSAGE, conversation_id: CONVERSATION, sender_id: USER, content: CONTENT, ...options.duplicate } : null, error: null };
        },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null, mode }).then(resolve); },
      };
      return chain;
    },
  };
  vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => client }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
  return { inserts, reads };
}

async function textSend(options: Options = {}, replyToId: string | null = PARENT, sport: 'golf' | 'baseball' = 'golf') {
  const evidence = harness(options);
  const { sendMessage } = await import('@/app/actions/messages');
  const result = await sendMessage({ conversationId: CONVERSATION, content: CONTENT, clientMessageId: MESSAGE,
    createNotifications: false, sport, replyToId });
  return { result, ...evidence };
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

describe('Golf quoted reply authorization and persistence', () => {
  it('proves membership then reads only a parent ID in the same conversation before storing the link', async () => {
    const { result, reads, inserts } = await textSend();
    expect(result.success).toBe(true);
    expect(reads[0]).toEqual({ table: 'golf_conversation_participants', fields: 'id', filters: { conversation_id: CONVERSATION, user_id: USER } });
    expect(reads[1]).toEqual({ table: 'golf_messages', fields: 'id, conversation_id', filters: { id: PARENT, conversation_id: CONVERSATION } });
    expect(inserts[0]?.row).toMatchObject({ id: MESSAGE, reply_to_id: PARENT, sender_id: USER });
  });

  it.each([{ signedIn: false }, { member: false }])('refuses unauthorized sends before any parent lookup or insert: %j', async options => {
    const { result, reads, inserts } = await textSend(options);
    expect(result.success).toBe(false);
    expect(reads.filter(read => read.table === 'golf_messages')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it.each([{ parent: null }, { parentError: true }, { parent: { id: PARENT, conversation_id: OTHER_CONVERSATION } }])('fails closed for unavailable or cross-conversation parents: %j', async options => {
    const { result, inserts } = await textSend(options);
    expect(result.success).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('rejects malformed parent IDs before querying messages', async () => {
    const { result, reads, inserts } = await textSend({}, 'not-a-uuid');
    expect(result.success).toBe(false);
    expect(reads.filter(read => read.table === 'golf_messages')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('accepts an idempotent duplicate only with the same reply target', async () => {
    const { result } = await textSend({ duplicate: { reply_to_id: PARENT } });
    expect(result.success).toBe(true);
  });

  it.each([null, MESSAGE])('refuses a duplicate whose reply target differs: %s', async reply => {
    const { result } = await textSend({ duplicate: { reply_to_id: reply } });
    expect(result.success).toBe(false);
  });

  it('does not count an existing quoted reply as a successful plain send', async () => {
    const { result } = await textSend({ duplicate: { reply_to_id: PARENT } }, null);
    expect(result.success).toBe(false);
  });

  it('keeps plain Baseball insert/query contracts unchanged', async () => {
    const { result, reads, inserts } = await textSend({}, null, 'baseball');
    expect(result.success).toBe(true);
    expect(reads).toHaveLength(1);
    expect(reads[0]?.table).toBe('baseball_conversation_participants');
    expect(inserts[0]?.table).toBe('baseball_messages');
    expect(inserts[0]?.row).not.toHaveProperty('reply_to_id');
  });

  it('never sends a Golf reply link to Baseball', async () => {
    const { result, inserts } = await textSend({}, PARENT, 'baseball');
    expect(result.success).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('persists the same verified target for the attachment send path', async () => {
    const { reads, inserts } = harness();
    const { sendGolfMessageWithAttachments } = await import('@/app/golf/actions/message-attachments');
    const attachment = { fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024, storagePath: 'golf/range.jpg' };
    const result = await sendGolfMessageWithAttachments(CONVERSATION, CONTENT, [attachment], PARENT);
    expect(result.success).toBe(true);
    expect(reads[1]?.filters).toEqual({ id: PARENT, conversation_id: CONVERSATION });
    expect(inserts[0]?.row).toMatchObject({ reply_to_id: PARENT, content: CONTENT, has_attachments: true });
    expect(inserts[1]).toMatchObject({ table: 'golf_message_attachments', row: [{ message_id: MESSAGE, storage_path: attachment.storagePath }] });
  });

  it('refuses an attachment reply with an unavailable parent before inserting message metadata', async () => {
    const { inserts } = harness({ parent: null });
    const { sendGolfMessageWithAttachments } = await import('@/app/golf/actions/message-attachments');
    const result = await sendGolfMessageWithAttachments(CONVERSATION, CONTENT, [], PARENT);
    expect(result.success).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
