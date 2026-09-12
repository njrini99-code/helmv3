import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `suggestGoalTarget` — the goal modal's auto-target. Three cases where a
 * midpoint-to-Tour would mislead and the action must return the baseline
 * alone with a stated reason:
 *   - the standing loader omitted the Tour reference for basis (approach
 *     proximity: on-green player value vs all-shot Tour — addendum A2);
 *   - the loader omitted it for a women's row with no credible anchor;
 *   - the player is already at/better than the anchor (the midpoint would sit
 *     on the wrong side of their own number).
 * Plus the unchanged happy path: behind the anchor → midpoint.
 */

const loadStandingForMetric = vi.fn();

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadStandingForMetric: (...args: unknown[]) => loadStandingForMetric(...args),
}));
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: vi.fn(),
  resolveCoachTeamIdWithCookie: vi.fn(),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/untyped', () => ({ fromUntyped: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: vi.fn() }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-player' } }, error: null })) },
    from: (table: string) => {
      if (table === 'golf_players') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'player-1' }, error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

import { suggestGoalTarget } from '@/app/golf/actions/v3/goals';

function standing(overrides: Record<string, unknown>) {
  return {
    player_id: 'player-1',
    metric_id: 'scrambling_pct_sand',
    player_value: 40,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 50,
    pga_delta: -10,
    computed_at: '2026-09-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('suggestGoalTarget', () => {
  beforeEach(() => {
    loadStandingForMetric.mockReset();
  });

  it('behind the anchor → midpoint target, no reason', async () => {
    loadStandingForMetric.mockResolvedValue(standing({}));
    const s = await suggestGoalTarget('scrambling_pct_sand');
    expect(s.ok).toBe(true);
    expect(s.hasStanding).toBe(true);
    expect(s.baseline).toBe(40);
    expect(s.pga_value).toBe(50);
    expect(s.suggested_target).toBe(45);
    expect(s.no_target_reason).toBeNull();
  });

  it('approach proximity (basis omitted by the loader) → baseline only, reason stated, no Tour value', async () => {
    loadStandingForMetric.mockResolvedValue(
      standing({
        metric_id: 'approach_proximity_125_175ft',
        player_value: 22.6,
        pga_value: 30,
        pga_delta: -7.4,
        pga_omitted: true,
        pga_omitted_reason: 'basis_mismatch',
      }),
    );
    const s = await suggestGoalTarget('approach_proximity_125_175ft');
    expect(s.hasStanding).toBe(true);
    expect(s.baseline).toBe(22.6);
    expect(s.pga_value).toBeNull();
    expect(s.suggested_target).toBeNull();
    expect(s.no_target_reason).toBe('basis_mismatch');
    expect(s.direction).toBe('lower_better');
    expect(s.unit).toBe('feet');
  });

  it('women\'s row with no credible anchor → baseline only, reason stated', async () => {
    loadStandingForMetric.mockResolvedValue(
      standing({
        metric_id: 'big_number_rate',
        player_value: 3.5,
        pga_value: 2,
        pga_omitted: true,
        pga_omitted_reason: 'no_womens_anchor',
        is_womens: true,
      }),
    );
    const s = await suggestGoalTarget('big_number_rate');
    expect(s.suggested_target).toBeNull();
    expect(s.pga_value).toBeNull();
    expect(s.no_target_reason).toBe('no_womens_anchor');
  });

  it('already at/better than the anchor → no backwards midpoint', async () => {
    // higher_better: 62% is BETTER than the 55% anchor; the old midpoint
    // (58.5) would have asked the player to get worse.
    loadStandingForMetric.mockResolvedValue(
      standing({ metric_id: 'putts_made_5_10ft_pct', player_value: 62, pga_value: 55, pga_delta: 7 }),
    );
    const s = await suggestGoalTarget('putts_made_5_10ft_pct');
    expect(s.hasStanding).toBe(true);
    expect(s.baseline).toBe(62);
    expect(s.pga_value).toBe(55);
    expect(s.suggested_target).toBeNull();
    expect(s.no_target_reason).toBe('already_ahead');
  });

  it('no standing row → ok, hasStanding false, no reason', async () => {
    loadStandingForMetric.mockResolvedValue(null);
    const s = await suggestGoalTarget('scrambling_pct_sand');
    expect(s.ok).toBe(true);
    expect(s.hasStanding).toBe(false);
    expect(s.suggested_target).toBeNull();
    expect(s.no_target_reason).toBeNull();
  });
});
