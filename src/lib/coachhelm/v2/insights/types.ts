/**
 * Canonical types for evidence-backed insights.
 *
 * Source of truth: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 * Every Tier-1 insight generator imports these from here — do not redeclare
 * the shapes in generator files.
 */

import type { InsightPriority } from '@/lib/coachhelm/insight-types';
// Re-export so v3 callers (engine/types, synthesis) resolve InsightPriority from one place.
export type { InsightPriority };

export type InsightCategory =
  | 'putting'
  | 'tee'
  | 'approach'
  | 'short_game'
  | 'scoring'
  | 'pressure'
  | 'course_management';

export type InsightUnit = 'percent' | 'strokes' | 'count' | 'yards' | 'feet';

/** What `InsightEvidence.sample_n` counts (Slice 0b, `04` §1.1). */
export type InsightSampleUnit =
  | 'putts'
  | 'approaches'
  | 'tee_shots'
  | 'shots'
  | 'rounds'
  | 'holes'
  | 'opportunities';

/**
 * Canonical set of comparison sources for evidence cards.
 *
 * Every generator MUST emit one of these values. The BaselineRegistry
 * (`src/lib/coachhelm/v2/insights/baseline-registry.ts`) enforces
 * label/source/value consistency — generators look up an entry by
 * BaselineKey and spread the result into the evidence object so the
 * three fields cannot disagree.
 *
 * - your_baseline:    compared to the player's own rolling history
 * - team_avg:         compared to teammates' aggregated rolling stats
 * - d1_avg / d2_avg / d3_avg / naia_avg / juco_avg: college-division
 *                     benchmarks. N16 (2026-09-23): as of this writing NONE
 *                     of these has a cited, measured division-population
 *                     figure behind it in this codebase — the one entry that
 *                     used to exist (`baseline-registry.ts`'s `d2_avg.*`) was
 *                     an unsourced approximation mislabeled "average"; it has
 *                     been relabeled a target. Do not add a new value under
 *                     one of these five sources unless it is a genuinely
 *                     cited, measured figure — an approximation belongs under
 *                     `estimated_target` instead, however plausible-sounding.
 * - pga_baseline:     PGA Tour benchmark
 * - absolute_target:  a known target value (par, uniform distribution, etc.)
 * - estimated_target: a DERIVED coaching target, not a measured population
 *                     average — e.g. the women's-college anchors in
 *                     `v3/counterfactual/cohort-baselines.ts`, which are LPGA /
 *                     NCAA figures discounted to college. Rendered as
 *                     "Estimated target" so a coach never reads it as a
 *                     measured norm (repair plan N16).
 * - cohort_avg:       the MEASURED average of the player's college cohort in
 *                     our data (`golf_player_standing.level_avg`: every active
 *                     player on a same-gender team, computed by the standing
 *                     refresh). The owner decision (2026-09-28): benchmarks
 *                     show the cohort AND the Tour, with priority and targets
 *                     anchored to the cohort — so a generator that sets
 *                     priority from level_avg prints it as the primary tick
 *                     and the Tour as `secondary_*`.
 *
 * `peer_percentile` was removed in 2026-05-17 (audit finding Q-NEW-12) —
 * it was being used against fixed reference points (uniform 4-way
 * distribution, balanced left/right) which are absolute targets, not
 * percentiles.
 */
export type InsightComparisonSource =
  | 'd2_avg'
  | 'd1_avg'
  | 'd3_avg'
  | 'naia_avg'
  | 'juco_avg'
  | 'your_baseline'
  | 'team_avg'
  | 'pga_baseline'
  | 'absolute_target'
  | 'estimated_target'
  | 'cohort_avg';

/** Runtime tuple matching {@link InsightComparisonSource} for validation. */
export const COMPARISON_SOURCES = [
  'your_baseline',
  'team_avg',
  'd1_avg',
  'd2_avg',
  'd3_avg',
  'naia_avg',
  'juco_avg',
  'pga_baseline',
  'absolute_target',
  'estimated_target',
  'cohort_avg',
] as const satisfies readonly InsightComparisonSource[];

/** Stable lookup key in the BaselineRegistry: `${source}.${bucket}`. */
export type BaselineKey = `${InsightComparisonSource}.${string}`;

export type InsightStrokesImpactMethod =
  | 'sg_baseline'
  | 'historical_correlation'
  | 'peer_delta'
  | 'rough_estimate';

export type InsightLifecycleState =
  | 'tentative'
  | 'detected'
  | 'matured'
  | 'addressed'
  | 'resolved'
  | 'archived';

export interface InsightConfidenceFactors {
  /** sample_n / target_n, capped at 1 */
  sample_adequacy: number;
  /** 1 if all within window_days/2; <1 if older-weighted */
  recency: number;
  /** 1 - (your_stddev / comparison_stddev), capped 0..1 */
  variance: number;
  /**
   * SV-1 honesty flag. Tri-state:
   * - `undefined` (default): legacy 3-factor blend — backward-compatible with
   *   every existing caller (v2 miners, the lifecycle cron's recency decay).
   * - `false`: `recency`/`variance` are placeholders (the v3 generators stamp
   *   recency=1.0/variance=0.5 because the aggregate carries no per-round
   *   dispersion or round dates). {@link calcConfidence} then drops both and
   *   surfaces honest sample-adequacy instead of a fabricated +0.45 floor.
   * - `true`: both are genuinely measured (per-round stddev + round-date spread)
   *   — blended at full weight, same as legacy.
   * `generator-base.run()` is the only writer today: it stamps `false` for
   *   placeholder rows and `true` when it computes real factors.
   */
  factors_measured?: boolean;
  /**
   * Which `calcConfidence` rule produced `evidence.confidence`. Stamped by
   * `upsertInsight` and the lifecycle cron on every write so a reader can
   * tell an `honest_v2` value (sample × freshness, monotone) from one the
   * pre-2026-09-12 branch produced (which jumped UP as recency fell below 1).
   * Absent on rows last written before the stamp existed.
   */
  method_version?: string;
}

export interface InsightEvidence {
  // What was measured
  metric: string;
  metric_label: string;
  unit: InsightUnit;
  /**
   * Which way `your_value` is good. Declared by the PRODUCER when the headline
   * value is not the quantity the registry entry for `metric` describes —
   * e.g. `approach_miss` keeps `metric: approach_proximity_*ft` (feet,
   * lower_better) for standing/signature continuity while `your_value` is the
   * green-hit PERCENT (higher_better). Readers (`tone-derivation.ts`) prefer
   * this over the registry direction; absent → registry, then a name-pattern
   * fallback. Additive: every existing row is unchanged.
   */
  polarity?: 'higher_better' | 'lower_better';

  // Your number
  your_value: number;
  your_value_display: string;

  // What you're being compared to (primary tick — typically team_avg)
  comparison_value: number;
  comparison_label: string;
  comparison_source: InsightComparisonSource;

  // Optional secondary tick — typically the PGA Tour benchmark for the same
  // metric. The EvidencePanel renders it as a second tick on the same scale
  // so the player can see where the team avg sits relative to Tour grade.
  secondary_value?: number;
  secondary_label?: string;
  secondary_source?: InsightComparisonSource;

  // Sample / window
  sample_n: number;
  /**
   * What `window_days` measures. `'lifetime'`: the value is an all-time
   * aggregate (e.g. the stats cache) and `window_days` is only the span
   * between the first and last contributing round — renderers must say
   * "lifetime", never "N days", because the value is not windowed.
   * `'rolling'` or absent: the value is computed over the last `window_days`.
   * Additive (audit row 12, 2026-09-28).
   */
  window_basis?: 'lifetime' | 'rolling';
  window_days: number;
  window_start: string; // ISO
  window_end: string;   // ISO
  /**
   * Slice 0b freshness stamps (additive). Written by the v3 engine from the
   * rounds the read was computed over (`v3/engine/read-window.ts`):
   * `sample_unit` names what `sample_n` counts, `rounds_n` is the countable
   * rounds that contributed, `newest_round_id` is the newest of them, and
   * `scanned_through_round_id` is the newest countable round the read looked
   * at (a newer round can add nothing to a family, e.g. no bunker shot).
   * Absent on v2 rows and on v3 rows written before the stamp existed.
   */
  sample_unit?: InsightSampleUnit;
  rounds_n?: number;
  newest_round_id?: string;
  scanned_through_round_id?: string;
  /**
   * The completed, non-test rounds inside [window_start, window_end] that the
   * row was computed from (audit row 22), newest first, capped at 200. Lets
   * the evidence drill-down show exactly which rounds back the claim.
   */
  source_round_ids?: string[];

  // Impact
  strokes_impact: number;
  strokes_impact_method: InsightStrokesImpactMethod;

  // Confidence
  confidence: number; // 0..1
  confidence_factors: InsightConfidenceFactors;

  // Generator-specific drill-down detail (optional)
  detail?: Record<string, unknown>;

  // Phase A reads this flag to keep the insight out of the actionable feed /
  // leverage-priority floor. Set by generators whose card is purely descriptive
  // (e.g. par-type standing rows) — the scoreInsight / leveragePriorityFloor
  // logic in generator-base must skip these rather than boosting them.
  feed_exempt?: boolean;

  // P0-06 composite honesty. Composite insights synthesize a cause from
  // multiple Tier-1 signals; most are HYPOTHESES, not measured sequences.
  // `causality_level` records whether the cascade was actually observed in a
  // shot sequence (`observed_sequence`) or inferred by combining standings
  // (`inferred_hypothesis`). `estimated` marks a metric whose value is a
  // computed projection (e.g. an expected 3-putt rate derived from two make-%s),
  // not a directly measured stat — the UI surfaces it as "estimated". Both are
  // optional + additive so every existing single-metric generator is unchanged.
  causality_level?: CausalityLevel;
  estimated?: boolean;

  // P0-05 structured root cause. Single-metric V3 generators and composites
  // both stamp a machine-readable diagnosis here so downstream surfaces can
  // filter/compare/audit/learn from the root cause instead of parsing prose
  // out of `content`. Optional + additive — every legacy v2 row is unchanged.
  diagnosis?: Diagnosis;

  // Coach voice (PR #2073, `ComposedContent.coach`): the generator's
  // title/content retold for a coach in neutral third person. `title`/
  // `content` stay in the player's voice. Optional + additive; no generator
  // on main sets it yet.
  coach_copy?: InsightCoachCopy;

  // Honest root cause (CoachHelm supercharge Slice 2, `v3/engine/root-cause.ts`,
  // behind the `coachhelm_root_cause_diagnosis` flag). Which of the three cause
  // states the read is in, with its counts. `diagnosis.root_cause` is the
  // sentence generated from it for older readers. Absent on every row written
  // with the flag off, and on strength/neutral rows.
  cause?: InsightCause;
  /** The one missing field that stops the cause being traced (mirrors
   *  `cause.data_gap`; drives the one-tap capture later). */
  data_gap?: InsightDataGap;

  // Benchmark ladder (CoachHelm supercharge Slice 7a, `04` §1.1), behind the
  // `coachhelm_team_pool_v1` flag. `primary` is the line the words use (the
  // team pool when it meets its floor); `lines` keeps the Tour as a further
  // line. Additive: the flat `comparison_*` fields, the standing block and
  // the strokes arithmetic stay on the Tour. Absent on every row written with
  // the flag off.
  comparison?: InsightComparison;
}

/** Where one comparison line comes from (`04` §1.1). Only `team_pool` and
 *  `tour` are written today; the rest are reserved for later slices. */
export type ComparisonLineSource =
  | 'team_pool'
  | 'program_pool'
  | 'level_anchor'
  | 'tour'
  | 'self_best'
  | 'self_prior'
  | 'self_other';

export interface ComparisonLine {
  source: ComparisonLineSource;
  /** "Team pool", "PGA Tour make % avg". */
  label: string;
  /** In the read's own scale (`your_value`'s): a percent as 0-100. */
  value: number;
  /** What the line counts (pooled putts, holes, rounds); null for an anchor. */
  n: number | null;
  /** The read's value unit (`evidence.unit`). */
  unit: InsightUnit;
  /** What `n` counts. */
  n_unit?: InsightSampleUnit;
  /** The word for `n` when the unit is not enough ("bunker holes"). */
  n_noun?: string;
  /** Teammates pooled (never who): a team_pool line only. */
  players?: number;
  /** The days the pool covered (YYYY-MM-DD); a team_pool line only. */
  window_start?: string | null;
  window_end?: string;
  citation?: string;
}

export interface InsightComparison {
  primary: ComparisonLine;
  lines: ComparisonLine[];
}

export interface InsightCoachCopy {
  title: string;
  content: string;
}

/**
 * The three cause states (supercharge 03 §3.2):
 * - `observed_sequence` ("counted"): a recorded shot path leads the failing
 *   population (≥ 4 occurrences and ≥ 30% of ≥ 10 events over ≥ 3 rounds).
 * - `inferred_hypothesis` ("likely from totals"): no counted path, but the
 *   failures concentrate in one context with both arms counted (lift ≥ 1.25,
 *   ≥ 10 per arm, Newcombe lower bound of the difference > 0, family-wise 95% over the
 *   slices tried).
 * - `not_traced`: neither; `not_traced_reason` says why (a count-down to the
 *   floor, a data gap naming the one missing field, …).
 */
export type InsightCauseState = 'observed_sequence' | 'inferred_hypothesis' | 'not_traced';

export type InsightNotTracedReason =
  /** The failing population is under the floor: `count_down` says how far. */
  | 'count_down'
  /** One optional field is recorded on < 60% of the failures: `data_gap`. */
  | 'data_gap'
  /** Population and fields are there; no single path leads. */
  | 'no_leading_path'
  /** A path repeats, but this family may not claim a counted cause (tee shots,
   *  opening holes: ladder cap, supercharge 02 §6-7). */
  | 'pattern_only'
  /** No recorded shot path measures this metric (e.g. practice vs tournament). */
  | 'no_shot_path'
  /** The read carries no stamped window, so nothing was checked. */
  | 'no_window'
  /** The shot records could not be read on this run. */
  | 'load_failed';

/** One arm-by-arm association (the "likely from totals" evidence). Rates are fractions. */
export interface InsightCauseAlternative {
  label: string;
  /** Slice rate ÷ rest rate; null when the rest never failed. */
  lift: number | null;
  arm_a: { n: number; failures: number; rate: number };
  arm_b: { n: number; failures: number; rate: number };
  /** Newcombe lower bound of `arm_a.rate − arm_b.rate`, as a fraction,
   *  Bonferroni-widened over the slices tried (family-wise 95%). */
  lower_bound: number;
  upper_bound: number;
}

export interface InsightDataGap {
  /** The `golf_shots` field that is missing (e.g. `miss_direction`). */
  field: string;
  /** Which shots the one tap belongs on. */
  shot_filter: Record<string, unknown>;
  /** How many of the next failures must carry the field for coverage to
   *  reach 60%: the smallest x with (have_count + x) / (of + x) ≥ 0.6. */
  target_count: number;
  /** Failures that already carry the field. */
  have_count: number;
  prompt: string;
}

export interface InsightCause {
  state: InsightCauseState;
  /** The failing population the counts are quoted against ("missed greens from 125–175 yd"). */
  population: string | null;
  /** Window actually read, "2026-08-01 to 2026-10-17"; null when none. */
  window: string | null;
  /** Counted path steps; null unless `observed_sequence`. */
  path: string[] | null;
  occurrences: number | null;
  denominator: number | null;
  distinct_rounds: number | null;
  /** Up to 5 holes where the path was recorded. */
  example_holes: Array<{ round_id: string; hole_number: number }>;
  /** Mean strokes vs the SG baseline on the failing events (negative = lost). */
  event_strokes: number | null;
  checked: { holes_with_full_record: number; of: number; fields_missing: string[] };
  /** Present (one row) for `inferred_hypothesis`; empty otherwise. */
  alternatives: InsightCauseAlternative[];
  data_gap: InsightDataGap | null;
  /** Always null from the engine; reserved for coach corrections (Slice 6). */
  coach_override: { text: string; author_role: string; at: string } | null;
  /** Present for `not_traced`. */
  not_traced_reason?: InsightNotTracedReason;
  /** Present for a `count_down`: events and rounds needed vs had. */
  count_down?: { need_events: number; need_rounds: number; have_events: number; have_rounds: number };
}

/**
 * P0-06 — how a composite insight knows its cause is real.
 *
 * - `observed_sequence`: the cascade was measured in an actual shot/hole
 *   sequence (e.g. a recorded long approach → 3-putt on the SAME hole). Only
 *   this level may be presented to the coach as fact.
 * - `inferred_hypothesis`: the cause is a coach hypothesis formed by combining
 *   independent standings (e.g. a weak lag standing + a weak short-putt
 *   standing → "likely 3-putt cascade"). Must be framed as a hypothesis and
 *   carries a calibrated-down confidence. Single-metric V3 generators (P0-05)
 *   also use this level: a per-metric root cause is inferred from the statistic,
 *   never replayed from a measured shot sequence.
 */
export type CausalityLevel = 'observed_sequence' | 'inferred_hypothesis';

/**
 * One quantified driver behind a {@link Diagnosis} (P0-05). Every field is
 * sourced from data the generator already cited — nothing is fabricated. Lets
 * downstream surfaces filter/compare/learn from root causes instead of parsing
 * prose.
 */
export interface DiagnosisDriver {
  /** Canonical metric id this driver reads (e.g. 'putts_made_3_5ft_pct'). */
  metric: string;
  /**
   * Human label for THIS driver's value. Set by the producer when the value
   * is not the registry quantity for `metric` (the approach_miss green-hit %
   * under a proximity id); the DiagnosisPanel prefers it over the registry
   * display label so a percent never renders under a feet-metric heading.
   */
  label?: string;
  /** The measured value of that metric. */
  value: number;
  /** Unit of `value`. */
  unit: InsightUnit;
  /** Observations the value is computed over. */
  sample_n: number;
  /** Where the value came from (table.column or a short provenance string). */
  source: string;
}

/**
 * Structured root-cause diagnosis attached to every V3 insight's evidence
 * (P0-05). Production had 322 V3 rows with the diagnosis embedded only in prose
 * — 0 had a machine-readable root cause, drivers, or confidence reason. This is
 * the typed replacement; the prose `content` still renders for humans, but the
 * structure is what downstream surfaces filter, compare, audit, and learn from.
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
  /** Plain-language reason for the confidence value (sample/recency/variance). */
  confidence_reason: string;
  /**
   * What the root cause rests on (PR #2073, `v3/engine/root-cause.ts`).
   * Optional + additive: rows written before it (and every non-v3 producer)
   * omit it, and every reader treats absence as "not stated".
   */
  basis?: DiagnosisBasis;
}

/**
 * A5 controlled-hypothesis label, surfaced on a diagnosis. `corroborated` is
 * `hypothesis-policy.ts`'s `supported_association` — an association a
 * supported metric agrees with, never a causal claim.
 */
export type DiagnosisHypothesisLabel = 'no_data' | 'candidate' | 'corroborated';

/**
 * The evidence a {@link Diagnosis} rests on.
 * - `shot_sequence`: a counted recorded shot path (`observed_sequence`).
 * - `hypothesis_policy`: not traced to a sequence; an A5 family was evaluated.
 * - `aggregate_only`: not traced, and no A5 family applies.
 */
export interface DiagnosisBasis {
  kind: 'shot_sequence' | 'hypothesis_policy' | 'aggregate_only';
  hypothesis_label?: DiagnosisHypothesisLabel;
  /** Plain statements of what was actually checked. */
  checked: string[];
  /** Present iff `kind === 'shot_sequence'`. */
  sequence?: {
    pattern: string;
    occurrences: number;
    of: number;
    population: string;
    distinct_rounds: number;
    window: string;
    examples?: Array<{ round_id: string; hole_number: number; hole_id?: string | null }>;
  };
  /** Context narrowing (length → par × length → shape), each step gated. */
  narrowing?: DiagnosisNarrowing;
}

export interface DiagnosisNarrowing {
  subject: 'approach' | 'tee' | 'par_scoring';
  /** Labels of the steps that passed, e.g. ["175+ yd", "long par 4s", "short-right"]. */
  path: string[];
  /** First step that failed its gate; null when every step passed. */
  stopped_at: 'length' | 'par' | 'shape' | null;
  steps: Array<{ level: 'length' | 'par' | 'shape'; passed: boolean; label: string | null; statement: string }>;
  sentence: string;
  excluded?: Record<string, number>;
}

export interface InsightMovement {
  from: number;
  to: number;
  direction: 'up' | 'down';
  percent_change: number; // signed fraction (e.g. 0.12 = +12%, -0.08 = -8%)
}

export interface InsightInput {
  player_id: string | null;
  coach_id?: string | null;
  team_id?: string | null;
  category: InsightCategory;
  insight_type?: string;
  signature: string;
  title: string;
  content: string;
  evidence: InsightEvidence;
  metadata?: Record<string, unknown>;
  drill_tags?: string[];
  /** Severity hint. Absent → the DB default 'medium' stands. Composites pass
   *  rule.priority; single-metric generators pass a computed value via
   *  ComposedContent.priority. The existing-row UPDATE path never writes it
   *  (coach/triage intent is preserved). */
  priority?: InsightPriority;
}

/** Current `calcConfidence` rule id — see `InsightConfidenceFactors.method_version`. */
export const CONFIDENCE_METHOD_VERSION = 'honest_v2';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

/**
 * Standard confidence calculation (Rule 1 of the design contract).
 * Every generator must use this — do not inline variants.
 *
 * SV-1: the historical blend `0.4·sample + 0.3·recency + 0.3·variance` silently
 * added a fabricated +0.45 floor whenever generators stamped the recency=1.0 /
 * variance=0.5 placeholders. When `confidence_factors.factors_measured === false`
 * those two are known-placeholders, so variance is dropped and the value is
 * honest sample adequacy scaled by freshness.
 *
 * 2026-09-12 (`honest_v2`): the first honest-mode rule switched formulas at
 * recency < 1 — `(0.4·sa + 0.3·rec) / 0.7` — which is DISCONTINUOUS at the
 * boundary: sa 0.24 scored 0.24 fully fresh but 0.56 at recency 0.99, so a
 * row that merely aged past its window cleared the 0.4 tentative floor (41 of
 * 208 production candidates got there only that way). The rule is now
 * `sa · (1 − (3/7)·(1 − rec))`: exactly `sa` at recency 1 (every fresh row is
 * unchanged), monotone non-increasing in age, and the same 0.4/0.3 weighting
 * expressed as a freshness multiplier instead of a second formula. It is a
 * support score, not a calibrated probability.
 *
 * `undefined` (the default) keeps the legacy blend for backward compatibility:
 * every v2 miner is unchanged. `true` means both factors are genuinely measured.
 */
export function calcConfidence(
  evidence: Pick<InsightEvidence, 'confidence_factors'>,
): number {
  const { sample_adequacy, recency, variance, factors_measured } =
    evidence.confidence_factors;
  if (factors_measured === false) {
    const sa = clamp01(sample_adequacy);
    const freshness = clamp01(recency);
    return sa * (1 - (1 - freshness) * (3 / 7));
  }
  // Legacy / fully-measured blend (default).
  return 0.4 * sample_adequacy + 0.3 * recency + 0.3 * variance;
}
