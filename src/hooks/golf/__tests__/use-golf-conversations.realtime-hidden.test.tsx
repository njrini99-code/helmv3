/**
 * A conversation the viewer deleted comes back when the other person writes (audit Messages M1).
 *
 * The rail used to refetch on a `golf_conversations` UPDATE only for an id it was already showing. A deleted
 * conversation is not shown, so the update that a new message causes was dropped and the row stayed gone until a reload.
 * Realtime applies the table's SELECT policy, so any update that reaches the client is one the viewer takes part in.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  conversationUpdate: null as null | ((payload: { new: Record<string, unknown> }) => void),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
  rpc: mock.rpc,
  from: () => {
    const result = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'order', 'limit', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
  },
  channel: () => {
    const channel = {
      on: (_type: string, filter: { table: string; event: string }, cb: (payload: { new: Record<string, unknown> }) => void) => {
        if (filter.table === 'golf_conversations' && filter.event === 'UPDATE') mock.conversationUpdate = cb;
        return channel;
      },
      subscribe: () => channel,
    };
    return channel;
  },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
import { useGolfConversations } from '../use-golf-messages';

const inboxCalls = () => mock.rpc.mock.calls.filter(([name]) => name !== 'golf_player_profiles').length;

beforeEach(() => {
  mock.conversationUpdate = null;
  mock.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'golf_player_profiles') return { data: [], error: null };
    return { data: [{
      id: 'shown', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z',
      participant_ids: ['viewer', 'coach'], is_group: false, unread_count: 0,
    }], error: null };
  });
});

describe('rail realtime — conversation updates', () => {
  it('refetches for a conversation the rail is not showing (a deleted one that just got a message)', async () => {
    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    await waitFor(() => expect(mock.conversationUpdate).not.toBeNull());
    const before = inboxCalls();
    act(() => mock.conversationUpdate!({ new: { id: 'hidden-one', team_id: null } }));
    await waitFor(() => expect(inboxCalls()).toBe(before + 1));
  });

  it('collapses a burst of updates into one refetch', async () => {
    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    await waitFor(() => expect(mock.conversationUpdate).not.toBeNull());
    const before = inboxCalls();
    act(() => {
      for (let i = 0; i < 5; i += 1) mock.conversationUpdate!({ new: { id: `hidden-${i}`, team_id: null } });
    });
    await waitFor(() => expect(inboxCalls()).toBe(before + 1));
    await new Promise((r) => setTimeout(r, 450));
    expect(inboxCalls()).toBe(before + 1);
  });

  it('skips an update for another team than the one the coach is viewing', async () => {
    const { result } = renderHook(() => useGolfConversations(undefined, 'team-a'));
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    await waitFor(() => expect(mock.conversationUpdate).not.toBeNull());
    const before = inboxCalls();
    act(() => mock.conversationUpdate!({ new: { id: 'other-team-conv', team_id: 'team-b' } }));
    await new Promise((r) => setTimeout(r, 450));
    expect(inboxCalls()).toBe(before);
  });
});
