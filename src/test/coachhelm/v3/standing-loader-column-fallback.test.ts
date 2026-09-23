import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * db-migration-reviewer (2026-09-22) flagged that Package 7B's migration and
 * this app code do not deploy atomically — a manual release can ship the
 * loader before `basis`/`on_green_proximity_feet`/`layup_excluded_n` exist on
 * `golf_player_standing`. Without a fallback, PostgREST's 42703 ("column ...
 * does not exist") would 500 every standing read on every page that renders
 * one, for the whole window between deploy and migration apply.
 *
 * These tests drive that exact error shape and assert the loader retries
 * once with the pre-migration column set and renders the Tour marker
 * withheld (basis null -> applyTourBasis fails closed), identically to a
 * genuinely not-yet-refreshed row.
 */

const select = vi.fn();
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (client: { from: (t: string) => unknown }, table: string) => client.from(table),
}));

const loadPlayerCohortMock = vi.fn();
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({
  loadPlayerCohort: (...args: unknown[]) => loadPlayerCohortMock(...args),
}));

import {
  loadStandingForMetric,
  loadPlayerStandingMap,
} from '@/lib/coachhelm/v3/standing/loader';

const MISSING_COLUMN_ERROR = { message: 'column "basis" does not exist', code: '42703' };
const GENUINE_ERROR = { message: 'connection reset', code: '08006' };

// The row shape golf_player_standing has BEFORE the Package 7B migration
// applies — deliberately no basis / on_green_proximity_feet / layup_excluded_n.
function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    player_id: 'tyler',
    metric_id: 'approach_proximity_175_plus_ft',
    player_value: 26.7,
    team_avg: 28.2,
    team_n: 9,
    team_pct: 60,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 45,
    pga_delta: -18.3,
    computed_at: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  select.mockReset();
  from.mockClear();
  loadPlayerCohortMock.mockReset();
  loadPlayerCohortMock.mockResolvedValue({ gender: 'mens', level: null });
});

describe('loadStandingForMetric — Package 7B column fallback', () => {
  it('retries with the legacy column set on a 42703 and withholds the Tour marker', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: MISSING_COLUMN_ERROR })
      .mockResolvedValueOnce({ data: legacyRow(), error: null });
    select.mockImplementation(() => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }));

    const s = await loadStandingForMetric('tyler', 'approach_proximity_175_plus_ft');

    expect(s).not.toBeNull();
    expect(s!.player_value).toBe(26.7);
    expect(s!.basis).toBeNull(); // legacy row carries no basis -> fails closed
    expect(s!.pga_omitted).toBe(true);
    expect(s!.pga_omitted_reason).toBe('basis_mismatch');
    // Retried exactly once: the wide select, then the legacy fallback.
    expect(select).toHaveBeenCalledTimes(2);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('does not retry, and still throws, on a non-column error', async () => {
    const maybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: GENUINE_ERROR });
    select.mockImplementation(() => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }));

    await expect(
      loadStandingForMetric('tyler', 'approach_proximity_175_plus_ft'),
    ).rejects.toThrow('connection reset');
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe('loadPlayerStandingMap — Package 7B column fallback', () => {
  it('retries with the legacy column set and the row withholds its Tour marker', async () => {
    let call = 0;
    select.mockImplementation(() => {
      call += 1;
      const result =
        call === 1
          ? { data: null, error: MISSING_COLUMN_ERROR }
          : { data: [legacyRow()], error: null };
      return {
        eq: () => ({
          then: <T,>(onF: (v: typeof result) => T): Promise<T> => Promise.resolve(result).then(onF),
        }),
      };
    });

    const map = await loadPlayerStandingMap('tyler');
    const s = map.get('approach_proximity_175_plus_ft');
    expect(s).toBeDefined();
    expect(s!.basis).toBeNull();
    expect(s!.pga_omitted).toBe(true);
    expect(s!.pga_omitted_reason).toBe('basis_mismatch');
    expect(select).toHaveBeenCalledTimes(2);
  });
});
