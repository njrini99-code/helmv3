import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
  failInsert: false,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        if (mocks.failInsert) return Promise.resolve({ data: null, error: { message: 'insert down' } });
        mocks.inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: mocks.logServerEvent }));

import { recordJobRun } from '@/lib/admin/job-log';

describe('recordJobRun', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.logServerEvent.mockClear();
    mocks.failInsert = false;
  });

  it('passes the result through and writes a completed row', async () => {
    await expect(recordJobRun('event-reminders', async () => 'done')).resolves.toBe('done');
    expect(mocks.inserted[0]).toMatchObject({ job_type: 'event-reminders', status: 'completed' });
    expect(typeof mocks.inserted[0]!.duration_ms).toBe('number');
    expect(mocks.logServerEvent).not.toHaveBeenCalled(); // successes stay out of the feed
  });

  it('rethrows failures after writing a failed row + cron event', async () => {
    const boom = new Error('job blew up');
    await expect(recordJobRun('event-reminders', async () => { throw boom; })).rejects.toBe(boom);
    expect(mocks.inserted[0]).toMatchObject({ job_type: 'event-reminders', status: 'failed', error_message: 'job blew up' });
    const [, ctx] = mocks.logServerEvent.mock.calls[0]!;
    expect(ctx).toMatchObject({ source: 'cron', action: 'cron.event-reminders' });
  });

  it('a broken log table never fails the cron (fire-and-forget)', async () => {
    mocks.failInsert = true;
    await expect(recordJobRun('event-reminders', async () => 42)).resolves.toBe(42);
  });
});
