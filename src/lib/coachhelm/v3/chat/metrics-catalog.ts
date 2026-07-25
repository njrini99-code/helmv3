/**
 * ============================================================================
 * CoachHelm · chat · metrics catalog — the only metrics the agent can ask for
 * ----------------------------------------------------------------------------
 * A closed list, on purpose. The agent picks a `metric_id` from this catalog;
 * the catalog says which cached column holds it, what unit it is in, which
 * direction is good, and — where one exists — which column holds the ATTEMPT
 * COUNT behind a percentage.
 *
 * That last part is the reason this file exists rather than a switch statement
 * somewhere. "58%" with no denominator is the most confidently misleading
 * number in golf analytics: it reads identically whether it came from 43
 * attempts or 4. Pairing every rate with its attempt column at the schema level
 * means a measurement physically cannot be built without one.
 *
 * Adding a metric here is additive and safe. Letting the agent name an
 * arbitrary column is not, which is why there is no escape hatch.
 * ========================================================================== */

import type { Measurement } from './provenance';

type Unit = Measurement['unit'];
type Direction = 'higher_better' | 'lower_better';

export interface MetricSpec {
  /** Stable key the agent uses. */
  id: string;
  /** What the coach reads. Sentence case, no jargon. */
  label: string;
  unit: Unit;
  direction: Direction;
  /** Column on `golf_player_stats_cache` holding the value. */
  column: string;
  /**
   * Column holding the attempts/denominator, when the metric is a rate.
   * Null means the metric's sample is the round count, not an attempt count.
   */
  attemptsColumn: string | null;
  /** What one unit of the sample is, for honest "n = 43 attempts" copy. */
  sampleUnit: Measurement['sample_unit'];
  /** Calculation identifier so two numbers are only ever compared like with like. */
  method: string;
  /** Short coach-facing gloss used in empty/partial states. */
  blurb: string;
}

const SPECS: MetricSpec[] = [
  // ── Scoring ──────────────────────────────────────────────────────────────
  {
    id: 'scoring_average',
    label: 'Scoring average',
    unit: 'score',
    direction: 'lower_better',
    column: 'scoring_average',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'mean_total_score_over_completed_rounds',
    blurb: 'mean total score across completed rounds',
  },
  {
    id: 'scoring_average_vs_par',
    label: 'Scoring average to par',
    unit: 'score',
    direction: 'lower_better',
    column: 'scoring_average_vs_par',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'mean_score_to_par_over_completed_rounds',
    blurb: 'mean score relative to par',
  },

  // ── Strokes gained ───────────────────────────────────────────────────────
  {
    id: 'sg_total',
    label: 'Strokes gained total',
    unit: 'strokes',
    direction: 'higher_better',
    column: 'sg_total_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'sg_per_round_vs_broadie_baseline',
    blurb: 'strokes gained per round against the expected-strokes baseline',
  },
  {
    id: 'sg_putting',
    label: 'Strokes gained putting',
    unit: 'strokes',
    direction: 'higher_better',
    column: 'sg_putting_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'sg_per_round_vs_broadie_baseline',
    blurb: 'putting strokes gained per round',
  },
  {
    id: 'sg_approach',
    label: 'Strokes gained approach',
    unit: 'strokes',
    direction: 'higher_better',
    column: 'sg_approach_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'sg_per_round_vs_broadie_baseline',
    blurb: 'approach strokes gained per round',
  },
  {
    id: 'sg_tee',
    label: 'Strokes gained off the tee',
    unit: 'strokes',
    direction: 'higher_better',
    column: 'sg_tee_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'sg_per_round_vs_broadie_baseline',
    blurb: 'tee-shot strokes gained per round',
  },
  {
    id: 'sg_around_green',
    label: 'Strokes gained around the green',
    unit: 'strokes',
    direction: 'higher_better',
    column: 'sg_around_green_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'sg_per_round_vs_broadie_baseline',
    blurb: 'short-game strokes gained per round',
  },

  // ── Ball striking ────────────────────────────────────────────────────────
  {
    id: 'gir_pct',
    label: 'Greens in regulation',
    unit: 'percent',
    direction: 'higher_better',
    column: 'gir_percentage',
    attemptsColumn: 'greens_total',
    sampleUnit: 'holes',
    method: 'greens_hit_over_greens_total',
    blurb: 'greens hit in regulation',
  },
  {
    id: 'driving_accuracy_pct',
    label: 'Driving accuracy',
    unit: 'percent',
    direction: 'higher_better',
    column: 'driving_accuracy_percentage',
    attemptsColumn: 'fairways_total',
    sampleUnit: 'holes',
    method: 'fairways_hit_over_fairways_total',
    blurb: 'fairways hit off the tee',
  },
  {
    id: 'scrambling_pct',
    label: 'Scrambling',
    unit: 'percent',
    direction: 'higher_better',
    column: 'scrambling_percentage',
    attemptsColumn: 'scramble_attempts',
    sampleUnit: 'attempts',
    method: 'scrambles_converted_over_attempts',
    blurb: 'up-and-down conversion after missing the green',
  },
  {
    id: 'sand_save_pct',
    label: 'Sand saves',
    unit: 'percent',
    direction: 'higher_better',
    column: 'sand_save_percentage',
    attemptsColumn: 'sand_attempts',
    sampleUnit: 'attempts',
    method: 'sand_saves_over_sand_attempts',
    blurb: 'up-and-down conversion from a bunker',
  },

  // ── Putting ──────────────────────────────────────────────────────────────
  {
    id: 'putts_per_round',
    label: 'Putts per round',
    unit: 'count',
    direction: 'lower_better',
    column: 'putts_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'total_putts_over_rounds',
    blurb: 'putts taken per round',
  },
  {
    id: 'three_putt_pct',
    label: 'Three-putt rate',
    unit: 'percent',
    direction: 'lower_better',
    column: 'three_putt_percentage',
    attemptsColumn: null,
    sampleUnit: 'holes',
    method: 'three_putt_holes_over_holes',
    blurb: 'holes ending in three or more putts',
  },
  {
    id: 'one_putt_pct',
    label: 'One-putt rate',
    unit: 'percent',
    direction: 'higher_better',
    column: 'one_putt_percentage',
    attemptsColumn: null,
    sampleUnit: 'holes',
    method: 'one_putt_holes_over_holes',
    blurb: 'holes converted in a single putt',
  },

  // ── Mistakes ─────────────────────────────────────────────────────────────
  {
    id: 'penalties_per_round',
    label: 'Penalty strokes per round',
    unit: 'count',
    direction: 'lower_better',
    column: 'penalty_strokes_per_round',
    attemptsColumn: null,
    sampleUnit: 'rounds',
    method: 'penalty_strokes_over_rounds',
    blurb: 'penalty strokes incurred per round',
  },
];

/**
 * Putting make-rate by distance, with each bucket's attempt column.
 *
 * Split out from the flat catalog because a distance profile is a SERIES, not
 * a single value — and because it is the one place where the attempt count
 * genuinely changes the coaching conclusion. A 12-point drop inside 8 feet over
 * 43 attempts is a finding; over 4 attempts it is noise wearing a percentage.
 */
export const PUTT_DISTANCE_BUCKETS: {
  bucket: string;
  pctColumn: string;
  attemptsColumn: string | null;
}[] = [
  { bucket: '0-3 ft', pctColumn: 'putt_make_pct_0_3ft', attemptsColumn: null },
  { bucket: '3-5 ft', pctColumn: 'putt_make_pct_3_5ft', attemptsColumn: 'putt_attempts_3_5ft' },
  { bucket: '5-10 ft', pctColumn: 'putt_make_pct_5_10ft', attemptsColumn: 'putt_attempts_5_10ft' },
  { bucket: '10-15 ft', pctColumn: 'putt_make_pct_10_15ft', attemptsColumn: 'putt_attempts_10_15ft' },
  { bucket: '15-25 ft', pctColumn: 'putt_make_pct_15_25ft', attemptsColumn: 'putt_attempts_15_25ft' },
  { bucket: '25+ ft', pctColumn: 'putt_make_pct_25_plus_ft', attemptsColumn: 'putt_attempts_25_plus_ft' },
];

const BY_ID = new Map(SPECS.map((s) => [s.id, s]));

/** Every metric id the agent may name. Used to build the tool's zod enum. */
export const METRIC_IDS = SPECS.map((s) => s.id) as [string, ...string[]];

export function getMetricSpec(id: string): MetricSpec | null {
  return BY_ID.get(id) ?? null;
}

export const ALL_METRIC_SPECS: readonly MetricSpec[] = SPECS;

/** Every stats-cache column the catalog can read — the exact SELECT list. */
export function statsCacheColumns(): string[] {
  const cols = new Set<string>([
    'player_id',
    'rounds_played',
    'rounds_in_calculation',
    'calculation_period_start',
    'calculation_period_end',
    'first_round_date',
    'last_round_date',
    'updated_at',
    'is_stale',
  ]);
  for (const s of SPECS) {
    cols.add(s.column);
    if (s.attemptsColumn) cols.add(s.attemptsColumn);
  }
  for (const b of PUTT_DISTANCE_BUCKETS) {
    cols.add(b.pctColumn);
    if (b.attemptsColumn) cols.add(b.attemptsColumn);
  }
  return [...cols];
}
