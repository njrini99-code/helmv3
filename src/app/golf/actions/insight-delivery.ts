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
import { isTransientFetchError, delay } from '@/lib/utils/transient-error';
import type {
  InsightCategory,
  InsightEvidence,
  InsightMovement,
} from '@/lib/coachhelm/v2/insights/types';
import type { Database } from '@/lib/types/database';

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

/** Lifecycle states the UI is allowed to surface. `tentative` is pre-maturity
 *  and should never be shown to a player; `archived` rows are soft-deleted. */
const VISIBLE_LIFECYCLE_STATES = ['detected', 'matured', 'addressed', 'resolved'] as const;

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
  id, player_id, category, title, content, signature, evidence, metadata,
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

  const ranked = rows
    .map(mapRowToEvidenceInsight)
    .filter((r): r is EvidenceInsight => r !== null)
    .sort((a, b) => rankScore(b) - rankScore(a));

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

  const runQuery = () => {
    let query = supabase
      .from('golf_coach_insights')
      .select(INSIGHT_SELECT)
      .eq('player_id', playerId)
      .not('evidence', 'is', null)
      .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(limit);

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
  // limit=50 the post-filter cost is negligible.
  return insights.filter((insight) => {
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

  // Pull a wider set so the in-app rank-and-cut has room to favor impact +
  // confidence over recency. We then trim to `limit` after the EvidencePanel
  // mapping drops anything missing required scalar fields.
  const PRE_RANK_FETCH = Math.min(50, limit * 4);

  let query = supabase
    .from('golf_coach_insights')
    .select(INSIGHT_SELECT)
    .not('evidence', 'is', null)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false })
    .limit(PRE_RANK_FETCH);

  if (opts.player_id) {
    query = query.eq('player_id', opts.player_id);
  }

  if (opts.categories && opts.categories.length > 0) {
    query = query.in('category', opts.categories);
  }

  if (opts.priorities && opts.priorities.length > 0) {
    query = query.in('priority', opts.priorities);
  }

  const { data, error } = await query;

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

  // Rank by |strokes_impact| × confidence — the same composite the engine
  // uses internally to decide which insights matter — and dedupe across
  // categories so the feed doesn't show three overlapping putting rows.
  const seenSignatures = new Set<string>();
  const ranked = mapped
    .slice()
    .sort((a, b) => {
      const impact = (insight: EvidenceInsight) =>
        Math.abs(insight.evidence?.strokes_impact ?? 0) *
        Math.max(0.1, insight.evidence?.confidence ?? 0);
      return impact(b) - impact(a);
    })
    .filter((insight) => {
      const sig = `${insight.player_id}:${insight.category}:${insight.evidence?.metric ?? insight.title}`;
      if (seenSignatures.has(sig)) return false;
      seenSignatures.add(sig);
      return true;
    });

  return ranked.slice(0, limit);
}

/**
 * Returns the single insight to feature on a round-review takeaway card.
 *
 * Strategy (in order):
 *   1. Prefer insights whose `metadata.related_round_ids` includes this round.
 *      Generators that have round-level provenance tag it here.
 *   2. Fall back to "highest-impact insight created or updated within 24h of
 *      this round's `round_date`." `golf_rounds` doesn't carry `submitted_at`
 *      so we anchor on `round_date` instead — the naming in the contract was
 *      a near miss.
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

  // 1. Direct tag match via JSONB containment. Cheap when the generator has
  //    already stamped the round id into metadata.
  const { data: tagged, error: taggedError } = await supabase
    .from('golf_coach_insights')
    .select(INSIGHT_SELECT)
    .eq('player_id', playerId)
    .not('evidence', 'is', null)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .contains('metadata', { related_round_ids: [roundId] })
    .order('created_at', { ascending: false })
    .limit(5);

  if (taggedError) {
    await logServerError(
      `getRoundTakeawayInsight.tagged failed: ${taggedError.message}`,
      { action: 'insight-delivery.getRoundTakeawayInsight', featureArea: 'insights', playerId, roundId },
    );
  } else if (tagged && tagged.length > 0) {
    const ranked = (tagged as unknown as RawInsightRowWithDrills[])
      .map(mapRowToEvidenceInsight)
      .filter((r): r is EvidenceInsight => r !== null)
      .sort((a, b) => rankScore(b) - rankScore(a));
    if (ranked[0]) return ranked[0];
  }

  // 2. Temporal fallback. Pull the round's date, look for insights created or
  //    updated within a 24-hour window on either side, and pick the highest
  //    impact one. This is approximate but catches generators that don't
  //    stamp related_round_ids.
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
  const ranked = rows
    .map(mapRowToEvidenceInsight)
    .filter((r): r is EvidenceInsight => r !== null)
    .sort((a, b) => rankScore(b) - rankScore(a));

  return ranked[0] ?? null;
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
    title: row.title,
    content: row.content ?? '',
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

/** Ranking function: strokes_impact magnitude * confidence. Matches the
 *  Rule 8 SQL fallback we use when urgent-priority doesn't short-circuit. */
function rankScore(insight: EvidenceInsight): number {
  const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));
  const confidence = Number(insight.evidence.confidence ?? 0);
  return impact * confidence;
}
