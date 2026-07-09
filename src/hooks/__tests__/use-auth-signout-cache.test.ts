// =============================================================================
// src/hooks/__tests__/use-auth-signout-cache.test.ts
//
// P1 (Production-Readiness Mission W0a) — sign-out never invalidated
// use-baseball-auth's short-lived (5s) verified-session cache. A back/forward
// nav within that window could re-authorize the dashboard shell from stale
// "signed in" state even though the user had just signed out. Locks in that
// BOTH the explicit signOut() path and the SIGNED_OUT auth-state-change
// handler in use-auth.ts call invalidateAuthCache().
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fakeAuthState = vi.hoisted(() => ({
  user: null as unknown,
  coach: null as unknown,
  player: null as unknown,
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

const invalidateAuthCache = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-baseball-auth', () => ({ invalidateAuthCache }));

let capturedAuthStateCallback: ((event: string) => void) | null = null;
const signOutMock = vi.fn(async () => ({ error: null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      signOut: signOutMock,
      onAuthStateChange: vi.fn((cb: (event: string) => void) => {
        capturedAuthStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })), maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
    })),
  })),
}));

import { useAuth } from '@/hooks/use-auth';

describe('useAuth() sign-out cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAuthStateCallback = null;
  });

  it('signOut() calls invalidateAuthCache()', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(invalidateAuthCache).toHaveBeenCalled();
  });

  it('the SIGNED_OUT auth-state-change event calls invalidateAuthCache()', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(capturedAuthStateCallback).not.toBeNull();

    act(() => {
      capturedAuthStateCallback?.('SIGNED_OUT');
    });

    expect(invalidateAuthCache).toHaveBeenCalled();
  });
});
