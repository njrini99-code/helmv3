'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { IconEye, IconStar, IconTrendingUp, IconLock } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { usePlayerRecruitingGate } from '@/hooks/use-route-protection';
import { createClient } from '@/lib/supabase/client';
import { getFullName, formatRelativeTime } from '@/lib/utils';

interface EngagementEvent {
  id: string;
  player_id: string;
  engagement_type: string;
  created_at: string | null;
  coach_id: string | null;
  coaches: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    school_name: string | null;
    division: string | null;
  } | null;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url: string | null;
  } | null;
}

interface PlayerInterest {
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_grad_year: number | null;
  player_avatar_url: string | null;
  total_views: number;
  unique_coaches: number;
  watchlist_adds: number;
  recent_activity: Array<{
    id: string;
    engagement_type: string;
    created_at: string | null;
    coach_name: string | null;
    coach_school: string | null;
    coach_division: string | null;
  }>;
}

export default function CollegeInterestClient() {
  const { user, coach, loading: authLoading } = useAuth();
  const { playerType, isActivated, isLoading: gateLoading } = usePlayerRecruitingGate();
  const [interests, setInterests] = useState<PlayerInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'recent'>('all');

  useEffect(() => {
    if (coach?.id) {
      fetchCoachTeam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchCoachTeam only depends on coach.id which is already in deps
  }, [coach?.id]);

  useEffect(() => {
    if (teamId) {
      fetchInterests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchInterests only depends on teamId which is already in deps
  }, [teamId, filter]);

  async function fetchCoachTeam() {
    if (!coach?.id) return;

    const supabase = createClient();
    const { data } = await supabase
      .from('baseball_team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id)
      .single();

    if (data?.team_id) {
      setTeamId(data.team_id);
    }
  }

  async function fetchInterests() {
    if (!teamId) return;

    setLoading(true);
    const supabase = createClient();

    // Get team players
    const { data: teamMembers } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    if (!teamMembers || teamMembers.length === 0) {
      setInterests([]);
      setLoading(false);
      return;
    }

    const playerIds = teamMembers.map(m => m.player_id);

    // Fetch engagement events for team players
    const { data: events } = await supabase
      .from('baseball_player_engagement_events')
      .select(`
        id,
        player_id,
        engagement_type,
        created_at,
        coach_id,
        coaches:baseball_coaches!coach_id (
          id,
          first_name,
          last_name,
          school_name,
          division
        ),
        players:baseball_players!player_id (
          id,
          first_name,
          last_name,
          primary_position,
          grad_year,
          avatar_url
        )
      `)
      .in('player_id', playerIds)
      .in('engagement_type', ['profile_view', 'video_view', 'watchlist_add'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (!events) {
      setInterests([]);
      setLoading(false);
      return;
    }

    // Group by player and calculate stats
    const playerMap = new Map<string, PlayerInterest>();
    const typedEvents = events as EngagementEvent[];

    typedEvents.forEach((event) => {
      const playerId = event.player_id;

      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          player_id: playerId,
          player_name: getFullName(event.players?.first_name, event.players?.last_name),
          player_position: event.players?.primary_position || null,
          player_grad_year: event.players?.grad_year || null,
          player_avatar_url: event.players?.avatar_url || null,
          total_views: 0,
          unique_coaches: 0,
          watchlist_adds: 0,
          recent_activity: [],
        });
      }

      const interest = playerMap.get(playerId)!;

      // Count engagement
      if (event.engagement_type === 'profile_view' || event.engagement_type === 'video_view') {
        interest.total_views++;
      }
      if (event.engagement_type === 'watchlist_add') {
        interest.watchlist_adds++;
      }

      // Add to recent activity (limit to 10 per player)
      // Note: anonymity is determined by whether coach info is available
      const isAnonymous = !event.coach_id;
      if (interest.recent_activity.length < 10) {
        interest.recent_activity.push({
          id: event.id,
          engagement_type: event.engagement_type,
          created_at: event.created_at,
          coach_name: isAnonymous
            ? null
            : getFullName(event.coaches?.first_name, event.coaches?.last_name),
          coach_school: isAnonymous ? null : (event.coaches?.school_name ?? null),
          coach_division: isAnonymous ? null : (event.coaches?.division ?? null),
        });
      }
    });

    // Count unique coaches per player
    typedEvents.forEach((event) => {
      const interest = playerMap.get(event.player_id);
      if (interest && event.coach_id) {
        const coachIds = new Set(
          typedEvents
            .filter((e) => e.player_id === event.player_id && e.coach_id)
            .map((e) => e.coach_id)
        );
        interest.unique_coaches = coachIds.size;
      }
    });

    let result = Array.from(playerMap.values());

    // Apply filter
    if (filter === 'high') {
      result = result.filter(i => i.watchlist_adds > 0 || i.unique_coaches >= 3);
    } else if (filter === 'recent') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      result = result.filter(i =>
        i.recent_activity.some(a => a.created_at && new Date(a.created_at) > sevenDaysAgo)
      );
    }

    // Sort by activity
    result.sort((a, b) => {
      const aLatest = a.recent_activity[0]?.created_at || '';
      const bLatest = b.recent_activity[0]?.created_at || '';
      return bLatest.localeCompare(aLatest);
    });

    setInterests(result);
    setLoading(false);
  }

  if (authLoading || gateLoading) return <PageLoading />;

  // Players who land on this coach surface see an appropriate gate state.
  if (user?.role === 'player') {
    // College players cannot activate recruiting at all — they use team features.
    if (playerType === 'college') {
      return (
        <div className="p-8">
          <Card variant="glass" className="border border-warm-200">
            <CardContent className="p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                <IconLock size={28} className="text-warm-400" />
              </div>
              <h3 className="text-lg font-semibold text-warm-900 mb-2">Not available for college players</h3>
              <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
                College interest tracking is a coach-facing tool. As a college player,
                your team features are available from the team dashboard.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Non-college players who haven't activated recruiting yet.
    if (!isActivated) {
      return (
        <div className="p-8">
          <Card variant="glass" className="border border-warm-200">
            <CardContent className="p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                <IconLock size={28} className="text-warm-400" />
              </div>
              <h3 className="text-lg font-semibold text-warm-900 mb-2">Activate recruiting first</h3>
              <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
                Once you activate recruiting, you&apos;ll be able to see which college programs
                are viewing your profile.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Activated non-college player — this is a coach surface; redirect is handled
    // by the gate hook. Show nothing while redirect is in flight.
    return null;
  }

  if (user?.role !== 'coach') {
    return (
      <div className="p-8">
        <Card variant="glass" className="border border-warm-200">
          <CardContent className="p-12 text-center">
            <p className="text-warm-500">Only coaches can access college interest tracking.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getEngagementIcon = (type: string) => {
    switch (type) {
      case 'profile_view':
        return <IconEye size={14} className="text-blue-600" />;
      case 'video_view':
        return <IconEye size={14} className="text-purple-600" />;
      case 'watchlist_add':
        return <IconStar size={14} className="text-amber-600" />;
      default:
        return <IconEye size={14} className="text-warm-400" />;
    }
  };

  const getEngagementLabel = (type: string) => {
    switch (type) {
      case 'profile_view':
        return 'Viewed profile';
      case 'video_view':
        return 'Watched video';
      case 'watchlist_add':
        return 'Added to watchlist';
      default:
        return 'Activity';
    }
  };

  const stats = {
    totalPlayers: interests.length,
    highInterest: interests.filter(i => i.watchlist_adds > 0).length,
    totalViews: interests.reduce((sum, i) => sum + i.total_views, 0),
    avgCoachesPerPlayer: interests.length > 0
      ? Math.round(interests.reduce((sum, i) => sum + i.unique_coaches, 0) / interests.length)
      : 0,
  };

  return (
    <>
      <Header
        title="College Interest"
        subtitle="Track which colleges are viewing your players"
      />
      <div className="p-4 lg:p-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <Card variant="glass">
            <CardContent className="p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-warm-500 truncate">Players Tracked</p>
                  <p className="text-xl lg:text-2xl font-semibold tracking-tight text-warm-900 mt-1 tabular-nums">{stats.totalPlayers}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 ml-2">
                  <IconEye size={20} className="text-blue-600 lg:hidden" />
                  <IconEye size={24} className="text-blue-600 hidden lg:block" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-warm-500 truncate">High Interest</p>
                  <p className="text-xl lg:text-2xl font-semibold tracking-tight text-warm-900 mt-1 tabular-nums">{stats.highInterest}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 ml-2">
                  <IconStar size={20} className="text-amber-600 lg:hidden" />
                  <IconStar size={24} className="text-amber-600 hidden lg:block" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-warm-500 truncate">Total Views</p>
                  <p className="text-xl lg:text-2xl font-semibold tracking-tight text-warm-900 mt-1 tabular-nums">{stats.totalViews}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0 ml-2">
                  <IconEye size={20} className="text-purple-600 lg:hidden" />
                  <IconEye size={24} className="text-purple-600 hidden lg:block" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-warm-500 truncate">Avg Coaches</p>
                  <p className="text-xl lg:text-2xl font-semibold tracking-tight text-warm-900 mt-1 tabular-nums">{stats.avgCoachesPerPlayer}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 ml-2">
                  <IconTrendingUp size={20} className="text-primary-600 lg:hidden" />
                  <IconTrendingUp size={24} className="text-primary-600 hidden lg:block" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interest List */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="font-semibold text-warm-900">Player Interest Activity</h2>
                <p className="text-sm leading-relaxed text-warm-500 mt-1 hidden lg:block">
                  See which colleges are viewing and tracking your players
                </p>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
                <Button
                  variant={filter === 'all' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('all')}
                  className="whitespace-nowrap flex-shrink-0"
                >
                  All Players
                </Button>
                <Button
                  variant={filter === 'high' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('high')}
                  className="whitespace-nowrap flex-shrink-0"
                >
                  High Interest
                </Button>
                <Button
                  variant={filter === 'recent' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('recent')}
                  className="whitespace-nowrap flex-shrink-0"
                >
                  Recent (7d)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4 lg:space-y-6 py-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="border border-warm-200 rounded-lg p-3 lg:p-4 space-y-3"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Player avatar + name + position row */}
                    <div className="flex items-start gap-3 lg:gap-4">
                      <div className="w-10 h-10 rounded-full bg-warm-200/60 flex-shrink-0 skeleton-shimmer" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-2/5 bg-warm-200/60 rounded skeleton-shimmer" />
                        <div className="h-3 w-1/3 bg-warm-100/60 rounded skeleton-shimmer" />
                        <div className="h-3 w-1/2 bg-warm-100/60 rounded skeleton-shimmer" />
                      </div>
                    </div>
                    {/* Recent activity rows */}
                    <div className="border-t border-warm-100 pt-3 space-y-2">
                      <div className="h-3 w-28 bg-warm-100/60 rounded skeleton-shimmer" />
                      {[0, 1].map((j) => (
                        <div key={j} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-warm-100/60 skeleton-shimmer flex-shrink-0" />
                          <div className="h-3 bg-warm-100/60 rounded skeleton-shimmer" style={{ width: j === 0 ? '75%' : '60%' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : interests.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
                  <IconEye size={32} className="text-warm-400" />
                </div>
                <h3 className="text-lg font-medium text-warm-900 mb-2">No college interest yet</h3>
                <p className="text-sm leading-relaxed text-warm-500 mb-6 max-w-md mx-auto">
                  When college coaches view your players' profiles or add them to watchlists, you'll see the activity here.
                </p>
              </div>
            ) : (
              /* Interest List */
              <div className="space-y-4 lg:space-y-6">
                {interests.map((interest) => (
                  <div
                    key={interest.player_id}
                    className="border border-warm-200 rounded-lg p-3 lg:p-4"
                  >
                    <div className="flex items-start gap-3 lg:gap-4 mb-3 lg:mb-4">
                      <Avatar
                        name={interest.player_name}
                        src={interest.player_avatar_url || undefined}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-warm-900 text-sm lg:text-base">{interest.player_name}</h3>
                          {interest.watchlist_adds > 0 && (
                            <Badge variant="default" className="text-xs">
                              {interest.watchlist_adds} watchlist{interest.watchlist_adds > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs lg:text-sm leading-relaxed text-warm-600">
                          {interest.player_position} • {interest.player_grad_year}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 lg:gap-4 mt-2 text-xs lg:text-sm text-warm-500">
                          <span>{interest.total_views} views</span>
                          <span className="hidden lg:inline">•</span>
                          <span>{interest.unique_coaches} college{interest.unique_coaches !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>

                    {/* Recent Activity */}
                    {interest.recent_activity.length > 0 && (
                      <div className="border-t border-warm-200 pt-3 space-y-2">
                        <p className="text-label font-medium uppercase tracking-wider text-warm-400 mb-2">Recent Activity</p>
                        {interest.recent_activity.slice(0, 5).map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-start lg:items-center gap-2 lg:gap-3 text-xs lg:text-sm"
                          >
                            <div className="flex-shrink-0 mt-0.5 lg:mt-0">
                              {getEngagementIcon(activity.engagement_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              {!activity.coach_name ? (
                                <p className="text-warm-600">
                                  <span className="font-medium">A college coach</span>{' '}
                                  <span className="hidden lg:inline">{getEngagementLabel(activity.engagement_type).toLowerCase()}</span>
                                  <span className="lg:hidden">viewed</span>
                                  {activity.coach_division && (
                                    <span className="text-warm-500"> • {activity.coach_division}</span>
                                  )}
                                </p>
                              ) : (
                                <p className="text-warm-600">
                                  <span className="font-medium">{activity.coach_name}</span>
                                  <span className="hidden lg:inline"> from <span className="font-medium">{activity.coach_school}</span> {getEngagementLabel(activity.engagement_type).toLowerCase()}</span>
                                  <span className="lg:hidden block text-warm-500">{activity.coach_school}</span>
                                  {activity.coach_division && (
                                    <span className="text-warm-500 hidden lg:inline"> • {activity.coach_division}</span>
                                  )}
                                </p>
                              )}
                              <span className="text-micro lg:hidden text-warm-400 block mt-0.5">
                                {activity.created_at ? formatRelativeTime(activity.created_at) : ''}
                              </span>
                            </div>
                            <div className="flex-shrink-0 text-xs text-warm-400 hidden lg:block">
                              {activity.created_at ? formatRelativeTime(activity.created_at) : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
