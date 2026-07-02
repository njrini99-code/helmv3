'use server';

/**
 * Drill-attachment server actions for the Insight Quality phase.
 *
 * - `getDrillsForInsight(insightId)` joins `golf_insight_drill_attachments`
 *   back to `golf_drills` and returns up to 3 drills ordered by attachment
 *   rank. The attachment RLS policy is EXISTS-only (it checks the parent
 *   insight ROW exists, NOT that it is product-visible), so we FIRST resolve
 *   the insight through `applyInsightVisibility` and only return drills when
 *   the parent is currently surfaceable — otherwise drills of an
 *   archived/dismissed/stale-v2 insight would linger on the page (the
 *   recurring "old stuff" stale-data bug).
 *
 * - `recordDrillView(drillId)` logs an info-level event so we can measure
 *   drill engagement later without schema churn. We intentionally skip the
 *   dedicated `golf_drill_views` table the plan sketched out; analytics
 *   infrastructure can read these log lines until the table is justified
 *   by a real dashboard requirement.
 *
 * Both actions auth-check the user first. Callers can await `getDrills…`
 * inside a `useTransition` and then render the returned drills.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { withAdminObserved } from '@/lib/admin/observed-action';

export interface InsightDrill {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  description: string;
  duration_min: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  video_url: string | null;
  rank: number;
}

interface AttachmentRow {
  rank: number | null;
  drill: {
    id: string;
    slug: string;
    title: string;
    category: string;
    tags: string[] | null;
    description: string;
    duration_min: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    video_url: string | null;
  } | null;
}

/**
 * Loads drills attached to an insight, top-3 by rank. Returns an empty
 * array for missing/inaccessible insights so the UI can safely render
 * nothing.
 */
async function getDrillsForInsightImpl(
  insightId: string,
): Promise<InsightDrill[]> {
  if (!insightId) return [];

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    // Not throwing — the player dashboard already sets up auth; a drill
    // fetch failing shouldn't blank the page.
    return [];
  }

  // Gate on the parent insight's product-visibility. The attachment RLS policy
  // only checks the insight EXISTS, so without this an archived/dismissed/
  // stale-v2 insight's drills would still surface (stale-data bug).
  const { data: visibleInsight, error: visError } = await applyInsightVisibility(
    supabase.from('golf_coach_insights').select('id').eq('id', insightId),
  );
  if (visError) {
    await logServerError(`getDrillsForInsight visibility check failed: ${visError.message}`, {
      action: 'drills.getDrillsForInsight',
      featureArea: 'insights',
      extra: { insightId, errorCode: visError.code },
    });
    return [];
  }
  if (!visibleInsight || visibleInsight.length === 0) return [];

  const { data, error } = await supabase
    .from('golf_insight_drill_attachments')
    .select(
      `
      rank,
      drill:golf_drills (
        id,
        slug,
        title,
        category,
        tags,
        description,
        duration_min,
        difficulty,
        video_url
      )
    `,
    )
    .eq('insight_id', insightId)
    .order('rank', { ascending: true })
    .limit(3);

  if (error) {
    await logServerError(
      `getDrillsForInsight failed: ${error.message}`,
      {
        action: 'drills.getDrillsForInsight',
        featureArea: 'insights',
        extra: { insightId, errorCode: error.code },
      },
    );
    return [];
  }

  const rows = (data ?? []) as unknown as AttachmentRow[];
  return rows
    .filter((r): r is AttachmentRow & { drill: NonNullable<AttachmentRow['drill']> } => !!r.drill)
    .map((r) => ({
      id: r.drill.id,
      slug: r.drill.slug,
      title: r.drill.title,
      category: r.drill.category,
      tags: r.drill.tags ?? [],
      description: r.drill.description,
      duration_min: r.drill.duration_min,
      difficulty: r.drill.difficulty,
      video_url: r.drill.video_url,
      rank: r.rank ?? 0,
    }));
}

const observedGetDrillsForInsight = withAdminObserved(
  'getDrillsForInsight',
  { sport: 'golf', feature: 'drills_practice_rx' },
  getDrillsForInsightImpl,
);

export async function getDrillsForInsight(insightId: string): Promise<InsightDrill[]> {
  return observedGetDrillsForInsight(insightId);
}

/**
 * Batched sibling of {@link getDrillsForInsight}: loads the top-3 drills for
 * MANY insights in a SINGLE round-trip and returns a `{ [insightId]: drills }`
 * map. This lets a list of insight-sourced cards collapse what would be N
 * post-hydration client→server fetches (the P176 N+1 waterfall) into one.
 *
 * The attachment RLS policy is EXISTS-only (parent insight row exists), NOT
 * visibility-aware, so we FIRST resolve which of the requested insights are
 * currently product-visible via `applyInsightVisibility` and only fetch drills
 * for those — drills of an archived/dismissed/stale-v2 insight must not linger
 * on the page (stale-data bug). Non-visible ids still get a `[]` entry so the
 * returned map stays total. Per-insight ordering + the top-3 cap are applied
 * client-side here because PostgREST can't window-per-group in one query; the
 * row volume (≤3 × #insights on a development page) is trivially small.
 */
async function getDrillsForInsightsImpl(
  insightIds: string[],
): Promise<Record<string, InsightDrill[]>> {
  const ids = Array.from(new Set(insightIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return {};

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    // Return empty arrays for every requested id so callers render nothing
    // (same honest-empty contract as the single-insight action).
    return Object.fromEntries(ids.map((id) => [id, []]));
  }

  // Resolve the product-visible subset of the requested insights. Total map is
  // seeded below with every requested id, so non-visible ones stay [].
  const { data: visibleRows, error: visError } = await applyInsightVisibility(
    supabase.from('golf_coach_insights').select('id').in('id', ids),
  );
  if (visError) {
    await logServerError(`getDrillsForInsights visibility check failed: ${visError.message}`, {
      action: 'drills.getDrillsForInsights',
      featureArea: 'insights',
      extra: { insightCount: ids.length, errorCode: visError.code },
    });
    return Object.fromEntries(ids.map((id) => [id, []]));
  }
  const visibleIds = (visibleRows ?? []).map((r) => r.id);
  if (visibleIds.length === 0) return Object.fromEntries(ids.map((id) => [id, []]));

  const { data, error } = await supabase
    .from('golf_insight_drill_attachments')
    .select(
      `
      insight_id,
      rank,
      drill:golf_drills (
        id,
        slug,
        title,
        category,
        tags,
        description,
        duration_min,
        difficulty,
        video_url
      )
    `,
    )
    .in('insight_id', visibleIds)
    .order('rank', { ascending: true });

  if (error) {
    await logServerError(
      `getDrillsForInsights failed: ${error.message}`,
      {
        action: 'drills.getDrillsForInsights',
        featureArea: 'insights',
        extra: { insightCount: ids.length, errorCode: error.code },
      },
    );
    return Object.fromEntries(ids.map((id) => [id, []]));
  }

  const rows = (data ?? []) as unknown as Array<AttachmentRow & { insight_id: string }>;

  // Seed every requested id with [] so the map is total (no undefined keys),
  // then bucket the rows by insight and cap each bucket at the top-3 by rank.
  const byInsight: Record<string, InsightDrill[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (const r of rows) {
    if (!r.drill) continue;
    const bucket = byInsight[r.insight_id];
    if (!bucket || bucket.length >= 3) continue; // rows are rank-ordered → first 3 are top-3
    bucket.push({
      id: r.drill.id,
      slug: r.drill.slug,
      title: r.drill.title,
      category: r.drill.category,
      tags: r.drill.tags ?? [],
      description: r.drill.description,
      duration_min: r.drill.duration_min,
      difficulty: r.drill.difficulty,
      video_url: r.drill.video_url,
      rank: r.rank ?? 0,
    });
  }

  return byInsight;
}

const observedGetDrillsForInsights = withAdminObserved(
  'getDrillsForInsights',
  { sport: 'golf', feature: 'drills_practice_rx' },
  getDrillsForInsightsImpl,
);

export async function getDrillsForInsights(insightIds: string[]): Promise<Record<string, InsightDrill[]>> {
  return observedGetDrillsForInsights(insightIds);
}

/**
 * Records that a player opened a drill. For now we just log at info level —
 * when we need real analytics we'll back this with `golf_drill_views`.
 */
async function recordDrillViewImpl(drillId: string): Promise<void> {
  if (!drillId) return;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return;
  }

  await logServerEvent(
    `drill_view user=${user.id} drill=${drillId}`,
    {
      action: 'drills.recordDrillView',
      featureArea: 'insights',
      extra: { userId: user.id, drillId },
    },
    'info',
  );
}

const observedRecordDrillView = withAdminObserved(
  'recordDrillView',
  { sport: 'golf', feature: 'drills_practice_rx' },
  recordDrillViewImpl,
);

export async function recordDrillView(drillId: string): Promise<void> {
  return observedRecordDrillView(drillId);
}

/**
 * Records that a player tapped "Add to my practice plan" on a drill.
 *
 * 2026-04-27: switched from log-only telemetry to a real INSERT into
 * `golf_insight_drill_attachments` (the table that already backs
 * `getDrillsForInsight` above). Without an `insightId` we have no row to
 * attach to, so we fall back to the prior log-only behavior — the table's
 * primary key is (insight_id, drill_id) and `insight_id` is NOT NULL.
 *
 * Live schema columns: `insight_id uuid NOT NULL`, `drill_id uuid NOT NULL`,
 * `rank int default 0`. No `attached_at` / `attached_by` columns.
 *
 * Idempotency: upsert on the composite PK so re-tapping the button doesn't
 * error out.
 */
async function recordDrillAddedToPlanImpl(
  drillId: string,
  insightId: string | null = null,
): Promise<{ success: boolean; error?: string }> {
  if (!drillId) return { success: false, error: 'Drill id required' };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Without an insight to attach to, the row can't be persisted (insight_id
  // is NOT NULL on the table). Fall back to telemetry so the click still
  // shows up in product analytics.
  if (!insightId) {
    await logServerEvent(
      `drill_added_to_plan user=${user.id} drill=${drillId} insight=none`,
      {
        action: 'drills.recordDrillAddedToPlan',
        featureArea: 'insights',
        extra: { userId: user.id, drillId, insightId: null },
      },
      'info',
    );
    return { success: true };
  }

  const { error: upsertError } = await supabase
    .from('golf_insight_drill_attachments')
    .upsert(
      { insight_id: insightId, drill_id: drillId, rank: 0 },
      { onConflict: 'insight_id,drill_id' },
    );

  if (upsertError) {
    // Keep the telemetry breadcrumb so we can still see engagement even if
    // the persistence call fails (RLS denial, etc.).
    await logServerError(
      `recordDrillAddedToPlan upsert failed: ${upsertError.message}`,
      {
        action: 'drills.recordDrillAddedToPlan',
        featureArea: 'insights',
        extra: { userId: user.id, drillId, insightId, errorCode: upsertError.code },
      },
    );
    await logServerEvent(
      `drill_added_to_plan_failed user=${user.id} drill=${drillId} insight=${insightId}`,
      {
        action: 'drills.recordDrillAddedToPlan',
        featureArea: 'insights',
        extra: { userId: user.id, drillId, insightId },
      },
      'warning',
    );
    return { success: false, error: 'Failed to attach drill' };
  }

  await logServerEvent(
    `drill_added_to_plan user=${user.id} drill=${drillId} insight=${insightId}`,
    {
      action: 'drills.recordDrillAddedToPlan',
      featureArea: 'insights',
      extra: { userId: user.id, drillId, insightId },
    },
    'info',
  );

  // Analytics dashboards read from this table; revalidate the analytics route.
  revalidatePath('/golf/dashboard/analytics/coachhelm');

  return { success: true };
}

const observedRecordDrillAddedToPlan = withAdminObserved(
  'recordDrillAddedToPlan',
  { sport: 'golf', feature: 'drills_practice_rx' },
  recordDrillAddedToPlanImpl,
);

export async function recordDrillAddedToPlan(drillId: string, insightId: string | null = null): Promise<{ success: boolean; error?: string }> {
  return observedRecordDrillAddedToPlan(drillId, insightId);
}
