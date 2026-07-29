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
import { withAdminObserved } from '@/lib/admin/observed-action';
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
  applyInsightVisibility,
} from '@/lib/coachhelm/v3/insight-visibility';
import { recordInsightExposure } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
import { describeError } from '@/lib/utils/describe-error';

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

/**
 * P2-15 / P058 — discriminated read result so a DB failure can NEVER be
 * mistaken for "all clear", and a capped/sliced read honestly discloses the
 * true eligible total. The legacy `getInsightsForCoach` (kept verbatim for its
 * existing callers) collapses both an error AND an empty feed to `[]`; the
 * Fairway Signals surface uses the meta variant so it can render an error state
 * on failure and "showing N of TOTAL" on a cap.
 *
 *   ok:false  → the read errored; render an error state, not an empty feed.
 *   ok:true   → `data` is the sliced page; `total` is the full eligible count
 *               (after rank + dedupe, before the limit slice); `capped` is true
 *               when `total > data.length`.
 */
export type CoachInsightsResult =
  | { ok: true; data: EvidenceInsight[]; total: number; capped: boolean }
  | { ok: false; error: string };

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
// Player feedback overlay (P1-09)
// ---------------------------------------------------------------------------

/**
 * P1-09 — load the player's latest feedback per insight from
 * `golf_insight_player_feedback`, keyed by insight_id. The canonical read paths
 * write feedback (player-feedback.ts) but historically NEVER read it back, so a
 * player-dismissed insight reappeared on refresh and useful/not-useful state
 * never persisted. We apply the latest feedback per (player, insight) — most
 * recent `created_at` wins, since the upsert keeps one row but a service-role
 * caller could leave history.
 *
 * Returns a Map<insight_id, InsightPlayerFeedback>. Best-effort: a query error
 * yields an empty map (no overlay) rather than throwing — the feed still
 * renders, just without feedback state, which is the safe degradation.
 */
async function loadPlayerFeedbackByInsight(
  supabase: SupabaseClient,
  playerId: string,
): Promise<Map<string, InsightPlayerFeedback>> {
  const out = new Map<string, InsightPlayerFeedback>();
  // The generated Database types don't include this table yet (applied via
  // execute_sql), so cast the builder, not `supabase`.
  const feedbackTable = supabase.from('golf_insight_player_feedback') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{
          data: Array<{ insight_id: string; rating: string; created_at: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await feedbackTable
    .select('insight_id, rating, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error || !data) return out;

  for (const row of data) {
    // Newest-first order means the FIRST row we see per insight is the latest.
    if (out.has(row.insight_id)) continue;
    const rating = row.rating as InsightPlayerFeedback['rating'];
    if (
      rating === 'helpful' ||
      rating === 'not_helpful' ||
      rating === 'dismissed' ||
      rating === 'acknowledged'
    ) {
      out.set(row.insight_id, { rating, created_at: row.created_at });
    }
  }
  return out;
}

/**
 * P1-09 — overlay the player's feedback onto a ranked insight list: attach
 * `player_feedback` for the UI chips and DROP rows the player has dismissed, so
 * a dismissal actually sticks across refreshes. Coach reads never call this, so
 * a player-only dismissal never removes the insight from a coach's view.
 */
function applyPlayerFeedbackOverlay(
  insights: EvidenceInsight[],
  feedbackByInsight: Map<string, InsightPlayerFeedback>,
): EvidenceInsight[] {
  if (feedbackByInsight.size === 0) return insights;
  const out: EvidenceInsight[] = [];
  for (const insight of insights) {
    const fb = feedbackByInsight.get(insight.id);
    if (fb?.rating === 'dismissed') continue; // hide player-dismissed rows
    out.push(fb ? { ...insight, player_feedback: fb } : insight);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exposure ledger (P1-12)
// ---------------------------------------------------------------------------

/**
 * P1-12 — record an EXPOSURE event for every insight a read path is about to
 * RETURN to a surface (post-rank/dedupe/overlay, pre-return). This is the only
 * place "shown" is counted, so the trust rollup can never claim an insight was
 * surfaced when it wasn't: an insight that's filtered out or sliced off the page
 * before this call is never recorded, and an empty list is a no-op.
 *
 * Failure-silent by construction — `recordInsightExposure` swallows + logs its
 * own errors and never throws, so this can't poison the read path's happy path.
 * `rank_position` is the 0-based index of the insight in the returned list.
 */
function recordExposureForReturned(
  insights: Array<{ id: string; player_id: string }>,
  surface: string,
  coachId?: string | null,
): void {
  if (!Array.isArray(insights) || insights.length === 0) return;
  const rows = insights
    .filter((ins) => ins && ins.id && ins.player_id)
    .map((ins, idx) => ({
      insight_id: ins.id,
      player_id: ins.player_id,
      coach_id: coachId ?? null,
      surface,
      rank_position: idx,
    }));
  // Fire-and-forget — the writer is failure-silent, so we don't await it into
  // the render path (and a rejected promise can't surface because it never
  // rejects). `void` documents the deliberate non-await.
  void recordInsightExposure(rows);
}

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
async function getTopInsightForPlayerImpl(
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

  // P1-09: the player's feedback overlay — used to hide a player-dismissed row
  // and attach feedback state, so the Hub signal card honors the same dismissal
  // the feed does (an undismissed urgent row can't be resurrected here). Loaded
  // lazily AFTER the insight queries below so it doesn't reorder them.
  let feedbackByInsight: Map<string, InsightPlayerFeedback> | null = null;
  const getFeedback = async (): Promise<Map<string, InsightPlayerFeedback>> => {
    if (feedbackByInsight == null) {
      feedbackByInsight = await loadPlayerFeedbackByInsight(supabase, playerId).catch(
        () => new Map<string, InsightPlayerFeedback>(),
      );
    }
    return feedbackByInsight;
  };

  // 1. Urgent-priority first pass. We run it as a separate query so the JSON
  //    ordering below never accidentally starves an urgent row.
  // Query shape (tables/filters/order) — logged for the index-review this
  // warning intentionally does NOT escalate to: golf_coach_insights filtered
  // by (player_id, evidence NOT NULL) + the shared applyInsightVisibility
  // predicates (v3 engine OR-filter, visible lifecycle_state IN, status !=
  // dismissed), then priority='urgent', ordered by created_at desc, limit 1.
  // Same BEST_EFFORT_QUERY_TIMEOUT_MS budget as fetchShotDriversByCategory —
  // deliberately shorter than the DB's 8s statement_timeout so a slow/
  // unindexed scan aborts client-side instead of holding the request open.
  const { data: urgent, error: urgentError } = await applyInsightVisibility(
    supabase
      .from('golf_coach_insights')
      .select(INSIGHT_SELECT)
      .eq('player_id', playerId)
      .not('evidence', 'is', null),
  )
    .eq('priority', 'urgent')
    .order('created_at', { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(BEST_EFFORT_QUERY_TIMEOUT_MS));

  if (urgentError) {
    // Best-effort: falls through to the ranked pass below on ANY failure
    // (statement timeout or our own abort budget tripping first), so a
    // handled miss here is a single warning — not a paging error and NOT a
    // Sentry-escalated exception (skipSentry: true — expected degradation,
    // not an incident to page on).
    void logServerError(
      `getTopInsightForPlayer.urgent failed (continuing without urgent pass): ${urgentError.message}`,
      { action: 'insight-delivery.getTopInsightForPlayer', featureArea: 'insights', playerId, skipSentry: true },
      'warning',
    ).catch(() => undefined);
  } else if (urgent && urgent.length > 0) {
    const urgentInsight = mapRowToEvidenceInsight(urgent[0] as unknown as RawInsightRowWithDrills);
    // P1-09: only return the urgent row if the player hasn't dismissed it; a
    // dismissed urgent row falls through to the ranked pass (which also filters).
    if (urgentInsight) {
      const overlaid = applyPlayerFeedbackOverlay([urgentInsight], await getFeedback());
      if (overlaid.length > 0 && overlaid[0]) {
        recordExposureForReturned([overlaid[0]], 'hub_signal');
        return overlaid[0];
      }
    }
  }

  // 2. Rank the FULL visible set (regrade READ/NEW-P2): the old newest-20
  //    created_at pre-trim was the same truncation bug the list feeds shed —
  //    prod sat EXACTLY at the 20-row boundary, so the Hub signal card and the
  //    feed's #1 could diverge on the very next insight. Paginate via
  //    fetchAllRowsResult (one round trip for normal sets) and apply the SAME
  //    collapse + dedupe the feed applies, so the single-pick is literally the
  //    feed's head.
  const { data, error } = await fetchAllRowsResult((from, to) =>
    applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select(INSIGHT_SELECT)
        .eq('player_id', playerId)
        .not('evidence', 'is', null),
    )
      .order('id', { ascending: true })
      .range(from, to),
    undefined,
    { table: 'golf_coach_insights', action: 'getTopInsightForPlayer', feature: 'coachhelm_ai_engine', sport: 'golf' },
  );

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
  // `scoreInsight` composite, then collapse par-scoring + dedupe by subject —
  // EXACTLY the feed pipeline — so the single-pick agrees with the list feed.
  const weights = await loadCoachWeightsForPlayer(supabase, playerId).catch(() => ({}));
  const activeGoals = await loadActiveGoals(playerId).catch(() => []);
  const ranked = rankEvidenceInsights(
    rows.map(mapRowToEvidenceInsight).filter((r): r is EvidenceInsight => r !== null),
    weights,
    activeGoals,
  );

  // P1-09: apply the feedback overlay (hide dismissed, attach state) so the
  // single-pick agrees with the feed, which also overlays.
  const overlaid = applyPlayerFeedbackOverlay(
    dedupeBySubject(collapseParScoring(ranked)),
    await getFeedback(),
  );
  const top = overlaid[0] ?? null;
  // Only the single insight the Hub signal card actually shows is recorded.
  if (top) recordExposureForReturned([top], 'hub_signal');
  return top;
}

const observedGetTopInsightForPlayer = withAdminObserved(
  'getTopInsightForPlayer',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getTopInsightForPlayerImpl,
);
export async function getTopInsightForPlayer(
  playerId: string,
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight | null> {
  return observedGetTopInsightForPlayer(playerId, supabaseOverride);
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
async function getInsightsForPlayerImpl(
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
      `getInsightsForPlayer client init failed: ${describeError(err)}`,
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

  // Fetch the player's FULL visible set, paginated (to-95 audit P2). The old
  // newest-first `PRE_RANK_FETCH ≤ 100` cap assumed a player's visible set
  // never exceeds 100 rows — unproven, and a player who did overflow would
  // silently lose an older high-impact row before the in-app rank-by-impact
  // (audit RANK-1 / RANK-4) ever saw it. A normal visible set is a few dozen
  // rows, so this is still ONE round trip; pagination only kicks in past 1000.
  // Order by `id` for stable paging — the shared composite reorders in-app.
  const runQuery = () =>
    fetchAllRowsResult((from, to) => {
      let query = applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select(INSIGHT_SELECT)
          .eq('player_id', playerId)
          .not('evidence', 'is', null),
      ).order('id', { ascending: true });

      if (opts.categories && opts.categories.length > 0) {
        query = query.in('category', opts.categories);
      }
      return query.range(from, to);
    }, undefined, { table: 'golf_coach_insights', action: 'getInsightsForPlayer', feature: 'coachhelm_ai_engine', sport: 'golf' });

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
          `getInsightsForPlayer fetch failed: ${describeError(retryErr)}`,
          { action: 'insight-delivery.getInsightsForPlayer', featureArea: 'insights', playerId },
        );
        return [];
      }
    } else {
      await logServerError(
        `getInsightsForPlayer failed: ${describeError(err)}`,
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
  // `evidence` JSONB's shape isn't indexed for these fields, and a player's
  // visible set is a few dozen rows — the post-filter cost is negligible.
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
  const deduped = dedupeBySubject(collapseParScoring(ranked));

  // P1-09: overlay the player's own feedback — attach state for UI chips and
  // DROP rows the player has dismissed (so a dismissal sticks across refreshes).
  // Apply BEFORE the limit slice so a dismissed row doesn't consume a slot.
  const feedbackByInsight = await loadPlayerFeedbackByInsight(supabase, playerId).catch(
    () => new Map<string, InsightPlayerFeedback>(),
  );
  const shown = applyPlayerFeedbackOverlay(deduped, feedbackByInsight).slice(0, limit);
  // Record exposure for the EXACT rows returned (post overlay + slice) — a row
  // dropped by the limit or by a player dismissal is never counted as shown.
  recordExposureForReturned(shown, 'player_feed');
  return shown;
}

const observedGetInsightsForPlayer = withAdminObserved(
  'getInsightsForPlayer',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getInsightsForPlayerImpl,
);
export async function getInsightsForPlayer(
  playerId: string,
  opts: GetInsightsForPlayerOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight[]> {
  return observedGetInsightsForPlayer(playerId, opts, supabaseOverride);
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
async function getInsightsForCoachImpl(
  coachId: string,
  opts: GetInsightsForCoachOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight[]> {
  // Back-compat shim: existing callers expect the bare array (empty on
  // error). The meta variant is the source of truth; we drop the discriminant.
  const result = await getInsightsForCoachWithMeta(coachId, opts, supabaseOverride);
  return result.ok ? result.data : [];
}

const observedGetInsightsForCoach = withAdminObserved(
  'getInsightsForCoach',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getInsightsForCoachImpl,
);
export async function getInsightsForCoach(
  coachId: string,
  opts: GetInsightsForCoachOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight[]> {
  return observedGetInsightsForCoach(coachId, opts, supabaseOverride);
}

/**
 * P2-15 / P058 — the meta-returning team sweep. Identical read/rank/dedupe to
 * `getInsightsForCoach` but it (a) distinguishes a DB error from an empty feed
 * (so the UI never shows "all clear" on a failed query) and (b) reports the
 * true eligible `total` (the full ranked+deduped set before the limit slice) so
 * a capped page can honestly say "showing N of TOTAL".
 */
async function getInsightsForCoachWithMetaImpl(
  coachId: string,
  opts: GetInsightsForCoachOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<CoachInsightsResult> {
  if (!coachId) return { ok: true, data: [], total: 0, capped: false };

  const supabase = supabaseOverride ?? (await createClient());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: 'Not authenticated.' };

  // Player filter → authorization path. Without a player_id the RLS policies
  // on `golf_coach_insights` restrict reads to teams the coach staffs, which
  // is what we want for the coach dashboard sweep.
  if (opts.player_id) {
    const access = await verifyPlayerAccess(opts.player_id, user.id, supabase);
    if (!access.allowed) return { ok: false, error: 'Not authorized.' };
  }

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  // Pre-order the candidate window by created_at (NOT evidence->strokes_impact):
  // 176/232 live rows carry strokes_impact≈0, so an impact-DESC pre-order pushes
  // every high-confidence zero-impact diagnostic to the bottom and truncates it
  // at PRE_RANK_FETCH before the in-app `scoreInsight` floor can rescue it. We
  // widen the window and let the shared composite reorder in-app instead.
  //
  // SCOPE (A5 + A8 + to-95 P2): BOTH branches now fetch the FULL visible set
  // (paginated via `fetchAllRowsResult`, ordered by `id` for stable paging
  // since we rank in-app afterward) and let the shared composite reorder +
  // the caller's `limit` slice it. The team-wide sweep was fixed in A8; the
  // per-player branch followed in the to-95 audit (P2) — its old newest-first
  // `PRE_RANK_FETCH ≤ 100` cap rested on the unproven assumption that one
  // player's visible set stays under 100. The visible set is bounded by the
  // lifecycle/v3 filters (archived/dismissed/non-v3 excluded) — a few dozen
  // rows per player, a few hundred per team — so a normal fetch is still ONE
  // round trip and ranking in memory stays cheap.

  let data: unknown = null;
  let error: { message: string } | null = null;

  if (opts.player_id) {
    // PER-PLAYER path — full visible set for one player.
    const playerId = opts.player_id;
    const result = await fetchAllRowsResult((from, to) => {
      let query = applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select(INSIGHT_SELECT)
          .eq('player_id', playerId)
          .not('evidence', 'is', null),
      ).order('id', { ascending: true });

      if (opts.categories && opts.categories.length > 0) {
        query = query.in('category', opts.categories);
      }
      if (opts.priorities && opts.priorities.length > 0) {
        query = query.in('priority', opts.priorities);
      }

      return query.range(from, to);
    }, undefined, { table: 'golf_coach_insights', action: 'getInsightsForCoachWithMeta', feature: 'coachhelm_ai_engine', sport: 'golf' });
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
      let query = applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select(INSIGHT_SELECT)
          .not('evidence', 'is', null),
      ).order('id', { ascending: true });

      if (opts.categories && opts.categories.length > 0) {
        query = query.in('category', opts.categories);
      }
      if (opts.priorities && opts.priorities.length > 0) {
        query = query.in('priority', opts.priorities);
      }

      return query.range(from, to);
    }, undefined, { table: 'golf_coach_insights', action: 'getInsightsForCoachWithMeta', feature: 'coachhelm_ai_engine', sport: 'golf' });
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
    // P2-15: surface the failure as an error result, NOT an empty feed — an
    // empty array here would render "all clear" over a real query failure.
    return { ok: false, error: 'Could not load signals. Try refreshing.' };
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

  // P058: `total` is the FULL eligible count (post rank + dedupe, pre-slice),
  // so a capped page can honestly disclose "showing N of TOTAL" instead of
  // silently truncating at the limit.
  const data_ = ranked.slice(0, limit);
  // Record exposure for the page the coach actually receives (post rank + dedupe
  // + slice). Rows beyond the limit are NOT counted — only what's surfaced is.
  recordExposureForReturned(data_, 'coach_feed', coachId);
  return { ok: true, data: data_, total: ranked.length, capped: ranked.length > data_.length };
}

const observedGetInsightsForCoachWithMeta = withAdminObserved(
  'getInsightsForCoachWithMeta',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getInsightsForCoachWithMetaImpl,
);
export async function getInsightsForCoachWithMeta(
  coachId: string,
  opts: GetInsightsForCoachOptions = {},
  supabaseOverride?: SupabaseClient,
): Promise<CoachInsightsResult> {
  return observedGetInsightsForCoachWithMeta(coachId, opts, supabaseOverride);
}

/**
 * Batched top-insight fetcher for a roster (P446). Returns a Map keyed by
 * player_id → that player's top insight(s) (head-only by default), built from a
 * SINGLE `golf_coach_insights` query scoped to ALL the supplied players instead
 * of one round-trip per player.
 *
 * Motivation: the coach roster-intelligence view (`getTeamStatsIntelligence`)
 * previously called `getInsightsForPlayer` once per player, each of which re-ran
 * `auth.getUser` + `verifyPlayerAccess` (a player query + an RPC) + the data
 * query — ~3-4N concurrent round-trips for an N-player roster. This collapses
 * that to O(1) queries regardless of roster size.
 *
 * Authorization: one `auth.getUser()` check, then RLS on `golf_coach_insights`
 * (`is_golf_team_coach`) restricts the read to insights for players on teams the
 * caller staffs — the same trust boundary `getInsightsForCoach`'s team sweep
 * relies on. We therefore do NOT run `verifyPlayerAccess` per player here; the
 * caller is responsible for having scoped `playerIds` to a team it owns (the
 * roster view derives them from active members of the coach's resolved team).
 *
 * Ranking mirrors the team sweep: neutral coach weights and no per-player goals
 * (those are a per-player concern; the roster card only needs the head insight),
 * then the SAME `collapseParScoring` → `dedupeBySubject` pipeline every surface
 * applies. Returns `[]` for any player with no visible rows (Map omits absent
 * players → callers use `map.get(pid) ?? []`).
 */
async function getTopInsightsForPlayersImpl(
  playerIds: string[],
  opts: { limit?: number } = {},
  supabaseOverride?: SupabaseClient,
): Promise<Map<string, EvidenceInsight[]>> {
  const out = new Map<string, EvidenceInsight[]>();
  const ids = Array.from(
    new Set((playerIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0)),
  );
  if (ids.length === 0) return out;

  let supabase: SupabaseClient;
  try {
    supabase = supabaseOverride ?? (await createClient());
  } catch (err) {
    await logServerError(
      `getTopInsightsForPlayers client init failed: ${describeError(err)}`,
      { action: 'insight-delivery.getTopInsightsForPlayers', featureArea: 'insights' },
    );
    return out;
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return out;

  const limit = Math.min(Math.max(opts.limit ?? 1, 1), 50);

  // ONE batched query for the whole roster. `.in('player_id', ids)` + RLS scope
  // the read; paginate past the 1000-row PostgREST cap (a full roster's visible
  // set can exceed 1000), ordered by `id` for stable paging — we rank in-app.
  const runQuery = () =>
    fetchAllRowsResult((from, to) =>
      applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select(INSIGHT_SELECT)
          .in('player_id', ids)
          .not('evidence', 'is', null),
      )
        .order('id', { ascending: true })
        .range(from, to),
      undefined,
      { table: 'golf_coach_insights', action: 'getTopInsightsForPlayers', feature: 'coachhelm_ai_engine', sport: 'golf' },
    );

  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const result = await runQuery();
    data = result.data;
    error = result.error;
  } catch (err) {
    if (isTransientFetchError(err)) {
      await delay(500);
      try {
        const result = await runQuery();
        data = result.data;
        error = result.error;
      } catch (retryErr) {
        await logServerError(
          `getTopInsightsForPlayers fetch failed: ${describeError(retryErr)}`,
          { action: 'insight-delivery.getTopInsightsForPlayers', featureArea: 'insights' },
        );
        return out;
      }
    } else {
      await logServerError(
        `getTopInsightsForPlayers failed: ${describeError(err)}`,
        { action: 'insight-delivery.getTopInsightsForPlayers', featureArea: 'insights' },
      );
      return out;
    }
  }

  if (error) {
    await logServerError(
      `getTopInsightsForPlayers failed: ${error.message}`,
      { action: 'insight-delivery.getTopInsightsForPlayers', featureArea: 'insights' },
    );
    return out;
  }

  const rows = (data ?? []) as unknown as RawInsightRowWithDrills[];
  const mapped = rows
    .map(mapRowToEvidenceInsight)
    .filter((r): r is EvidenceInsight => r !== null);

  // Group per player, then apply the SAME rank → collapse → dedupe → slice
  // pipeline `getInsightsForPlayer` applies, with neutral weights/goals (team
  // sweep convention). This guarantees the roster card's top insight agrees
  // with the per-player feed's head for the same visible set.
  const byPlayer = new Map<string, EvidenceInsight[]>();
  for (const ins of mapped) {
    const arr = byPlayer.get(ins.player_id) ?? [];
    arr.push(ins);
    byPlayer.set(ins.player_id, arr);
  }
  for (const [pid, list] of byPlayer) {
    const ranked = dedupeBySubject(collapseParScoring(rankEvidenceInsights(list)));
    const sliced = ranked.slice(0, limit);
    out.set(pid, sliced);
    // Record exposure for each player's surfaced head insight(s) on the roster
    // card — rank_position is per-player. coach_id is unknown here (RLS-scoped
    // sweep, not a resolved coach row) so it's left null.
    recordExposureForReturned(sliced, 'roster_card');
  }

  return out;
}

const observedGetTopInsightsForPlayers = withAdminObserved(
  'getTopInsightsForPlayers',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getTopInsightsForPlayersImpl,
);
export async function getTopInsightsForPlayers(
  playerIds: string[],
  opts: { limit?: number } = {},
  supabaseOverride?: SupabaseClient,
): Promise<Map<string, EvidenceInsight[]>> {
  return observedGetTopInsightsForPlayers(playerIds, opts, supabaseOverride);
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
async function getRoundTakeawayInsightImpl(
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

  const { data, error } = await applyInsightVisibility(
    supabase
      .from('golf_coach_insights')
      .select(INSIGHT_SELECT)
      .eq('player_id', playerId)
      .not('evidence', 'is', null),
  )
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

  const takeaway = ranked[0] ?? null;
  // Only the single takeaway insight the round-review card shows is recorded.
  if (takeaway) recordExposureForReturned([takeaway], 'round_review');
  return takeaway;
}

const observedGetRoundTakeawayInsight = withAdminObserved(
  'getRoundTakeawayInsight',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getRoundTakeawayInsightImpl,
);
export async function getRoundTakeawayInsight(
  playerId: string,
  roundId: string,
  supabaseOverride?: SupabaseClient,
): Promise<EvidenceInsight | null> {
  return observedGetRoundTakeawayInsight(playerId, roundId, supabaseOverride);
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

/**
 * Best-effort query budget for the (optional) shot-drivers + urgent-insight
 * reads below — deliberately SHORTER than the DB's own 8s `statement_timeout`
 * (see src/lib/supabase/server.ts's `AbortSignal.timeout(10_000)` comment:
 * "DB statement_timeout is 8s, so DB error bubbles up first"). Both callers
 * degrade to "render without this data" on ANY failure, so there is no reason
 * to let a heavy/unindexed query hold the request open for the full 8s before
 * Postgres cancels it with a 57014 — aborting client-side at 5s frees the
 * page to finish rendering sooner and turns the failure mode into a fast,
 * predictable abort instead of a slow one.
 */
const BEST_EFFORT_QUERY_TIMEOUT_MS = 5_000;

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
  // Shared abort budget for both queries below — see BEST_EFFORT_QUERY_TIMEOUT_MS.
  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(), BEST_EFFORT_QUERY_TIMEOUT_MS);
  try {
    // THE HYPOTHESIS THAT USED TO BE HERE WAS WRONG — measured against
    // production 2026-07-29. It read: "the unordered, high-cap, joined
    // golf_shots scan is the likely 57014 source." It is not. That scan is
    // FAST:
    //
    //   golf_rounds (player_id, status='completed') LIMIT 200
    //     + golf_shots (round_id IN …) LIMIT 25000
    //   -> 68ms, Index Only Scan on idx_golf_shots_round_id_covering
    //
    // The cost is the RLS on the two EMBEDDED tables, which a service-role
    // EXPLAIN cannot see because service_role bypasses RLS entirely — which is
    // precisely why the original guess landed on the visible query shape.
    //
    // `putt_details_select_team` and `approach_miss_details_select_team` are
    // six- and seven-table joins that materialize EVERY shot id visible to the
    // caller across their whole ORGANIZATION, uncorrelated to the <=200 rounds
    // actually being asked for. Both tables also carry a second `_select_own`
    // policy, and permissive policies are all evaluated. Measured on today's
    // small dataset: 103ms for 6,699 ids, with the planner estimating 62 rows —
    // a 100x underestimate, which is the part that does not stay benign as the
    // data grows.
    //
    // Consistent with the observed shape of the failures: aborts arrive in
    // BURSTS (21 in one hour on 07-22; 8+6 across two hours on 07-28), not as a
    // steady trickle. One call is ~100-200ms; several concurrently, each
    // rebuilding an org-wide id set, is what crosses the 5s budget.
    //
    // The real fix is to correlate those policies rather than materialize an
    // org-wide set — a pure performance rewrite with identical semantics, not a
    // relaxation. That is an RLS change, so it belongs in a reviewed migration
    // and is deliberately NOT made here.
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(SHOT_DRIVERS_ROUNDS_CAP)
      .abortSignal(controller.signal);
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
      .limit(SHOT_DRIVERS_FETCH_CAP)
      .abortSignal(controller.signal);
    if (shotsError) throw new Error(shotsError.message);
    if (!shots || shots.length === 0) return undefined;

    return buildShotDrivers(shots as unknown as ShotDriverInput[]);
  } catch (err) {
    // Best-effort enrichment — the page renders fine without shot drivers, so a
    // handled failure here (e.g. statement timeout, or our own abort budget
    // above tripping first) is a single warning, not a paging error and NOT a
    // Sentry-escalated exception (skipSentry: true — this is expected
    // degradation, not an incident to page on).
    void logServerError(
      `fetchShotDriversByCategory failed (continuing without shot drivers): ${describeError(err)}`,
      { action: 'insight-delivery.fetchShotDriversByCategory', featureArea: 'insights', playerId, skipSentry: true },
      'warning',
    ).catch(() => undefined);
    return undefined;
  } finally {
    clearTimeout(budgetTimer);
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
    // Best-effort — themes render without trends, so a handled failure is a
    // warning, not a paging error.
    void logServerError(
      `fetchSgTrendsByCategory failed (continuing without trends): ${describeError(err)}`,
      { action: 'insight-delivery.fetchSgTrendsByCategory', featureArea: 'insights', playerId },
      'warning',
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
    // Best-effort — themes render without SG, so a handled failure is a
    // warning, not a paging error.
    void logServerError(
      `assembleForPlayer SG fetch failed (continuing): ${describeError(sgErr)}`,
      { action: 'insight-delivery.assembleForPlayer', featureArea: 'insights', playerId },
      'warning',
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
async function getThemesForPlayerImpl(
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
      `getThemesForPlayer failed: ${describeError(err)}`,
      { action: 'insight-delivery.getThemesForPlayer', featureArea: 'insights', playerId },
    );
    return { success: false, error: 'Failed to assemble themes' };
  }
}

const observedGetThemesForPlayer = withAdminObserved(
  'getThemesForPlayer',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getThemesForPlayerImpl,
);
export async function getThemesForPlayer(
  playerId: string,
  _opts: { window_days?: number } = {},
): Promise<{ success: boolean; data?: AssembledThemes; error?: string }> {
  return observedGetThemesForPlayer(playerId, _opts);
}

/**
 * Coach-side variant. Themes are inherently per-player, so a `player_id` is
 * required. Authorizes the coach exactly as `getInsightsForCoach` does when a
 * specific player is requested (`verifyPlayerAccess`), then delegates to the
 * same per-player query + assemble.
 */
async function getThemesForCoachImpl(
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
      `getThemesForCoach failed: ${describeError(err)}`,
      { action: 'insight-delivery.getThemesForCoach', featureArea: 'insights', extra: { playerId } },
    );
    return { success: false, error: 'Failed to assemble themes' };
  }
}

const observedGetThemesForCoach = withAdminObserved(
  'getThemesForCoach',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getThemesForCoachImpl,
);
export async function getThemesForCoach(
  opts: { player_id: string; window_days?: number },
): Promise<{ success: boolean; data?: AssembledThemes; error?: string }> {
  return observedGetThemesForCoach(opts);
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
    outcome_status: (row.outcome_status as EvidenceInsight['outcome_status']) ?? null,
    outcome_measured_at: row.outcome_measured_at ?? null,
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
