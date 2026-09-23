import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// §15.2 fixture-matrix row 38 ("Chat fails validation after generating
// text") — reload-path wiring test.
//
// The generation-time mechanism lives entirely in
// `src/app/api/coachhelm/v3/chat/stream/route.ts`'s `onFinish`: an
// ungrounded (unsupported numeric claim) assistant turn is persisted with
// `status: 'failed'`, `content` = the model's text + a private
// `UNGROUNDED_NOTE` fragment, and `ui_parts` includes the
// `data-grounding-flag` part the stream writer emitted live — NOT via
// `claim-validator.ts` (that module has no caller in the chat surface; see
// this PR's doc-pointer note).
//
// This file does not re-test that write path — it proves the READ path this
// row is actually about: once such a row exists, does `GET
// conversations/[id]` (this route, real) + `listMessages` (real, from
// `persistence.ts`) hand it back to a reloading client intact, or does
// something on the reload path (the `MESSAGE_COLUMNS` select, `rowToMessage`,
// or the route's own JSON shaping) drop the status, the note, or the
// grounding-flag part? Only the Supabase client is faked; `getConversation`,
// `listMessages`, and the route's GET handler are all real code.
// ---------------------------------------------------------------------------

// Same private literal `stream/route.ts` appends to an ungrounded turn's
// text (that module doesn't export it) — copied here only so the fixture
// reads like a real persisted row, not to re-test its wording.
const UNGROUNDED_NOTE =
  "\n\n_Some figures in this answer could not be traced back to your program's data, so I've flagged it rather than presenting them as fact. Please ask again._";

const GROUNDING_FLAG_PART = {
  type: 'data-grounding-flag',
  id: 'grounding-flag',
  data: { note: UNGROUNDED_NOTE },
};

type Row = Record<string, unknown>;

/** Same minimal, filtering, thenable Postgrest fake used elsewhere (e.g.
 *  `round-review-as-of.test.ts`) — `.select`/`.eq` genuinely narrow the
 *  in-memory rows, `.order` is a no-op (single fixture row per table), and
 *  the builder itself is awaitable for a bare `await ...eq(...)` call shape
 *  (persistence.ts's `listMessages`), while also supporting `.maybeSingle()`
 *  (`getConversation`, and route.ts's own `golf_coaches` lookup). */
function makeSupabase(store: Record<string, Row[]>) {
  function builder(table: string) {
    let rows = [...(store[table] ?? [])];
    const node: Record<string, unknown> = {};
    Object.assign(node, {
      select: () => node,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return node;
      },
      order: () => node,
      maybeSingle: async () => (rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    });
    return node;
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => builder(table),
  };
}

let supabaseFixture: ReturnType<typeof makeSupabase>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabaseFixture,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from './route';

describe('GET /api/coachhelm/v3/chat/conversations/[id] — §15.2 row 38 reload of a failed/ungrounded turn', () => {
  it('returns the stored failed turn with its content note and grounding-flag part intact', async () => {
    supabaseFixture = makeSupabase({
      golf_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      golf_coachhelm_chat_conversations: [
        {
          id: 'conv-1',
          coach_id: 'coach-1',
          title: 'Test conversation',
          pinned: false,
          archived_at: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:10Z',
        },
      ],
      golf_coachhelm_chat_messages: [
        {
          id: 'msg-user-1',
          conversation_id: 'conv-1',
          role: 'user',
          content: 'How did the roster do on approach shots last month?',
          tool_calls: null,
          tool_results: null,
          cost_usd: null,
          created_at: '2026-09-01T00:00:01Z',
          client_turn_id: 'turn-1',
          status: null,
          ui_parts: null,
        },
        {
          id: 'msg-assistant-1',
          conversation_id: 'conv-1',
          role: 'assistant',
          content: `The roster hit 91% of approach shots inside 150 yards.${UNGROUNDED_NOTE}`,
          tool_calls: null,
          tool_results: null,
          cost_usd: 0.004,
          created_at: '2026-09-01T00:00:05Z',
          client_turn_id: 'turn-1',
          status: 'failed',
          ui_parts: [
            { type: 'text', text: 'The roster hit 91% of approach shots inside 150 yards.' },
            GROUNDING_FLAG_PART,
          ],
        },
      ],
    });

    const response = await GET(new Request('http://localhost/api/coachhelm/v3/chat/conversations/conv-1'), {
      params: Promise.resolve({ id: 'conv-1' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.conversation).toMatchObject({ id: 'conv-1', coach_id: 'coach-1' });
    expect(body.messages).toHaveLength(2);

    const assistantTurn = body.messages.find((m: { id: string }) => m.id === 'msg-assistant-1');
    expect(assistantTurn).toBeDefined();

    // status survives the reload — the UI's "couldn't answer, Retry" bubble
    // depends on this being 'failed', never silently downgraded to null/
    // 'complete' by the read path.
    expect(assistantTurn.status).toBe('failed');

    // The UNGROUNDED_NOTE fragment is still part of the persisted content —
    // a reload must not truncate it back to the bare (unflagged) claim text.
    expect(assistantTurn.content).toContain(
      "Some figures in this answer could not be traced back to your program's data",
    );

    // The live grounding-flag part — without it, `restoreUIMessages`
    // (chat/restore.ts's REPLAYABLE set) has nothing to replay and a reload
    // silently drops the flag, making an ungrounded answer look normal again.
    expect(assistantTurn.ui_parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'data-grounding-flag', data: { note: UNGROUNDED_NOTE } })]),
    );
  });

  it('rejects a coach who does not own the conversation (RLS-shaped 404, not a leak)', async () => {
    supabaseFixture = makeSupabase({
      golf_coaches: [{ id: 'coach-2', user_id: 'user-1' }],
      golf_coachhelm_chat_conversations: [
        { id: 'conv-1', coach_id: 'coach-1', title: 'Someone else’s conversation', pinned: false, archived_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
      ],
      golf_coachhelm_chat_messages: [],
    });

    const response = await GET(new Request('http://localhost/api/coachhelm/v3/chat/conversations/conv-1'), {
      params: Promise.resolve({ id: 'conv-1' }),
    });

    expect(response.status).toBe(404);
  });
});
