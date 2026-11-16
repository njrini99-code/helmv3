import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-11: the conversation list's read has a ceiling. A read that hasn't answered in 15 seconds is told as failed, so
 * the rail draws its notice and Try again instead of a skeleton for ever; an answer that lands later still replaces it.
 */

const mock = vi.hoisted(() => ({ release: null as null | (() => void), hold: false }));
const row = { id: 'conversation', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z', participant_ids: ['viewer', 'coach'], is_group: false, unread_count: 0 };
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
    rpc: async (name: string) => {
      if (name === 'golf_player_profiles') return { data: [], error: null };
      if (mock.hold) await new Promise<void>((resolve) => (mock.release = resolve));
      return { data: [row], error: null };
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'order', 'limit', 'single', 'maybeSingle']) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
      return chain;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  }),
}));
vi.mock('@/app/golf/actions/messages', () => ({ getGolfActiveTeamConversationIds: async () => null, getGolfConversationParticipantIdentities: async () => ({ participants: [] }) }));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
import { CONVERSATIONS_READ_GIVE_UP_MS, useGolfConversations } from '../use-golf-messages';

beforeEach(() => {
  mock.hold = false;
  mock.release = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('conversation list read ceiling (GAP-S-11)', () => {
  it('a read that never answers is told as failed after 15 seconds; its late answer still lands', async () => {
    mock.hold = true;
    const { result } = renderHook(() => useGolfConversations('viewer'));
    await waitFor(() => expect(mock.release).not.toBeNull());
    expect(result.current.loading).toBe(true);
    await act(async () => void vi.advanceTimersByTime(CONVERSATIONS_READ_GIVE_UP_MS - 100));
    expect(result.current.error).toBe(false);
    await act(async () => void vi.advanceTimersByTime(200));
    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
    await act(async () => mock.release?.());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.error).toBe(false);
  });

  it('a read that answers in time never gives up', async () => {
    const { result } = renderHook(() => useGolfConversations('viewer'));
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    await act(async () => void vi.advanceTimersByTime(CONVERSATIONS_READ_GIVE_UP_MS * 2));
    expect(result.current.error).toBe(false);
  });
});
