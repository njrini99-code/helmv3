import { describe, expect, it } from 'vitest';
import { evaluatePlatformRules, type PlatformSample } from '../platform-rules';

const BASE_MS = Date.parse('2026-09-03T12:00:00.000Z');

function sample(offsetMinutes: number, overrides: Partial<PlatformSample> = {}): PlatformSample {
  return {
    sampledAt: new Date(BASE_MS + offsetMinutes * 60_000).toISOString(),
    dbUp: 1,
    cpuPct: 20,
    memoryPct: 40,
    ...overrides,
  };
}

describe('evaluatePlatformRules', () => {
  it('reports unknown freshness for an empty ring', () => {
    const result = evaluatePlatformRules([], BASE_MS);
    expect(result.freshness).toBe('unknown');
    expect(result.candidates).toEqual([]);
  });

  it('reports unknown freshness for an unparseable timestamp', () => {
    const result = evaluatePlatformRules([sample(0, { sampledAt: 'not-a-date' })], BASE_MS);
    expect(result.freshness).toBe('unknown');
    expect(result.candidates).toEqual([]);
  });

  it('reports stale when the latest sample is older than 15 minutes and produces no candidates', () => {
    const samples = [sample(-20, { dbUp: 0, cpuPct: 99, memoryPct: 99 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.freshness).toBe('stale');
    expect(result.candidates).toEqual([]);
  });

  it('is fresh at exactly 15 minutes minus one tick and stale one tick past it', () => {
    const justInside = evaluatePlatformRules([sample(-14.99)], BASE_MS);
    expect(justInside.freshness).toBe('fresh');
    const justOutside = evaluatePlatformRules([sample(-15.01)], BASE_MS);
    expect(justOutside.freshness).toBe('stale');
  });

  it('produces no candidates for a healthy single sample', () => {
    const result = evaluatePlatformRules([sample(0)], BASE_MS);
    expect(result.freshness).toBe('fresh');
    expect(result.candidates).toEqual([]);
  });

  it('flags db_down immediately from a single sample — no consecutive requirement', () => {
    const result = evaluatePlatformRules([sample(0, { dbUp: 0 })], BASE_MS);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rule).toBe('db_down');
    expect(result.candidates[0]?.severity).toBe('critical');
  });

  it('does not flag db_down when dbUp is null (unknown, not down)', () => {
    const result = evaluatePlatformRules([sample(0, { dbUp: null })], BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'db_down')).toBeUndefined();
  });

  it('does not alert on a single CPU spike', () => {
    const samples = [sample(-5, { cpuPct: 20 }), sample(0, { cpuPct: 95 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'cpu_sustained_high')).toBeUndefined();
  });

  it('flags cpu_sustained_high across two consecutive samples above 90%', () => {
    const samples = [sample(-5, { cpuPct: 91 }), sample(0, { cpuPct: 95 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'cpu_sustained_high')).toBeDefined();
  });

  it('does not flag cpu_sustained_high when the threshold is exactly 90 (strictly greater-than)', () => {
    const samples = [sample(-5, { cpuPct: 90 }), sample(0, { cpuPct: 90 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'cpu_sustained_high')).toBeUndefined();
  });

  it('flags memory_sustained_high across two consecutive samples above 90%', () => {
    const samples = [sample(-5, { memoryPct: 92 }), sample(0, { memoryPct: 96 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'memory_sustained_high')).toBeDefined();
  });

  it('does not flag a sustained rule when the earlier sample recovered', () => {
    const samples = [sample(-5, { cpuPct: 40 }), sample(0, { cpuPct: 95 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'cpu_sustained_high')).toBeUndefined();
  });

  it('treats a null reading in the tail as not exceeding — never a false positive from a gap', () => {
    const samples = [sample(-5, { cpuPct: null }), sample(0, { cpuPct: 95 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'cpu_sustained_high')).toBeUndefined();
  });

  it('sorts out-of-order input by sampledAt before evaluating', () => {
    const samples = [sample(0, { cpuPct: 95 }), sample(-5, { cpuPct: 92 })];
    const result = evaluatePlatformRules(samples, BASE_MS);
    expect(result.candidates.find((c) => c.rule === 'cpu_sustained_high')).toBeDefined();
  });

  it('can raise multiple candidates from one evaluation', () => {
    const samples = [
      sample(-5, { dbUp: 0, cpuPct: 92, memoryPct: 93 }),
      sample(0, { dbUp: 0, cpuPct: 96, memoryPct: 97 }),
    ];
    const result = evaluatePlatformRules(samples, BASE_MS);
    const rules = result.candidates.map((c) => c.rule).sort();
    expect(rules).toEqual(['cpu_sustained_high', 'db_down', 'memory_sustained_high']);
  });
});
