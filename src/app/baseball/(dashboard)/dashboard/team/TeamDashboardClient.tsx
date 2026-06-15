'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { StatCard } from '@/components/features/stat-card';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconUsers,
  IconVideo,
  IconCalendar,
  IconNote,
  IconChevronRight,
  IconBuilding,
  IconMessage,
  IconUser,
  IconBell,
  IconChart,
  IconTrendingUp,
  IconCheck,
  IconClock,
  IconClipboardList,
  IconTarget,
} from '@/components/icons';
import { joinTeamByCode } from '@/app/baseball/actions/teams';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getFullName, formatRelativeTime } from '@/lib/utils';
import { JucoTeamDashboard } from './JucoTeamDashboard';
import { JucoPlayerDashboard } from './JucoPlayerDashboard';

// ============================================================================
// TYPES
// ============================================================================

interface TeamMember {
  id: string;
  joined_at: string | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
  };
}

interface Event {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  urgency: string | null;
  is_pinned: boolean | null;
  published_at: string | null;
}

interface PlayerTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  category: string | null;
  assignment_status: string;
}

interface DevPlan {
  id: string;
  title: string;
  status: string;
  goals: DevPlanGoal[] | null;
}

interface DevPlanGoal {
  id: string;
  title: string;
  status: string;
  target_date?: string;
}

interface PlayerStats {
  batting_avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  sessions_count: number;
  recent_trend: 'up' | 'down' | 'stable';
}

interface TeamVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration: number | null;
  video_type: string | null;
  created_at: string | null;
  player: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

function StatCardSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 p-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton variant="text" width="50%" height={12} className="mb-3" />
          <Skeleton variant="text" width="40%" height={32} className="mb-2" />
          <div className="flex items-center gap-2 mt-3">
            <Skeleton variant="rectangular" width={16} height={16} className="rounded" />
            <Skeleton variant="text" width="60%" height={10} />
          </div>
        </div>
        <Skeleton variant="rectangular" width={40} height={40} className="rounded-xl" />
      </div>
    </div>
  );
}

function AnnouncementSkeleton() {
  return (
    <div className="p-4 border border-warm-200 rounded-lg animate-pulse">
      <div className="flex items-start gap-3">
        <Skeleton variant="rectangular" width={4} height={40} className="rounded-full" />
        <div className="flex-1">
          <Skeleton variant="text" width="70%" height={16} className="mb-2" />
          <Skeleton variant="text" width="90%" height={12} className="mb-1" />
          <Skeleton variant="text" width="40%" height={10} />
        </div>
      </div>
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 border border-warm-200 rounded-lg animate-pulse">
      <Skeleton variant="circular" width={12} height={12} />
      <div className="flex-1">
        <Skeleton variant="text" width="70%" height={14} className="mb-2" />
        <Skeleton variant="text" width="50%" height={12} />
      </div>
    </div>
  );
}

function TaskSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 border border-warm-200 rounded-lg animate-pulse">
      <Skeleton variant="circular" width={20} height={20} />
      <div className="flex-1">
        <Skeleton variant="text" width="60%" height={14} className="mb-1" />
        <Skeleton variant="text" width="40%" height={10} />
      </div>
      <Skeleton variant="rectangular" width={60} height={20} className="rounded-full" />
    </div>
  );
}

function QuickActionSkeleton() {
  return (
    <Skeleton variant="rectangular" className="w-full h-10 rounded-lg" />
  );
}

function VideoSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 border border-warm-200 rounded-lg animate-pulse">
      <Skeleton variant="rectangular" width={80} height={48} className="rounded-lg shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton variant="text" width="70%" height={14} className="mb-2" />
        <Skeleton variant="text" width="50%" height={12} />
      </div>
    </div>
  );
}

function PlayerHeaderSkeleton() {
  return (
    <Card variant="glass" className="mb-6">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 animate-pulse">
          <Skeleton variant="circular" width={80} height={80} className="shrink-0" />
          <div className="flex-1 w-full">
            <Skeleton variant="text" width="50%" height={28} className="mb-2" />
            <Skeleton variant="text" width="40%" height={16} className="mb-1" />
            <Skeleton variant="text" width="30%" height={14} className="mb-3" />
            <div className="flex gap-2">
              <Skeleton variant="rectangular" width={70} height={22} className="rounded-full" />
              <Skeleton variant="rectangular" width={100} height={22} className="rounded-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// NO TEAM CARD - Join Team Flow for Players Without a Team
// ============================================================================

function NoTeamCard({ playerId }: { playerId?: string }) {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoinTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim() || !playerId) return;

    setIsJoining(true);
    setError(null);

    try {
      const result = await joinTeamByCode(inviteCode.trim().toUpperCase(), playerId);
      
      if (!result.success) {
        // Map error messages to user-friendly versions
        const errorMessages: Record<string, string> = {
          'Invalid invite code': 'This invite code is invalid. Please check and try again.',
          'You are already a member of this team': "You're already on this team!",
          'College players can only be on one team': 'College players can only be on one team at a time.',
          'JUCO players can only be on one team': 'JUCO players can only be on one team at a time.',
          'This team is at capacity': 'This team has reached its maximum roster size.',
        };
        setError(errorMessages[result.error || ''] || result.error || 'Failed to join team');
        setIsJoining(false);
        return;
      }

      // Success - redirect to team dashboard (will refresh with new team)
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsJoining(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card variant="glass">
        <CardContent className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <IconUsers size={32} className="text-primary-600" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-warm-900 mb-2">
              Join Your Team
            </h2>
            <p className="text-warm-600 max-w-sm mx-auto">
              Enter the invite code from your coach to join your team and access team features.
            </p>
          </div>

          {/* Join Form */}
          <form onSubmit={handleJoinTeam} className="space-y-4">
            <div>
              <Input
                label="Team Invite Code"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="Enter code (e.g. ABC12345)"
                maxLength={20}
                className="text-center tracking-widest font-mono text-lg uppercase"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input in join-team dialog
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={!inviteCode.trim() || isJoining}
              isLoading={isJoining}
              className="w-full bg-primary-600 hover:bg-primary-700"
              size="lg"
            >
              <IconCheck size={18} className="mr-2" />
              Join Team
            </Button>
          </form>

          {/* Alternative Actions */}
          <div className="mt-8 pt-6 border-t border-warm-200">
            <p className="text-sm text-warm-500 text-center mb-4">
              Don't have an invite code?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/baseball/dashboard/profile" className="flex-1">
                <Button variant="secondary" className="w-full justify-center">
                  <IconUser size={16} className="mr-2" />
                  Complete Profile
                </Button>
              </Link>
              <Link href="/baseball/dashboard/videos" className="flex-1">
                <Button variant="secondary" className="w-full justify-center">
                  <IconVideo size={16} className="mr-2" />
                  Upload Videos
                </Button>
              </Link>
            </div>
            <p className="text-xs text-warm-400 text-center mt-4">
              Contact your coach for an invite code to join their team.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TeamDashboardClient() {
  const { user, coach, player, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  const [loading, setLoading] = useState(true);

  // Coach stats
  const [rosterCount, setRosterCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const [devPlanCount, setDevPlanCount] = useState(0);
  const [upcomingEventsCount, setUpcomingEventsCount] = useState(0);
  const [recentMembers, setRecentMembers] = useState<TeamMember[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  // Player stats
  const [playerDevPlan, setPlayerDevPlan] = useState<DevPlan | null>(null);
  const [playerTeamCount, setPlayerTeamCount] = useState(0);
  const [playerTasks, setPlayerTasks] = useState<PlayerTask[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [recentTeamVideos, setRecentTeamVideos] = useState<TeamVideo[]>([]);

  useEffect(() => {
    if (selectedTeamId && coach?.id && user?.role === 'coach') {
      fetchCoachTeamData();
    } else if (selectedTeamId && player?.id && user?.role === 'player') {
      fetchPlayerTeamData();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch functions only depend on selectedTeamId, coach.id, player.id which are already in deps
  }, [selectedTeamId, coach?.id, player?.id, user?.role]);

  async function fetchCoachTeamData() {
    if (!coach?.id || !selectedTeamId) return;

    const supabase = createClient();
    setLoading(true);

    // Fetch all stats in parallel
    const [
      rosterResult,
      videoResult,
      devPlanResult,
      eventsResult,
      recentMembersResult,
    ] = await Promise.all([
      // Roster count
      supabase
        .from('baseball_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', selectedTeamId),

      // Video count (from all team players)
      supabase
        .from('baseball_team_members')
        .select('player_id')
        .eq('team_id', selectedTeamId)
        .then(async ({ data: members }) => {
          if (!members || members.length === 0) return { count: 0 };
          const playerIds = members.map(m => m.player_id);
          return supabase
            .from('baseball_videos')
            .select('*', { count: 'exact', head: true })
            .in('player_id', playerIds);
        }),

      // Dev plan count
      supabase
        .from('baseball_developmental_plans')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .in('status', ['sent', 'in_progress']),

      // Upcoming events (next 7 days)
      supabase
        .from('baseball_events')
        .select('id, title, event_type, start_time')
        .eq('team_id', selectedTeamId)
        .gte('start_time', new Date().toISOString())
        .lte('start_time', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true })
        .limit(5),

      // Recent members (last 5)
      supabase
        .from('baseball_team_members')
        .select(`
          id,
          joined_at,
          player:baseball_players (
            id,
            first_name,
            last_name,
            avatar_url,
            primary_position
          )
        `)
        .eq('team_id', selectedTeamId)
        .order('joined_at', { ascending: false })
        .limit(5),
    ]);

    setRosterCount(rosterResult.count || 0);
    setVideoCount(videoResult.count || 0);
    setDevPlanCount(devPlanResult.count || 0);
    setUpcomingEventsCount(eventsResult.data?.length || 0);
    setRecentMembers(recentMembersResult.data as TeamMember[] || []);
    setUpcomingEvents(eventsResult.data || []);
    setLoading(false);
  }

  async function fetchPlayerTeamData() {
    if (!player?.id || !selectedTeamId) return;

    const supabase = createClient();
    setLoading(true);

    // Fetch player data in parallel
    const [
      devPlanResult,
      teamCountResult,
      eventsResult,
      tasksResult,
      announcementsResult,
      statsResult,
      rawStatsResult,
      teamVideosResult,
    ] = await Promise.all([
      // Player dev plan with goals
      supabase
        .from('baseball_developmental_plans')
        .select('id, title, status, goals')
        .eq('player_id', player.id)
        .in('status', ['sent', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Team member count
      supabase
        .from('baseball_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', selectedTeamId),

      // Upcoming events (next 5)
      supabase
        .from('baseball_events')
        .select('id, title, event_type, start_time')
        .eq('team_id', selectedTeamId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(5),

      // Player tasks (pending ones, limit 5)
      supabase
        .from('baseball_task_assignments')
        .select(`
          id,
          status,
          task:baseball_tasks (
            id,
            title,
            description,
            due_date,
            priority,
            category
          )
        `)
        .eq('player_id', player.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),

      // Team announcements (last 3)
      supabase
        .from('baseball_announcements')
        .select('id, title, content, urgency, is_pinned, published_at')
        .eq('team_id', selectedTeamId)
        .order('published_at', { ascending: false })
        .limit(3),

      // Player aggregated stats
      supabase
        .from('baseball_player_aggregates')
        .select('career_avg, recent_trend, total_sessions, last_5_avg')
        .eq('player_id', player.id)
        .single(),

      // Raw stats for computing OBP/SLG/OPS
      supabase
        .from('baseball_player_stats')
        .select('at_bats, hits, walks, doubles, triples, home_runs')
        .eq('player_id', player.id),

      // Recent team videos (last 3)
      supabase
        .from('baseball_videos')
        .select(`
          id,
          title,
          thumbnail_url,
          duration,
          video_type,
          created_at,
          player:baseball_players (
            first_name,
            last_name
          )
        `)
        .eq('team_id', selectedTeamId)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);
    
    // Process dev plan
    if (devPlanResult.data) {
      const plan = devPlanResult.data;
      // Parse JSON goals into typed array - use unknown cast for safety
      const rawGoals = (Array.isArray(plan.goals) ? plan.goals : []) as unknown as Array<Record<string, unknown>>;
      const parsedGoals: DevPlanGoal[] = rawGoals
        .filter((g) => g && typeof g === 'object' && 'id' in g)
        .map((goalObj) => ({
          id: String(goalObj.id ?? ''),
          title: String(goalObj.title ?? ''),
          status: String(goalObj.status ?? 'not_started') as DevPlanGoal['status'],
          target_date: goalObj.target_date ? String(goalObj.target_date) : undefined,
        }));
      setPlayerDevPlan({
        id: plan.id,
        title: plan.title ?? '',
        status: plan.status ?? 'draft',
        goals: parsedGoals,
      });
    } else {
      setPlayerDevPlan(null);
    }

    setPlayerTeamCount(teamCountResult.count || 0);
    setUpcomingEvents(eventsResult.data || []);

    // Process tasks
    const processedTasks: PlayerTask[] = (tasksResult.data || [])
      .filter((t: { task: unknown }) => t.task)
      .map((t: { id: string; status: string | null; task: { id: string; title: string; description: string | null; due_date: string | null; priority: string | null; category: string | null } }) => ({
        id: t.task.id,
        title: t.task.title,
        description: t.task.description,
        due_date: t.task.due_date,
        priority: t.task.priority,
        category: t.task.category,
        assignment_status: t.status || 'pending',
      }));
    setPlayerTasks(processedTasks);

    // Set announcements
    setAnnouncements(announcementsResult.data || []);

    // Process player aggregated stats and compute OBP/SLG/OPS from raw stats
    const aggregateData = statsResult.data;
    const rawStats = rawStatsResult.data || [];

    // Compute OBP, SLG, OPS from raw stats
    let obp: number | null = null;
    let slg: number | null = null;
    let ops: number | null = null;

    if (rawStats.length > 0) {
      // Aggregate all raw stats to compute slash line
      let totalAB = 0;
      let totalHits = 0;
      let totalWalks = 0;
      let totalDoubles = 0;
      let totalTriples = 0;
      let totalHR = 0;

      for (const s of rawStats) {
        totalAB += s.at_bats || 0;
        totalHits += s.hits || 0;
        totalWalks += s.walks || 0;
        totalDoubles += s.doubles || 0;
        totalTriples += s.triples || 0;
        totalHR += s.home_runs || 0;
      }

      const singles = totalHits - totalDoubles - totalTriples - totalHR;
      const plateAppearances = totalAB + totalWalks; // Simplified PA (not including HBP, SF, etc.)

      if (plateAppearances > 0) {
        // OBP = (H + BB) / PA
        obp = (totalHits + totalWalks) / plateAppearances;
      }

      if (totalAB > 0) {
        // SLG = Total Bases / AB
        const totalBases = singles + (totalDoubles * 2) + (totalTriples * 3) + (totalHR * 4);
        slg = totalBases / totalAB;
      }

      if (obp !== null && slg !== null) {
        ops = obp + slg;
      }
    }

    if (aggregateData) {
      const trendMap: Record<string, 'up' | 'down' | 'stable'> = {
        'improving': 'up',
        'declining': 'down',
        'stable': 'stable',
      };
      setPlayerStats({
        batting_avg: aggregateData.career_avg,
        obp,
        slg,
        ops,
        sessions_count: aggregateData.total_sessions || 0,
        recent_trend: trendMap[aggregateData.recent_trend || 'stable'] || 'stable',
      });
    } else {
      setPlayerStats(null);
    }

    // Process team videos
    setRecentTeamVideos(teamVideosResult.data as TeamVideo[] || []);

    setLoading(false);
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getEventColor = (type: string) => {
    switch (type) {
      case 'practice': return 'bg-blue-500';
      case 'game': return 'bg-primary-500';
      case 'tournament': return 'bg-purple-500';
      case 'meeting': return 'bg-amber-500';
      default: return 'bg-warm-400';
    }
  };

  const formatEventDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getUrgencyColor = (urgency: string | null) => {
    switch (urgency) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-warm-400';
      default: return 'bg-blue-500';
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case 'high': return <Badge variant="danger">High</Badge>;
      case 'normal': return <Badge variant="default">Normal</Badge>;
      case 'low': return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="secondary">Normal</Badge>;
    }
  };

  const formatDueDate = (date: string | null) => {
    if (!date) return null;
    const due = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Calculate dev plan progress
  const devPlanProgress = playerDevPlan?.goals?.length
    ? Math.round(
        (playerDevPlan.goals.filter(g => g.status === 'completed').length /
          playerDevPlan.goals.length) *
          100
      )
    : 0;

  const nextGoal = playerDevPlan?.goals?.find(g => g.status !== 'completed');

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (authLoading) {
    return (
      <>
        <Header title="Team Dashboard" subtitle="Loading..." />
        <div className="p-4 sm:p-6 lg:p-8">
          <PlayerHeaderSkeleton />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card variant="glass">
                <CardHeader><Skeleton variant="text" width={150} height={20} /></CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3].map(i => <AnnouncementSkeleton key={i} />)}
                </CardContent>
              </Card>
            </div>
            <div className="space-y-6">
              <Card variant="glass">
                <CardHeader><Skeleton variant="text" width={120} height={18} /></CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3, 4].map(i => <QuickActionSkeleton key={i} />)}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ============================================================================
  // COACH DASHBOARD
  // ============================================================================

  if (user?.role === 'coach') {
    // Use premium dashboard for JUCO coaches
    if (coach?.coach_type === 'juco') {
      return (
        <JucoTeamDashboard
          coachName={coach.full_name || 'Coach'}
          coachType={coach.coach_type}
          organizationName={(coach.organization as { name?: string })?.name}
          teamId={selectedTeamId || undefined}
        />
      );
    }

    // Existing dashboard for other coach types (HS, showcase)
    return (
      <>
        <Header
          title="Team Dashboard"
          subtitle={`${(coach?.organization as { name?: string })?.name || 'Your Team'} - ${coach?.coach_type?.replace('_', ' ').toUpperCase()}`}
        />
        <div className="p-4 sm:p-6 lg:p-8">
          {loading ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Card variant="glass">
                    <CardHeader><Skeleton variant="text" width={180} height={20} /></CardHeader>
                    <CardContent className="space-y-3">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center gap-3 p-3 border border-warm-200 rounded-lg animate-pulse">
                          <Skeleton variant="circular" width={40} height={40} />
                          <div className="flex-1">
                            <Skeleton variant="text" width="60%" className="mb-2" />
                            <Skeleton variant="text" width="40%" height={12} />
                          </div>
                          <Skeleton variant="rectangular" width={60} height={22} className="rounded-full" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-6">
                  <Card variant="glass">
                    <CardHeader><Skeleton variant="text" width={100} height={18} /></CardHeader>
                    <CardContent className="space-y-3">
                      {[1, 2, 3, 4, 5].map(i => <QuickActionSkeleton key={i} />)}
                    </CardContent>
                  </Card>
                  <Card variant="glass">
                    <CardHeader><Skeleton variant="text" width={130} height={18} /></CardHeader>
                    <CardContent className="space-y-3">
                      {[1, 2, 3].map(i => <EventSkeleton key={i} />)}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <StatCard
                  label="Roster Size"
                  value={rosterCount}
                  change="Active players"
                  icon={IconUsers}
                />
                <StatCard
                  label="Videos"
                  value={videoCount}
                  change="Total uploads"
                  icon={IconVideo}
                />
                <StatCard
                  label="Dev Plans"
                  value={devPlanCount}
                  change="Active plans"
                  icon={IconNote}
                />
                <StatCard
                  label="Upcoming"
                  value={upcomingEventsCount}
                  change="Events this week"
                  icon={IconCalendar}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Card variant="glass">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <h2 className="font-semibold text-warm-900">Recent Roster Activity</h2>
                      <Link href="/baseball/dashboard/roster" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                        View roster <IconChevronRight size={14} />
                      </Link>
                    </CardHeader>
                    <CardContent>
                      {recentMembers.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                            <IconUsers size={24} className="text-warm-400" />
                          </div>
                          <h3 className="text-lg font-medium text-warm-900 mb-2">No players yet</h3>
                          <p className="text-sm leading-relaxed text-warm-500 mb-4 max-w-sm mx-auto">
                            Start building your roster by inviting players to join your team.
                          </p>
                          <Link href="/baseball/dashboard/roster">
                            <Button>Manage Roster</Button>
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {recentMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center gap-3 p-3 border border-warm-200 rounded-lg hover:border-warm-300 transition-colors"
                            >
                              <Avatar
                                name={getFullName(member.player?.first_name, member.player?.last_name)}
                                src={member.player?.avatar_url || undefined}
                                size="sm"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-warm-900 truncate">
                                  {getFullName(member.player?.first_name, member.player?.last_name)}
                                </p>
                                <p className="text-sm leading-relaxed text-warm-500 truncate">
                                  {member.player?.primary_position} • Joined {member.joined_at ? formatRelativeTime(member.joined_at) : 'recently'}
                                </p>
                              </div>
                              <Badge variant="success" className="shrink-0">Active</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card variant="glass">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <h2 className="font-semibold text-warm-900">Quick Actions</h2>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Link href="/baseball/dashboard/roster" className="block">
                        <Button variant="secondary" className="w-full justify-start">
                          <IconUsers size={16} className="mr-2" /> Manage Roster
                        </Button>
                      </Link>
                      <Link href="/baseball/dashboard/videos" className="block">
                        <Button variant="secondary" className="w-full justify-start">
                          <IconVideo size={16} className="mr-2" /> Video Library
                        </Button>
                      </Link>
                      <Link href="/baseball/dashboard/dev-plans" className="block">
                        <Button variant="secondary" className="w-full justify-start">
                          <IconNote size={16} className="mr-2" /> Dev Plans
                        </Button>
                      </Link>
                      <Link href="/baseball/dashboard/calendar" className="block">
                        <Button variant="secondary" className="w-full justify-start">
                          <IconCalendar size={16} className="mr-2" /> Calendar
                        </Button>
                      </Link>
                      <Link href="/baseball/dashboard/program" className="block">
                        <Button variant="secondary" className="w-full justify-start">
                          <IconBuilding size={16} className="mr-2" /> Edit Program Profile
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>

                  <Card variant="glass">
                    <CardHeader>
                      <h2 className="font-semibold text-warm-900">Upcoming Events</h2>
                    </CardHeader>
                    <CardContent>
                      {upcomingEvents.length === 0 ? (
                        <div className="text-center py-8">
                          <IconCalendar size={32} className="text-warm-300 mx-auto mb-2" />
                          <p className="text-sm leading-relaxed text-warm-500">No upcoming events</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {upcomingEvents.map((event) => (
                            <div key={event.id} className="flex items-start gap-2">
                              <div className={`w-2 h-2 rounded-full mt-1.5 ${getEventColor(event.event_type)}`}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-warm-900 truncate">{event.title}</p>
                                <p className="text-xs text-warm-500">{formatEventDate(event.start_time)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  // ============================================================================
  // PLAYER DASHBOARD
  // ============================================================================

  // Use premium dashboard for JUCO players with recruiting activated
  if (player?.player_type === 'juco' && player?.recruiting_activated) {
    return (
      <JucoPlayerDashboard
        playerName={getFullName(player.first_name, player.last_name)}
        playerId={player.id}
      />
    );
  }

  // Existing dashboard for other player types
  return (
    <>
      <Header
        title="Team Dashboard"
        subtitle={`${player?.high_school_name || 'Your Team'}`}
      />
      <div className="p-4 sm:p-6 lg:p-8">
        {/* No Team State - Show join team card */}
        {!loading && !selectedTeamId ? (
          <NoTeamCard playerId={player?.id} />
        ) : loading ? (
          <>
            <PlayerHeaderSkeleton />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card variant="glass">
                  <CardHeader><Skeleton variant="text" width={180} height={20} /></CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3].map(i => <AnnouncementSkeleton key={i} />)}
                  </CardContent>
                </Card>
                <Card variant="glass">
                  <CardHeader><Skeleton variant="text" width={150} height={20} /></CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <EventSkeleton key={i} />)}
                  </CardContent>
                </Card>
                <Card variant="glass">
                  <CardHeader><Skeleton variant="text" width={160} height={20} /></CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3].map(i => <VideoSkeleton key={i} />)}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-6">
                <Card variant="glass">
                  <CardHeader><Skeleton variant="text" width={120} height={18} /></CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3, 4].map(i => <TaskSkeleton key={i} />)}
                  </CardContent>
                </Card>
                <Card variant="glass">
                  <CardHeader><Skeleton variant="text" width={100} height={18} /></CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map(i => <QuickActionSkeleton key={i} />)}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Player Header Card */}
            <Card variant="glass" className="mb-6">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                  <Avatar 
                    name={getFullName(player?.first_name, player?.last_name)} 
                    size="2xl" 
                    src={player?.avatar_url} 
                    className="shrink-0"
                  />
                  <div className="flex-1 w-full">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-warm-900">
                          {player?.first_name} {player?.last_name}
                        </h2>
                        <p className="text-warm-500">
                          {player?.primary_position} • Class of {player?.grad_year}
                        </p>
                        <p className="text-sm leading-relaxed text-warm-400 mt-1">
                          {player?.high_school_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 sm:mt-4">
                      <Badge variant="default">
                        {player?.player_type?.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {player?.recruiting_activated && (
                        <Badge variant="success">Recruiting Active</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* My Stats Card - AVG, OBP, SLG, OPS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {/* AVG */}
              <StatCard
                label="AVG"
                value={playerStats?.batting_avg 
                  ? `.${Math.round(playerStats.batting_avg * 1000).toString().padStart(3, '0')}`
                  : '---'}
                change={playerStats?.recent_trend === 'up' ? 'Trending up' : 
                        playerStats?.recent_trend === 'down' ? 'Needs work' : 
                        `${playerStats?.sessions_count || 0} sessions`}
                icon={IconChart}
              />
              
              {/* OBP */}
              <StatCard
                label="OBP"
                value={playerStats?.obp 
                  ? `.${Math.round(playerStats.obp * 1000).toString().padStart(3, '0')}`
                  : '---'}
                change="On-base pct"
                icon={IconTrendingUp}
              />

              {/* SLG */}
              <StatCard
                label="SLG"
                value={playerStats?.slg 
                  ? `.${Math.round(playerStats.slg * 1000).toString().padStart(3, '0')}`
                  : '---'}
                change="Slugging pct"
                icon={IconTarget}
              />

              {/* OPS */}
              <StatCard
                label="OPS"
                value={playerStats?.ops 
                  ? `.${Math.round(playerStats.ops * 1000).toString().padStart(3, '0')}`
                  : '---'}
                change="OBP + SLG"
                icon={IconChart}
              />
            </div>

            {/* Dev Plan Progress Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
              {/* Dev Plan Progress */}
              <StatCard
                label="Dev Plan"
                value={playerDevPlan ? `${devPlanProgress}%` : '---'}
                change={nextGoal?.title ? `Next: ${nextGoal.title}` : 'No active plan'}
                icon={IconTarget}
              />
              
              {/* Sessions */}
              <StatCard
                label="Sessions"
                value={playerStats?.sessions_count || 0}
                change="Total recorded"
                icon={IconTrendingUp}
              />

              {/* Team Members */}
              <StatCard
                label="Team"
                value={playerTeamCount}
                change="Members"
                icon={IconUsers}
              />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Recent Announcements */}
                <Card variant="glass">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <h2 className="font-semibold text-warm-900">Team Announcements</h2>
                    <Link href="/baseball/dashboard/announcements" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                      View all <IconChevronRight size={14} />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {announcements.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                          <IconBell size={24} className="text-warm-400" />
                        </div>
                        <h3 className="text-lg font-medium text-warm-900 mb-2">No announcements</h3>
                        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
                          Team announcements from your coach will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {announcements.map((announcement) => (
                          <Link
                            key={announcement.id}
                            href={`/baseball/dashboard/announcements`}
                            className="block p-3 sm:p-4 border border-warm-200 rounded-lg hover:border-warm-300 hover:bg-warm-50/50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-1 h-full min-h-[40px] rounded-full ${getUrgencyColor(announcement.urgency)}`}></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium text-warm-900 truncate">{announcement.title}</p>
                                  {announcement.is_pinned && (
                                    <Badge variant="warning" className="shrink-0 text-xs">Pinned</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-warm-600 line-clamp-2 mt-1">
                                  {announcement.content}
                                </p>
                                <p className="text-xs text-warm-400 mt-2">
                                  {announcement.published_at ? formatRelativeTime(announcement.published_at) : ''}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Upcoming Events */}
                <Card variant="glass">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <h2 className="font-semibold text-warm-900">Upcoming Events</h2>
                    <Link href="/baseball/dashboard/calendar" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                      Full calendar <IconChevronRight size={14} />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {upcomingEvents.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                          <IconCalendar size={24} className="text-warm-400" />
                        </div>
                        <h3 className="text-lg font-medium text-warm-900 mb-2">No upcoming events</h3>
                        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
                          Team practices and games will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {upcomingEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-start gap-3 p-3 border border-warm-200 rounded-lg"
                          >
                            <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${getEventColor(event.event_type)}`}></div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-warm-900 truncate">{event.title}</p>
                              <p className="text-sm leading-relaxed text-warm-500">{formatEventDate(event.start_time)}</p>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                              {event.event_type}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Team Videos */}
                <Card variant="glass">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <h2 className="font-semibold text-warm-900">Recent Team Videos</h2>
                    <Link href="/baseball/dashboard/videos" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                      All videos <IconChevronRight size={14} />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {recentTeamVideos.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                          <IconVideo size={24} className="text-warm-400" />
                        </div>
                        <h3 className="text-lg font-medium text-warm-900 mb-2">No team videos</h3>
                        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
                          Team videos and highlights will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {recentTeamVideos.map((video) => (
                          <Link
                            key={video.id}
                            href={`/baseball/dashboard/videos/${video.id}`}
                            className="flex items-start gap-3 p-3 border border-warm-200 rounded-lg hover:border-warm-300 hover:bg-warm-50/50 transition-colors"
                          >
                            <div className="w-20 h-12 bg-warm-200 rounded-lg shrink-0 flex items-center justify-center overflow-hidden">
                              {video.thumbnail_url ? (
                                <img
                                  src={video.thumbnail_url}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <IconVideo size={20} className="text-warm-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-warm-900 truncate">{video.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {video.player && (
                                  <span className="text-xs text-warm-500">
                                    {getFullName(video.player.first_name, video.player.last_name)}
                                  </span>
                                )}
                                {video.duration && (
                                  <span className="text-xs text-warm-400">
                                    {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-warm-400 mt-1">
                                {video.created_at ? formatRelativeTime(video.created_at) : ''}
                              </p>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                              {video.video_type || 'video'}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Dev Plan Progress (Mobile: shows here, Desktop: in sidebar) */}
                <Card variant="glass" className="lg:hidden">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <h2 className="font-semibold text-warm-900">My Development Plan</h2>
                    <Link href="/baseball/dashboard/dev-plan" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                      View plan <IconChevronRight size={14} />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {!playerDevPlan ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                          <IconNote size={24} className="text-warm-400" />
                        </div>
                        <h3 className="text-lg font-medium text-warm-900 mb-2">No active plan</h3>
                        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
                          Your coach will create a personalized development plan for you.
                        </p>
                      </div>
                    ) : (
                      <div>
                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-warm-700">Progress</span>
                            <span className="text-sm font-semibold text-primary-600">{devPlanProgress}%</span>
                          </div>
                          <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary-500 rounded-full transition-all duration-500"
                              style={{ width: `${devPlanProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* Next Goal */}
                        {nextGoal && (
                          <div className="p-3 bg-primary-50 rounded-lg border border-primary-100">
                            <p className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-1">Next Goal</p>
                            <p className="font-medium text-warm-900">{nextGoal.title}</p>
                            {nextGoal.target_date && (
                              <p className="text-xs text-warm-500 mt-1">
                                Target: {new Date(nextGoal.target_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Goal Stats */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-warm-200">
                          <div className="flex items-center gap-2 text-sm text-warm-600">
                            <IconCheck size={16} className="text-primary-600" />
                            <span>{playerDevPlan.goals?.filter(g => g.status === 'completed').length || 0} completed</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-warm-600">
                            <IconClock size={16} className="text-amber-600" />
                            <span>{playerDevPlan.goals?.filter(g => g.status !== 'completed').length || 0} remaining</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Sidebar */}
              <div className="space-y-6">
                {/* My Tasks Due */}
                <Card variant="glass">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <h2 className="font-semibold text-warm-900">My Tasks</h2>
                    <Link href="/baseball/dashboard/tasks" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                      All tasks <IconChevronRight size={14} />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {playerTasks.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
                          <IconClipboardList size={20} className="text-warm-400" />
                        </div>
                        <p className="text-sm text-warm-500">No pending tasks</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {playerTasks.map((task) => (
                          <Link
                            key={task.id}
                            href="/baseball/dashboard/tasks"
                            className="flex items-center gap-3 p-2.5 border border-warm-200 rounded-lg hover:border-warm-300 hover:bg-warm-50/50 transition-colors"
                          >
                            <div className="w-5 h-5 rounded-full border-2 border-warm-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-warm-900 truncate">{task.title}</p>
                              {task.due_date && (
                                <p className={`text-xs ${
                                  formatDueDate(task.due_date) === 'Overdue' 
                                    ? 'text-red-500' 
                                    : formatDueDate(task.due_date) === 'Due today'
                                    ? 'text-amber-600'
                                    : 'text-warm-400'
                                }`}>
                                  {formatDueDate(task.due_date)}
                                </p>
                              )}
                            </div>
                            {getPriorityBadge(task.priority)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Dev Plan Progress (Desktop only) */}
                <Card variant="glass" className="hidden lg:block">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <h2 className="font-semibold text-warm-900">Dev Plan</h2>
                    <Link href="/baseball/dashboard/dev-plan" className="text-sm leading-relaxed text-primary-600 hover:underline flex items-center gap-1">
                      View <IconChevronRight size={14} />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {!playerDevPlan ? (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
                          <IconNote size={20} className="text-warm-400" />
                        </div>
                        <p className="text-sm text-warm-500">No active plan</p>
                      </div>
                    ) : (
                      <div>
                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-warm-600">Progress</span>
                            <span className="text-xs font-semibold text-primary-600">{devPlanProgress}%</span>
                          </div>
                          <div className="h-1.5 bg-warm-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary-500 rounded-full transition-all duration-500"
                              style={{ width: `${devPlanProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* Next Goal */}
                        {nextGoal && (
                          <div className="p-2.5 bg-primary-50 rounded-lg border border-primary-100">
                            <p className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-0.5">Next</p>
                            <p className="text-sm font-medium text-warm-900 truncate">{nextGoal.title}</p>
                          </div>
                        )}

                        {/* Goal Stats */}
                        <div className="flex items-center gap-4 mt-3 text-xs text-warm-600">
                          <span className="flex items-center gap-1">
                            <IconCheck size={12} className="text-primary-600" />
                            {playerDevPlan.goals?.filter(g => g.status === 'completed').length || 0} done
                          </span>
                          <span className="flex items-center gap-1">
                            <IconClock size={12} className="text-amber-600" />
                            {playerDevPlan.goals?.filter(g => g.status !== 'completed').length || 0} left
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card variant="glass">
                  <CardHeader>
                    <h2 className="font-semibold text-warm-900">Quick Actions</h2>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Link href="/baseball/dashboard/videos" className="block">
                      <Button variant="secondary" className="w-full justify-start">
                        <IconVideo size={16} className="mr-2" /> My Videos
                      </Button>
                    </Link>
                    <Link href="/baseball/dashboard/messages" className="block">
                      <Button variant="secondary" className="w-full justify-start">
                        <IconMessage size={16} className="mr-2" /> Messages
                      </Button>
                    </Link>
                    <Link href="/baseball/dashboard/dev-plan" className="block">
                      <Button variant="secondary" className="w-full justify-start">
                        <IconNote size={16} className="mr-2" /> Development Plan
                      </Button>
                    </Link>
                    <Link href="/baseball/dashboard/profile" className="block">
                      <Button variant="secondary" className="w-full justify-start">
                        <IconUser size={16} className="mr-2" /> My Profile
                      </Button>
                    </Link>
                    <Link href="/baseball/dashboard/calendar" className="block">
                      <Button variant="secondary" className="w-full justify-start">
                        <IconCalendar size={16} className="mr-2" /> Calendar
                      </Button>
                    </Link>
                    <Link href="/baseball/dashboard/documents" className="block">
                      <Button variant="secondary" className="w-full justify-start">
                        <IconNote size={16} className="mr-2" /> Documents
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
