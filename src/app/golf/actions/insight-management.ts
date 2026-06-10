'use server';

// ============================================================================
// INSIGHT MANAGEMENT SERVER ACTIONS
// ============================================================================
//
// Comprehensive insight management including search, filtering, bulk operations,
// and export functionality for CoachHelm.
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  InsightType,
  InsightPriority,
  InsightStatus,
  InsightWithPlayer,
} from '@/lib/coachhelm/insight-types';
import { logServerError } from '@/lib/server-error-logger';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';

// ============================================================================
// TYPES
// ============================================================================

export interface InsightFilters {
  playerId?: string;
  insightType?: InsightType;
  priority?: InsightPriority;
  status?: InsightStatus;
  dateRange?: 'last_7_days' | 'last_30_days' | 'last_90_days' | 'custom';
  startDate?: string;
  endDate?: string;
}

export interface SearchInsightsParams {
  coachId: string;
  query?: string;
  filters?: InsightFilters;
  page?: number;
  pageSize?: number;
  sortBy?: 'priority' | 'created_at' | 'player_name';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchInsightsResult {
  success: boolean;
  insights: InsightWithPlayer[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

export interface BulkActionResult {
  success: boolean;
  affectedCount: number;
  error?: string;
}

export interface ExportInsightsResult {
  success: boolean;
  data?: string;
  filename?: string;
  mimeType?: string;
  error?: string;
}

// ============================================================================
// SEARCH INSIGHTS
// ============================================================================

export async function searchInsights({
  coachId,
  query,
  filters,
  page = 1,
  pageSize = 20,
  sortBy = 'created_at',
  sortOrder = 'desc',
}: SearchInsightsParams): Promise<SearchInsightsResult> {
  const supabase = await createClient();

  try {
    // Build the query. Apply the SAME shared product-visibility contract (P2
    // legacy-surface) so the legacy InsightsPageContent search never surfaces
    // stale v2 phantoms or archived/tentative rows if the redesign flag is ever
    // flipped off. The text-search `.or(...)` chained below ANDs with the
    // helper's v3-engine `.or(...)` per PostgREST semantics.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryBuilder = applyInsightVisibility(
      (supabase as any)
        .from('golf_coach_insights')
        .select(
          `
        *,
        player:golf_players(id, first_name, last_name, avatar_url)
      `,
          { count: 'exact' }
        )
        .eq('coach_id', coachId),
    );

    // Text search on title and content.
    // NOTE: live schema has `content` (not `description`). The old `.or()`
    // filter referenced a nonexistent column and silently returned 0 rows.
    if (query && query.trim()) {
      const searchTerm = `%${query.trim()}%`;
      queryBuilder = queryBuilder.or(
        `title.ilike.${searchTerm},content.ilike.${searchTerm}`
      );
    }

    // Apply filters
    if (filters) {
      if (filters.playerId) {
        queryBuilder = queryBuilder.eq('player_id', filters.playerId);
      }

      if (filters.insightType) {
        queryBuilder = queryBuilder.eq('insight_type', filters.insightType);
      }

      if (filters.priority) {
        queryBuilder = queryBuilder.eq('priority', filters.priority);
      }

      if (filters.status) {
        queryBuilder = queryBuilder.eq('status', filters.status);
      }

      // Date range filtering
      if (filters.dateRange) {
        const now = new Date();
        let startDate: Date | null = null;

        switch (filters.dateRange) {
          case 'last_7_days':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'last_30_days':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'last_90_days':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case 'custom':
            if (filters.startDate) {
              startDate = new Date(filters.startDate);
            }
            break;
        }

        if (startDate) {
          queryBuilder = queryBuilder.gte('created_at', startDate.toISOString());
        }

        if (filters.dateRange === 'custom' && filters.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          queryBuilder = queryBuilder.lte('created_at', endDate.toISOString());
        }
      }
    }

    // Sorting
    if (sortBy === 'priority') {
      // Custom priority ordering: urgent > high > medium > low
      const priorityOrder = sortOrder === 'asc' ? 'asc' : 'desc';
      queryBuilder = queryBuilder
        .order('priority', { ascending: priorityOrder === 'asc' })
        .order('created_at', { ascending: false });
    } else if (sortBy === 'player_name') {
      // Sort by joined player table via PostgREST foreignTable ordering. This
      // moves the sort to the DB layer so pagination produces a correctly
      // ordered global slice — the previous client-side sort only reordered
      // each individual page, leading to wrong alphabetical order across pages.
      queryBuilder = queryBuilder
        .order('last_name', { foreignTable: 'player', ascending: sortOrder === 'asc' })
        .order('first_name', { foreignTable: 'player', ascending: sortOrder === 'asc' });
    } else {
      queryBuilder = queryBuilder.order('created_at', { ascending: sortOrder === 'asc' });
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    queryBuilder = queryBuilder.range(from, to);

    const { data: insights, error, count } = await queryBuilder;

    if (error) {
      await logServerError(`[Insight Search Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.searchInsights' });
      return {
        success: false,
        insights: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        error: 'Failed to search insights',
      };
    }

    // Sort is now applied at the DB layer via foreignTable ordering (see
    // queryBuilder.order(... { foreignTable: 'player' }) above). The
    // legacy client-side re-sort is removed — it was only reordering each
    // individual page, producing wrong alphabetical order across pages.
    const sortedInsights = insights || [];

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      success: true,
      insights: sortedInsights,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    await logServerError(`Unexpected error in searchInsights: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.searchInsights' });
    return {
      success: false,
      insights: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      error: 'An unexpected error occurred',
    };
  }
}

// ============================================================================
// BULK DISMISS INSIGHTS
// ============================================================================

export async function bulkDismissInsights(
  insightIds: string[]
): Promise<BulkActionResult> {
  const supabase = await createClient();

  try {
    if (!insightIds.length) {
      return { success: false, affectedCount: 0, error: 'No insights selected' };
    }

    // Verify user owns these insights
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, affectedCount: 0, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, affectedCount: 0, error: 'Coach not found' };
    }

    // Bulk update. Live schema has BOTH a `status` enum ('active'|'dismissed'|...)
    // AND a boolean `dismissed` + `dismissed_at` timestamp. The alerts/insights
    // screens filter on `dismissed=false` so we must set both to make the
    // record actually disappear from the default views.
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .update({
        status: 'dismissed',
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        lifecycle_state: 'archived',
      })
      .eq('coach_id', coach.id)
      .in('id', insightIds)
      .select('id');

    if (error) {
      await logServerError(`[Bulk Dismiss Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.bulkDismissInsights' });
      return { success: false, affectedCount: 0, error: 'Failed to dismiss insights' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');
    revalidatePath('/golf/dashboard/alerts');
    revalidatePath('/golf/dashboard/intelligence');

    return { success: true, affectedCount: data?.length || 0 };
  } catch (error) {
    await logServerError(`Unexpected error in bulkDismissInsights: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.bulkDismissInsights' });
    return { success: false, affectedCount: 0, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// BULK ACKNOWLEDGE INSIGHTS
// ============================================================================

export async function bulkAcknowledgeInsights(
  insightIds: string[]
): Promise<BulkActionResult> {
  const supabase = await createClient();

  try {
    if (!insightIds.length) {
      return { success: false, affectedCount: 0, error: 'No insights selected' };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, affectedCount: 0, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, affectedCount: 0, error: 'Coach not found' };
    }

    // Write lifecycle_state='addressed' alongside the timestamp so the
    // lifecycle cron picks these up for the addressed→resolved progression.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        lifecycle_state: 'addressed',
      })
      .eq('coach_id', coach.id)
      .in('id', insightIds)
      .select('id');

    if (error) {
      await logServerError(`[Bulk Acknowledge Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.bulkAcknowledgeInsights' });
      return { success: false, affectedCount: 0, error: 'Failed to acknowledge insights' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');

    return { success: true, affectedCount: data?.length || 0 };
  } catch (error) {
    await logServerError(`Unexpected error in bulkAcknowledgeInsights: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.bulkAcknowledgeInsights' });
    return { success: false, affectedCount: 0, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// BULK RESOLVE INSIGHTS
// ============================================================================

export async function bulkResolveInsights(
  insightIds: string[]
): Promise<BulkActionResult> {
  const supabase = await createClient();

  try {
    if (!insightIds.length) {
      return { success: false, affectedCount: 0, error: 'No insights selected' };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, affectedCount: 0, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, affectedCount: 0, error: 'Coach not found' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        lifecycle_state: 'resolved',
      })
      .eq('coach_id', coach.id)
      .in('id', insightIds)
      .select('id');

    if (error) {
      await logServerError(`[Bulk Resolve Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.bulkResolveInsights' });
      return { success: false, affectedCount: 0, error: 'Failed to resolve insights' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');

    return { success: true, affectedCount: data?.length || 0 };
  } catch (error) {
    await logServerError(`Unexpected error in bulkResolveInsights: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.bulkResolveInsights' });
    return { success: false, affectedCount: 0, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// EXPORT INSIGHTS
// ============================================================================

export async function exportInsights(
  insightIds: string[],
  format: 'csv' | 'json'
): Promise<ExportInsightsResult> {
  const supabase = await createClient();

  try {
    if (!insightIds.length) {
      return { success: false, error: 'No insights selected' };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Fetch insights. Pin to columns that actually exist in live schema:
    // no `description` (it's `content`); no `recommendation` (it lives in
    // `metadata.recommendation`); `acknowledged_at` / `resolved_at` exist
    // but we derive readable fields only from current columns.
    const { data: insights, error } = await supabase
      .from('golf_coach_insights')
      .select(
        `
        id,
        insight_type,
        priority,
        title,
        content,
        status,
        dismissed,
        dismissed_at,
        outcome_status,
        metadata,
        created_at,
        acknowledged_at,
        resolved_at,
        player_id,
        player:golf_players(first_name, last_name)
      `
      )
      .eq('coach_id', coach.id)
      .in('id', insightIds);

    if (error) {
      await logServerError(`[Export Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.exportInsights' });
      return { success: false, error: 'Failed to fetch insights for export' };
    }

    if (!insights || insights.length === 0) {
      return { success: false, error: 'No insights found' };
    }

    const timestamp = new Date().toISOString().split('T')[0];

    type ExportedInsightRow = {
      id: string;
      insight_type: string | null;
      priority: string | null;
      title: string | null;
      content: string | null;
      status: string | null;
      dismissed: boolean | null;
      dismissed_at: string | null;
      outcome_status: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string | null;
      acknowledged_at: string | null;
      resolved_at: string | null;
      player: { first_name: string | null; last_name: string | null } | null;
    };

    const recommendationFor = (row: ExportedInsightRow): string =>
      ((row.metadata as Record<string, unknown> | null)?.recommendation as string | undefined) ?? '';

    if (format === 'json') {
      // Format as JSON. Keep `description` field name in the output for
      // backward-compat with downstream consumers expecting that key.
      const exportData = (insights as ExportedInsightRow[]).map((insight) => ({
        id: insight.id,
        type: insight.insight_type,
        priority: insight.priority,
        player: insight.player
          ? `${insight.player.first_name ?? ''} ${insight.player.last_name ?? ''}`.trim()
          : 'Team',
        title: insight.title,
        description: insight.content,
        recommendation: recommendationFor(insight),
        status: insight.status,
        outcomeStatus: insight.outcome_status,
        dismissed: insight.dismissed,
        dismissedAt: insight.dismissed_at,
        createdAt: insight.created_at,
        acknowledgedAt: insight.acknowledged_at,
        resolvedAt: insight.resolved_at,
      }));

      return {
        success: true,
        data: JSON.stringify(exportData, null, 2),
        filename: `coachhelm-insights-${timestamp}.json`,
        mimeType: 'application/json',
      };
    }

    // Format as CSV
    const headers = [
      'ID',
      'Type',
      'Priority',
      'Player',
      'Title',
      'Description',
      'Recommendation',
      'Status',
      'Outcome',
      'Dismissed',
      'Created At',
      'Acknowledged At',
      'Resolved At',
    ];

    const rows = (insights as ExportedInsightRow[]).map((insight) => [
      insight.id,
      insight.insight_type ?? '',
      insight.priority ?? '',
      insight.player
        ? `${insight.player.first_name ?? ''} ${insight.player.last_name ?? ''}`.trim()
        : 'Team',
      // Escape CSV special characters
      `"${(insight.title || '').replace(/"/g, '""')}"`,
      `"${(insight.content || '').replace(/"/g, '""')}"`,
      `"${recommendationFor(insight).replace(/"/g, '""')}"`,
      insight.status ?? '',
      insight.outcome_status ?? '',
      insight.dismissed ? 'true' : 'false',
      insight.created_at ?? '',
      insight.acknowledged_at || '',
      insight.resolved_at || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: string[]) => row.join(',')),
    ].join('\n');

    return {
      success: true,
      data: csvContent,
      filename: `coachhelm-insights-${timestamp}.csv`,
      mimeType: 'text/csv',
    };
  } catch (error) {
    await logServerError(`Unexpected error in exportInsights: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.exportInsights' });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET FILTER OPTIONS (for dynamic dropdowns)
// ============================================================================

export interface FilterOptions {
  players: Array<{ id: string; name: string }>;
  insightTypes: InsightType[];
  priorities: InsightPriority[];
  statuses: InsightStatus[];
}

export async function getInsightFilterOptions(
  coachId: string
): Promise<{ success: boolean; options?: FilterOptions; error?: string }> {
  const supabase = await createClient();

  try {
    // Get team ID from coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('id', coachId)
      .single();

    if (!coach?.organization_id) {
      return { success: false, error: 'Coach organization not found' };
    }

    // Get team
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (!team) {
      return { success: false, error: 'Team not found' };
    }

    // Get active players on the team
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', team.id)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map((m) => m.player_id);

    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds)
      .order('last_name');

    const options: FilterOptions = {
      players: (players || []).map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
      })),
      insightTypes: [
        'scoring_decline',
        'stat_regression',
        'tournament_pressure',
        'plateau',
        'bubble_player',
        'surge_player',
        'streak',
        'recurring_weakness',
        'closing_holes',
        'par_3_issues',
        'team_trend',
        'roster_recommendation',
      ],
      priorities: ['urgent', 'high', 'medium', 'low'],
      statuses: ['active', 'acknowledged', 'resolved', 'dismissed'],
    };

    return { success: true, options };
  } catch (error) {
    await logServerError(`Error getting filter options: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.getInsightFilterOptions' });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET INSIGHTS STATS (for dashboard summary)
// ============================================================================

export interface InsightsStats {
  total: number;
  active: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  byPriority: Record<InsightPriority, number>;
  byType: Record<string, number>;
}

export async function getInsightsStats(
  coachId: string
): Promise<{ success: boolean; stats?: InsightsStats; error?: string }> {
  const supabase = await createClient();

  try {
    // Apply the SAME shared product-visibility contract (P2 legacy-surface) so
    // the legacy stats counts reflect the product-visible truth (e.g. 212),
    // not every stale v2 / archived / tentative row (313).
    const { data: insights, error } = await applyInsightVisibility(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_coach_insights')
        .select('status, priority, insight_type')
        .eq('coach_id', coachId),
    );

    if (error) {
      await logServerError(`[Stats Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.getInsightsStats' });
      return { success: false, error: 'Failed to get insights stats' };
    }

    const stats: InsightsStats = {
      total: insights?.length || 0,
      active: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
      byPriority: { urgent: 0, high: 0, medium: 0, low: 0 },
      byType: {},
    };

    for (const insight of insights || []) {
      // Status counts
      if (insight.status === 'active') stats.active++;
      else if (insight.status === 'acknowledged') stats.acknowledged++;
      else if (insight.status === 'resolved') stats.resolved++;
      else if (insight.status === 'dismissed') stats.dismissed++;

      // Priority counts
      if (insight.priority in stats.byPriority) {
        stats.byPriority[insight.priority as InsightPriority]++;
      }

      // Type counts
      if (insight.insight_type) {
        stats.byType[insight.insight_type] = (stats.byType[insight.insight_type] || 0) + 1;
      }
    }

    return { success: true, stats };
  } catch (error) {
    await logServerError(`Error getting insights stats: ${error instanceof Error ? error.message : String(error)}`, { action: 'insight_management.getInsightsStats' });
    return { success: false, error: 'An unexpected error occurred' };
  }
}
