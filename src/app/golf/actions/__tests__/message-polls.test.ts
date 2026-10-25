import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const ELSEWHERE = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';

const state = vi.hoisted(() => ({
  members: [] as string[],
  messages: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Record<string, unknown> }>,
  notify: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: state.notify }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from(table: string) {
      let mode: 'select' | 'insert' | 'update' = 'select';
      let values: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        insert(row: Record<string, unknown>) { mode = 'insert'; values = row; return chain; },
        update(row: Record<string, unknown>) { mode = 'update'; values = row; return chain; },
        async single() {
          if (state.messages.has(String(values.id))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          const id = String(values.id ?? MESSAGE);
          state.messages.set(id, { ...values, id, is_deleted: false });
          return { data: { id }, error: null };
        },
        async maybeSingle() { return { data: state.messages.get(String(filters.id)) ?? null, error: null }; },
        async execute() {
          if (table === 'golf_conversation_participants') {
            return { data: state.members.map((user_id) => ({ user_id })), error: null };
          }
          if (mode === 'update') {
            state.updates.push({ table, values, filters });
            const row = table === 'golf_messages' ? state.messages.get(String(filters.id)) : undefined;
            if (row && row.sender_id === filters.sender_id) Object.assign(row, values);
          }
          return { data: [], error: null };
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return chain.execute().then(resolve, reject);
        },
      };
      return chain;
    },
  }),
}));

import { closeGolfPoll, sendGolfPoll } from '../message-polls';

const draft = { question: 'Which van Thursday?', options: ['Van 1', 'Van 2'], multi: false, closesAt: null };

const seedPoll = (overrides: Record<string, unknown> = {}) => {
  state.messages.set(MESSAGE, {
    id: MESSAGE,
    conversation_id: CONVERSATION,
    sender_id: USER,
    kind: 'poll',
    is_deleted: false,
    payload: { v: 1, question: 'Which van Thursday?', options: [{ id: 'o1', label: 'Van 1' }, { id: 'o2', label: 'Van 2' }], multi: false, closes_at: null, closed_at: null },
    ...overrides,
  });
};

beforeEach(() => {
  state.members = [USER, OTHER];
  state.messages.clear();
  state.updates = [];
  vi.clearAllMocks();
});

describe('sendGolfPoll', () => {
  it('posts a poll row with its fallback text and tells the other members', async () => {
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE)).toMatchObject({ success: true, id: MESSAGE });
    const row = state.messages.get(MESSAGE)!;
    expect(row).toMatchObject({ kind: 'poll', sender_id: USER, conversation_id: CONVERSATION });
    expect(String(row.content)).toMatch(/^Poll: Which van Thursday\?\n/);
    expect(state.notify).toHaveBeenCalledWith(CONVERSATION, USER, 'Poll: Which van Thursday?');
  });

  it('refuses a sender who is not in the conversation, before any write', async () => {
    state.members = [OTHER];
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE)).toEqual({ success: false, error: 'You are not in this conversation' });
    expect(state.messages.size).toBe(0);
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('refuses an end time that has already passed', async () => {
    const past = { ...draft, closesAt: new Date(Date.now() - 60_000).toISOString() };
    expect(await sendGolfPoll(CONVERSATION, past, MESSAGE)).toEqual({ success: false, error: 'Pick an end time that hasn’t passed.' });
    expect(state.messages.size).toBe(0);
  });

  it('reports a retried send that already committed as a success, without a second row or a second notice', async () => {
    seedPoll();
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE)).toEqual({ success: true, id: MESSAGE });
    expect(state.messages.size).toBe(1);
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('does not treat a 23505 on someone else’s message as its own replay', async () => {
    seedPoll({ sender_id: OTHER });
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE)).toEqual({ success: false, error: 'Could not send the poll' });
  });

  it('does not treat a 23505 on a message in another conversation as its own replay', async () => {
    seedPoll({ conversation_id: ELSEWHERE });
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE)).toEqual({ success: false, error: 'Could not send the poll' });
  });

  it('does not treat a 23505 on a plain text message as a poll replay', async () => {
    seedPoll({ kind: 'text' });
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE)).toEqual({ success: false, error: 'Could not send the poll' });
  });
});

describe('closeGolfPoll', () => {
  it('D19: an edited retry after a throw asks first when the earlier copy landed, and posts when it did not', async () => {
    const PRIOR = '66666666-6666-4666-8666-666666666666';
    seedPoll({ id: PRIOR });
    state.messages.set(PRIOR, { ...state.messages.get(MESSAGE)!, id: PRIOR });
    state.messages.delete(MESSAGE);
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE, PRIOR)).toEqual({ success: false, error: 'An earlier copy of this poll was already sent', earlierCopy: true });
    expect(state.messages.has(MESSAGE)).toBe(false);
    expect(state.notify).not.toHaveBeenCalled();
    state.messages.clear();
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE, PRIOR)).toMatchObject({ success: true, id: MESSAGE });
    expect(await sendGolfPoll(CONVERSATION, draft, MESSAGE, MESSAGE)).toEqual({ success: false, error: 'Invalid message id' });
  });

  it('lets the sender close their poll', async () => {
    seedPoll();
    expect(await closeGolfPoll(MESSAGE)).toEqual({ success: true, id: MESSAGE });
    const payload = state.messages.get(MESSAGE)!.payload as Record<string, unknown>;
    expect(typeof payload.closed_at).toBe('string');
  });

  it('refuses anyone but the sender, and writes nothing', async () => {
    seedPoll({ sender_id: OTHER });
    expect(await closeGolfPoll(MESSAGE)).toEqual({ success: false, error: 'Only the person who sent the poll can close it' });
    expect(state.updates.filter((u) => u.table === 'golf_messages')).toHaveLength(0);
  });

  it('treats closing an already closed poll as done, without writing again', async () => {
    seedPoll({
      payload: { v: 1, question: 'Which van Thursday?', options: [{ id: 'o1', label: 'Van 1' }, { id: 'o2', label: 'Van 2' }], multi: false, closes_at: null, closed_at: '2026-10-24T18:00:00.000Z' },
    });
    expect(await closeGolfPoll(MESSAGE)).toEqual({ success: true, id: MESSAGE });
    expect(state.updates.filter((u) => u.table === 'golf_messages')).toHaveLength(0);
  });

  it('refuses a message that is not a poll', async () => {
    seedPoll({ kind: 'text' });
    expect(await closeGolfPoll(MESSAGE)).toEqual({ success: false, error: 'This poll is gone' });
  });
});
