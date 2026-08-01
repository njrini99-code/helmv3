/**
 * ============================================================================
 * CoachHelm · chat · provenance — the envelope every number travels inside
 * ----------------------------------------------------------------------------
 * The old grounding check asked one question: "did a tool run?" That proves
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
 *   3. {@link auditNumericClaims} reads the model's finished text and checks
 *      each number in it against the Measurements that turn actually produced.
 *      A number with no source is a fabrication, and we say so rather than
 *      shipping it.
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

  /** Only present when a real, versioned benchmark was retrieved. */
  benchmark: BenchmarkRef.nullable().default(null),

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
 * `measurements` is the load-bearing field: it is both what the renderers draw
 * and what {@link auditNumericClaims} checks the prose against. A tool that
 * returns prose-shaped data with no measurements can never support a numeric
 * claim, and that is the intended consequence.
 */
export const ToolEnvelope = z.object({
  /** One-line, coach-readable summary of what was read. No table names. */
  summary: z.string(),
  measurements: z.array(Measurement).default([]),
  series: z.array(MeasurementSeries).default([]),
  /** Free-form structured payload for renderers that need more than numbers. */
  detail: z.unknown().optional(),
  coverage: CoverageState,
  coverage_note: z.string().nullable().default(null),
  as_of: z.string(),
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

// ---------------------------------------------------------------------------
// Claim auditing
// ---------------------------------------------------------------------------

/** A number the model wrote that no measurement in the turn can account for. */
export interface UnsupportedClaim {
  /** The literal text as it appeared, e.g. '71%'. */
  text: string;
  /** Parsed numeric value. */
  value: number;
}

/**
 * Numbers that carry no statistical claim and must not be audited.
 *
 * Dates, times, ordinals and small counts appear constantly in legitimate prose
 * ("over the last 5 rounds", "Tuesday at 3:00 PM", "8 weeks"). Auditing them
 * would make the check fire on every honest sentence, and a check that always
 * fires gets switched off — which is how the previous grounding gate died.
 */
const CLAIM_EXEMPT = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}\s*(?:am|pm)?)\b/gi;

/** Tolerance for matching a written number against a measured one. */
const MATCH_EPSILON = 0.051;

/**
 * A number written as an approximation or a bound rather than as a reading.
 *
 * "two rounds where he lost more than 7.5 strokes" is good coaching prose and
 * the 7.5 is deliberately rounded *outward* from a real -7.61. Demanding an
 * exact match there flags careful writing as fabrication, so a hedge widens the
 * tolerance to {@link HEDGED_RELATIVE_TOLERANCE} — enough to cover rounding,
 * nowhere near enough to cover an invented figure.
 */
const HEDGE_BEFORE =
  /(?:\b(?:about|around|roughly|approximately|nearly|almost|over|under|above|below|more than|less than|fewer than|greater than|at least|at most|upwards of|north of|shy of)|~)\s*[-−]?$/i;

/** Proportional slack granted to a hedged number. 10% catches rounding, not invention. */
const HEDGED_RELATIVE_TOLERANCE = 0.1;

/**
 * Cap on anchors per metric before pairwise differencing is skipped.
 *
 * Differencing is O(n²) and a 40-round series with means is already 41 anchors.
 * Past this size the extra pairs buy nothing — a long series' values are dense
 * enough that near-anything falls between two of them.
 */
const PAIRWISE_ANCHOR_CAP = 32;

/** `sg_putting_mean` and `sg_putting` describe one metric; deltas span both. */
function metricGroup(metricId: string): string {
  return metricId.replace(/_(?:mean|avg|average)$/, '');
}

/**
 * Read the model's finished text and flag numbers no measurement supports.
 *
 * The comparison is deliberately generous — a measurement of 58.3 supports the
 * written "58%", and a sample size of 43 supports "43 attempts". Generosity is
 * correct here: the goal is to catch *invention* (a confident "71% → 58%" when
 * the tools returned neither), not to punish rounding. A strict matcher would
 * produce false positives, and a check nobody trusts is worse than none.
 *
 * Small integers ≤ 12 are exempt for the same reason — they are almost always
 * counts of rounds, weeks or players that appear in the surrounding sentence
 * rather than standalone statistical claims.
 */
export function auditNumericClaims(
  text: string,
  measurements: readonly Measurement[],
  series: readonly MeasurementSeries[] = [],
  /**
   * Every other number the turn's tools returned — typically the values inside
   * an envelope's `detail` (team averages, per-round rows, RSVP counts).
   *
   * Without this the audit fires on legitimately-sourced figures. A real
   * example from verification: the weakest-area tool returns each metric's team
   * average in `detail.gaps`, the model correctly cited "-0.09 team average",
   * and the audit flagged it as fabricated because only `measurements` was
   * being checked. Five false positives on a good answer — and a check that
   * cries wolf is a check people switch off, which is exactly what happened to
   * the grounding gate this replaced.
   */
  extraSupported: readonly number[] = [],
): UnsupportedClaim[] {
  if (!text) return [];

  // Every value a tool actually produced, at any precision the prose might use.
  const supported = new Set<number>();
  /** Anchors grouped by metric, so a delta only spans figures of one kind. */
  const byMetric = new Map<string, Set<number>>();

  const add = (n: number | null | undefined, metricId?: string) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return;
    for (const v of [n, Math.abs(n)]) {
      // "lost 7.61 strokes" and "-7.61 strokes" are the same statement, so a
      // magnitude counts as sourced wherever its signed value does.
      supported.add(v);
      supported.add(Math.round(v));
      supported.add(Math.round(v * 10) / 10);
    }
    if (metricId) {
      const key = metricGroup(metricId);
      const group = byMetric.get(key) ?? new Set<number>();
      group.add(n);
      byMetric.set(key, group);
    }
  };

  for (const m of measurements) {
    add(m.value, m.metric_id);
    add(m.sample_size);
    add(m.denominator);
    add(m.benchmark?.value, m.metric_id);
    // A stated delta between a value and its benchmark is itself supported.
    if (typeof m.value === 'number' && typeof m.benchmark?.value === 'number') {
      add(m.value - m.benchmark.value);
    }
  }
  for (const n of extraSupported) add(n);
  for (const s of series) {
    for (const p of s.points) {
      add(p.value, s.metric_id);
      add(p.sample_size);
    }
    // First-to-last movement is the whole point of a trend, so allow the delta.
    const first = s.points[0]?.value;
    const last = s.points[s.points.length - 1]?.value;
    if (typeof first === 'number' && typeof last === 'number') add(last - first);
  }

  /**
   * Differences between two sourced figures of the same metric.
   *
   * "Bennett's deficit is roughly 2.4 strokes per round larger than Rivers's" is
   * the entire point of a comparison, and no tool can pre-compute every pair a
   * coach might ask about. The number is still checkable against the evidence
   * on screen — it is arithmetic on two published values, not an assertion —
   * so it is supported. Held to one metric so a strokes figure can never be
   * justified by subtracting two putt counts.
   */
  for (const group of byMetric.values()) {
    if (group.size < 2 || group.size > PAIRWISE_ANCHOR_CAP) continue;
    const values = [...group];
    for (const [i, left] of values.entries()) {
      for (const right of values.slice(i + 1)) add(left - right);
    }
  }

  const scrubbed = text.replace(CLAIM_EXEMPT, ' ');
  const found: UnsupportedClaim[] = [];
  const seen = new Set<string>();
  const anchors = [...supported];

  for (const match of scrubbed.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const raw = match[0];
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    // Ordinals, counts of rounds/weeks/players — not statistical assertions.
    if (Number.isInteger(value) && Math.abs(value) <= 12) continue;
    if (seen.has(raw)) continue;

    const at = match.index ?? 0;
    const hedged = HEDGE_BEFORE.test(scrubbed.slice(Math.max(0, at - 24), at));
    const tolerance = hedged
      ? Math.max(MATCH_EPSILON, Math.abs(value) * HEDGED_RELATIVE_TOLERANCE)
      : MATCH_EPSILON;

    if (!anchors.some((s) => Math.abs(s - value) <= tolerance)) {
      seen.add(raw);
      found.push({ text: raw, value });
    }
  }

  return found;
}

/**
 * Every finite number reachable inside an arbitrary tool payload.
 *
 * Tools put structured context in `ToolEnvelope.detail` — team averages, round
 * rows, RSVP counts — and the model is entitled to cite it. Walking it means
 * the audit stays a fabrication detector rather than a `measurements`-only
 * detector. Depth-bounded so a pathological payload cannot spin.
 */
export function collectNumbers(value: unknown, depth = 0): number[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((v) => collectNumbers(v, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      collectNumbers(v, depth + 1),
    );
  }
  return [];
}
