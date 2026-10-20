import { describe, it, expect } from 'vitest';
import {
  cohortAnchor,
  cohortAnchorLabel,
  cohortAnchorSource,
  cohortAnchorProvenance,
  cohortAnchorMetricIds,
  greenHitAnchor,
  greenHitAnchorProvenance,
  APPROACH_BUCKETS,
  type CohortGender,
} from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';
import { TOUR_STANDARDS } from '@/lib/golf/benchmarks/tour';

describe('cohortAnchor', () => {
  it('returns the men\'s Tour value unchanged for mens (no behavior change)', () => {
    // Men's 3-5ft Tour make % is the existing PGA_MAKE_PCT_BY_BUCKET value.
    expect(cohortAnchor('putts_made_3_5ft_pct', 'mens')).toBe(90.5);
    expect(cohortAnchor('scrambling_pct_sand', 'mens')).toBe(50);
  });

  it("a women's team gets the LPGA Tour value, never a college estimate (Q-88)", () => {
    expect(cohortAnchor('scrambling_pct_sand', 'womens')).toBe(TOUR_STANDARDS.lpga.scramblingPct.sand);
    expect(cohortAnchor('scrambling_pct_rough', 'womens')).toBe(TOUR_STANDARDS.lpga.scramblingPct.rough);
    expect(cohortAnchor('scrambling_pct_fairway', 'womens')).toBe(TOUR_STANDARDS.lpga.scramblingPct.fairway);
    expect(cohortAnchor('gir_pct', 'womens')).toBe(TOUR_STANDARDS.lpga.girPct);
    expect(cohortAnchor('putts_made_3_5ft_pct', 'womens')).toBe(TOUR_STANDARDS.lpga.putts['3_5']);
  });

  it("men's scrambling and GIR match golf_pga_standards (65 / 58 / 50, GIR 66)", () => {
    expect(cohortAnchor('scrambling_pct_fairway', 'mens')).toBe(65);
    expect(cohortAnchor('scrambling_pct_rough', 'mens')).toBe(58);
    expect(cohortAnchor('gir_pct', 'mens')).toBe(66);
  });

  it('returns null for an unknown metric (caller falls back to pga_value)', () => {
    expect(cohortAnchor('not_a_metric' as never, 'womens' as CohortGender)).toBeNull();
  });
});

describe('green-hit anchors are their own identity (repair plan Package 2)', () => {
  it('cohortAnchor(approach_proximity_*) is null — a feet metric carries no percent anchor', () => {
    for (const id of ['approach_proximity_50_125ft', 'approach_proximity_125_175ft', 'approach_proximity_175_plus_ft']) {
      expect(cohortAnchor(id, 'mens')).toBeNull();
      expect(cohortAnchor(id, 'womens')).toBeNull();
    }
  });

  it("greenHitAnchor keeps the men's approximate Tour bands and has none for women (no LPGA value)", () => {
    expect(greenHitAnchor('50_125ft', 'mens')).toBe(80);
    expect(greenHitAnchor('125_175ft', 'mens')).toBe(65);
    expect(greenHitAnchor('175_plus_ft', 'mens')).toBe(50);
    for (const b of APPROACH_BUCKETS) expect(greenHitAnchor(b, 'womens')).toBeNull();
  });
});

describe('anchor labels and sources say what the number is (repair plan N16)', () => {
  it('labels name the tour, and the source is always the Tour baseline', () => {
    expect(cohortAnchorLabel('womens', 'sand save')).toBe('LPGA Tour sand save avg');
    expect(cohortAnchorLabel('mens', 'sand save')).toBe('PGA Tour sand save avg');
    expect(cohortAnchorSource('womens')).toBe('pga_baseline');
    expect(cohortAnchorSource('mens')).toBe('pga_baseline');
  });
});

/**
 * N16 typed-provenance guard: every COHORT_ANCHORS / GREEN_HIT_ANCHORS entry
 * now carries a `provenance`/`sourceNote` pair next to the number, so this
 * check is a real data assertion, not a read of prose.
 */
describe('typed provenance metadata (repair plan N16)', () => {
  it("every women's anchor is a measured LPGA row; there is no women's green-hit anchor", () => {
    for (const id of cohortAnchorMetricIds()) {
      const p = cohortAnchorProvenance(id, 'womens');
      expect(p, `no provenance for ${id}/womens`).not.toBeNull();
      expect(p!.provenance).toBe('measured');
      expect(p!.sourceNote).toMatch(/tour=lpga/);
    }
    for (const bucket of APPROACH_BUCKETS) {
      expect(greenHitAnchorProvenance(bucket, 'womens')).toBeNull();
    }
  });

  it('men\'s putt-make / scrambling / GIR anchors are provenance "measured" (golf_pga_standards, verified 2026-06-06)', () => {
    for (const id of cohortAnchorMetricIds()) {
      const p = cohortAnchorProvenance(id, 'mens');
      expect(p, `no provenance for ${id}/mens`).not.toBeNull();
      expect(p!.provenance).toBe('measured');
      expect(p!.sourceNote).toMatch(/golf_pga_standards/);
    }
  });

  it('men\'s green-hit-by-band anchors are provenance "derived" (approximate Tour band anchors, NOT the verified 2026-06-06 pass)', () => {
    // The one place men's and women's share the SAME provenance class: the
    // green-hit table was never part of the golf_pga_standards verification,
    // unlike the anchors above — this is the exact self-contradiction the
    // module header used to have before this audit (N16, 2026-09-23).
    for (const bucket of APPROACH_BUCKETS) {
      const p = greenHitAnchorProvenance(bucket, 'mens');
      expect(p?.provenance).toBe('derived');
    }
  });

  it('cohortAnchorMetricIds() enumerates every metric a test/audit needs to check (stays in sync with COHORT_ANCHORS)', () => {
    const ids = cohortAnchorMetricIds();
    expect(ids).toContain('putts_made_3_5ft_pct');
    expect(ids).toContain('scrambling_pct_sand');
    expect(ids).toContain('gir_pct');
    // approach_proximity_* ids are deliberately absent — see the "green-hit
    // anchors are their own identity" describe block above.
    expect(ids).not.toContain('approach_proximity_50_125ft');
  });
});
