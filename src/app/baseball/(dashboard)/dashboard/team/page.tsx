'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { StatCard } from '@/components/features/stat-card';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { IconUsers, IconVideo, IconCalendar, IconNote, IconChevronRight, IconBuilding } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getFullName, formatRelativeTime } from '@/lib/utils';

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
  name: string;
  event_type: string;
  start_time: string;
}

export default function TeamDashboardPage() {
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
  const [playerVideoCount, setPlayerVideoCount] = useState(0);
  const [playerDevPlanTasks, setPlayerDevPlanTasks] = useState(0);
  const [playerTeamCount, setPlayerTeamCount] = useState(0);

  useEffect(() => {
    if (selectedTeamId && coach?.id && user?.role === 'coach') {
      fetchCoachTeamData();
    } else if (selectedTeamId && player?.id && user?.role === 'player') {
      fetchPlayerTeamData();
    } else {
      setLoading(false);
    }
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
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', selectedTeamId),

      // Video count (from all team players)
      supabase
        .from('team_members')
        .select('player_id')
        .eq('team_id', selectedTeamId)
        .then(async ({ data: members }) => {
          if (!members || members.length === 0) return { count: 0 };
          const playerIds = members.map(m => m.player_id);
          return supabase
            .from('videos')
            .select('*', { count: 'exact', head: true })
            .in('player_id', playerIds);
        }),

      // Dev plan count
      supabase
        .from('developmental_plans')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .in('status', ['sent', 'in_progress']),

      // Upcoming events (next 7 days)
      supabase
        .from('events')
        .select('id, name, event_type, start_time')
        .eq('team_id', selectedTeamId)
        .gte('start_time', new Date().toISOString())
        .lte('start_time', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true })
        .limit(5),

      // Recent members (last 5)
      supabase
        .from('team_members')
        .select(`
          id,
          joined_at,
          player:players (
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
    setRecentMembers(recentMembersResult.data || []);
    setUpcomingEvents(eventsResult.data || []);
    setLoading(false);
  }

  async function fetchPlayerTeamData() {
    if (!player?.id || !selectedTeamId) return;

    const supabase = createClient();
    setLoading(true);

    // Fetch player stats in parallel
    const [
      videoResult,
      devPlanResult,
      teamCountResult,
      eventsResult,
    ] = await Promise.all([
      // Player video count
      supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', player.id),

      // Player dev plan tasks
      supabase
        .from('developmental_plans')
        .select('goals')
        .eq('player_id', player.id)
        .in('status', ['sent', 'in_progress'])
        .single(),

      // Team member count
      supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', selectedTeamId),

      // Upcoming events
      supabase
        .from('events')
        .select('id, name, event_type, start_time')
        .eq('team_id', selectedTeamId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(3),
    ]);

    setPlayerVideoCount(videoResult.count || 0);
    setPlayerDevPlanTasks(
      devPlanResult.data?.goals && Array.isArray(devPlanResult.data.goals)
        ? devPlanResult.data.goals.length
        : 0
    );
    setPlayerTeamCount(teamCountResult.count || 0);
    setUpcomingEvents(eventsResult.data || []);
    setLoading(false);
  }

  if (authLoading || loading) return <PageLoading />;

  const getEventColor = (type: string) => {
    switch (type) {
      case 'practice': return 'bg-blue-500';
      case 'game': return 'bg-green-500';
      case 'tournament': return 'bg-purple-500';
      case 'meeting': return 'bg-amber-500';
      default: return 'bg-slate-400';
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

  // Coach Team Dashboard
  if (user?.role === 'coach') {
    return (
      <>
        <Header
          title="Team Dashboard"
          subtitle={`${coach?.school_name || 'Your Team'} - ${coach?.coach_type?.replace('_', ' ').toUpperCase()}`}
        />
        <div className="p-8">
          <div className="grid grid-cols-4 gap-4 mb-8">
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

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <Card glass>
                <CardHeader className="flex flex-row items-center justify-between">
                  <h2 className="font-semibold text-slate-900">Recent Roster Activity</h2>
                  <Link href="/baseball/dashboard/roster" className="text-sm leading-relaxed text-green-600 hover:underline flex items-center gap-1">
                    View roster <IconChevronRight size={14} />
                  </Link>
                </CardHeader>
                <CardContent>
                  {recentMembers.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <IconUsers size={24} className="text-slate-400" />
                      </div>
                      <h3 className="text-lg font-medium text-slate-900 mb-2">No players yet</h3>
                      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-sm mx-auto">
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
                          className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                        >
                          <Avatar
                            name={getFullName(member.player?.first_name, member.player?.last_name)}
                            src={member.player?.avatar_url || undefined}
                            size="sm"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">
                              {getFullName(member.player?.first_name, member.player?.last_name)}
                            </p>
                            <p className="text-sm leading-relaxed text-slate-500">
                              {member.player?.primary_position} • Joined {member.joined_at ? formatRelativeTime(member.joined_at) : 'recently'}
                            </p>
                          </div>
                          <Badge variant="success">Active</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card glass>
                <CardHeader className="flex flex-row items-center justify-between">
                  <h2 className="font-semibold text-slate-900">Quick Actions</h2>
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

              <Card glass>
                <CardHeader>
                  <h2 className="font-semibold text-slate-900">Upcoming Events</h2>
                </CardHeader>
                <CardContent>
                  {upcomingEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <IconCalendar size={32} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-sm leading-relaxed text-slate-500">No upcoming events</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingEvents.map((event) => (
                        <div key={event.id} className="flex items-start gap-2">
                          <div className={`w-2 h-2 rounded-full mt-1.5 ${getEventColor(event.event_type)}`}></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{event.name}</p>
                            <p className="text-xs text-slate-500">{formatEventDate(event.start_time)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Player Team Dashboard
  return (
    <>
      <Header
        title="Team Dashboard"
        subtitle={`${player?.high_school_name || player?.showcase_team_name || 'Your Team'}`}
      />
      <div className="p-8">
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <Avatar name={getFullName(player?.first_name, player?.last_name)} size="2xl" src={player?.avatar_url} />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{player?.first_name} {player?.last_name}</h2>
                    <p className="text-slate-500">{player?.primary_position} • Class of {player?.grad_year}</p>
                    <p className="text-sm leading-relaxed text-slate-400 mt-1">{player?.high_school_name || player?.showcase_team_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Badge variant="default">{player?.player_type?.replace('_', ' ').toUpperCase()}</Badge>
                  {player?.recruiting_activated && (
                    <Badge variant="success">Recruiting Active</Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Videos"
            value={playerVideoCount}
            change="Uploaded"
            icon={IconVideo}
          />
          <StatCard
            label="Dev Plan"
            value={playerDevPlanTasks}
            change="Tasks remaining"
            icon={IconNote}
          />
          <StatCard
            label="Practice"
            value={upcomingEvents.filter(e => e.event_type === 'practice').length}
            change="This week"
            icon={IconCalendar}
          />
          <StatCard
            label="Team"
            value={playerTeamCount}
            change="Members"
            icon={IconUsers}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Card glass>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">My Development Plan</h2>
            </CardHeader>
            <CardContent>
              {playerDevPlanTasks === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <IconNote size={24} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No active plan</h3>
                  <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-sm mx-auto">
                    Your coach will create a personalized development plan for you.
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                    <IconNote size={24} className="text-green-600" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Active Plan</h3>
                  <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-sm mx-auto">
                    You have {playerDevPlanTasks} {playerDevPlanTasks === 1 ? 'goal' : 'goals'} to work on.
                  </p>
                  <Link href="/baseball/dashboard/dev-plan">
                    <Button>View Plan</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">Team Schedule</h2>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <IconCalendar size={24} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No upcoming events</h3>
                  <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-sm mx-auto">
                    Team practices and games will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg"
                    >
                      <div className={`w-3 h-3 rounded-full mt-1 ${getEventColor(event.event_type)}`}></div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{event.name}</p>
                        <p className="text-sm leading-relaxed text-slate-500">{formatEventDate(event.start_time)}</p>
                      </div>
                    </div>
                  ))}
                  <Link href="/baseball/dashboard/calendar">
                    <Button variant="secondary" className="w-full">View Full Schedule</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
