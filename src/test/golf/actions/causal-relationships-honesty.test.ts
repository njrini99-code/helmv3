import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Deep audit defect 3 + rows 33/34 (2026-09-28): the read path filtered
// is_active only, so a dormant player's rows stayed live forever (144 of 240
// active rows belonged to 8 players with no round in 60 days), and rows written
// under the old |r| >= 0.3 gate kept showing after the gate changed. The read
// now hides rows that fail the honest-correlation gate, rows the engine has not
// re-confirmed within MAX_ROW_AGE_DAYS, and every row of a player with no
// completed non-test round within ACTIVE_PLAYER_WINDOW_DAYS.
// ---------------------------------------------------------------------------

const { state, fromMock } = vi.hoisted(() => {
  const state = {
    causalRows: [] as Array<Record<string, unknown>>,
    recentRounds: [] as Array<Record<string, unknown>>,
    roundsFilters: [] as Array<[string, unknown]>,
  };

  function causalBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => Promise.resolve({ data: state.causalRows, error: null });
    return b;
  }

  function roundsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, v: unknown) => {
      state.roundsFilters.push([col, v]);
      return b;
    };
    b.gte = (col: string, v: unknown) => {
      state.roundsFilters.push([`gte:${col}`, v]);
      return b;
    };
    b.limit = () => Promise.resolve({ data: state.recentRounds, error: null });
    return b;
  }

  const fromMock = vi.fn((table: string) =>
    table === 'golf_rounds' ? roundsBuilder() : causalBuilder(),
  );
  return { state, fromMock };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: fromMock,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: async () => ({ allowed: true }),
  verifyTeamAccess: async () => ({ allowed: true }),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: (...a: unknown[]) => unknown) => fn,
}));

import { getPlayerCausalRelationships } from '@/app/golf/actions/causal-relationships';

const NOW = new Date('2026-09-28T12:00:00.000Z');

function gated(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rel-1',
    player_id: 'p1',
    cause: 'greens_in_regulation',
    cause_metric: 'total_gir',
    effect: 'putting_volume',
    effect_metric: 'total_putts',
    relationship_type: 'bidirectional',
    strength: 0.62,
    confidence: 0.98,
    mechanism: 'Putt counts can be confounded by greens hit',
    dose_response: false,
    intervention_potential: 0.6,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-27T00:00:00.000Z',
    evidence: { method: 'correlation_v1', correlation: 0.62, sampleN: 18, pValue: 0.006, qValue: 0.012 },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.causalRows = [];
  state.recentRounds = [{ id: 'round-recent' }];
  state.roundsFilters = [];
  fromMock.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('getPlayerCausalRelationships — honest-correlation read gates', () => {
  it('returns a gated, fresh row with its SIGN, n, p and q', async () => {
    state.causalRows = [gated({ evidence: { method: 'correlation_v1', correlation: -0.62, sampleN: 18, pValue: 0.006, qValue: 0.012 } })];
    const rows = await getPlayerCausalRelationships('p1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.correlation).toBe(-0.62);
    expect(rows[0]!.sample_n).toBe(18);
    expect(rows[0]!.p_value).toBe(0.006);
    expect(rows[0]!.q_value).toBe(0.012);
  });

  it('hides a pre-gate row (no correlation_v1 evidence)', async () => {
    state.causalRows = [gated({ evidence: { temporalPrecedence: true, naturalExperiments: [] } })];
    expect(await getPlayerCausalRelationships('p1')).toEqual([]);
  });

  it('hides a row that no longer passes the gate (q too high, or n < 15)', async () => {
    state.causalRows = [
      gated({ id: 'a', evidence: { method: 'correlation_v1', correlation: 0.5, sampleN: 18, pValue: 0.04, qValue: 0.08 } }),
      gated({ id: 'b', cause: 'driving_accuracy', evidence: { method: 'correlation_v1', correlation: 0.8, sampleN: 12, pValue: 0.001, qValue: 0.002 } }),
    ];
    expect(await getPlayerCausalRelationships('p1')).toEqual([]);
  });

  it('hides a score-arithmetic row even if its evidence passes', async () => {
    state.causalRows = [gated({ cause: 'putting', cause_metric: 'total_putts', effect: 'scoring', effect_metric: 'score_to_par' })];
    expect(await getPlayerCausalRelationships('p1')).toEqual([]);
  });

  it('hides a row the engine has not re-confirmed within 60 days', async () => {
    state.causalRows = [gated({ updated_at: '2026-07-01T00:00:00.000Z' })];
    expect(await getPlayerCausalRelationships('p1')).toEqual([]);
  });

  it('hides every row of a player with no completed non-test round in 60 days', async () => {
    state.causalRows = [gated()];
    state.recentRounds = [];
    expect(await getPlayerCausalRelationships('p1')).toEqual([]);
    // And the check is the right one: completed, non-test, within the window.
    expect(state.roundsFilters).toContainEqual(['status', 'completed']);
    expect(state.roundsFilters).toContainEqual(['is_test', false]);
    expect(state.roundsFilters).toContainEqual(['gte:round_date', '2026-07-30']);
  });

  it('includeInactive (history view) skips the gates', async () => {
    state.causalRows = [gated({ evidence: {} , updated_at: '2026-04-01T00:00:00.000Z' })];
    state.recentRounds = [];
    const rows = await getPlayerCausalRelationships('p1', { includeInactive: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.correlation).toBeNull();
  });
});
