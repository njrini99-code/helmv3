/**
 * CoachHelm shared engine — sport-agnostic evidence + confidence types (W10.1).
 *
 * PURE RE-HOME. These shapes were born in the golf engine
 * (`@/lib/coachhelm/v2/insights/types`) but carry NOTHING golf-specific: a
 * confidence blend, a structured root-cause diagnosis, lifecycle states, and
 * a severity ordinal apply equally to a golf round and a baseball box score.
 * They are re-homed here so BaseballHelm (Wave 10) can reuse the exact same
 * confidence/diagnosis contract instead of forking a parallel one — the #1
 * risk called out in the wave plan ("metric DIRECTION mistakes learn
 * backward; replicate the registry exactly").
 *
 * SAFETY CONTRACT: the golf source file
 * (`src/lib/coachhelm/v2/insights/types.ts`) keeps its OWN canonical
 * definitions UNCHANGED so the 40+ golf import sites resolve byte-for-byte as
 * before. This file is a NEW, additive, structurally-identical home for the
 * sport-agnostic subset. The golf types and these are kept deliberately in
 * lock-step; a single integration agent later collapses the duplication by
 * having golf re-export from here. We do NOT edit golf types in this packet.
 *
 * Sport-SPECIFIC shapes (InsightCategory enum, InsightComparisonSource,
 * InsightUnit, the full InsightEvidence with golf baseline fields) stay in the
 * golf file — each sport supplies its own.
 */

/**
 * Severity ordinal shared across every sport's insight surface.
 * Mirrors `@/lib/coachhelm/insight-types.InsightPriority` exactly.
 */
export type InsightPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Lifecycle state of an insight row, sport-agnostic. A two-strike-chase
 * baseball insight matures, gets addressed, resolves, or is archived on the
 * same ladder a golf putt-bias insight does.
 */
export type InsightLifecycleState =
  | 'tentative'
  | 'detected'
  | 'matured'
  | 'addressed'
  | 'resolved'
  | 'archived';

/**
 * How firmly an insight knows its cause is real (P0-06, sport-agnostic).
 *
 * - `observed_sequence`: the cause was measured in an actual event sequence
 *   (a recorded long approach → 3-putt on the same hole; a recorded
 *   two-strike chase → strikeout in the same at-bat). Only this level may be
 *   presented to the coach as fact.
 * - `inferred_hypothesis`: the cause is a coach hypothesis formed by combining
 *   independent statistics. Must be framed as a hypothesis and carries a
 *   calibrated-down confidence. Single-metric generators always use this level.
 */
export type CausalityLevel = 'observed_sequence' | 'inferred_hypothesis';

/**
 * Unit of a {@link DiagnosisDriver} value, sport-agnostic. Golf supplies a
 * narrower `InsightUnit`; this widened set lets baseball drivers carry mph,
 * counts, etc. while staying compatible (every golf unit is a member).
 */
export type DiagnosisUnit = 'percent' | 'strokes' | 'count' | 'yards' | 'feet' | 'mph' | 'ratio';

/**
 * Confidence factors blended by {@link calcConfidence}. Identical contract to
 * the golf engine — no golf field, so it re-homes verbatim.
 *
 * `factors_measured` tri-state honesty flag:
 * - `undefined` (default): legacy 3-factor blend (backward-compatible).
 * - `false`: recency/variance are placeholders; calcConfidence drops the
 *   fabricated variance floor and surfaces honest sample-adequacy.
 * - `true`: both genuinely measured (per-event dispersion + event-date spread).
 */
export interface InsightConfidenceFactors {
  /** sample_n / target_n, capped at 1. */
  sample_adequacy: number;
  /** 1 if all within window_days/2; <1 if older-weighted. */
  recency: number;
  /** 1 - (your_stddev / comparison_stddev), capped 0..1. */
  variance: number;
  /** SV-1 honesty flag — see type doc above. */
  factors_measured?: boolean;
}

/**
 * One quantified driver behind a {@link Diagnosis}. Every field is sourced
 * from data the generator already cited — nothing fabricated. Sport-agnostic.
 */
export interface DiagnosisDriver {
  /** Canonical metric id this driver reads (e.g. 'putts_made_3_5ft_pct',
   *  'two_strike_chase_pct'). */
  metric: string;
  /** The measured value of that metric. */
  value: number;
  /** Unit of `value`. */
  unit: DiagnosisUnit;
  /** Observations the value is computed over. */
  sample_n: number;
  /** Where the value came from (table.column or short provenance string). */
  source: string;
}

/**
 * Structured, machine-readable root-cause diagnosis attached to every insight's
 * evidence (P0-05). Sport-agnostic: the prose `content` renders for humans, but
 * this structure is what downstream surfaces filter, compare, audit, and learn
 * from across sports.
 */
export interface Diagnosis {
  /** The OBSERVED problem, plainly stated (the measured fact / symptom). */
  symptom: string;
  /** The inferred (or measured) cause. Render per `causality_level`. */
  root_cause: string;
  /** How firmly the cause is supported — never render a hypothesis as fact. */
  causality_level: CausalityLevel;
  /** Quantified drivers behind the diagnosis (sourced from cited data). */
  drivers: DiagnosisDriver[];
  /** The specific coachable action that follows from the root cause. */
  recommended_action: string;
  /** Plain-language reason for the confidence value. */
  confidence_reason: string;
}

/**
 * Standard confidence calculation, sport-agnostic (Rule 1 of the design
 * contract). Re-homed verbatim from the golf engine — every sport's generators
 * must use this; do not inline variants.
 *
 * SV-1: when `factors_measured === false` the recency/variance terms are
 * known-placeholders, so the fabricated variance floor is dropped and honest
 * sample-adequacy surfaces. A genuinely DECAYED recency (`< 1`, written by a
 * lifecycle cron from real row age) is still honored. `undefined` (default)
 * keeps the legacy blend for backward compatibility.
 */
export function calcConfidence(evidence: {
  confidence_factors: InsightConfidenceFactors;
}): number {
  const { sample_adequacy, recency, variance, factors_measured } =
    evidence.confidence_factors;

  // Honest mode: placeholders explicitly flagged unmeasured. Drop the fabricated
  // variance; keep sample adequacy. A real age-decayed recency (< 1) still
  // counts — redistribute weight across the two honest terms (no +0.45 floor).
  if (factors_measured === false) {
    if (recency < 1) {
      return (0.4 * sample_adequacy + 0.3 * recency) / 0.7;
    }
    return Math.max(0, Math.min(1, sample_adequacy));
  }

  // Legacy / fully-measured blend (default).
  return 0.4 * sample_adequacy + 0.3 * recency + 0.3 * variance;
}
