import { describe, it, expect } from 'vitest';
import { WOMENS_SG_SCALE, genderScaleFactor } from '../sg-benchmarks';

/**
 * Guards the women's gender baseline scaling. The DB is authoritative
 * (migration 20260607170000); these assertions pin the TS mirror so the two
 * cannot silently drift, and document the men's=identity contract.
 */
describe('gender SG baseline scaling', () => {
  it('women scale > 1 (men face shorter approaches; women need the curve raised)', () => {
    expect(WOMENS_SG_SCALE).toBeGreaterThan(1);
    expect(WOMENS_SG_SCALE).toBe(1.083); // keep in sync with DB v_womens_scale
  });

  it('men/unknown is identity (1.0) so men’s SG is provably unchanged', () => {
    expect(genderScaleFactor('mens')).toBe(1.0);
    expect(genderScaleFactor(null)).toBe(1.0);
    expect(genderScaleFactor(undefined)).toBe(1.0);
  });

  it('women applies the women’s factor', () => {
    expect(genderScaleFactor('womens')).toBe(WOMENS_SG_SCALE);
    // scaling a sample men's expected-strokes value raises it
    const mensExpected = 3.08;
    expect(mensExpected * genderScaleFactor('womens')).toBeCloseTo(3.336, 3);
  });
});
