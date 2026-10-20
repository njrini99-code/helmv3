/**
 * v3 per-gender anchor tables.
 *
 * TOUR ONLY (Q-88, "change it all to PGA", 2026-09-30): every anchor is the
 * team's Tour value from `TOUR_STANDARDS` (golf_pga_standards): the PGA Tour
 * for a men's or unknown team, the LPGA Tour for a women's team. The women's
 * college estimates this table used to carry (sand save 38%, GIR 60%, green-hit
 * discounted ~0.88) are gone: CoachHelm never compares with a college number.
 * Green-hit by approach band has no Tour value for the LPGA, so a women's team
 * gets no green-hit anchor (null) and the comparison is dropped, never guessed.
 * The history below explains why the table exists at all.
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
import { TOUR_STANDARDS } from '@/lib/golf/benchmarks/tour';

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

/** Anchor pair: the PGA Tour value (men's) and the LPGA Tour value (women's). */
interface GenderAnchor {
  mens: AnchorValue;
  womens: AnchorValue;
}

/** Green-hit anchors: the men's approximate Tour band value; none for women. */
interface GreenHitAnchor {
  mens: AnchorValue;
  womens: null;
}

/** Women's putt-make anchors are the measured LPGA rows (LPGA_PUTT_NOTE).
 *  Every other women's anchor is derived the same way — scaled/discounted
 *  from a measured men's or LPGA figure, never itself a measured
 *  women's-college population statistic. One shared note avoids repeating
 *  the same sentence on every entry. */
const LPGA_PUTT_NOTE = 'golf_pga_standards tour=lpga (LPGA ShotLink 2024), verified 2026-09-25.';

const TOUR_NOTE = { pga: TOUR_STANDARDS.pga.source, lpga: TOUR_STANDARDS.lpga.source } as const;

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

  // Scrambling and GIR: the Tour values in TOUR_STANDARDS (golf_pga_standards,
  // read 2026-09-30). The men's rough/fairway values were 60/67 here, from an
  // older 2026-06-06 read; the table says 58/65.
  scrambling_pct_sand: {
    mens: { value: TOUR_STANDARDS.pga.scramblingPct.sand, provenance: 'measured', sourceNote: TOUR_NOTE.pga },
    womens: { value: TOUR_STANDARDS.lpga.scramblingPct.sand, provenance: 'measured', sourceNote: TOUR_NOTE.lpga },
  },
  scrambling_pct_rough: {
    mens: { value: TOUR_STANDARDS.pga.scramblingPct.rough, provenance: 'measured', sourceNote: TOUR_NOTE.pga },
    womens: { value: TOUR_STANDARDS.lpga.scramblingPct.rough, provenance: 'measured', sourceNote: TOUR_NOTE.lpga },
  },
  scrambling_pct_fairway: {
    mens: { value: TOUR_STANDARDS.pga.scramblingPct.fairway, provenance: 'measured', sourceNote: TOUR_NOTE.pga },
    womens: { value: TOUR_STANDARDS.lpga.scramblingPct.fairway, provenance: 'measured', sourceNote: TOUR_NOTE.lpga },
  },
  gir_pct: {
    mens: { value: TOUR_STANDARDS.pga.girPct, provenance: 'measured', sourceNote: TOUR_NOTE.pga },
    womens: { value: TOUR_STANDARDS.lpga.girPct, provenance: 'measured', sourceNote: TOUR_NOTE.lpga },
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
const GREEN_HIT_ANCHORS: Record<ApproachBucket, GreenHitAnchor> = {
  '50_125ft': { mens: { value: 80, provenance: 'derived', sourceNote: MENS_APPROX_TOUR_NOTE }, womens: null },
  '125_175ft': { mens: { value: 65, provenance: 'derived', sourceNote: MENS_APPROX_TOUR_NOTE }, womens: null },
  '175_plus_ft': { mens: { value: 50, provenance: 'derived', sourceNote: MENS_APPROX_TOUR_NOTE }, womens: null },
};

/**
 * Green-hit % anchor for an approach band, in percent points. Null for a
 * women's team: the LPGA publishes no green-hit-by-band value (Q-88).
 */
export function greenHitAnchor(bucket: ApproachBucket, gender: CohortGender): number | null {
  const a = GREEN_HIT_ANCHORS[bucket];
  return gender === 'womens' ? null : a.mens.value;
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
): { provenance: AnchorProvenance; sourceNote: string } | null {
  const a = GREEN_HIT_ANCHORS[bucket];
  const entry = gender === 'womens' ? a.womens : a.mens;
  return entry ? { provenance: entry.provenance, sourceNote: entry.sourceNote } : null;
}

/**
 * Evidence `comparison_source` for an anchor: always the Tour baseline. The
 * label names which tour (see {@link cohortAnchorLabel}).
 */
export function cohortAnchorSource(_gender: CohortGender): 'pga_baseline' {
  return 'pga_baseline';
}

/**
 * Display label for an anchor. `noun` names the stat ("sand save",
 * "green-hit", "make %"): "LPGA Tour sand save avg" for a women's team,
 * "PGA Tour sand save avg" otherwise.
 */
export function cohortAnchorLabel(gender: CohortGender, noun: string): string {
  return gender === 'womens' ? `LPGA Tour ${noun} avg` : `PGA Tour ${noun} avg`;
}

/**
 * Realistic target for a metric given the player's cohort gender, in the
 * metric's stored unit. Returns null when no anchor is defined (the caller
 * keeps using the DB pga_value). Both genders are Tour values (Q-88).
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
