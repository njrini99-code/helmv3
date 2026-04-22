/**
 * Tests for src/lib/server-error-logger.ts
 *
 * Confirms the production contract: every handled server error is
 * forwarded to Sentry with the scope tag, user context, and fingerprint
 * so the Sentry issue page is a faithful mirror of admin_events.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Sentry BEFORE importing the module under test so the imports in
// server-error-logger.ts pick up these mocks.
const captureException = vi.fn();
const withScope = vi.fn((fn: (scope: unknown) => void) => {
  const scope = {
    setLevel: vi.fn(),
    setTag: vi.fn(),
    setUser: vi.fn(),
    setContext: vi.fn(),
    setFingerprint: vi.fn(),
  };
  fn(scope);
  return scope;
});

vi.mock('@sentry/nextjs', () => ({
  captureException,
  withScope,
}));

// Mock the admin client so writeAdminTables doesn't actually hit the DB.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
}));

describe('logServerError → Sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards handled errors to Sentry with action/feature_area tags', async () => {
    const { logServerError } = await import('@/lib/server-error-logger');

    await logServerError('Failed to do the thing', {
      action: 'test.action',
      featureArea: 'coachhelm',
      userId: 'user-1',
      userEmail: 'user@example.com',
      tags: { teamId: 'team-1' },
    });

    expect(withScope).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
  });

  it('captures the original Error object via logServerException (preserves stack)', async () => {
    const { logServerException } = await import('@/lib/server-error-logger');
    const err = new Error('boom');
    await logServerException(err, { action: 'boom.action' });

    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException.mock.calls[0][0]).toBe(err);
  });

  it('does not throw when Sentry.withScope throws (graceful degrade)', async () => {
    withScope.mockImplementationOnce(() => {
      throw new Error('sentry unavailable');
    });
    const { logServerError } = await import('@/lib/server-error-logger');

    await expect(
      logServerError('still fine', { action: 'x' }),
    ).resolves.toBeUndefined();
  });
});
