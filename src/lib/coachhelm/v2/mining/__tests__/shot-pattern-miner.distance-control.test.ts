import { describe, it, expect } from 'vitest';
import { distanceControlScore, isTeeBand } from '../shot-pattern-miner';

describe('isTeeBand', () => {
  it('treats the 220+ driver band as a tee band', () => {
    expect(isTeeBand('Driver (220+)')).toBe(true);
    expect(isTeeBand('Long (190-220)')).toBe(false);
    expect(isTeeBand('Mid (130-160)')).toBe(false);
  });
});

describe('distanceControlScore', () => {
  it('does NOT punish drives for having ~150 yds left to the hole', () => {
    const score = distanceControlScore({ avgProximityYds: 154, bandMidYds: 360, isTeeBand: true });
    expect(score).toBe(0.5); // neutral — this field can't measure drive control
  });

  it('rewards tight approach proximity referenced to start distance', () => {
    const good = distanceControlScore({ avgProximityYds: 7, bandMidYds: 150, isTeeBand: false });
    const poor = distanceControlScore({ avgProximityYds: 50, bandMidYds: 150, isTeeBand: false });
    expect(good).toBeGreaterThan(poor);
    expect(good).toBeGreaterThanOrEqual(0.8);
    expect(poor).toBeLessThanOrEqual(0.4);
  });

  it('is monotonic: closer proximity never scores lower (approaches)', () => {
    const a = distanceControlScore({ avgProximityYds: 5, bandMidYds: 150, isTeeBand: false });
    const b = distanceControlScore({ avgProximityYds: 25, bandMidYds: 150, isTeeBand: false });
    expect(a).toBeGreaterThanOrEqual(b);
  });
});
