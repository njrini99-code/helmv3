import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration of the gender-aware override into the standing READ path
 * (loadStandingForMetric / loadPlayerStandingMap). The DB row always carries
 * the men's pga_value; the loader must override it for a women's player and
 * leave it untouched for a men's player.
 */

// --- supabase admin mock: drive what golf_player_standing returns ---------
const singleResult = { data: null as unknown, error: null as unknown };
const mapResult = { data: [] as unknown[], error: null as unknown };

// single-row chain: from().select().eq().eq().maybeSingle()
const maybeSingle = vi.fn(async () => singleResult);
const eqSingle2 = vi.fn(() => ({ maybeSingle }));
// select() must support BOTH chains:
//   - single path: .eq(player).eq(metric).maybeSingle()
//   - map path:    .eq(player) then awaited directly
// The first .eq() returns an object that has a 2nd .eq AND is itself awaitable.
const select = vi.fn(() => ({
  eq: vi.fn(() => ({
    eq: eqSingle2,
    then: <T,>(onF: (v: typeof mapResult) => T): Promise<T> =>
      Promise.resolve(mapResult).then(onF),
  })),
}));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (client: { from: (t: string) => unknown }, table: string) => client.from(table),
}));

// --- cohort mock: control the resolved gender -----------------------------
const loadPlayerCohortMock = vi.fn();
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({
  loadPlayerCohort: (...args: unknown[]) => loadPlayerCohortMock(...args),
}));

import {
  loadStandingForMetric,
  loadPlayerStandingMap,
} from '@/lib/coachhelm/v3/standing/loader';

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    player_id: 'grace',
    metric_id: 'scrambling_pct_sand',
    player_value: 0,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 50, // men's Tour value — what the RPC always writes
    pga_delta: -50,
    computed_at: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('loadStandingForMetric — gender-aware override', () => {
  beforeEach(() => {
    maybeSingle.mockClear();
    loadPlayerCohortMock.mockReset();
    singleResult.data = null;
    singleResult.error = null;
  });

  it('women: overrides the men\'s 50 sand-save with the women\'s 38 anchor', async () => {
    singleResult.data = dbRow({ player_value: 0 });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const s = await loadStandingForMetric('grace', 'scrambling_pct_sand');
    expect(s).not.toBeNull();
    expect(s!.pga_value).toBe(38);
    expect(s!.pga_delta).toBe(-38); // player 0 - womens 38
    expect(s!.pga_omitted).toBe(false);
  });

  it('men: returns the DB men\'s value unchanged (no override)', async () => {
    singleResult.data = dbRow({ player_id: 'tyler' });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });

    const s = await loadStandingForMetric('tyler', 'scrambling_pct_sand');
    expect(s!.pga_value).toBe(50);
    expect(s!.pga_delta).toBe(-50);
    expect(s!.pga_omitted).toBeUndefined();
  });

  it('women + anchorless metric: omits the reference instead of fabricating', async () => {
    singleResult.data = dbRow({ metric_id: 'big_number_rate', player_value: 8, pga_value: 2, pga_delta: 6 });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const s = await loadStandingForMetric('grace', 'big_number_rate');
    expect(s!.pga_omitted).toBe(true);
  });

  it('returns null (and skips the cohort lookup) when no DB row exists', async () => {
    singleResult.data = null;
    const s = await loadStandingForMetric('grace', 'scrambling_pct_sand');
    expect(s).toBeNull();
    expect(loadPlayerCohortMock).not.toHaveBeenCalled();
  });
});

describe('loadPlayerStandingMap — gender-aware override', () => {
  beforeEach(() => {
    loadPlayerCohortMock.mockReset();
    mapResult.data = [];
    mapResult.error = null;
  });

  it('women: rewrites anchored rows + omits anchorless rows across the map', async () => {
    mapResult.data = [
      dbRow({ metric_id: 'scrambling_pct_sand', pga_value: 50 }),
      dbRow({ metric_id: 'big_number_rate', pga_value: 2 }),
    ];
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const map = await loadPlayerStandingMap('grace');
    expect(map.get('scrambling_pct_sand')!.pga_value).toBe(38);
    expect(map.get('big_number_rate')!.pga_omitted).toBe(true);
  });

  it('men: leaves every row\'s men\'s value untouched', async () => {
    mapResult.data = [dbRow({ metric_id: 'scrambling_pct_sand', pga_value: 50 })];
    loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });

    const map = await loadPlayerStandingMap('tyler');
    expect(map.get('scrambling_pct_sand')!.pga_value).toBe(50);
    expect(map.get('scrambling_pct_sand')!.pga_omitted).toBeUndefined();
  });
});
