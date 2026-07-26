/**
 * Tests for `createConversation` in src/app/actions/messages.ts — the
 * coach→player DM that could not be created at all.
 *
 * TWO SEPARATE RLS TRAPS, both reproduced against production before fixing.
 *
 * 1. The conversation insert was `.insert(data).select('id').single()`, i.e.
 *    `INSERT ... RETURNING id`. RETURNING makes Postgres apply the SELECT
 *    policy to the new row on top of the INSERT check, and a brand-new 1:1
 *    conversation cannot satisfy `golf_conversations_select_v2`: the creator
 *    is not yet a participant (those rows are written next), and a DM sets
 *    neither `is_team_chat` nor `is_team_channel`. Every disjunct false →
 *    42501 "new row violates row-level security policy", which reads as if
 *    the INSERT were rejected. It was not — the INSERT check passes.
 *    Broadcasts were unaffected because they set `is_team_chat: true`, which
 *    is exactly why team messages worked and DMs did not.
 *
 * 2. Removing RETURNING alone was NOT enough. `golf_participants_insert_v2`
 *    admits a row for someone else only via
 *    `EXISTS (SELECT 1 FROM golf_conversations WHERE id = ... AND created_by
 *    = auth.uid())`, and that subquery reads golf_conversations — so it is
 *    gated by the same unsatisfiable SELECT policy. Batching all participants
 *    into one statement therefore still failed.
 *
 *    Inserting SELF first takes the `user_id = auth.uid()` branch, which has
 *    no subquery. That row puts the conversation into
 *    user_conversation_ids(auth.uid()), which makes it readable, which lets
 *    the EXISTS succeed for everyone else.
 *
 * So the invariants are: no `.select()` on the conversation insert, and the
 * creator's participant row written in its own earlier statement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'coach-user-1';
const OTHER = 'player-user-2';
const TEAM = 'team-1';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({
  notifyGolfMessageRecipients: vi.fn(async () => {}),
}));

interface Call {
  table: string;
  op: 'select' | 'insert';
  rows?: Record<string, unknown>[];
  usedSelectAfterInsert?: boolean;
}

function makeHarness() {
  const calls: Call[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: vi.fn((table: string) => {
      let current: Call | null = null;
      const builder: Record<string, unknown> = {};
      builder.insert = vi.fn((rows: Record<string, unknown> | Record<string, unknown>[]) => {
        current = { table, op: 'insert', rows: Array.isArray(rows) ? rows : [rows] };
        calls.push(current);
        return builder;
      });
      builder.select = vi.fn(() => {
        if (current?.op === 'insert') current.usedSelectAfterInsert = true;
        else calls.push({ table, op: 'select' });
        return builder;
      });
      for (const m of ['eq', 'in', 'neq', 'order', 'limit']) builder[m] = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({ data: null, error: null }));
      builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej);
      return builder;
    }),
  };
  return { calls, client };
}

describe('createConversation — golf DM', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it('inserts the conversation WITHOUT a RETURNING clause, supplying its own id', async () => {
    const { calls, client } = makeHarness();
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => client }));

    const { createConversation } = await import('@/app/actions/messages');
    await createConversation({ participantUserIds: [OTHER], sport: 'golf', teamId: TEAM });

    const convInsert = calls.find((c) => c.table === 'golf_conversations' && c.op === 'insert');
    expect(convInsert, 'conversation should be inserted').toBeDefined();
    // The whole point: no RETURNING, so the SELECT policy is never consulted.
    expect(convInsert?.usedSelectAfterInsert).toBeFalsy();
    // Which is only safe because we know the id up front.
    expect(convInsert?.rows?.[0]).toMatchObject({ created_by: USER, team_id: TEAM });
    expect(typeof convInsert?.rows?.[0]?.id).toBe('string');
  });

  it('writes the creator participant row in its OWN statement, before the others', async () => {
    const { calls, client } = makeHarness();
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => client }));

    const { createConversation } = await import('@/app/actions/messages');
    await createConversation({ participantUserIds: [OTHER], sport: 'golf', teamId: TEAM });

    const participantInserts = calls.filter(
      (c) => c.table === 'golf_conversation_participants' && c.op === 'insert',
    );
    // Two statements, not one batch — batching is what tripped the policy.
    expect(participantInserts).toHaveLength(2);

    const first = participantInserts[0]?.rows ?? [];
    const second = participantInserts[1]?.rows ?? [];
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ user_id: USER });
    expect(second.map((r) => r.user_id)).toEqual([OTHER]);

    // Both statements must target the same conversation the insert created.
    const convId = calls.find((c) => c.table === 'golf_conversations')?.rows?.[0]?.id;
    expect(first[0]?.conversation_id).toBe(convId);
    expect(second[0]?.conversation_id).toBe(convId);
  });

  it('does not emit a second statement when the creator is the only participant', async () => {
    const { calls, client } = makeHarness();
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => client }));

    const { createConversation } = await import('@/app/actions/messages');
    await createConversation({ participantUserIds: [USER], sport: 'golf', teamId: TEAM });

    const participantInserts = calls.filter(
      (c) => c.table === 'golf_conversation_participants' && c.op === 'insert',
    );
    expect(participantInserts).toHaveLength(1);
    expect(participantInserts[0]?.rows?.[0]).toMatchObject({ user_id: USER });
  });
});
