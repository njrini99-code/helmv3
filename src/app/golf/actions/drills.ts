'use server';

/**
 * Drill-attachment server actions for the Insight Quality phase.
 *
 * - `getDrillsForInsight(insightId)` joins `golf_insight_drill_attachments`
 *   back to `golf_drills` and returns up to 3 drills ordered by attachment
 *   rank. RLS on `golf_insight_drill_attachments` already constrains SELECT
 *   to rows whose parent insight the user can see, so we just need an auth
 *   check here — no hand-rolled authorization.
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
import { logServerError, logServerEvent } from '@/lib/server-error-logger';

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
export async function getDrillsForInsight(
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

/**
 * Records that a player opened a drill. For now we just log at info level —
 * when we need real analytics we'll back this with `golf_drill_views`.
 */
export async function recordDrillView(drillId: string): Promise<void> {
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
