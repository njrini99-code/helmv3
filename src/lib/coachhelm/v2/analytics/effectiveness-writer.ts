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
import { averageInWindow } from '@/lib/coachhelm/v3/causality/attribute';
import { lookupMetricSource } from '@/lib/coachhelm/v3/causality/metric-sources';
import { improvementSign } from '@/lib/coachhelm/v3/metrics/registry';

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
//   - For each candidate, resolve `evidence.metric` (falling back to
//     `insight_type`) against the v3 metric registry first
//     (`lookupMetricSource` / `averageInWindow`, `v3/causality/`). Most v3
//     insights (sg_*, gir_pct, penalty_rate_per_round, big_number_rate,
//     scoring_par_3/4/5, scrambling_pct_sand, and the `score_to_par` /
//     `fairways_hit_pct` aliases) resolve here and get measured from their
//     canonical per-round source (golf_rounds or golf_round_stats_cache).
//     A metric the v3 registry marks `intentional-null` (no trustworthy
//     per-round time-series) is left unmeasured on purpose — same policy
//     the v3 causality-attribute cron uses.
//   - A metric the v3 registry doesn't recognize at all (legacy v2 naming
//     like `scoring_average` / `total_putts`) falls back to the original
//     `metricToRoundField` mapping against the bulk-fetched `golf_rounds`
//     window, computed in-memory (no extra query). We use `golf_rounds`
//     directly rather than `golf_player_stats_cache` because the cache only
//     stores a single current-state aggregate, not a historical bucket.
//   - Each measured candidate gets outcome_status/outcome_metric_name/
//     outcome_metric_before/outcome_metric_after written together in one
//     per-row UPDATE (not a bulk upsert — several other NOT NULL columns on
//     `golf_coach_insights` have no default, so a partial-column upsert
//     would attempt an invalid INSERT on conflict).
//
// If a metric can't be cleanly mapped we leave outcome_status NULL — better
// to under-attribute than to fabricate a measurement.

const POST_WINDOW_DAYS = 14;
const OUTCOME_DELTA_THRESHOLD = 0.5;
// Cap the number of candidates we process per cron tick. Lowered from 500 to
// 150 when the v3 metric path was added: a v3-resolvable candidate now costs
// two extra `averageInWindow` queries (pre/post) instead of being covered by
// the single bulk `golf_rounds` fetch below, mirroring the LIMIT=50 the v3
// causality-attribute cron (`api/cron/v3/causality-attribute`) uses for the
// same per-insight window-query shape. The cron runs daily
// so any leftover candidates get picked up tomorrow.
const OUTCOME_BACKFILL_LIMIT = 150;
// Per-id outcome updates run with this much concurrency at a time (bounded
// fan-out, not one request per candidate serially).
const OUTCOME_UPDATE_CONCURRENCY = 20;
// Page size for the paginated candidate fetch below, and a hard cap on pages
// scanned per tick — mirrors FETCH_PAGE_SIZE/MAX_FETCH_PAGES in
// `api/cron/v3/causality-attribute/route.ts`. At 200/page this scans up to
// 4,000 candidates per run before giving up for the night.
const FETCH_PAGE_SIZE = 200;
const MAX_FETCH_PAGES = 20;

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

  // PAGINATE (created_at ASC) rather than a single unordered `.limit()`. Most
  // of the eligible backlog is permanently unmeasurable — an evidence.metric
  // the v3 registry marks intentional-null, or one neither the v3 registry
  // nor the legacy `metricToRoundField` mapping recognizes at all. An
  // unordered fixed-N window fills up with those sticky rows (they never get
  // an outcome_status write, so they never leave the eligible set) and
  // starves the measurable backlog — the same failure mode documented on
  // `api/cron/v3/causality-attribute`'s FETCH_PAGE_SIZE/MAX_FETCH_PAGES. We
  // page through candidates, drop unmeasurable rows synchronously (both
  // lookups are pure/in-memory), and stop once OUTCOME_BACKFILL_LIMIT
  // measurable rows are collected or pages run out.
  const candidates: OutcomeCandidate[] = [];
  let page = 0;
  for (; page < MAX_FETCH_PAGES && candidates.length < OUTCOME_BACKFILL_LIMIT; page += 1) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data: pageData, error: candErr } = await supabase
      .from('golf_coach_insights')
      .select('id, player_id, insight_type, created_at, evidence')
      .in('lifecycle_state', ['matured', 'addressed', 'archived'])
      .is('outcome_status', null)
      .lte('created_at', newestEligibleIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (candErr) {
      await logServerError(
        `analytics.effectiveness.outcome_fetch failed: ${candErr.message}`,
        {
          action: 'analytics.effectiveness.outcome_fetch',
          featureArea: 'coachhelm_analytics',
          extra: { code: candErr.code, page },
        },
        'warning',
      );
      return;
    }

    const pageRows = (pageData ?? []) as unknown as OutcomeCandidate[];
    if (pageRows.length === 0) break; // candidates exhausted

    for (const row of pageRows) {
      if (candidates.length >= OUTCOME_BACKFILL_LIMIT) break;
      const evidence = row.evidence ?? {};
      const metric =
        typeof evidence.metric === 'string' ? evidence.metric : (row.insight_type ?? '');
      if (!metric) continue;
      const v3Source = lookupMetricSource(metric);
      const v3Measurable = v3Source !== null && v3Source.kind !== 'intentional-null';
      const legacyMeasurable = v3Source === null && metricToRoundField(metric) !== null;
      if (!v3Measurable && !legacyMeasurable) continue; // never measurable — don't clog the window
      candidates.push(row);
    }

    if (pageRows.length < FETCH_PAGE_SIZE) break; // short page => last page
  }

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

  // Enum values must match the reader at line ~174 above
  // (b.outcomes_improved / outcomes_no_change / outcomes_worsened).
  type OutcomeStatus = 'improved' | 'no_change' | 'worsened';
  interface OutcomeUpdate {
    id: string;
    status: OutcomeStatus;
    metricName: string;
    before: number;
    after: number;
  }
  const updates: OutcomeUpdate[] = [];

  // Signed delta in the "improvement" direction. A 'lower is better' metric
  // improves when post < pre — `sign` is already the registry/legacy
  // direction multiplier, never inferred from the raw sign of the delta.
  function classify(id: string, metric: string, preAvg: number, postAvg: number, sign: 1 | -1) {
    const improvementDelta = (postAvg - preAvg) * sign;
    const status: OutcomeStatus =
      improvementDelta > OUTCOME_DELTA_THRESHOLD
        ? 'improved'
        : improvementDelta < -OUTCOME_DELTA_THRESHOLD
          ? 'worsened'
          : 'no_change';
    updates.push({ id, status, metricName: metric, before: preAvg, after: postAvg });
  }

  const windowMs = POST_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const cand of candidates) {
    if (!cand.player_id || !cand.created_at) continue;
    const createdMs = Date.parse(cand.created_at);
    if (Number.isNaN(createdMs)) continue;

    const evidence = cand.evidence ?? {};
    const metric =
      typeof evidence.metric === 'string' ? evidence.metric : (cand.insight_type ?? '');
    if (!metric) continue;

    const preStart = createdMs - windowMs;
    const postEnd = createdMs + windowMs;

    // v3 metric ids (sg_*, gir_pct, penalty_rate_per_round, big_number_rate,
    // scoring_par_3/4/5, scrambling_pct_sand, score_to_par/fairways_hit_pct
    // aliases, ...) resolve through the same per-round source table the v3
    // causality-attribute cron uses. This takes priority over the legacy v2
    // mapping below.
    const v3Source = lookupMetricSource(metric);
    if (v3Source) {
      if (v3Source.kind === 'intentional-null') {
        // Registry says this metric has no trustworthy per-round
        // time-series — leave outcome_status NULL, don't fabricate one.
        continue;
      }
      const preStartIso = new Date(preStart).toISOString();
      const createdIso = new Date(createdMs).toISOString();
      // v3 window sources (averageGolfRoundsColumn et al. in
      // v3/causality/attribute.ts) filter dates INCLUSIVELY via
      // `.gte(start.slice(0,10)).lte(end.slice(0,10))`. A post-window
      // starting at createdIso would therefore re-include a round played on
      // the insight's own creation date in BOTH windows (that round is
      // usually the one the post-round trigger just generated the insight
      // from), diluting the delta. Start the post window the day AFTER the
      // creation date instead — the legacy golf_rounds path below already
      // buckets a same-day round into "pre" only (its created_at is an
      // intraday timestamp, always later than that day's midnight
      // round_date), so this keeps both paths consistent.
      const createdDateStartMs = Date.parse(`${createdIso.slice(0, 10)}T00:00:00.000Z`);
      const postStartMs = createdDateStartMs + 24 * 60 * 60 * 1000;
      const postStartIso = new Date(postStartMs).toISOString();
      const postEndIso = new Date(postStartMs + windowMs).toISOString();
      const [preResult, postResult] = await Promise.all([
        averageInWindow(supabase, cand.player_id, metric, preStartIso, createdIso),
        averageInWindow(supabase, cand.player_id, metric, postStartIso, postEndIso),
      ]);
      if (preResult.ok && postResult.ok) {
        classify(cand.id, metric, preResult.avg, postResult.avg, improvementSign(metric));
      }
      continue;
    }

    // Not a v3 metric id at all — fall back to the legacy v2 golf_rounds
    // column mapping, using the rounds already bulk-fetched above (no extra
    // query per candidate).
    const mapping = metricToRoundField(metric);
    if (!mapping) continue;

    const playerRounds = roundsByPlayer.get(cand.player_id) ?? [];
    if (playerRounds.length === 0) continue;

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

    classify(cand.id, metric, preAvg, postAvg, mapping.direction === 'higher' ? 1 : -1);
  }

  const measuredAt = new Date().toISOString();

  // Per-row UPDATE (not a bulk upsert): several other NOT NULL columns on
  // `golf_coach_insights` (insight_type, title, ...) have no default, so a
  // partial-column upsert would attempt an invalid INSERT the moment it hit
  // the ON CONFLICT path. Bounded fan-out keeps this from becoming hundreds
  // of fully-serial round trips.
  for (let i = 0; i < updates.length; i += OUTCOME_UPDATE_CONCURRENCY) {
    const chunk = updates.slice(i, i + OUTCOME_UPDATE_CONCURRENCY);
    await Promise.all(
      chunk.map(async (u) => {
        const { error: updErr } = await supabase
          .from('golf_coach_insights')
          .update(
            {
              outcome_status: u.status,
              outcome_measured_at: measuredAt,
              outcome_metric_name: u.metricName,
              outcome_metric_before: u.before,
              outcome_metric_after: u.after,
            } as unknown as Record<string, never>,
          )
          .eq('id', u.id);
        if (updErr) {
          await logServerError(
            `analytics.effectiveness.outcome_update[${u.status}] failed: ${updErr.message}`,
            {
              action: 'analytics.effectiveness.outcome_update',
              featureArea: 'coachhelm_analytics',
              extra: { code: updErr.code, status: u.status, id: u.id },
            },
            'warning',
          );
        }
      }),
    );
  }
}

/**
 * Exported for direct unit testing only — same pattern as
 * `__INSIGHT_CATEGORY_METRIC_PREFIXES` in `v3/causality/metric-sources.ts`.
 * Not part of the runtime contract; real callers go through
 * `rollupInsightEffectivenessForRange`/`...ForYesterday`.
 */
export const __backfillInsightOutcomesForTest = backfillInsightOutcomes;
