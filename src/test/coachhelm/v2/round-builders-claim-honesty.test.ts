import { describe, expect, it, vi } from 'vitest';
import type { ComposedInsight } from '@/lib/coachhelm/v2/types';

/**
 * Repair plan Package 2, N8: the four round-specific builders in the
 * orchestrator scored severity with heuristics (severe rate × sample factor,
 * leave gap / 10, missed fairways × 0.3, fail share × 2) and shipped the
 * number in `strokeImpact` — a strokes-shaped field that is persisted into the
 * review payload as strokes. The magnitude now lives in `rankScore`, which
 * orders and prioritizes but is never rendered as strokes, and the prose is
 * observation → check → recommendation instead of asserted cause.
 *
 * Goes through the real orchestrator with only the admin client stubbed.
 */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: vi.fn() }) }),
}));

type ShotRow = {
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  miss_direction: string | null;
};
type HoleRow = {
  hole_number: number;
  par: number | null;
  score: number | null;
  gir: boolean | null;
  up_and_down: boolean | null;
  fairway_hit: boolean | null;
  penalty_strokes: number | null;
};

interface Builders {
  buildRoundSevereApproachInsight(shots: ShotRow[]): ComposedInsight | null;
  buildRoundLiePenaltyInsight(shots: ShotRow[]): ComposedInsight | null;
  buildRoundTeeMissInsight(shots: ShotRow[]): ComposedInsight | null;
  buildRoundScrambleInsight(holes: HoleRow[]): ComposedInsight | null;
  scoreInsight(insight: ComposedInsight): number;
}

async function builders(): Promise<Builders> {
  vi.resetModules();
  const mod = await import('@/lib/coachhelm/v2/orchestrator');
  return mod.coachHelmIntelligence as unknown as Builders;
}

function shot(over: Partial<ShotRow>): ShotRow {
  return {
    hole_number: 1,
    shot_number: 2,
    shot_type: 'approach',
    distance_to_hole_before: 150,
    distance_to_hole_after: 30,
    distance_unit_before: 'yards',
    distance_unit_after: 'yards',
    lie_before: 'fairway',
    lie_after: 'rough',
    result: 'miss',
    miss_direction: null,
    ...over,
  };
}

const CAUSE_CLAIMS = /cost you|pushed the next shot|worse lie|scoring damage kept happening/i;

function expectHonest(insight: ComposedInsight | null) {
  expect(insight).not.toBeNull();
  const i = insight!;
  // Heuristic magnitude is a rank score, never a stroke figure.
  expect(i.strokeImpact).toBeUndefined();
  expect(typeof i.rankScore).toBe('number');
  expect(i.rankScore!).toBeGreaterThan(0);
  // Observation → check → recommendation.
  expect(`${i.headline} ${i.body}`).not.toMatch(CAUSE_CLAIMS);
  expect(i.callToAction).toMatch(/^Check /);
  expect(i.callToAction).toContain('Recommended:');
}

describe('round-specific builders — heuristic magnitude off the strokes axis', () => {
  it('severe approach: rankScore = severeRate × max(1, n/2), no strokeImpact', async () => {
    const b = await builders();
    // 3 of 4 misses from 150-175 finished > 25 yards away.
    const shots = [
      shot({ distance_to_hole_before: 160, distance_to_hole_after: 40, hole_number: 1 }),
      shot({ distance_to_hole_before: 165, distance_to_hole_after: 30, hole_number: 2 }),
      shot({ distance_to_hole_before: 170, distance_to_hole_after: 12, hole_number: 3 }),
      shot({ distance_to_hole_before: 155, distance_to_hole_after: 28, hole_number: 4 }),
    ];
    const i = b.buildRoundSevereApproachInsight(shots);
    expectHonest(i);
    expect(i!.rankScore).toBeCloseTo(0.75 * 2, 5);
    expect(i!.body).toContain('3 of 4 missed approaches');
  });

  it('lie penalty: headline no longer asserts "cost you the next shot"', async () => {
    const b = await builders();
    const shots = [
      shot({ distance_to_hole_before: 160, lie_before: 'fairway', distance_to_hole_after: 10, hole_number: 1 }),
      shot({ distance_to_hole_before: 165, lie_before: 'fairway', distance_to_hole_after: 12, hole_number: 2 }),
      shot({ distance_to_hole_before: 162, lie_before: 'rough', distance_to_hole_after: 30, hole_number: 3 }),
      shot({ distance_to_hole_before: 168, lie_before: 'rough', distance_to_hole_after: 34, hole_number: 4 }),
    ];
    const i = b.buildRoundLiePenaltyInsight(shots);
    expectHonest(i);
    expect(i!.headline).toContain('Round Lie Check');
    expect(i!.rankScore).toBeCloseTo(2.1, 5); // gap 21 yd / 10
  });

  it('tee miss: body states the side without claiming what the next shot cost', async () => {
    const b = await builders();
    const shots = [1, 2, 3, 4].map((h) =>
      shot({ hole_number: h, shot_type: 'tee', lie_after: 'rough', miss_direction: 'right' }),
    );
    const i = b.buildRoundTeeMissInsight(shots);
    expectHonest(i);
    expect(i!.body).toBe('4 of 4 missed fairways finished right in this round.');
    expect(i!.rankScore).toBeCloseTo(1.2, 5);
  });

  it('scramble: body states the outcome count without a damage narrative', async () => {
    const b = await builders();
    const holes: HoleRow[] = [1, 2, 3, 4, 5].map((h) => ({
      hole_number: h, par: 4, score: h <= 4 ? 5 : 4, gir: false,
      up_and_down: h > 4, fairway_hit: true, penalty_strokes: 0,
    }));
    const i = b.buildRoundScrambleInsight(holes);
    expectHonest(i);
    expect(i!.body).toBe('4 of 5 missed greens became bogey or worse in this round.');
    expect(i!.rankScore).toBeCloseTo(1.6, 5);
  });

  it('scoreInsight ranks a rankScore insight exactly as it ranked the same strokeImpact', async () => {
    const b = await builders();
    const base: ComposedInsight = { headline: 'h', body: 'b', tone: 'cautionary', confidence: 0.7 };
    const viaStrokes = b.scoreInsight({ ...base, strokeImpact: 1.6 });
    const viaRank = b.scoreInsight({ ...base, rankScore: 1.6 });
    expect(viaRank).toBeCloseTo(viaStrokes, 10);
    expect(viaRank).toBeGreaterThan(b.scoreInsight(base));
  });
});
