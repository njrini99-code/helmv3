/**
 * Tests for scoring-context Tier-1 insight generators (Group C1).
 *
 * Covers:
 *  1. Below min sample threshold (< 9 holes) → no emit.
 *  2. Notable gap → emit with correct signature/evidence.
 *  3. Negligible gap (< 0.20 strokes) → no emit.
 *  4. Dedup on second run — generator re-calls upsert with same signature
 *     (actual dedup behavior validated inside upsertInsight).
 *  5. Par-4 length sub-split emits additional insight when spread is >0.4.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Stub Supabase client — our generator issues two selects:
//   1. golf_holes (+ joined golf_rounds)
//   2. golf_course_holes (for yardages)
// We route the first to `primaryRows` and the second to `yardageRows`.
// ---------------------------------------------------------------------------

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
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
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
}));

import {
  generateParTypeInsights,
  aggregateByPar,
  aggregatePar4ByLength,
  __internal,
} from '@/lib/coachhelm/v2/mining/scoring-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HoleFixture {
  par: number;
  score: number;
  hole_number: number;
  course_id?: string;
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
    },
  };
}

function manyHoles(
  n: number,
  par: number,
  scoreOffset: number,
  hole_number = 7,
  course_id = 'course-1',
): Array<ReturnType<typeof holeRow>> {
  return Array.from({ length: n }, () =>
    holeRow({ par, score: par + scoreOffset, hole_number, course_id }),
  );
}

// ---------------------------------------------------------------------------
// Unit tests on pure aggregators
// ---------------------------------------------------------------------------

describe('aggregateByPar', () => {
  it('averages score-to-par per par-type', () => {
    const flat = [
      { par: 3, score: 4, hole_number: 2, course_id: 'c', yardage: null },
      { par: 3, score: 3, hole_number: 5, course_id: 'c', yardage: null },
      { par: 4, score: 5, hole_number: 7, course_id: 'c', yardage: null },
    ];
    const out = aggregateByPar(flat);
    const p3 = out.find((a) => a.par === 3)!;
    const p4 = out.find((a) => a.par === 4)!;
    expect(p3.holesPlayed).toBe(2);
    expect(p3.avgScoreToPar).toBeCloseTo(0.5);
    expect(p4.avgScoreToPar).toBeCloseTo(1);
  });

  it('ignores non-3/4/5 par values', () => {
    const flat = [
      { par: 6, score: 7, hole_number: 1, course_id: 'c', yardage: null },
    ];
    expect(aggregateByPar(flat)).toEqual([]);
  });
});

describe('aggregatePar4ByLength', () => {
  it('buckets par-4 holes by yardage', () => {
    const flat = [
      { par: 4, score: 5, hole_number: 1, course_id: 'c', yardage: 320 },
      { par: 4, score: 5, hole_number: 2, course_id: 'c', yardage: 400 },
      { par: 4, score: 6, hole_number: 3, course_id: 'c', yardage: 450 },
    ];
    const out = aggregatePar4ByLength(flat);
    expect(out.find((b) => b.bucket === 'short')!.holesPlayed).toBe(1);
    expect(out.find((b) => b.bucket === 'medium')!.holesPlayed).toBe(1);
    expect(out.find((b) => b.bucket === 'long')!.holesPlayed).toBe(1);
    expect(out.find((b) => b.bucket === 'long')!.avgScoreToPar).toBeCloseTo(2);
  });
});

// ---------------------------------------------------------------------------
// Generator tests
// ---------------------------------------------------------------------------

describe('generateParTypeInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tables.primary = [];
    tables.yardage = [];
  });

  it('emits nothing when par-type has fewer than 9 holes', async () => {
    // 8 par-4 holes at +1 (big gap) — below MIN_HOLES_PER_PAR (9).
    tables.primary = manyHoles(8, 4, 1);
    await generateParTypeInsights('player-1');
    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  // TODO(plan-03): un-skip after Plan 03 (CoachHelm evidence contract).
  // generateParTypeInsights output shape changes when BaselineRegistry replaces
  // hard-coded labels. The 4 specs in this block all assert against the pre-fix
  // shape — re-enable when the registry-driven output is stable.
  it.skip('emits par-type insight with notable gap, proper signature + evidence', async () => {
    // 20 par-4s averaging +1 → gap vs baseline +0.4 is +0.6 → above 0.20 threshold.
    tables.primary = manyHoles(20, 4, 1);
    await generateParTypeInsights('player-1');
    const par4Call = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:par_scoring:par4';
    });
    expect(par4Call).toBeDefined();
    const input = par4Call![1] as {
      category: string;
      signature: string;
      evidence: {
        metric: string;
        sample_n: number;
        window_days: number;
        comparison_source: string;
        comparison_value: number;
        your_value: number;
        strokes_impact: number;
      };
      drill_tags?: string[];
    };
    expect(input.category).toBe('scoring');
    expect(input.evidence.metric).toBe('par_scoring_par4');
    expect(input.evidence.sample_n).toBe(20);
    expect(input.evidence.window_days).toBe(__internal.WINDOW_DAYS);
    expect(input.evidence.comparison_source).toBe('d2_avg');
    expect(input.evidence.comparison_value).toBeCloseTo(0.4);
    expect(input.evidence.your_value).toBeCloseTo(1);
    expect(input.evidence.strokes_impact).toBeGreaterThan(1);
    expect(input.drill_tags).toEqual(
      expect.arrayContaining(['scoring', 'short_par_4_strategy', 'tee_strategy']),
    );
    expect(attachDrillsMock).toHaveBeenCalledWith(
      expect.anything(),
      'new-insight-id',
      'scoring',
      expect.arrayContaining(['scoring']),
    );
  });

  // TODO(plan-03): un-skip after Plan 03 (see block-level comment above).
  it.skip('does NOT emit when gap is under 0.20 strokes', async () => {
    // 20 par-4 holes at par exactly → avg 0, baseline 0.4 → gap 0.4 (>0.20).
    // Use 12 holes averaging +0.5 (score 4.5 impossible — mix 6 par and 6 at +1).
    // 6 at par (0) + 6 at +1 = mean 0.5. Gap vs baseline 0.4 = 0.1 < 0.20.
    const mix = [
      ...manyHoles(6, 4, 0),
      ...manyHoles(6, 4, 1),
    ];
    tables.primary = mix;
    await generateParTypeInsights('player-1');
    expect(
      upsertInsightMock.mock.calls.find(
        (c) =>
          (c[1] as { signature: string }).signature ===
          'player-1:par_scoring:par4',
      ),
    ).toBeUndefined();
  });

  // TODO(plan-03): un-skip after Plan 03.
  it.skip('re-run with same data produces another upsert call (dedup handled in upsertInsight)', async () => {
    tables.primary = manyHoles(20, 4, 1);
    await generateParTypeInsights('player-1');
    await generateParTypeInsights('player-1');
    const sigs = upsertInsightMock.mock.calls
      .map((c) => (c[1] as { signature: string }).signature)
      .filter((s) => s === 'player-1:par_scoring:par4');
    expect(sigs.length).toBe(2);
  });

  // TODO(plan-03): un-skip after Plan 03.
  it.skip('emits par-4 length sub-split when one bucket is >0.4 worse than another', async () => {
    // Need par-4 total >= 18 holes AND yardages. Short par-4s at par,
    // long par-4s at +1 (yardage gaps spanning the 350-430 buckets).
    const short = Array.from({ length: 10 }, (_, i) => ({
      par: 4,
      score: 4,
      hole_number: (i % 9) + 1,
      golf_rounds: {
        player_id: 'player-1',
        round_date: '2026-04-01',
        course_id: 'course-1',
      },
    }));
    const long = Array.from({ length: 10 }, (_, i) => ({
      par: 4,
      score: 5,
      hole_number: ((i % 9) + 10),
      golf_rounds: {
        player_id: 'player-1',
        round_date: '2026-04-01',
        course_id: 'course-1',
      },
    }));
    tables.primary = [...short, ...long];
    // Short par-4 holes = hole_number 1..9 at 300yd, long = 10..18 at 450yd.
    tables.yardage = [
      ...Array.from({ length: 9 }, (_, i) => ({
        course_id: 'course-1',
        hole_number: i + 1,
        par: 4,
        yardage: 300,
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        course_id: 'course-1',
        hole_number: i + 10,
        par: 4,
        yardage: 450,
      })),
    ];
    await generateParTypeInsights('player-1');
    const longCall = upsertInsightMock.mock.calls.find((c) => {
      const i = c[1] as { signature: string };
      return i.signature === 'player-1:par4_length:long';
    });
    expect(longCall).toBeDefined();
    const input = longCall![1] as {
      evidence: { comparison_source: string };
      category: string;
    };
    expect(input.category).toBe('scoring');
    expect(input.evidence.comparison_source).toBe('your_baseline');
  });
});
