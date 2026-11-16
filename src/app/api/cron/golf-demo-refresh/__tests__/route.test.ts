import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The demo refresh cron (DD-01): nothing happens while its flag is off, a
 * database without the generator's migration is a quiet no-op, and a refresh
 * whose result fails the coverage check fails the run so the jobs board shows
 * it.
 */

const mocks = vi.hoisted(() => ({
  enabled: false,
  refresh: vi.fn(),
  inserted: [] as Record<string, unknown>[],
  events: [] as Array<{ message: string; severity: string }>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: vi.fn(async (message: string, _ctx: unknown, severity = 'info') => {
    mocks.events.push({ message, severity });
  }),
}));
vi.mock('@/lib/observability/cron-monitors', () => ({
  startCronCheckIn: () => null,
  finishCronCheckIn: () => {},
  flushCronCheckIn: async () => {},
}));
vi.mock('@/lib/golf/demo/flag', () => ({ isDemoRefreshEnabled: () => mocks.enabled }));
vi.mock('@/lib/golf/demo/refresh', () => ({ refreshDemoTeam: mocks.refresh }));

function request(secret = 'cron-secret'): NextRequest {
  return new NextRequest('https://helmsportslabs.com/api/cron/golf-demo-refresh', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function run(secret?: string) {
  const { GET } = await import('@/app/api/cron/golf-demo-refresh/route');
  return GET(request(secret));
}

function report(checks: Array<{ id: string; ok: boolean; detail: string }>) {
  const errors = checks.filter((c) => !c.ok).length;
  return {
    today: '2026-11-16',
    result: {
      tables: [
        { table: 'golf_events', upserted: 3, skipped: ['x'], removed: 1, unchanged: 90 },
        { table: 'golf_rounds', upserted: 5, skipped: [], removed: 0, unchanged: 200 },
      ],
      roundsFinished: 5,
    },
    written: { ok: errors === 0, errors, warnings: 0, checks },
  };
}

describe('GET /api/cron/golf-demo-refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.enabled = false;
    mocks.refresh.mockReset();
    mocks.inserted.length = 0;
    mocks.events.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses a call without the cron secret', async () => {
    const res = await run('wrong');
    expect(res.status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('does nothing while the flag is off', async () => {
    const res = await run();
    expect(await res.json()).toEqual({ ok: true, skipped: 'flag_off' });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('writes, and reports the counts as scalars for the heartbeat', async () => {
    mocks.enabled = true;
    mocks.refresh.mockResolvedValueOnce(report([{ id: 'scorecards-distinct', ok: true, detail: '' }]));
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, today: '2026-11-16', upserted: 8, removed: 1, skipped_not_generated: 1, rounds_finished: 5, check_errors: 0 });
    expect(mocks.refresh).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ apply: true }));
    expect(mocks.events.at(-1)).toEqual({ message: 'Demo team refreshed for 2026-11-16', severity: 'info' });
  });

  it('fails the run when the refreshed team fails its coverage check', async () => {
    mocks.enabled = true;
    mocks.refresh.mockResolvedValueOnce(report([{ id: 'scorecards-distinct', ok: false, detail: '2 players share a scorecard' }]));
    const res = await run();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('scorecards-distinct: 2 players share a scorecard');
  });

  it('is a quiet no-op when the generator migration is not applied', async () => {
    mocks.enabled = true;
    const { DemoPlumbingMissingError } = await import('@/lib/golf/demo/writer');
    mocks.refresh.mockRejectedValueOnce(new DemoPlumbingMissingError('golf_demo_begin: missing'));
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: 'migration_not_applied' });
  });
});
