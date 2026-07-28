/**
 * Effectiveness writer: rolls up `golf_coach_insights` activity into the
 * `golf_insight_effectiveness` aggregation table.
 *
 * Schema (live, see database.types.ts):
 *   period_start (date), period_end (date), team_id, insight_type,
 *   insights_generated, insights_dismissed, insights_acted_upon,
 *   insights_with_outcome, outcomes_improved, outcomes_no_change,
 *   outcomes_worsened, action_rate, improvement_rate, effectiveness_score
 *
 * One row per (team_id, insight_type, period_start, period_end). We write
 * a one-day period for the previous calendar day, derived from the raw
 * insights table:
 *   - insights_generated: rows with created_at inside the window
 *   - insights_dismissed: rows with dismissed_at inside the window
 *   - insights_acted_upon: rows with acknowledged_at inside the window
 *     (action_taken=true is fine too, but acknowledged_at gives us the
 *     when, which is necessary to attribute to a period)
 *   - insights_with_outcome / outcomes_*: rows with outcome_measured_at
 *     inside the window
 *
 * Because writes are upserts on (team_id, insight_type, period_start,
 * period_end), a re-run for the same day is idempotent — against the
 * `golf_insight_effectiveness_natural_key` unique index on those four
 * columns (see the upsert below). No delete-then-insert.
 *
 * VISIBILITY SCOPING (P1 fix): the fetch below applies the SAME
 * `applyInsightVisibility` contract (v3-engine-only + visible lifecycle +
 * not-dismissed) that every other `golf_coach_insights` reader uses
 * (see `src/lib/coachhelm/v3/insight-visibility.ts`). Without it, this
 * rollup counted dead v2-engine insight rows that no coach can ever see —
 * those rows form their own (team_id, insight_type) bucket that never gets
 * acted upon or measured, so it permanently writes an
 * `effectiveness_score=0` row for a type nobody can see, diluting the
 * coach-facing analytics page. This only changes what the rollup COUNTS,
 * never what gets written to `golf_coach_insights` itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logServerError } from '@/lib/server-error-logger';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Compute effectiveness rollups for the day-before-now and write them.
 *
 * Returns the number of (team, insight_type) rows written. Errors are
 * logged but never thrown — analytics rollups are best-effort.
 */
export async function rollupInsightEffectivenessForYesterday(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<{ written: number; failed: number }> {
  const yesterdayStart = new Date(nowMs - 24 * 60 * 60 * 1000);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000);

  return rollupInsightEffectivenessForRange(
    supabase,
    yesterdayStart,
    yesterdayEnd,
  );
}

interface InsightSnapshot {
  team_id: string | null;
  insight_type: string | null;
  created_at: string | null;
  dismissed_at: string | null;
  acknowledged_at: string | null;
  action_taken: boolean | null;
  outcome_measured_at: string | null;
  outcome_status: string | null;
}

interface Bucket {
  insights_generated: number;
  insights_dismissed: number;
  insights_acted_upon: number;
  insights_with_outcome: number;
  outcomes_improved: number;
  outcomes_no_change: number;
  outcomes_worsened: number;
}

function emptyBucket(): Bucket {
  return {
    insights_generated: 0,
    insights_dismissed: 0,
    insights_acted_upon: 0,
    insights_with_outcome: 0,
    outcomes_improved: 0,
    outcomes_no_change: 0,
    outcomes_worsened: 0,
  };
}

function inWindow(ts: string | null, startMs: number, endMs: number): boolean {
  if (!ts) return false;
  const t = Date.parse(ts);
  return t >= startMs && t < endMs;
}

export async function rollupInsightEffectivenessForRange(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<{ written: number; failed: number }> {
  const startIso = windowStart.toISOString();
  const endIso = windowEnd.toISOString();
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();

  // Pull rows that touched this window across any of the four timestamp
  // columns. We don't `.or()` because Supabase OR over four columns is
  // gnarly; instead select wide and filter in memory. Bound by the union
  // of created_at/dismissed_at/acknowledged_at/outcome_measured_at within
  // the window. The cheapest correct query is `created_at >= window_start
  // - 90d` (safety margin so late acknowledgments are caught).
  const lookbackMs = 90 * 24 * 60 * 60 * 1000;
  const fetchSinceIso = new Date(startMs - lookbackMs).toISOString();

  // The generated Database type may lag the live schema. Cast through
  // unknown to keep the rest of the file type-safe.
  //
  // `applyInsightVisibility` scopes this to the same rows every other
  // surface can see (v3-engine-only, visible lifecycle, not-dismissed) —
  // see the module-header note above. This changes only what gets
  // COUNTED here, not what `golf_coach_insights` stores.
  const { data, error } = await applyInsightVisibility(
    supabase
      .from('golf_coach_insights')
      .select(
        'team_id, insight_type, created_at, dismissed_at, acknowledged_at, action_taken, outcome_measured_at, outcome_status',
      )
      .gte('created_at', fetchSinceIso)
      .lt('created_at', endIso)
      .not('team_id', 'is', null),
  );

  if (error) {
    await logServerError(
      `analytics.effectiveness.fetch failed: ${error.message}`,
      {
        action: 'analytics.effectiveness.fetch',
        featureArea: 'coachhelm_analytics',
        extra: { code: error.code },
      },
      'error',
    );
    return { written: 0, failed: 1 };
  }

  const rows = (data ?? []) as unknown as InsightSnapshot[];

  // Group by (team_id, insight_type)
  type Key = string; // `${team}::${type}`
  const buckets = new Map<Key, { team_id: string; insight_type: string; b: Bucket }>();

  for (const r of rows) {
    if (!r.team_id || !r.insight_type) continue;
    const key: Key = `${r.team_id}::${r.insight_type}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        team_id: r.team_id,
        insight_type: r.insight_type,
        b: emptyBucket(),
      };
      buckets.set(key, entry);
    }
    const b = entry.b;

    if (inWindow(r.created_at, startMs, endMs)) {
      b.insights_generated++;
    }
    if (inWindow(r.dismissed_at, startMs, endMs)) {
      b.insights_dismissed++;
    }
    if (
      inWindow(r.acknowledged_at, startMs, endMs) ||
      (r.action_taken && inWindow(r.created_at, startMs, endMs))
    ) {
      // An ack inside the window OR generated-and-acted-on-same-window
      // both count toward acted_upon. We dedupe via the underlying row not
      // being countable twice in a single bucket call (no double-bookkeeping
      // because each branch sets the same column on the same row).
      b.insights_acted_upon++;
    }
    if (inWindow(r.outcome_measured_at, startMs, endMs) && r.outcome_status) {
      b.insights_with_outcome++;
      if (r.outcome_status === 'improved') b.outcomes_improved++;
      else if (r.outcome_status === 'no_change') b.outcomes_no_change++;
      else if (r.outcome_status === 'worsened') b.outcomes_worsened++;
    }
  }

  if (buckets.size === 0) {
    return { written: 0, failed: 0 };
  }

  const periodStart = startIso.split('T')[0];
  const periodEnd = endIso.split('T')[0];

  const inserts = Array.from(buckets.values()).map(({ team_id, insight_type, b }) => {
    const action_rate =
      b.insights_generated > 0 ? b.insights_acted_upon / b.insights_generated : 0;
    const improvement_rate =
      b.insights_with_outcome > 0 ? b.outcomes_improved / b.insights_with_outcome : 0;
    const effectiveness_score = action_rate * 0.3 + improvement_rate * 0.7;

    return {
      team_id,
      insight_type,
      period_start: periodStart,
      period_end: periodEnd,
      ...b,
      action_rate,
      improvement_rate,
      effectiveness_score,
      updated_at: new Date().toISOString(),
    };
  });

  // Idempotent rewrite via upsert against the natural-key unique index
  // `golf_insight_effectiveness_natural_key` on
  // (team_id, insight_type, period_start, period_end). Replaces the prior
  // delete-then-insert, which was racy and a wasted round-trip.
  const { error: upsertErr } = await supabase
    .from('golf_insight_effectiveness')
    .upsert(inserts as unknown as Record<string, never>[], {
      onConflict: 'team_id,insight_type,period_start,period_end',
    });

  if (upsertErr) {
    await logServerError(
      `analytics.effectiveness.upsert failed: ${upsertErr.message}`,
      {
        action: 'analytics.effectiveness.upsert',
        featureArea: 'coachhelm_analytics',
        extra: { code: upsertErr.code, count: inserts.length },
      },
      'error',
    );
    return { written: 0, failed: 1 };
  }

  // Best-effort outcome backfill on the underlying insights so the next
  // rollup picks up the newly resolved/regressed status. Failure here MUST
  // NOT mask the rollup write success — outcome attribution is advisory.
  try {
    await backfillInsightOutcomes(supabase, windowEnd);
  } catch (err) {
    await logServerError(
      `analytics.effectiveness.outcome_backfill threw: ${describeError(err)}`,
      {
        action: 'analytics.effectiveness.outcome_backfill',
        featureArea: 'coachhelm_analytics',
      },
      'warning',
    );
  }

  return { written: inserts.length, failed: 0 };
}

// ============================================================================
// OUTCOME BACKFILL (Step 4)
// ============================================================================
//
// For insights that have matured/addressed/archived AND have no outcome_status
// yet, compare a 14-day pre-window vs a 14-day post-window of the player's
// stats around `created_at` and label improved / unchanged / regressed.
//
// Strategy:
//   - Pull candidate insights (lifecycle in matured/addressed/archived,
//     outcome_status IS NULL) with player_id, evidence, created_at,
//     insight_type so we know which metric direction to credit.
//   - For each candidate, compute pre/post averages from `golf_rounds`
//     filtered by player_id + round_date band. We use `golf_rounds` directly
//     rather than `golf_player_stats_cache` because the cache only stores a
//     single current-state aggregate, not a historical bucket.
//   - Bucket the candidates by outcome status and bulk-update each bucket
//     with one UPDATE per status.
//
// If a metric can't be cleanly mapped we leave outcome_status NULL — better
// to under-attribute than to fabricate a measurement.

const POST_WINDOW_DAYS = 14;
const OUTCOME_DELTA_THRESHOLD = 0.5;
// Cap the number of candidates we process per cron tick. The cron runs daily
// so any leftover candidates get picked up tomorrow.
const OUTCOME_BACKFILL_LIMIT = 500;

interface OutcomeCandidate {
  id: string;
  player_id: string | null;
  insight_type: string | null;
  created_at: string | null;
  evidence: Record<string, unknown> | null;
}

interface RoundRow {
  player_id: string;
  round_date: string | null;
  total_score: number | null;
  score_to_par: number | null;
  strokes_gained_total: number | null;
  strokes_gained_putting: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_around_green: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
}

/**
 * Maps an insight's evidence.metric (or insight_type fallback) to a column
 * on golf_rounds plus the direction that counts as improvement.
 *   direction: 'higher' = bigger value is better (e.g. SG, FIR%, GIR%)
 *              'lower'  = smaller value is better (e.g. score, putts)
 * Returns null when we can't safely measure.
 */
function metricToRoundField(
  metric: string,
): { field: keyof RoundRow; direction: 'higher' | 'lower' } | null {
  const m = metric.toLowerCase();

  if (m === 'scoring_average' || m === 'score' || m === 'total_score') {
    return { field: 'total_score', direction: 'lower' };
  }
  if (m === 'score_to_par') return { field: 'score_to_par', direction: 'lower' };
  if (m === 'putts_per_round' || m === 'total_putts') {
    return { field: 'total_putts', direction: 'lower' };
  }
  if (m === 'strokes_gained_total' || m === 'sg_total') {
    return { field: 'strokes_gained_total', direction: 'higher' };
  }
  if (m === 'strokes_gained_putting' || m === 'sg_putting') {
    return { field: 'strokes_gained_putting', direction: 'higher' };
  }
  if (m === 'strokes_gained_approach' || m === 'sg_approach') {
    return { field: 'strokes_gained_approach', direction: 'higher' };
  }
  if (m === 'strokes_gained_tee' || m === 'sg_tee' || m === 'sg_ott') {
    return { field: 'strokes_gained_tee', direction: 'higher' };
  }
  if (m === 'strokes_gained_around_green' || m === 'sg_around_green') {
    return { field: 'strokes_gained_around_green', direction: 'higher' };
  }
  return null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

async function backfillInsightOutcomes(
  supabase: SupabaseClient,
  asOf: Date,
): Promise<void> {
  const asOfMs = asOf.getTime();
  // We can only label outcomes once at least POST_WINDOW_DAYS have elapsed
  // since the insight was created — otherwise the post-window is empty.
  const newestEligibleIso = new Date(
    asOfMs - POST_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: candData, error: candErr } = await supabase
    .from('golf_coach_insights')
    .select('id, player_id, insight_type, created_at, evidence')
    .in('lifecycle_state', ['matured', 'addressed', 'archived'])
    .is('outcome_status', null)
    .lte('created_at', newestEligibleIso)
    .limit(OUTCOME_BACKFILL_LIMIT);

  if (candErr) {
    await logServerError(
      `analytics.effectiveness.outcome_fetch failed: ${candErr.message}`,
      {
        action: 'analytics.effectiveness.outcome_fetch',
        featureArea: 'coachhelm_analytics',
        extra: { code: candErr.code },
      },
      'warning',
    );
    return;
  }

  const candidates = (candData ?? []) as unknown as OutcomeCandidate[];
  if (candidates.length === 0) return;

  // Pull all rounds we need in one trip, scoped to the union of player ids
  // and the maximum window across candidates.
  const playerIds = Array.from(
    new Set(candidates.map((c) => c.player_id).filter((id): id is string => !!id)),
  );
  if (playerIds.length === 0) return;

  let earliestNeededMs = asOfMs;
  for (const c of candidates) {
    if (!c.created_at) continue;
    const t = Date.parse(c.created_at);
    if (Number.isNaN(t)) continue;
    const preStart = t - POST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (preStart < earliestNeededMs) earliestNeededMs = preStart;
  }
  const earliestNeededIso = new Date(earliestNeededMs).toISOString();

  const { data: roundData, error: roundErr } = await supabase
    .from('golf_rounds')
    .select(
      'player_id, round_date, total_score, score_to_par, strokes_gained_total, strokes_gained_putting, strokes_gained_approach, strokes_gained_tee, strokes_gained_around_green, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible',
    )
    .in('player_id', playerIds)
    .gte('round_date', earliestNeededIso.split('T')[0]);

  if (roundErr) {
    await logServerError(
      `analytics.effectiveness.outcome_rounds_fetch failed: ${roundErr.message}`,
      {
        action: 'analytics.effectiveness.outcome_rounds_fetch',
        featureArea: 'coachhelm_analytics',
        extra: { code: roundErr.code },
      },
      'warning',
    );
    return;
  }

  const rounds = (roundData ?? []) as unknown as RoundRow[];
  // Index rounds by player for cheap per-candidate lookup.
  const roundsByPlayer = new Map<string, RoundRow[]>();
  for (const r of rounds) {
    if (!r.player_id) continue;
    const list = roundsByPlayer.get(r.player_id) ?? [];
    list.push(r);
    roundsByPlayer.set(r.player_id, list);
  }

  const improvedIds: string[] = [];
  const unchangedIds: string[] = [];
  const regressedIds: string[] = [];

  for (const cand of candidates) {
    if (!cand.player_id || !cand.created_at) continue;
    const createdMs = Date.parse(cand.created_at);
    if (Number.isNaN(createdMs)) continue;

    const evidence = cand.evidence ?? {};
    const metric =
      typeof evidence.metric === 'string' ? evidence.metric : (cand.insight_type ?? '');
    const mapping = metricToRoundField(metric);
    if (!mapping) continue;

    const playerRounds = roundsByPlayer.get(cand.player_id) ?? [];
    if (playerRounds.length === 0) continue;

    const windowMs = POST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const preStart = createdMs - windowMs;
    const postEnd = createdMs + windowMs;

    const preVals: number[] = [];
    const postVals: number[] = [];
    for (const r of playerRounds) {
      if (!r.round_date) continue;
      const rt = Date.parse(r.round_date);
      if (Number.isNaN(rt)) continue;
      const v = r[mapping.field];
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      if (rt >= preStart && rt < createdMs) preVals.push(v);
      else if (rt >= createdMs && rt <= postEnd) postVals.push(v);
    }

    const preAvg = avg(preVals);
    const postAvg = avg(postVals);
    if (preAvg === null || postAvg === null) continue;

    // Signed delta in the "improvement" direction. A 'lower is better'
    // metric improves when post < pre.
    const rawDelta = postAvg - preAvg;
    const directionSign = mapping.direction === 'higher' ? 1 : -1;
    const improvementDelta = rawDelta * directionSign;

    if (improvementDelta > OUTCOME_DELTA_THRESHOLD) {
      improvedIds.push(cand.id);
    } else if (improvementDelta < -OUTCOME_DELTA_THRESHOLD) {
      regressedIds.push(cand.id);
    } else if (Math.abs(improvementDelta) <= OUTCOME_DELTA_THRESHOLD) {
      unchangedIds.push(cand.id);
    }
  }

  const measuredAt = new Date().toISOString();
  // Enum values must match the reader at line ~174 above
  // (b.outcomes_improved / outcomes_no_change / outcomes_worsened).
  const buckets: Array<[string[], string]> = [
    [improvedIds, 'improved'],
    [unchangedIds, 'no_change'],
    [regressedIds, 'worsened'],
  ];
  for (const [ids, status] of buckets) {
    if (ids.length === 0) continue;
    const { error: updErr } = await supabase
      .from('golf_coach_insights')
      .update(
        { outcome_status: status, outcome_measured_at: measuredAt } as unknown as Record<
          string,
          never
        >,
      )
      .in('id', ids);
    if (updErr) {
      await logServerError(
        `analytics.effectiveness.outcome_update[${status}] failed: ${updErr.message}`,
        {
          action: 'analytics.effectiveness.outcome_update',
          featureArea: 'coachhelm_analytics',
          extra: { code: updErr.code, status, count: ids.length },
        },
        'warning',
      );
    }
  }
}
