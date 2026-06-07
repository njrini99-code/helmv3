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
 * Locks the per-team selectable SG baselines (PR #240).
 *
 * The DB `sg_baseline_scale(key)` (migration 20260607200000) is AUTHORITATIVE for
 * computation — these TS scales are the UI mirror. If they drift, a coach sees a
 * baseline label whose displayed scale disagrees with the recompute the DB just
 * ran. This test pins every key→scale pair to the exact DB values so any change
 * to one side forces a conscious update to the other.
 *
 * Keep in sync with the CASE in `public.sg_baseline_scale`.
 */
const DB_SCALE: Record<SgBaselineKey, number> = {
  pga_tour: 1.0,
  scratch: 1.028,
  ncaa_d1: 1.057,
  ncaa_d2: 1.1,
  ncaa_d3: 1.143,
  womens: 1.083,
};

describe('SG baseline options (TS mirror of DB sg_baseline_scale)', () => {
  it('exposes exactly the six DB baseline keys', () => {
    const keys = SG_BASELINE_OPTIONS.map((o) => o.key).sort();
    expect(keys).toEqual(Object.keys(DB_SCALE).sort());
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

  it('scales increase monotonically from PGA Tour up the difficulty ladder', () => {
    // Easier field (higher scoring) => larger scale (the expected-strokes curve is
    // raised). pga_tour is the strictest (1.0); D3 the most lenient.
    expect(sgBaselineScale('pga_tour')).toBeLessThan(sgBaselineScale('scratch'));
    expect(sgBaselineScale('scratch')).toBeLessThan(sgBaselineScale('ncaa_d1'));
    expect(sgBaselineScale('ncaa_d1')).toBeLessThan(sgBaselineScale('ncaa_d2'));
    expect(sgBaselineScale('ncaa_d2')).toBeLessThan(sgBaselineScale('ncaa_d3'));
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
    // explicit override wins regardless of gender
    expect(effectiveSgBaseline('ncaa_d2', 'womens')).toBe('ncaa_d2');
    expect(effectiveSgBaseline('pga_tour', 'womens')).toBe('pga_tour');
    // no override -> gender default (mirrors DB sg_scale_for_player)
    expect(effectiveSgBaseline(null, 'womens')).toBe('womens');
    expect(effectiveSgBaseline(null, 'mens')).toBe('pga_tour');
    expect(effectiveSgBaseline(undefined, null)).toBe('pga_tour');
  });
});
