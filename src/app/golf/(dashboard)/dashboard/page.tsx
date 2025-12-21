'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import {
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconGolf,
  IconPlus,
  IconArrowRight,
} from '@/components/icons';
import type { GolfCoach, GolfPlayer, GolfTeam } from '@/lib/types/golf';

interface DashboardStats {
  rosterSize: number;
  upcomingEvents: number;
  activeQualifiers: number;
  teamScoringAverage: number | null;
}

interface CoachDashboardData {
  coach: GolfCoach;
  team: GolfTeam | null;
  stats: DashboardStats;
  recentRounds: Array<{
    id: string;
    player_name: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
  }>;
}

interface PlayerDashboardData {
  player: GolfPlayer;
  team: GolfTeam | null;
  stats: {
    roundsPlayed: number;
    scoringAverage: number | null;
    bestRound: number | null;
    handicap: number | null;
  };
  recentRounds: Array<{
    id: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
  }>;
}

function CoachDashboard({ data }: { data: CoachDashboardData }) {
  const { coach, team, stats, recentRounds } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {coach.full_name?.split(' ')[0] || 'Coach'}
        </h1>
        <p className="text-slate-500 mt-1">
          {team?.name || 'Golf Team'} Dashboard
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <IconUsers size={24} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Roster Size</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.rosterSize}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <IconCalendar size={24} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Upcoming Events</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.upcomingEvents}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <IconFlag size={24} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Active Qualifiers</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.activeQualifiers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <IconChartBar size={24} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Team Average</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {stats.teamScoringAverage ? stats.teamScoringAverage.toFixed(1) : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/golf/dashboard/roster">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconUsers size={18} />
                Manage Roster
              </Button>
            </Link>
            <Link href="/golf/dashboard/qualifiers">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconFlag size={18} />
                Create Qualifier
              </Button>
            </Link>
            <Link href="/golf/dashboard/calendar">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconCalendar size={18} />
                Schedule Event
              </Button>
            </Link>
            <Link href="/golf/dashboard/announcements">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconPlus size={18} />
                Post Announcement
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Rounds */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Rounds</CardTitle>
            <Link href="/golf/dashboard/stats">
              <Button variant="ghost" size="sm" className="gap-1">
                View All <IconArrowRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentRounds.length === 0 ? (
              <div className="text-center py-8">
                <IconGolf size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">No rounds recorded yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  Players can submit rounds from their dashboard
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{round.player_name}</p>
                      <p className="text-sm text-slate-500">
                        {round.course_name} • {new Date(round.round_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{round.total_score}</p>
                      <p className={`text-sm ${round.total_to_par <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {round.total_to_par > 0 ? '+' : ''}{round.total_to_par}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlayerDashboard({ data }: { data: PlayerDashboardData }) {
  const { player, team, stats, recentRounds } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {player.first_name}
        </h1>
        <p className="text-slate-500 mt-1">
          {team?.name || 'Golf Team'} • {player.year || 'Player'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <IconGolf size={24} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Rounds Played</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.roundsPlayed}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <IconChartBar size={24} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Scoring Average</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {stats.scoringAverage ? stats.scoringAverage.toFixed(1) : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <IconFlag size={24} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Best Round</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {stats.bestRound || '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <IconChartBar size={24} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Handicap</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {stats.handicap !== null ? stats.handicap.toFixed(1) : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Recent Rounds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/golf/dashboard/rounds">
              <Button variant="primary" className="w-full justify-start gap-2">
                <IconPlus size={18} />
                Submit Round
              </Button>
            </Link>
            <Link href="/golf/dashboard/stats">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconChartBar size={18} />
                View Stats
              </Button>
            </Link>
            <Link href="/golf/dashboard/calendar">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconCalendar size={18} />
                View Calendar
              </Button>
            </Link>
            <Link href="/golf/dashboard/classes">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <IconUsers size={18} />
                My Classes
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Rounds */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Recent Rounds</CardTitle>
            <Link href="/golf/dashboard/rounds">
              <Button variant="ghost" size="sm" className="gap-1">
                View All <IconArrowRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentRounds.length === 0 ? (
              <div className="text-center py-8">
                <IconGolf size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">No rounds recorded yet</p>
                <Link href="/golf/dashboard/rounds">
                  <Button variant="primary" size="sm" className="mt-3">
                    Submit Your First Round
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{round.course_name}</p>
                      <p className="text-sm text-slate-500">
                        {new Date(round.round_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{round.total_score}</p>
                      <p className={`text-sm ${round.total_to_par <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {round.total_to_par > 0 ? '+' : ''}{round.total_to_par}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function GolfDashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(null);
  const [coachData, setCoachData] = useState<CoachDashboardData | null>(null);
  const [playerData, setPlayerData] = useState<PlayerDashboardData | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if coach
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('*, team:golf_teams(*), organization:golf_organizations(*)')
        .eq('user_id', user.id)
        .single();

      if (coach) {
        setUserRole('coach');

        // Load coach dashboard data
        const teamId = coach.team_id;

        // Get roster size
        const { count: rosterSize } = await supabase
          .from('golf_players')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId);

        // Get upcoming events
        const { count: upcomingEvents } = await supabase
          .from('golf_events')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId)
          .gte('start_date', new Date().toISOString().split('T')[0]);

        // Get active qualifiers
        const { count: activeQualifiers } = await supabase
          .from('golf_qualifiers')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId)
          .in('status', ['upcoming', 'in_progress']);

        // Get recent rounds with player names
        const { data: recentRounds } = await supabase
          .from('golf_rounds')
          .select('*, player:golf_players(first_name, last_name)')
          .eq('player.team_id', teamId)
          .order('round_date', { ascending: false })
          .limit(5);

        setCoachData({
          coach: coach as GolfCoach,
          team: coach.team as GolfTeam,
          stats: {
            rosterSize: rosterSize || 0,
            upcomingEvents: upcomingEvents || 0,
            activeQualifiers: activeQualifiers || 0,
            teamScoringAverage: null, // Would calculate from rounds
          },
          recentRounds: (recentRounds || []).map(r => ({
            id: r.id,
            player_name: `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || 'Unknown',
            course_name: r.course_name,
            total_score: r.total_score || 0,
            total_to_par: r.total_to_par || 0,
            round_date: r.round_date,
          })),
        });

        setLoading(false);
        return;
      }

      // Check if player
      const { data: player } = await supabase
        .from('golf_players')
        .select('*, team:golf_teams(*)')
        .eq('user_id', user.id)
        .single();

      if (player) {
        setUserRole('player');

        // Get player's rounds
        const { data: rounds } = await supabase
          .from('golf_rounds')
          .select('*')
          .eq('player_id', player.id)
          .order('round_date', { ascending: false });

        const playerRounds = rounds || [];

        // Calculate stats
        const roundsPlayed = playerRounds.length;
        const scoringAverage = roundsPlayed > 0
          ? playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0) / roundsPlayed
          : null;
        const bestRound = roundsPlayed > 0
          ? Math.min(...playerRounds.map(r => r.total_score || 999))
          : null;

        setPlayerData({
          player: player as GolfPlayer,
          team: player.team as GolfTeam,
          stats: {
            roundsPlayed,
            scoringAverage,
            bestRound: bestRound === 999 ? null : bestRound,
            handicap: player.handicap,
          },
          recentRounds: playerRounds.slice(0, 5).map(r => ({
            id: r.id,
            course_name: r.course_name,
            total_score: r.total_score || 0,
            total_to_par: r.total_to_par || 0,
            round_date: r.round_date,
          })),
        });

        setLoading(false);
      }
    }

    loadDashboard();
  }, [supabase]);

  if (loading) {
    return <PageLoading />;
  }

  if (userRole === 'coach' && coachData) {
    return <CoachDashboard data={coachData} />;
  }

  if (userRole === 'player' && playerData) {
    return <PlayerDashboard data={playerData} />;
  }

  return <PageLoading />;
}
