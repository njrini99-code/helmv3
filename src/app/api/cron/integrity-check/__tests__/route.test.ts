import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The integrity-check heartbeat must say WHICH checks failed.
 *
 * `recordJobRun` keeps only top-level SCALARS of the route's JSON body
 * (`scalarOutcome` in src/lib/admin/job-log.ts), so the `failed: string[]`
 * array this route returns was dropped and every heartbeat read `{ok:true}`.
 * Production, 2026-09-28 07:00 UTC: `completed_round_zero_scored_holes`
 * failed (14) while the heartbeat said only `{ok:true}`, so anything reading
 * the heartbeat (the health routine's Integrity area, /admin/jobs) saw a
 * clean run. The route now also returns the failures as scalars.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn<(name: string) => Promise<{ data: unknown; error: unknown }>>(),
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/observability/cron-monitors', () => ({
  startCronCheckIn: () => null,
  finishCronCheckIn: () => {},
  flushCronCheckIn: async () => {},
}));

function request(): NextRequest {
  return new NextRequest('https://helmsportslabs.com/api/cron/integrity-check', {
    headers: { authorization: 'Bearer cron-secret' },
  });
}

async function run(checks: unknown[]) {
  mocks.rpc.mockResolvedValueOnce({ data: checks, error: null });
  const { GET } = await import('@/app/api/cron/integrity-check/route');
  return GET(request());
}

describe('GET /api/cron/integrity-check heartbeat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.rpc.mockReset();
    mocks.inserted.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records the failed checks on the heartbeat, not just ok:true', async () => {
    await run([
      { check: 'orphaned_team_members', status: 'pass', count: 0, sample: [] },
      { check: 'completed_round_zero_scored_holes', status: 'fail', count: 14, sample: ['r1'] },
    ]);
    const heartbeat = mocks.inserted.find((r) => r.job_type === 'integrity-check');
    expect(heartbeat).toMatchObject({ status: 'completed' });
    expect(heartbeat!.metadata).toMatchObject({
      ok: true,
      failed_count: 1,
      failed_checks: 'completed_round_zero_scored_holes',
    });
  });

  it('records zero failures explicitly on a clean run', async () => {
    await run([{ check: 'orphaned_team_members', status: 'pass', count: 0, sample: [] }]);
    const heartbeat = mocks.inserted.find((r) => r.job_type === 'integrity-check');
    expect(heartbeat!.metadata).toMatchObject({ ok: true, failed_count: 0, failed_checks: '' });
  });
});
