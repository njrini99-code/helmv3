/**
 * v3 per-gender / per-level cohort anchor tables.
 *
 * Replaces the men's-only hardcoded Tour constants previously duplicated in
 * each generator (putt-distance PGA_MAKE_PCT_BY_BUCKET, approach-miss
 * TOUR_GREEN_HIT_PCT, scrambling comparison_value 50, par-type Tour values).
 *
 * WHY THIS EXISTS (audit DC-GENDER-1): every anchor was a men's PGA Tour value.
 * A women's-team player (e.g. Grace Saunders, team gender='womens') was gapped
 * to a men's sand-save of 50% — fabricating a ~1.5 stroke "leak" where the real
 * women's-college target is ~38%. The synthetic app-population cohort that was
 * meant to fix this is worse (sand-save level_avg 14.8% on the prod snapshot),
 * so we anchor to a controlled per-gender/level table instead.
 *
 * SOURCES (documented, never asserted):
 *   - Women's make-% / green-hit: LPGA ShotLink public season aggregates,
 *     scaled to college-women by the same ratio men's-college sits below men's
 *     Tour (~0.92 on make %, ~0.88 on green-hit). Conservative — always between
 *     the synthetic cohort and the men's Tour value.
 *   - Sand-save women's college ~38%: NCAA women's golf stat reports + LPGA ~45%
 *     discounted to college.
 *   - Men's putt-make / scrambling / GIR values: the existing Tour anchors
 *     verified live against golf_pga_standards on 2026-06-06 — kept identical
 *     so men's teams are UNCHANGED. Men's green-hit-by-band values (below,
 *     `GREEN_HIT_ANCHORS`) are NOT part of that verification pass — they are
 *     the approximate Tour band anchors the approach_miss generator has always
 *     printed (see that table's own header). Every anchor below now carries a
 *     `provenance`/`sourceNote` pair so this distinction is data, not prose a
 *     reader has to reconcile by hand (repair plan N16).
 *
 * `cohortAnchor(metric, gender)` returns the realistic target in the metric's
 * stored unit, or null when no anchor exists (caller falls back to pga_value).
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

export type CohortGender = 'mens' | 'womens';

/**
 * Where a single anchor value came from — read by the label/source helpers
 * below and by the N16 guard test, which fails if a 'derived' anchor is ever
 * described with measured-sounding wording ("average", "measured", "norm").
 *
 * - measured: a verified population statistic (a cited Tour/NCAA figure, or
 *   the specific golf_pga_standards cross-check noted in the module header).
 * - derived: scaled, discounted, or otherwise computed from a measured figure
 *   rather than itself measured — a defensible estimate, never a norm.
 */
export type AnchorProvenance = 'measured' | 'derived';

interface AnchorValue {
  /** The anchor in the metric's stored unit (percent points, feet, strokes). */
  value: number;
  provenance: AnchorProvenance;
  /** One-line citation, or an honest statement of how `value` was derived. */
  sourceNote: string;
}

/** Anchor pair: the men's Tour value and the women's-college target. */
interface GenderAnchor {
  mens: AnchorValue;
  womens: AnchorValue;
}

/** Women's putt-make anchors are the measured LPGA rows (LPGA_PUTT_NOTE).
 *  Every other women's anchor is derived the same way — scaled/discounted
 *  from a measured men's or LPGA figure, never itself a measured
 *  women's-college population statistic. One shared note avoids repeating
 *  the same sentence on every entry. */
const LPGA_PUTT_NOTE = 'golf_pga_standards tour=lpga (LPGA ShotLink 2024), verified 2026-09-25.';

const WOMENS_DERIVED_NOTE =
  'LPGA/NCAA figure discounted to college — not a measured women\'s-college population stat.';

/**
 * Per-metric (gender) anchors in the metric's stored unit (percent points,
 * feet, strokes). Only metrics whose generators previously hardcoded a men's
 * Tour constant are listed; everything else falls through to `pga_value`.
 */
const COHORT_ANCHORS: Partial<Record<MetricId, GenderAnchor>> = {
  // Putt make % by distance — men's = golf_pga_standards tour=pga (verified
  // 2026-06-06); women's = golf_pga_standards tour=lpga (LPGA ShotLink 2024,
  // verified 2026-09-25), the same rows lib/golf/benchmarks/putting.ts reads.
  putts_made_3_5ft_pct: {
    mens: { value: 90.5, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 86.0, provenance: 'measured', sourceNote: LPGA_PUTT_NOTE },
  },
  putts_made_5_10ft_pct: {
    mens: { value: 62.2, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 55.0, provenance: 'measured', sourceNote: LPGA_PUTT_NOTE },
  },
  putts_made_10_15ft_pct: {
    mens: { value: 35.7, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 30.0, provenance: 'measured', sourceNote: LPGA_PUTT_NOTE },
  },
  putts_made_15_25ft_pct: {
    mens: { value: 15.4, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 12.0, provenance: 'measured', sourceNote: LPGA_PUTT_NOTE },
  },
  putts_made_25_plus_ft_pct: {
    mens: { value: 5.5, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 5.0, provenance: 'measured', sourceNote: LPGA_PUTT_NOTE },
  },

  // Approach green-hit % anchors live in GREEN_HIT_ANCHORS below, keyed by
  // distance bucket — NOT under the approach_proximity_* ids. Those ids are
  // registered as on-green proximity in FEET (lower_better); parking a percent
  // under them made every consumer that trusts the registry unit read
  // "70" as feet (the counterfactual target, the women's standing anchor —
  // see standing/gender-anchor.ts). `cohortAnchor(approach_proximity_*)` is
  // therefore null: no like-for-like proximity anchor exists here.

  // Sand save % — the headline fix. Men's Tour ~50%, women's college ~38%.
  scrambling_pct_sand: {
    mens: { value: 50, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 38, provenance: 'derived', sourceNote: 'NCAA women\'s golf stat reports + LPGA ~45% discounted to college.' },
  },
  scrambling_pct_rough: {
    mens: { value: 60, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 50, provenance: 'derived', sourceNote: WOMENS_DERIVED_NOTE },
  },
  scrambling_pct_fairway: {
    mens: { value: 67, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 58, provenance: 'derived', sourceNote: WOMENS_DERIVED_NOTE },
  },

  // GIR % — men's Tour ~66%, women's college ~60%.
  gir_pct: {
    mens: { value: 66, provenance: 'measured', sourceNote: 'golf_pga_standards, verified 2026-06-06.' },
    womens: { value: 60, provenance: 'derived', sourceNote: WOMENS_DERIVED_NOTE },
  },
};

/** Approach distance bands the green-hit anchors are keyed by (matches the
 *  `approach_miss` generator's bucket ids). */
export type ApproachBucket = '50_125ft' | '125_175ft' | '175_plus_ft';

/** Runtime list of {@link ApproachBucket} for iteration (tests, audits). */
export const APPROACH_BUCKETS: readonly ApproachBucket[] = ['50_125ft', '125_175ft', '175_plus_ft'];

const MENS_APPROX_TOUR_NOTE =
  'Approximate Tour band anchor the approach_miss generator has always printed — ' +
  'not cross-checked against golf_pga_standards the way the putt/scrambling/GIR men\'s ' +
  'anchors above are. Treat as "approx", not "verified".';

/**
 * Green-hit % per approach band: the share of approaches from the band that
 * finish ON the green. Its own identity — not GIR (per hole, regulation
 * strokes) and not proximity (feet, on-green finishes only). Men's values are
 * the approximate Tour band anchors the approach_miss generator has always
 * printed (provenance 'derived', NOT 'measured' — see MENS_APPROX_TOUR_NOTE);
 * women's are discounted ~0.88 (derived targets, see the header).
 */
const GREEN_HIT_ANCHORS: Record<ApproachBucket, GenderAnchor> = {
  '50_125ft': {
    mens: { value: 80, provenance: 'derived', sourceNote: MENS_APPROX_TOUR_NOTE },
    womens: { value: 70, provenance: 'derived', sourceNote: WOMENS_DERIVED_NOTE },
  },
  '125_175ft': {
    mens: { value: 65, provenance: 'derived', sourceNote: MENS_APPROX_TOUR_NOTE },
    womens: { value: 56, provenance: 'derived', sourceNote: WOMENS_DERIVED_NOTE },
  },
  '175_plus_ft': {
    mens: { value: 50, provenance: 'derived', sourceNote: MENS_APPROX_TOUR_NOTE },
    womens: { value: 42, provenance: 'derived', sourceNote: WOMENS_DERIVED_NOTE },
  },
};

/** Green-hit % anchor for an approach band, in percent points. */
export function greenHitAnchor(bucket: ApproachBucket, gender: CohortGender): number {
  const a = GREEN_HIT_ANCHORS[bucket];
  return (gender === 'womens' ? a.womens : a.mens).value;
}

/**
 * Provenance + source note for a green-hit anchor (N16 guard test / audit
 * surfaces). Both genders are 'derived' here — see {@link GREEN_HIT_ANCHORS}'s
 * own header for why the men's side doesn't qualify as 'measured' the way the
 * putt/scrambling/GIR anchors above do.
 */
export function greenHitAnchorProvenance(
  bucket: ApproachBucket,
  gender: CohortGender,
): { provenance: AnchorProvenance; sourceNote: string } {
  const a = GREEN_HIT_ANCHORS[bucket];
  const entry = gender === 'womens' ? a.womens : a.mens;
  return { provenance: entry.provenance, sourceNote: entry.sourceNote };
}

/**
 * Evidence `comparison_source` for a cohort anchor. Men's anchors are the
 * verified Tour values (`pga_baseline`); women's are DERIVED targets and must
 * ship as `estimated_target` so the evidence panel labels them "Estimated
 * target" rather than "PGA baseline" (repair plan N16).
 */
export function cohortAnchorSource(gender: CohortGender): 'pga_baseline' | 'estimated_target' {
  return gender === 'womens' ? 'estimated_target' : 'pga_baseline';
}

/**
 * Display label for a cohort anchor. `noun` names the stat ("sand save",
 * "green-hit", "make %"). Women's anchors read as an estimated target, never
 * as a measured college average — the table above discounts LPGA/NCAA
 * figures; nobody measured a women's-college population for these.
 */
export function cohortAnchorLabel(gender: CohortGender, noun: string): string {
  return gender === 'womens'
    ? `Women's college ${noun} target (est.)`
    : `PGA Tour ${noun} avg`;
}

/**
 * Realistic target for a metric given the player's cohort gender, in the
 * metric's stored unit. Returns null when no anchor is defined (the caller
 * keeps using the DB pga_value). Men's anchors are the unchanged Tour values.
 */
export function cohortAnchor(
  metricId: MetricId | string,
  gender: CohortGender,
): number | null {
  const a = (COHORT_ANCHORS as Record<string, GenderAnchor | undefined>)[metricId];
  if (!a) return null;
  return (gender === 'womens' ? a.womens : a.mens).value;
}

/**
 * Provenance + source note for a `COHORT_ANCHORS` entry (N16 guard test /
 * audit surfaces). Returns null for a metric with no anchor, mirroring
 * {@link cohortAnchor}.
 */
export function cohortAnchorProvenance(
  metricId: MetricId | string,
  gender: CohortGender,
): { provenance: AnchorProvenance; sourceNote: string } | null {
  const a = (COHORT_ANCHORS as Record<string, GenderAnchor | undefined>)[metricId];
  if (!a) return null;
  const entry = gender === 'womens' ? a.womens : a.mens;
  return { provenance: entry.provenance, sourceNote: entry.sourceNote };
}

/** Every {@link MetricId} that has a `COHORT_ANCHORS` entry (test/audit iteration). */
export function cohortAnchorMetricIds(): MetricId[] {
  return Object.keys(COHORT_ANCHORS) as MetricId[];
}
