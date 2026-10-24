import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * The Standing dirty pass (Clubhouse A+ rows 105/121): refresh only the teams a saved round marked, clear only the marks it covered,
 * and do nothing (200) while the held migrations are not applied.
 */

const rpc = vi.hoisted(() => vi.fn());
const logServerError = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('@/lib/admin/job-log', () => ({ recordJobRun: (_job: string, fn: () => Promise<unknown>) => fn() }));

import { GET } from '../route';

const req = (auth = 'Bearer test-secret') => ({ headers: new Headers({ authorization: auth }) }) as unknown as NextRequest;
const MISSING = { code: 'PGRST202', message: 'Could not find the function' };
const answer = (by: Record<string, { data?: unknown; error?: unknown }>) =>
  rpc.mockImplementation(async (name: string) => ({ data: null, error: null, ...(by[name] ?? {}) }));

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  rpc.mockReset();
  logServerError.mockClear();
});

describe('GET /api/cron/v3/standing-refresh-dirty', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req('Bearer nope'));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an idle tick is one read', async () => {
    answer({ select_dirty_standing_teams: { data: [] } });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('select_dirty_standing_teams', { p_limit: 50, p_quiet_seconds: 180, p_max_wait_seconds: 1800 });
  });

  it('refreshes the dirty teams’ season Standing, then clears exactly the marks it read', async () => {
    const dirty = [
      { team_id: 't1', marked_at: '2026-10-24T12:00:00Z' },
      { team_id: 't2', marked_at: '2026-10-24T12:01:00Z' },
    ];
    answer({
      select_dirty_standing_teams: { data: dirty },
      refresh_player_standing_season: { data: [{ out_metric_id: 'gir_pct', out_rows_upserted: 9 }] },
      clear_dirty_standing_teams: { data: 2 },
    });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('refresh_player_standing_season', { p_team_ids: ['t1', 't2'] });
    expect(rpc).toHaveBeenCalledWith('clear_dirty_standing_teams', { p_team_ids: ['t1', 't2'], p_marked_ats: ['2026-10-24T12:00:00Z', '2026-10-24T12:01:00Z'] });
    expect(body).toMatchObject({ teams_in_chunk: 2, rpc_rows: [{ metric_id: 'gir_pct', rows_upserted: 9 }], marks_cleared: 2 });
    // Nothing but the season table: no lifetime refresh, no notifications, no goal pass.
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['select_dirty_standing_teams', 'refresh_player_standing_season', 'clear_dirty_standing_teams']);
  });

  it('before the queue migration is applied: 200, nothing done, nothing logged', async () => {
    answer({ select_dirty_standing_teams: { error: MISSING } });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe('queue-not-applied');
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('before the season migration is applied: the marks stay (no clear), 200', async () => {
    answer({ select_dirty_standing_teams: { data: [{ team_id: 't1', marked_at: '2026-10-24T12:00:00Z' }] }, refresh_player_standing_season: { error: MISSING } });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe('season-not-applied');
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain('clear_dirty_standing_teams');
  });

  it('a failed refresh keeps the marks, is logged and fails the run', async () => {
    answer({ select_dirty_standing_teams: { data: [{ team_id: 't1', marked_at: '2026-10-24T12:00:00Z' }] }, refresh_player_standing_season: { error: { code: '40P01', message: 'deadlock detected' } } });
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain('clear_dirty_standing_teams');
    expect(logServerError).toHaveBeenCalledWith(expect.stringMatching(/deadlock/), expect.objectContaining({ action: 'cron.v3.standing-refresh-dirty.rpc' }));
  });

  it('a clear that fails is only a warning: Standing is already fresh', async () => {
    answer({
      select_dirty_standing_teams: { data: [{ team_id: 't1', marked_at: '2026-10-24T12:00:00Z' }] },
      refresh_player_standing_season: { data: [] },
      clear_dirty_standing_teams: { error: { code: '57014', message: 'timeout' } },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(logServerError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ action: 'cron.v3.standing-refresh-dirty.clear' }), 'warning');
  });
});
