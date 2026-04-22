/**
 * Tests for putt-analytics Tier-1 insight generators (Group A).
 *
 * Covers:
 *  1. attempts < 5 → no insight emitted
 *  2. Notable gap → insight emitted with correct signature + evidence shape
 *  3. Negligible gap (< 5pt) → no insight
 *  4. Two consecutive runs with same data → second run refreshes (no dup row)
 *  5. Drill tags match expected category
 *  6. Miss-bias generator: threshold + bias direction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock calls are hoisted to the top of the file BEFORE any imports run,
// so any variables the factories close over must be declared via
// `vi.hoisted` to also be hoisted. Otherwise the factory executes before
// the variable binding exists and we get a TDZ ReferenceError.
const hoisted = vi.hoisted(() => {
  const mockRows: { current: unknown[] } = { current: [] };
  // Explicit signatures so `mock.calls[i][1]` has a non-empty tuple type
  // (instead of inferring `[]` / `never`).
  const upsertInsightMock = vi.fn(
    async (_client: unknown, _input: unknown): Promise<string> =>
      'new-insight-id',
  );
  const attachDrillsMock = vi.fn(
    async (
      _client: unknown,
      _insightId: string,
      _category: string,
      _tags: string[],
    ): Promise<void> => undefined,
  );
  const logServerErrorMock = vi.fn(
    async (_message: string, _context: unknown): Promise<void> => undefined,
  );

  function makeSupabaseStub() {
    // 2-step fetcher: golf_rounds → golf_shots → putt_details. Each query
    // returns a tailored shape so aggregation tests still operate on the
    // same `mockRows.current` putt-rows fixture.
    const builder: Record<string, unknown> = {};
    builder.from = (table: string) => {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
        single: () =>
          Promise.resolve({ data: { id: 'new-insight-id' }, error: null }),
        insert: () => chain,
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        upsert: () => Promise.resolve({ data: null, error: null }),
        overlaps: () => chain,
        then: (resolve: (v: unknown) => unknown) => {
          if (table === 'golf_rounds') {
            // Fixed synthetic round so step 1 succeeds.
            return resolve({
              data: [{ id: 'round-1', round_date: '2026-04-01' }],
              error: null,
            });
          }
          if (table === 'golf_shots') {
            // One synthetic shot per putt row, sharing the round id.
            const shots = (mockRows.current ?? []).map((_r, idx) => ({
              id: `shot-${idx}`,
              round_id: 'round-1',
            }));
            return resolve({ data: shots, error: null });
          }
          if (table === 'putt_details') {
            // Map the test fixture rows to the new flat shape (shot_id-keyed).
            type TestRow = {
              distance_feet: number | null;
              made: boolean | null;
              miss_tags: string[] | null;
            };
            const flat = (mockRows.current ?? []).map((r: TestRow, idx: number) => ({
              distance_feet: r.distance_feet,
              made: r.made,
              miss_tags: r.miss_tags,
              shot_id: `shot-${idx}`,
            }));
            return resolve({ data: flat, error: null });
          }
          return resolve({ data: mockRows.current, error: null });
        },
      });
      return chain;
    };
    return builder;
  }

  return { mockRows, upsertInsightMock, attachDrillsMock, logServerErrorMock, makeSupabaseStub };
});

const { mockRows, upsertInsightMock, attachDrillsMock } = hoisted;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => hoisted.makeSupabaseStub()),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: hoisted.logServerErrorMock,
}));

vi.mock('@/lib/coachhelm/v2/insights/upsert', () => ({
  upsertInsight: hoisted.upsertInsightMock,
  attachDrills: hoisted.attachDrillsMock,
}));

import {
  generatePuttDistanceInsights,
  generatePuttMissBiasInsights,
  aggregatePuttBuckets,
  aggregateMissBias,
} from '@/lib/coachhelm/v2/mining/putt-analytics';

// Helper — a fake row returned by the flattened fetcher. We bypass the real
// join by having the generator's internal fetch call the mocked Supabase
// select chain which resolves to whatever we put in `mockRows.current`.
// The flatten code maps `golf_shots.golf_rounds.round_date` → row.round_date.
type FakeNestedRow = {
  distance_feet: number | null;
  made: boolean | null;
  miss_tags: string[] | null;
  golf_shots: {
    round_id: string;
    golf_rounds: { player_id: string; round_date: string };
  };
};

function nestedRow(
  distance_feet: number | null,
  made: boolean | null,
  miss_tags: string[] | null = null,
  round_id = 'round-1',
): FakeNestedRow {
  return {
    distance_feet,
    made,
    miss_tags,
    golf_shots: {
      round_id,
      golf_rounds: { player_id: 'player-1', round_date: '2026-04-01' },
    },
  };
}

function manyRows(
  n: number,
  distance_feet: number,
  made: boolean,
  tags: string[] | null = null,
  round_id = 'round-1',
): FakeNestedRow[] {
  return Array.from({ length: n }, () =>
    nestedRow(distance_feet, made, tags, round_id),
  );
}

// ---------------------------------------------------------------------------

describe('aggregatePuttBuckets', () => {
  it('buckets attempts by distance and computes make_pct', () => {
    const rows = [
      ...manyRows(10, 4.5, true),  // 3-6ft all made
      ...manyRows(2,  4.5, false),
      ...manyRows(5,  8,   false), // 6-10ft all missed
    ];
    const flat = rows.map((r) => ({
      distance_feet: r.distance_feet,
      made: r.made,
      miss_tags: r.miss_tags,
      round_id: r.golf_shots.round_id,
      round_date: r.golf_shots.golf_rounds.round_date,
    }));
    const buckets = aggregatePuttBuckets(flat);
    const bkt3_6 = buckets.find((b) => b.label === '3_6ft')!;
    const bkt6_10 = buckets.find((b) => b.label === '6_10ft')!;
    expect(bkt3_6.attempts).toBe(12);
    expect(bkt3_6.made).toBe(10);
    expect(bkt3_6.makePct).toBeCloseTo(10 / 12);
    expect(bkt6_10.attempts).toBe(5);
    expect(bkt6_10.makePct).toBe(0);
  });

  it('assigns distance exactly at boundary to upper bucket', () => {
    const flat = [
      {
        distance_feet: 6,
        made: true,
        miss_tags: null,
        round_id: 'r',
        round_date: '2026-04-01',
      },
    ];
    const buckets = aggregatePuttBuckets(flat);
    expect(buckets.find((b) => b.label === '3_6ft')!.attempts).toBe(0);
    expect(buckets.find((b) => b.label === '6_10ft')!.attempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('generatePuttDistanceInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.current = [];
  });

  it('emits no insight when bucket has fewer than 5 attempts', async () => {
    // 4 putts at 8ft (6-10ft bucket). Even a big gap should NOT emit.
    mockRows.current = manyRows(4, 8, false);
    await generatePuttDistanceInsights('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits insight for a noteworthy gap with correct signature + evidence', async () => {
    // 30 putts from 6-10ft, made 0 → make_pct 0, baseline 0.48 → 48pt gap.
    mockRows.current = manyRows(30, 8, false);
    await generatePuttDistanceInsights('player-1');

    expect(upsertInsightMock).toHaveBeenCalled();
    const calls = upsertInsightMock.mock.calls;
    const call6_10 = calls.find((c) => {
      const input = c[1] as { signature: string };
      return input.signature === 'player-1:putt_make_rate:6_10ft';
    });
    expect(call6_10).toBeDefined();

    const input = call6_10![1] as {
      player_id: string;
      category: string;
      signature: string;
      evidence: {
        metric: string;
        sample_n: number;
        window_days: number;
        comparison_value: number;
        comparison_source: string;
        your_value: number;
        strokes_impact: number;
        confidence_factors: {
          sample_adequacy: number;
          recency: number;
          variance: number;
        };
      };
      drill_tags?: string[];
    };

    expect(input.category).toBe('putting');
    expect(input.evidence.metric).toBe('putt_make_rate_6_10ft');
    expect(input.evidence.sample_n).toBe(30);
    expect(input.evidence.window_days).toBe(30);
    expect(input.evidence.comparison_source).toBe('d2_avg');
    expect(input.evidence.comparison_value).toBeCloseTo(0.48);
    expect(input.evidence.your_value).toBe(0);
    // strokes_impact = gap * 3 (expected 6-10ft putts/round) = ~1.44
    expect(input.evidence.strokes_impact).toBeGreaterThan(1.0);
    expect(input.drill_tags).toEqual(
      expect.arrayContaining(['putting', '6_10ft']),
    );
    // green_reading flavor by default when we don't have short-miss data.
    expect(input.drill_tags).toContain('green_reading');
    // attachDrills was called with category 'putting'.
    expect(attachDrillsMock).toHaveBeenCalledWith(
      expect.anything(),
      'new-insight-id',
      'putting',
      expect.arrayContaining(['putting', '6_10ft']),
    );
  });

  it('emits NO insight for a negligible gap (< 5pt from baseline)', async () => {
    // 30 putts from 6-10ft, ~48% make rate (matches baseline 0.48)
    // 14 made out of 30 = 46.7%. Gap = 1.3pt < 5pt threshold.
    const rows = [
      ...manyRows(14, 8, true),
      ...manyRows(16, 8, false),
    ];
    mockRows.current = rows;
    await generatePuttDistanceInsights('player-1');
    const called6_10 = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:putt_make_rate:6_10ft';
    });
    expect(called6_10).toBeUndefined();
  });

  it('re-run with same data produces another upsert call (dedup handled inside upsertInsight)', async () => {
    // This test asserts that the generator is *idempotent from its own
    // perspective* — it calls upsertInsight with the same signature/payload.
    // The actual dedup behavior is validated in upsert.test.ts.
    mockRows.current = manyRows(30, 8, false);
    await generatePuttDistanceInsights('player-1');
    await generatePuttDistanceInsights('player-1');

    const sigs = upsertInsightMock.mock.calls
      .map((c) => (c[1] as { signature: string }).signature)
      .filter((s) => s === 'player-1:putt_make_rate:6_10ft');
    // Exactly one per run — two runs = two calls with identical signature.
    expect(sigs.length).toBe(2);
    // Payloads identical in content for both calls.
    const evidence1 = (upsertInsightMock.mock.calls[0]![1] as {
      evidence: { sample_n: number; your_value: number };
    }).evidence;
    const evidence2 = (
      upsertInsightMock.mock.calls.find((_call, idx) => idx > 0)![1] as {
        evidence: { sample_n: number; your_value: number };
      }
    ).evidence;
    expect(evidence1.sample_n).toBe(evidence2.sample_n);
    expect(evidence1.your_value).toBe(evidence2.your_value);
  });

  it('picks speed_control drill tag when player has leave-short bias at distance', async () => {
    // 30 putts at 8ft, 10 made, 20 missed. Of the 20 missed, 15 have 'short'
    // tag → leave-short bias dominant → directional flavor = speed_control.
    const madeRows = manyRows(10, 8, true);
    const missedShort = manyRows(15, 8, false, ['short']);
    const missedOther = manyRows(5, 8, false, ['low']);
    mockRows.current = [...madeRows, ...missedShort, ...missedOther];

    await generatePuttDistanceInsights('player-1');

    const call = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:putt_make_rate:6_10ft';
    });
    expect(call).toBeDefined();
    const input = call![1] as { drill_tags?: string[] };
    expect(input.drill_tags).toContain('speed_control');
    expect(input.drill_tags).not.toContain('green_reading');
  });
});

// ---------------------------------------------------------------------------

describe('aggregateMissBias', () => {
  it('computes bias percentages over tagged misses only', () => {
    const flat = [
      // 10 misses, 8 tagged 'low', 2 tagged 'short'
      ...Array.from({ length: 8 }, () => ({
        distance_feet: 10,
        made: false,
        miss_tags: ['low'] as string[],
        round_id: 'r1',
        round_date: '2026-04-01',
      })),
      ...Array.from({ length: 2 }, () => ({
        distance_feet: 10,
        made: false,
        miss_tags: ['short'] as string[],
        round_id: 'r1',
        round_date: '2026-04-01',
      })),
      // 10 makes (ignored for bias)
      ...Array.from({ length: 10 }, () => ({
        distance_feet: 3,
        made: true,
        miss_tags: null,
        round_id: 'r1',
        round_date: '2026-04-01',
      })),
    ];
    const agg = aggregateMissBias(flat);
    expect(agg.totalTaggedMisses).toBe(10);
    expect(agg.lowPct).toBeCloseTo(0.8);
    expect(agg.shortPct).toBeCloseTo(0.2);
    expect(agg.highPct).toBe(0);
    expect(agg.longPct).toBe(0);
  });

  it('ignores untagged misses', () => {
    const flat = Array.from({ length: 5 }, () => ({
      distance_feet: 10,
      made: false,
      miss_tags: [] as string[],
      round_id: 'r1',
      round_date: '2026-04-01',
    }));
    const agg = aggregateMissBias(flat);
    expect(agg.totalTaggedMisses).toBe(0);
    expect(agg.lowPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('generatePuttMissBiasInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.current = [];
  });

  it('emits nothing when total tagged misses < 15', async () => {
    mockRows.current = manyRows(10, 10, false, ['low']);
    await generatePuttMissBiasInsights('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits read-bias insight when >=60% of misses leak LOW (under-read)', async () => {
    // 20 tagged misses, 14 low (70%), 6 high → dominant read bias = low
    const rows = [
      ...manyRows(14, 10, false, ['low']),
      ...manyRows(6, 10, false, ['high']),
    ];
    mockRows.current = rows;
    await generatePuttMissBiasInsights('player-1');

    const readCall = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:putt_miss_bias:read';
    });
    expect(readCall).toBeDefined();
    const input = readCall![1] as {
      category: string;
      evidence: {
        comparison_source: string;
        comparison_value: number;
        your_value: number;
        sample_n: number;
        window_days: number;
      };
      drill_tags?: string[];
    };
    expect(input.category).toBe('putting');
    expect(input.evidence.comparison_source).toBe('absolute_target');
    expect(input.evidence.comparison_value).toBeCloseTo(0.5);
    expect(input.evidence.your_value).toBeCloseTo(0.7);
    expect(input.evidence.sample_n).toBe(20);
    expect(input.evidence.window_days).toBe(90);
    expect(input.drill_tags).toEqual(
      expect.arrayContaining(['putting', 'green_reading', 'under_read']),
    );
  });

  it('emits speed-bias insight when >=60% of misses are SHORT', async () => {
    // 20 tagged misses, 14 short (70%), 6 long.
    // lowPct = 0, highPct = 0 → read bias will NOT trigger.
    const rows = [
      ...manyRows(14, 10, false, ['short']),
      ...manyRows(6, 10, false, ['long']),
    ];
    mockRows.current = rows;
    await generatePuttMissBiasInsights('player-1');

    const speedCall = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:putt_miss_bias:speed';
    });
    expect(speedCall).toBeDefined();
    const input = speedCall![1] as { drill_tags?: string[] };
    expect(input.drill_tags).toEqual(
      expect.arrayContaining(['putting', 'speed_control', 'leave_short']),
    );
  });

  it('emits NO bias insight when dominant tag is below 60% threshold', async () => {
    // 20 misses, 11 low (55%), 9 high → below threshold for both axes.
    const rows = [
      ...manyRows(11, 10, false, ['low']),
      ...manyRows(9, 10, false, ['high']),
    ];
    mockRows.current = rows;
    await generatePuttMissBiasInsights('player-1');
    const readCall = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:putt_miss_bias:read';
    });
    expect(readCall).toBeUndefined();
  });
});
