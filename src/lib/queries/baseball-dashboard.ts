/**
 * Consolidated data fetching for Baseball Dashboard
 *
 * This module reduces the N+1 query pattern by:
 * 1. Fetching all dashboard data in parallel with Promise.all
 * 2. Using batch lookups instead of per-item queries
 * 3. Only selecting needed columns
 *
 * Query reduction: ~15+ sequential queries → 5-7 parallel queries
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineStage, Player } from '@/lib/types';

// Local watchlist type for dashboard (mirrors WatchlistWithPlayer structure)
export interface DashboardWatchlistItem {
  id: string;
  coach_id: string;
  player_id: string;
  pipeline_stage: PipelineStage;
  notes: string | null;
  priority: number | null;
  tags: string[] | null;
  added_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_contact: string | null;
  player: Partial<Player> | null;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CoachDashboardStats {
  profileViews: number;
  profileViewsChange: number;
  watchlistCount: number;
  unreadMessages: number;
  committedCount: number;
}

export interface PlayerDashboardStats {
  profileViews: number;
  profileViewsChange: number;
  watchlistCount: number;
  videoViews: number;
  unreadMessages: number;
}

export interface ActivityEvent {
  id: string;
  player_id: string;
  coach_id?: string;
  engagement_type: 'profile_view' | 'watchlist_add' | 'video_view' | 'message_sent';
  engagement_date: string;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    primary_position?: string;
    avatar_url?: string;
  };
}

export interface ChartDataPoint {
  date: string;
  views: number;
  watchlistAdds: number;
}

// Pipeline counts for dashboard display (subset of all stages)
export interface DashboardPipelineCounts {
  watchlist: number;
  high_priority: number;
  offer_extended: number;
  committed: number;
  uninterested: number;
}

export interface CoachDashboardData {
  watchlist: DashboardWatchlistItem[];
  stats: CoachDashboardStats;
  activities: ActivityEvent[];
  chartData: ChartDataPoint[];
  pipelineCounts: DashboardPipelineCounts;
}

export interface PlayerDashboardData {
  stats: PlayerDashboardStats;
}

// ============================================================================
// COACH DASHBOARD DATA
// ============================================================================

/**
 * Fetch all coach dashboard data in parallel
 * Reduces from ~15 sequential queries to 5-6 parallel batches
 */
export async function getCoachDashboardData(
  supabase: SupabaseClient,
  userId: string,
  coachId: string
): Promise<CoachDashboardData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // First batch: Get watchlist with full player details + conversation IDs for unread count
  const [watchlistResult, conversationsResult] = await Promise.all([
    supabase
      .from('baseball_watchlists')
      .select(`
        id,
        coach_id,
        player_id,
        pipeline_stage,
        notes,
        priority,
        tags,
        added_at,
        created_at,
        updated_at,
        last_contact,
        player:baseball_players(
          id, first_name, last_name, avatar_url,
          primary_position, secondary_position, grad_year,
          city, state, high_school_name, gpa,
          height_feet, height_inches, weight_lbs,
          pitch_velo, exit_velo, sixty_time,
          recruiting_activated
        )
      `)
      .eq('coach_id', coachId)
      .order('priority', { ascending: false }),
    supabase
      .from('baseball_conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId),
  ]);

  const watchlist = (watchlistResult.data || []) as unknown as DashboardWatchlistItem[];
  const convIds = conversationsResult.data?.map(c => c.conversation_id) || [];

  // Second batch: Stats queries in parallel
  const [
    viewsThisWeekResult,
    viewsLastWeekResult,
    unreadMessagesResult,
    chartWatchlistResult,
  ] = await Promise.all([
    // Profile views this week
    supabase
      .from('baseball_profile_views')
      .select('id', { count: 'exact', head: true })
      .eq('viewer_id', userId)
      .gte('created_at', weekAgo.toISOString()),
    // Profile views last week
    supabase
      .from('baseball_profile_views')
      .select('id', { count: 'exact', head: true })
      .eq('viewer_id', userId)
      .gte('created_at', twoWeeksAgo.toISOString())
      .lt('created_at', weekAgo.toISOString()),
    // Unread messages (only if user has conversations)
    convIds.length > 0
      ? supabase
          .from('baseball_messages')
          .select('id', { count: 'exact', head: true })
          .eq('read', false)
          .neq('sender_id', userId)
          .in('conversation_id', convIds)
      : Promise.resolve({ count: 0 }),
    // Chart data - watchlist adds in last 7 days
    supabase
      .from('baseball_watchlists')
      .select('id, created_at, updated_at')
      .eq('coach_id', coachId)
      .gte('created_at', sevenDaysAgo.toISOString()),
  ]);

  // Calculate stats from watchlist (already loaded)
  const watchlistCount = watchlist.length;
  const committedCount = watchlist.filter(w => w.pipeline_stage === 'committed').length;

  // Calculate pipeline counts from watchlist
  const pipelineCounts: DashboardPipelineCounts = {
    watchlist: watchlist.filter(w => w.pipeline_stage === 'watchlist').length,
    high_priority: watchlist.filter(w => w.pipeline_stage === 'high_priority').length,
    offer_extended: watchlist.filter(w => w.pipeline_stage === 'offer_extended').length,
    committed: committedCount,
    uninterested: watchlist.filter(w => w.pipeline_stage === 'uninterested').length,
  };

  // Transform watchlist to activity events (most recent 8)
  const activities: ActivityEvent[] = watchlist
    .slice(0, 8)
    .map(item => ({
      id: item.id,
      player_id: item.player_id,
      coach_id: item.coach_id,
      engagement_type: 'watchlist_add' as const,
      engagement_date: item.updated_at || item.created_at || new Date().toISOString(),
      player: item.player ? {
        id: item.player.id || '',
        first_name: item.player.first_name || '',
        last_name: item.player.last_name || '',
        primary_position: item.player.primary_position || undefined,
        avatar_url: item.player.avatar_url || undefined,
      } : undefined,
    }));

  // Generate chart data
  const chartData = generateChartData(chartWatchlistResult.data || [], 7);

  return {
    watchlist,
    stats: {
      profileViews: viewsThisWeekResult.count || 0,
      profileViewsChange: (viewsThisWeekResult.count || 0) - (viewsLastWeekResult.count || 0),
      watchlistCount,
      unreadMessages: unreadMessagesResult.count || 0,
      committedCount,
    },
    activities,
    chartData,
    pipelineCounts,
  };
}

// ============================================================================
// PLAYER DASHBOARD DATA
// ============================================================================

/**
 * Fetch all player dashboard data in parallel
 */
export async function getPlayerDashboardData(
  supabase: SupabaseClient,
  userId: string,
  playerId: string
): Promise<PlayerDashboardData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // First: Get conversation IDs for unread message count
  const { data: conversations } = await supabase
    .from('baseball_conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);
  const convIds = conversations?.map(c => c.conversation_id) || [];

  // All stats in parallel
  const [
    viewsThisWeekResult,
    viewsLastWeekResult,
    watchlistCountResult,
    videosResult,
    unreadMessagesResult,
  ] = await Promise.all([
    supabase
      .from('baseball_profile_views')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .gte('created_at', weekAgo.toISOString()),
    supabase
      .from('baseball_profile_views')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .gte('created_at', twoWeeksAgo.toISOString())
      .lt('created_at', weekAgo.toISOString()),
    supabase
      .from('baseball_watchlists')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId),
    supabase
      .from('baseball_videos')
      .select('view_count')
      .eq('player_id', playerId),
    convIds.length > 0
      ? supabase
          .from('baseball_messages')
          .select('id', { count: 'exact', head: true })
          .eq('read', false)
          .neq('sender_id', userId)
          .in('conversation_id', convIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const videoViews = videosResult.data?.reduce((sum, v) => sum + (v.view_count || 0), 0) || 0;

  return {
    stats: {
      profileViews: viewsThisWeekResult.count || 0,
      profileViewsChange: (viewsThisWeekResult.count || 0) - (viewsLastWeekResult.count || 0),
      watchlistCount: watchlistCountResult.count || 0,
      videoViews,
      unreadMessages: unreadMessagesResult.count || 0,
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate chart data for the last N days
 */
function generateChartData(
  watchlistEvents: Array<{ id: string; created_at: string; updated_at: string | null }>,
  days: number
): ChartDataPoint[] {
  const dataByDate: Record<string, { views: number; watchlistAdds: number }> = {};

  // Initialize all dates
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    if (dateStr) {
      dataByDate[dateStr] = { views: 0, watchlistAdds: 0 };
    }
  }

  // Count watchlist adds by date
  watchlistEvents.forEach(event => {
    if (!event.created_at) return;
    const dateStr = new Date(event.created_at).toISOString().split('T')[0];
    if (dateStr && dataByDate[dateStr]) {
      dataByDate[dateStr].watchlistAdds++;
    }
  });

  return Object.entries(dataByDate).map(([date, data]) => ({
    date,
    ...data,
  }));
}
