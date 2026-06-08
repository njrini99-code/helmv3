/**
 * v3 outcome attribution (W35 + W35 follow-up).
 *
 * For each insight surfaced ≥21 days ago without an attribution row,
 * compute baseline (14d before surfaced_at) + post (21d after) for the
 * insight's target metric. Lift is the post-vs-baseline delta minus
 * the player's ambient 90-day trend over the same window, so we don't
 * credit insights for improvements that would have happened anyway.
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
import {
  lookupMetricSource,
  ALL_SCORING_COLUMNS,
  type MetricSourceDef,
  type RoundStatsCacheRatioSource,
  type RoundStatsCacheComputedSource,
  type HoleLevelAvgSource,
} from '@/lib/coachhelm/v3/causality/metric-sources';

type Sb = SupabaseClient<Database>;

export interface AttributionInput {
  insight_id: string;
  player_id: string;
  surfaced_at: string;
  /** The metric this insight is "about" — extracted from
   *  insight.evidence.metric upstream. */
  target_metric_id: string;
}

export interface AttributionRow {
  insight_id: string;
  surfaced_at: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  delta: number;
  n_rounds_before: number;
  n_rounds_after: number;
  lift: number | null;
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

const PRE_WINDOW_DAYS = 14;
const POST_WINDOW_DAYS = 21;
/** Days of player history BEFORE the pre-window used to estimate ambient drift. */
const AMBIENT_HISTORY_DAYS = 90;
/** Minimum rounds in the ambient window before we trust it to net out drift.
 *  A 1-round ambient average is noise, not a trend — below this, lift is null. */
const MIN_AMBIENT_ROUNDS = 2;

/** Average a denormalised `golf_rounds` column across completed rounds in a window. */
async function averageGolfRoundsColumn(
  sb: Sb,
  player_id: string,
  column: string,
  startIso: string,
  endIso: string,
): Promise<WindowResult> {
  const { data } = await sb
    .from('golf_rounds')
    .select(`${column}`)
    .eq('player_id', player_id)
    .eq('status', 'completed')
    .gte('round_date', startIso.slice(0, 10))
    .lte('round_date', endIso.slice(0, 10));
  const values = ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => r[column])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return { ok: false, reason: 'no-data' };
  const sum = values.reduce((a, b) => a + b, 0);
  return { ok: true, avg: sum / values.length, n: values.length };
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
): Promise<WindowResult> {
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
  return { ok: true, avg: (numSum / denSum) * source.scale, n };
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
): Promise<WindowResult> {
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
  return { ok: true, avg, n: ratios.length };
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
): Promise<WindowResult> {
  const { data } = await fetchAllRowsResult((from, to) => sb
    .from('golf_holes')
    .select('score, par, round_id, golf_rounds!inner(round_date, status, player_id)')
    .eq('golf_rounds.player_id', player_id)
    .eq('golf_rounds.status', 'completed')
    .eq('par', source.par_filter)
    .gte('golf_rounds.round_date', startIso.slice(0, 10))
    .lte('golf_rounds.round_date', endIso.slice(0, 10))
    .order('id', { ascending: true })
    .range(from, to)); // paginate past PostgREST 1000-row cap
  type Row = Record<string, unknown>;
  const diffs: number[] = [];
  const roundIds = new Set<string>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const score = row['score'];
    const par = row['par'];
    const roundId = row['round_id'];
    if (typeof score !== 'number' || typeof par !== 'number') continue;
    if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
    diffs.push(score - par);
    if (typeof roundId === 'string') roundIds.add(roundId);
  }
  if (diffs.length === 0 || roundIds.size === 0) return { ok: false, reason: 'no-data' };
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return { ok: true, avg, n: roundIds.size };
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
  return dispatchWindow(sb, player_id, source, startIso, endIso);
}

async function dispatchWindow(
  sb: Sb,
  player_id: string,
  source: MetricSourceDef,
  startIso: string,
  endIso: string,
): Promise<WindowResult> {
  if (source.kind === 'intentional-null') {
    return { ok: false, reason: 'intentional-null', reasonCode: source.reason };
  }
  if (source.kind === 'rounds') {
    return averageGolfRoundsColumn(sb, player_id, source.column, startIso, endIso);
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
  const preStart = new Date(surfacedTs - PRE_WINDOW_DAYS * 86400_000).toISOString();
  const preEnd = new Date(surfacedTs - 1).toISOString();
  const postStart = new Date(surfacedTs + 1).toISOString();
  const postEnd = new Date(surfacedTs + POST_WINDOW_DAYS * 86400_000).toISOString();

  const [base, post] = await Promise.all([
    dispatchWindow(sb, input.player_id, source, preStart, preEnd),
    dispatchWindow(sb, input.player_id, source, postStart, postEnd),
  ]);
  if (!base.ok || !post.ok) {
    // If either window has no rows we treat the whole attribution as
    // no-data — the cron will retry the next day.
    return { ok: false, reason: 'no-data' };
  }

  const delta = post.avg - base.avg;

  // Ambient counterfactual: the player's level over the 90 days of history
  // BEFORE the pre-window — strictly OUTSIDE [preStart, postEnd]. A window that
  // overlaps the post period would absorb the very improvement the insight
  // caused and cancel the lift (the W35 bug). Ambient drift = (ambient.avg −
  // base.avg) is "how much the player was already trending"; lift subtracts it
  // so we only credit movement BEYOND that trend.
  const ambientStart = new Date(
    surfacedTs - (PRE_WINDOW_DAYS + AMBIENT_HISTORY_DAYS) * 86400_000,
  ).toISOString();
  const ambientEnd = new Date(
    surfacedTs - (PRE_WINDOW_DAYS + 1) * 86400_000,
  ).toISOString();
  const ambient = await dispatchWindow(
    sb,
    input.player_id,
    source,
    ambientStart,
    ambientEnd,
  );
  // Min-rounds gate: a thin ambient sample is noise, not a trend. Below the
  // gate we record delta but leave lift null (nextWeight no-ops on null, so the
  // attribution row is still logged for observability without moving weights).
  const lift =
    ambient.ok && ambient.n >= MIN_AMBIENT_ROUNDS
      ? delta - (ambient.avg - base.avg)
      : null;

  return {
    ok: true,
    row: {
      insight_id: input.insight_id,
      surfaced_at: input.surfaced_at,
      target_metric_id: input.target_metric_id,
      baseline_value: base.avg,
      post_value: post.avg,
      delta,
      n_rounds_before: base.n,
      n_rounds_after: post.n,
      lift,
    },
  };
}

/**
 * Bayesian-ish update for a (coach_id, insight_type, intent) weight
 * given a new attribution lift. We use a simple exponential-moving-
 * average over signed lifts, then clamp to [0.25, 2.0] so a single
 * outlier can't dominate the ranker.
 */
export function nextWeight(prev: { weight: number; sample_n: number }, lift: number | null): { weight: number; sample_n: number } {
  if (lift === null || !Number.isFinite(lift)) return prev;
  const alpha = 1 / (prev.sample_n + 1);
  // Positive lift = good outcome from this insight type → push weight up
  // toward 1.5; negative lift → push toward 0.5.
  const target = lift > 0 ? 1.5 : 0.5;
  const next = prev.weight * (1 - alpha) + target * alpha;
  const clamped = Math.max(0.25, Math.min(2.0, next));
  return {
    weight: Number(clamped.toFixed(4)),
    sample_n: prev.sample_n + 1,
  };
}
