'use server';

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamHealthData {
  rosterCount: number;
  rosterCapacity: number;
  eligibleCount: number;
  eligibilityPct: number;
  teamGpa: number | null;
  transferReadyCount: number;
  recentJoins: number;
}

export interface AcademicsOverview {
  teamGpa: number | null;
  atRiskCount: number;
  ineligibleCount: number;
  trend: 'up' | 'down' | 'stable';
}

export interface DevPlanProgressItem {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  completedGoals: number;
  totalGoals: number;
  progressPct: number;
  hasOverdue: boolean;
  nextGoalTitle: string | null;
}

export interface AttentionItem {
  type: 'academic_risk' | 'declining_stats' | 'overdue_goals' | 'no_video';
  count: number;
  playerIds: string[];
  description: string;
}

export interface TeamStatsTrendPoint {
  date: string;
  teamAvg: number | null;
  exitVelo: number | null;
  obp: number | null;
}

export interface CollegeInterestItem {
  schoolName: string;
  schoolLogo: string | null;
  playerId: string;
  playerName: string;
  viewCount: number;
  isWatchlisted: boolean;
  lastViewed: string;
}

export interface CollegeInterestSummary {
  totalProfileViews: number;
  profileViewsChange: number;
  schoolsInterested: number;
  watchlistAdds: number;
  topInterest: CollegeInterestItem[];
}

export interface TeamActivity {
  id: string;
  type: 'video_upload' | 'goal_completed' | 'stats_uploaded' | 'player_joined' | 'message';
  playerId: string | null;
  playerName: string | null;
  description: string;
  timestamp: string;
}

export interface TeamDashboardData {
  health: TeamHealthData;
  academics: AcademicsOverview;
  devPlanProgress: DevPlanProgressItem[];
  attentionItems: AttentionItem[];
  statsTrend: TeamStatsTrendPoint[];
  collegeInterest: CollegeInterestSummary;
  recentActivity: TeamActivity[];
  upcomingEvents: Array<{
    id: string;
    title: string;
    eventType: string;
    startTime: string;
  }>;
  pendingTasks: number;
  unreadMessages: number;
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

async function requireCoachAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' as const };
  }

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id, coach_type')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { error: 'Coach profile not found' as const };
  }

  return { user, coach, supabase };
}

async function getCoachTeamId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  organizationId: string | null
): Promise<string | null> {
  // First check if coach is head coach of a team
  const { data: headCoachTeam } = await supabase
    .from('baseball_teams')
    .select('id')
    .eq('head_coach_id', coachId)
    .single();

  if (headCoachTeam) return headCoachTeam.id;

  // Check staff membership
  const { data: staffTeam } = await supabase
    .from('baseball_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId)
    .eq('is_primary', true)
    .single();

  if (staffTeam) return staffTeam.team_id;

  // Fall back to organization's first team
  if (organizationId) {
    const { data: orgTeam } = await supabase
      .from('baseball_teams')
      .select('id')
      .eq('organization_id', organizationId)
      .limit(1)
      .single();

    if (orgTeam) return orgTeam.id;
  }

  return null;
}

// ============================================================================
// CONSOLIDATED DASHBOARD FETCH
// ============================================================================

export async function getTeamDashboardData(teamId?: string): Promise<
  { success: true; data: TeamDashboardData } | { success: false; error: string }
> {
  const auth = await requireCoachAuth();
  if ('error' in auth) return { success: false, error: auth.error as string };

  const { supabase, coach } = auth;

  // Get team ID if not provided
  let resolvedTeamId = teamId ?? null;
  if (!resolvedTeamId) {
    resolvedTeamId = await getCoachTeamId(supabase, coach.id, coach.organization_id ?? null);
  }

  if (!resolvedTeamId) {
    return { success: false, error: 'No team found' };
  }

  try {
    const currentTeamId = resolvedTeamId;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel fetch core data
    const [
      rosterResult,
      recentJoinsResult,
      playerDataResult,
      eventsResult,
      devPlansResult,
      videosResult,
    ] = await Promise.all([
      // Total roster count
      supabase
        .from('baseball_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', currentTeamId)
        .eq('status', 'active'),

      // Recent joins
      supabase
        .from('baseball_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', currentTeamId)
        .gte('joined_at', sevenDaysAgo),

      // Players with data
      supabase
        .from('baseball_team_members')
        .select(`
          player_id,
          joined_at,
          player:baseball_players (
            id,
            first_name,
            last_name,
            avatar_url,
            recruiting_activated,
            gpa
          )
        `)
        .eq('team_id', currentTeamId)
        .eq('status', 'active'),

      // Upcoming events
      supabase
        .from('baseball_events')
        .select('id, title, event_type, start_time')
        .eq('team_id', currentTeamId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(5),

      // Dev plans
      supabase
        .from('baseball_developmental_plans')
        .select(`
          id,
          player_id,
          goals,
          status,
          player:baseball_players (
            id,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .eq('coach_id', coach.id)
        .in('status', ['sent', 'in_progress'])
        .limit(10),

      // Recent videos
      supabase
        .from('baseball_videos')
        .select('id, player_id, title, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Process roster data
    const players = (playerDataResult.data || []) as Array<{
      player_id: string;
      joined_at: string | null;
      player: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        recruiting_activated: boolean;
        gpa: number | null;
      } | null;
    }>;

    const rosterCount = rosterResult.count || 0;
    const recentJoins = recentJoinsResult.count || 0;

    // Calculate team health metrics
    let eligibleCount = 0;
    let transferReadyCount = 0;
    let totalGpa = 0;
    let gpaCount = 0;
    let atRiskCount = 0;
    let ineligibleCount = 0;

    const playerIds: string[] = [];
    const playerMap = new Map<string, string>();

    for (const member of players) {
      playerIds.push(member.player_id);
      const player = member.player;
      if (!player) continue;

      const name = [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Unknown';
      playerMap.set(player.id, name);

      if (player.gpa && player.gpa >= 2.0) {
        eligibleCount++;
      }
      if (player.gpa && player.gpa < 2.0) {
        ineligibleCount++;
      } else if (player.gpa && player.gpa < 2.5) {
        atRiskCount++;
      }
      if (player.recruiting_activated) {
        transferReadyCount++;
      }
      if (player.gpa) {
        totalGpa += player.gpa;
        gpaCount++;
      }
    }

    const teamGpa = gpaCount > 0 ? Math.round((totalGpa / gpaCount) * 100) / 100 : null;
    const eligibilityPct = rosterCount > 0 ? Math.round((eligibleCount / rosterCount) * 100) : 0;

    // Process dev plans
    const now = new Date();
    const devPlanProgress: DevPlanProgressItem[] = [];
    const overduePlayerIds = new Set<string>();

    for (const plan of devPlansResult.data || []) {
      const planData = plan as {
        id: string;
        player_id: string;
        goals: Array<{ id: string; title: string; status: string; target_date?: string }> | null;
        player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
      };

      if (!planData.player) continue;

      const goals = planData.goals || [];
      const totalGoals = goals.length;
      const completedGoals = goals.filter(g => g.status === 'completed').length;
      const progressPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

      const hasOverdue = goals.some(g => {
        if (g.status === 'completed') return false;
        if (!g.target_date) return false;
        return new Date(g.target_date) < now;
      });

      if (hasOverdue) {
        overduePlayerIds.add(planData.player_id);
      }

      const nextGoal = goals.find(g => g.status !== 'completed');

      devPlanProgress.push({
        playerId: planData.player.id,
        playerName: [planData.player.first_name, planData.player.last_name].filter(Boolean).join(' ') || 'Unknown',
        avatarUrl: planData.player.avatar_url,
        completedGoals,
        totalGoals,
        progressPct,
        hasOverdue,
        nextGoalTitle: nextGoal?.title || null,
      });
    }

    devPlanProgress.sort((a, b) => a.progressPct - b.progressPct);

    // Build attention items
    const attentionItems: AttentionItem[] = [];

    const academicRiskPlayers = players
      .filter(m => m.player?.gpa && m.player.gpa < 2.5)
      .map(m => m.player_id);

    if (academicRiskPlayers.length > 0) {
      attentionItems.push({
        type: 'academic_risk',
        count: academicRiskPlayers.length,
        playerIds: academicRiskPlayers,
        description: 'GPA below 2.5 threshold',
      });
    }

    if (overduePlayerIds.size > 0) {
      attentionItems.push({
        type: 'overdue_goals',
        count: overduePlayerIds.size,
        playerIds: Array.from(overduePlayerIds),
        description: 'Dev plan goals past due date',
      });
    }

    // Players without videos
    const videosData = videosResult.data || [];
    const playersWithVideos = new Set(videosData.map(v => v.player_id));
    const playersWithoutVideos = playerIds.filter(id => !playersWithVideos.has(id));

    if (playersWithoutVideos.length > 0) {
      attentionItems.push({
        type: 'no_video',
        count: playersWithoutVideos.length,
        playerIds: playersWithoutVideos,
        description: 'No highlight video uploaded',
      });
    }

    attentionItems.sort((a, b) => b.count - a.count);

    // Build recent activity
    const recentActivity: TeamActivity[] = [];

    for (const video of videosData) {
      if (!video.created_at) continue;
      recentActivity.push({
        id: `video-${video.id}`,
        type: 'video_upload',
        playerId: video.player_id,
        playerName: playerMap.get(video.player_id) || 'Unknown',
        description: `uploaded video "${video.title}"`,
        timestamp: video.created_at,
      });
    }

    for (const member of players) {
      if (member.joined_at && new Date(member.joined_at) > new Date(sevenDaysAgo)) {
        recentActivity.push({
          id: `join-${member.player_id}`,
          type: 'player_joined',
          playerId: member.player_id,
          playerName: playerMap.get(member.player_id) || 'Unknown',
          description: 'joined the team',
          timestamp: member.joined_at,
        });
      }
    }

    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Build response
    const data: TeamDashboardData = {
      health: {
        rosterCount,
        rosterCapacity: 35,
        eligibleCount,
        eligibilityPct,
        teamGpa,
        transferReadyCount,
        recentJoins,
      },
      academics: {
        teamGpa,
        atRiskCount,
        ineligibleCount,
        trend: 'stable',
      },
      devPlanProgress: devPlanProgress.slice(0, 5),
      attentionItems,
      statsTrend: [], // Simplified - would need stats query
      collegeInterest: {
        totalProfileViews: 0,
        profileViewsChange: 0,
        schoolsInterested: 0,
        watchlistAdds: 0,
        topInterest: [],
      },
      recentActivity: recentActivity.slice(0, 10),
      upcomingEvents: (eventsResult.data || []).map(e => ({
        id: e.id,
        title: e.title,
        eventType: e.event_type,
        startTime: e.start_time,
      })),
      pendingTasks: 0,
      unreadMessages: 0,
    };

    return { success: true, data };
  } catch (error) {
    console.error('[getTeamDashboardData] Error:', error);
    return { success: false, error: 'Failed to fetch dashboard data' };
  }
}
