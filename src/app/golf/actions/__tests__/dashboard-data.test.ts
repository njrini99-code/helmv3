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
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));
const mockGetUser = vi.fn(() => ({
  data: { user: { id: 'user-1' } },
  error: null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
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
});
