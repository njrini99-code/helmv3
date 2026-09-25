/**
 * Recent-window recheck for lifetime-window insights (owner decision
 * 2026-09-25: "an insight must be re-checked against the player's recent
 * rounds; if the problem no longer holds it stops showing").
 *
 * WHY THIS EXISTS. Most v3 generators already read a 90-day window, so their
 * re-run IS a recent recheck: when the leak closes they either re-emit the
 * same signature framed as a strength or dequalify and retract. Two
 * generators read LIFETIME aggregates instead — `putt_distance`
 * (`golf_player_stats_cache.putt_make_pct_*`, every completed round) and
 * `par_type` (`par*_average` + lifetime holes). Their re-run can never see a
 * recent improvement, and no engine path retired a detected/matured row whose
 * problem had closed.
 *
 * WHAT IT DOES. The generator recomputes its own metric over the last
 * `RECHECK_WINDOW_DAYS` of completed rounds with the SAME definitions it
 * already uses (putts: the `update_player_putt_make_pct` band rule `(lo, hi]`
 * and made = `result='hole' OR putt_made`; par: hole-score average) and grades
 * it against the row's OWN comparison value with a statistical margin:
 *
 *   cleared      the one-sided 90% bound beats the target (Wilson lower bound
 *                for a make %, mean + z·se upper bound for a lower-is-better
 *                average) — better than the target by more than chance
 *   holds        the point estimate is still on the wrong side of the target
 *                — the leak is present
 *   inconclusive the point estimate is better but inside the margin
 *   thin         below the minimum sample; says nothing
 *
 * `BaseGenerator.run()` applies it (engine axis only — the coach's `status`
 * is never written):
 *   - `cleared` on a visible `detected`/`matured` leak → lifecycle `archived`
 *     (the engine-retraction state every reader hides) with
 *     `metadata.resolved_by='engine-recheck'`, `retired_reason='recheck_cleared'`.
 *   - such a row is re-emitted (and so resurrected by `upsertInsight`) ONLY
 *     when the recheck says `holds` — the leak actually came back. Any other
 *     outcome suppresses the re-emit, so the row stays archived. The two-sided
 *     gap between `cleared` and `holds` is the hysteresis that stops a
 *     borderline row from flapping.
 *   - the lifecycle cron never selects archived rows, so it cannot un-archive.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { InsightLifecycleState, InsightRecheck } from '@/lib/coachhelm/v2/insights/types';
import { loadCompletedHoles } from './hole-diagnosis';

export type { InsightRecheck };

/** The recent window, in days — the existing v3 windowed-generator convention. */
export const RECHECK_WINDOW_DAYS = 90;

/** One-sided 90% normal quantile used for both bounds. */
export const RECHECK_Z = 1.2816;

/** Provenance stamped on `metadata.resolved_by` when the recheck retires a row. */
export const RECHECK_RESOLVED_BY = 'engine-recheck' as const;
/** `metadata.retired_reason` for a recheck retirement. */
export const RECHECK_RETIRED_REASON = 'recheck_cleared' as const;

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** One-sided Wilson score lower bound for `k` successes in `n` trials. */
export function wilsonLowerBound(k: number, n: number, z = RECHECK_Z): number {
  if (n <= 0) return 0;
  const p = k / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / (1 + z2 / n));
}

/** One-sided upper bound of a mean: mean + z · sd / √n (sample sd). */
export function meanUpperBound(values: readonly number[], z = RECHECK_Z): number | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  return mean + (z * Math.sqrt(variance)) / Math.sqrt(n);
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Pure computations
// ---------------------------------------------------------------------------

export interface RecentPutt {
  round_id: string;
  distance_to_hole_before: number | null;
  result: string | null;
  putt_made: boolean | null;
}

/** Putt band in feet, `(lo, hi]`; `hi` null = open-ended (`> lo`). */
export interface PuttBand {
  lo: number;
  hi: number | null;
}

/**
 * Recent make % for one band. Mirrors `update_player_putt_make_pct` exactly:
 * distance clamped to [0, 120] ft, band `(lo, hi]`, made = `result='hole' OR
 * putt_made IS TRUE`. `comparison` is the row's own anchor (a make %, higher
 * is better). Cleared only when the Wilson lower bound beats it.
 */
export function puttBandRecheck(
  putts: readonly RecentPutt[],
  band: PuttBand,
  comparison: number,
  minSampleN: number,
  checkedAt: string,
  windowDays = RECHECK_WINDOW_DAYS,
): InsightRecheck {
  let attempts = 0;
  let made = 0;
  for (const p of putts) {
    if (p.distance_to_hole_before === null || p.distance_to_hole_before === undefined) continue;
    const feet = Math.min(Math.max(Number(p.distance_to_hole_before), 0), 120);
    if (!Number.isFinite(feet)) continue;
    if (!(feet > band.lo && (band.hi === null || feet <= band.hi))) continue;
    attempts += 1;
    if (p.result === 'hole' || p.putt_made === true) made += 1;
  }
  const recentValue = attempts > 0 ? round1((100 * made) / attempts) : null;
  const bound = attempts > 0 ? round1(100 * wilsonLowerBound(made, attempts)) : null;
  return grade({
    recentValue,
    bound,
    sampleN: attempts,
    minSampleN,
    comparison,
    worse: recentValue !== null && recentValue < comparison,
    clears: bound !== null && bound > comparison,
    checkedAt,
    windowDays,
  });
}

export interface RecentHole {
  round_id: string;
  par: number;
  score: number | null;
}

/**
 * Recent scoring average on one par type. The par-type row compares against
 * par itself (`comparison_value = par`, lower is better). Cleared only when
 * the mean's one-sided upper bound is below it. The sample floor is in
 * ROUNDS, matching the generator's own gate.
 */
export function parScoringRecheck(
  holes: readonly RecentHole[],
  par: number,
  comparison: number,
  minRounds: number,
  checkedAt: string,
  windowDays = RECHECK_WINDOW_DAYS,
): InsightRecheck {
  const scores: number[] = [];
  const rounds = new Set<string>();
  for (const h of holes) {
    if (h.par !== par || h.score === null || !Number.isFinite(h.score)) continue;
    scores.push(h.score);
    rounds.add(h.round_id);
  }
  const recentValue = scores.length > 0 ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const upper = meanUpperBound(scores);
  const bound = upper === null ? null : round2(upper);
  return grade({
    recentValue,
    bound,
    sampleN: rounds.size,
    minSampleN: minRounds,
    comparison,
    worse: recentValue !== null && recentValue > comparison,
    clears: bound !== null && bound < comparison,
    checkedAt,
    windowDays,
  });
}

function grade(args: {
  recentValue: number | null;
  bound: number | null;
  sampleN: number;
  minSampleN: number;
  comparison: number;
  worse: boolean;
  clears: boolean;
  checkedAt: string;
  windowDays: number;
}): InsightRecheck {
  const thin = args.recentValue === null || args.sampleN < args.minSampleN;
  return {
    status: thin ? 'thin' : args.worse ? 'holds' : args.clears ? 'cleared' : 'inconclusive',
    checked_at: args.checkedAt,
    window_days: args.windowDays,
    recent_value: args.recentValue,
    bound: args.bound,
    sample_n: args.sampleN,
    min_sample_n: args.minSampleN,
    comparison_value: args.comparison,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle decisions (pure)
// ---------------------------------------------------------------------------

/** True for a row this recheck retired (and nothing has restored since). */
export function isRecheckRetired(
  lifecycle: InsightLifecycleState | null,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return lifecycle === 'archived' && metadata?.resolved_by === RECHECK_RESOLVED_BY;
}

/**
 * BEFORE the upsert: should this run's re-emit be suppressed? A re-emit onto
 * an archived row resurrects it (`resolveLifecycleOnWrite`), so a
 * recheck-retired row may only be re-emitted when the leak has actually come
 * back (`isLeak` and `holds`). Anything else — cleared, inconclusive, thin,
 * a failed recheck, or a strength reading — keeps it archived.
 */
export function shouldSuppressReemit(input: {
  existingLifecycle: InsightLifecycleState | null;
  existingMetadata: Record<string, unknown> | null | undefined;
  isLeak: boolean;
  recheck: InsightRecheck | null;
}): boolean {
  if (!isRecheckRetired(input.existingLifecycle, input.existingMetadata)) return false;
  return !(input.isLeak && input.recheck?.status === 'holds');
}

export type RecheckTransition = 'retire' | 'restore' | 'none';

/**
 * AFTER the upsert, for the row as it now stands:
 *  - `retire`: a visible, coach-untouched leak (`detected`/`matured`) whose
 *    recent window cleared the margin → archive it.
 *  - `restore`: the upsert just resurrected a recheck-retired row (it is no
 *    longer archived but still carries `resolved_by='engine-recheck'`) →
 *    clear the retirement markers so the row reads as live.
 *  - `none`: everything else (`tentative`, `addressed`, coach-resolved,
 *    strength rows, holds/inconclusive/thin).
 */
export function decideRecheckTransition(input: {
  lifecycle: InsightLifecycleState | null;
  metadata: Record<string, unknown> | null | undefined;
  isLeak: boolean;
  recheck: InsightRecheck | null;
}): RecheckTransition {
  const { lifecycle, metadata, isLeak, recheck } = input;
  if (lifecycle !== 'archived' && metadata?.resolved_by === RECHECK_RESOLVED_BY) return 'restore';
  if (isLeak && recheck?.status === 'cleared' && (lifecycle === 'detected' || lifecycle === 'matured')) {
    return 'retire';
  }
  return 'none';
}

// ---------------------------------------------------------------------------
// Loaders (read-only), cached per player for the length of one analysis run
// ---------------------------------------------------------------------------

/** One analysis run instantiates up to 5 putt-distance generators for the same
 *  player back to back; they share one load. Short TTL so a later run (new
 *  round) always re-reads. */
const LOAD_CACHE_TTL_MS = 2 * 60 * 1000;
const puttCache = new Map<string, { at: number; value: Promise<RecentPutt[]> }>();
const holeCache = new Map<string, { at: number; value: Promise<RecentHole[]> }>();

function cached<T>(
  cache: Map<string, { at: number; value: Promise<T> }>,
  key: string,
  now: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < LOAD_CACHE_TTL_MS) return hit.value;
  const value = load();
  cache.set(key, { at: now, value });
  // A failed load must not be served to the next caller.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Test hook: drop cached loads. */
export function clearRecheckLoadCache(): void {
  puttCache.clear();
  holeCache.clear();
}

/** Completed holes in the recent window (`loadCompletedHoles`), cached per
 *  player so the three par-type generators share one load. */
export function loadRecentHoles(
  playerId: string,
  windowDays = RECHECK_WINDOW_DAYS,
  now: number = Date.now(),
): Promise<RecentHole[]> {
  return cached(holeCache, `${playerId}|${windowDays}`, now, () =>
    loadCompletedHoles(playerId, windowDays),
  );
}

function sinceDate(windowDays: number, now: number): string {
  return new Date(now - windowDays * 86400_000).toISOString().slice(0, 10);
}

/**
 * Putts from the player's completed, scored rounds in the recent window — the
 * same round filter as `update_player_putt_make_pct` (`status='completed'`,
 * `total_score IS NOT NULL`), plus `round_date >= now - windowDays`. Cached per
 * player for `LOAD_CACHE_TTL_MS`.
 */
export function loadRecentPutts(
  playerId: string,
  windowDays = RECHECK_WINDOW_DAYS,
  now: number = Date.now(),
): Promise<RecentPutt[]> {
  return cached(puttCache, `${playerId}|${windowDays}`, now, () =>
    loadRecentPuttsUncached(playerId, windowDays, now),
  );
}

async function loadRecentPuttsUncached(
  playerId: string,
  windowDays: number,
  now: number,
): Promise<RecentPutt[]> {
  const supabase = createAdminClient();
  const { data: rounds, error: rErr } = (await fromUntyped(supabase, 'golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .gte('round_date', sinceDate(windowDays, now))) as {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };
  if (rErr) throw new Error(`recent-recheck rounds query failed: ${rErr.message}`);
  if (!rounds || rounds.length === 0) return [];
  const roundIds = rounds.map((r) => r.id);

  // Paginated past the PostgREST 1000-row cap; `.order('id')` keeps page
  // boundaries stable. `ilike` = the function's `lower(shot_type)='putting'`.
  const { data, error } = await fetchAllRowsResult<RecentPutt>((from, to) =>
    fromUntyped(supabase, 'golf_shots')
      .select('round_id, distance_to_hole_before, result, putt_made')
      .ilike('shot_type', 'putting')
      .not('distance_to_hole_before', 'is', null)
      .in('round_id', roundIds)
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(`recent-recheck putts query failed: ${error.message}`);
  return data ?? [];
}
