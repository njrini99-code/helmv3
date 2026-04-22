/**
 * Tests for pressure-gap Tier-1 insight generator (Group C4).
 *
 * Covers:
 *  1. Below min practice threshold → no emit.
 *  2. Below min competitive threshold → no emit.
 *  3. Gap under 1.5 strokes → no emit.
 *  4. Notable gap → emit with correct signature, comparison_source=your_baseline.
 *  5. Dedup on second run.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockRows, supabaseStub, upsertInsightMock, attachDrillsMock } = vi.hoisted(() => {
  const mockRows: { current: unknown[] } = { current: [] };

  function buildChain() {
    const thenable: Record<string, unknown> = {};
    Object.assign(thenable, {
      select: vi.fn(() => thenable),
      eq: vi.fn(() => thenable),
      gte: vi.fn(() => thenable),
      not: vi.fn(() => thenable),
      order: vi.fn(() => thenable),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      single: vi.fn(() =>
        Promise.resolve({ data: { id: 'new-insight-id' }, error: null }),
      ),
      insert: vi.fn(() => thenable),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      in: vi.fn(() => Promise.resolve({ data: [], error: null })),
      overlaps: vi.fn(() => thenable),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: mockRows.current, error: null }),
    });
    return thenable;
  }

  const upsertInsightMock = vi.fn<(supabase: unknown, input: unknown) => Promise<string>>(
    async () => 'new-insight-id',
  );
  const attachDrillsMock = vi.fn<
    (supabase: unknown, insightId: string, category: string, tags: string[]) => Promise<void>
  >(async () => undefined);

  return {
    mockRows,
    supabaseStub: { client: { from: vi.fn(() => buildChain()) } },
    upsertInsightMock,
    attachDrillsMock,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => supabaseStub.client),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));
vi.mock('@/lib/coachhelm/v2/insights/upsert', () => ({
  upsertInsight: upsertInsightMock,
  attachDrills: attachDrillsMock,
}));

import {
  generatePressureGapInsight,
  aggregateByRoundType,
  __internal,
} from '@/lib/coachhelm/v2/mining/pressure-gap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RoundFixture {
  round_type: string;
  total_score: number;
  round_date?: string;
}

function round(r: RoundFixture) {
  return {
    round_type: r.round_type,
    total_score: r.total_score,
    round_date: r.round_date ?? '2026-04-01',
  };
}

function many(n: number, r: RoundFixture) {
  return Array.from({ length: n }, () => round(r));
}

// ---------------------------------------------------------------------------
// Unit test on aggregator
// ---------------------------------------------------------------------------

describe('aggregateByRoundType', () => {
  it('buckets practice / tournament / qualifier correctly', () => {
    const rows = [
      ...many(3, { round_type: 'practice', total_score: 72 }),
      ...many(2, { round_type: 'tournament', total_score: 75 }),
      ...many(1, { round_type: 'qualifier', total_score: 76 }),
    ];
    const agg = aggregateByRoundType(rows);
    expect(agg.practiceCount).toBe(3);
    expect(agg.practiceAvg).toBeCloseTo(72);
    expect(agg.tournamentCount).toBe(2);
    expect(agg.tournamentAvg).toBeCloseTo(75);
    expect(agg.qualifierCount).toBe(1);
    expect(agg.competitiveCount).toBe(3);
    expect(agg.competitiveAvg).toBeCloseTo((75 + 75 + 76) / 3);
  });
});

// ---------------------------------------------------------------------------
// Generator tests
// ---------------------------------------------------------------------------

describe('generatePressureGapInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.current = [];
  });

  it('emits nothing when practice rounds < 5', async () => {
    mockRows.current = [
      ...many(4, { round_type: 'practice', total_score: 72 }),
      ...many(4, { round_type: 'tournament', total_score: 76 }),
    ];
    await generatePressureGapInsight('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits nothing when competitive rounds < 4', async () => {
    mockRows.current = [
      ...many(8, { round_type: 'practice', total_score: 72 }),
      ...many(3, { round_type: 'tournament', total_score: 76 }),
    ];
    await generatePressureGapInsight('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits nothing when gap is below 1.5 strokes', async () => {
    mockRows.current = [
      ...many(8, { round_type: 'practice', total_score: 72 }),
      ...many(4, { round_type: 'tournament', total_score: 73 }), // gap 1.0
    ];
    await generatePressureGapInsight('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits pressure-gap insight with notable gap and correct evidence', async () => {
    mockRows.current = [
      ...many(10, { round_type: 'practice', total_score: 72 }),
      ...many(5, { round_type: 'tournament', total_score: 76 }),
      ...many(5, { round_type: 'qualifier', total_score: 75 }),
    ];
    await generatePressureGapInsight('player-1');
    const call = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:pressure_gap:practice_vs_tournament';
    });
    expect(call).toBeDefined();
    const input = call![1] as {
      category: string;
      evidence: {
        comparison_source: string;
        comparison_value: number;
        your_value: number;
        sample_n: number;
        window_days: number;
        strokes_impact: number;
        detail?: {
          practice_count: number;
          tournament_count: number;
          qualifier_count: number;
          competitive_count: number;
          gap_strokes: number;
          qualifier_avg: number | null;
        };
      };
      drill_tags?: string[];
    };
    expect(input.category).toBe('pressure');
    expect(input.evidence.comparison_source).toBe('your_baseline');
    expect(input.evidence.comparison_value).toBeCloseTo(72);
    // Competitive avg = mean(5×76, 5×75) = 75.5
    expect(input.evidence.your_value).toBeCloseTo(75.5);
    expect(input.evidence.sample_n).toBe(10);
    expect(input.evidence.window_days).toBe(__internal.WINDOW_DAYS);
    expect(input.evidence.strokes_impact).toBeCloseTo(3.5);
    expect(input.evidence.detail?.gap_strokes).toBeCloseTo(3.5);
    expect(input.evidence.detail?.qualifier_avg).toBeCloseTo(75);
    expect(input.drill_tags).toEqual(
      expect.arrayContaining([
        'pressure',
        'tournament_simulation',
        'pre_shot_routine',
      ]),
    );
  });

  it('re-run with same data produces another upsert call (dedup handled by upsertInsight)', async () => {
    mockRows.current = [
      ...many(10, { round_type: 'practice', total_score: 72 }),
      ...many(5, { round_type: 'tournament', total_score: 76 }),
    ];
    await generatePressureGapInsight('player-1');
    await generatePressureGapInsight('player-1');
    const sigs = upsertInsightMock.mock.calls
      .map((c) => (c[1] as { signature: string }).signature)
      .filter((s) => s === 'player-1:pressure_gap:practice_vs_tournament');
    expect(sigs.length).toBe(2);
  });
});
