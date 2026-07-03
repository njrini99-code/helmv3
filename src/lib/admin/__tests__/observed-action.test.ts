import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Variadic rest param (not `()`) so `.mock.calls[0]` is destructurable —
  // see the same fix in rls-denial.test.ts.
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1', email: 'admin@example.com' } },
      })),
    },
  })),
}));

import { withAdminObserved, isNextControlFlowError } from '@/lib/admin/observed-action';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

describe('isNextControlFlowError', () => {
  it('recognizes NEXT_REDIRECT and NEXT_NOT_FOUND digests', () => {
    expect(isNextControlFlowError({ digest: 'NEXT_REDIRECT;push;/golf;307' })).toBe(true);
    expect(isNextControlFlowError({ digest: 'NEXT_NOT_FOUND' })).toBe(true);
    expect(isNextControlFlowError(new Error('boom'))).toBe(false);
  });
});

describe('withAdminObserved', () => {
  beforeEach(() => {
    mocks.logServerException.mockClear();
    __resetEmitThrottleForTests();
  });

  it('passes through the return value untouched', async () => {
    const wrapped = withAdminObserved('demo', { sport: 'golf' }, async (n: number) => n * 2);
    await expect(wrapped(21)).resolves.toBe(42);
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('logs then RETHROWS real failures', async () => {
    const boom = new Error('db down');
    const wrapped = withAdminObserved('demo', { sport: 'golf' }, async () => { throw boom; });
    await expect(wrapped()).rejects.toBe(boom);
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
    const [err, ctx] = mocks.logServerException.mock.calls[0]!;
    expect(err).toBe(boom);
    expect(ctx).toMatchObject({
      action: 'demo',
      source: 'server_action',
      sport: 'golf',
      userId: 'user-1',
      userEmail: 'admin@example.com',
    });
  });

  it('passes feature through to the logger context', async () => {
    const boom = new Error('db down');
    const wrapped = withAdminObserved(
      'saveThing',
      { sport: 'golf', feature: 'round_tracking' },
      async () => { throw boom; },
    );
    await expect(wrapped()).rejects.toBe(boom);
    const [, ctx] = mocks.logServerException.mock.calls[0]!;
    expect(ctx).toMatchObject({ feature: 'round_tracking', featureArea: 'round_tracking' });
  });

  it('featureArea wins over feature when both are given (explicit featureArea preserved)', async () => {
    const boom = new Error('db down');
    const wrapped = withAdminObserved(
      'legacyThing',
      { sport: 'golf', feature: 'round_tracking', featureArea: 'rounds-legacy' },
      async () => { throw boom; },
    );
    await expect(wrapped()).rejects.toBe(boom);
    const [, ctx] = mocks.logServerException.mock.calls[0]!;
    expect(ctx).toMatchObject({ feature: 'round_tracking', featureArea: 'rounds-legacy' });
  });

  it('omits feature (null) when opts carries neither feature nor featureArea', async () => {
    const boom = new Error('db down');
    const wrapped = withAdminObserved('bareThing', {}, async () => { throw boom; });
    await expect(wrapped()).rejects.toBe(boom);
    const [, ctx] = mocks.logServerException.mock.calls[0]!;
    expect(ctx).toMatchObject({ feature: null, featureArea: null });
  });

  it('lets Next control-flow throws pass WITHOUT logging (classic noise source)', async () => {
    const redirect = Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT;replace;/x;307' });
    const wrapped = withAdminObserved('demo', {}, async () => { throw redirect; });
    await expect(wrapped()).rejects.toBe(redirect);
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('a rejecting logger cannot mask the original error', async () => {
    mocks.logServerException.mockRejectedValueOnce(new Error('logger down'));
    const boom = new Error('real failure');
    const wrapped = withAdminObserved('demo', {}, async () => { throw boom; });
    await expect(wrapped()).rejects.toBe(boom);
  });

  describe('flood-collapse throttle (Noise Charter N4)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('100 immediate identical failures produce <=2 logger calls; the 2nd carries collapsed_count >= 98', async () => {
      const boom = Object.assign(new Error('duplicate key'), { code: '23505' });
      const wrapped = withAdminObserved('floodTest', { sport: 'golf' }, async () => { throw boom; });

      for (let i = 0; i < 99; i++) {
        await expect(wrapped()).rejects.toBe(boom);
      }
      expect(mocks.logServerException.mock.calls.length).toBeLessThanOrEqual(2);

      // Advance past the 60s collapse window so the throttle opens again.
      vi.advanceTimersByTime(61_000);
      await expect(wrapped()).rejects.toBe(boom);

      const calls = mocks.logServerException.mock.calls;
      expect(calls.length).toBeLessThanOrEqual(2);
      expect(calls.length).toBe(2);
      const [, secondCtx] = calls[1]!;
      expect((secondCtx as { metadata?: { collapsed_count?: number } }).metadata?.collapsed_count).toBeGreaterThanOrEqual(98);
    });

    it('never converts a suppressed emit into a swallowed rethrow — every call still rejects', async () => {
      const boom = new Error('always rethrows');
      const wrapped = withAdminObserved('floodRethrow', {}, async () => { throw boom; });
      for (let i = 0; i < 10; i++) {
        await expect(wrapped()).rejects.toBe(boom);
      }
    });

    it('distinct actions/error codes are independent throttle keys', async () => {
      const boomA = Object.assign(new Error('a'), { code: 'AAA' });
      const boomB = Object.assign(new Error('b'), { code: 'BBB' });
      const wrappedA = withAdminObserved('actionA', {}, async () => { throw boomA; });
      const wrappedB = withAdminObserved('actionB', {}, async () => { throw boomB; });

      await expect(wrappedA()).rejects.toBe(boomA);
      await expect(wrappedB()).rejects.toBe(boomB);
      await expect(wrappedA()).rejects.toBe(boomA); // collapsed
      await expect(wrappedB()).rejects.toBe(boomB); // collapsed

      // Both A and B got their first (uncollapsed) emit through.
      expect(mocks.logServerException).toHaveBeenCalledTimes(2);
    });
  });
});
