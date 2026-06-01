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

/** Build an ApproachShot fixture. distBefore is yards (drives the bucket);
 *  proxAfter + unitAfter drive the proximity-to-feet normalization. */
function shot(
  distBeforeYards: number,
  proxAfter: number,
  unitAfter: 'feet' | 'yards',
  over: Partial<ApproachShot> = {},
): ApproachShot {
  return {
    round_id: 'r-1',
    hole_number: 1,
    shot_number: 2,
    distance_to_hole_before: distBeforeYards,
    distance_to_hole_after: proxAfter,
    distance_unit_after: unitAfter,
    lie_before: 'fairway',
    is_penalty: false,
    miss_direction: null,
    ...over,
  };
}

const PLAYER_ID = 'p-1';

function makeAgg(over: Partial<{
  bucket: '50_125ft' | '125_175ft' | '175_plus_ft';
  attempts: number;
  avg_proximity_feet: number;
  penalty_rate_pct: number;
}> = {}) {
  return {
    sampleN: over.attempts ?? 20,
    playerValue: over.avg_proximity_feet ?? 22,
    bucket: over.bucket ?? '50_125ft' as const,
    attempts: over.attempts ?? 20,
    avg_proximity_feet: over.avg_proximity_feet ?? 22,
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

  it('composes a positive-delta insight when avg is above PGA', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const c = g.composeContent(makeAgg({ bucket: '50_125ft', avg_proximity_feet: 25, attempts: 30 }));
    // Tour anchor for 50-125 is 18 ft; delta = +7
    expect(c.title).toContain('50-125 yd');
    expect(c.title).toContain('25 ft');
    expect(c.title).toContain('+7');
    expect(c.content).toContain('30 approach shots');
    expect(c.signature).toBe('approach_miss:50_125ft');
    expect(c.evidence.unit).toBe('feet');
    expect(c.evidence.comparison_value).toBe(18);
    expect(c.evidence.comparison_source).toBe('pga_baseline');
  });

  it('composes a negative-delta insight when avg is below PGA', () => {
    const g = new ApproachMissGenerator(PLAYER_ID, '125_175ft');
    const c = g.composeContent(makeAgg({ bucket: '125_175ft', avg_proximity_feet: 27, attempts: 15 }));
    // Tour anchor for 125-175 is 30 ft; delta = -3
    expect(c.title).toContain('-3');
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
// aggregate() — E0 approach-unit normalization
// ----------------------------------------------------------------------------
// golf_shots.distance_unit_after is MIXED in prod (feet vs yards). The
// generator labels everything "ft" and compares against feet PGA anchors, so
// yard rows must be ×3 (yards→feet) before averaging. These cases pin that the
// average is feet-canonical, not the old raw mixed sum. Mirrors the canonical
// conversion in src/app/golf/actions/coachhelm-data.ts:646-649.
// ============================================================================

describe('ApproachMissGenerator.aggregate (unit normalization)', () => {
  beforeEach(() => {
    mockLoadApproachShots.mockReset();
  });

  it('passes feet-unit shots through unchanged', async () => {
    // 5 shots in the 50-125 bucket, all already in feet → avg is the raw feet avg.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet'),
      shot(100, 22, 'feet'),
      shot(100, 20, 'feet'),
      shot(100, 16, 'feet'),
      shot(100, 24, 'feet'),
    ]);
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const agg = await g.aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.avg_proximity_feet).toBe(20); // (18+22+20+16+24)/5
  });

  it('converts yard-unit shots ×3 to feet before averaging', async () => {
    // 5 shots all recorded in YARDS. 7 yd = 21 ft. avg must be 21 ft, NOT 7.
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 7, 'yards'),
      shot(100, 7, 'yards'),
      shot(100, 7, 'yards'),
      shot(100, 7, 'yards'),
      shot(100, 7, 'yards'),
    ]);
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const agg = await g.aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.avg_proximity_feet).toBe(21); // 7 yd ×3 = 21 ft
  });

  it('yields the feet-canonical average for a mixed-unit fixture (not the raw mixed sum)', async () => {
    // 3 feet rows (18, 24, 30 ft) + 3 yard rows (8, 10, 12 yd → 24, 30, 36 ft).
    // Feet-canonical sum = 18+24+30+24+30+36 = 162 over 6 → 27 ft.
    // Old raw-sum behavior would have been 18+24+30+8+10+12 = 102 / 6 = 17 ft (wrong).
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 18, 'feet'),
      shot(100, 24, 'feet'),
      shot(100, 30, 'feet'),
      shot(100, 8, 'yards'),
      shot(100, 10, 'yards'),
      shot(100, 12, 'yards'),
    ]);
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const agg = await g.aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.avg_proximity_feet).toBe(27); // feet-canonical, not 17
    expect(agg!.attempts).toBe(6);
  });

  it('only aggregates shots in this generator bucket (distance_to_hole_before, yards)', async () => {
    // Two 175+ shots (in feet) + two 50-125 shots (in yards). The 125_175
    // generator should pick up neither — returns null below minSample handling.
    mockLoadApproachShots.mockResolvedValue([
      shot(200, 45, 'feet'),
      shot(60, 6, 'yards'),
    ]);
    const g = new ApproachMissGenerator(PLAYER_ID, '125_175ft');
    const agg = await g.aggregate();
    expect(agg).toBeNull(); // no shots bucketed into 125-175 yd
  });

  it('null label/unit treated as yards → ×3 (defensive: only "feet" passes through)', async () => {
    // distance_unit_after null is NOT 'feet', so it converts ×3 (yards default).
    mockLoadApproachShots.mockResolvedValue([
      shot(100, 7, 'feet', { distance_unit_after: null }),
      shot(100, 7, 'feet', { distance_unit_after: null }),
      shot(100, 7, 'feet', { distance_unit_after: null }),
      shot(100, 7, 'feet', { distance_unit_after: null }),
      shot(100, 7, 'feet', { distance_unit_after: null }),
    ]);
    const g = new ApproachMissGenerator(PLAYER_ID, '50_125ft');
    const agg = await g.aggregate();
    expect(agg!.avg_proximity_feet).toBe(21);
  });
});
