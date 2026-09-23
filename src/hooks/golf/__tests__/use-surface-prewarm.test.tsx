/**
 * `useGolfSurfacePrewarm` warms Calendar (always) and Messages (only with an
 * active team — `FairwayMessages` hard-blocks a teamless viewer with an empty
 * state, so prefetching the route or fetching the conversation rail for one
 * would be wasted work, and would risk warming the WRONG team's rail into the
 * cache ahead of a multi-team coach resolving their active team).
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * jsdom has no `requestIdleCallback`, so the hook falls back to a 1.2s
 * `setTimeout`. Real timers (not fake ones) because the fetch path after
 * that timer is a dynamic `import()` + an async Supabase round trip — fake
 * timers do not reliably drive module-loader microtasks, so this waits for
 * real wall-clock time and then flushes the remaining promise chain.
 */
async function flush(ms = 1300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const mock = vi.hoisted(() => ({
  prefetch: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: mock.prefetch }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mock.rpc,
    from: () => {
      const result = { data: [], error: null, count: 0 };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'order', 'limit', 'single', 'maybeSingle']) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
      return chain;
    },
  }),
}));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { useGolfSurfacePrewarm, __resetSurfacePrewarmForTests } from '../use-surface-prewarm';
import { __resetCachedResourcesForTests, clearAllCachedResources, readCachedResource } from '@/lib/golf/client-resource-cache';

const row = {
  id: 'conversation', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z',
  participant_ids: ['viewer', 'other'], is_group: false, unread_count: 0,
};

describe('useGolfSurfacePrewarm', () => {
  beforeEach(() => {
    __resetCachedResourcesForTests();
    clearAllCachedResources();
    __resetSurfacePrewarmForTests();
    mock.prefetch.mockReset();
    mock.rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  });

  it('prefetches Calendar but not Messages, and never fetches a rail, for a teamless viewer', async () => {
    renderHook(() => useGolfSurfacePrewarm('viewer', null));
    await flush();

    expect(mock.prefetch).toHaveBeenCalledWith('/golf/dashboard/calendar');
    expect(mock.prefetch).not.toHaveBeenCalledWith('/golf/dashboard/messages');
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(readCachedResource('golf.conversations:viewer:team-a')).toBeNull();
  }, 10000);

  it('prefetches both surfaces and warms the rail for a viewer with an active team', async () => {
    renderHook(() => useGolfSurfacePrewarm('viewer', 'team-a'));
    await flush();

    expect(mock.prefetch).toHaveBeenCalledWith('/golf/dashboard/calendar');
    expect(mock.prefetch).toHaveBeenCalledWith('/golf/dashboard/messages');
    expect(mock.rpc).toHaveBeenCalled();
    expect(readCachedResource('golf.conversations:viewer:team-a')?.data).toBeTruthy();
  }, 10000);

  it('does not warm the OLD team a coach just switched away from', async () => {
    renderHook(() => useGolfSurfacePrewarm('viewer', 'team-a'));
    await flush();
    mock.rpc.mockClear();

    // Re-render as if TeamSwitcher just flipped the active team (a new
    // dedupe key — this must run again, not read the team-a cache as if it
    // were team-b's).
    renderHook(() => useGolfSurfacePrewarm('viewer', 'team-b'));
    await flush();

    expect(mock.rpc).toHaveBeenCalled();
    expect(readCachedResource('golf.conversations:viewer:team-a')).not.toBeNull();
    expect(readCachedResource('golf.conversations:viewer:team-b')).not.toBeNull();
  }, 15000);
});
