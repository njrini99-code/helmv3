import { describe, it, expect, vi } from 'vitest';

/**
 * ============================================================================
 * player-fingerprint.ts — Tee / Short game chart_data (Wave 2)
 * ----------------------------------------------------------------------------
 * `buildTeeSection` and `buildShortGameSection` used to always emit
 * `chart_data: null` — the "Fingerprint charts" grammar (`buildMissPills` /
 * `buildPuttingBars`) never covered these two sections, so the UI's
 * `SectionChart` silently rendered nothing under Tee and Short game no
 * matter how much stats-cache data existed. This pins:
 *   - Tee: a fairway hit/miss pill chart (`kind: 'pills'`) built from
 *     `fairways_hit` / `fairways_total` (already-read columns).
 *   - Short game: an up-and-down / scrambling / sand-save bar chart
 *     (`kind: 'bars'`) built from the three already-read percentage columns.
 *   - Both stay `null` (never a fabricated chart) when the underlying data
 *     is absent.
 * ========================================================================== */

// ---------------------------------------------------------------------------
// Minimal chainable Supabase mock (mirrors shot-analytics.test.ts's pattern).
// ---------------------------------------------------------------------------
function createChain(data: unknown, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const methods = ['select', 'eq', 'not', 'order', 'limit'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  // `golf_rounds` is awaited directly (no terminal call) after `.limit()`.
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

let statsRow: Record<string, unknown> | null = null;

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_players') {
    return createChain({ id: 'player-1', first_name: 'Test', last_name: 'Player' });
  }
  if (table === 'golf_team_members') {
    return createChain(null);
  }
  if (table === 'golf_player_stats_cache') {
    return createChain(statsRow);
  }
  if (table === 'golf_rounds') {
    return createChain([]);
  }
  return createChain([]);
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } }, error: null })) },
  })),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'coach' })),
}));

vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: vi.fn(async () => []),
}));

vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved:
    <Args extends unknown[], R>(_name: string, _opts: unknown, fn: (...args: Args) => Promise<R>) =>
    (...args: Args) =>
      fn(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

const { getPlayerFingerprint } = await import('./player-fingerprint');

function baseStatsRow(overrides: Record<string, unknown> = {}) {
  return {
    rounds_in_calculation: 8,
    scoring_average: 74,
    scoring_average_vs_par: 2,
    par3_average: null,
    par4_average: null,
    par5_average: null,
    driving_distance_average: 260,
    driving_accuracy_percentage: 60,
    fairways_hit: null,
    fairways_total: null,
    gir_percentage: null,
    greens_hit: null,
    greens_total: null,
    approach_proximity_average: null,
    approach_miss_left_pct: null,
    approach_miss_right_pct: null,
    approach_miss_short_pct: null,
    approach_miss_long_pct: null,
    scrambling_percentage: null,
    sand_save_percentage: null,
    up_and_down_percentage: null,
    putts_per_round: null,
    putts_per_gir: null,
    one_putt_percentage: null,
    three_putt_percentage: null,
    putt_make_pct_0_3ft: null,
    putt_make_pct_3_5ft: null,
    putt_make_pct_5_10ft: null,
    putt_make_pct_10_15ft: null,
    putt_make_pct_15_20ft: null,
    putt_make_pct_20_plus_ft: null,
    sg_total_per_round: null,
    sg_tee_per_round: null,
    sg_approach_per_round: null,
    sg_around_green_per_round: null,
    sg_putting_per_round: null,
    last_5_average: null,
    last_10_average: null,
    improvement_trend: null,
    trend_direction: null,
    last_round_date: null,
    ...overrides,
  };
}

describe('player-fingerprint — Tee section chart_data', () => {
  it('builds a fairway hit/miss pill chart from fairways_hit + fairways_total', async () => {
    statsRow = baseStatsRow({ fairways_hit: 9, fairways_total: 14 });
    const fp = await getPlayerFingerprint('player-1');
    expect(fp).not.toBeNull();
    const chart = fp!.sections.tee.chart_data;
    expect(chart).not.toBeNull();
    expect(chart?.kind).toBe('pills');
    if (chart?.kind === 'pills') {
      expect(chart.pills).toEqual([
        { label: 'Hit', value: '64%', tone: 'neutral' },
        { label: 'Missed', value: '36%', tone: 'neutral' },
      ]);
    }
  });

  it('stays null (never fabricated) when fairway counts are absent', async () => {
    statsRow = baseStatsRow({ fairways_hit: null, fairways_total: null });
    const fp = await getPlayerFingerprint('player-1');
    expect(fp!.sections.tee.chart_data).toBeNull();
  });

  it('stays null when fairways_total is zero (no divide-by-zero fabrication)', async () => {
    statsRow = baseStatsRow({ fairways_hit: 0, fairways_total: 0 });
    const fp = await getPlayerFingerprint('player-1');
    expect(fp!.sections.tee.chart_data).toBeNull();
  });
});

describe('player-fingerprint — Short game section chart_data', () => {
  it('builds an up-and-down/scrambling/sand-save bar chart', async () => {
    statsRow = baseStatsRow({
      up_and_down_percentage: 55,
      scrambling_percentage: 48,
      sand_save_percentage: 40,
    });
    const fp = await getPlayerFingerprint('player-1');
    const chart = fp!.sections.short_game.chart_data;
    expect(chart).not.toBeNull();
    expect(chart?.kind).toBe('bars');
    if (chart?.kind === 'bars') {
      expect(chart.bars).toEqual([
        { label: 'Up-and-down', value: 55, max: 100 },
        { label: 'Scrambling', value: 48, max: 100 },
        { label: 'Sand saves', value: 40, max: 100 },
      ]);
    }
  });

  it('renders bars for whichever short-game columns exist, honestly zero-filling the rest', async () => {
    statsRow = baseStatsRow({
      up_and_down_percentage: null,
      scrambling_percentage: 52,
      sand_save_percentage: null,
    });
    const fp = await getPlayerFingerprint('player-1');
    const chart = fp!.sections.short_game.chart_data;
    expect(chart?.kind).toBe('bars');
    if (chart?.kind === 'bars') {
      expect(chart.bars.find((b) => b.label === 'Scrambling')).toEqual({
        label: 'Scrambling',
        value: 52,
        max: 100,
      });
    }
  });

  it('stays null when no short-game columns are populated', async () => {
    statsRow = baseStatsRow({
      up_and_down_percentage: null,
      scrambling_percentage: null,
      sand_save_percentage: null,
    });
    const fp = await getPlayerFingerprint('player-1');
    expect(fp!.sections.short_game.chart_data).toBeNull();
  });
});
