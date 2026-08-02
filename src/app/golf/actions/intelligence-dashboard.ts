'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import {
  verifyTeamAccess as sharedVerifyTeamAccess,
  verifyInsightAccess as sharedVerifyInsightAccess,
  insightAccessDenialMessage,
} from '@/lib/auth/verify-player-access';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// TYPES
// ============================================================================

// Insight lifecycle state type
export type InsightLifecycleState = 'detected' | 'confirmed' | 'addressed' | 'resolved' | 'dismissed';

// Simplified insight type that matches actual database schema
export interface DashboardInsight {
  id: string;
  playerId: string;
  teamId?: string;
  coachId?: string;
  insightType: string;
  headline: string;
  body: string;
  recommendation?: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  strokeImpact?: number;
  lifecycleState: InsightLifecycleState;
  dismissed: boolean;
  actionTaken: boolean;
  createdAt: string;
  updatedAt: string;
  // Required for compatibility with PersistedInsight
  sourceType: 'system' | 'coach' | 'pattern' | 'round_review' | 'prediction' | 'stats' | 'correlation';
}

export interface TeamInsightSummary {
  playerId: string;
  playerName: string;
  activeInsights: number;
  urgentInsights: number;
  trend: 'improving' | 'declining' | 'stable';
  topInsight?: DashboardInsight;
}

export interface CorrelationDiscovery {
  id: string;
  title: string;
  description: string;
  metrics: string[];
  correlation: number;
  strokeImpact: number;
  playerCount: number;
  /** True when this is a placeholder correlation, not computed from real data */
  isDefault?: boolean;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface IntelligenceDashboardData {
  insights: DashboardInsight[];
  playerSummaries: TeamInsightSummary[];
  correlations: CorrelationDiscovery[];
  pagination?: PaginationMeta;
}

// Subset of golf_patterns_v2 columns read by this file.
// NOTE: live schema has NO `pattern_name` or top-level `description`; the
// human-readable description lives in `metadata.description` (jsonb). There
// is also NO `team_id` column — team scope is derived via golf_team_members.
interface PatternV2Record {
  id: string;
  conditions: unknown;
  confidence: number | null;
  occurrence_count: number | null;
  pattern_type: string | null;
  metadata: unknown;
  player_id: string | null;
  stroke_impact: number | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapStatusToLifecycleState(status: string | null): InsightLifecycleState {
  const mapping: Record<string, InsightLifecycleState> = {
    'active': 'detected',
    'acknowledged': 'confirmed',
    'in_progress': 'addressed',
    'addressed': 'addressed',
    'resolved': 'resolved',
    'dismissed': 'dismissed',
  };
  return mapping[status || 'active'] || 'detected';
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

/**
 * Verifies that the current user is a coach with access to a specific team.
 *
 * Thin wrapper over the shared `verifyTeamAccess` RPC helper. The old local
 * implementation matched any coach in the same organization_id as the team,
 * which over-granted access when orgs had multiple teams (LIVE-7/LIVE-25).
 */
async function verifyTeamAccess(
  teamId: string
): Promise<{ authorized: boolean; coachId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  const access = await sharedVerifyTeamAccess(teamId, user.id, supabase);
  if (!access.allowed) {
    return { authorized: false, error: 'Not authorized to access this team' };
  }

  // Look up coachId for callers that still need it.
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  return { authorized: true, coachId: coach?.id };
}

/**
 * Verifies that the current user owns or has access to modify an insight.
 * Access is granted if the user is the coach who created it OR a coach on the same team.
 */
async function verifyInsightAccess(
  insightId: string
): Promise<{ authorized: boolean; coachId?: string; insight?: { id: string; coach_id: string | null; team_id: string | null }; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Get the insight
  const { data: insightData } = await supabase
    .from('golf_coach_insights')
    .select('id, coach_id, team_id')
    .eq('id', insightId)
    .single();

  // Type assertion for the insight record
  const insight = insightData as { id: string; coach_id: string | null; team_id: string | null } | null;

  if (!insight) {
    return { authorized: false, error: 'Insight not found' };
  }

  // Get the current user's coach record
  // Note: golf_coaches doesn't have team_id - we look it up via organization_id
  const { data: coachData } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const coach = coachData as { id: string; organization_id: string | null } | null;

  if (!coach) {
    return { authorized: false, error: 'Not a coach' };
  }

  // Check if coach created the insight
  if (insight.coach_id === coach.id) {
    return { authorized: true, coachId: coach.id, insight };
  }

  // Check if coach is on the same team (via organization)
  if (coach.organization_id && insight.team_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .eq('id', insight.team_id)
      .maybeSingle();

    if (team) {
      return { authorized: true, coachId: coach.id, insight };
    }
  }

  return { authorized: false, error: 'Not authorized to modify this insight' };
}

// ============================================================================
// GET TEAM INSIGHTS SUMMARY
// ============================================================================

async function getTeamInsightsSummaryImpl(
  teamId: string,
  pagination?: PaginationParams
): Promise<{ success: boolean; data?: IntelligenceDashboardData; error?: string }> {
  try {
    // Verify user has access to this team
    const access = await verifyTeamAccess(teamId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const supabase = await createClient();

    // Pagination defaults with reasonable limits
    const limit = Math.min(pagination?.limit ?? 50, 100); // Max 100 per request
    const offset = pagination?.offset ?? 0;

    // First get total count for pagination. Apply the SAME shared product-
    // visibility contract (P2 legacy-surface) so this legacy intelligence list
    // never counts/renders stale v2 phantoms or archived/tentative rows if the
    // redesign flag is ever flipped off.
    const { count: totalCount } = await applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('dismissed', false),
    );

    // Fetch active insights for the team using actual database columns
    const { data: insightsData, error: insightsError } = await applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select(`
          id,
          coach_id,
          player_id,
          team_id,
          insight_type,
          title,
          content,
          priority,
          status,
          acknowledged_at,
          dismissed,
          dismissed_at,
          metadata,
          created_at,
          updated_at,
          player:golf_players(id, first_name, last_name)
        `)
        .eq('team_id', teamId)
        .eq('dismissed', false),
    )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (insightsError) {
      await logServerError(`Failed to fetch insights: ${describeError(insightsError)}`, { action: 'intelligence_dashboard.getTeamInsightsSummary' });
      return { success: false, error: 'Failed to fetch insights' };
    }

    // Map to DashboardInsight format
    const insights: DashboardInsight[] = (insightsData || []).map((record) => {
      // Extract metadata if available
      const metadata = (record.metadata as Record<string, unknown>) || {};

      return {
        id: record.id,
        playerId: record.player_id || '',
        teamId: record.team_id || undefined,
        coachId: record.coach_id || undefined,
        insightType: record.insight_type || 'performance',
        headline: record.title || '',
        body: record.content || '',
        recommendation: (metadata.recommendation as string) || undefined,
        confidence: (metadata.confidence as number) || 0.7,
        priority: (record.priority as DashboardInsight['priority']) || 'medium',
        category: (metadata.category as string) || undefined,
        strokeImpact: (metadata.strokes_impact as number) || undefined,
        lifecycleState: mapStatusToLifecycleState(record.status),
        dismissed: record.dismissed || false,
        actionTaken: !!record.acknowledged_at,
        createdAt: record.created_at || new Date().toISOString(),
        updatedAt: record.updated_at || new Date().toISOString(),
        sourceType: ((metadata.source_type as DashboardInsight['sourceType']) || 'system'),
      };
    });

    // Build player summaries
    const playerMap = new Map<string, TeamInsightSummary>();

    for (const record of insightsData || []) {
      if (!record.player_id) continue;

      const playerId = record.player_id;
      const player = record.player as { id: string; first_name: string; last_name: string } | null;

      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          playerId,
          playerName: player
            ? `${player.first_name} ${player.last_name}`
            : 'Unknown Player',
          activeInsights: 0,
          urgentInsights: 0,
          trend: 'stable',
          topInsight: undefined,
        });
      }

      const summary = playerMap.get(playerId)!;
      summary.activeInsights++;

      if (record.priority === 'urgent' || record.priority === 'high') {
        summary.urgentInsights++;
      }

      // Set top insight (first one is highest priority due to sorting)
      if (!summary.topInsight) {
        summary.topInsight = insights.find((i) => i.id === record.id);
      }
    }

    // Determine trend for each player (based on insight patterns)
    for (const summary of playerMap.values()) {
      const playerInsights = insights.filter((i) => i.playerId === summary.playerId);
      const improvingCount = playerInsights.filter(
        (i) => i.headline?.toLowerCase().includes('improv') ||
               i.category === 'performance_improvement'
      ).length;
      const decliningCount = playerInsights.filter(
        (i) => i.headline?.toLowerCase().includes('declin') ||
               i.category === 'performance_decline' ||
               i.priority === 'urgent'
      ).length;

      if (improvingCount > decliningCount + 1) {
        summary.trend = 'improving';
      } else if (decliningCount > improvingCount + 1) {
        summary.trend = 'declining';
      } else {
        summary.trend = 'stable';
      }
    }

    const playerSummaries = Array.from(playerMap.values()).sort(
      (a, b) => b.urgentInsights - a.urgentInsights || b.activeInsights - a.activeInsights
    );

    // Fetch correlation discoveries (stored patterns).
    //
    // LIVE SCHEMA NOTES (LIVE-8):
    //   - golf_patterns_v2 does NOT have a team_id column; it's player-scoped.
    //   - The only text columns are pattern_type, pattern descriptor is in
    //     `metadata.description` (jsonb).
    //   - `pattern_name` doesn't exist.
    // Derive team membership by first looking up the active player IDs on this team.
    const { data: teamPlayerRows } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const teamPlayerIds = (teamPlayerRows ?? [])
      .map((row) => row.player_id)
      .filter((id): id is string => !!id);

    const { data: patternsData } = teamPlayerIds.length > 0
      ? await supabase
          .from('golf_patterns_v2')
          .select('id, conditions, confidence, occurrence_count, pattern_type, metadata, player_id, stroke_impact')
          .in('player_id', teamPlayerIds)
          .eq('is_active', true)
          .order('confidence', { ascending: false })
          .limit(10)
      : { data: [] as PatternV2Record[] };

    const correlations: CorrelationDiscovery[] = [];

    if (patternsData && patternsData.length > 0) {
      for (const pattern of patternsData) {
        const conditions = pattern.conditions;
        const metrics: string[] = [];

        if (Array.isArray(conditions)) {
          for (const c of conditions) {
            if (c !== null && typeof c === 'object' && !Array.isArray(c)) {
              const obj = c as Record<string, unknown>;
              if (obj.field) {
                metrics.push(String(obj.field));
              }
            }
          }
        }

        const metadataObj = (pattern.metadata as Record<string, unknown> | null) ?? null;
        const metadataDescription = (metadataObj?.description as string | undefined) ?? undefined;

        correlations.push({
          id: pattern.id,
          title: pattern.pattern_type || 'Pattern Discovered',
          description: metadataDescription || 'A correlation was found between golf metrics.',
          metrics,
          correlation: pattern.confidence || 0.5,
          strokeImpact: pattern.stroke_impact ?? 0.3,
          playerCount: pattern.occurrence_count || 1,
        });
      }
    }

    // 2026-04-27: hardcoded `isDefault:true` placeholder correlations removed.
    // When no real pattern-derived correlations exist for the team we now
    // return [] so the UI can render an honest empty state / hide the tab,
    // matching `generateTeamCorrelations` below.

    return {
      success: true,
      data: {
        insights,
        playerSummaries,
        correlations,
        pagination: {
          total: totalCount ?? insights.length,
          limit,
          offset,
          hasMore: offset + insights.length < (totalCount ?? 0),
        },
      },
    };
  } catch (error) {
    await logServerError(`Error in getTeamInsightsSummary: ${describeError(error)}`, { action: 'intelligence_dashboard.getTeamInsightsSummary' });
    return { success: false, error: 'Internal server error' };
  }
}

const observedGetTeamInsightsSummary = withAdminObserved(
  'getTeamInsightsSummary',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  getTeamInsightsSummaryImpl,
);

export async function getTeamInsightsSummary(
  teamId: string,
  pagination?: PaginationParams
): Promise<{ success: boolean; data?: IntelligenceDashboardData; error?: string }> {
  return observedGetTeamInsightsSummary(teamId, pagination);
}

// ============================================================================
// GENERATE TEAM CORRELATIONS
// ============================================================================

async function generateTeamCorrelationsImpl(
  teamId: string
): Promise<{ success: boolean; correlations?: CorrelationDiscovery[]; error?: string }> {
  // 2026-04-27: hardcoded defaults removed; real correlations from
  // team_correlations.ts not yet wired into a UI surface that needs them.
  // Returns [] so consumers hide the tab. Auth check kept so callers still
  // get a consistent permission-denied path when teamId is invalid.
  try {
    const access = await verifyTeamAccess(teamId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }
    return { success: true, correlations: [] };
  } catch (error) {
    await logServerError(`Error in generateTeamCorrelations: ${describeError(error)}`, { action: 'intelligence_dashboard.generateTeamCorrelations' });
    return { success: false, error: 'Internal server error' };
  }
}

const observedGenerateTeamCorrelations = withAdminObserved(
  'generateTeamCorrelations',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  generateTeamCorrelationsImpl,
);

export async function generateTeamCorrelations(
  teamId: string
): Promise<{ success: boolean; correlations?: CorrelationDiscovery[]; error?: string }> {
  return observedGenerateTeamCorrelations(teamId);
}

// ============================================================================
// DISMISS INSIGHT
// ============================================================================

async function dismissInsightImpl(
  insightId: string,

  _reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify user has access to modify this insight
    const access = await verifyInsightAccess(insightId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const supabase = await createClient();

    // DS-2: the local verifyInsightAccess above is ORG-lenient (any coach in
    // the insight's organization passes), and the old compensating filter
    // `.eq('team_id', access.insight?.team_id)` was the insight's OWN team id —
    // a tautology, not an ownership scope. Re-gate through the shared
    // team-strict helper exactly as acknowledgeInsightImpl does, and scope the
    // UPDATE by the team id THAT gate returned.
    const { data: { user } } = await supabase.auth.getUser();
    const teamGate = await sharedVerifyInsightAccess(insightId, user!.id, supabase);
    if (!teamGate.allowed) {
      return { success: false, error: insightAccessDenialMessage(teamGate.reason) };
    }

    // P1-12 / Fix 2: fetch the acting user + the updated row's player_id off
    // the same UPDATE ... RETURNING so we can record a real ledger action.
    // Neither verifyInsightAccess helper (this file's local one or the
    // shared one in verify-player-access.ts) fetches player_id, and
    // recordInsightAction silently no-ops without it — extending the
    // trailing .select() costs nothing extra.
    //
    // DS-1: `updated_at` is deliberately NOT written. The `authenticated` role
    // has no UPDATE privilege on that column (the grant is column-scoped), so
    // including it made Postgres reject the whole statement with 42501 before
    // RLS was even evaluated — dismissInsight always failed. The
    // `update_golf_coach_insights_updated_at` BEFORE UPDATE trigger maintains
    // it server-side, which is why every sibling mutation omits it too.
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        status: 'dismissed',
        lifecycle_state: 'archived',
      })
      .eq('id', insightId)
      .eq('team_id', teamGate.teamId!)
      .select('id, player_id');

    if (error) {
      await logServerError(`Failed to dismiss insight: ${describeError(error)}`, { action: 'intelligence_dashboard.dismissInsight' });
      return { success: false, error: 'Failed to dismiss insight' };
    }

    // DS-2: an RLS-filtered UPDATE affects zero rows without erroring. Reporting
    // success on that told the coach the insight was dismissed when nothing was
    // written (and skipped the ledger entry). Mirrors acknowledgeInsightImpl.
    if (!data || data.length === 0) {
      return { success: false, error: 'Insight not found' };
    }

    if (data[0]?.player_id && user) {
      await recordInsightAction({
        insight_id: insightId,
        player_id: data[0].player_id,
        actor_id: user.id,
        actor_role: 'coach',
        action_type: 'dismissed',
      });
    }

    // Stale-data fix: also revalidate insights + intelligence + alerts pages
    // (previously only /golf/dashboard was busted).
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');
    revalidatePath('/golf/dashboard/intelligence');
    revalidatePath('/golf/dashboard/alerts');

    return { success: true };
  } catch (error) {
    await logServerError(`Error in dismissInsight: ${describeError(error)}`, { action: 'intelligence_dashboard.dismissInsight' });
    return { success: false, error: 'Internal server error' };
  }
}

const observedDismissInsight = withAdminObserved(
  'dismissInsight',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  dismissInsightImpl,
);

export async function dismissInsight(
  insightId: string,
  _reason?: string
): Promise<{ success: boolean; error?: string }> {
  return observedDismissInsight(insightId, _reason);
}

// ============================================================================
// ACKNOWLEDGE INSIGHT
// ============================================================================

async function acknowledgeInsightImpl(
  insightId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify user has access to modify this insight
    const access = await verifyInsightAccess(insightId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const supabase = await createClient();

    // Write lifecycle_state='addressed' alongside the timestamp so the
    // lifecycle cron picks this up for the addressed→resolved progression.
    // Defensive ownership filter on top of RLS — scope the UPDATE by the
    // insight's team_id resolved via the canonical helper. The earlier
    // verifyInsightAccess call above proved the user staffs that team, so we
    // mirror it on the UPDATE itself and treat 0 affected rows as 404.
    const { data: { user: gateUser } } = await supabase.auth.getUser();
    const teamGate = await sharedVerifyInsightAccess(insightId, gateUser!.id, supabase);
    if (!teamGate.allowed) {
      return { success: false, error: insightAccessDenialMessage(teamGate.reason) };
    }

    // DS-1: `updated_at` is deliberately NOT written here either — see the note
    // in dismissInsightImpl. The column-scoped grant excludes it, so writing it
    // errored the whole statement (42501) and acknowledge always failed.
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .update({
        acknowledged_at: new Date().toISOString(),
        status: 'acknowledged',
        lifecycle_state: 'addressed',
      })
      .eq('id', insightId)
      .eq('team_id', teamGate.teamId!)
      .select('id, player_id');

    if (error) {
      await logServerError(`Failed to acknowledge insight: ${describeError(error)}`, { action: 'intelligence_dashboard.acknowledgeInsight' });
      return { success: false, error: 'Failed to acknowledge insight' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Insight not found' };
    }

    // P1-12 / Fix 2: this is the Triage Desk path — previously the ONLY
    // acknowledge/dismiss mutation path that recorded nothing at all in
    // golf_insight_action (not a dropped `void` call like the sibling
    // insights.ts sites — a total absence). player_id comes off the same
    // UPDATE ... RETURNING above.
    if (data[0]?.player_id) {
      await recordInsightAction({
        insight_id: insightId,
        player_id: data[0].player_id,
        actor_id: gateUser!.id,
        actor_role: 'coach',
        action_type: 'acknowledged',
      });
    }

    // Was missing entirely (2026-07-19 triage diagnosis): every sibling
    // mutation (dismissInsight above, bulkDismiss/bulkAcknowledge/bulkResolve
    // in insight-management.ts) revalidates these paths; acknowledging left
    // the dashboard/insights/intelligence list showing the stale
    // pre-acknowledge state until an unrelated navigation happened to bust it.
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');
    revalidatePath('/golf/dashboard/intelligence');

    return { success: true };
  } catch (error) {
    await logServerError(`Error in acknowledgeInsight: ${describeError(error)}`, { action: 'intelligence_dashboard.acknowledgeInsight' });
    return { success: false, error: 'Internal server error' };
  }
}

const observedAcknowledgeInsight = withAdminObserved(
  'acknowledgeInsight',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  acknowledgeInsightImpl,
);

export async function acknowledgeInsight(
  insightId: string
): Promise<{ success: boolean; error?: string }> {
  return observedAcknowledgeInsight(insightId);
}
