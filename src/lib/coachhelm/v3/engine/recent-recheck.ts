/**
 * Recent-window recheck for lifetime-window insights (owner decision
 * 2026-09-25: "an insight must be re-checked against the player's recent
 * rounds; if the problem no longer holds it stops showing and is marked
 * resolved").
 *
 * WHY THIS EXISTS. Most v3 generators already read a 90-day window, so their
 * nightly re-run IS a recent recheck: when the leak closes they either re-emit
 * the same signature framed as a strength or dequalify and retract. Two
 * generators read LIFETIME aggregates instead — `putt_distance`
 * (`golf_player_stats_cache.putt_make_pct_*`, every completed round) and
 * `par_type` (`par*_average` + lifetime holes). Their re-run can never see a
 * recent improvement: a closed 3–5 ft gap is diluted by months of older
 * putts, and no engine path moved a detected/matured row to `resolved`
 * (lifecycle cron Rule 1 only resolves coach-`addressed` rows).
 *
 * WHAT IT DOES. The generator recomputes its own metric over the last
 * `RECHECK_WINDOW_DAYS` of completed rounds with the SAME definitions it
 * already uses (putts: the `update_player_putt_make_pct` band rule `(lo, hi]`
 * and made = `result='hole' OR putt_made`; par: hole score average), checks it
 * against the row's OWN comparison value (the generator's trigger — the
 * gender-aware anchor for putts, par for par-type) and records the outcome on
 * `evidence.recheck`. `BaseGenerator.run()` then applies the lifecycle edge
 * (`decideRecheckTransition`). Thin recent samples never resolve anything.
 *
 * Engine axis only: `lifecycle_state` / `resolved_at` / metadata. The coach's
 * `status` axis is never written (see `insight-visibility.ts`).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { InsightLifecycleState, InsightRecheck } from '@/lib/coachhelm/v2/insights/types';

export type { InsightRecheck };

/** The recent window, in days — the existing v3 windowed-generator convention. */
export const RECHECK_WINDOW_DAYS = 90;

/** Provenance stamped on `metadata.resolved_by` when the recheck resolves a row. */
export const RECHECK_RESOLVED_BY = 'engine-recheck' as const;

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
 * putt_made IS TRUE`. `comparison` is the row's own anchor; the leak holds
 * while the recent make % is BELOW it (the generator's `gapPp > 0`).
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
  const recentValue = attempts > 0 ? Math.round((1000 * made) / attempts) / 10 : null;
  return finish({
    recentValue,
    sampleN: attempts,
    minSampleN,
    comparison,
    stillWorse: recentValue !== null && recentValue < comparison,
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
 * par itself (`comparison_value = par`, lower is better): the leak holds while
 * the recent average is ABOVE it. The sample floor is in ROUNDS, matching the
 * generator's own gate (`sampleN = rounds_played`, `minSampleN`).
 */
export function parScoringRecheck(
  holes: readonly RecentHole[],
  par: number,
  comparison: number,
  minRounds: number,
  checkedAt: string,
  windowDays = RECHECK_WINDOW_DAYS,
): InsightRecheck {
  let n = 0;
  let total = 0;
  const rounds = new Set<string>();
  for (const h of holes) {
    if (h.par !== par || h.score === null || !Number.isFinite(h.score)) continue;
    n += 1;
    total += h.score;
    rounds.add(h.round_id);
  }
  const recentValue = n > 0 ? Math.round((100 * total) / n) / 100 : null;
  return finish({
    recentValue,
    sampleN: rounds.size,
    minSampleN: minRounds,
    comparison,
    stillWorse: recentValue !== null && recentValue > comparison,
    checkedAt,
    windowDays,
  });
}

function finish(args: {
  recentValue: number | null;
  sampleN: number;
  minSampleN: number;
  comparison: number;
  stillWorse: boolean;
  checkedAt: string;
  windowDays: number;
}): InsightRecheck {
  const thin = args.recentValue === null || args.sampleN < args.minSampleN;
  return {
    status: thin ? 'thin' : args.stillWorse ? 'holds' : 'cleared',
    checked_at: args.checkedAt,
    window_days: args.windowDays,
    recent_value: args.recentValue,
    sample_n: args.sampleN,
    min_sample_n: args.minSampleN,
    comparison_value: args.comparison,
  };
}

export type RecheckTransition = 'resolve' | 'reopen' | 'none';

/**
 * The lifecycle edge a recheck implies for the row as it stands AFTER this
 * run's upsert.
 *
 *  - `resolve`: the row is a visible, coach-untouched problem
 *    (`detected`/`matured`) and the recent window cleared the generator's own
 *    trigger on an adequate sample.
 *  - `reopen`: the row was resolved BY THIS RECHECK (never by a coach or by
 *    lifecycle-cron Rule 1) and the recent window shows the leak again on an
 *    adequate sample — the problem came back.
 *  - `none`: everything else. A thin recent sample never moves a row either
 *    way; `tentative` is not visible; `addressed` belongs to the coach flow
 *    and cron Rule 1; a strength row (`isLeak=false`) has no problem to
 *    resolve or reopen.
 */
export function decideRecheckTransition(input: {
  lifecycle: InsightLifecycleState | null;
  resolvedBy: unknown;
  isLeak: boolean;
  recheck: InsightRecheck | null;
}): RecheckTransition {
  const { lifecycle, resolvedBy, isLeak, recheck } = input;
  if (!recheck || !isLeak || recheck.status === 'thin') return 'none';
  if (recheck.status === 'cleared' && (lifecycle === 'detected' || lifecycle === 'matured')) {
    return 'resolve';
  }
  if (recheck.status === 'holds' && lifecycle === 'resolved' && resolvedBy === RECHECK_RESOLVED_BY) {
    return 'reopen';
  }
  return 'none';
}

// ---------------------------------------------------------------------------
// Loaders (read-only)
// ---------------------------------------------------------------------------

function sinceDate(windowDays: number, now: number): string {
  return new Date(now - windowDays * 86400_000).toISOString().slice(0, 10);
}

/**
 * Putts from the player's completed, scored rounds in the recent window — the
 * same round filter as `update_player_putt_make_pct` (`status='completed'`,
 * `total_score IS NOT NULL`), plus `round_date >= now - windowDays`.
 */
export async function loadRecentPutts(
  playerId: string,
  windowDays = RECHECK_WINDOW_DAYS,
  now: number = Date.now(),
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
