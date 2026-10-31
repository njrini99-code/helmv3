import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * loadPlayerSeasonStandingMap (Clubhouse Standing, owner decision 9): this season's rows with their round counts, the same read-level
 * overrides as every standing loader, and `missing` (not a failure) while the held season migration is not applied.
 */

const eq = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn((_fields: string) => ({ eq })));
const from = vi.hoisted(() => vi.fn(() => ({ select })));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));
vi.mock('@/lib/supabase/untyped', () => ({ fromUntyped: (client: { from: (t: string) => unknown }, table: string) => client.from(table) }));
const cohort = vi.hoisted(() => vi.fn(async () => ({ gender: 'mens', level: null })));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: cohort, loadPlayerCohorts: vi.fn() }));

import { loadPlayerSeasonStandingMap } from '../loader';

const seasonRow = (over: Record<string, unknown> = {}) => ({
  player_id: 'p1',
  metric_id: 'gir_pct',
  player_value: 58,
  team_avg: 52,
  team_n: 2,
  team_pct: 40,
  level_avg: null,
  level_n: 4,
  level_pct: null,
  pga_value: 66,
  pga_delta: -8,
  basis: null,
  on_green_proximity_feet: null,
  layup_excluded_n: null,
  rounds_n: 12,
  season_start: '2026-08-01',
  computed_at: '2026-10-24T02:20:00Z',
  ...over,
});

beforeEach(() => {
  from.mockClear();
  select.mockClear();
  eq.mockReset();
  cohort.mockClear();
});

describe('loadPlayerSeasonStandingMap', () => {
  it('reads golf_player_standing_season for the player, with rounds_n and season_start, and applies the team floor', async () => {
    eq.mockResolvedValue({ data: [seasonRow(), seasonRow({ metric_id: 'not_a_metric' })], error: null });
    const out = await loadPlayerSeasonStandingMap('p1');
    expect(from).toHaveBeenCalledWith('golf_player_standing_season');
    expect(select.mock.calls[0]![0]).toMatch(/rounds_n, season_start$/);
    expect(eq).toHaveBeenCalledWith('player_id', 'p1');
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect([...out.rows.keys()]).toEqual(['gir_pct']);
    const gir = out.rows.get('gir_pct')!;
    expect(gir).toMatchObject({ rounds_n: 12, season_start: '2026-08-01' });
    // Two measured players is under the read-time team floor (applyTeamFloor): the marker is withheld, as on every loader.
    expect(gir.team_avg).toBeNull();
    expect(gir.team_pct).toBeNull();
  });

  it.each([
    [{ code: 'PGRST205', message: "Could not find the table 'public.golf_player_standing_season' in the schema cache" }],
    [{ code: '42P01', message: 'relation "golf_player_standing_season" does not exist' }],
  ])('a table that is not deployed yet is `missing`, not a failure (%j)', async (error) => {
    eq.mockResolvedValue({ data: null, error });
    await expect(loadPlayerSeasonStandingMap('p1')).resolves.toEqual({ status: 'missing' });
    expect(cohort).not.toHaveBeenCalled();
  });

  it('any other error throws, as the lifetime loader does', async () => {
    eq.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection reset' } });
    await expect(loadPlayerSeasonStandingMap('p1')).rejects.toThrow(/connection reset/);
  });
});
