import { describe, it, expect } from 'vitest';
import { ApproachMissGenerator } from '@/lib/coachhelm/v3/generators/approach-miss';
import { bucketApproachDistance } from '@/lib/coachhelm/v3/engine/shot-source';

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
