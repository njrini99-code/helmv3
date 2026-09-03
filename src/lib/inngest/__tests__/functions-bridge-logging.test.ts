import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `withBridgeLogging` is the one choke point every Inngest function in
 * functions.ts routes through. It now also wraps a Sentry Cron Monitor
 * check-in (job_name = the function's own `id`) around every attempt, via
 * the same fail-open helpers job-log.ts uses for Vercel crons — this was the
 * "also add check-ins for the Inngest functions" half of the cron-monitoring
 * deliverable. Testing it directly (rather than through a full Inngest
 * function invocation, which needs a real test harness) is deliberate — see
 * the export's own comment in functions.ts.
 */
const mocks = vi.hoisted(() => ({
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
  startCronCheckIn: vi.fn((_jobType: string) => 'checkin-id-1'),
  finishCronCheckIn: vi.fn(
    (_jobType: string, _checkInId: string | null, _status: 'ok' | 'error', _durationMs?: number) => {},
  ),
  createAdminClient: vi.fn(() => ({})),
  postRoundTrigger: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/inngest/client', () => ({
  // Module-level createFunction(...) calls in functions.ts just need
  // something callable that returns a stable object — the exported
  // InngestFunction.Any values themselves are never invoked by this suite.
  inngest: { createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })) },
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
  logServerEvent: mocks.logServerEvent,
}));
vi.mock('@/lib/observability/cron-monitors', () => ({
  startCronCheckIn: mocks.startCronCheckIn,
  finishCronCheckIn: mocks.finishCronCheckIn,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: mocks.postRoundTrigger }));

import { withBridgeLogging } from '@/lib/inngest/functions';

describe('withBridgeLogging — Sentry Cron Monitor check-in per attempt', () => {
  beforeEach(() => {
    mocks.logServerException.mockClear();
    mocks.startCronCheckIn.mockClear();
    mocks.startCronCheckIn.mockReturnValue('checkin-id-1');
    mocks.finishCronCheckIn.mockClear();
  });

  it('starts a check-in keyed by the function id (job_name = fnId)', async () => {
    await withBridgeLogging('weekly-health-ping', async () => 'done');
    expect(mocks.startCronCheckIn).toHaveBeenCalledWith('weekly-health-ping');
  });

  it('finishes ok on success, and returns the result unchanged', async () => {
    const result = await withBridgeLogging('inngest-health-probe', async () => ({ ok: true, probeId: 'p1' }));
    expect(result).toEqual({ ok: true, probeId: 'p1' });
    expect(mocks.finishCronCheckIn).toHaveBeenCalledWith(
      'inngest-health-probe', 'checkin-id-1', 'ok', expect.any(Number),
    );
  });

  it('finishes error and still logs + rethrows on failure — retry policy unaffected', async () => {
    const boom = new Error('step failed');
    await expect(
      withBridgeLogging('coachhelm-round-submitted', async () => { throw boom; }),
    ).rejects.toBe(boom);

    expect(mocks.finishCronCheckIn).toHaveBeenCalledWith(
      'coachhelm-round-submitted', 'checkin-id-1', 'error', expect.any(Number),
    );
    expect(mocks.logServerException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ action: 'coachhelm-round-submitted', skipSentry: true }),
      'warning',
    );
  });

  it('the check-in finishes BEFORE the Bridge log write, so a hung logger cannot delay Sentry visibility', async () => {
    const order: string[] = [];
    mocks.finishCronCheckIn.mockImplementation(() => { order.push('finishCronCheckIn'); });
    mocks.logServerException.mockImplementation(async () => { order.push('logServerException'); });

    await expect(withBridgeLogging('x', async () => { throw new Error('e'); })).rejects.toThrow();

    expect(order).toEqual(['finishCronCheckIn', 'logServerException']);
  });
});
