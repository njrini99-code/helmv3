import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
const logs = vi.hoisted(() => ({ event: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: logs.event, logServerError: logs.error }));
vi.mock('../../lib/track-server', () => ({ chLogServer: logs.error }));
vi.mock('@/lib/golf/player-profiles', () => ({ readGolfPlayerProfiles: async () => ({ data: [], error: null }) }));

import { loadPlayerTournaments, loadTournamentDesk, loadTournamentsHome, type TourCtx } from '../tournaments';

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** A stand-in Supabase client: every table answers with its configured result, whatever the filters. */
function client(tables: Record<string, Result>, calls: string[] = []) {
  const builder = (table: string) => {
    const res = tables[table] ?? { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'not', 'gte', 'order', 'neq', 'is']) b[m] = () => b;
    b.range = () => Promise.resolve(res);
    b.maybeSingle = () => Promise.resolve(res);
    return b;
  };
  return {
    from: (t: string) => {
      calls.push(t);
      return builder(t);
    },
    rpc: (fn: string) => {
      calls.push(`rpc:${fn}`);
      return Promise.resolve(tables[`rpc:${fn}`] ?? { data: [], error: null });
    },
  };
}

const team = { data: { id: 'team', name: 'Varsity', timezone: 'America/New_York', gender: 'mens' }, error: null };
const ctx = (supabase: unknown, role: 'coach' | 'player' = 'coach'): TourCtx => ({ supabase: supabase as TourCtx['supabase'], teamId: 'team', role, playerId: role === 'player' ? 'me' : null, now: '2026-10-14T16:00:00.000Z' });

beforeEach(() => {
  logs.event.mockClear();
  logs.error.mockClear();
});

describe('Tournaments loaders before the held migrations are applied', () => {
  it('a missing table (PGRST205) is "not set up", never a crash or an empty season', async () => {
    const sb = client({ golf_teams: team, golf_team_seasons: { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } } });
    await expect(loadTournamentsHome(ctx(sb))).resolves.toEqual({ kind: 'not_set_up' });
  });

  it('42P01 on the tournaments read is "not set up" too, and is an event, not an error report', async () => {
    const sb = client({ golf_teams: team, golf_tournaments: { data: null, error: { code: '42P01', message: 'relation "public.golf_tournaments" does not exist' } } });
    await expect(loadTournamentDesk(ctx(sb), '00000000-0000-0000-0000-000000000001')).resolves.toEqual({ kind: 'not_set_up' });
    expect(logs.error).not.toHaveBeenCalled();
  });

  it('a read that fails for another reason is the page failure, reported', async () => {
    const sb = client({ golf_teams: team, golf_tournaments: { data: null, error: { code: '57014', message: 'canceling statement' } } });
    await expect(loadTournamentDesk(ctx(sb), '00000000-0000-0000-0000-000000000001')).resolves.toEqual({ kind: 'failed' });
    expect(logs.error).toHaveBeenCalled();
  });

  it('an event that is not the team’s is missing', async () => {
    const sb = client({ golf_teams: team });
    await expect(loadTournamentDesk(ctx(sb), '00000000-0000-0000-0000-000000000001')).resolves.toEqual({ kind: 'missing' });
  });
});

describe('Tournaments loaders with the tables in place', () => {
  it('an empty season is ready, with no events and no next event', async () => {
    const sb = client({ golf_teams: team });
    const load = await loadTournamentsHome(ctx(sb));
    expect(load.kind).toBe('ready');
    if (load.kind !== 'ready') return;
    expect(load.data.events).toEqual([]);
    expect(load.data.next).toBeNull();
    expect(load.data.season.id).toBe('2026-27');
    expect(load.data.errors).toEqual({});
  });

  it('a player’s loader never reads entries, round lineups or the field (D-85)', async () => {
    const calls: string[] = [];
    const sb = client(
      {
        golf_teams: team,
        golf_team_members: { data: [{ player_id: 'me', status: 'active', availability: 'available' }], error: null },
        golf_tournaments: { data: [{ id: 't1', team_id: 'team', name: 'Oakmont', start_date: '2026-10-05', end_date: '2026-10-07', course_id: null, format: '5c4', players_per_team: 5, counting: 4, holes_per_round: 18, rounds_count: 1, event_kind: 'regular', tiebreak: 'ties_stand', field_size: null, line_kind: null, line_value: null, substitutions: false, lock_minutes: 10, lineup_locked_at: null, lineup_published_at: null, official_at: null, results_url: null, host: null, created_by: null, created_at: '', updated_at: '', version: 1 }], error: null },
      },
      calls,
    );
    const load = await loadPlayerTournaments(ctx(sb, 'player'), null);
    expect(load.kind).toBe('ready');
    expect(calls).not.toContain('golf_tournament_entries');
    expect(calls).not.toContain('golf_tournament_round_lineups');
    expect(calls).not.toContain('golf_tournament_field_teams');
  });
});
