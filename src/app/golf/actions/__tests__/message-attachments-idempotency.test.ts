import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const ATTACHMENT = { id: '66666666-6666-4666-8666-666666666666', fileName: 'range.jpg', fileType: 'image' as const, mimeType: 'image/jpeg', fileSize: 1024, storagePath: 'golf/range.jpg' };

const state = vi.hoisted(() => ({
  messages: new Map<string, Record<string, unknown>>(),
  attachments: new Map<string, Record<string, unknown>>(),
  remove: vi.fn(async () => ({ error: null })),
  notify: vi.fn(),
  after: vi.fn(),
  loseMessageResponse: false,
  loseAttachmentResponse: false,
  attachmentError: null as null | { message: string; code?: string },
  unreadableAttachments: false,
  compensationError: false,
  pauseAttachmentResponse: null as null | Promise<void>,
  metadataInserted: vi.fn(),
}));
vi.mock('next/server', () => ({ after: state.after }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: state.notify }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  storage: { from: () => ({ remove: state.remove }) },
  from(table: string) {
    let mode = 'select';
    let values: Record<string, unknown> | Record<string, unknown>[] = {};
    const filters: Record<string, unknown> = {};
    const chain = {
      select() { return chain; },
      eq(column: string, value: unknown) { filters[column] = value; return chain; },
      insert(row: typeof values) { mode = 'insert'; values = row; return chain; },
      update(row: typeof values) { mode = 'update'; values = row; return chain; },
      delete() { mode = 'delete'; return chain; },
      async single() {
        if (table === 'golf_conversation_participants') return { data: { id: 'member' }, error: null };
        const row = values as Record<string, unknown>;
        if (state.messages.has(String(row.id))) return { data: null, error: { code: '23505', message: 'duplicate message' } };
        state.messages.set(String(row.id), { ...row });
        if (state.loseMessageResponse) { state.loseMessageResponse = false; throw new TypeError('Load failed'); }
        return { data: { id: row.id }, error: null };
      },
      async maybeSingle() { return { data: state.messages.get(String(filters.id)) ?? null, error: null }; },
      async execute() {
        if (table === 'golf_message_attachments') {
          if (mode === 'select') return { data: state.unreadableAttachments ? null : [...state.attachments.values()].filter(row => row.message_id === filters.message_id), error: state.unreadableAttachments ? { message: 'read unavailable' } : null };
          const rows = values as Record<string, unknown>[];
          if (rows.some(row => state.attachments.has(String(row.id)))) return { data: null, error: { code: '23505', message: 'duplicate attachment' } };
          if (state.attachmentError) return { data: null, error: state.attachmentError };
          for (const row of rows) state.attachments.set(String(row.id), { ...row });
          state.metadataInserted();
          if (state.pauseAttachmentResponse) await state.pauseAttachmentResponse;
          if (state.loseAttachmentResponse) { state.loseAttachmentResponse = false; return { data: null, error: { message: 'Failed to fetch' } }; }
        }
        if (table === 'golf_messages' && (mode === 'update' || mode === 'delete') && state.compensationError) return { data: null, error: { message: 'Load failed' } };
        if (table === 'golf_messages' && mode === 'update') Object.assign(state.messages.get(String(filters.id))!, values);
        if (table === 'golf_messages' && mode === 'delete') state.messages.delete(String(filters.id));
        return { data: [], error: null };
      },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return chain.execute().then(resolve, reject); },
    };
    return chain;
  },
}) }));

import { sendGolfMessageWithAttachments } from '../message-attachments';
const send = (content = 'Range at four', attachment = ATTACHMENT) => sendGolfMessageWithAttachments(CONVERSATION, content, [attachment], undefined, MESSAGE);

beforeEach(() => {
  state.messages.clear(); state.attachments.clear(); vi.clearAllMocks();
  state.loseMessageResponse = false; state.loseAttachmentResponse = false;
  state.attachmentError = null; state.unreadableAttachments = false; state.pauseAttachmentResponse = null;
  state.compensationError = false;
});

describe('attachment sends reuse existing message and metadata primary keys', () => {
  it('refuses a cookie/session switch at the server boundary before any write', async () => {
    expect(await sendGolfMessageWithAttachments(CONVERSATION, 'Range at four', [ATTACHMENT], undefined, MESSAGE,
      '22222222-2222-4222-8222-222222222222')).toMatchObject({ success: false, sendOutcome: 'refused' });
    expect(state.messages.size).toBe(0); expect(state.attachments.size).toBe(0);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('finishes a message whose first INSERT committed but the response was lost, without a duplicate message', async () => {
    state.loseMessageResponse = true;
    expect(await send()).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(await send()).toEqual({ success: true, messageId: MESSAGE });
    expect(state.messages.size).toBe(1); expect(state.attachments.size).toBe(1);
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.after).toHaveBeenCalledOnce();
    state.after.mockClear();
    expect(await send()).toEqual({ success: true, messageId: MESSAGE });
    expect(state.after).not.toHaveBeenCalled();
  });

  it('proves a metadata INSERT committed after its response was lost and never removes referenced storage', async () => {
    state.loseAttachmentResponse = true;
    expect(await send()).toEqual({ success: true, messageId: MESSAGE });
    expect(state.messages.size).toBe(1); expect(state.attachments.size).toBe(1);
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.after).toHaveBeenCalledOnce();
    state.after.mockClear();
    expect(await send()).toEqual({ success: true, messageId: MESSAGE });
    expect(state.after).not.toHaveBeenCalled();
  });

  it('is safe when two exact attempts overlap at the metadata commit boundary', async () => {
    let release!: () => void;
    state.pauseAttachmentResponse = new Promise(resolve => { release = resolve; });
    const first = send();
    await vi.waitFor(() => expect(state.metadataInserted).toHaveBeenCalledOnce());
    expect(await send()).toEqual({ success: true, messageId: MESSAGE });
    release(); expect(await first).toEqual({ success: true, messageId: MESSAGE });
    expect(state.messages.size).toBe(1); expect(state.attachments.size).toBe(1);
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('refuses different text under the same message identity', async () => {
    await send();
    expect(await send('Different text')).toMatchObject({ success: false, sendOutcome: 'refused' });
    expect(state.attachments.size).toBe(1); expect(state.remove).not.toHaveBeenCalled();
  });

  it('does not claim success for a colliding attachment ID with different metadata', async () => {
    await send();
    expect(await send('Range at four', { ...ATTACHMENT, storagePath: 'golf/different.jpg' })).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('retains unknown when metadata cannot be read after a response loss', async () => {
    state.loseAttachmentResponse = true; state.unreadableAttachments = true;
    expect(await send()).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.messages.get(MESSAGE)?.has_attachments).toBe(true);
  });

  it('does not destructively compensate ambiguous metadata errors with no confirmed rows', async () => {
    state.attachmentError = { message: 'Load failed' };
    expect(await send()).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(state.remove).not.toHaveBeenCalled(); expect(state.messages.get(MESSAGE)?.has_attachments).toBe(true);
  });

  it.each(['40P01', '40001', '57014', '53200', '55P03'])('keeps transient SQL failure %s unknown without destructive compensation', async code => {
    state.attachmentError = { code, message: 'Transaction interrupted' };
    expect(await send()).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.messages.get(MESSAGE)?.has_attachments).toBe(true);
  });

  it('does not compensate a replay while the original metadata writer might still finish', async () => {
    state.loseMessageResponse = true;
    await send();
    state.attachmentError = { code: '42501', message: 'insert denied' };
    expect(await send()).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.messages.get(MESSAGE)?.has_attachments).toBe(true);
  });

  it('compensates a proven SQL refusal and keeps the delivered text as a partial result', async () => {
    state.attachmentError = { code: '42501', message: 'insert denied' };
    expect(await send()).toMatchObject({ success: true, attachmentsFailed: true });
    expect(state.remove).toHaveBeenCalledWith([ATTACHMENT.storagePath]);
    expect(state.messages.get(MESSAGE)?.has_attachments).toBe(false);
    expect(await send()).toMatchObject({ success: true, attachmentsFailed: true });
    expect(state.attachments.size).toBe(0);
  });

  it('preserves uploaded files when the compensating message update itself has an unknown outcome', async () => {
    state.attachmentError = { code: '42501', message: 'insert denied' };
    state.compensationError = true;
    expect(await send()).toMatchObject({ success: false, sendOutcome: 'unknown' });
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.messages.get(MESSAGE)?.has_attachments).toBe(true);
  });
});
