import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * reportIntegrationFault runs on every Bridge render. Its write used to be
 * `void`ed; in a request scope it is now handed to after() so the render pays
 * nothing and Vercel still runs it. Outside one — a cron body, a prerender —
 * it is AWAITED, because a `void`ed bounded await is still a promise nobody
 * holds on a function that freezes the moment its caller returns.
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
    mocks.logServerEvent.mockReset();
    mocks.logServerEvent.mockImplementation(async () => {});
    __resetEmitThrottleForTests();
  });

  it('hands the write to after() inside a request scope and resolves the detail without running it inline', async () => {
    const scheduled: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((task) => { scheduled.push(task); });

    await expect(reportIntegrationFault('vercel', 'web insights fetch', 'failed: 500')).resolves.toBe('failed: 500');
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]!();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [, ctx] = mocks.logServerEvent.mock.calls[0] as [string, Record<string, unknown>];
    expect(ctx.errorCode).toBe('provider_vercel_unavailable');
  });

  it('AWAITS the write when after() is unavailable — it resolves only after the write settled, never before', async () => {
    mocks.after.mockImplementation(() => { throw new Error('outside a request scope'); });
    let settled = false;
    mocks.logServerEvent.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      settled = true;
    });

    const detail = await reportIntegrationFault('sentry', 'issues fetch', 'failed: 500');

    expect(detail).toBe('failed: 500');
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });
});
