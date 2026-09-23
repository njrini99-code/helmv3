/**
 * v3 comparable-opportunities pure core (repair-plan addendum §14.12 / A9,
 * "Measure response using comparable opportunities").
 *
 * `causality/attribute.ts` measures a ROUND-LEVEL average (e.g. `sg_total`)
 * before vs after an insight surfaced. That is the right tool for a metric
 * with no natural per-shot "opportunity" (a strokes-gained average). This
 * module is the SHOT-LEVEL counterpart: it compares a rate or a mean over
 * MATCHED opportunities (same distance band, same lie, same shot role) on
 * either side of an actual recorded intervention instant, so a change isn't
 * confounded by the player simply facing more/fewer easy shots after the
 * intervention than before.
 *
 * Pure, DB-free — same philosophy as A1 (`context/`) and A3
 * (`metrics/par-opportunities.ts`): takes plain `ShotFact[]`/`HoleContext[]`
 * and returns a result, no Supabase client, no I/O. A DB-backed adapter that
 * loads facts/holes for a real insight and calls this is a later slice, and
 * wiring this into `causality/attribute.ts` or the UI is explicitly OUT of
 * scope for this slice — see the module-level "NOT wired" note below.
 *
 * NAMING, deliberately mirroring `causality/attribute.ts`'s N10 fix: the
 * output field for what changed is `observedChange`, never `lift` or
 * `improvement` — this module does not feed `nextWeight` or any learning
 * loop, so there is no "direction-corrected" signal to compute, only the
 * plain, direction-agnostic `followUp.value - baseline.value`. There is no
 * `proven` field anywhere in this module's output, and the top-level status
 * is never phrased as causal: `'observed_change'` (or, with
 * `multipleInterventions`, `'observed_change_limited'`) describes what was
 * measured, not what caused it. `methodVersion` is this module's own
 * versioning axis — analogous to, but independent of, `attribution_method_
 * version` (migration 20260922230000) on `golf_insight_outcome_attribution`,
 * which this module does not read or write.
 *
 * NOT wired: nothing in `causality/attribute.ts`, any generator, or any UI
 * surface calls this module yet. Learning/personalization weights are
 * untouched by this slice.
 */

import type { HoleContext, ShotFact, ShotType } from '../context/types';
import type { MetricResult, MetricStatus } from '../metrics/types';

/** Minimum matched opportunities required on ONE side before its rate/mean
 *  is trusted. Below this, the side's `MetricResult.value` is still
 *  reported (never hidden — same "state it, don't hide it" rule as A3's
 *  `MetricResult`), but `status` is `'insufficient'` and the top-level
 *  result downgrades to `'insufficient_evidence'`. */
export const MIN_OPPORTUNITY_N = 5;

/** Minimum distinct rounds required on ONE side, alongside
 *  {@link MIN_OPPORTUNITY_N} — mirrors `causality/attribute.ts`'s
 *  `MIN_WINDOW_ROUNDS`: a thin side built from a single round's worth of
 *  shots is round-level noise, not a measurement, however many shots that
 *  one round contributed. */
export const MIN_DISTINCT_ROUNDS = 2;

export const COMPARABLE_OPPORTUNITIES_METHOD_VERSION = 'comparable_opportunities_v1';

/** A half-open distance band in feet: `[minFt, maxFt)`. `maxFt` may be
 *  `Infinity` for an open top band. Distances are matched against
 *  `ShotFact.distance_to_hole_before_feet` — the distance the opportunity
 *  was played FROM, which is what makes two shots comparably difficult. */
export interface DistanceBandSpec {
  label: string;
  minFt: number;
  maxFt: number;
}

/**
 * What counts as a "comparable opportunity" for this comparison, plus the
 * version ids that pin down what the band/benchmark definitions MEANT at
 * the moment this spec was built. `baselineSpec` and `followUpSpec` are
 * two independent instances (see {@link ComparableOpportunitiesInput}) so a
 * baseline frozen under an older band/benchmark definition and a follow-up
 * computed under a newer one are caught and rejected rather than silently
 * compared as if they meant the same thing — addendum A9's "without
 * silently changing band boundaries or benchmark versions" acceptance
 * criterion. A version string is opaque to this module; it only compares
 * baseline vs follow-up for equality, never validates the string itself.
 */
export interface MatchingSpec {
  /** `null` = no distance filter (every opportunity matches on distance). */
  distanceBand: DistanceBandSpec | null;
  distanceBandVersion: string;
  /** Matched case-insensitively against `ShotFact.lie_before` (the lie the
   *  opportunity is played FROM). `null` = no lie filter. */
  lie: string | null;
  /** Matched against `ShotFact.shot_type`. `null` = no role filter. */
  shotRole: ShotType | null;
  /** Version id for whatever external benchmark/standard this spec's
   *  matching definition is calibrated against (e.g. an LPGA-standards
   *  revision). Opaque to this module — see the interface doc comment. */
  benchmarkVersion: string;
}

/** How the outcome of a matched opportunity is scored. `'rate'` counts a
 *  success/failure per opportunity (e.g. "reached green"); `'mean'` reads a
 *  numeric value per opportunity (e.g. proximity in feet) and averages it.
 *  Both are pure classifiers over a single `ShotFact` — no cross-shot
 *  state, so the same function runs identically on both sides. */
export type OutcomeSpec =
  | { kind: 'rate'; isSuccess: (shot: ShotFact) => boolean }
  | { kind: 'mean'; unit: Exclude<MetricResult['unit'], 'percent'>; valueOf: (shot: ShotFact) => number | null };

export interface WindowBounds {
  /** Inclusive ISO 8601 instant or date. */
  start: string;
  /** Inclusive ISO 8601 instant or date. */
  end: string;
}

export interface ComparableOpportunitiesInput {
  facts: readonly ShotFact[];
  /** Used ONLY to resolve each matched shot's `round_id` to a `course_id`
   *  for {@link DisclosedDifferences.courseMix} — never for eligibility
   *  filtering (that is `facts` + the two specs). A round with no
   *  `HoleContext` in this array (or a `null` `course_id`) is simply
   *  absent from the course-mix sets, never coerced to a fabricated id. */
  holes: readonly HoleContext[];
  player_id: string;
  /** ISO 8601 instant this result is reproducible as of — carried onto each
   *  side's `MetricResult.scope`, same role as `AnalysisScope.analysis_
   *  cutoff` elsewhere in v3. This module does not read the clock itself. */
  analysis_cutoff: string;
  /**
   * The actual recorded instant the intervention took effect (e.g. an
   * insight's `surfaced_at`) — never a page view, a cron scan, or any
   * other non-intervention event. A shot recorded at EXACTLY this instant
   * is assigned to the follow-up side, never baseline: the intervention is
   * treated as already in effect at the instant it is recorded, and a
   * "baseline" can never include the moment that ends it. See
   * {@link splitSide}.
   */
  interventionAt: string;
  /** Frozen baseline window — fixed at the time the comparison was set up,
   *  never widened by later data the way a "trailing N days" window would
   *  drift. Typically ends at or before `interventionAt`; shots at or after
   *  it are excluded from baseline regardless of this window's `end` (see
   *  `interventionAt`'s doc comment). */
  baselineWindow: WindowBounds;
  /** Follow-up window. Typically starts at or before `interventionAt`;
   *  shots before it are excluded from follow-up regardless of this
   *  window's `start`. */
  followUpWindow: WindowBounds;
  baselineSpec: MatchingSpec;
  followUpSpec: MatchingSpec;
  outcome: OutcomeSpec;
  /** Set when more than one intervention could plausibly have affected the
   *  follow-up window (e.g. a second insight surfaced, or a lesson taken,
   *  before the follow-up window closed). Never changes the arithmetic —
   *  it downgrades the top-level `status` from `'observed_change'` to
   *  `'observed_change_limited'` so a caller can never present a confounded
   *  comparison as if it isolated this one intervention. */
  multipleInterventions: boolean;
  /** Dimension label carried onto both sides' `MetricResult.metricId` /
   *  `dimensions.metricId` — the caller's identifier for what this
   *  comparison is measuring (e.g. `'approach_gir_100_150ft_rough'`). This
   *  module does not validate it against `metrics/registry.ts`'s
   *  `MetricId` union — this may measure something with no round-level
   *  metric-id equivalent at all. */
  metricId: string;
}

export type ComparableOpportunitiesStatus =
  | 'observed_change'
  | 'observed_change_limited'
  | 'insufficient_evidence';

export interface DisclosedDifferences {
  courseMix: {
    /** Course ids with matched opportunities on the baseline side but not
     *  follow-up (sorted). */
    baselineOnly: string[];
    /** Course ids with matched opportunities on the follow-up side but not
     *  baseline (sorted). */
    followUpOnly: string[];
    /** Course ids with matched opportunities on both sides (sorted). */
    shared: string[];
  };
  /** `followUp.denominator - baseline.denominator` (signed). A large
   *  magnitude means the two sides rest on very different amounts of
   *  evidence even when both individually clear the support floor — e.g. a
   *  player who simply played far more rounds after the intervention than
   *  before. Disclosed, never hidden inside a rate that looks
   *  apples-to-apples. */
  opportunityCountImbalance: number;
}

export interface ComparableOpportunitiesResult {
  status: ComparableOpportunitiesStatus;
  baseline: MetricResult;
  followUp: MetricResult;
  /** Direction-agnostic `followUp.value - baseline.value`, in the outcome's
   *  own units. `null` whenever `status === 'insufficient_evidence'`, or
   *  either side's `value` is `null` — an unsupported or valueless side
   *  never contributes a number here, even though the sides' own
   *  `MetricResult.value`s may still be populated for observability (see
   *  {@link MIN_OPPORTUNITY_N}'s doc comment). This is NOT a lift and is
   *  never direction-corrected — see the module header's NAMING note. */
  observedChange: number | null;
  methodVersion: typeof COMPARABLE_OPPORTUNITIES_METHOD_VERSION;
  multipleInterventions: boolean;
  disclosedDifferences: DisclosedDifferences;
}

/**
 * Rejection outcomes that stop the comparison before either side is even
 * computed — both are version-drift guards, not data-quality findings (see
 * {@link ComparableOpportunitiesStatus} for those, which the OK branch
 * still carries as `'insufficient_evidence'`).
 */
export interface ComparableOpportunitiesRejection {
  ok: false;
  reason: 'band_version_mismatch' | 'benchmark_version_mismatch';
}

export type ComparableOpportunitiesOutcome =
  | { ok: true; result: ComparableOpportunitiesResult }
  | ComparableOpportunitiesRejection;

function matchesSpec(shot: ShotFact, spec: MatchingSpec): boolean {
  if (spec.distanceBand) {
    const d = shot.distance_to_hole_before_feet;
    if (d === null) return false;
    if (d < spec.distanceBand.minFt || d >= spec.distanceBand.maxFt) return false;
  }
  if (spec.lie !== null) {
    const lie = (shot.lie_before ?? '').toLowerCase();
    if (lie !== spec.lie.toLowerCase()) return false;
  }
  if (spec.shotRole !== null && shot.shot_type !== spec.shotRole) return false;
  return true;
}

function inWindow(iso: string, window: WindowBounds): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(window.start).getTime() && t <= new Date(window.end).getTime();
}

/**
 * Splits a shot to a side by window membership AND the intervention
 * instant. The instant is authoritative over the window bounds: even if a
 * caller passes windows that both technically contain a shot's timestamp,
 * a shot before `interventionAt` can never land in follow-up and a shot at
 * or after it can never land in baseline. See `interventionAt`'s doc
 * comment on {@link ComparableOpportunitiesInput} for the exactly-at-the-
 * instant boundary rule.
 */
function splitSide(
  shot: ShotFact,
  side: 'baseline' | 'followUp',
  input: ComparableOpportunitiesInput,
): boolean {
  const window = side === 'baseline' ? input.baselineWindow : input.followUpWindow;
  if (!inWindow(shot.observed_at, window)) return false;
  const t = new Date(shot.observed_at).getTime();
  const interventionMs = new Date(input.interventionAt).getTime();
  return side === 'baseline' ? t < interventionMs : t >= interventionMs;
}

function computeSide(
  input: ComparableOpportunitiesInput,
  side: 'baseline' | 'followUp',
): MetricResult {
  const spec = side === 'baseline' ? input.baselineSpec : input.followUpSpec;
  const window = side === 'baseline' ? input.baselineWindow : input.followUpWindow;
  const candidates = input.facts.filter(
    (s) => splitSide(s, side, input) && matchesSpec(s, spec),
  );
  const eligibleCount = candidates.length;
  const distinctRounds = new Set(candidates.map((s) => s.round_id)).size;

  let denominator = 0;
  let observedCount = 0;
  let numerator: number | null = null;
  let value: number | null = null;
  let unit: MetricResult['unit'];

  if (input.outcome.kind === 'rate') {
    unit = 'percent';
    let successes = 0;
    for (const s of candidates) {
      denominator += 1;
      observedCount += 1;
      if (input.outcome.isSuccess(s)) successes += 1;
    }
    if (denominator > 0) {
      numerator = successes;
      value = (successes / denominator) * 100;
    }
  } else {
    unit = input.outcome.unit;
    const values: number[] = [];
    for (const s of candidates) {
      const v = input.outcome.valueOf(s);
      if (v === null) continue;
      observedCount += 1;
      values.push(v);
    }
    denominator = values.length;
    if (values.length > 0) {
      value = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  const meetsFloor = denominator >= MIN_OPPORTUNITY_N && distinctRounds >= MIN_DISTINCT_ROUNDS;
  const status: MetricStatus = meetsFloor ? 'supported' : 'insufficient';

  return {
    scope: {
      player_id: input.player_id,
      window_start: window.start,
      window_end: window.end,
      analysis_cutoff: input.analysis_cutoff,
    },
    dimensions: {
      metricId: input.metricId,
      side,
      distanceBand: spec.distanceBand?.label ?? 'any',
      lie: spec.lie ?? 'any',
      shotRole: spec.shotRole ?? 'any',
    },
    metricId: input.metricId,
    unit,
    value,
    numerator,
    denominator,
    eligibleCount,
    observedCount,
    distinctRounds,
    status,
    exclusions: {},
  };
}

function buildRoundCourseMap(holes: readonly HoleContext[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const h of holes) {
    if (!map.has(h.round_id)) map.set(h.round_id, h.course_id);
  }
  return map;
}

function courseIdsFor(
  facts: readonly ShotFact[],
  side: 'baseline' | 'followUp',
  input: ComparableOpportunitiesInput,
  spec: MatchingSpec,
  roundCourseIds: Map<string, string | null>,
): Set<string> {
  const ids = new Set<string>();
  for (const s of facts) {
    if (!splitSide(s, side, input) || !matchesSpec(s, spec)) continue;
    const courseId = roundCourseIds.get(s.round_id);
    if (courseId) ids.add(courseId);
  }
  return ids;
}

function buildDisclosedDifferences(
  input: ComparableOpportunitiesInput,
  baseline: MetricResult,
  followUp: MetricResult,
  roundCourseIds: Map<string, string | null>,
): DisclosedDifferences {
  const baselineCourseIds = courseIdsFor(input.facts, 'baseline', input, input.baselineSpec, roundCourseIds);
  const followUpCourseIds = courseIdsFor(input.facts, 'followUp', input, input.followUpSpec, roundCourseIds);
  const baselineOnly = [...baselineCourseIds].filter((id) => !followUpCourseIds.has(id)).sort();
  const followUpOnly = [...followUpCourseIds].filter((id) => !baselineCourseIds.has(id)).sort();
  const shared = [...baselineCourseIds].filter((id) => followUpCourseIds.has(id)).sort();
  return {
    courseMix: { baselineOnly, followUpOnly, shared },
    opportunityCountImbalance: followUp.denominator - baseline.denominator,
  };
}

/**
 * Compares baseline vs follow-up rates/means over matched opportunities
 * around `input.interventionAt`. Returns a rejection (never a computed
 * result) when the two sides' specs disagree on what a "comparable
 * opportunity" even means — see {@link ComparableOpportunitiesRejection}.
 * Otherwise always returns a result: an unsupported side downgrades
 * `status` to `'insufficient_evidence'` rather than refusing to answer, the
 * same "state it, don't hide it" contract as `MetricResult.status`.
 */
export function computeComparableOpportunities(
  input: ComparableOpportunitiesInput,
): ComparableOpportunitiesOutcome {
  if (input.baselineSpec.distanceBandVersion !== input.followUpSpec.distanceBandVersion) {
    return { ok: false, reason: 'band_version_mismatch' };
  }
  if (input.baselineSpec.benchmarkVersion !== input.followUpSpec.benchmarkVersion) {
    return { ok: false, reason: 'benchmark_version_mismatch' };
  }

  const baseline = computeSide(input, 'baseline');
  const followUp = computeSide(input, 'followUp');
  const roundCourseIds = buildRoundCourseMap(input.holes);
  const disclosedDifferences = buildDisclosedDifferences(input, baseline, followUp, roundCourseIds);

  const bothSupported = baseline.status === 'supported' && followUp.status === 'supported';
  const observedChange =
    bothSupported && baseline.value !== null && followUp.value !== null
      ? followUp.value - baseline.value
      : null;

  const status: ComparableOpportunitiesStatus = !bothSupported
    ? 'insufficient_evidence'
    : input.multipleInterventions
      ? 'observed_change_limited'
      : 'observed_change';

  return {
    ok: true,
    result: {
      status,
      baseline,
      followUp,
      observedChange,
      methodVersion: COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
      multipleInterventions: input.multipleInterventions,
      disclosedDifferences,
    },
  };
}
