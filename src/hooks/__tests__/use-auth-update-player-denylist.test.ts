// =============================================================================
// src/hooks/__tests__/use-auth-update-player-denylist.test.ts
//
// P1 (Production-Readiness Mission W0a) — Activate-Recruiting bypass.
//
// RLS on baseball_players only checks `user_id = auth.uid()` (no per-column
// guard), so a raw browser UPDATE through useAuth().updatePlayer() could
// previously write `recruiting_activated` directly, bypassing the gated
// `activateRecruitingExposure()` server action's recruiting_exposure_enabled
// check entirely. This test locks in that `updatePlayer` strips every
// authorization-relevant column from whatever it's asked to write, no matter
// what the caller passes — the ONLY legitimate writer of those columns is a
// gated server action.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fakeAuthState = vi.hoisted(() => ({
  user: null as unknown,
  coach: null as unknown,
  player: { id: 'player-1', user_id: 'user-1', about_me: 'old bio' } as unknown,
  loading: false,
  coachMode: 'recruiting' as const,
  setUser: vi.fn(),
  setCoach: vi.fn(),
  setPlayer: vi.fn(),
  setLoading: vi.fn(),
  setCoachMode: vi.fn(),
  clear: vi.fn(),
}));

function useAuthStoreMock() {
  return fakeAuthState;
}
useAuthStoreMock.getState = () => fakeAuthState;

vi.mock('@/stores/auth-store', () => ({ useAuthStore: useAuthStoreMock }));

vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  getCurrentScope: vi.fn(() => ({ setTags: vi.fn() })),
}));

const updateCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn((_table: string) => ({
      update: vi.fn((updates: Record<string, unknown>) => {
        updateCalls.push(updates);
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'player-1', user_id: 'user-1', ...updates },
                error: null,
              })),
            })),
          })),
        };
      }),
    })),
  })),
}));

import { useAuth } from '@/hooks/use-auth';

describe('useAuth().updatePlayer — authorization-column denylist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    fakeAuthState.player = { id: 'player-1', user_id: 'user-1', about_me: 'old bio' };
  });

  it('strips recruiting_activated / recruiting_activated_at / id / user_id / player_type even if the caller passes them', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePlayer({
        about_me: 'new bio',
        recruiting_activated: true,
        recruiting_activated_at: '2026-07-09T00:00:00.000Z',
        id: 'someone-elses-id',
        user_id: 'someone-elses-user-id',
        player_type: 'college',
      });
    });

    expect(updateCalls).toHaveLength(1);
    const sent = updateCalls[0]!;
    expect(sent).toEqual({ about_me: 'new bio' });
    expect(sent).not.toHaveProperty('recruiting_activated');
    expect(sent).not.toHaveProperty('recruiting_activated_at');
    expect(sent).not.toHaveProperty('id');
    expect(sent).not.toHaveProperty('user_id');
    expect(sent).not.toHaveProperty('player_type');
  });

  it('still writes benign profile fields normally', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePlayer({ about_me: 'hello', city: 'Raleigh' });
    });

    expect(updateCalls).toEqual([{ about_me: 'hello', city: 'Raleigh' }]);
  });
});

describe('useAuth().updatePlayer — never blank an existing name', () => {
  // Regression guard for the CollegeProfileEditor blank-name-input
  // investigation: a stale/partial `formData` snapshot (seeded before the
  // full player row loaded) could send `first_name: ''` / `last_name: ''`
  // for a player who already has a real name on file. `updatePlayer` must
  // drop that specific empty-string overwrite rather than apply it, while
  // still allowing every other field (including a legitimate name EDIT) to
  // go through untouched.
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
  });

  it('drops an empty-string first_name/last_name when the player already has a name on file', async () => {
    fakeAuthState.player = {
      id: 'player-1',
      user_id: 'user-1',
      first_name: 'Marcus',
      last_name: 'Rodriguez',
    };
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePlayer({
        first_name: '',
        last_name: '',
        city: 'Raleigh',
      });
    });

    expect(updateCalls).toHaveLength(1);
    const sent = updateCalls[0]!;
    expect(sent).toEqual({ city: 'Raleigh' });
    expect(sent).not.toHaveProperty('first_name');
    expect(sent).not.toHaveProperty('last_name');
  });

  it('still allows a real (non-empty) name edit through', async () => {
    fakeAuthState.player = {
      id: 'player-1',
      user_id: 'user-1',
      first_name: 'Marcus',
      last_name: 'Rodriguez',
    };
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePlayer({ first_name: 'Marc' });
    });

    expect(updateCalls).toEqual([{ first_name: 'Marc' }]);
  });

  it('allows clearing a name to empty when the player had no name on file yet', async () => {
    fakeAuthState.player = { id: 'player-1', user_id: 'user-1', first_name: null, last_name: null };
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePlayer({ first_name: '' });
    });

    // Nothing to protect — the on-record name was already empty/null, so the
    // guard (which only fires when `player.first_name` is currently truthy)
    // does not apply and the update passes through.
    expect(updateCalls).toEqual([{ first_name: '' }]);
  });
});
