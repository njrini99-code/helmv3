import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproachMissGenerator } from '@/lib/coachhelm/v3/generators/approach-miss';
import {
  bucketApproachDistance,
  loadApproachShots,
  type ApproachShot,
} from '@/lib/coachhelm/v3/engine/shot-source';
import type { AxisTally } from '@/lib/coachhelm/v3/engine/diagnosis';

// Mock ONLY the DB loader; keep bucketApproachDistance (pure) real so the
// generator's distance-bucketing stays under test.
vi.mock('@/lib/coachhelm/v3/engine/shot-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/engine/shot-source')>();
  return { ...actual, loadApproachShots: vi.fn() };
});

const mockLoadApproachShots = vi.mocked(loadApproachShots);

/** Build an ApproachShot fixture. distBefore is yards (drives the bucket); proxAfter +
 *  unitAfter drive the on-green proximity normalization; result drives the green-hit
 *  signal ('green'|'hole'|'gir' = found the green; anything else = missed). */
function shot(
  distBeforeYards: number,
  proxAfter: number,
  unitAfter: 'feet' | 'yards',
  result: string = 'green',
  over: Partial<ApproachShot> = {},
): ApproachShot {
  const onGreen = result === 'green' || result === 'hole' || result === 'gir';
  return {
    round_id: 'r-1',
    hole_number: 1,
    shot_number: 2,
    distance_to_hole_before: distBeforeYards,
    distance_to_hole_after: proxAfter,
    distance_unit_after: unitAfter,
    lie_before: 'fairway',
    lie_after: onGreen ? 'green' : 'rough',
    result,
    is_penalty: false,
    miss_direction: null,
    ...over,
  };
}

const PLAYER_ID = 'p-1';

function makeAgg(over: Partial<{
  bucket: '50_125ft' | '125_175ft' | '175_plus_ft';
  attempts: number;
  green_hit_n: number;
  green_hit_pct: number;
  proximity_when_hit_feet: number | null;
  penalty_rate_pct: number;
  miss_short_long: AxisTally;
  miss_left_right: AxisTally;
}> = {}) {
  const attempts = over.attempts ?? 20;
  const greenHitPct = over.green_hit_pct ?? 60;
  return {
    sampleN: attempts,
    playerValue: greenHitPct,
    bucket: (over.bucket ?? '50_125ft') as '50_125ft' | '125_175ft' | '175_plus_ft',
    attempts,
    green_hit_n: over.green_hit_n ?? Math.round((greenHitPct / 100) * attempts),
    green_hit_pct: greenHitPct,
    // Respect an explicitly-passed null (?? would coerce null back to 22).
    proximity_when_hit_feet: 'proximity_when_hit_feet' in over ? over.proximity_when_hit_feet! : 22,
    penalty_rate_pct: over.penalty_rate_pct ?? 0,
    miss_short_long: ('miss_short_long' in over
      ? over.miss_short_long!
      : { negative: 0, positive: 0, neutral: 0 }),
    miss_left_right: ('miss_left_right' in over
      ? over.miss_left_right!
      : { negative: 0, positive: 0, neutral: 0 }),
  };
}

describe('bucketApproachDistance', () => {
  it('buckets 50-125 yards correctly', () => {
    expect(bucketApproachDistance(50)).toBe('50_125ft');
    expect(bucketApproachDistance(100)).toBe('50_125ft');
    expect(bucketApproachDistance(124)).toBe('50_125ft');
  });
  it('buckets 125-175 yards correctly', () => {
    expect(bucketApproachDistance(125)).toBe('125_175ft');
    expect(bucketApproachDistance(150)).toBe('125_175ft');
    expect(bucketApproachDistance(174)).toBe('125_175ft');
  });
  it('buckets 175+ yards correctly', () => {
    expect(bucketApproachDistance(175)).toBe('175_plus_ft');
    expect(bucketApproachDistance(220)).toBe('175_plus_ft');
  });
  it('returns null for sub-50-yard shots', () => {
    expect(bucketApproachDistance(20)).toBeNull();
    expect(bucketApproachDistance(49)).toBeNull();
  });
});

describe('ApproachMissGenerator', () => {
  it('identity for each bucket', () => {
    expect(new ApproachMissGenerator(PLAYER_ID, '50_125ft').metricId).toBe('approach_proximity_50_125ft');
    expect(new ApproachMissGenerator(PLAYER_ID, '125_175ft').metricId).toBe('approach_proximity_125_175ft');
    expect(new ApproachMissGenerator(PLAYER_ID, '175_plus_ft').metricId).toBe('approach_proximity_175_plus_ft');
  });

  it('common properties', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    expect(g.name).toBe('ApproachMissGenerator');
    expect(g.insightType).toBe('approach_miss');
    expect(g.category).toBe('approach');
    expect(g.minSampleN).toBe(5);
  });

  it('leads with green-hit % and rides proximity-when-hit along when reliable', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const c = g.composeContent(makeAgg({ bucket: '50_125ft', green_hit_pct: 70, proximity_when_hit_feet: 22, attempts: 30 }));
    expect(c.title).toContain('50-125 yd');
    expect(c.title).toContain('70%');
    expect(c.title).toContain('22 ft when you do');
    expect(c.content).toContain('30 approaches');
    expect(c.content).toContain('found the green 70%');
    expect(c.content).toContain('PGA Tour ~80%'); // approximate green-hit anchor for 50-125
    expect(c.signature).toBe('approach_miss:50_125ft');
    expect(c.evidence.unit).toBe('percent');
    expect(c.evidence.your_value).toBe(70);
    expect(c.evidence.comparison_value).toBe(80);
    expect(c.evidence.comparison_source).toBe('pga_baseline');
  });

  it('frames a reach problem (no reliable proximity) when too few greens are hit', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '175_plus_ft');
    const c = g.composeContent(makeAgg({ bucket: '175_plus_ft', green_hit_pct: 20, proximity_when_hit_feet: null, attempts: 15 }));
    expect(c.title).toContain('20% greens hit');
    expect(c.title).not.toContain('ft when you do');
    expect(c.content).toContain('Too few greens hit');
    expect(c.content).toContain('finding the green, not distance control');
  });

  it('surfaces penalty flag when penalty rate > 5%', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '175_plus_ft');
    const c = g.composeContent(makeAgg({ penalty_rate_pct: 8.5 }));
    expect(c.content).toContain('9% of these approaches incurred a penalty');
  });

  it('omits penalty note when rate is below threshold', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const c = g.composeContent(makeAgg({ penalty_rate_pct: 2 }));
    expect(c.content).not.toContain('incurred a penalty');
  });
});

// ============================================================================
// aggregate() — green-hit % (reach) + on-green-only proximity (dial-in)
// ----------------------------------------------------------------------------
// Proximity is a green-surface distance (feet) and is computed ONLY over shots
// that found the green. A MISSED approach finishes off-green (yards); the old
// generator ×3'd that into "feet" and inflated proximity ~2×. These cases pin
// that misses are counted by green-hit rate and NEVER blended into proximity.
// ============================================================================

describe('ApproachMissGenerator.aggregate (green-hit + on-green proximity)', () => {
  beforeEach(() => {
    mockLoadApproachShots.mockReset();
  });

  it('computes green-hit % over all in-bucket attempts', async () => {
    // 10 in 50-125: 7 found the green, 3 missed → 70% green-hit.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'), shot(100, 20, 'feet', 'green'), shot(100, 22, 'feet', 'green'),
      shot(100, 16, 'feet', 'green'), shot(100, 24, 'feet', 'green'), shot(100, 19, 'feet', 'green'),
      shot(100, 21, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough'), shot(100, 35, 'yards', 'rough'), shot(100, 30, 'yards', 'sand'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.attempts).toBe(10);
    expect(agg!.green_hit_n).toBe(7);
    expect(agg!.green_hit_pct).toBe(70);
  });

  it('excludes off-green misses from proximity — NO ×3 inflation', async () => {
    // 3 green (18/20/22 ft) + 2 rough misses finishing 50 YARDS off-green.
    // proximity-when-hit = (18+20+22)/3 = 20 ft. The 50-yd misses are NOT ×3'd to 150.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'),
      shot(100, 20, 'feet', 'green'),
      shot(100, 22, 'feet', 'green'),
      shot(100, 50, 'yards', 'rough'),
      shot(100, 50, 'yards', 'rough'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.green_hit_pct).toBe(60);
    expect(agg!.green_hit_n).toBe(3);
    expect(agg!.proximity_when_hit_feet).toBe(20); // NOT (20*3 + ...) — misses excluded
  });

  it('normalizes a legacy on-green-in-yards finish ×3 to feet', async () => {
    // All 5 found the green but were stored in yards (7 yd = 21 ft on-green). avg = 21 ft.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 7, 'yards', 'green'), shot(100, 7, 'yards', 'green'), shot(100, 7, 'yards', 'green'),
      shot(100, 7, 'yards', 'green'), shot(100, 7, 'yards', 'green'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.green_hit_pct).toBe(100);
    expect(agg!.proximity_when_hit_feet).toBe(21);
  });

  it('reports NO proximity when fewer than 3 greens are hit (noise guard)', async () => {
    // 6 attempts, only 2 found the green → green-hit% reported, proximity null.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'),
      shot(100, 22, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough'), shot(100, 35, 'yards', 'rough'),
      shot(100, 30, 'yards', 'sand'), shot(100, 45, 'yards', 'rough'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.green_hit_n).toBe(2);
    expect(Math.round(agg!.green_hit_pct)).toBe(33);
    expect(agg!.proximity_when_hit_feet).toBeNull();
  });

  it('uses lie_after as a fallback green signal when result is absent', async () => {
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green', { result: null, lie_after: 'green' }),
      shot(100, 20, 'feet', 'green', { result: null, lie_after: 'green' }),
      shot(100, 22, 'feet', 'green', { result: null, lie_after: 'green' }),
      shot(100, 40, 'yards', 'rough', { result: null, lie_after: 'rough' }),
      shot(100, 35, 'yards', 'rough', { result: null, lie_after: 'rough' }),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.green_hit_n).toBe(3);
    expect(agg!.proximity_when_hit_feet).toBe(20);
  });

  it('only aggregates shots in this generator bucket (distance_to_hole_before, yards)', async () => {
    mockLoadApproachShots.mockResolvedValue([
      shot(200, 45, 'feet', 'green'),
      shot(60, 6, 'yards', 'green'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '125_175ft').aggregate();
    expect(agg).toBeNull(); // no shots bucketed into 125-175 yd
  });

  // am-3 (armed-landmine guard): playerValue feeds the counterfactual and MUST
  // be the metric's registered unit — FEET (on-green proximity) — NEVER the
  // green-hit PERCENT. If requiresStanding ever flips to true, the base would
  // otherwise feed e.g. "70 feet" vs an ~18 ft Tour target → a fabricated gap.
  it('sets playerValue to the on-green proximity FEET, not the green-hit %', async () => {
    // 3 greens at 18/20/22 ft (avg 20 ft), 2 off-green misses → green-hit 60%.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'),
      shot(100, 20, 'feet', 'green'),
      shot(100, 22, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough'),
      shot(100, 35, 'yards', 'rough'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.green_hit_pct).toBe(60);
    // playerValue is the FEET proximity (20), never the 60(%) green-hit.
    expect(agg!.playerValue).toBe(20);
    expect(agg!.playerValue).toBe(agg!.proximity_when_hit_feet);
    expect(agg!.playerValue).not.toBe(agg!.green_hit_pct);
  });

  it('playerValue is NaN (safely ignored by the base) when proximity is unreadable', async () => {
    // 6 attempts, only 2 greens → proximity null → playerValue NaN.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'),
      shot(100, 22, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough'), shot(100, 35, 'yards', 'rough'),
      shot(100, 30, 'yards', 'sand'), shot(100, 45, 'yards', 'rough'),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.proximity_when_hit_feet).toBeNull();
    expect(Number.isNaN(agg!.playerValue)).toBe(true);
  });
});

describe('ApproachMissGenerator — dominant miss-axis driver (PLAY: driver+action)', () => {
  it('appends a SHORT driver with "club up" when misses skew short (Nick Rini 50-125)', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    // 7 short, 3 long → 70% short, the live prod shape for Nick's short approaches.
    const c = g.composeContent(makeAgg({
      bucket: '50_125ft', green_hit_pct: 55, attempts: 20,
      miss_short_long: { negative: 7, positive: 3, neutral: 0 },
      miss_left_right: { negative: 1, positive: 1, neutral: 8 },
    }));
    expect(c.content).toContain('SHORT');
    expect(c.content).toContain('70%');
    expect(c.content.toLowerCase()).toContain('club up');
    expect(c.content.toLowerCase()).toContain('full number');
  });

  it('omits the axis driver when the miss pattern is balanced (no false tendency)', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '125_175ft');
    const c = g.composeContent(makeAgg({
      miss_short_long: { negative: 5, positive: 5, neutral: 0 },
      miss_left_right: { negative: 5, positive: 5, neutral: 0 },
    }));
    expect(c.content).not.toContain('club up');
    expect(c.content).not.toContain('start line');
    // A balanced tally must not leak ANY axis-share claim. Every axis driver
    // sentence is uniquely fingerprinted by "<pct>% of those <n> misses ..."
    // (the reach/dial-in prose talks about "approaches", never "misses"), so a
    // spurious axis claim would smuggle a percentage in via that phrasing.
    expect(c.content).not.toMatch(/% of those \d+ misses/);
  });

  it('aggregate tallies miss_direction over OFF-GREEN misses only', async () => {
    mockLoadApproachShots.mockReset();
    // 5 greens (excluded from miss tally) + 5 off-green: 4 short, 1 long.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'), shot(100, 20, 'feet', 'green'), shot(100, 22, 'feet', 'green'),
      shot(100, 19, 'feet', 'green'), shot(100, 21, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'short' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'short_right' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'short_left' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'short' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long' }),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.miss_short_long.negative).toBe(4); // short*2 + short_right + short_left
    expect(agg!.miss_short_long.positive).toBe(1); // long
    // short_right contributes RIGHT; short_left contributes LEFT.
    expect(agg!.miss_left_right.negative).toBe(1); // *_left
    expect(agg!.miss_left_right.positive).toBe(1); // *_right
  });

  it('aggregate tallies the LONG diagonals (long_left / long_right) onto BOTH axes', async () => {
    mockLoadApproachShots.mockReset();
    // 5 greens (excluded) + 5 off-green LONG misses: long, long_left*2, long_right*2.
    // The compound directions must each contribute to BOTH the short/long axis
    // (positive = long) AND the left/right axis (left=neg, right=pos) — the LONG
    // counterpart of the SHORT-diagonal case above.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'), shot(100, 20, 'feet', 'green'), shot(100, 22, 'feet', 'green'),
      shot(100, 19, 'feet', 'green'), shot(100, 21, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long_left' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long_right' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long_left' }),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long_right' }),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    // All 5 misses are LONG → positive on short/long; none short.
    expect(agg!.miss_short_long.negative).toBe(0);
    expect(agg!.miss_short_long.positive).toBe(5); // long + long_left*2 + long_right*2
    // long_left*2 → LEFT (neg); long_right*2 → RIGHT (pos); the pure 'long' is L/R-neutral.
    expect(agg!.miss_left_right.negative).toBe(2); // long_left*2
    expect(agg!.miss_left_right.positive).toBe(2); // long_right*2
    expect(agg!.miss_left_right.neutral).toBe(1);  // the pure 'long'
  });

  it('a single long_right miss contributes positive to BOTH axes', async () => {
    mockLoadApproachShots.mockReset();
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet', 'green'), shot(100, 20, 'feet', 'green'), shot(100, 22, 'feet', 'green'),
      shot(100, 40, 'yards', 'rough', { miss_direction: 'long_right' }),
    ]);
    const agg = await new ApproachMissGenerator(PLAYER_ID, '50_125ft').aggregate();
    expect(agg!.miss_short_long.positive).toBe(1); // long → positive
    expect(agg!.miss_left_right.positive).toBe(1); // right → positive
  });
});
