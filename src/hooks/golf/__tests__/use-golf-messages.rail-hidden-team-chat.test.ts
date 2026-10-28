/**
 * A group chat the viewer deleted stays off the rail. Delete sets only the viewer's `hidden_at`
 * (conversation-hide.ts), and the inbox RPC leaves a hidden conversation out until a newer message arrives. The
 * rail's second read re-added every team chat the RPC left out, so a deleted group chat came straight back.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/messages', () => ({
  sendGolfMessage: vi.fn(),
  markGolfMessagesAsRead: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
  getGolfActiveTeamConversationIds: vi.fn(async () => null),
  getGolfConversationParticipantIdentities: vi.fn(async () => ({})),
}));

/** The first participants read answers with `rows`; every other read answers empty. */
function makeSupabase(rows: unknown[]) {
  let first = true;
  const chainFor = (table: string) => {
    const result = table === 'golf_conversation_participants' && first ? ((first = false), { data: rows, error: null }) : { data: [], error: null };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
        }
        return () => proxy;
      },
    };
    const proxy = new Proxy({}, handler);
    return proxy;
  };
  return {
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: vi.fn((table: string) => chainFor(table)),
  };
}

const chat = (id: string, hidden_at: string | null) => ({
  hidden_at,
  conversation: { id, created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z', is_team_chat: true, is_team_channel: false, title: `Chat ${id}`, created_by: 'coach-1' },
});

describe('loadGolfConversationRail — group chats the viewer deleted', () => {
  it('leaves a deleted group chat off the rail and keeps the others', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    const res = await loadGolfConversationRail(makeSupabase([chat('kept', null), chat('deleted', '2026-10-21T09:00:00Z')]) as never, 'user-1');
    expect(res.ok).toBe(true);
    const ids = res.ok ? res.rows.map((r) => r.id) : [];
    expect(ids).toContain('kept');
    expect(ids).not.toContain('deleted');
  });
});
