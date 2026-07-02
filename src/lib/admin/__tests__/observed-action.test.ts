import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Variadic rest param (not `()`) so `.mock.calls[0]` is destructurable —
  // see the same fix in rls-denial.test.ts.
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
}));

import { withAdminObserved, isNextControlFlowError } from '@/lib/admin/observed-action';

describe('isNextControlFlowError', () => {
  it('recognizes NEXT_REDIRECT and NEXT_NOT_FOUND digests', () => {
    expect(isNextControlFlowError({ digest: 'NEXT_REDIRECT;push;/golf;307' })).toBe(true);
    expect(isNextControlFlowError({ digest: 'NEXT_NOT_FOUND' })).toBe(true);
    expect(isNextControlFlowError(new Error('boom'))).toBe(false);
  });
});

describe('withAdminObserved', () => {
  beforeEach(() => mocks.logServerException.mockClear());

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
    expect(ctx).toMatchObject({ action: 'demo', source: 'server_action', sport: 'golf' });
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
});
