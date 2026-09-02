import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * withAdminObserved used to `void logServerException(...)` and throw. On
 * Vercel that promise is dropped once the response is sent. Inside a request
 * scope the write must now be handed to after(); outside one it is awaited
 * (covered by observed-action.test.ts, where after() is real and throws).
 */
const mocks = vi.hoisted(() => ({
  after: vi.fn<(task: () => Promise<void>) => void>(),
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
  logServerError: mocks.logServerError,
  logServerEvent: mocks.logServerEvent,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u', email: 'u@x' } } }) } })),
}));

import { withAdminObserved } from '@/lib/admin/observed-action';
import { recordJobRun } from '@/lib/admin/job-log';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({ data: null, error: null }) }) }),
}));

describe('Bridge writes on the thrown path are SCHEDULED past the response inside a request scope', () => {
  const scheduled: Array<() => Promise<void>> = [];
  beforeEach(() => {
    scheduled.length = 0;
    mocks.after.mockReset().mockImplementation((task) => {
      scheduled.push(task);
    });
    mocks.logServerException.mockClear();
    mocks.logServerError.mockClear();
    mocks.logServerEvent.mockClear();
    __resetEmitThrottleForTests();
  });

  it('withAdminObserved: the exception write is handed to after(), not dropped and not inline', async () => {
    const boom = new Error('db down');
    const wrapped = withAdminObserved('demo', { sport: 'golf' }, async () => {
      throw boom;
    });
    await expect(wrapped()).rejects.toBe(boom);

    expect(mocks.logServerException).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
    expect(mocks.logServerException.mock.calls[0]![0]).toBe(boom);
  });

  it('withAdminObserved: a soft failure envelope is scheduled the same way', async () => {
    const wrapped = withAdminObserved('softDemo', { sport: 'golf' }, async () => ({ success: false, error: 'DB blew up' }));
    await expect(wrapped()).resolves.toEqual({ success: false, error: 'DB blew up' });

    expect(mocks.logServerError).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });

  it('recordJobRun: the cron-failed event is scheduled, and the failure still rethrows', async () => {
    const boom = new Error('job blew up');
    await expect(recordJobRun('event-reminders', async () => { throw boom; })).rejects.toBe(boom);

    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    expect((mocks.logServerEvent.mock.calls[0] as unknown[])[1]).toMatchObject({ action: 'cron.event-reminders', source: 'cron' });
  });
});
