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

// golf_pga_standards rows for the LPGA read the loader now performs for a
// women's cohort. Real values from the table (read 2026-08-15): sand save 45,
// big-number rate 3.0. Tests that want the FALLBACK path empty this.
const standardsResult = { data: [] as unknown[], error: null as unknown };

function lpgaRow(metric_id: string, pga_tour_value: number | null) {
  return {
    metric_id,
    season: '2026',
    tour: 'lpga',
    display_label: metric_id,
    pga_tour_value,
    korn_ferry_value: null,
    div1_avg_value: null,
    div2_avg_value: null,
    div3_avg_value: null,
    hs_avg_value: null,
    pga_p25: null,
    pga_p50: null,
    pga_p75: null,
    source: 'test',
  };
}

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

// golf_pga_standards chain: .select().eq('tour', …).order('season', …), awaited
// at .order(). A different shape from the standing chains, so `from` routes by
// table rather than returning one builder for everything.
const standardsSelect = vi.fn(() => ({
  eq: vi.fn(() => ({
    order: vi.fn(() => Promise.resolve(standardsResult)),
  })),
}));

const from = vi.fn((table: string) =>
  table === 'golf_pga_standards' ? { select: standardsSelect } : { select },
);

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
    standardsSelect.mockClear(); // the men's case asserts a call COUNT of zero
    loadPlayerCohortMock.mockReset();
    singleResult.data = null;
    singleResult.error = null;
    standardsResult.data = [
      lpgaRow('scrambling_pct_sand', 45),
      lpgaRow('big_number_rate', 3.0),
    ];
    standardsResult.error = null;
  });

  it('women: anchors sand save to the real LPGA 45 (not the men\'s 50, not the 38 estimate)', async () => {
    singleResult.data = dbRow({ player_value: 0 });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const s = await loadStandingForMetric('grace', 'scrambling_pct_sand');
    expect(s).not.toBeNull();
    expect(s!.pga_value).toBe(45);
    expect(s!.pga_delta).toBe(-45); // player 0 - LPGA 45
    expect(s!.pga_omitted).toBe(false);
  });

  it('men: returns the DB men\'s value unchanged, and reads no standards table', async () => {
    singleResult.data = dbRow({ player_id: 'tyler' });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });

    const s = await loadStandingForMetric('tyler', 'scrambling_pct_sand');
    expect(s!.pga_value).toBe(50);
    expect(s!.pga_delta).toBe(-50);
    expect(s!.pga_omitted).toBeUndefined();
    // A men's-team page load must not pay an extra reference-table read.
    expect(standardsSelect).not.toHaveBeenCalled();
  });

  it('women: a metric that HAS an LPGA row is no longer omitted', async () => {
    // big_number_rate has no women's estimate in cohort-baselines.ts, so it
    // used to render no reference marker at all. The LPGA table carries 3.0,
    // so these women's cards gain a reference they never had.
    singleResult.data = dbRow({ metric_id: 'big_number_rate', player_value: 3.5, pga_value: 2, pga_delta: 1.5 });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const s = await loadStandingForMetric('grace', 'big_number_rate');
    expect(s!.pga_omitted).toBe(false);
    expect(s!.pga_value).toBe(3.0);
  });

  it('women + no LPGA row + no estimate: still omits rather than fabricating', async () => {
    // The honesty rule that predates the LPGA wire-up. Empty standards forces
    // the full fallback chain: LPGA miss -> estimate miss -> omit. It must
    // never resolve to the men's 2.0 sitting on the row.
    standardsResult.data = [];
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

  // Addendum A2 (read level): the approach-proximity rows are on-green-only
  // player values against the Tour's all-shot figure. Every cohort gets the
  // Tour marker omitted with a stated reason; the team tick is untouched.
  it('men: omits the Tour marker on an approach-proximity row (basis mismatch)', async () => {
    singleResult.data = dbRow({
      player_id: 'tyler',
      metric_id: 'approach_proximity_175_plus_ft',
      player_value: 26.7,
      team_avg: 28.2,
      team_n: 9,
      pga_value: 45,
      pga_delta: -18.3,
    });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });

    const s = await loadStandingForMetric('tyler', 'approach_proximity_175_plus_ft');
    expect(s!.pga_omitted).toBe(true);
    expect(s!.pga_omitted_reason).toBe('basis_mismatch');
    expect(s!.team_avg).toBe(28.2);
    expect(s!.team_n).toBe(9);
  });

  it('women: an approach-proximity row is omitted for basis even with an LPGA row', async () => {
    standardsResult.data = [lpgaRow('approach_proximity_125_175ft', 38)];
    singleResult.data = dbRow({
      metric_id: 'approach_proximity_125_175ft',
      player_value: 22.6,
      pga_value: 30,
      pga_delta: -7.4,
    });
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const s = await loadStandingForMetric('grace', 'approach_proximity_125_175ft');
    expect(s!.pga_omitted).toBe(true);
    expect(s!.pga_omitted_reason).toBe('basis_mismatch');
    expect(s!.is_womens).toBe(true);
  });
});

describe('loadPlayerStandingMap — gender-aware override', () => {
  beforeEach(() => {
    loadPlayerCohortMock.mockReset();
    standardsSelect.mockClear();
    mapResult.data = [];
    mapResult.error = null;
    standardsResult.data = [lpgaRow('scrambling_pct_sand', 45)];
    standardsResult.error = null;
  });

  it('women: LPGA-anchors rows that have a row, omits the ones that have neither', async () => {
    mapResult.data = [
      dbRow({ metric_id: 'scrambling_pct_sand', pga_value: 50 }),
      dbRow({ metric_id: 'big_number_rate', pga_value: 2 }),
    ];
    loadPlayerCohortMock.mockResolvedValue({ gender: 'womens', level: null });

    const map = await loadPlayerStandingMap('grace');
    expect(map.get('scrambling_pct_sand')!.pga_value).toBe(45);
    // Not in the standards map and no women's estimate -> still omitted.
    expect(map.get('big_number_rate')!.pga_omitted).toBe(true);
    // ONE standards read for the whole map, not one per row.
    expect(standardsSelect).toHaveBeenCalledTimes(1);
  });

  it('men: leaves every row\'s men\'s value untouched', async () => {
    mapResult.data = [dbRow({ metric_id: 'scrambling_pct_sand', pga_value: 50 })];
    loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });

    const map = await loadPlayerStandingMap('tyler');
    expect(map.get('scrambling_pct_sand')!.pga_value).toBe(50);
    expect(map.get('scrambling_pct_sand')!.pga_omitted).toBeUndefined();
  });

  it('men: the map path omits the Tour marker on every approach-proximity row (A2)', async () => {
    mapResult.data = [
      dbRow({ metric_id: 'approach_proximity_50_125ft', player_value: 17.4, pga_value: 18 }),
      dbRow({ metric_id: 'approach_proximity_125_175ft', player_value: 22.6, pga_value: 30 }),
      dbRow({ metric_id: 'approach_proximity_175_plus_ft', player_value: 26.7, pga_value: 45 }),
      dbRow({ metric_id: 'scrambling_pct_sand', player_value: 40, pga_value: 50 }),
    ];
    loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });

    const map = await loadPlayerStandingMap('tyler');
    for (const id of ['approach_proximity_50_125ft', 'approach_proximity_125_175ft', 'approach_proximity_175_plus_ft'] as const) {
      expect(map.get(id)!.pga_omitted).toBe(true);
      expect(map.get(id)!.pga_omitted_reason).toBe('basis_mismatch');
    }
    expect(map.get('scrambling_pct_sand')!.pga_omitted).toBeUndefined();
  });
});
