/**
 * useBaseballAuth — Discover permanent-skeleton repair.
 *
 * Covers:
 *  - Dedup: (dashboard)/layout.tsx mounts this hook twice on the same hard
 *    navigation (once in DashboardSessionGuard, once again inside
 *    BaseballShellLayout, gated so the second only mounts after the first
 *    settles). Before the fix, each mount independently ran the full
 *    4-round-trip session verification, doubling the time-to-chrome for
 *    every dashboard page load. The short-lived module cache must collapse
 *    two back-to-back mounts (same requiredRole) into ONE
 *    `supabase.auth.getUser()` call.
 *  - Eternal-skeleton guard: an unexpected throw during verification must
 *    still resolve `loading -> false` (never strand the caller on the
 *    skeleton forever) and must route to an honest recovery surface
 *    (/baseball/login) instead of silently doing nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBaseballAuth } from '../use-baseball-auth';

const routerPush = vi.fn();

// use-baseball-auth.ts talks to the store only via the static
// `useAuthStore.getState()` accessor (never the React-hook form), so a plain
// in-memory fake with the same shape is enough — avoids pulling in zustand's
// persist middleware (and its localStorage dependency) for this unit test.
const fakeAuthState = {
  user: null as unknown,
  coach: null as unknown,
  player: null as unknown,
  setCoach: vi.fn((coach: unknown) => { fakeAuthState.coach = coach; }),
  setPlayer: vi.fn((player: unknown) => { fakeAuthState.player = player; }),
  clear: vi.fn(() => {
    fakeAuthState.user = null;
    fakeAuthState.coach = null;
    fakeAuthState.player = null;
  }),
};

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => fakeAuthState },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// ── Supabase client mock — auth.getUser() + a chainable query builder for
// the three parallel profile lookups (users / baseball_coaches /
// baseball_players). Each `.from(table)` call is recorded so tests can
// assert exactly how many times the underlying network round trip fired. ──
const getUserMock = vi.fn();
const fromCalls: string[] = [];

function makeQueryChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data, error: null });
  return chain;
}

let coachRow: unknown = { id: 'coach-1', onboarding_completed: true, coach_type: 'college' };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'baseball_coaches') return makeQueryChain(coachRow);
      if (table === 'baseball_players') return makeQueryChain(null);
      return makeQueryChain({ role: 'coach' });
    },
  }),
}));

describe('useBaseballAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls.length = 0;
    coachRow = { id: 'coach-1', onboarding_completed: true, coach_type: 'college' };
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fakeAuthState.clear();
    // Note: the module-scope verify cache in use-baseball-auth.ts persists
    // across tests (by design — it's a real cross-render cache, not test
    // state). Tests that need an uncached call use a distinct `requiredRole`
    // to land on a fresh cache key instead of resetting module state.
  });

  it('dedupes two back-to-back mounts (DashboardSessionGuard + BaseballShellLayout) into a single verifyServerSession round trip', async () => {
    const first = renderHook(() => useBaseballAuth(null));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.authorized).toBe(true);

    const callsAfterFirst = getUserMock.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Second mount, same requiredRole, immediately after the first settles —
    // exactly the DashboardSessionGuard -> BaseballShellLayout sequence.
    const second = renderHook(() => useBaseballAuth(null));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.authorized).toBe(true);

    // The second mount must be served from the short-lived cache, not a
    // fresh network round trip.
    expect(getUserMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('never strands loading=true when verification throws — resolves loading and redirects to an honest recovery route', async () => {
    getUserMock.mockRejectedValue(new Error('network blip'));

    // Use a distinct requiredRole so this test doesn't read the previous
    // test's cached (unrelated) success result.
    const { result } = renderHook(() => useBaseballAuth('player'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authorized).toBe(false);
    expect(routerPush).toHaveBeenCalledWith('/baseball/login');
  });
});
