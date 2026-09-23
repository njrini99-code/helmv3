import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  fail: false,
  rpc: vi.fn(),
  identities: vi.fn(),
  coaches: [] as Array<Record<string, unknown>>,
  players: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
  rpc: mock.rpc,
  from: (table: string) => {
    const data = table === 'golf_coaches' ? mock.coaches : table === 'golf_players' ? mock.players : [];
    const result = { data, error: mock.fail ? { message: 'Temporary network failure' } : null, count: data.length };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'order', 'limit', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: mock.identities,
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
import { useGolfConversations } from '../use-golf-messages';

beforeEach(() => {
  mock.fail = false;
  mock.coaches = [];
  mock.players = [];
  mock.rpc.mockReset().mockImplementation(async () => ({ data: mock.fail ? null : [{
    id: 'conversation', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z',
    participant_ids: ['viewer', 'legacy-coach'], is_group: false, unread_count: 0,
  }], error: mock.fail ? { message: 'Temporary network failure' } : null }));
  mock.identities.mockReset().mockResolvedValue({ participants: [] });
});

describe('conversation refresh recovery', () => {
  it('keeps the last successful inbox when a background refresh fails', async () => {
    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    const previous = result.current.conversations;
    mock.fail = true;
    await act(async () => { await result.current.refetch(); });
    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations).toBe(previous);
  });

  it('uses the authorized server identity for an older DM counterpart', async () => {
    mock.identities.mockResolvedValue({
      participants: [{
        conversationId: 'conversation',
        userId: 'legacy-coach',
        name: 'Legacy Coach',
        subtitle: 'Head Coach',
        avatar: '/coach.png',
        type: 'coach',
      }],
    });

    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.conversations[0]?.other_participant).toMatchObject({
      id: 'legacy-coach',
      name: 'Legacy Coach',
      type: 'coach',
    });
    expect(mock.identities).toHaveBeenCalledWith(['conversation']);
  });

  it('keeps the client profile fast path when the counterpart is already visible', async () => {
    mock.coaches = [{
      id: 'coach-row', user_id: 'legacy-coach', full_name: 'Known Coach', title: 'Head Coach', avatar_url: null,
    }];

    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.conversations[0]?.other_participant).toMatchObject({
      id: 'legacy-coach',
      name: 'Known Coach',
      type: 'coach',
    });
    expect(mock.identities).not.toHaveBeenCalled();
  });

  it('keeps the inbox usable when the unresolved identity action transport rejects', async () => {
    mock.identities.mockRejectedValueOnce(new Error('temporary action transport failure'));

    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations[0]?.other_participant).toMatchObject({
      id: 'legacy-coach',
      name: 'Conversation member',
    });
  });

  it('chunks more than 100 unresolved DMs at the server action boundary', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({
      id: `conversation-${index}`,
      created_at: `2026-09-08T12:${String(index % 60).padStart(2, '0')}:00Z`,
      updated_at: '2026-09-08T12:00:00Z',
      participant_ids: ['viewer', `legacy-${index}`],
      is_group: false,
      unread_count: 0,
    }));
    mock.rpc.mockReset().mockResolvedValueOnce({ data: rows, error: null });

    const { result } = renderHook(() => useGolfConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(205));
    expect(mock.identities).toHaveBeenCalledTimes(3);
    expect(mock.identities.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 5]);
  });
});
