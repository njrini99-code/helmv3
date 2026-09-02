import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));

import { isInngestConfigured } from '@/lib/inngest/client';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

const GOOD_SIGNING = `signkey-prod-${'0a'.repeat(32)}`;
const GOOD_EVENT = 'A'.repeat(86);

/**
 * `isInngestConfigured()` is the single "are the vars set" source for the
 * round-submit routing branch and the Jobs board. A `false` used to be a
 * silent inline fallback; in production it is now a Bridge row.
 */
describe('isInngestConfigured', () => {
  beforeEach(() => {
    mocks.logServerError.mockClear();
    __resetEmitThrottleForTests();
    vi.stubEnv('INNGEST_SIGNING_KEY', GOOD_SIGNING);
    vi.stubEnv('INNGEST_EVENT_KEY', GOOD_EVENT);
    vi.stubEnv('VERCEL_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetEmitThrottleForTests();
  });

  it('is true when both keys are well-formed, and writes nothing', () => {
    expect(isInngestConfigured()).toBe(true);
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it('is false for an 11-character placeholder — presence was never the question', () => {
    vi.stubEnv('INNGEST_SIGNING_KEY', 'abcdefghijk');
    expect(isInngestConfigured()).toBe(false);
  });

  it('a skipped send in production is VISIBLE: one throttled Bridge row naming the variable', async () => {
    vi.stubEnv('INNGEST_SIGNING_KEY', '');
    expect(isInngestConfigured()).toBe(false);
    expect(isInngestConfigured()).toBe(false);
    await Promise.resolve();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const [message, ctx] = mocks.logServerError.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toMatch(/INNGEST_SIGNING_KEY is missing/);
    expect(ctx).toMatchObject({ feature: 'integrations', errorCode: 'provider_inngest_missing_credential', action: 'inngest.credentials.send' });
  });

  it('a skipped send off production stays a config state — no row', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('INNGEST_SIGNING_KEY', '');
    expect(isInngestConfigured()).toBe(false);
    await Promise.resolve();
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });
});
