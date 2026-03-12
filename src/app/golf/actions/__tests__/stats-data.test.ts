import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase with a chainable query builder
// ---------------------------------------------------------------------------

function createChainableMock({
  data = [] as unknown[],
  error = null as unknown,
  singleData = null as unknown,
  maybeSingleData = null as unknown,
} = {}) {
  const chain: Record<string, unknown> = {
    data,
    error,
    count: Array.isArray(data) ? data.length : 0,
  };
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'not', 'order', 'limit', 'filter'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => ({ data: singleData, error }));
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error }));
  return chain;
}

let mockRoundsData: unknown[] = [];
let mockCoachData: unknown = null;
let mockMembershipData: unknown = null;

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_players') {
    return createChainableMock({
      singleData: { id: 'player-test', user_id: 'user-1' },
    });
  }

  if (table === 'golf_coaches') {
    return createChainableMock({
      maybeSingleData: mockCoachData,
    });
  }

  if (table === 'golf_team_members') {
    return createChainableMock({
      maybeSingleData: mockMembershipData,
    });
  }

  return createChainableMock({ data: mockRoundsData });
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

vi.mock('@/lib/utils/golf-stats-calculator-shots', () => ({
  calculateStatsFromShots: vi.fn(() => ({
    roundsPlayed: 0,
    holesPlayed: 0,
    scoringAverage: null,
    bestRound: null,
    worstRound: null,
    girPercentage: null,
    fairwayPercentage: null,
    puttsPerRound: null,
    scramblingPercentage: null,
  })),
}));

vi.mock('@/lib/golf/round-type-utils', () => ({
  roundTypeFromDb: vi.fn((type: string) => type),
}));

vi.mock('@/lib/golf/strokes-gained', () => ({
  generateStatisticalStrengthsWeaknesses: vi.fn(() => ({
    strengths: [],
    weaknesses: [],
  })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  getStatsSummary,
  getFilterOptions,
} from '../stats-data';

import type { SummaryStatsResponse, FilterOptions } from '../stats-data-types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stats-data server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoundsData = [];
    mockCoachData = null;
    mockMembershipData = null;
  });

  // ========================================================================
  // getStatsSummary
  // ========================================================================
  describe('getStatsSummary', () => {
    it('returns empty summary when no rounds exist', async () => {
      const result = await getStatsSummary('player-1');

      expect(result.summary.roundsPlayed).toBe(0);
      expect(result.summary.scoringAverage).toBeNull();
      expect(result.summary.bestRound).toBeNull();
      expect(result.summary.worstRound).toBeNull();
      expect(result.summary.girPercentage).toBeNull();
      expect(result.summary.fairwayPercentage).toBeNull();
      expect(result.summary.puttsPerRound).toBeNull();
      expect(result.summary.scramblingPercentage).toBeNull();
      expect(result.rounds).toEqual([]);
    });

    it('returns correct SummaryStatsResponse shape', async () => {
      const result: SummaryStatsResponse = await getStatsSummary('player-1');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('rounds');
      expect(result.summary).toHaveProperty('roundsPlayed');
      expect(result.summary).toHaveProperty('holesPlayed');
      expect(result.summary).toHaveProperty('scoringAverage');
      expect(result.summary).toHaveProperty('bestRound');
      expect(result.summary).toHaveProperty('worstRound');
      expect(result.summary).toHaveProperty('girPercentage');
      expect(result.summary).toHaveProperty('fairwayPercentage');
      expect(result.summary).toHaveProperty('puttsPerRound');
      expect(result.summary).toHaveProperty('scramblingPercentage');
    });

    it('queries golf_rounds table', async () => {
      await getStatsSummary('player-123');
      expect(mockFrom).toHaveBeenCalledWith('golf_rounds');
    });

    it('returns empty summary with no filter', async () => {
      const result = await getStatsSummary('player-1', undefined);
      expect(result.summary.roundsPlayed).toBe(0);
    });

    it('applies preset filter for last5 without crashing', async () => {
      const result = await getStatsSummary('player-1', { preset: 'last5' });
      expect(result.summary.roundsPlayed).toBe(0);
    });

    it('applies preset filter for tournaments without crashing', async () => {
      const result = await getStatsSummary('player-1', { preset: 'tournaments' });
      expect(result.summary.roundsPlayed).toBe(0);
    });

    it('applies custom date range filter without crashing', async () => {
      const result = await getStatsSummary('player-1', {
        preset: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });
      expect(result.summary.roundsPlayed).toBe(0);
    });

    it('applies season filter without crashing', async () => {
      const result = await getStatsSummary('player-1', { season: 2025 });
      expect(result.summary.roundsPlayed).toBe(0);
    });

    it('applies course name filter without crashing', async () => {
      const result = await getStatsSummary('player-1', { courseName: 'Pine Valley' });
      expect(result.summary.roundsPlayed).toBe(0);
    });

    it('calculates summary stats correctly when rounds exist', async () => {
      const roundsData = [
        { id: 'r1', round_date: '2026-02-01', course_name: 'TPC', round_type: 'practice', total_score: 72, score_to_par: 0, total_fairways_hit: 10, total_fairways: 14, total_gir: 12, total_gir_possible: 18, total_putts: 30, holes_played: 18 },
        { id: 'r2', round_date: '2026-02-05', course_name: 'TPC', round_type: 'practice', total_score: 74, score_to_par: 2, total_fairways_hit: 8, total_fairways: 14, total_gir: 10, total_gir_possible: 18, total_putts: 32, holes_played: 18 },
      ];

      mockRoundsData = roundsData;

      const result = await getStatsSummary('player-1');

      expect(result.summary.roundsPlayed).toBe(2);
      expect(result.summary.scoringAverage).toBe(73);
      expect(result.summary.bestRound).toBe(72);
      expect(result.summary.worstRound).toBe(74);
      expect(result.summary.holesPlayed).toBe(36);
      // GIR: (12+10)/(18+18) = 22/36 = 61.1%
      expect(result.summary.girPercentage).toBe(61.1);
      // Fairway: (10+8)/(14+14) = 18/28 = 64.3%
      expect(result.summary.fairwayPercentage).toBe(64.3);
      // Putts: (30+32)/2 = 31.0
      expect(result.summary.puttsPerRound).toBe(31);
    });
  });

  // ========================================================================
  // getFilterOptions
  // ========================================================================
  describe('getFilterOptions', () => {
    it('returns empty options when no rounds exist', async () => {
      const result = await getFilterOptions('player-1');
      const expected: FilterOptions = { courses: [], seasons: [], roundTypes: [] };
      expect(result).toEqual(expected);
    });

    it('queries golf_rounds table for filter data', async () => {
      await getFilterOptions('player-xyz');
      expect(mockFrom).toHaveBeenCalledWith('golf_rounds');
    });
  });
});

// ---------------------------------------------------------------------------
// Preset limit behavior (tested via getStatsSummary boundary)
// ---------------------------------------------------------------------------

describe('stats-data preset limits behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoundsData = [];
    mockCoachData = null;
    mockMembershipData = null;
  });

  it('last5 preset limits results to 5', async () => {
    const result = await getStatsSummary('p', { preset: 'last5' });
    expect(result.rounds.length).toBeLessThanOrEqual(5);
  });

  it('last10 preset limits results to 10', async () => {
    const result = await getStatsSummary('p', { preset: 'last10' });
    expect(result.rounds.length).toBeLessThanOrEqual(10);
  });

  it('last20 preset limits results to 20', async () => {
    const result = await getStatsSummary('p', { preset: 'last20' });
    expect(result.rounds.length).toBeLessThanOrEqual(20);
  });

  it('last5 actually trims results when more data is returned', async () => {
    const manyRounds = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`, round_date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      course_name: 'TPC', round_type: 'practice',
      total_score: 72 + i, score_to_par: i,
      total_fairways_hit: null, total_fairways: null,
      total_gir: null, total_gir_possible: null,
      total_putts: null, holes_played: 18,
    }));

    mockRoundsData = manyRounds;

    const result = await getStatsSummary('p', { preset: 'last5' });
    expect(result.rounds.length).toBe(5);
    expect(result.summary.roundsPlayed).toBe(5);
  });
});
