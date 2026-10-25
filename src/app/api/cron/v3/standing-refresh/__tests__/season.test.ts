import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The nightly standing refresh also refreshes Clubhouse's season table (owner decision 9) for the same chunk. It is kept apart from
 * the lifetime refresh: its rows are not counted in rpc_rows, a missing function is a quiet skip, and a throw never takes the lifetime
 * run's prune or goal pass down with it.
 */

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const state = vi.hoisted(() => ({ season: (async () => ({ data: [], error: null })) as unknown as Rpc, calls: [] as string[] }));
const logServerError = vi.hoisted(() => vi.fn(async () => undefined));

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'gte', 'order']) c[m] = vi.fn(() => c);
  c.limit = vi.fn(async () => ({ data: [], error: null }));
  return c;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.calls.push(name);
      switch (name) {
        case 'select_stalest_teams':
          return { data: [{ team_id: 't1' }], error: null };
        case 'refresh_player_standing_season':
          return state.season(name, args);
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
  runGoalProgressForPlayers: vi.fn(async () => ({ updated: 0 })),
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

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  state.calls = [];
  logServerError.mockClear();
});

describe('nightly standing refresh: the season table', () => {
  it('refreshes the same chunk’s season Standing after the lifetime RPCs and reports its rows apart', async () => {
    state.season = (async (_n: string, args: Record<string, unknown>) => {
      expect(args).toEqual({ p_team_ids: ['t1'] });
      return { data: [{ out_metric_id: 'gir_pct', out_rows_upserted: 4 }, { out_metric_id: 'sg_total', out_rows_upserted: 3 }], error: null };
    }) as Rpc;
    const body = await (await GET(req())).json();
    expect(state.calls.indexOf('refresh_player_standing_season')).toBeGreaterThan(state.calls.indexOf('refresh_player_standing_shot_metrics'));
    expect(body.season_rows_upserted).toBe(7);
    expect(body.rpc_rows.some((r: { metric_id: string }) => r.metric_id === 'gir_pct')).toBe(false);
  });

  it('before the season migration is applied it is a quiet skip', async () => {
    state.season = (async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })) as Rpc;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).season_rows_upserted).toBeNull();
    expect(logServerError).not.toHaveBeenCalledWith(expect.stringMatching(/season/), expect.anything());
  });

  it('a season RPC that throws is logged and the lifetime run still prunes', async () => {
    state.season = (async () => {
      throw new Error('socket hang up');
    }) as Rpc;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(state.calls).toContain('prune_stale_player_standing');
    expect(logServerError).toHaveBeenCalledWith(expect.stringMatching(/season-RPC exception/), expect.objectContaining({ action: 'cron.v3.standing-refresh.season-rpc' }));
  });
});
