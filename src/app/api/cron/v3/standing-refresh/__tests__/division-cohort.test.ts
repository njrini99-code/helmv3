import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The nightly standing refresh also rebuilds the division cohort (golf_division_cohort, migration 20261108100000): the mean
 * of golf_player_standing.player_value per gender, level and metric, which CoachHelm's division benchmarks read
 * (src/lib/coachhelm/v3/chat/benchmark-reads.ts). Nothing else calls refresh_division_cohort(), so without this the table
 * keeps the rows it was filled with once. It runs after the standings are written, and a failure is logged without failing
 * the standings job.
 */

type Rpc = (name: string, args: Record<string, unknown> | undefined) => Promise<{ data: unknown; error: unknown }>;
const state = vi.hoisted(() => ({
  cohort: (async () => ({ data: 43, error: null })) as unknown as Rpc,
  calls: [] as Array<{ name: string; args: Record<string, unknown> | undefined }>,
}));
const logServerError = vi.hoisted(() => vi.fn(async () => undefined));
const goalProgress = vi.hoisted(() => vi.fn(async () => ({ updated: 0 })));

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'gte', 'order']) c[m] = vi.fn(() => c);
  c.limit = vi.fn(async () => ({ data: [], error: null }));
  return c;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      state.calls.push({ name, args });
      switch (name) {
        case 'select_stalest_teams':
          return { data: [{ team_id: 't1' }], error: null };
        case 'refresh_division_cohort':
          return state.cohort(name, args);
        case 'prune_stale_player_standing':
          return { data: 0, error: null };
        default:
          return { data: [], error: null };
      }
    }),
    from: vi.fn(() => chain()),
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('@/lib/admin/job-log', () => ({ recordJobRun: (_job: string, fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/golf/progress-drivers', () => ({
  runGoalProgressForPlayers: goalProgress,
  runFocusAreaProgressForPlayers: vi.fn(async () => ({ updated: 0 })),
}));
vi.mock('@/lib/coachhelm/v3/standing/percentile-shift', () => ({
  detectStandingShifts: () => [],
  isWeeklyDigestDay: () => false,
  loadMeanTeamPct: vi.fn(async () => new Map()),
  playersWithWeeklyActivity: () => [],
}));
vi.mock('@/lib/coachhelm/v3/notifications/notify', () => ({ notifyStandingPercentileChanged: vi.fn(), notifyWeeklyDigest: vi.fn() }));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/cron/v3/standing-refresh', { headers: { authorization: 'Bearer test-secret' } });
const called = (name: string) => state.calls.findIndex((c) => c.name === name);

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  state.calls = [];
  state.cohort = (async () => ({ data: 43, error: null })) as unknown as Rpc;
  logServerError.mockClear();
  goalProgress.mockClear();
});

describe('nightly standing refresh: the division cohort', () => {
  it('rebuilds the cohort once, with no arguments, after the standings are written and pruned, and reports its rows', async () => {
    const body = await (await GET(req())).json();
    const cohortCalls = state.calls.filter((c) => c.name === 'refresh_division_cohort');
    expect(cohortCalls).toHaveLength(1);
    expect(cohortCalls[0]!.args).toBeUndefined();
    expect(called('refresh_division_cohort')).toBeGreaterThan(called('refresh_player_standing'));
    expect(called('refresh_division_cohort')).toBeGreaterThan(called('prune_stale_player_standing'));
    expect(body.division_cohort_rows).toBe(43);
  });

  it('a cohort error is logged and the standings job still succeeds and runs its goal pass', async () => {
    state.cohort = (async () => ({ data: null, error: { code: '42501', message: 'permission denied for function refresh_division_cohort' } })) as unknown as Rpc;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.division_cohort_rows).toBeNull();
    expect(goalProgress).toHaveBeenCalled();
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringMatching(/division-cohort: permission denied/),
      expect.objectContaining({ action: 'cron.v3.standing-refresh.division-cohort' }),
    );
  });

  it('a cohort call that throws is logged the same way and fails nothing', async () => {
    state.cohort = (async () => {
      throw new Error('socket hang up');
    }) as unknown as Rpc;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).division_cohort_rows).toBeNull();
    expect(goalProgress).toHaveBeenCalled();
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringMatching(/division-cohort exception: socket hang up/),
      expect.objectContaining({ action: 'cron.v3.standing-refresh.division-cohort' }),
    );
  });
});
