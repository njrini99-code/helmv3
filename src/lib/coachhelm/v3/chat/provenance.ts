/**
 * ============================================================================
 * CoachHelm · chat · provenance — the envelope every number travels inside
 * ----------------------------------------------------------------------------
 * The first grounding check asked one question: "did a tool run?" That proves
 * almost nothing. A tool can run, return three rounds, and the model can still
 * write "his make rate fell from 71% to 58%" out of thin air — the check passes
 * because *a* tool ran, not because those two numbers came from it.
 *
 * So a statistic is no longer a bare number. It is a {@link Measurement}: a
 * value plus everything a coach would need to decide whether to believe it —
 * what was measured, of whom, over which dates, from how many rounds, computed
 * when, by which method, and how complete the underlying data was.
 *
 * Three rules follow from that shape, and they are enforced, not documented:
 *
 *   1. Tools return Measurements. Never a loose float.
 *   2. The renderers draw from Measurements. A chart's points and a table's
 *      cells are tool output, never model prose that got parsed.
 *   3. After a turn the grounding check (grounding.ts) compares the numbers in
 *      the answer with the Measurements the conversation's reads produced and
 *      logs what it could not match. It never holds an answer back.
 *
 * `coverage` is the honest part. `partial` and `empty` are first-class results,
 * not error paths — "one player has no rounds in this window" is a real answer
 * and the UI has a state for it. What we refuse to do is let a truncated query
 * or a failed join read as "no data".
 * ========================================================================== */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/**
 * How completely the underlying data answers the question that was asked.
 *
 * `partial` is deliberately distinct from `empty`. "We found 3 of your 7
 * players" and "we found nobody" lead a coach to different actions, and
 * collapsing them is how a roster of seven silently becomes six.
 */
const CoverageState = z.enum([
  /** Every entity in scope had data for the whole window. */
  'complete',
  /** Some entities or some of the window had no data. `coverage_note` says which. */
  'partial',
  /** Nothing in scope had data. A real answer — not a failure. */
  'empty',
  /**
   * The query itself failed or was truncated. NEVER render this as "no data";
   * the honest statement is "we could not read this", which is a different
   * sentence and a different next step.
   */
  'unavailable',
]);
/**
 * A whole read can also be `not_tracked`: the question asks for something the app does not record at all (a launch
 * monitor number, which club was hit). Not `empty`: there is no window in which it would exist. `coverage_note` says
 * what is not recorded and `nearest` names the closest figures that are. A single measurement is never `not_tracked`.
 */
const EnvelopeCoverage = z.enum([...CoverageState.options, 'not_tracked']);
export type CoverageState = z.infer<typeof CoverageState>;

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

/**
 * A external reference standard, with its provenance attached.
 *
 * A Tour comparison may only appear when one of these was actually retrieved.
 * The rule the product cares about is not "don't mention the PGA Tour" — it is
 * "never invent a baseline", so the source and the version travel with the
 * number and the UI prints them next to it.
 */
const BenchmarkRef = z.object({
  /** Human-readable source, e.g. 'PGA Tour (Broadie expected strokes)'. */
  source: z.string(),
  /** Version/season identifier of the baseline actually used. */
  version: z.string(),
  /** The reference value on the same scale + unit as the measurement. */
  value: z.number(),
  /**
   * True when this metric has NO credible anchor for the player's cohort (e.g.
   * a women's-team player on a metric with only a men's baseline). The renderer
   * suppresses the marker rather than drawing a misleading one.
   */
  omitted_for_cohort: z.boolean().default(false),
});
export type BenchmarkRef = z.infer<typeof BenchmarkRef>;

/**
 * One of the three things a figure is read against, always in this order: the player's level (college players of the same gender, or the
 * published division average), the team average, the Tour. A reference with no value is still listed, with `note` saying why, so a missing
 * one is stated and never silently dropped. `place_percent` is where the player sits among them (higher is better, whichever way the metric runs).
 */
export const Comparison = z.object({
  kind: z.enum(['level', 'team', 'tour']),
  /** What the value is the average of, in words: "Division III average", "College players on Helm", "Team average", "PGA Tour". */
  label: z.string(),
  value: z.number().nullable(),
  place_percent: z.number().nullable().default(null),
  /** The team's rank, 1 best (direction applied), among the `place_of` players who have a figure over the same window. Team only. */
  place: z.number().nullable().default(null),
  /** How many players the place is among. */
  place_of: z.number().nullable().default(null),
  /**
   * The player's own figure on this reference's basis, when that is not the measurement's value: the level is over all recorded rounds, so beside it
   * stands the player's all-rounds figure and never the window one. Level only; null elsewhere.
   */
  your_value: z.number().nullable().optional(),
  note: z.string().nullable().default(null),
  /** When `value` is null, the short reason the card and chip print: "not set", "no college figure", "no team average yet". */
  missing_reason: z.string().nullable().default(null),
});
export type Comparison = z.infer<typeof Comparison>;

/**
 * The one baseline this product is allowed to cite, with its real provenance.
 *
 * Sourced from Mark Broadie's expected-strokes model (ShotLink), recalibrated
 * in migration `20260606140000_fix_sg_expected_strokes_baseline_calibration`.
 * It is a single constant so no call site can quietly cite a different one.
 */
export const BROADIE_BENCHMARK = {
  source: 'PGA Tour expected strokes (Broadie / ShotLink)',
  version: '2026-06-06 calibration',
} as const;

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

/** What the measurement is *about* — a player, the team, or one round. */
const MeasuredEntity = z.object({
  kind: z.enum(['player', 'team', 'round']),
  /** Database id. Never rendered to the coach; used for deep links + validation. */
  id: z.string(),
  /** Display name. This is what the coach reads. */
  label: z.string(),
});
export type MeasuredEntity = z.infer<typeof MeasuredEntity>;

/**
 * One statistic, with everything needed to trust it.
 *
 * Every field here exists because its absence produced a real failure mode:
 * no `sample_size` and "his putting is down" rests on two putts; no `as_of` and
 * a week-old cache reads as this morning; no `window_start`/`window_end` and
 * "lifetime" quietly means "the 20 rows the query happened to return".
 */
export const Measurement = z.object({
  /** Stable metric key, e.g. 'putts_per_round', 'sg_putting', 'make_rate_inside_8ft'. */
  metric_id: z.string(),
  /** What the coach should read, e.g. 'Make rate inside 8 feet'. */
  metric_label: z.string(),
  /** Unit for display. 'percent' | 'strokes' | 'yards' | 'feet' | 'count' | 'score'. */
  unit: z.enum(['percent', 'strokes', 'yards', 'feet', 'count', 'score', 'ratio']),
  /** The value itself, on the unit's natural scale. Null when genuinely absent. */
  value: z.number().nullable(),

  entity: MeasuredEntity,

  /** Inclusive ISO date bounds of the window this value covers. */
  window_start: z.string().nullable(),
  window_end: z.string().nullable(),
  /**
   * How many observations produced the value — rounds, attempts, shots. The
   * `sample_unit` names which, so "43" is never ambiguous.
   */
  sample_size: z.number().int().nonnegative(),
  sample_unit: z.enum(['rounds', 'shots', 'attempts', 'holes', 'events', 'players']),

  /** When this value was computed. A cached stat exposes its cache timestamp. */
  as_of: z.string(),

  coverage: CoverageState,
  /** Present whenever coverage is not 'complete' — says exactly what is missing. */
  coverage_note: z.string().nullable().default(null),

  /** Safe source label, e.g. 'rounds', 'shots', 'stats cache'. Never raw SQL. */
  source: z.string(),
  /** Calculation identifier so two numbers can be compared like with like. */
  method: z.string(),

  /** Denominator when the value is a rate, so "58%" can be shown as 25/43. */
  denominator: z.number().nullable().default(null),

  /** Only present when a real, versioned benchmark was retrieved. The level when there is one, else the Tour: what a chip grades against. */
  benchmark: BenchmarkRef.nullable().default(null),

  /** The level, the team average and the Tour, in that order, for a metric the standards cover; absent for any other. A team-level figure carries level and Tour only. */
  comparisons: z.array(Comparison).optional(),

  /**
   * 'higher_better' | 'lower_better'. Charts read this instead of assuming up
   * is good — for putts-per-round, down is good.
   */
  direction: z.enum(['higher_better', 'lower_better']).nullable().default(null),
});
export type Measurement = z.infer<typeof Measurement>;

/**
 * A time series of the same metric for one entity — the input to a trend chart.
 *
 * `points` are already aggregated server-side. Raw shot rows never reach the
 * model or the browser: a 43-attempt putting question is answered by an
 * aggregate, not by 43 rows the model is invited to add up itself.
 */
export const MeasurementSeries = z.object({
  metric_id: z.string(),
  metric_label: z.string(),
  unit: Measurement.shape.unit,
  entity: MeasuredEntity,
  points: z.array(
    z.object({
      /** ISO date of the observation (round date, or the bucket's end). */
      at: z.string(),
      value: z.number(),
      /** Optional label for a categorical bucket, e.g. '3-8 ft'. */
      bucket: z.string().nullable().default(null),
      sample_size: z.number().int().nonnegative().default(0),
    }),
  ),
  window_start: z.string().nullable(),
  window_end: z.string().nullable(),
  as_of: z.string(),
  coverage: CoverageState,
  coverage_note: z.string().nullable().default(null),
  source: z.string(),
  method: z.string(),
  benchmark: BenchmarkRef.nullable().default(null),
  direction: z.enum(['higher_better', 'lower_better']).nullable().default(null),
});
export type MeasurementSeries = z.infer<typeof MeasurementSeries>;

/**
 * The standard envelope every read tool returns.
 *
 * `measurements` is the load-bearing field: it is what the renderers draw, what a
 * visual copies its figures from, and what the grounding check (grounding.ts)
 * compares an answer's numbers with.
 */
export const ToolEnvelope = z.object({
  /** One-line, coach-readable summary of what was read. No table names. */
  summary: z.string(),
  measurements: z.array(Measurement).default([]),
  series: z.array(MeasurementSeries).default([]),
  /** Free-form structured payload for renderers that need more than numbers. */
  detail: z.unknown().optional(),
  coverage: EnvelopeCoverage,
  coverage_note: z.string().nullable().default(null),
  as_of: z.string(),
  /** The window the read actually covered, in the scope line's words ("last 10 rounds"). Set by the read wrapper (window-label.ts); absent on older stored reads and on reads with no window. */
  window_label: z.string().optional(),
  /** With `coverage: 'not_tracked'`: the closest figures the app does record, by the name a coach sees. Empty when nothing is close. */
  nearest: z.array(z.string()).optional(),
});
export type ToolEnvelope = z.infer<typeof ToolEnvelope>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Current instant as an ISO string. One place, so tests can reason about it. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Derive the coverage state for an "N of M entities had data" read.
 *
 * Centralised because getting it wrong is the exact bug that made a 7-player
 * roster report 6: `found === 0` must be `empty`, `found < expected` must be
 * `partial`, and neither may be silently rounded to `complete`.
 */
export function coverageFor(found: number, expected: number): CoverageState {
  if (expected <= 0) return 'empty';
  if (found === 0) return 'empty';
  return found < expected ? 'partial' : 'complete';
}

/** Build an `unavailable` envelope for a failed read. Never reads as "no data". */
export function unavailableEnvelope(summary: string, note: string): ToolEnvelope {
  return {
    summary,
    measurements: [],
    series: [],
    coverage: 'unavailable',
    coverage_note: note,
    as_of: nowIso(),
  };
}

/** A figure a read computed itself, in the envelope's own shape: who it measured, the window, and the sample behind it. */
export function readFigure(f: Pick<Measurement, 'metric_id' | 'metric_label' | 'unit' | 'value' | 'entity' | 'window_start' | 'window_end' | 'sample_size' | 'sample_unit' | 'source' | 'method'> & Partial<Pick<Measurement, 'denominator' | 'direction'>>): Measurement {
  return { denominator: null, direction: null, ...f, as_of: nowIso(), coverage: 'complete', coverage_note: null, benchmark: null };
}
