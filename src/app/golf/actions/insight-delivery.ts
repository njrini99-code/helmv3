'use server';

/**
 * Insight Delivery server actions — Foundation / Task F1.
 *
 * The canonical fetchers for evidence-backed insights across every player /
 * coach surface (Hub signal card, CoachHelm dashboard hero, Round Review
 * takeaway, Coach alerts). Every query here is wired to the NEW system —
 * `golf_coach_insights` rows with `evidence IS NOT NULL` and a player-facing
 * `lifecycle_state`. We NEVER fall back to the in-memory engine output for
 * delivery.
 *
 * Contract: docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 *
 * Every fetcher pre-joins `golf_insight_drill_attachments → golf_drills` so
 * the primitive can render drill chips inline without a second round-trip per
 * card. Drills are sorted by rank and capped at 3.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { isTransientFetchError, delay } from '@/lib/utils/transient-error';
import type {
  InsightCategory,
  InsightEvidence,
  InsightMovement,
} from '@/lib/coachhelm/v2/insights/types';
import type { Database } from '@/lib/types/database';
import { assembleThemes, sanitizeProse } from '@/lib/coachhelm/v3/themes/assemble';
import type { AssembledThemes, AssembledEvidence, RootDriver, ThemeTrend } from '@/lib/coachhelm/v3/themes/types';
import { buildShotDrivers } from '@/lib/coachhelm/v3/themes/shot-drivers';
import type { ShotDriverInput } from '@/lib/coachhelm/v3/themes/shot-drivers';
import { computeSgTrends } from '@/lib/coachhelm/v3/themes/trend';
import type { SgRoundSample } from '@/lib/coachhelm/v3/themes/trend';
import { loadCoachWeightsForPlayer, type CoachWeights } from '@/lib/coachhelm/v3/ranking/score';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
import {
  collapseParScoring,
  dedupeBySubject,
  rankEvidenceInsights,
} from './insight-delivery-ranking';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';

// ---------------------------------------------------------------------------
// Shared shape — EvidenceInsight. Downstream components import this type.
// ---------------------------------------------------------------------------

/** A pre-fetched drill chip attached to an insight. Shape mirrors the
 *  subset of `golf_drills` columns the primitive renders inline. */
export interface InsightAttachedDrill {
  id: string;
  slug: string;
  title: string;
  duration_min: number;
  difficulty: string;
}

/** Player-side feedback (nullable; only present on `getInsightsForPlayer` /
 *  `getTopInsightForPlayer`). Keeps the coach shape clean when coaches are
 *  looking at someone else's row. */
export interface InsightPlayerFeedback {
  rating: 'helpful' | 'not_helpful' | 'dismissed' | 'acknowledged';
  created_at: string;
}

/**
 * Canonical shape consumed by `<InsightCard>`. Downstream teams (Hub,
 * Dashboard, Round Review) import this type directly — do NOT re-shape in
 * feature code.
 */
export interface EvidenceInsight {
  id: string;
  player_id: string;
  category: InsightCategory | null;
  /** Canonical generator type — the DEDICATED `golf_coach_insights.insight_type`
   *  column (written as `this.insightType` in generator-base.ts), NOT a metadata
   *  key. This is the value the coach-weights map is keyed by, so it must be
   *  carried verbatim from the row for `scoreInsight`'s coach_weight lookup to
   *  hit. Optional/nullable for back-compat: pre-v3 rows may not have stamped it,
   *  and older test fixtures predate the field. */
  insight_type?: string | null;
  title: string;
  content: string;
  signature: string | null;
  evidence: InsightEvidence;
  metadata: (Record<string, unknown> & { movement?: InsightMovement }) | null;
  lifecycle_state: 'tentative' | 'detected' | 'matured' | 'addressed' | 'resolved' | 'archived';
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  acknowledged_at: string | null;
  resolved_at: string | null;
  /** Outcome bucket from the analytics rollup. Optional because rows that
   *  haven't been measured yet (or pre-backfill rows) carry null/undefined. */
  outcome_status?: 'improved' | 'no_change' | 'worsened' | null;
  outcome_measured_at?: string | null;
  created_at: string;
  updated_at: string;
  player_feedback?: InsightPlayerFeedback | null;
  drills?: InsightAttachedDrill[];
}

/** Shared options for player-scoped listings. */
export interface GetInsightsForPlayerOptions {
  limit?: number;
  categories?: string[];
  minConfidence?: number;
  window_days?: number;
}

export interface GetInsightsForCoachOptions {
  limit?: number;
  categories?: string[];
  player_id?: string;
  /** Narrows to the supplied priority levels. Used by the alerts surface
   *  which only cares about urgent/high rows. */
  priorities?: Array<'low' | 'medium' | 'high' | 'urgent'>;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

// V3_ENGINE_FILTER + VISIBLE_LIFECYCLE_STATES moved to the shared
// `@/lib/coachhelm/v3/insight-visibility` module so the causality
// attribution cron applies the exact same eligibility boundary
// (to-95 audit P1). Imported at the top of this file.

type CoachInsightRow = Database['public']['Tables']['golf_coach_insights']['Row'];
type DrillAttachmentRow = Database['public']['Tables']['golf_insight_drill_attachments']['Row'];
type DrillRow = Database['public']['Tables']['golf_drills']['Row'];

/**
 * Raw row shape we pull from `golf_coach_insights` with an embedded array of
 * drill attachments. Supabase's `select(..., foreign_table(...))` returns a
 * 1→N array shape; we normalize below. We use `Pick<>` (not `extends`) so the
 * shape exactly matches the subset of columns requested by `INSIGHT_SELECT` —
 * if we extended the full `CoachInsightRow` the supabase typed builder would
 * complain about missing unselected columns.
 */
type SelectedInsightColumns =
  | 'id'
  | 'player_id'
  | 'category'
  | 'insight_type'
  | 'title'
  | 'content'
  | 'signature'
  | 'evidence'
  | 'metadata'
  | 'lifecycle_state'
  | 'status'
  | 'priority'
  | 'acknowledged_at'
  | 'resolved_at'
  | 'outcome_status'
  | 'outcome_measured_at'
  | 'created_at'
  | 'updated_at';

type RawInsightRowWithDrills = Pick<CoachInsightRow, SelectedInsightColumns> & {
  drill_attachments?: Array<Pick<DrillAttachmentRow, 'rank'> & {
    drill: Pick<DrillRow, 'id' | 'slug' | 'title' | 'duration_min' | 'difficulty'> | null;
  }> | null;
};

/** Select clause used by every fetcher — keep in sync. */
const INSIGHT_SELECT = `
  id, player_id, category, insight_type, title, content, signature, evidence, metadata,
  lifecycle_state, status, priority, acknowledged_at, resolved_at,
  outcome_status, outcome_measured_at,
  created_at, updated_at,
  drill_attachments:golf_insight_drill_attachments (
    rank,
    drill:golf_drills (
      id, slug, title, duration_min, difficulty
    )
  )
` as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the single top insight for a player's Hub signal card.
 *
 * Ranking:
 *   1. `priority === 'urgent'` always wins (ordered by created_at DESC
 *      among urgent peers).
 *   2. Otherwise, highest `strokes_impact * confidence` wins.
 *
 * Returns `null` when the player has no evidence-backed insights in a
 * visible lifecycle state.
 */
export async function getTopInsightForPlayer(
  playerId: string,
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight | null> {
  if (!playerId) return null;

  const supabase = supabaseOverride ?? (await createClient());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  // Self or coach-staffing-team access. `verifyPlayerAccess` performs its own
  // auth check + logs failures centrally, so we just branch on its result.
  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return null;

  // 1. Urgent-priority first pass. We run it as a separate query so the JSON
  //    ordering below never accidentally starves an urgent row.
  const { data: urgent, error: urgentError } = await supabase
    .from('golf_coach_insights')
    .select(INSIGHT_SELECT)
    .eq('player_id', playerId)
    .not('evidence', 'is', null)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .eq('priority', 'urgent')
    .order('created_at', { ascending: false })
    .limit(1);

  if (urgentError) {
    await logServerError(
      `getTopInsightForPlayer.urgent failed: ${urgentError.message}`,
      { action: 'insight-delivery.getTopInsightForPlayer', featureArea: 'insights', playerId },
    );
  } else if (urgent && urgent.length > 0) {
    return mapRowToEvidenceInsight(urgent[0] as unknown as RawInsightRowWithDrills);
  }

  // 2. Score by strokes_impact * confidence. JSON extraction runs in-DB so we
  //    don't fetch thirty rows just to sort them client-side.
  const { data, error } = await supabase
    .from('golf_coach_insights')
    .select(INSIGHT_SELECT)
    .eq('player_id', playerId)
    .not('evidence', 'is', null)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    await logServerError(
      `getTopInsightForPlayer.ranking failed: ${error.message}`,
      { action: 'insight-delivery.getTopInsightForPlayer', featureArea: 'insights', playerId },
    );
    return null;
  }

  const rows = (data ?? []) as unknown as RawInsightRowWithDrills[];
  if (rows.length === 0) return null;

  // The urgent first pass already short-circuited any urgent row at the DB
  // level, so this second pass only sees non-urgent rows. Rank with the shared
  // `scoreInsight` composite so the single-pick agrees with the list feed.
  const weights = await loadCoachWeightsForPlayer(supabase, playerId).catch(() => ({}));
  const activeGoals = await loadActiveGoals(playerId).catch(() => []);
  const ranked = rankEvidenceInsights(
    rows.map(mapRowToEvidenceInsight).filter((r): r is EvidenceInsight => r !== null),
    weights,
    activeGoals,
  );

  return ranked[0] ?? null;
}

/**
 * Returns the full list of evidence-backed insights for a player, newest
 * first. Used by the CoachHelm dashboard feed and `My Insights` redirects.
 *
 * Resilience: wraps the Supabase fetch in a single retry on transient
 * network errors (`TypeError: fetch failed`, ECONNRESET, etc.) and
 * returns `[]` on final failure so the dashboard renders an empty feed
 * instead of throwing.
 */
export async function getInsightsForPlayer(
  playerId: string,
  opts: GetInsightsForPlayerOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight[]> {
  if (!playerId) return [];

  let supabase: SupabaseClient;
  try {
    supabase = supabaseOverride ?? (await createClient());
  } catch (err) {
    await logServerError(
      `getInsightsForPlayer client init failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'insight-delivery.getInsightsForPlayer', featureArea: 'insights', playerId },
    );
    return [];
  }

  let user;
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) return [];
    user = data.user;
  } catch (err) {
    // Auth-call fetch failures shouldn't poison the dashboard.
    if (isTransientFetchError(err)) {
      console.debug(
        `[insight-delivery] auth.getUser transient: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
    throw err;
  }

  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return [];

  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

  // Pull a wider set than `limit` so the in-app rank-by-impact below has room
  // to favor |strokes_impact| × confidence over recency before trimming (audit
  // RANK-1 / RANK-4 — the created_at-only player feed made the impact backfill
  // a no-op on player cards and dropped a high-impact older row at the window).
  const PRE_RANK_FETCH = Math.min(100, Math.max(50, limit * 5));

  const runQuery = () => {
    let query = supabase
      .from('golf_coach_insights')
      .select(INSIGHT_SELECT)
      .eq('player_id', playerId)
      .not('evidence', 'is', null)
      .or(V3_ENGINE_FILTER)
      .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(PRE_RANK_FETCH);

    if (opts.categories && opts.categories.length > 0) {
      query = query.in('category', opts.categories);
    }
    return query;
  };

  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const result = await runQuery();
    data = result.data;
    error = result.error;
  } catch (err) {
    // The supabase client's underlying fetch can throw before returning a
    // typed { data, error } pair (e.g. TypeError: fetch failed). Retry
    // once for transient errors, otherwise return [] so callers don't crash.
    if (isTransientFetchError(err)) {
      await delay(500);
      try {
        const result = await runQuery();
        data = result.data;
        error = result.error;
      } catch (retryErr) {
        await logServerError(
          `getInsightsForPlayer fetch failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
          { action: 'insight-delivery.getInsightsForPlayer', featureArea: 'insights', playerId },
        );
        return [];
      }
    } else {
      await logServerError(
        `getInsightsForPlayer failed: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'insight-delivery.getInsightsForPlayer', featureArea: 'insights', playerId },
      );
      return [];
    }
  }

  if (error) {
    await logServerError(
      `getInsightsForPlayer failed: ${error.message}`,
      { action: 'insight-delivery.getInsightsForPlayer', featureArea: 'insights', playerId },
    );
    return [];
  }

  const rows = (data ?? []) as unknown as RawInsightRowWithDrills[];
  const insights = rows
    .map(mapRowToEvidenceInsight)
    .filter((r): r is EvidenceInsight => r !== null);

  // Client-side filters. We keep them here (not in the SQL) because the
  // `evidence` JSONB's shape isn't indexed for these fields, and at
  // PRE_RANK_FETCH ≤ 100 the post-filter cost is negligible.
  const filtered = insights.filter((insight) => {
    if (opts.minConfidence != null) {
      const confidence = insight.evidence.confidence;
      if (!Number.isFinite(confidence) || confidence < opts.minConfidence) return false;
    }
    if (opts.window_days != null) {
      const windowDays = insight.evidence.window_days;
      if (!Number.isFinite(windowDays) || windowDays > opts.window_days) return false;
    }
    return true;
  });

  // RANK-1: order the player feed by the shared `scoreInsight` composite — the
  // SAME contract every surface uses — so a high-leverage leak (or a high-
  // confidence zero-impact diagnostic, via the rank floor) leads the card stack
  // instead of whatever was created most recently. Coach weights default to 1.0
  // until calibration lands; active goals float goal-touching rows up.
  const weights = await loadCoachWeightsForPlayer(supabase, playerId).catch(() => ({}));
  const activeGoals = await loadActiveGoals(playerId).catch(() => []);
  const ranked = rankEvidenceInsights(filtered, weights, activeGoals);

  // Finding 29: apply the SAME (player:category:metric-subject) dedupe the
  // coach feed uses (via the shared `dedupeBySubject` helper) so a player does
  // not see duplicate-subject cards a coach viewing the same player sees merged.
  // C2: collapse the 3 par_scoring rows into ONE "Scoring by par type" card
  // BEFORE dedupe so the merged card is treated as a single unit downstream.
  // Dedupe AFTER ranking so the surviving row is the highest-ranked of a group,
  // then trim to the requested limit.
  return dedupeBySubject(collapseParScoring(ranked)).slice(0, limit);
}

/**
 * Returns evidence-backed insights for ANY player on the coach's teams. When
 * `opts.player_id` is provided, narrows to just that player (after access
 * verification).
 *
 * Coaches rely on this on the `/coachhelm` hub + team dashboards. Unlike the
 * player variants, we trust `is_golf_team_coach` RLS to pre-filter rows —
 * we call `verifyPlayerAccess` only when a specific player_id is supplied.
 */
export async function getInsightsForCoach(
  coachId: string,
  opts: GetInsightsForCoachOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight[]> {
  if (!coachId) return [];

  const supabase = supabaseOverride ?? (await createClient());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  // Player filter → authorization path. Without a player_id the RLS policies
  // on `golf_coach_insights` restrict reads to teams the coach staffs, which
  // is what we want for the coach dashboard sweep.
  if (opts.player_id) {
    const access = await verifyPlayerAccess(opts.player_id, user.id, supabase);
    if (!access.allowed) return [];
  }

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  // Pre-order the candidate window by created_at (NOT evidence->strokes_impact):
  // 176/232 live rows carry strokes_impact≈0, so an impact-DESC pre-order pushes
  // every high-confidence zero-impact diagnostic to the bottom and truncates it
  // at PRE_RANK_FETCH before the in-app `scoreInsight` floor can rescue it. We
  // widen the window and let the shared composite reorder in-app instead.
  //
  // SCOPE (A5 + A8): the PER-PLAYER feed (opts.player_id set — the window is one
  // player's few-dozen rows) keeps its bounded newest-first window; that set
  // never overflows PRE_RANK_FETCH, so it cannot truncate (fixed in A5). The
  // TEAM-WIDE sweep (no player_id) is FIXED IN A8: instead of capping at the
  // newest PRE_RANK_FETCH (≤100) across the WHOLE team — which truncated a
  // high-impact OLDER row on any >100-row team (a ~10-player team realistically
  // has 150–400 visible rows) before the in-app `scoreInsight` rank saw it — we
  // fetch the FULL visible team set (paginated via `fetchAllRowsResult`, ordered
  // by `id` for stable paging since we rank in-app afterward) and let the shared
  // composite reorder + the caller's `limit` slice it. The visible set is bounded
  // by the lifecycle/v3 filters (archived/dismissed/non-v3 excluded), so it's a
  // few hundred rows per team — cheap to fetch and rank in memory.

  let data: unknown = null;
  let error: { message: string } | null = null;

  if (opts.player_id) {
    // PER-PLAYER path — keep the bounded newest-first window (A5). A single
    // player's visible set is small (a few dozen rows); it never overflows
    // PRE_RANK_FETCH, so the in-app rank sees every row. PRE_RANK_FETCH is
    // computed here (only the per-player branch caps with `.limit()`); the
    // team-wide branch paginates the full set and never uses it.
    const PRE_RANK_FETCH = Math.min(100, Math.max(50, limit * 5));
    const playerId = opts.player_id;
    let query = supabase
      .from('golf_coach_insights')
      .select(INSIGHT_SELECT)
      .eq('player_id', playerId)
      .not('evidence', 'is', null)
      .or(V3_ENGINE_FILTER)
      .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(PRE_RANK_FETCH);

    if (opts.categories && opts.categories.length > 0) {
      query = query.in('category', opts.categories);
    }
    if (opts.priorities && opts.priorities.length > 0) {
      query = query.in('priority', opts.priorities);
    }

    const result = await query;
    data = result.data;
    error = result.error;
  } else {
    // TEAM-WIDE sweep — fetch the FULL visible set (A8). Order by `id` for stable
    // pagination (DB order is irrelevant: we rank in-app afterward, only
    // completeness matters). No `.limit()` row cap — that would reintroduce the
    // newest-100 truncation. RLS restricts reads to teams the coach staffs. The
    // SAME lifecycle/v3/status + optional category/priority filters as the
    // per-player branch are applied here.
    const result = await fetchAllRowsResult((from, to) => {
      let query = supabase
        .from('golf_coach_insights')
        .select(INSIGHT_SELECT)
        .not('evidence', 'is', null)
        .or(V3_ENGINE_FILTER)
        .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
        .neq('status', 'dismissed')
        .order('id', { ascending: true });

      if (opts.categories && opts.categories.length > 0) {
        query = query.in('category', opts.categories);
      }
      if (opts.priorities && opts.priorities.length > 0) {
        query = query.in('priority', opts.priorities);
      }

      return query.range(from, to);
    });
    data = result.data;
    error = result.error;

    // Soft-ceiling observability (A8 review #4). The fetch is correct and
    // bounded (RLS scopes to one team; pagination handles >1000), but because
    // VISIBLE_LIFECYCLE_STATES includes `resolved`/`addressed` the visible set
    // isn't pruned over time, and we rank+dedupe it all in memory. Emit ONE
    // warning the day the bounded assumption breaks — surfacing it, NOT capping
    // or dropping anything. A season window would be the fix if this fires.
    const TEAM_SWEEP_SOFT_CEILING = 800;
    const fetchedCount = Array.isArray(result.data) ? result.data.length : 0;
    if (!error && fetchedCount > TEAM_SWEEP_SOFT_CEILING) {
      await logServerError(
        `coach team-sweep returned ${fetchedCount} visible insights for coach ${coachId} — exceeds soft ceiling, consider a season window`,
        { action: 'insight-delivery.getInsightsForCoach', featureArea: 'insights', extra: { coachId, fetchedCount } },
        'warning',
      );
    }
  }

  if (error) {
    await logServerError(
      `getInsightsForCoach failed: ${error.message}`,
      { action: 'insight-delivery.getInsightsForCoach', featureArea: 'insights', extra: { coachId } },
    );
    return [];
  }

  const rows = (data ?? []) as unknown as RawInsightRowWithDrills[];
  const mapped = rows
    .map(mapRowToEvidenceInsight)
    .filter((r): r is EvidenceInsight => r !== null);

  // Rank by the shared `scoreInsight` composite (rank floor + damping + urgent
  // short-circuit + exemption) and dedupe across categories. Goals/weights are
  // per-player; on the coach sweep (no player_id) we rank with neutral weights
  // and no goals — the floor/confidence/damping/coachability terms still order
  // the feed correctly. When a specific player is requested we load their goals.
  let goals: Goal[] = [];
  let weights: CoachWeights = {};
  if (opts.player_id) {
    weights = await loadCoachWeightsForPlayer(supabase, opts.player_id).catch(() => ({}));
    goals = await loadActiveGoals(opts.player_id).catch(() => []);
  }
  // C2: collapse the 3 par_scoring rows into ONE "Scoring by par type" card
  // BEFORE dedupe — same IDENTICAL-application rule as dedupeBySubject itself.
  const ranked = dedupeBySubject(collapseParScoring(rankEvidenceInsights(mapped, weights, goals)));

  return ranked.slice(0, limit);
}

/**
 * Returns the single insight to feature on a round-review takeaway card.
 *
 * Strategy: highest-impact insight created or updated within 24h of this
 * round's `round_date`. (`golf_rounds` carries no `submitted_at`, so we anchor
 * on `round_date`.)
 *
 * NOTE: an earlier `metadata.related_round_ids` JSONB-containment primary match
 * was removed — no generator ever stamped that key, so the query was dead and
 * always fell through to the temporal window below. Re-introduce a primary tag
 * match here only once a generator actually writes `related_round_ids`.
 */
export async function getRoundTakeawayInsight(
  playerId: string,
  roundId: string,
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight | null> {
  if (!playerId || !roundId) return null;

  const supabase = supabaseOverride ?? (await createClient());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return null;

  // Temporal match. Pull the round's date, look for insights created or
  // updated within a 24-hour window on either side, and pick the highest-impact
  // one. Approximate, but it's the only round↔insight link we currently have.
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('round_date')
    .eq('id', roundId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (roundError || !round) {
    if (roundError) {
      await logServerError(
        `getRoundTakeawayInsight.round lookup failed: ${roundError.message}`,
        { action: 'insight-delivery.getRoundTakeawayInsight', featureArea: 'insights', playerId, roundId },
      );
    }
    return null;
  }

  const anchor = new Date(round.round_date);
  if (Number.isNaN(anchor.getTime())) return null;

  const windowStart = new Date(anchor.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(anchor.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('golf_coach_insights')
    .select(INSIGHT_SELECT)
    .eq('player_id', playerId)
    .not('evidence', 'is', null)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .gte('updated_at', windowStart)
    .lte('updated_at', windowEnd)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    await logServerError(
      `getRoundTakeawayInsight.temporal failed: ${error.message}`,
      { action: 'insight-delivery.getRoundTakeawayInsight', featureArea: 'insights', playerId, roundId },
    );
    return null;
  }

  const rows = (data ?? []) as unknown as RawInsightRowWithDrills[];
  const ranked = rankEvidenceInsights(
    rows.map(mapRowToEvidenceInsight).filter((r): r is EvidenceInsight => r !== null),
  );

  return ranked[0] ?? null;
}

// ---------------------------------------------------------------------------
// v3 THEMES — hierarchical insight scaffold (THEME → CAUSE → DRIVER)
// ---------------------------------------------------------------------------
//
// Unlike the flat fetchers above, the themes fetchers DO NOT dedupe (the
// assembler re-expands the sibling structure the flat path collapses) and use
// a LOOSER keep than `mapRowToEvidenceInsight`: a row survives if it carries a
// usable `evidence.metric` OR a non-suppressed `evidence.counterfactual`. They
// never drop a row purely for a missing `strokes_impact` — counterfactual is
// the ranking key, not the base impact.

/** High cap for the themes query — no per-card limit; we want the full set. */
const THEMES_FETCH_CAP = 200;

/** Cap for the shot-driver fetch (PLAY C). Must cover SHOT_DRIVERS_ROUNDS_CAP
 *  rounds fully (200 rounds × ~108 shots ≈ 21.6k); the query has no .order(),
 *  so a lower cap truncated an ARBITRARY subset at PostgREST's 1000-row default. */
const SHOT_DRIVERS_FETCH_CAP = 25000;
/** Recent-rounds cap when resolving completed round ids for the shot fetch. */
const SHOT_DRIVERS_ROUNDS_CAP = 200;

/** Recent-rounds cap for the SG-trend fetch (PLAY G). Two windows of ~5 each
 *  plus headroom; 40 is ample for a recent-vs-prior split and bounds the query. */
const SG_TREND_ROUNDS_CAP = 40;

/**
 * PLAY C — best-effort shot-level root drivers. Resolves the player's completed
 * round ids, pulls the raw `golf_shots` (capped) with the 1:1 `putt_details` /
 * `approach_miss_details` joins the stats pipeline already fetches, and runs the
 * PURE `buildShotDrivers`. Wrapped end-to-end: ANY failure (or no data) returns
 * `undefined` so the themes scaffold renders without shot drivers — NEVER errors
 * the page. `golf_shots` has no `player_id` column, so we resolve via
 * `golf_rounds` exactly like PuttingStats.tsx does.
 */
async function fetchShotDriversByCategory(
  supabase: SupabaseClient,
  playerId: string,
): Promise<Partial<Record<InsightCategory, RootDriver[]>> | undefined> {
  try {
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(SHOT_DRIVERS_ROUNDS_CAP);
    if (roundsError) throw new Error(roundsError.message);

    const roundIds = (rounds ?? []).map((r) => r.id as string);
    if (roundIds.length === 0) return undefined;

    const { data: shots, error: shotsError } = await supabase
      .from('golf_shots')
      .select(`
        shot_type,
        club_type,
        distance_to_hole_before,
        distance_unit_before,
        result,
        miss_direction,
        round_id,
        hole_number,
        shot_number,
        putt_details(miss_tags, break_direction),
        approach_miss_details(miss_direction, lie_type, distance_from_green_yards)
      `)
      .in('round_id', roundIds)
      .limit(SHOT_DRIVERS_FETCH_CAP);
    if (shotsError) throw new Error(shotsError.message);
    if (!shots || shots.length === 0) return undefined;

    return buildShotDrivers(shots as unknown as ShotDriverInput[]);
  } catch (err) {
    void logServerError(
      `fetchShotDriversByCategory failed (continuing without shot drivers): ${err instanceof Error ? err.message : String(err)}`,
      { action: 'insight-delivery.fetchShotDriversByCategory', featureArea: 'insights', playerId },
    ).catch(() => undefined);
    return undefined;
  }
}

/**
 * PLAY G — best-effort per-category SG trend. Pulls the player's most-recent
 * completed rounds (the per-round `strokes_gained_*` columns + `round_date`,
 * newest first, capped at {@link SG_TREND_ROUNDS_CAP}) and runs the PURE
 * `computeSgTrends`. Wrapped end-to-end: ANY failure (or no data) returns
 * `undefined` so the themes scaffold renders WITHOUT trends — NEVER errors the
 * page. The trend honesty (min-window) lives in `computeSgTrends`, so even a
 * successful fetch of too-few rounds yields no trend for a category.
 */
async function fetchSgTrendsByCategory(
  supabase: SupabaseClient,
  playerId: string,
): Promise<Partial<Record<InsightCategory, ThemeTrend>> | undefined> {
  try {
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select(
        'round_date, strokes_gained_putting, strokes_gained_approach, strokes_gained_tee, strokes_gained_around_green',
      )
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(SG_TREND_ROUNDS_CAP);
    if (error) throw new Error(error.message);
    if (!rounds || rounds.length === 0) return undefined;

    // Newest-first order is the SgRoundSample contract — preserve it as-is.
    const samples: SgRoundSample[] = rounds.map((r) => ({
      date: r.round_date,
      sgPutting: r.strokes_gained_putting,
      sgApproach: r.strokes_gained_approach,
      sgTee: r.strokes_gained_tee,
      sgAroundGreen: r.strokes_gained_around_green,
    }));

    const trends = computeSgTrends(samples);
    // Empty map (no category cleared the min-window guard) → pass nothing.
    return Object.keys(trends).length > 0 ? trends : undefined;
  } catch (err) {
    void logServerError(
      `fetchSgTrendsByCategory failed (continuing without trends): ${err instanceof Error ? err.message : String(err)}`,
      { action: 'insight-delivery.fetchSgTrendsByCategory', featureArea: 'insights', playerId },
    ).catch(() => undefined);
    return undefined;
  }
}

/**
 * Per-player query + assemble. Shared by both the player and coach paths
 * (themes are inherently per-player — the SG cascade is per-player). The
 * caller is responsible for auth BEFORE invoking this.
 */
async function assembleForPlayer(
  supabase: SupabaseClient,
  playerId: string,
): Promise<AssembledThemes> {
  const runQuery = () =>
    supabase
      .from('golf_coach_insights')
      .select(INSIGHT_SELECT)
      .eq('player_id', playerId)
      .not('evidence', 'is', null)
      .or(V3_ENGINE_FILTER)
      .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(THEMES_FETCH_CAP);

  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const result = await runQuery();
    data = result.data;
    error = result.error;
  } catch (err) {
    // Mirror the player fetcher's single transient retry.
    if (isTransientFetchError(err)) {
      await delay(500);
      const result = await runQuery();
      data = result.data;
      error = result.error;
    } else {
      throw err;
    }
  }

  if (error) {
    throw new Error(error.message);
  }

  const rawRows = (data ?? []) as unknown as RawInsightRowWithDrills[];
  const rows = rawRows
    .map(mapRowLoose)
    .filter((r): r is EvidenceInsight => r !== null);

  // SG fetch is best-effort: a failure must NOT fail the themes scaffold.
  // Source SG from the canonical golf_player_stats_cache (sg_*_per_round) — the
  // SAME values the standing/counterfactual read — NOT a shot-level recompute.
  // getDetailedStatsAsAdmin recomputes SG from raw shots capped at 100 rounds
  // (+ the 1000-row PostgREST limit), so it could disagree with the standing SG
  // shown on the same page for high-volume players. The cache averages over ALL
  // completed rounds.
  let sgByCategory: Partial<Record<InsightCategory, number | null>> = {};
  try {
    const { data: sgRow } = await supabase
      .from('golf_player_stats_cache')
      .select('sg_putting_per_round, sg_approach_per_round, sg_tee_per_round, sg_around_green_per_round')
      .eq('player_id', playerId)
      .maybeSingle();
    const num = (v: unknown): number | null =>
      v != null && Number.isFinite(Number(v)) ? Number(v) : null;
    sgByCategory = {
      putting: num(sgRow?.sg_putting_per_round),
      approach: num(sgRow?.sg_approach_per_round),
      tee: num(sgRow?.sg_tee_per_round),
      short_game: num(sgRow?.sg_around_green_per_round),
    };
  } catch (sgErr) {
    void logServerError(
      `assembleForPlayer SG fetch failed (continuing): ${sgErr instanceof Error ? sgErr.message : String(sgErr)}`,
      { action: 'insight-delivery.assembleForPlayer', featureArea: 'insights', playerId },
    ).catch(() => undefined);
    sgByCategory = {};
  }

  // PLAY C — shot-level drivers are best-effort: the helper swallows its own
  // failures and returns undefined, so the assembler simply omits them.
  const shotDriversByCategory = await fetchShotDriversByCategory(supabase, playerId);

  // PLAY G — per-category SG trends are best-effort too: the helper swallows its
  // own failures and returns undefined, so the assembler omits trends entirely.
  const trendByCategory = await fetchSgTrendsByCategory(supabase, playerId);

  return assembleThemes({
    playerId,
    rows,
    sgByCategory,
    shotDriversByCategory,
    trendByCategory,
  });
}

/**
 * Looser row→EvidenceInsight mapper for the themes path. Keeps a row when it
 * has a usable `evidence.metric` OR a non-suppressed `evidence.counterfactual`;
 * does NOT drop on missing `strokes_impact`/`confidence`. Normalizes drills
 * with the same logic as `extractDrills`.
 */
function mapRowLoose(row: RawInsightRowWithDrills): EvidenceInsight | null {
  if (!row) return null;
  if (!row.evidence || typeof row.evidence !== 'object') return null;
  if (!row.id || !row.player_id || !row.title) return null;

  const evidence = row.evidence as unknown as InsightEvidence;
  const assembled = row.evidence as unknown as AssembledEvidence;

  const hasMetric = typeof assembled.metric === 'string' && assembled.metric.length > 0;
  const hasLiveCounterfactual =
    !!assembled.counterfactual && assembled.counterfactual.suppressed !== true;
  if (!hasMetric && !hasLiveCounterfactual) return null;

  const drills = extractDrills(row.drill_attachments ?? null);

  return {
    id: row.id,
    player_id: row.player_id,
    category: (row.category as InsightCategory | null) ?? null,
    insight_type: row.insight_type ?? null,
    title: row.title,
    // Strip authoring artifacts ("(Research doc §N)", "The standing card below
    // shows…") that the generators bake into copy — the themes path sanitizes
    // at assemble time, but the flat path returns content straight to the coach
    // feed / Hub / round review / digest email, so sanitize here too.
    content: sanitizeProse(row.content),
    signature: row.signature ?? null,
    evidence,
    metadata: normalizeMetadata(row.metadata),
    lifecycle_state: (row.lifecycle_state as EvidenceInsight['lifecycle_state']) ?? 'detected',
    status: (row.status as EvidenceInsight['status']) ?? 'active',
    priority: (row.priority as EvidenceInsight['priority']) ?? 'medium',
    acknowledged_at: row.acknowledged_at ?? null,
    resolved_at: row.resolved_at ?? null,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    drills,
  };
}

/**
 * Returns the full hierarchical theme scaffold for a player (always all 7
 * themes; honest `thin`/`strength`/`leak` states). Self or coach-staffing-team
 * access via `verifyPlayerAccess`, mirroring the existing player fetchers.
 */
export async function getThemesForPlayer(
  playerId: string,
  _opts: { window_days?: number } = {},
): Promise<{ success: boolean; data?: AssembledThemes; error?: string }> {
  if (!playerId) return { success: false, error: 'playerId required' };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Unauthorized' };

    const access = await verifyPlayerAccess(playerId, user.id, supabase);
    if (!access.allowed) return { success: false, error: 'Forbidden' };

    const data = await assembleForPlayer(supabase, playerId);
    return { success: true, data };
  } catch (err) {
    await logServerError(
      `getThemesForPlayer failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'insight-delivery.getThemesForPlayer', featureArea: 'insights', playerId },
    );
    return { success: false, error: 'Failed to assemble themes' };
  }
}

/**
 * Coach-side variant. Themes are inherently per-player, so a `player_id` is
 * required. Authorizes the coach exactly as `getInsightsForCoach` does when a
 * specific player is requested (`verifyPlayerAccess`), then delegates to the
 * same per-player query + assemble.
 */
export async function getThemesForCoach(
  opts: { player_id: string; window_days?: number },
): Promise<{ success: boolean; data?: AssembledThemes; error?: string }> {
  const playerId = opts?.player_id;
  if (!playerId) return { success: false, error: 'player_id required' };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Unauthorized' };

    // Same authorization path getInsightsForCoach uses for a specific player.
    const access = await verifyPlayerAccess(playerId, user.id, supabase);
    if (!access.allowed) return { success: false, error: 'Forbidden' };

    const data = await assembleForPlayer(supabase, playerId);
    return { success: true, data };
  } catch (err) {
    await logServerError(
      `getThemesForCoach failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'insight-delivery.getThemesForCoach', featureArea: 'insights', extra: { playerId } },
    );
    return { success: false, error: 'Failed to assemble themes' };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a raw supabase row into the canonical `EvidenceInsight`. Returns
 * `null` when the row is missing the evidence JSON or required scalar fields
 * — defensive: even with `WHERE evidence IS NOT NULL` we can't rely on JSONB
 * shape, so we validate the critical fields before surfacing.
 */
function mapRowToEvidenceInsight(row: RawInsightRowWithDrills): EvidenceInsight | null {
  if (!row) return null;
  if (!row.evidence || typeof row.evidence !== 'object') return null;
  if (!row.id || !row.player_id || !row.title) return null;

  const evidence = row.evidence as unknown as InsightEvidence;

  // We require the three scalars the EvidencePanel + tone-derivation depend
  // on. An insight missing strokes_impact or confidence can't be surfaced
  // — it'd render with blank pills.
  if (typeof evidence.strokes_impact !== 'number') return null;
  if (typeof evidence.confidence !== 'number') return null;
  if (typeof evidence.metric !== 'string') return null;

  const drills = extractDrills(row.drill_attachments ?? null);

  return {
    id: row.id,
    player_id: row.player_id,
    category: (row.category as InsightCategory | null) ?? null,
    insight_type: row.insight_type ?? null,
    title: row.title,
    // Strip authoring artifacts before the flat path returns content to the
    // coach feed / Hub / round review / digest email (themes path sanitizes
    // separately at assemble time).
    content: sanitizeProse(row.content),
    signature: row.signature ?? null,
    evidence,
    metadata: normalizeMetadata(row.metadata),
    lifecycle_state: (row.lifecycle_state as EvidenceInsight['lifecycle_state']) ?? 'detected',
    status: (row.status as EvidenceInsight['status']) ?? 'active',
    priority: (row.priority as EvidenceInsight['priority']) ?? 'medium',
    acknowledged_at: row.acknowledged_at ?? null,
    resolved_at: row.resolved_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    drills,
  };
}

/** Narrows `metadata` to a plain object and preserves the typed `movement`
 *  field (if present). DB returns a generic Json blob. */
function normalizeMetadata(
  metadata: CoachInsightRow['metadata'],
): EvidenceInsight['metadata'] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata as EvidenceInsight['metadata'];
}

/** Sorts drill attachments by rank, drops orphaned rows, caps at 3. */
function extractDrills(
  attachments: RawInsightRowWithDrills['drill_attachments'],
): InsightAttachedDrill[] {
  if (!attachments || attachments.length === 0) return [];

  return attachments
    .filter(
      (a): a is NonNullable<typeof a> & { drill: NonNullable<typeof a.drill> } =>
        !!a && !!a.drill,
    )
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, 3)
    .map((a) => ({
      id: a.drill.id,
      slug: a.drill.slug,
      title: a.drill.title,
      duration_min: a.drill.duration_min,
      difficulty: a.drill.difficulty,
    }));
}
