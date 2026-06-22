import { describe, it, expect } from 'vitest';
import {
  SG_BASELINE_OPTIONS,
  sgBaselineScale,
  defaultSgBaseline,
  effectiveSgBaseline,
  WOMENS_SG_SCALE,
  type SgBaselineKey,
} from '../sg-benchmarks';

/**
 * Locks the SG baselines. As of 2026-06-22 there are exactly TWO: PGA Tour
 * (men, 1.0) and LPGA (women, WOMENS_SG_SCALE). NCAA D1/D2/D3 and the scratch
 * scale were removed — every team anchors to its gender's Tour automatically.
 *
 * The DB `sg_baseline_scale(key)` (migration 20260622130000) is AUTHORITATIVE
 * for computation; these TS scales are the mirror. If they drift, a label's
 * displayed scale disagrees with the recompute the DB ran. This test pins each
 * key→scale pair to the exact DB value so a change on one side forces the other.
 */
const DB_SCALE: Record<SgBaselineKey, number> = {
  pga_tour: 1.0,
  womens: 1.083,
};

describe('SG baseline options (TS mirror of DB sg_baseline_scale)', () => {
  it('exposes exactly the two DB baseline keys (PGA + LPGA only)', () => {
    const keys = SG_BASELINE_OPTIONS.map((o) => o.key).sort();
    expect(keys).toEqual(Object.keys(DB_SCALE).sort());
  });

  it('does NOT expose any NCAA-division or scratch baseline', () => {
    const keys = SG_BASELINE_OPTIONS.map((o) => o.key);
    for (const dead of ['scratch', 'ncaa_d1', 'ncaa_d2', 'ncaa_d3']) {
      expect(keys, `${dead} must be gone`).not.toContain(dead);
    }
  });

  it('every option scale matches the authoritative DB value', () => {
    for (const opt of SG_BASELINE_OPTIONS) {
      expect(opt.scale, `scale mismatch for ${opt.key}`).toBe(DB_SCALE[opt.key]);
      expect(sgBaselineScale(opt.key), `sgBaselineScale(${opt.key})`).toBe(DB_SCALE[opt.key]);
    }
  });

  it('womens option uses the shared WOMENS_SG_SCALE constant', () => {
    const womens = SG_BASELINE_OPTIONS.find((o) => o.key === 'womens');
    expect(womens?.scale).toBe(WOMENS_SG_SCALE);
  });

  it('LPGA scale is more lenient than PGA Tour (raised expected-strokes curve)', () => {
    expect(sgBaselineScale('pga_tour')).toBeLessThan(sgBaselineScale('womens'));
  });

  it('unknown / null keys fall back to PGA Tour identity (1.0)', () => {
    expect(sgBaselineScale(null)).toBe(1.0);
    expect(sgBaselineScale(undefined)).toBe(1.0);
    expect(sgBaselineScale('not_a_key' as SgBaselineKey)).toBe(1.0);
  });

  it('default baseline: womens teams -> womens, everyone else -> pga_tour', () => {
    expect(defaultSgBaseline('womens')).toBe('womens');
    expect(defaultSgBaseline('mens')).toBe('pga_tour');
    expect(defaultSgBaseline(null)).toBe('pga_tour');
    expect(defaultSgBaseline(undefined)).toBe('pga_tour');
  });

  it('effective baseline prefers the explicit setting, else the gender default', () => {
    expect(effectiveSgBaseline('womens', 'mens')).toBe('womens');
    expect(effectiveSgBaseline('pga_tour', 'womens')).toBe('pga_tour');
    // no override -> gender default (mirrors DB sg_scale_for_player)
    expect(effectiveSgBaseline(null, 'womens')).toBe('womens');
    expect(effectiveSgBaseline(null, 'mens')).toBe('pga_tour');
    expect(effectiveSgBaseline(undefined, null)).toBe('pga_tour');
  });
});
