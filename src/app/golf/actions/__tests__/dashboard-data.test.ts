import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeScoringTrendFromRounds } from '@/lib/golf/scoring-trend';

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn(() => ({ data: null, error: null }));
const mockLimit = vi.fn(() => ({ data: [], error: null }));
const mockOrder = vi.fn(() => ({ limit: mockLimit, data: [], error: null }));
const mockNot = vi.fn(() => ({ order: mockOrder, limit: mockLimit, data: [], error: null }));
const mockIn = vi.fn(() => ({ order: mockOrder, not: mockNot, limit: mockLimit, data: [], error: null }));
const mockLt = vi.fn(() => ({ order: mockOrder, data: [], error: null }));
const mockGte = vi.fn(() => ({ lt: mockLt, gte: vi.fn(), order: mockOrder, data: [], error: null, limit: mockLimit }));
// Team-scoped event reads chain `.neq('event_type', 'class')` so a player's
// synced class meetings don't count as the team's schedule.
const mockNeq = vi.fn((_column?: string, _value?: unknown) => ({
  eq: mockEq,
  neq: mockNeq,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
  in: mockIn,
  gte: mockGte,
  lt: mockLt,
  not: mockNot,
  order: mockOrder,
  limit: mockLimit,
  data: [],
  error: null,
  count: 0,
}));
const mockEq = vi.fn(() => ({
  eq: mockEq,
  neq: mockNeq,
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
  neq: mockNeq,
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
  for (const method of ['select', 'eq', 'neq', 'in', 'gte', 'lt', 'not', 'order', 'limit']) {
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

// Both payloads now gate the caller-supplied playerId / teamId with the shared
// ownership helpers before reading anything. Those helpers have their own
// suite (src/lib/auth/__tests__); here they are stubbed to "allowed" so these
// specs keep testing payload shape, and the denial path is asserted explicitly.
type MockVerifyResult = { allowed: boolean; reason: 'self' | 'coach' | 'denied' | 'unavailable' };
const mockVerifyPlayerAccess = vi.fn(async (): Promise<MockVerifyResult> => ({ allowed: true, reason: 'self' }));
const mockVerifyTeamAccess = vi.fn(async (): Promise<MockVerifyResult> => ({ allowed: true, reason: 'coach' }));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: () => mockVerifyPlayerAccess(),
  verifyTeamAccess: () => mockVerifyTeamAccess(),
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
    it('excludes synced class meetings from the team event count and list', async () => {
      // A player's class schedule lives in golf_events on the TEAM calendar
      // (that is what puts it on the calendar's "All" lens), so every
      // team-scoped read has to say "team events only" or the dashboard counts
      // one player's semester as the team's season — 192 upcoming on a team
      // with 22 (coach report, 2026-08-05).
      mockSingle.mockResolvedValue({
        data: { id: 'team-1', name: 'Test Team', season: '2026', join_code: 'ABC123', created_at: '2026-01-01' },
        error: null,
      });

      await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      const classFilters = mockNeq.mock.calls.filter(
        (args) => args[0] === 'event_type' && args[1] === 'class',
      );
      // Both the "Upcoming events" count and the next-20 calendar list.
      expect(classFilters.length).toBeGreaterThanOrEqual(2);
    });

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

    it('refuses a teamId the caller does not staff', async () => {
      mockVerifyTeamAccess.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
      await expect(getCoachDashboardData('coach-1', 'user-1', 'someone-elses-team')).rejects.toThrow('Unauthorized');
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

    // ──────────────────────────────────────────────────────────────────────
    // Team Pulse parity (#945) — before this fix, Team Pulse reimplemented
    // its own split-half-of-5 classifier and disagreed with the Players
    // roster / Team Stats trajectory tile (both powered by the canonical
    // `computeScoringTrendFromRounds`) for the SAME underlying rounds. This
    // fixture feeds two players' round histories through BOTH paths — the
    // dashboard action and the canonical function directly — and asserts
    // they land on the identical verdict.
    // ──────────────────────────────────────────────────────────────────────
    it('Team Pulse classifies per-player trend via the canonical computeScoringTrendFromRounds — parity with the roster/Team Stats classifier', async () => {
      // Rising: 5 recent rounds well below the 3 previous rounds (improving).
      const risingRounds = [
        { id: 'r1', player_id: 'p1', total_score: 68, score_to_par: -4, round_date: '2026-07-10', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r2', player_id: 'p1', total_score: 69, score_to_par: -3, round_date: '2026-07-08', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r3', player_id: 'p1', total_score: 70, score_to_par: -2, round_date: '2026-07-06', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r4', player_id: 'p1', total_score: 71, score_to_par: -1, round_date: '2026-07-04', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r5', player_id: 'p1', total_score: 70, score_to_par: -2, round_date: '2026-07-02', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r6', player_id: 'p1', total_score: 80, score_to_par: 8, round_date: '2026-06-20', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r7', player_id: 'p1', total_score: 82, score_to_par: 10, round_date: '2026-06-18', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 'r8', player_id: 'p1', total_score: 81, score_to_par: 9, round_date: '2026-06-16', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
      ];
      // Falling: 5 recent rounds well above the 3 previous rounds (declining).
      const fallingRounds = [
        { id: 's1', player_id: 'p2', total_score: 82, score_to_par: 10, round_date: '2026-07-10', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's2', player_id: 'p2', total_score: 83, score_to_par: 11, round_date: '2026-07-08', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's3', player_id: 'p2', total_score: 81, score_to_par: 9, round_date: '2026-07-06', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's4', player_id: 'p2', total_score: 84, score_to_par: 12, round_date: '2026-07-04', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's5', player_id: 'p2', total_score: 80, score_to_par: 8, round_date: '2026-07-02', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's6', player_id: 'p2', total_score: 70, score_to_par: -2, round_date: '2026-06-20', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's7', player_id: 'p2', total_score: 71, score_to_par: -1, round_date: '2026-06-18', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
        { id: 's8', player_id: 'p2', total_score: 69, score_to_par: -3, round_date: '2026-06-16', holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null },
      ];
      const roundsChain = createChainableMock({ data: [...risingRounds, ...fallingRounds] });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'golf_rounds') return roundsChain;
        if (table === 'golf_team_members') {
          return createChainableMock({
            data: [
              { player: { id: 'p1', first_name: 'Rising', last_name: 'Star', avatar_url: null } },
              { player: { id: 'p2', first_name: 'Falling', last_name: 'Behind', avatar_url: null } },
            ],
          });
        }
        if (table === 'golf_teams') {
          return createChainableMock({
            singleData: { id: 'team-1', name: 'Eagles', season: '2026', join_code: 'E1', created_at: '2026-01-01' },
          });
        }
        return createChainableMock();
      });

      // Parity oracle: the SAME canonical function the Players roster table
      // and Team Stats page route through, fed the SAME per-player fixtures.
      const risingVerdict = computeScoringTrendFromRounds(risingRounds);
      const fallingVerdict = computeScoringTrendFromRounds(fallingRounds);
      expect(risingVerdict.hasSignal && risingVerdict.trend).toBe('improving');
      expect(fallingVerdict.hasSignal && fallingVerdict.trend).toBe('declining');

      const result = await getCoachDashboardData('coach-1', 'user-1', 'team-1');

      expect(result.teamPulse.improving).toBe(1);
      expect(result.teamPulse.declining).toBe(1);
      expect(result.teamPulse.stable).toBe(0);
      expect(result.teamPulse.topMover?.name).toBe('Rising Star');
      expect(result.teamPulse.topMover?.delta).toBeCloseTo(-risingVerdict.delta, 1);
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

    it('refuses a playerId the caller does not own or coach', async () => {
      mockVerifyPlayerAccess.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
      await expect(getPlayerDashboardData('teammate-9', 'user-1', 'team-1')).rejects.toThrow('Unauthorized');
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
