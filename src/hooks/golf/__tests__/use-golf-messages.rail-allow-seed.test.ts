/**
 * F-0014 (audit 2026-10-29): the Messages list waited on a server action for the active-team allow-list before its first
 * rows, queued behind the page's other actions. The page reads it with the rest of its data and hands it in; the rail
 * then makes no action call before it paints.
 */
import { describe, it, expect, vi } from 'vitest';
import { getGolfActiveTeamConversationIds } from '@/app/golf/actions/messages';

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

/** The inbox RPC answers `rpcRows`; the first participants read answers with `rows`; every other read answers empty. */
function makeSupabase(rows: unknown[], rpcRows: unknown[] = []) {
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
    rpc: vi.fn(async () => ({ data: rpcRows, error: null })),
    from: vi.fn((table: string) => chainFor(table)),
  };
}

describe('loadGolfConversationRail with the allow-list handed in (F-0014)', () => {
  it('uses the given ids and calls no server action for them', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    vi.mocked(getGolfActiveTeamConversationIds).mockClear();
    const res = await loadGolfConversationRail(makeSupabase([]) as never, 'user-1', { allowIds: null });
    expect(res.ok).toBe(true);
    expect(getGolfActiveTeamConversationIds).not.toHaveBeenCalled();
  });

  it('without it, reads the allow-list itself as before', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    vi.mocked(getGolfActiveTeamConversationIds).mockClear();
    await loadGolfConversationRail(makeSupabase([]) as never, 'user-1');
    expect(getGolfActiveTeamConversationIds).toHaveBeenCalledTimes(1);
  });
});
