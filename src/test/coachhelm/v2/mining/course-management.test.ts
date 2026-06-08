/**
 * Tests for course-management generators (Group C2 + C3).
 *
 * Covers:
 *  1. Min sample threshold.
 *  2. Notable gap → emit.
 *  3. Below noteworthy threshold → no emit.
 *  4. Dedup on second run (signature re-used).
 *  5. C2 course scoping: same player on 2 courses gets 2 insights with
 *     different signatures.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface TableState {
  primary: unknown[];
  yardage: unknown[];
}

const { tables, supabaseStub, upsertInsightMock, attachDrillsMock } = vi.hoisted(() => {
  const tables: TableState = { primary: [], yardage: [] };

  function buildChain(table: string) {
    const payload = () => {
      if (table === 'golf_holes') return tables.primary;
      if (table === 'golf_course_holes') return tables.yardage;
      return [];
    };
    const thenable: Record<string, unknown> = {};
    Object.assign(thenable, {
      select: vi.fn(() => thenable),
      eq: vi.fn(() => thenable),
      gte: vi.fn(() => thenable),
      in: vi.fn(() => Promise.resolve({ data: payload(), error: null })),
      not: vi.fn(() => thenable),
      order: vi.fn(() => thenable),
      // fetchScoredHoles now paginates: chain ends with .order('id').range(from,to);
      // return the chainable thenable so its `then` resolves to payload().
      limit: vi.fn(() => thenable),
      range: vi.fn(() => thenable),
      single: vi.fn(() =>
        Promise.resolve({ data: { id: 'new-insight-id' }, error: null }),
      ),
      insert: vi.fn(() => thenable),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      overlaps: vi.fn(() => thenable),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: payload(), error: null }),
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
    tables,
    supabaseStub: { client: { from: vi.fn((table: string) => buildChain(table)) } },
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
  GATED_OUT: '__gated_out__',
}));

import {
  generateWorstHolesInsights,
  generateWarmupHoleInsight,
  aggregateCourseHoles,
  aggregateWarmup,
  __internal,
} from '@/lib/coachhelm/v2/mining/course-management';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HoleFixture {
  par: number;
  score: number;
  hole_number: number;
  course_id?: string;
  course_name?: string;
}

function holeRow(h: HoleFixture) {
  return {
    par: h.par,
    score: h.score,
    hole_number: h.hole_number,
    golf_rounds: {
      player_id: 'player-1',
      round_date: '2026-04-01',
      course_id: h.course_id ?? 'course-1',
      course_name: h.course_name ?? 'Pine Hills',
    },
  };
}

function manyHoles(
  n: number,
  fixture: HoleFixture,
): Array<ReturnType<typeof holeRow>> {
  return Array.from({ length: n }, () => holeRow(fixture));
}

// ---------------------------------------------------------------------------
// Aggregator unit tests
// ---------------------------------------------------------------------------

describe('aggregateCourseHoles', () => {
  it('groups by (course_id, hole_number) and averages over par', () => {
    const flat = [
      { par: 4, score: 5, hole_number: 3, course_id: 'c1', course_name: 'A' },
      { par: 4, score: 6, hole_number: 3, course_id: 'c1', course_name: 'A' },
      { par: 4, score: 4, hole_number: 3, course_id: 'c2', course_name: 'B' },
    ];
    const out = aggregateCourseHoles(flat);
    const c1h3 = out.find((a) => a.course_id === 'c1' && a.hole_number === 3)!;
    const c2h3 = out.find((a) => a.course_id === 'c2' && a.hole_number === 3)!;
    expect(c1h3.roundsPlayed).toBe(2);
    expect(c1h3.avgScoreToPar).toBeCloseTo(1.5);
    expect(c2h3.avgScoreToPar).toBeCloseTo(0);
  });
});

describe('aggregateWarmup', () => {
  it('separates hole-1 from holes 2-18', () => {
    const flat = [
      { par: 4, score: 6, hole_number: 1, course_id: 'c', course_name: 'A' },
      { par: 4, score: 6, hole_number: 1, course_id: 'c', course_name: 'A' },
      { par: 4, score: 4, hole_number: 5, course_id: 'c', course_name: 'A' },
      { par: 4, score: 5, hole_number: 7, course_id: 'c', course_name: 'A' },
    ];
    const agg = aggregateWarmup(flat);
    expect(agg.hole1Count).toBe(2);
    expect(agg.hole1AvgScoreToPar).toBeCloseTo(2);
    expect(agg.restCount).toBe(2);
    expect(agg.restAvgScoreToPar).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// generateWorstHolesInsights
// ---------------------------------------------------------------------------

describe('generateWorstHolesInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tables.primary = [];
    tables.yardage = [];
  });

  it('emits nothing when no hole has enough rounds (< 4)', async () => {
    // One hole played 3 times at +2 (below MIN rounds).
    tables.primary = manyHoles(3, {
      par: 4,
      score: 6,
      hole_number: 7,
      course_id: 'course-1',
    });
    await generateWorstHolesInsights('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits nothing when avg over par is below 0.8', async () => {
    // 6 plays at exactly par → avg 0.
    tables.primary = manyHoles(6, {
      par: 4,
      score: 4,
      hole_number: 7,
      course_id: 'course-1',
    });
    await generateWorstHolesInsights('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits one course-scoped insight when 3 holes clear the threshold', async () => {
    const rows = [
      ...manyHoles(5, { par: 4, score: 6, hole_number: 3, course_id: 'course-1' }),
      ...manyHoles(5, { par: 4, score: 6, hole_number: 7, course_id: 'course-1' }),
      ...manyHoles(5, { par: 4, score: 5, hole_number: 12, course_id: 'course-1' }),
      // A hole below threshold — shouldn't appear.
      ...manyHoles(5, { par: 4, score: 4, hole_number: 15, course_id: 'course-1' }),
    ];
    tables.primary = rows;
    tables.yardage = [
      { course_id: 'course-1', hole_number: 3, par: 4, yardage: 440 },
      { course_id: 'course-1', hole_number: 7, par: 4, yardage: 450 },
      { course_id: 'course-1', hole_number: 12, par: 4, yardage: 430 },
    ];

    await generateWorstHolesInsights('player-1');
    const call = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:course_worst_holes:course-1';
    });
    expect(call).toBeDefined();
    const input = call![1] as {
      category: string;
      evidence: {
        sample_n: number;
        detail?: { worst_holes: Array<{ hole_number: number }>; pattern: string | null };
      };
      drill_tags?: string[];
    };
    expect(input.category).toBe('course_management');
    expect(
      input.evidence.detail?.worst_holes
        .map((h) => h.hole_number)
        .sort((a, b) => a - b),
    ).toEqual([3, 7, 12]);
    // 3 par-4s all >= 400yd → pattern string set.
    expect(input.evidence.detail?.pattern).toBeTruthy();
    expect(input.drill_tags).toEqual(
      expect.arrayContaining(['course_management', 'tee_strategy', 'risk_reward']),
    );
  });

  it('scopes by course — same player on two courses yields two different signatures', async () => {
    const rows = [
      ...manyHoles(5, { par: 4, score: 6, hole_number: 3, course_id: 'course-1', course_name: 'A' }),
      ...manyHoles(5, { par: 4, score: 6, hole_number: 7, course_id: 'course-1', course_name: 'A' }),
      ...manyHoles(5, { par: 4, score: 6, hole_number: 12, course_id: 'course-1', course_name: 'A' }),
      ...manyHoles(5, { par: 4, score: 5, hole_number: 4, course_id: 'course-2', course_name: 'B' }),
      ...manyHoles(5, { par: 4, score: 6, hole_number: 9, course_id: 'course-2', course_name: 'B' }),
      ...manyHoles(5, { par: 4, score: 5, hole_number: 14, course_id: 'course-2', course_name: 'B' }),
    ];
    tables.primary = rows;
    tables.yardage = [];

    await generateWorstHolesInsights('player-1');
    const sigs = upsertInsightMock.mock.calls
      .map((c) => (c[1] as { signature: string }).signature)
      .filter((s) => s.startsWith('player-1:course_worst_holes:'));
    expect(new Set(sigs)).toEqual(
      new Set([
        'player-1:course_worst_holes:course-1',
        'player-1:course_worst_holes:course-2',
      ]),
    );
  });

  it('re-run with same data produces another upsert call (dedup handled by upsertInsight)', async () => {
    tables.primary = [
      ...manyHoles(5, { par: 4, score: 6, hole_number: 3, course_id: 'c1' }),
      ...manyHoles(5, { par: 4, score: 6, hole_number: 7, course_id: 'c1' }),
      ...manyHoles(5, { par: 4, score: 5, hole_number: 12, course_id: 'c1' }),
    ];
    await generateWorstHolesInsights('player-1');
    await generateWorstHolesInsights('player-1');
    const sigs = upsertInsightMock.mock.calls
      .map((c) => (c[1] as { signature: string }).signature)
      .filter((s) => s === 'player-1:course_worst_holes:c1');
    expect(sigs.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// generateWarmupHoleInsight
// ---------------------------------------------------------------------------

describe('generateWarmupHoleInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tables.primary = [];
    tables.yardage = [];
  });

  it('emits nothing when fewer than 6 hole-1 plays', async () => {
    const rows = [
      ...manyHoles(5, { par: 4, score: 6, hole_number: 1, course_id: 'c' }),
      // Rest-of-round holes to pass the other gate.
      ...manyHoles(35, { par: 4, score: 4, hole_number: 7, course_id: 'c' }),
    ];
    tables.primary = rows;
    await generateWarmupHoleInsight('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits hole-1 warmup insight when gap > 0.4 strokes', async () => {
    // 8 hole-1 plays at +1, 40 rest-of-round holes at par.
    const rows = [
      ...manyHoles(8, { par: 4, score: 5, hole_number: 1, course_id: 'c' }),
      ...manyHoles(40, { par: 4, score: 4, hole_number: 7, course_id: 'c' }),
    ];
    tables.primary = rows;
    await generateWarmupHoleInsight('player-1');
    const call = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:course_warmup:hole_1';
    });
    expect(call).toBeDefined();
    const input = call![1] as {
      category: string;
      evidence: {
        comparison_source: string;
        sample_n: number;
        your_value: number;
        comparison_value: number;
        window_days: number;
      };
      drill_tags?: string[];
    };
    expect(input.category).toBe('course_management');
    expect(input.evidence.comparison_source).toBe('your_baseline');
    expect(input.evidence.sample_n).toBe(8);
    expect(input.evidence.window_days).toBe(__internal.WARMUP_WINDOW_DAYS);
    expect(input.evidence.your_value).toBeCloseTo(1);
    expect(input.evidence.comparison_value).toBeCloseTo(0);
    expect(input.drill_tags).toEqual(
      expect.arrayContaining([
        'course_management',
        'pre_shot_routine',
        'breath_work',
      ]),
    );
  });

  it('does not emit when hole-1 excess is <= 0.4 strokes', async () => {
    const rows = [
      ...manyHoles(6, { par: 4, score: 4, hole_number: 1, course_id: 'c' }),
      ...manyHoles(2, { par: 4, score: 5, hole_number: 1, course_id: 'c' }),
      ...manyHoles(40, { par: 4, score: 4, hole_number: 7, course_id: 'c' }),
    ];
    tables.primary = rows;
    await generateWarmupHoleInsight('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });
});
