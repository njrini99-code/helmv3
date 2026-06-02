import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproachMissGenerator } from '@/lib/coachhelm/v3/generators/approach-miss';
import {
  bucketApproachDistance,
  loadApproachShots,
  type ApproachShot,
} from '@/lib/coachhelm/v3/engine/shot-source';

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
});
