import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * reportIntegrationFault runs on every Bridge render. Its write used to be
 * `void`ed; in a request scope it is now handed to after() so the render pays
 * nothing and Vercel still runs it.
 */
const mocks = vi.hoisted(() => ({
  after: vi.fn<(task: () => Promise<void>) => void>(),
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: mocks.logServerEvent }));

import { reportIntegrationFault } from '@/lib/admin/integration-health';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

describe('reportIntegrationFault scheduling', () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.logServerEvent.mockClear();
    __resetEmitThrottleForTests();
  });

  it('hands the write to after() inside a request scope and returns the detail synchronously', async () => {
    const scheduled: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((task) => { scheduled.push(task); });

    expect(reportIntegrationFault('vercel', 'web insights fetch', 'failed: 500')).toBe('failed: 500');
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]!();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [, ctx] = mocks.logServerEvent.mock.calls[0] as [string, Record<string, unknown>];
    expect(ctx.errorCode).toBe('provider_vercel_unavailable');
  });

  it('falls back to the awaited write when after() is unavailable — never silent', () => {
    mocks.after.mockImplementation(() => { throw new Error('outside a request scope'); });
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 500');
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
  });
});
