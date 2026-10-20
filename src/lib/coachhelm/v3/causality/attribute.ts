/**
 * v3 outcome attribution (W35 + W35 follow-up).
 *
 * For each insight surfaced ≥21 days ago without an attribution row,
 * compute baseline (14d before surfaced_at) + post (21d after) for the
 * insight's target metric. Lift is the observed, direction-corrected
 * post-vs-baseline change (`method_version: 'v2_observed_delta'`).
 *
 * N10 (2026-09-22): this used to also fetch a 90-day "ambient" window and
 * subtract `(ambient.avg - base.avg)` from the raw delta, on the theory that
 * it nets out the player's pre-existing trend so we don't credit an insight
 * for improvement that would have happened anyway. That theory was never
 * actually implemented: `rawDelta - (ambient.avg - base.avg)` expands to
 * `(post.avg - base.avg) - ambient.avg + base.avg`, which is `post.avg -
 * ambient.avg` — `base.avg` cancels completely, so the "trend-adjusted"
 * lift never used the baseline window at all, despite every comment near it
 * claiming otherwise. Per the 2026-09-12 CoachHelm repair plan §6.7 item 1
 * ("rename existing values according to what they actually calculate") and
 * item 4 ("report the observed before/after change with uncertainty
 * first"), v2 drops the ambient fetch and the fake trend adjustment and
 * reports the real observed change instead. A validated predictive
 * counterfactual (plan item 5) is future work, gated on held-out validation
 * — not something to ship silently inside a bug fix.
 *
 * `method_version` (migration 20260922230000) distinguishes v1 rows
 * (NULL — the post-vs-ambient value above) from v2 rows (the observed
 * delta) so a reader/aggregate must never average the two together.
 *
 * v3 (`v3_did_prewindow`, deep audit row 35, 2026-09-28): the v2 lift had no
 * control, so any drift the player was already on was credited to the
 * insight. v3 adds a MATCHED PRE-WINDOW control: the same metric over the
 * {@link PRE_WINDOW_DAYS} days immediately before the baseline window. The
 * control change (baseline − control) is what the player's metric did over
 * an equal gap with no insight; the lift is the difference-in-differences
 *
 *     (post − baseline) − (baseline − control)
 *
 * direction-corrected, with a t-based 95% interval from the per-window
 * variance of the mean (`lift_ci_low`/`lift_ci_high`). Known limit: when an
 * insight fires BECAUSE the baseline was unusually bad, the control change is
 * negative and the DiD can overstate recovery (regression to the mean); the
 * interval is wide exactly in those thin-window cases, and the weight update
 * uses the standardized lift (lift / SE), so a noisy lift barely moves it.
 *
 * Ratio metrics (Σ num / Σ den) additionally need
 * {@link MIN_RATIO_OPPORTUNITIES} opportunities in EVERY window; a 2-attempt
 * sand-save window produced the audit's −60 outlier. Lift units are
 * normalised before the tanh weight update: `nextWeight` takes `lift_z`
 * (lift / SE), which is unitless, instead of a raw percent or stroke value.
 *
 * Pure-ish: takes a Supabase client and one insight id, returns the
 * computed attribution row (or null if not enough data). The caller
 * writes the row + updates aggregates.
 *
 * W35 (initial ship): only `score_to_par` averaged from `golf_rounds`.
 * Everything else returned null → 100% of insights logged as deferred.
 *
 * W35 follow-up: dispatch via `metric-sources.ts` so the 5 SG headline
 * metrics + GIR + penalty rate + sand-save scrambling now produce real
 * lifts. Subsequently graduated: big-number rate via
 * `round_stats_cache_computed`, and per-par scoring via `hole_level_avg`.
 * The 12 metrics that need shot-level putt-distance data, between-cohort
 * comparisons, or per-lie scrambling breakdowns are explicitly marked
 * `intentional-null` — the cron logs those as `intentional-no-lift`
 * (a different observability bucket from "deferred = unknown metric").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import {
  lookupMetricSource,
  ALL_SCORING_COLUMNS,
  type MetricSourceDef,
  type RoundStatsCacheAvgSource,
  type RoundStatsCacheRatioSource,
  type RoundStatsCacheComputedSource,
  type HoleLevelAvgSource,
} from '@/lib/coachhelm/v3/causality/metric-sources';
import { improvementSign } from '@/lib/coachhelm/v3/metrics/registry';
import { studentTCritical } from '@/lib/coachhelm/v3/causality/correlation-gate';

type Sb = SupabaseClient<Database>;

export interface AttributionInput {
  insight_id: string;
  player_id: string;
  surfaced_at: string;
  /** The metric this insight is "about" — extracted from
   *  insight.evidence.metric upstream. */
  target_metric_id: string;
}

/** The method_version this module writes (see file header). */
export const ATTRIBUTION_METHOD_VERSION = 'v3_did_prewindow';

export interface AttributionRow {
  insight_id: string;
  surfaced_at: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  /**
   * Direction-AGNOSTIC raw change in the metric over the window
   * (`post_value − baseline_value`). Persisted as the DB `delta` column.
   * This is signed in the metric's own units — for a lower-is-better metric a
   * negative `raw_delta` is an IMPROVEMENT. Never feed this into learning; use
   * {@link improvement_lift}.
   */
  raw_delta: number;
  /**
   * Alias of {@link raw_delta} retained for backwards compatibility with
   * existing consumers/tests that read `.delta`. Same value, same DB column.
   */
  delta: number;
  n_rounds_before: number;
  n_rounds_after: number;
  /**
   * Direction-CORRECTED, CONTROLLED improvement signal (v3): the
   * difference-in-differences `(post − baseline) − (baseline − control)`
   * multiplied by the metric's improvement sign (+1 higher-is-better, −1
   * lower-is-better). Positive ALWAYS means the player improved beyond the
   * drift they were already on. `null` when any window is too thin (see
   * {@link MIN_WINDOW_ROUNDS} and {@link MIN_RATIO_OPPORTUNITIES}) or the
   * control window is empty. Persisted as DB `lift`. The weight update uses
   * the unitless {@link lift_z}, not this value.
   *
   * N10 (2026-09-22): pre-v2 this was ALSO adjusted by a 90-day "ambient"
   * window that algebraically cancelled the baseline and never did what its
   * comments claimed — see the file header. v2 is the plain observed
   * before/after change; there is no ambient adjustment to net out anymore.
   */
  improvement_lift: number | null;
  /**
   * Alias of {@link improvement_lift} retained for backwards compatibility
   * with existing consumers/tests that read `.lift`. Same value, same DB
   * column. Always direction-corrected — a drop in a lower-is-better metric
   * yields a positive value here.
   */
  lift: number | null;
  /**
   * Attribution method that produced this row. Persisted as DB
   * `method_version` (migration 20260922230000, nullable, no default — a
   * NULL row predates this column and was computed by v1, the fake
   * post-vs-ambient trend adjustment described in the file header. Every
   * row this module writes going forward carries `'v2_observed_delta'`.
   */
  method_version: typeof ATTRIBUTION_METHOD_VERSION;
  /** Control (matched pre-window) mean, or null when that window had no data. */
  control_value: number | null;
  n_rounds_control: number;
  /** t-based 95% interval on {@link improvement_lift}; null when lift is null. */
  lift_ci_low: number | null;
  lift_ci_high: number | null;
  /**
   * Standardized lift: improvement_lift / SE. Unitless, so a percent metric
   * and a stroke metric move coach weights on the same scale. Null when lift
   * is null or the SE is zero/undefined. This is what `nextWeight` consumes.
   */
  lift_z: number | null;
}

/**
 * Discriminated outcome of `averageInWindow`. We separate "metric is
 * intentionally null" (don't try again, don't log as a coverage gap)
 * from "no rows in window" (try again tomorrow once another round lands)
 * and from "unknown metric" (logger gap — the insight surface tagged us
 * with a metric we've never heard of). The cron uses this to keep its
 * deferred / intentional-no-lift / no-data counters separated.
 */
export type WindowResult =
  | { ok: true; avg: number; n: number }
  | { ok: false; reason: 'intentional-null'; reasonCode: string }
  | { ok: false; reason: 'unknown-metric' }
  | { ok: false; reason: 'no-data' };

// Exported (additive, same values) so `comparable-attribute.ts` (A9 slice 1)
// can mirror the same baseline/follow-up window lengths for the shot-level
// metrics this module intentionally-nulls, without a second copy of the
// numbers to drift.
export const PRE_WINDOW_DAYS = 14;
export const POST_WINDOW_DAYS = 21;
/**
 * Minimum rounds required in BOTH the baseline and post windows before a
 * lift is trusted. A 1-round window average is noise, not a measurement —
 * below this, `raw_delta`/`baseline_value`/`post_value` are still recorded
 * (observability), but `improvement_lift`/`lift` are null so `nextWeight`
 * no-ops rather than moving coach weights off a single round.
 *
 * N10 (2026-09-22): this used to gate on a 90-day "ambient" window's sample
 * size instead (`MIN_AMBIENT_ROUNDS`). v2 no longer fetches an ambient
 * window at all (see the file header), so the gate moved to the two windows
 * the lift is actually computed from.
 */
const MIN_WINDOW_ROUNDS = 2;

/**
 * Minimum opportunities (Σ denominator, e.g. sand-save attempts or greens
 * attempted) per window before a ratio metric's lift is trusted.
 */
export const MIN_RATIO_OPPORTUNITIES = 10;

/** Two-sided 95% for the lift interval. */
const LIFT_CI_ALPHA = 0.05;

/**
 * Internal window stats: the public {@link WindowResult} plus the variance of
 * the window mean (for the interval) and, for ratio metrics, the opportunity
 * count. `averageInWindow` strips these so its public shape is unchanged.
 */
type WindowStats =
  | { ok: true; avg: number; n: number; varOfMean: number | null; opportunities?: number }
  | Exclude<WindowResult, { ok: true }>;

function sampleVarOfMean(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const ss = values.reduce((a, v) => a + (v - mean) * (v - mean), 0);
  return ss / (n - 1) / n;
}

/** Average a denormalised `golf_rounds` column across completed rounds in a window. */
async function averageGolfRoundsColumn(
  sb: Sb,
  player_id: string,
  column: string,
  startIso: string,
  endIso: string,
): Promise<WindowStats> {
  const { data } = await sb
    .from('golf_rounds')
    .select(`${column}`)
    .eq('player_id', player_id)
    .eq('is_test', false)
    .eq('status', 'completed')
    .gte('round_date', startIso.slice(0, 10))
    .lte('round_date', endIso.slice(0, 10));
  const values = ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => r[column])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return { ok: false, reason: 'no-data' };
  const sum = values.reduce((a, b) => a + b, 0);
  return { ok: true, avg: sum / values.length, n: values.length, varOfMean: sampleVarOfMean(values) };
}

/**
 * Average a single per-round column from `golf_round_stats_cache` over a
 * window. Joins to `golf_rounds` on `round_id` to filter by `round_date` /
 * `status` (the cache row carries neither), then takes a simple per-round mean
 * of the column. Used for `penalty_rate_per_round`, whose canonical per-round
 * value is `golf_round_stats_cache.penalty_strokes` (= SUM(golf_holes.penalty_strokes))
 * rather than the drifted `golf_rounds.total_penalties` (migration 20260608140000).
 */
async function averageRoundStatsCacheColumn(
  sb: Sb,
  player_id: string,
  source: RoundStatsCacheAvgSource,
  startIso: string,
  endIso: string,
): Promise<WindowStats> {
  const { data } = await sb
    .from('golf_round_stats_cache')
    .select(
      `round_id, ${source.column}, golf_rounds!inner(round_date, status, player_id)`,
    )
    .eq('player_id', player_id)
    .eq('golf_rounds.player_id', player_id)
    .eq('golf_rounds.status', 'completed')
    .gte('golf_rounds.round_date', startIso.slice(0, 10))
    .lte('golf_rounds.round_date', endIso.slice(0, 10));
  const values = ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => r[source.column])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return { ok: false, reason: 'no-data' };
  const sum = values.reduce((a, b) => a + b, 0);
  return { ok: true, avg: sum / values.length, n: values.length, varOfMean: sampleVarOfMean(values) };
}

/**
 * Average a per-round ratio from `golf_round_stats_cache` over a window.
 *
 * Aggregated as `Σ numerator / Σ denominator × scale` — equivalent to a
 * shot-weighted average rather than a simple per-round mean. This is the
 * statistically right way to roll up rates: a 1-round window where the
 * player only had 2 sand attempts shouldn't get the same weight as a
 * round with 12 attempts.
 *
 * Joins to `golf_rounds` on `round_id` so we can filter by `round_date`
 * and `status` — `golf_round_stats_cache` doesn't carry either column.
 */
async function averageRoundStatsCacheRatio(
  sb: Sb,
  player_id: string,
  source: RoundStatsCacheRatioSource,
  startIso: string,
  endIso: string,
): Promise<WindowStats> {
  const { data } = await sb
    .from('golf_round_stats_cache')
    .select(
      `round_id, ${source.numerator}, ${source.denominator}, golf_rounds!inner(round_date, status, player_id)`,
    )
    .eq('player_id', player_id)
    .eq('golf_rounds.player_id', player_id)
    .eq('golf_rounds.status', 'completed')
    .gte('golf_rounds.round_date', startIso.slice(0, 10))
    .lte('golf_rounds.round_date', endIso.slice(0, 10));
  type Row = Record<string, unknown>;
  let numSum = 0;
  let denSum = 0;
  let n = 0;
  for (const row of (data ?? []) as Row[]) {
    const num = row[source.numerator];
    const den = row[source.denominator];
    if (typeof num !== 'number' || typeof den !== 'number') continue;
    if (!Number.isFinite(num) || !Number.isFinite(den)) continue;
    if (den <= 0) continue; // skip rounds with no opportunities — would divide by zero
    numSum += num;
    denSum += den;
    n += 1;
  }
  if (n === 0 || denSum <= 0) return { ok: false, reason: 'no-data' };
  // Binomial variance of the pooled proportion, in the metric's scaled units.
  const p = Math.min(1, Math.max(0, numSum / denSum));
  const varOfMean = ((p * (1 - p)) / denSum) * source.scale * source.scale;
  return { ok: true, avg: (numSum / denSum) * source.scale, n, varOfMean, opportunities: denSum };
}

/**
 * Average a computed ratio from `golf_round_stats_cache` scoring-distribution
 * columns over a window. The numerator is the sum of the specified columns;
 * the denominator is the sum of ALL scoring-distribution columns (= total
 * holes scored). Computed per round, then averaged across the window.
 */
async function averageRoundStatsCacheComputed(
  sb: Sb,
  player_id: string,
  source: RoundStatsCacheComputedSource,
  startIso: string,
  endIso: string,
): Promise<WindowStats> {
  const allCols = ALL_SCORING_COLUMNS;
  const selectCols = `round_id, ${allCols.join(', ')}, golf_rounds!inner(round_date, status, player_id)`;
  const { data } = await sb
    .from('golf_round_stats_cache')
    .select(selectCols)
    .eq('player_id', player_id)
    .eq('golf_rounds.player_id', player_id)
    .eq('golf_rounds.status', 'completed')
    .gte('golf_rounds.round_date', startIso.slice(0, 10))
    .lte('golf_rounds.round_date', endIso.slice(0, 10));
  type Row = Record<string, unknown>;
  const ratios: number[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    let numSum = 0;
    let denSum = 0;
    for (const col of allCols) {
      const v = row[col];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      denSum += v;
      if ((source.numerator_columns as string[]).includes(col)) numSum += v;
    }
    if (denSum <= 0) continue;
    ratios.push((numSum / denSum) * source.scale);
  }
  if (ratios.length === 0) return { ok: false, reason: 'no-data' };
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { ok: true, avg, n: ratios.length, varOfMean: sampleVarOfMean(ratios) };
}

/**
 * Average score-to-par on holes of a specific par type across a window.
 * Queries `golf_holes` joined to `golf_rounds` (filtering by player_id,
 * status='completed', round_date in window), filters by `par = par_filter`,
 * and computes `AVG(score - par)` across all matching holes.
 */
async function averageHoleLevelByPar(
  sb: Sb,
  player_id: string,
  source: HoleLevelAvgSource,
  startIso: string,
  endIso: string,
): Promise<WindowStats> {
  const { data, error } = await fetchAllRowsResult((from, to) => sb
    .from('golf_holes')
    .select('score, par, round_id, golf_rounds!inner(round_date, status, player_id)')
    .eq('golf_rounds.player_id', player_id)
    .eq('golf_rounds.status', 'completed')
    .eq('par', source.par_filter)
    .gte('golf_rounds.round_date', startIso.slice(0, 10))
    .lte('golf_rounds.round_date', endIso.slice(0, 10))
    .order('id', { ascending: true })
    .range(from, to)); // paginate past PostgREST 1000-row cap
  if (error) {
    // A real query failure and a genuinely empty window both fall through to
    // { ok: false, reason: 'no-data' } below — WindowResult has no slot for
    // "the read itself failed" without widening every switch that already
    // exhaustively matches it. Logged so a query failure is at least
    // distinguishable from a legitimately quiet window in traces.
    await logServerError('attribute.averageHoleLevelByPar read failed', {
      action: 'attribute.averageHoleLevelByPar',
      featureArea: 'coachhelm.causality',
      metadata: { player_id, par_filter: source.par_filter, dbError: error as unknown },
    });
  }
  type Row = Record<string, unknown>;
  const diffs: number[] = [];
  const roundIds = new Set<string>();
  const perRound = new Map<string, number[]>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const score = row['score'];
    const par = row['par'];
    const roundId = row['round_id'];
    if (typeof score !== 'number' || typeof par !== 'number') continue;
    if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
    diffs.push(score - par);
    if (typeof roundId === 'string') {
      roundIds.add(roundId);
      const list = perRound.get(roundId) ?? [];
      list.push(score - par);
      perRound.set(roundId, list);
    }
  }
  if (diffs.length === 0 || roundIds.size === 0) return { ok: false, reason: 'no-data' };
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  // Holes within a round are not independent: the variance comes from the
  // per-round means, the unit n counts.
  const roundMeans = [...perRound.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  return { ok: true, avg, n: roundIds.size, varOfMean: sampleVarOfMean(roundMeans) };
}

/**
 * Pull the player's average for `target_metric_id` over rounds whose
 * date falls inside [start, end]. Dispatches via the schema-of-truth
 * dispatch table in `./metric-sources.ts`.
 *
 * Returns a discriminated {@link WindowResult} so the cron can tell
 * unknown-metric (drift bug — insight surface vs registry) from
 * intentional-null (we don't expect a lift signal here) from no-data
 * (try again tomorrow).
 *
 * Exported for the cron route + unit tests.
 */
export async function averageInWindow(
  sb: Sb,
  player_id: string,
  target_metric_id: string,
  startIso: string,
  endIso: string,
): Promise<WindowResult> {
  const source = lookupMetricSource(target_metric_id);
  if (!source) return { ok: false, reason: 'unknown-metric' };
  const w = await dispatchWindow(sb, player_id, source, startIso, endIso);
  return w.ok ? { ok: true, avg: w.avg, n: w.n } : w;
}

async function dispatchWindow(
  sb: Sb,
  player_id: string,
  source: MetricSourceDef,
  startIso: string,
  endIso: string,
): Promise<WindowStats> {
  if (source.kind === 'intentional-null') {
    return { ok: false, reason: 'intentional-null', reasonCode: source.reason };
  }
  if (source.kind === 'rounds') {
    return averageGolfRoundsColumn(sb, player_id, source.column, startIso, endIso);
  }
  if (source.kind === 'round_stats_cache_avg') {
    return averageRoundStatsCacheColumn(sb, player_id, source, startIso, endIso);
  }
  if (source.kind === 'round_stats_cache_computed') {
    return averageRoundStatsCacheComputed(sb, player_id, source, startIso, endIso);
  }
  if (source.kind === 'hole_level_avg') {
    return averageHoleLevelByPar(sb, player_id, source, startIso, endIso);
  }
  return averageRoundStatsCacheRatio(sb, player_id, source, startIso, endIso);
}

/**
 * Classification of why a `computeAttribution` call returned null.
 * Lets the cron route increment the right counter without re-running
 * the lookup.
 */
export interface AttributionSkip {
  ok: false;
  reason: 'intentional-null' | 'unknown-metric' | 'no-data';
  /** Only set when `reason === 'intentional-null'`. */
  reasonCode?: string;
}

export type AttributionResult =
  | { ok: true; row: AttributionRow }
  | AttributionSkip;

export async function computeAttribution(
  sb: Sb,
  input: AttributionInput,
): Promise<AttributionResult> {
  // Cheap pre-flight: bail out before any DB roundtrips for intentional-null
  // and unknown-metric metrics. The cron route over-fetches insight
  // candidates 3× the LIMIT, so saving 4 queries per skipped row matters.
  const source = lookupMetricSource(input.target_metric_id);
  if (!source) return { ok: false, reason: 'unknown-metric' };
  if (source.kind === 'intentional-null') {
    return { ok: false, reason: 'intentional-null', reasonCode: source.reason };
  }

  const surfacedTs = new Date(input.surfaced_at).getTime();
  // The surfaced CALENDAR day (UTC midnight). All window functions filter the
  // DATE column `round_date` with inclusive gte/lte on the .slice(0,10) date
  // string, so the boundary that matters is the calendar day, not the instant.
  const surfacedDayTs = new Date(`${new Date(surfacedTs).toISOString().slice(0, 10)}T00:00:00.000Z`).getTime();
  // Windows EXCLUDE the surfaced calendar day on BOTH sides — the triggering
  // round (typically ingested/surfaced the same day, and usually the outlier
  // that fired the insight) must not land in baseline AND post. Pre ends the
  // day BEFORE surfaced; post starts the day AFTER surfaced. (Prior bug: preEnd
  // = surfaced−1ms and postStart = surfaced+1ms both .slice(0,10) back to the
  // surfaced date, so round_date == surfaced fell in both windows.)
  const preStart = new Date(surfacedTs - PRE_WINDOW_DAYS * 86400_000).toISOString();
  const preEnd = new Date(surfacedDayTs - 86400_000).toISOString();
  const postStart = new Date(surfacedDayTs + 86400_000).toISOString();
  const postEnd = new Date(surfacedTs + POST_WINDOW_DAYS * 86400_000).toISOString();
  // v3 control: the equal-length window immediately before the baseline.
  const controlStart = new Date(surfacedTs - 2 * PRE_WINDOW_DAYS * 86400_000).toISOString();
  const controlEnd = new Date(new Date(preStart).getTime() - 86400_000).toISOString();

  const [control, base, post] = await Promise.all([
    dispatchWindow(sb, input.player_id, source, controlStart, controlEnd),
    dispatchWindow(sb, input.player_id, source, preStart, preEnd),
    dispatchWindow(sb, input.player_id, source, postStart, postEnd),
  ]);
  if (!base.ok || !post.ok) {
    // If either window has no rows we treat the whole attribution as
    // no-data — the cron will retry the next day.
    return { ok: false, reason: 'no-data' };
  }

  // Direction-AGNOSTIC raw change in the metric's own units. Stored as `delta`.
  const rawDelta = post.avg - base.avg;
  const sign = improvementSign(input.target_metric_id);

  // Every window must be thick enough to trust, including the control, and a
  // ratio metric needs real opportunities behind each rate.
  const enoughOpportunities = (w: WindowStats): boolean =>
    !w.ok || w.opportunities === undefined || w.opportunities >= MIN_RATIO_OPPORTUNITIES;
  const trusted =
    control.ok &&
    control.n >= MIN_WINDOW_ROUNDS &&
    base.n >= MIN_WINDOW_ROUNDS &&
    post.n >= MIN_WINDOW_ROUNDS &&
    enoughOpportunities(control) &&
    enoughOpportunities(base) &&
    enoughOpportunities(post);

  let improvementLift: number | null = null;
  let ciLow: number | null = null;
  let ciHigh: number | null = null;
  let liftZ: number | null = null;
  if (trusted && control.ok) {
    // P0-01: multiply by the improvement sign so a positive lift ALWAYS means
    // the player got better, whatever the metric's polarity.
    const did = rawDelta - (base.avg - control.avg);
    improvementLift = sign * did;
    // Var(post − 2·base + control) with independent windows.
    const vars = [post.varOfMean, base.varOfMean, control.varOfMean];
    if (vars.every((v): v is number => v !== null)) {
      const se = Math.sqrt(vars[0]! + 4 * vars[1]! + vars[2]!);
      const df = Math.max(1, Math.min(control.n, base.n, post.n) - 1);
      const half = studentTCritical(df, LIFT_CI_ALPHA) * se;
      ciLow = improvementLift - half;
      ciHigh = improvementLift + half;
      liftZ = se > 0 ? improvementLift / se : null;
    }
  }

  return {
    ok: true,
    row: {
      insight_id: input.insight_id,
      surfaced_at: input.surfaced_at,
      target_metric_id: input.target_metric_id,
      baseline_value: base.avg,
      post_value: post.avg,
      // Direction-agnostic raw change (DB `delta` column). `delta` is an alias.
      raw_delta: rawDelta,
      delta: rawDelta,
      n_rounds_before: base.n,
      n_rounds_after: post.n,
      // Direction-corrected, controlled improvement (DB `lift`). `lift` is an alias.
      improvement_lift: improvementLift,
      lift: improvementLift,
      method_version: ATTRIBUTION_METHOD_VERSION,
      control_value: control.ok ? control.avg : null,
      n_rounds_control: control.ok ? control.n : 0,
      lift_ci_low: ciLow,
      lift_ci_high: ciHigh,
      lift_z: liftZ,
    },
  };
}

/** Scale for the tanh signal→target map. v3 (2026-09-28): the cron feeds
 *  `lift_z` (lift / SE, unitless), so a percent metric no longer saturates
 *  tanh the way a raw −18.7-point sand-save lift did against a stroke-scale
 *  1.0. At scale 1.0 a z of 1 (one standard error) targets 1+tanh(1)≈1.76 and
 *  z≈2 (the edge of significance) ≈1.96; a z under ~0.5, i.e. noise, barely
 *  moves the weight. */
const LIFT_TANH_SCALE = 1.0;

/**
 * Magnitude-aware Bayesian-ish update for a (coach_id, insight_type, intent)
 * weight given a new attribution lift. We move an exponential-moving-average
 * toward a target that scales with the lift's MAGNITUDE and SIGN:
 *
 *   target = 1 + tanh(lift / LIFT_TANH_SCALE)
 *
 * tanh is signed (negative lift → target < 1), monotonic, and saturating, so a
 * single outlier round can't blow the weight out — it asymptotes toward (0, 2)
 * and is then hard-clamped to [0.25, 2.0]. alpha = 1/(sample_n+1) shrinks each
 * update as evidence accumulates, so later attributions move the weight less.
 */
export function nextWeight(
  prev: { weight: number; sample_n: number },
  /** The standardized lift (`AttributionRow.lift_z`); any unitless signed signal. */
  lift: number | null,
): { weight: number; sample_n: number } {
  if (lift === null || !Number.isFinite(lift)) return prev;
  const alpha = 1 / (prev.sample_n + 1);
  // Magnitude- and sign-aware target. A bigger positive lift pushes the target
  // closer to 2.0; a bigger negative lift closer to 0.0; both saturate via tanh.
  const target = 1 + Math.tanh(lift / LIFT_TANH_SCALE);
  const next = prev.weight * (1 - alpha) + target * alpha;
  const clamped = Math.max(0.25, Math.min(2.0, next));
  return {
    weight: Number(clamped.toFixed(4)),
    sample_n: prev.sample_n + 1,
  };
}
