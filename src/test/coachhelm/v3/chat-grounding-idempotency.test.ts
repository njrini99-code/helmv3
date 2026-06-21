/**
 * P1-11 — deterministic unit tests for the coach-chat grounding + idempotency
 * contract.
 *
 *   • requiresDataGrounding — the rule the send route uses to decide whether a
 *     zero-tool-call answer must FALL BACK (data question) or may pass through
 *     (chit-chat). Covers the "data question without tool call fails
 *     verification and falls back" acceptance test.
 *
 *   • persistence idempotency — upsertUserTurn + findAssistantTurn over a fake
 *     in-memory Supabase client that honors the partial unique key
 *     (conversation_id, role, client_turn_id). Covers "retrying same
 *     client_turn_id is idempotent" and "budget failure creates no orphan
 *     user-only turn" (the route only appends after the gate, and a retry
 *     dedupes).
 */

import { describe, it, expect } from 'vitest';
import { requiresDataGrounding } from '@/lib/coachhelm/v3/chat/types';
import {
  upsertUserTurn,
  findAssistantTurn,
  appendMessage,
} from '@/lib/coachhelm/v3/chat/persistence';

/* ───────────────────────── requiresDataGrounding ─────────────────────────── */

describe('requiresDataGrounding (P1-11 grounding gate)', () => {
  it.each([
    'why is Jordan worse this week?',
    'How is the team putting?',
    'compare Jordan and Maya on driving',
    'who needs the most help?',
    "what are Maya's stats?",
    'show me the roster',
    'list active goals for the team',
    'recent rounds for player Chen',
    'team patterns last 30 days',
    'how is his GIR trending?',
  ])('flags data question: %s', (q) => {
    expect(requiresDataGrounding(q)).toBe(true);
  });

  it.each([
    'hello',
    'thanks!',
    'good morning',
    'can you help me',
    '',
    '   ',
  ])('does NOT flag non-data chit-chat: %s', (q) => {
    expect(requiresDataGrounding(q)).toBe(false);
  });
});

/* ───────────────────────── fake Supabase client ──────────────────────────── */

interface Row {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_calls: unknown;
  tool_results: unknown;
  cost_usd: number | null;
  created_at: string;
  client_turn_id: string | null;
  status: string | null;
}

/**
 * A minimal in-memory stand-in for the chat-messages table that honors:
 *   - insert (appendMessage)
 *   - upsert onConflict (conversation_id,role,client_turn_id) (upsertUserTurn)
 *   - select().eq().eq().eq().maybeSingle() (findAssistantTurn)
 */
function makeFakeSb() {
  const rows: Row[] = [];
  let seq = 0;

  function normalize(values: Record<string, unknown>): Row {
    return {
      id: `row-${++seq}`,
      conversation_id: String(values.conversation_id),
      role: String(values.role),
      content: (values.content as string | null) ?? null,
      tool_calls: values.tool_calls ?? null,
      tool_results: values.tool_results ?? null,
      cost_usd: (values.cost_usd as number | null) ?? null,
      created_at: new Date(1_700_000_000_000 + seq).toISOString(),
      client_turn_id: (values.client_turn_id as string | null) ?? null,
      status: (values.status as string | null) ?? null,
    };
  }

  const api = {
    rows,
    from(_table: string) {
      return {
        insert(values: Record<string, unknown>) {
          const row = normalize(values);
          rows.push(row);
          return {
            select(_cols: string) {
              return {
                single: async () => ({ data: row, error: null }),
              };
            },
          };
        },
        upsert(values: Record<string, unknown>, opts: { onConflict: string }) {
          // Emulate the partial unique index on the onConflict tuple.
          const keys = opts.onConflict.split(',');
          const existing = rows.find((r) =>
            keys.every((k) => (r as unknown as Record<string, unknown>)[k] === values[k]),
          );
          if (existing) {
            // Conflict → return the existing row (ignoreDuplicates:false updates
            // content, but identity/id is preserved — the idempotent contract).
            existing.content = (values.content as string | null) ?? existing.content;
            return {
              select: (_cols: string) => ({ single: async () => ({ data: existing, error: null }) }),
            };
          }
          const row = normalize(values);
          rows.push(row);
          return {
            select: (_cols: string) => ({ single: async () => ({ data: row, error: null }) }),
          };
        },
        select(_cols: string) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return builder;
            },
            async maybeSingle() {
              const match = rows.find((r) =>
                filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v),
              );
              return { data: match ?? null, error: null };
            },
          };
          return builder;
        },
      };
    },
  };
  // The persistence layer is typed against SupabaseClient<Database>; the fake
  // implements only the surface these two helpers touch.
  return api as unknown as Parameters<typeof upsertUserTurn>[0] & { rows: Row[] };
}

/* ───────────────────────── idempotency contract ──────────────────────────── */

describe('chat persistence idempotency (P1-11)', () => {
  const CONV = 'conv-1';
  const TURN = 'turn-abc';

  it('upsertUserTurn dedupes a retried user turn by client_turn_id', async () => {
    const sb = makeFakeSb();
    const first = await upsertUserTurn(sb, {
      conversation_id: CONV,
      content: 'why is Jordan worse?',
      client_turn_id: TURN,
    });
    const second = await upsertUserTurn(sb, {
      conversation_id: CONV,
      content: 'why is Jordan worse?',
      client_turn_id: TURN,
    });

    expect(second.id).toBe(first.id); // same row — no duplicate
    const userRows = sb.rows.filter((r) => r.role === 'user');
    expect(userRows).toHaveLength(1);
  });

  it('upsertUserTurn without a client_turn_id falls back to a plain append', async () => {
    const sb = makeFakeSb();
    await upsertUserTurn(sb, { conversation_id: CONV, content: 'hi' });
    await upsertUserTurn(sb, { conversation_id: CONV, content: 'hi again' });
    expect(sb.rows.filter((r) => r.role === 'user')).toHaveLength(2);
  });

  it('findAssistantTurn returns a prior answer so a retry short-circuits the agent', async () => {
    const sb = makeFakeSb();
    // First exchange completes.
    await upsertUserTurn(sb, { conversation_id: CONV, content: 'q', client_turn_id: TURN });
    await appendMessage(sb, {
      conversation_id: CONV,
      role: 'assistant',
      content: 'grounded answer',
      status: 'complete',
      client_turn_id: TURN,
    });

    const found = await findAssistantTurn(sb, CONV, TURN);
    expect(found).not.toBeNull();
    expect(found?.content).toBe('grounded answer');

    // A different turn id has no prior answer → the agent would run.
    const none = await findAssistantTurn(sb, CONV, 'turn-other');
    expect(none).toBeNull();
  });

  it('a failed assistant turn is recorded (no orphan user-only turn) and is retry-keyed', async () => {
    const sb = makeFakeSb();
    await upsertUserTurn(sb, { conversation_id: CONV, content: 'q', client_turn_id: TURN });
    await appendMessage(sb, {
      conversation_id: CONV,
      role: 'assistant',
      content: "I couldn't complete that just now — please try again in a moment.",
      status: 'failed',
      client_turn_id: TURN,
    });

    // The exchange is NOT orphaned: there is a matching assistant turn.
    const assistant = await findAssistantTurn(sb, CONV, TURN);
    expect(assistant?.status).toBe('failed');
    expect(sb.rows.filter((r) => r.role === 'user')).toHaveLength(1);
    expect(sb.rows.filter((r) => r.role === 'assistant')).toHaveLength(1);
  });
});
