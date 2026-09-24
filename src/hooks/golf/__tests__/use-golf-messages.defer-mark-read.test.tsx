/**
 * Audit DATA-01: desktop auto-opens the first thread beside the rail. That is
 * the product showing a thread, not the viewer reading it, so the hook must
 * not mark it read until the caller says the viewer engaged.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  markRead: vi.fn(),
  getUser: vi.fn(),
  fetched: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: mock.getUser },
  rpc: vi.fn(async () => ({ data: [], error: null })),
  from: () => {
    const result = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => {
      mock.fetched();
      return Promise.resolve(result).then(resolve);
    };
    return chain;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
  markGolfMessagesAsRead: mock.markRead,
  sendGolfMessage: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { useGolfMessages } from '../use-golf-messages';
import { __resetCachedResourcesForTests } from '@/lib/golf/client-resource-cache';

beforeEach(() => {
  __resetCachedResourcesForTests();
  mock.markRead.mockReset().mockResolvedValue({ success: true });
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } } });
  mock.fetched.mockReset();
});

describe('useGolfMessages — deferMarkRead (DATA-01)', () => {
  it('marks the thread read after loading by default', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(mock.markRead).toHaveBeenCalledWith('c1'));
  });

  it('does not mark an auto-opened thread read until markRead() is called', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer', { deferMarkRead: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Let the tail of fetchMessages settle.
    await act(async () => {});
    expect(mock.markRead).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.markRead();
    });
    expect(mock.markRead).toHaveBeenCalledTimes(1);
    expect(mock.markRead).toHaveBeenCalledWith('c1');
  });

  it('toggling deferMarkRead does not refetch the thread', async () => {
    const { result, rerender } = renderHook(
      ({ defer }: { defer: boolean }) => useGolfMessages('c1', 'viewer', { deferMarkRead: defer }),
      { initialProps: { defer: true } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const fetchesBefore = mock.fetched.mock.calls.length;
    rerender({ defer: false });
    await act(async () => {});
    expect(mock.fetched.mock.calls.length).toBe(fetchesBefore);
  });
});
