'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { IconEye, IconStar, IconFilter, IconTrendingUp } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getFullName, formatRelativeTime } from '@/lib/utils';

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
    engagement_date: string;
    coach_name: string | null;
    coach_school: string | null;
    coach_division: string | null;
    is_anonymous: boolean;
  }>;
}

export default function CollegeInterestPage() {
  const { user, coach, loading: authLoading } = useAuth();
  const [interests, setInterests] = useState<PlayerInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'recent'>('all');

  useEffect(() => {
    if (coach?.id) {
      fetchCoachTeam();
    }
  }, [coach?.id]);

  useEffect(() => {
    if (teamId) {
      fetchInterests();
    }
  }, [teamId, filter]);

  async function fetchCoachTeam() {
    if (!coach?.id) return;

    const supabase = createClient();
    const { data } = await supabase
      .from('team_coach_staff')
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
      .from('team_members')
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
      .from('player_engagement_events')
      .select(`
        id,
        player_id,
        engagement_type,
        engagement_date,
        is_anonymous,
        coach_id,
        coaches:coach_id (
          id,
          first_name,
          last_name,
          school_name,
          division
        ),
        players:player_id (
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
      .order('engagement_date', { ascending: false })
      .limit(500);

    if (!events) {
      setInterests([]);
      setLoading(false);
      return;
    }

    // Group by player and calculate stats
    const playerMap = new Map<string, PlayerInterest>();

    events.forEach((event: any) => {
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
      if (interest.recent_activity.length < 10) {
        interest.recent_activity.push({
          id: event.id,
          engagement_type: event.engagement_type,
          engagement_date: event.engagement_date,
          coach_name: event.is_anonymous
            ? null
            : getFullName(event.coaches?.first_name, event.coaches?.last_name),
          coach_school: event.is_anonymous ? null : event.coaches?.school_name,
          coach_division: event.is_anonymous ? null : event.coaches?.division,
          is_anonymous: event.is_anonymous,
        });
      }
    });

    // Count unique coaches per player
    events.forEach((event: any) => {
      const interest = playerMap.get(event.player_id);
      if (interest && event.coach_id) {
        const coachIds = new Set(
          events
            .filter((e: any) => e.player_id === event.player_id && e.coach_id)
            .map((e: any) => e.coach_id)
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
        i.recent_activity.some(a => new Date(a.engagement_date) > sevenDaysAgo)
      );
    }

    // Sort by activity
    result.sort((a, b) => {
      const aLatest = a.recent_activity[0]?.engagement_date || '';
      const bLatest = b.recent_activity[0]?.engagement_date || '';
      return bLatest.localeCompare(aLatest);
    });

    setInterests(result);
    setLoading(false);
  }

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'coach') {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">Only coaches can access college interest tracking.</p>
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
        return <IconEye size={14} className="text-slate-400" />;
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
      <div className="p-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Players Tracked</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.totalPlayers}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <IconEye size={24} className="text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">High Interest</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.highInterest}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                  <IconStar size={24} className="text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Views</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.totalViews}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center">
                  <IconEye size={24} className="text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Avg Coaches/Player</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.avgCoachesPerPlayer}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <IconTrendingUp size={24} className="text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interest List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Player Interest Activity</h2>
                <p className="text-sm text-slate-500 mt-1">
                  See which colleges are viewing and tracking your players
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={filter === 'all' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('all')}
                >
                  All Players
                </Button>
                <Button
                  variant={filter === 'high' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('high')}
                >
                  High Interest
                </Button>
                <Button
                  variant={filter === 'recent' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter('recent')}
                >
                  Recent (7d)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : interests.length === 0 ? (
              /* Empty State */
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <IconEye size={32} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">No college interest yet</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                  When college coaches view your players' profiles or add them to watchlists, you'll see the activity here.
                </p>
              </div>
            ) : (
              /* Interest List */
              <div className="space-y-6">
                {interests.map((interest) => (
                  <div
                    key={interest.player_id}
                    className="border border-slate-200 rounded-lg p-4"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar
                        name={interest.player_name}
                        src={interest.player_avatar_url || undefined}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{interest.player_name}</h3>
                          {interest.watchlist_adds > 0 && (
                            <Badge variant="default">
                              {interest.watchlist_adds} watchlist{interest.watchlist_adds > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          {interest.player_position} • {interest.player_grad_year}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                          <span>{interest.total_views} views</span>
                          <span>•</span>
                          <span>{interest.unique_coaches} college{interest.unique_coaches !== 1 ? 's' : ''} interested</span>
                        </div>
                      </div>
                    </div>

                    {/* Recent Activity */}
                    {interest.recent_activity.length > 0 && (
                      <div className="border-t border-slate-200 pt-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Recent Activity</p>
                        {interest.recent_activity.slice(0, 5).map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-center gap-3 text-sm"
                          >
                            <div className="flex-shrink-0">
                              {getEngagementIcon(activity.engagement_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              {activity.is_anonymous ? (
                                <p className="text-slate-600">
                                  <span className="font-medium">A college coach</span> {getEngagementLabel(activity.engagement_type).toLowerCase()}
                                  {activity.coach_division && (
                                    <span className="text-slate-500"> • {activity.coach_division}</span>
                                  )}
                                </p>
                              ) : (
                                <p className="text-slate-600">
                                  <span className="font-medium">{activity.coach_name}</span> from{' '}
                                  <span className="font-medium">{activity.coach_school}</span> {getEngagementLabel(activity.engagement_type).toLowerCase()}
                                  {activity.coach_division && (
                                    <span className="text-slate-500"> • {activity.coach_division}</span>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-xs text-slate-400">
                              {formatRelativeTime(activity.engagement_date)}
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
