/**
 * Coach Behavior — Coach Usage Analytics
 *
 * Tracks coach actions and derives preferences to personalise the experience.
 * derivePreferences is a pure function; database interactions are limited to
 * recordAction / queryActions helpers at the bottom of this file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

// ============================================================================
// TYPES
// ============================================================================

export interface CoachAction {
  coachId: string;
  actionType:
    | 'view_player'
    | 'view_insight'
    | 'expand_insight'
    | 'dismiss_insight'
    | 'act_on_insight'
    | 'filter_metric'
    | 'view_page';
  targetId?: string;
  metadata?: Record<string, string>;
  timestamp: string;
}

export interface CoachPreferences {
  frequentlyViewedPlayers: string[];
  preferredMetrics: string[];
  insightExpandRate: number;
  insightDismissRate: number;
  activeHours: number[];
  lastActive: string;
}

// ============================================================================
// PUBLIC API — PURE FUNCTIONS
// ============================================================================

/**
 * Derives coach preferences from a list of actions.
 *
 * - frequentlyViewedPlayers: top 5 player IDs by view_player count
 * - preferredMetrics: top 5 metrics from filter_metric metadata
 * - insightExpandRate / insightDismissRate: % of insight-related actions
 * - activeHours: top 3 hours of day by action count
 * - lastActive: most recent timestamp
 */
export function derivePreferences(actions: CoachAction[]): CoachPreferences {
  if (actions.length === 0) {
    return {
      frequentlyViewedPlayers: [],
      preferredMetrics: [],
      insightExpandRate: 0,
      insightDismissRate: 0,
      activeHours: [],
      lastActive: '',
    };
  }

  // Frequently viewed players
  const playerViews = countBy(
    actions.filter((a) => a.actionType === 'view_player' && a.targetId),
    (a) => a.targetId!
  );
  const frequentlyViewedPlayers = topN(playerViews, 5);

  // Preferred metrics
  const metricFilters = countBy(
    actions.filter((a) => a.actionType === 'filter_metric' && a.metadata?.metric),
    (a) => a.metadata!.metric
  );
  const preferredMetrics = topN(metricFilters, 5);

  // Insight rates
  const insightActions = actions.filter(
    (a) =>
      a.actionType === 'view_insight' ||
      a.actionType === 'expand_insight' ||
      a.actionType === 'dismiss_insight' ||
      a.actionType === 'act_on_insight'
  );
  const insightTotal = insightActions.length;
  const expandCount = insightActions.filter((a) => a.actionType === 'expand_insight').length;
  const dismissCount = insightActions.filter((a) => a.actionType === 'dismiss_insight').length;
  const insightExpandRate = insightTotal > 0 ? expandCount / insightTotal : 0;
  const insightDismissRate = insightTotal > 0 ? dismissCount / insightTotal : 0;

  // Active hours
  const hourCounts = countBy(actions, (a) => {
    const d = new Date(a.timestamp);
    return String(d.getHours());
  });
  const activeHours = topN(hourCounts, 3).map(Number);

  // Last active
  const timestamps = actions.map((a) => a.timestamp).sort();
  const lastActive = timestamps[timestamps.length - 1] ?? '';

  return {
    frequentlyViewedPlayers,
    preferredMetrics,
    insightExpandRate,
    insightDismissRate,
    activeHours,
    lastActive,
  };
}

/**
 * Adjusts item scores based on coach preferences.
 *
 * - +0.1 if item's player is in frequentlyViewedPlayers
 * - +0.05 if item's metric is in preferredMetrics
 *
 * Returns a new array with an added adjustedScore field, sorted descending.
 */
export function prioritizeForCoach(
  items: Array<{ playerId?: string; metric?: string; score: number }>,
  preferences: CoachPreferences
): Array<{ playerId?: string; metric?: string; score: number; adjustedScore: number }> {
  const playerSet = new Set(preferences.frequentlyViewedPlayers);
  const metricSet = new Set(preferences.preferredMetrics);

  const scored = items.map((item) => {
    let boost = 0;
    if (item.playerId && playerSet.has(item.playerId)) {
      boost += 0.1;
    }
    if (item.metric && metricSet.has(item.metric)) {
      boost += 0.05;
    }
    return { ...item, adjustedScore: item.score + boost };
  });

  return scored.sort((a, b) => b.adjustedScore - a.adjustedScore);
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

interface CoachBehaviorInsertRow {
  coach_id: string;
  action_type: CoachAction['actionType'];
  target_id: string | null;
  metadata: Record<string, string> | null;
}

interface CoachBehaviorSelectRow {
  coach_id: string;
  action_type: CoachAction['actionType'];
  target_id: string | null;
  metadata: Record<string, string> | null;
  created_at: string;
}

/**
 * Records a coach action to the database.
 *
 * Drops the bogus `timestamp` field that prior versions inserted — the live
 * `golf_coach_behavior_log` table has `created_at` (auto-defaulted) and no
 * `timestamp` column. Surfaces DB errors to callers so silent writes are
 * impossible (LIVE-10).
 */
export async function recordAction(
  action: CoachAction,
  supabaseOverride?: SupabaseClient,
): Promise<void> {
  const supabase = supabaseOverride ?? createAdminClient();

  const payload: CoachBehaviorInsertRow = {
    coach_id: action.coachId,
    action_type: action.actionType,
    target_id: action.targetId ?? null,
    metadata: action.metadata ?? null,
  };

  const fromFn = (supabase as unknown as {
    from: (table: string) => {
      insert: (row: CoachBehaviorInsertRow) => Promise<{ error: { message: string } | null }>;
    };
  }).from;

  const { error } = await fromFn
    .call(supabase, 'golf_coach_behavior_log')
    .insert(payload);

  if (error) {
    await logServerError('coach-behavior.recordAction failed', {
      action: 'coach-behavior.recordAction',
      featureArea: 'coachhelm.feedback',
      source: 'background_job',
      metadata: { coachId: action.coachId, actionType: action.actionType, dbError: error as unknown },
    });
    throw new Error(error.message);
  }
}

/**
 * Queries recent coach actions from the database.
 *
 * Reads `created_at` as the timestamp (live table column).
 */
export async function queryActions(
  coachId: string,
  limit = 500,
  supabaseOverride?: SupabaseClient,
): Promise<CoachAction[]> {
  const supabase = supabaseOverride ?? createAdminClient();

  const fromFn = (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (
              n: number,
            ) => Promise<{ data: CoachBehaviorSelectRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  }).from;

  const { data, error } = await fromFn
    .call(supabase, 'golf_coach_behavior_log')
    .select('coach_id, action_type, target_id, metadata, created_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) {
      await logServerError('coach-behavior.queryActions failed', {
        action: 'coach-behavior.queryActions',
        featureArea: 'coachhelm.feedback',
        source: 'background_job',
        metadata: { coachId, dbError: error as unknown },
      });
    }
    return [];
  }

  return data.map((row) => ({
    coachId: row.coach_id,
    actionType: row.action_type,
    targetId: row.target_id ?? undefined,
    metadata: row.metadata ?? undefined,
    timestamp: row.created_at,
  }));
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function topN(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}
