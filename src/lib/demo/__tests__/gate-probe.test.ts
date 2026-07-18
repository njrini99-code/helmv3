// =============================================================================
// src/lib/demo/__tests__/gate-probe.test.ts
//
// #918 — the demo gate's "Checking sign-in status" probe must resolve to
// signed-out on ANY error/timeout, never hang. Covers:
//   1. raceWithTimeout: fast resolve/reject pass through; a slow promise is
//      pre-empted at the deadline.
//   2. probeSignedIn: happy path, a `getUser()` error field, a thrown/rejected
//      getUser(), AND a getUser() that never settles (the actual failure mode
//      a stuck refresh-token exchange produces) all resolve to `null` — never
//      hang, never throw.
//   3. isDemoMetadataUser: pure metadata check used by both the probe callers
//      and the middleware's demo-context redirect.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  raceWithTimeout,
  probeSignedIn,
  isDemoMetadataUser,
  DemoAuthProbeTimeoutError,
  DEMO_AUTH_PROBE_TIMEOUT_MS,
  type AuthProbeClient,
} from '@/lib/demo/gate-probe';

describe('raceWithTimeout — pass-through when the promise settles quickly', () => {
  // Real timers here — nothing about these two assertions is time-based, and
  // mixing fake timers with an already-settled/pre-rejected promise is a
  // known source of flaky "unhandled rejection" noise unrelated to the
  // behavior under test.
  it('resolves with the value when the promise settles before the deadline', async () => {
    await expect(raceWithTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('rejects with the original error when the promise rejects before the deadline', async () => {
    await expect(raceWithTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });
});

describe('raceWithTimeout — timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with DemoAuthProbeTimeoutError once the deadline elapses on a promise that never settles', async () => {
    const neverSettles = new Promise<string>(() => {});
    const result = raceWithTimeout(neverSettles, 4000);
    const assertion = expect(result).rejects.toBeInstanceOf(DemoAuthProbeTimeoutError);
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
  });

  it('defaults to DEMO_AUTH_PROBE_TIMEOUT_MS when no timeout is given', async () => {
    const neverSettles = new Promise<string>(() => {});
    const result = raceWithTimeout(neverSettles);
    const assertion = expect(result).rejects.toBeInstanceOf(DemoAuthProbeTimeoutError);
    await vi.advanceTimersByTimeAsync(DEMO_AUTH_PROBE_TIMEOUT_MS);
    await assertion;
  });
});

describe('probeSignedIn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function clientResolving(
    result: Awaited<ReturnType<AuthProbeClient['auth']['getUser']>>,
  ): AuthProbeClient {
    return { auth: { getUser: vi.fn(async () => result) } };
  }

  it('returns the user on the happy path', async () => {
    const client = clientResolving({ data: { user: { id: 'u1', email: 'demo@example.com' } }, error: null });
    const result = probeSignedIn(client);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toEqual({ id: 'u1', email: 'demo@example.com' });
  });

  it('returns null when getUser() resolves with no user', async () => {
    const client = clientResolving({ data: { user: null }, error: null });
    const result = probeSignedIn(client);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBeNull();
  });

  it('returns null when getUser() resolves with an error field (e.g. a refresh-token failure)', async () => {
    const client = clientResolving({
      data: { user: { id: 'u1' } },
      error: { message: 'Invalid Refresh Token: Already Used' },
    });
    const result = probeSignedIn(client);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBeNull();
  });

  it('returns null (never throws) when getUser() rejects', async () => {
    const client: AuthProbeClient = {
      auth: { getUser: vi.fn(async () => { throw new Error('network blip'); }) },
    };
    const result = probeSignedIn(client);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBeNull();
  });

  it('returns null (never hangs) when getUser() never settles — the stuck refresh-token exchange case', async () => {
    const client: AuthProbeClient = {
      auth: {
        getUser: vi.fn(
          () => new Promise<{ data: { user: null }; error: unknown }>(() => {}),
        ),
      },
    };
    const result = probeSignedIn(client, 4000);
    const assertion = expect(result).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
  });

  it('resolves well within a caller-visible deadline even on a hung getUser()', async () => {
    const client: AuthProbeClient = {
      auth: {
        getUser: vi.fn(
          () => new Promise<{ data: { user: null }; error: unknown }>(() => {}),
        ),
      },
    };
    const result = probeSignedIn(client, 100);
    const assertion = expect(result).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});

describe('isDemoMetadataUser', () => {
  it('is true when user_metadata.is_demo is exactly true', () => {
    expect(isDemoMetadataUser({ id: 'u1', user_metadata: { is_demo: true } })).toBe(true);
  });

  it('is false for a real (non-demo) user', () => {
    expect(isDemoMetadataUser({ id: 'u1', user_metadata: { full_name: 'Coach Rivera' } })).toBe(false);
  });

  it('is false for a truthy-but-not-boolean-true value (e.g. the string "true")', () => {
    expect(isDemoMetadataUser({ id: 'u1', user_metadata: { is_demo: 'true' } })).toBe(false);
  });

  it('is false when user_metadata is absent', () => {
    expect(isDemoMetadataUser({ id: 'u1' })).toBe(false);
  });

  it('is false for null/undefined user', () => {
    expect(isDemoMetadataUser(null)).toBe(false);
    expect(isDemoMetadataUser(undefined)).toBe(false);
  });
});
