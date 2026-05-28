import { describe, it, expect } from 'vitest';
import { TeeStrategyGenerator } from '@/lib/coachhelm/v3/generators/tee-strategy';

const PLAYER_ID = 'p-1';

function makeAgg(opts: {
  pattern: 'laggy' | 'sharp' | 'inconclusive';
  driverAttempts?: number;
  driverFw?: number;
  driverDist?: number;
  ndAttempts?: number;
  ndFw?: number;
  ndDist?: number;
  roundsCovered?: number;
}) {
  const driverAttempts = opts.driverAttempts ?? 30;
  const driverFw = opts.driverFw ?? 0.5;
  const driverDist = opts.driverDist ?? 270;
  const ndAttempts = opts.ndAttempts ?? 15;
  const ndFw = opts.ndFw ?? 0.7;
  const ndDist = opts.ndDist ?? 240;
  return {
    sampleN: driverAttempts,
    playerValue: driverFw * 100,
    driver: {
      attempts: driverAttempts,
      fairwayHits: Math.round(driverAttempts * driverFw),
      fairwayPct: driverFw,
      avgDistance: driverDist,
    },
    nonDriver: {
      attempts: ndAttempts,
      fairwayHits: Math.round(ndAttempts * ndFw),
      fairwayPct: ndFw,
      avgDistance: ndDist,
    },
    pattern: opts.pattern,
    fairwayGap: driverFw - ndFw,
    distanceGap: driverDist - ndDist,
    roundsCovered: opts.roundsCovered ?? 20,
  };
}

describe('TeeStrategyGenerator', () => {
  it('identity matches the BaseGenerator contract', () => {
    const g = new TeeStrategyGenerator(PLAYER_ID);
    expect(g.name).toBe('TeeStrategyGenerator');
    expect(g.insightType).toBe('tee_strategy');
    expect(g.category).toBe('course_management');
    expect(g.metricId).toBe('sg_ott');
    expect(g.minSampleN).toBe(15);
  });

  it('composeContent("laggy") frames the layback recommendation', () => {
    const g = new TeeStrategyGenerator(PLAYER_ID);
    const c = g.composeContent(
      makeAgg({ pattern: 'laggy', driverFw: 0.45, ndFw: 0.7, driverDist: 270, ndDist: 245 }),
    );
    expect(c.title).toMatch(/cost.*more than it gains/i);
    expect(c.content).toContain('45%');
    expect(c.content).toContain('70%');
    expect(c.content).toContain('25pp');
    expect(c.content).toContain('25 yards'); // dist gap
    expect(c.content).toMatch(/layback is the higher-EV play/);
    expect(c.signature).toBe('tee_strategy:laggy');
  });

  it('composeContent("sharp") frames the keep-driving recommendation', () => {
    const g = new TeeStrategyGenerator(PLAYER_ID);
    const c = g.composeContent(
      makeAgg({ pattern: 'sharp', driverFw: 0.65, ndFw: 0.68, driverDist: 285, ndDist: 240 }),
    );
    expect(c.title).toMatch(/Driver is performing/);
    expect(c.content).toContain('65%');
    expect(c.content).toContain('68%');
    expect(c.content).toContain('45 yards'); // 285 - 240
    expect(c.content).toMatch(/default to driver/);
    expect(c.signature).toBe('tee_strategy:sharp');
  });

  it('composeContent("inconclusive") emits the no-clear-bias variant', () => {
    const g = new TeeStrategyGenerator(PLAYER_ID);
    const c = g.composeContent(
      makeAgg({ pattern: 'inconclusive', driverFw: 0.55, ndFw: 0.62 }),
    );
    expect(c.title).toMatch(/no clear preference/i);
    expect(c.signature).toBe('tee_strategy:inconclusive');
    expect(c.content).toMatch(/neither the layback nor the driver-default/);
  });

  it('evidence indexes against sg_ott + correct fields', () => {
    const g = new TeeStrategyGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ pattern: 'laggy', driverAttempts: 30, ndAttempts: 12 }));
    expect(c.evidence.metric).toBe('sg_ott');
    expect(c.evidence.unit).toBe('percent');
    expect(c.evidence.comparison_label).toBe('Non-driver fairway%');
    expect(c.evidence.comparison_source).toBe('your_baseline');
    expect(c.evidence.window_days).toBe(90);
    // Sample is sum of both clubs
    expect(c.evidence.sample_n).toBe(42);
  });

  it('signature stays stable across rounds with the same pattern', () => {
    const g = new TeeStrategyGenerator(PLAYER_ID);
    const a = g.composeContent(makeAgg({ pattern: 'laggy', driverFw: 0.4 })).signature;
    const b = g.composeContent(makeAgg({ pattern: 'laggy', driverFw: 0.45 })).signature;
    expect(a).toBe(b);
    expect(a).toBe('tee_strategy:laggy');
  });
});
