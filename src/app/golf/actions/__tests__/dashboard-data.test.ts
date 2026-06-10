import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn(() => ({ data: null, error: null }));
const mockLimit = vi.fn(() => ({ data: [], error: null }));
const mockOrder = vi.fn(() => ({ limit: mockLimit, data: [], error: null }));
const mockNot = vi.fn(() => ({ order: mockOrder, limit: mockLimit, data: [], error: null }));
const mockIn = vi.fn(() => ({ order: mockOrder, not: mockNot, data: [], error: null }));
const mockLt = vi.fn(() => ({ order: mockOrder, data: [], error: null }));
const mockGte = vi.fn(() => ({ lt: mockLt, gte: vi.fn(), order: mockOrder, data: [], error: null, limit: mockLimit }));
const mockEq = vi.fn(() => ({
  eq: mockEq,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
  in: mockIn,
  gte: mockGte,
  not: mockNot,
  order: mockOrder,
  limit: mockLimit,
  data: [],
  error: null,
}));
const mockSelect = vi.fn(() => ({
  eq: mockEq,
  in: mockIn,
  gte: mockGte,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
  order: mockOrder,
  not: mockNot,
  limit: mockLimit,
  data: [],
  error: null,
  count: 0,
}));
const mockFrom = vi.fn((_table: string): Record<string, unknown> => ({
  select: mockSelect,
}));
const mockGetUser = vi.fn(() => ({
  data: { user: { id: 'user-1' } },
  error: null,
}));

// ---------------------------------------------------------------------------
// Loose chainable builder for table-aware scenarios (KPI regression tests).
// Every filter/order method returns the chain itself; awaiting the chain
// resolves to its own { data, error, count } because it is not a thenable.
// `.range` slices like PostgREST does, so fetchAllRowsResult pagination is
// exercised for real (a 1001-row dataset takes two pages).
// ---------------------------------------------------------------------------
function createChainableMock({
  data = [] as unknown[],
  singleData = null as unknown,
  maybeSingleData = null as unknown,
} = {}) {
  const chain: Record<string, unknown> = {
    data,
    error: null,
    count: Array.isArray(data) ? data.length : 0,
  };
  for (const method of ['select', 'eq', 'in', 'gte', 'lt', 'not', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.range = vi.fn((from: number, to: number) => ({
    data: data.slice(from, to + 1),
    error: null,
  }));
  chain.single = vi.fn(async () => ({ data: singleData, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error: null }));
  return chain;
}

// Closes audit Finding 8 (D-NEW dashboard RPC mock drift):
// dashboard-data.ts:287-292 calls (supabase as any).rpc('get_coach_today_schedule', ...)
// inside a Promise.all. Without rpc on the mock, the action throws
// `TypeError: supabase.rpc is not a function` and 6/13 specs fail. The mock
// returns an empty schedule by default; tests that need a non-empty schedule
// can mockResolvedValueOnce a richer payload.
const mockRpc = vi.fn(async () => ({ data: [], error: null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
  })),
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import {
  getCoachDashboardData,
  getPlayerDashboardData,
} from '../dashboard-data';

import type {
  CoachDashboardPayload,
  PlayerDashboardPayload,
} from '../dashboard-data';

// ---------------------------------------------------------------------------
// HELPER FUNCTION TESTS (tested via the public API behavior)
// ---------------------------------------------------------------------------

describe('dashboard-data server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all chain mocks to return empty/default
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockLimit.mockReturnValue({ data: [], error: null });
    mockOrder.mockReturnValue({ limit: mockLimit, data: [], error: null });
    mockRpc.mockResolvedValue({ data: [], error: null });
    // Restore the default from() — table-aware tests override it per-test and
    // vi.clearAllMocks() does not undo mockImplementation.
    mockFrom.mockImplementation((_table: string) => ({ select: mockSelect }));
  });

  // ========================================================================
  // getCoachDashboardData
  // ========================================================================
  describe('getCoachDashboardData', () => {
    it('returns correct shape with empty roster', async () => {
      // The function makes several parallel queries. For an empty roster scenario,
      // mock the team result and zero counts.
      mockSingle.mockResolvedValue({
        data: { id: 'team-1', name: 'Test Team', season: '2026', join_code: 'ABC123', created_at: '2026-01-01' },
        error: null,
      });

      const result = await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      expect(result).toBeDefined();
      expect(result.todayEvents).toEqual(expect.any(Array));
      expect(result.stats).toHaveProperty('rosterSize');
      expect(result.stats).toHaveProperty('upcomingEvents');
      expect(result.stats).toHaveProperty('activeQualifiers');
      expect(result.stats).toHaveProperty('teamScoringAverage');
      expect(result.stats).toHaveProperty('previousAverage');
      expect(result.sparklines).toHaveProperty('scoringAvg');
      expect(result.sparklines).toHaveProperty('girPct');
      expect(result.sparklines).toHaveProperty('puttsPerRound');
      expect(result.sparklines).toHaveProperty('rosterSize');
      expect(result.teamPulse).toEqual(expect.objectContaining({
        improving: expect.any(Number),
        stable: expect.any(Number),
        declining: expect.any(Number),
        roundsThisWeek: expect.any(Number),
      }));
      expect(result.actionItems).toEqual(expect.any(Array));
      expect(result.recentRounds).toEqual(expect.any(Array));
      expect(result.topPlayers).toEqual(expect.any(Array));
      expect(result.teamScoringTrend).toEqual(expect.any(Array));
      expect(result.calendarEvents).toEqual(expect.any(Array));
    });

    it('returns null scoring average with no rounds', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 'team-1', name: 'New Team', season: '2026', join_code: 'XYZ', created_at: '2026-01-01' },
        error: null,
      });

      const result = await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      expect(result.stats.teamScoringAverage).toBeNull();
      expect(result.stats.previousAverage).toBeNull();
      expect(result.sparklines.scoringAvg.value).toBeNull();
      expect(result.sparklines.girPct.value).toBeNull();
      expect(result.sparklines.puttsPerRound.value).toBeNull();
    });

    it('returns team name and join code from team query', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 'team-1', name: 'Eagles', season: '2026', join_code: 'EAGLE1', created_at: '2026-01-01' },
        error: null,
      });

      const result = await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      expect(result.teamName).toBe('Eagles');
      expect(result.joinCode).toBe('EAGLE1');
    });

    it('handles null team gracefully', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

      const result = await getCoachDashboardData('coach-1', 'user-1', 'nonexistent');

      expect(result.teamName).toBeNull();
      expect(result.joinCode).toBeNull();
    });

    it('satisfies CoachDashboardPayload type contract', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });
      const result: CoachDashboardPayload = await getCoachDashboardData('c', 'user-1', 't');

      // Verify required fields exist (TypeScript compilation is the real check,
      // but these runtime assertions document the contract)
      expect(result).toHaveProperty('todayEvents');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('sparklines');
      expect(result).toHaveProperty('teamPulse');
      expect(result).toHaveProperty('actionItems');
      expect(result).toHaveProperty('recentRounds');
      expect(result).toHaveProperty('topPlayers');
      expect(result).toHaveProperty('teamScoringTrend');
      expect(result).toHaveProperty('calendarEvents');
      expect(result).toHaveProperty('teamName');
      expect(result).toHaveProperty('joinCode');
    });

    it('sparkline labels are correct', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });
      const result = await getCoachDashboardData('c', 'user-1', 't');

      expect(result.sparklines.scoringAvg.label).toBe('Team Scoring Avg');
      expect(result.sparklines.girPct.label).toBe('Team GIR%');
      expect(result.sparklines.girPct.suffix).toBe('%');
      expect(result.sparklines.puttsPerRound.label).toBe('Team Putts/Rd');
      expect(result.sparklines.rosterSize.label).toBe('Roster Size');
    });
  });

  // ========================================================================
  // getCoachDashboardData — windowed KPI correctness (regression)
  // ========================================================================
  describe('getCoachDashboardData windowed KPIs', () => {
    const member = {
      player: { id: 'p1', first_name: 'Tess', last_name: 'Player', avatar_url: null },
    };

    /** Table-aware from(): rounds come from a real sliceable dataset so the
     *  fetchAllRowsResult pagination in dashboard-data.ts is exercised. */
    function mockCoachTables(roundRows: unknown[]) {
      const roundsChain = createChainableMock({ data: roundRows });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'golf_rounds') return roundsChain;
        if (table === 'golf_team_members') return createChainableMock({ data: [member] });
        if (table === 'golf_teams') {
          return createChainableMock({
            singleData: { id: 'team-1', name: 'Eagles', season: '2026', join_code: 'E1', created_at: '2026-01-01' },
          });
        }
        return createChainableMock();
      });
      return roundsChain;
    }

    it('computes Team Putts/Rd hole-weighted (sum putts ÷ sum holes × 18)', async () => {
      mockCoachTables([
        { id: 'r1', player_id: 'p1', total_score: 72, score_to_par: 0, round_date: '2026-06-01', holes_played: 18, total_putts: 36, total_gir: null, total_gir_possible: null },
        { id: 'r2', player_id: 'p1', total_score: 36, score_to_par: 0, round_date: '2026-05-28', holes_played: 9, total_putts: 9, total_gir: null, total_gir_possible: null },
      ]);

      const result = await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      // (36 + 9) ÷ (18 + 9) × 18 = 30.0 — the old mean of per-round normalized
      // putts (mean of 36 and 18) reported 27.0.
      expect(result.sparklines.puttsPerRound.value).toBe(30);
      // 18-hole rounds only, matching the canonical cache scoring_average
      expect(result.stats.teamScoringAverage).toBe(72);
    });

    it('paginates past the 1000-row PostgREST cap so KPIs and round counts cover the full window', async () => {
      const manyRounds = Array.from({ length: 1001 }, (_, i) => ({
        id: `r${i}`,
        player_id: 'p1',
        total_score: 72,
        score_to_par: 0,
        round_date: '2026-05-01',
        holes_played: 18,
        total_putts: 30,
        total_gir: 10,
        total_gir_possible: 18,
      }));
      const roundsChain = mockCoachTables(manyRounds);

      const result = await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      // recentRounds feeds the "N rounds in window" footnote and the KPI
      // coverage gate — its count must reflect the full windowed set, not a cap.
      expect(result.recentRounds.length).toBe(1001);
      // KPIs computed over all 1001 rounds
      expect(result.stats.teamScoringAverage).toBe(72);
      expect(result.topPlayers[0]?.rounds).toBe(1001);
      expect(result.sparklines.puttsPerRound.value).toBe(30);
      // Both round queries fetched a second page beyond the 1000-row cap
      expect(roundsChain.range).toHaveBeenCalledWith(0, 999);
      expect(roundsChain.range).toHaveBeenCalledWith(1000, 1999);
    });
  });

  // ========================================================================
  // getPlayerDashboardData
  // ========================================================================
  describe('getPlayerDashboardData', () => {
    it('returns correct shape with no rounds', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: null }, error: null });

      const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');

      expect(result).toBeDefined();
      expect(result.todayEvents).toEqual(expect.any(Array));
      expect(result.stats.roundsPlayed).toBe(0);
      expect(result.stats.scoringAverage).toBeNull();
      expect(result.stats.bestRound).toBeNull();
      expect(result.stats.handicap).toBeNull();
    });

    it('returns strokes gained as all nulls (stub)', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: 5.2 }, error: null });

      const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');

      expect(result.strokesGained).toEqual({
        sg_total: null,
        sg_off_tee: null,
        sg_approach: null,
        sg_around_green: null,
        sg_putting: null,
      });
    });

    it('handles null teamId gracefully', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: 3.1 }, error: null });

      const result = await getPlayerDashboardData('player-1', 'user-1', null);

      expect(result.todayEvents).toEqual([]);
      expect(result.teamName).toBeNull();
    });

    it('satisfies PlayerDashboardPayload type contract', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: null }, error: null });
      const result: PlayerDashboardPayload = await getPlayerDashboardData('p', 'user-1', 't');

      expect(result).toHaveProperty('todayEvents');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('sparklines');
      expect(result).toHaveProperty('secondaryStats');
      expect(result).toHaveProperty('strokesGained');
      expect(result).toHaveProperty('actionItems');
      expect(result).toHaveProperty('recentRounds');
      expect(result).toHaveProperty('scoringTrend');
      expect(result).toHaveProperty('teamName');
    });

    it('sparkline labels are correct for player', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: null }, error: null });
      const result = await getPlayerDashboardData('p', 'user-1', 't');

      expect(result.sparklines.scoringAvg.label).toBe('Scoring Avg');
      expect(result.sparklines.girPct.label).toBe('GIR%');
      expect(result.sparklines.girPct.suffix).toBe('%');
      expect(result.sparklines.puttsPerRound.label).toBe('Putts/Rd');
      expect(result.sparklines.handicap.label).toBe('Handicap');
    });

    it('secondary stats default to null with no rounds', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: null }, error: null });
      const result = await getPlayerDashboardData('p', 'user-1', 't');

      expect(result.secondaryStats.firPct).toBeNull();
      expect(result.secondaryStats.scramblingPct).toBeNull();
      expect(result.secondaryStats.birdiesPerRound).toBeNull();
      expect(result.secondaryStats.bestRound).toBeNull();
    });

    it('recentRounds is capped at 5', async () => {
      mockSingle.mockResolvedValue({ data: { handicap: null }, error: null });
      const result = await getPlayerDashboardData('p', 'user-1', 't');

      expect(result.recentRounds.length).toBeLessThanOrEqual(5);
    });
  });

  // ========================================================================
  // getPlayerDashboardData — headline stats from stats cache (regression)
  // ========================================================================
  describe('getPlayerDashboardData headline stats', () => {
    const cacheRow = {
      sg_total_per_round: null,
      sg_tee_per_round: null,
      sg_approach_per_round: null,
      sg_around_green_per_round: null,
      sg_putting_per_round: null,
      scrambling_percentage: 41.2,
      birdies: 120,
      rounds_played: 73,
      scoring_average: 74.38,
      best_round: 66,
      gir_percentage: 64.52,
      driving_accuracy_percentage: 58.33,
      putts_per_round: 31.46,
    };
    // Recent-form fetch returns only 3 rounds (newest first) — deliberately
    // disagreeing with the cache so the assertions prove the source of truth.
    const recentFormRounds = [
      { id: 'r1', course_name: 'Course A', total_score: 70, score_to_par: -2, round_date: '2026-06-05', holes_played: 18, total_putts: 28, total_gir: 12, total_gir_possible: 18 },
      { id: 'r2', course_name: 'Course B', total_score: 75, score_to_par: 3, round_date: '2026-06-03', holes_played: 18, total_putts: 31, total_gir: 10, total_gir_possible: 18 },
      { id: 'r3', course_name: 'Course C', total_score: 80, score_to_par: 8, round_date: '2026-06-01', holes_played: 18, total_putts: 34, total_gir: 8, total_gir_possible: 18 },
    ];

    function mockPlayerTables() {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'golf_rounds') return createChainableMock({ data: recentFormRounds });
        if (table === 'golf_player_stats_cache') return createChainableMock({ maybeSingleData: cacheRow });
        if (table === 'golf_players') return createChainableMock({ singleData: { handicap: 5.2 } });
        if (table === 'golf_teams') {
          return createChainableMock({
            singleData: { id: 'team-1', name: 'Eagles', season: '2026', join_code: 'E1', created_at: '2026-01-01' },
          });
        }
        return createChainableMock();
      });
    }

    it('takes headline values from golf_player_stats_cache, not the capped rounds fetch', async () => {
      mockPlayerTables();
      const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');

      expect(result.stats.roundsPlayed).toBe(73); // cache, not the 3 fetched rounds
      expect(result.stats.scoringAverage).toBe(74.4); // cache 74.38, not mean(70,75,80)=75
      expect(result.stats.bestRound).toBe(66); // cache, not min of fetched (70)
      expect(result.sparklines.scoringAvg.value).toBe(74.4);
      expect(result.sparklines.girPct.value).toBe(64.5); // cache gir_percentage
      expect(result.sparklines.puttsPerRound.value).toBe(31.5); // cache hole-weighted putts_per_round
      expect(result.secondaryStats.firPct).toBe(58.3); // cache driving_accuracy_percentage
      expect(result.secondaryStats.scramblingPct).toBe(41.2);
      expect(result.secondaryStats.bestRound).toBe(66);
      expect(result.secondaryStats.birdiesPerRound).toBe(1.64); // 120 birdies / 73 rounds
    });

    it('recent-form widgets still come from the recent rounds fetch', async () => {
      mockPlayerTables();
      const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');

      // Sparkline series: oldest → newest from the fetched rounds
      expect(result.sparklines.scoringAvg.sparkline).toEqual([80, 75, 70]);
      expect(result.recentRounds.length).toBe(3);
      expect(result.recentRounds[0]?.course_name).toBe('Course A');
      expect(result.scoringTrend.length).toBe(3);
    });
  });
});
