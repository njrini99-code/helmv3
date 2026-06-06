'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerRecruitingSnapshot {
  profileViews: number;
  profileViewsChange: number;
  watchlistCount: number;
  videoViews: number;
  unreadMessages: number;
  schoolsInterested: SchoolInterest[];
}

export interface SchoolInterest {
  schoolId: string;
  schoolName: string;
  schoolLogo: string | null;
  division: string | null;
  state: string | null;
  engagementCount: number;
  isOnWatchlist: boolean;
  lastEngagement: string;
}

export interface PlayerTeamData {
  teamId: string | null;
  teamName: string | null;
  coachName: string | null;
  rosterCount: number;
  devPlanProgress: number | null;
  nextGoalTitle: string | null;
  upcomingEventsCount: number;
  pendingTasksCount: number;
  unreadAnnouncementsCount: number;
}

export interface PlayerStats {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  exitVelo: number | null;
  sessionsCount: number;
  recentTrend: 'up' | 'down' | 'stable' | null;
}

export interface JucoPlayerDashboardData {
  player: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    position: string | null;
    gradYear: number | null;
    gpa: number | null;
    recruitingActivated: boolean;
    profileCompletionPercent: number | null;
  };
  team: PlayerTeamData;
  stats: PlayerStats;
  recruitingSnapshot: PlayerRecruitingSnapshot;
  recentAnnouncements: Array<{
    id: string;
    title: string;
    urgency: string;
    publishedAt: string | null;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    eventType: string;
    startTime: string;
  }>;
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

async function requirePlayerAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' as const };
  }

  const { data: player } = await supabase
    .from('baseball_players')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { error: 'Player profile not found' as const };
  }

  return { user, player, supabase };
}

// ============================================================================
// RECRUITING SNAPSHOT
// ============================================================================

export async function getPlayerRecruitingSnapshot(playerId: string): Promise<
  { success: true; data: PlayerRecruitingSnapshot } | { success: false; error: string }
> {
  const auth = await requirePlayerAuth();
  if ('error' in auth) return { success: false, error: auth.error as string };

  const { supabase } = auth;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      recentViewsResult,
      previousViewsResult,
      watchlistResult,
      videoViewsResult,
      messagesResult,
      engagementResult,
    ] = await Promise.all([
      // Profile views (last 7 days)
      supabase
        .from('baseball_player_engagement_events')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('engagement_type', 'profile_view')
        .gte('created_at', sevenDaysAgo),

      // Profile views (7-14 days ago for comparison)
      supabase
        .from('baseball_player_engagement_events')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('engagement_type', 'profile_view')
        .gte('created_at', fourteenDaysAgo)
        .lt('created_at', sevenDaysAgo),

      // Watchlist count
      supabase
        .from('baseball_watchlists')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId),

      // Video views
      supabase
        .from('baseball_player_engagement_events')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('engagement_type', 'video_view'),

      // Unread messages
      fromUntyped(supabase, 'baseball_messages')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', auth.user.id)
        .eq('is_read', false),

      // School engagement (last 30 days)
      supabase
        .from('baseball_player_engagement_events')
        .select(`
          coach_id,
          engagement_type,
          created_at,
          coach:baseball_coaches!coach_id (
            id,
            school_name,
            program_division,
            state
          )
        `)
        .eq('player_id', playerId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const profileViews = recentViewsResult.count || 0;
    const previousViews = previousViewsResult.count || 0;
    const profileViewsChange = previousViews > 0
      ? Math.round(((profileViews - previousViews) / previousViews) * 100)
      : profileViews > 0 ? 100 : 0;

    // Build schools interested map
    const schoolMap = new Map<string, SchoolInterest>();
    const watchlistCoachIds = new Set<string>();

    // Get watchlist coach IDs
    const { data: watchlistData } = await supabase
      .from('baseball_watchlists')
      .select('coach_id')
      .eq('player_id', playerId);

    for (const w of watchlistData || []) {
      watchlistCoachIds.add(w.coach_id);
    }

    // Process engagement events
    for (const event of (engagementResult.data || []) as Array<{
      coach_id: string;
      engagement_type: string;
      created_at: string;
      coach: { id: string; school_name: string | null; program_division: string | null; state: string | null } | null;
    }>) {
      const coachData = event.coach;
      if (!coachData?.school_name) continue;

      const schoolId = coachData.id;
      if (!schoolMap.has(schoolId)) {
        schoolMap.set(schoolId, {
          schoolId,
          schoolName: coachData.school_name,
          schoolLogo: null,
          division: coachData.program_division,
          state: coachData.state,
          engagementCount: 0,
          isOnWatchlist: watchlistCoachIds.has(event.coach_id),
          lastEngagement: event.created_at,
        });
      }

      const entry = schoolMap.get(schoolId)!;
      entry.engagementCount++;
      if (event.engagement_type === 'watchlist_add') {
        entry.isOnWatchlist = true;
      }
    }

    // Sort by engagement and take top 5
    const schoolsInterested = Array.from(schoolMap.values())
      .sort((a, b) => {
        // Watchlist first, then by engagement count
        if (a.isOnWatchlist !== b.isOnWatchlist) return a.isOnWatchlist ? -1 : 1;
        return b.engagementCount - a.engagementCount;
      })
      .slice(0, 5);

    return {
      success: true,
      data: {
        profileViews,
        profileViewsChange,
        watchlistCount: watchlistResult.count || 0,
        videoViews: videoViewsResult.count || 0,
        unreadMessages: messagesResult.count || 0,
        schoolsInterested,
      },
    };
  } catch (error) {
    await logServerError(`[getPlayerRecruitingSnapshot] Error: ${error instanceof Error ? error.message : String(error)}`, { action: 'player_dashboard.getPlayerRecruitingSnapshot' });
    return { success: false, error: 'Failed to fetch recruiting snapshot' };
  }
}

// ============================================================================
// FULL JUCO PLAYER DASHBOARD
// ============================================================================

export async function getJucoPlayerDashboardData(): Promise<
  { success: true; data: JucoPlayerDashboardData } | { success: false; error: string }
> {
  const auth = await requirePlayerAuth();
  if ('error' in auth) return { success: false, error: auth.error as string };

  const { supabase, player, user } = auth;

  try {
    // Get player's team
    const { data: teamMembership } = await supabase
      .from('baseball_team_members')
      .select(`
        team_id,
        team:baseball_teams (
          id,
          name
        )
      `)
      .eq('player_id', player.id)
      .eq('status', 'active')
      .single();

    const teamId = teamMembership?.team_id || null;
    const teamData = teamMembership?.team as {
      id: string;
      name: string;
    } | null;

    // Get coach name separately if team exists
    let coachName: string | null = null;
    if (teamId) {
      const { data: coachData } = await supabase
        .from('baseball_team_coach_staff')
        .select('coach:baseball_coaches(full_name)')
        .eq('team_id', teamId)
        .eq('is_primary', true)
        .single();
      
      const coach = coachData?.coach as { full_name: string | null } | null;
      coachName = coach?.full_name || null;
    }

    // Parallel fetch all data
    const [
      recruitingResult,
      devPlanResult,
      aggregatesResult,
      eventsResult,
      tasksResult,
      announcementsResult,
      rosterCountResult,
    ] = await Promise.all([
      // Recruiting snapshot
      getPlayerRecruitingSnapshot(player.id),

      // Dev plan
      supabase
        .from('baseball_developmental_plans')
        .select('goals, status')
        .eq('player_id', player.id)
        .in('status', ['sent', 'in_progress'])
        .single(),

      // Player aggregates (stats)
      supabase
        .from('baseball_player_aggregates')
        .select('career_avg, recent_obp, recent_slg, recent_exit_velo, sessions_count, recent_trend')
        .eq('player_id', player.id)
        .single(),

      // Upcoming events
      teamId
        ? supabase
            .from('baseball_events')
            .select('id, title, event_type, start_time')
            .eq('team_id', teamId)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(5)
        : Promise.resolve({ data: [] }),

      // Pending tasks
      fromUntyped(supabase, 'baseball_task_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .eq('status', 'pending'),

      // Unread announcements
      teamId
        ? fromUntyped(supabase, 'baseball_announcements')
            .select('id, title, urgency, published_at')
            .eq('team_id', teamId)
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),

      // Roster count
      teamId
        ? supabase
            .from('baseball_team_members')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .eq('status', 'active')
        : Promise.resolve({ count: 0 }),
    ]);

    // Process dev plan progress
    let devPlanProgress: number | null = null;
    let nextGoalTitle: string | null = null;

    if (devPlanResult.data?.goals) {
      const goals = devPlanResult.data.goals as Array<{ title: string; status: string }>;
      const completed = goals.filter(g => g.status === 'completed').length;
      devPlanProgress = goals.length > 0 ? Math.round((completed / goals.length) * 100) : null;
      const nextGoal = goals.find(g => g.status !== 'completed');
      nextGoalTitle = nextGoal?.title || null;
    }

    // Process stats
    const agg = aggregatesResult.data as {
      career_avg: number | null;
      recent_obp: number | null;
      recent_slg: number | null;
      recent_exit_velo: number | null;
      sessions_count: number | null;
      recent_trend: string | null;
    } | null;

    const stats: PlayerStats = {
      avg: agg?.career_avg || null,
      obp: agg?.recent_obp || null,
      slg: agg?.recent_slg || null,
      ops: (agg?.recent_obp && agg?.recent_slg) ? agg.recent_obp + agg.recent_slg : null,
      exitVelo: agg?.recent_exit_velo || null,
      sessionsCount: agg?.sessions_count || 0,
      recentTrend: (agg?.recent_trend as 'up' | 'down' | 'stable') || null,
    };

    // Build response
    const data: JucoPlayerDashboardData = {
      player: {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        avatarUrl: player.avatar_url,
        position: player.primary_position,
        gradYear: player.grad_year,
        gpa: player.gpa,
        recruitingActivated: player.recruiting_activated ?? false,
        profileCompletionPercent: player.profile_completion_percent,
      },
      team: {
        teamId,
        teamName: teamData?.name || null,
        coachName,
        rosterCount: rosterCountResult.count || 0,
        devPlanProgress,
        nextGoalTitle,
        upcomingEventsCount: eventsResult.data?.length || 0,
        pendingTasksCount: tasksResult.count || 0,
        unreadAnnouncementsCount: 0, // Would need acknowledgment tracking
      },
      stats,
      recruitingSnapshot: recruitingResult.success ? recruitingResult.data : {
        profileViews: 0,
        profileViewsChange: 0,
        watchlistCount: 0,
        videoViews: 0,
        unreadMessages: 0,
        schoolsInterested: [],
      },
      recentAnnouncements: (announcementsResult.data || []).map((a: { id: string; title: string; urgency: string | null; published_at: string | null }) => ({
        id: a.id,
        title: a.title,
        urgency: a.urgency,
        publishedAt: a.published_at,
      })),
      upcomingEvents: (eventsResult.data || []).map(e => ({
        id: e.id,
        title: e.title,
        eventType: e.event_type,
        startTime: e.start_time,
      })),
    };

    return { success: true, data };
  } catch (error) {
    await logServerError(`[getJucoPlayerDashboardData] Error: ${error instanceof Error ? error.message : String(error)}`, { action: 'player_dashboard.getJucoPlayerDashboardData' });
    return { success: false, error: 'Failed to fetch dashboard data' };
  }
}
