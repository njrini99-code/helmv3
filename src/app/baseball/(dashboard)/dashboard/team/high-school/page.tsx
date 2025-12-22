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
import {
  IconUsers,
  IconVideo,
  IconCalendar,
  IconNote,
  IconChevronRight,
  IconGraduationCap,
  IconEye,
  IconTrendingUp,
  IconTarget,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
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
    grad_year: number | null;
    gpa: number | null;
    recruiting_activated: boolean | null;
  };
}

interface CollegeInterest {
  id: string;
  created_at: string;
  event_type: string;
  coach_name: string | null;
  school_name: string | null;
  school_division: string | null;
  player_name: string;
}

interface DevPlanProgress {
  player_id: string;
  player_name: string;
  total_goals: number;
  completed_goals: number;
  progress_percentage: number;
}

export default function HSCoachDashboardPage() {
  const { coach, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);

  // Stats
  const [rosterCount, setRosterCount] = useState(0);
  const [recruitingActiveCount, setRecruitingActiveCount] = useState(0);
  const [avgGPA, setAvgGPA] = useState<number | null>(null);
  const [devPlanCount, setDevPlanCount] = useState(0);

  // Data
  const [recentMembers, setRecentMembers] = useState<TeamMember[]>([]);
  const [collegeInterests, setCollegeInterests] = useState<CollegeInterest[]>([]);
  const [devPlanProgress, setDevPlanProgress] = useState<DevPlanProgress[]>([]);
  const [academicAlerts, setAcademicAlerts] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (coach?.id) {
      fetchDashboardData();
    }
  }, [coach?.id]);

  async function fetchDashboardData() {
    if (!coach?.id) return;

    const supabase = createClient();
    setLoading(true);

    // Get team ID
    const { data: staffData } = await supabase
      .from('team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id)
      .single();

    if (!staffData?.team_id) {
      setLoading(false);
      return;
    }

    const currentTeamId = staffData.team_id;
    setTeamId(currentTeamId);

    // Fetch roster with player details
    const { data: roster } = await supabase
      .from('team_members')
      .select(`
        id,
        joined_at,
        player:players!inner(
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year,
          gpa,
          recruiting_activated
        )
      `)
      .eq('team_id', currentTeamId);

    if (roster) {
      setRosterCount(roster.length);
      setRecentMembers(roster.slice(0, 5));

      // Calculate stats
      const recruitingActive = roster.filter((m: any) => m.player?.recruiting_activated).length;
      setRecruitingActiveCount(recruitingActive);

      // Calculate average GPA
      const gpas = roster
        .map((m: any) => m.player?.gpa)
        .filter((gpa): gpa is number => gpa !== null && !isNaN(gpa));
      if (gpas.length > 0) {
        const avg = gpas.reduce((sum, gpa) => sum + gpa, 0) / gpas.length;
        setAvgGPA(Math.round(avg * 100) / 100);
      }

      // Academic alerts (GPA < 2.5)
      const alerts = roster.filter((m: any) => m.player?.gpa && m.player.gpa < 2.5);
      setAcademicAlerts(alerts.slice(0, 3));
    }

    // Fetch college interest events (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: interests } = await supabase
      .from('player_engagement_events')
      .select(`
        id,
        created_at,
        event_type,
        coach:coaches(full_name, school_name, division),
        player:players!inner(first_name, last_name, id)
      `)
      .in('player_id', roster?.map((m: any) => m.player.id) || [])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (interests) {
      const formatted = interests.map((i: any) => ({
        id: i.id,
        created_at: i.created_at,
        event_type: i.event_type,
        coach_name: i.coach?.full_name || null,
        school_name: i.coach?.school_name || 'Unknown School',
        school_division: i.coach?.division || null,
        player_name: getFullName(i.player?.first_name, i.player?.last_name),
      }));
      setCollegeInterests(formatted);
    }

    // Fetch dev plan progress
    const { data: devPlans } = await supabase
      .from('developmental_plans')
      .select(`
        player_id,
        status,
        player:players!inner(first_name, last_name)
      `)
      .eq('coach_id', coach.id)
      .in('status', ['active', 'in_progress']);

    if (devPlans) {
      setDevPlanCount(devPlans.length);
      // For now, show simplified progress
      // In real implementation, would calculate from plan goals/tasks
      const progress: DevPlanProgress[] = devPlans.slice(0, 5).map((plan: any) => ({
        player_id: plan.player_id,
        player_name: getFullName(plan.player?.first_name, plan.player?.last_name),
        total_goals: 5, // Placeholder
        completed_goals: Math.floor(Math.random() * 5), // Placeholder
        progress_percentage: Math.floor(Math.random() * 100), // Placeholder
      }));
      setDevPlanProgress(progress);
    }

    setLoading(false);
  }

  if (authLoading || loading) {
    return <PageLoading />;
  }

  return (
    <>
      <Header
        title="Team Dashboard"
        subtitle="High School Team Overview"
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Players"
            value={rosterCount}
            icon={IconUsers}
            change={`${recruitingActiveCount} recruiting active`}
            changeType="neutral"
          />
          <StatCard
            label="Average GPA"
            value={avgGPA?.toFixed(2) || 'N/A'}
            icon={IconGraduationCap}
            change={
              avgGPA && avgGPA >= 3.0
                ? 'Excellent standing'
                : avgGPA && avgGPA >= 2.5
                ? 'Good standing'
                : avgGPA
                ? 'Needs attention'
                : undefined
            }
            changeType={avgGPA && avgGPA >= 3.0 ? 'positive' : avgGPA && avgGPA >= 2.5 ? 'neutral' : 'negative'}
          />
          <StatCard
            label="Active Dev Plans"
            value={devPlanCount}
            icon={IconNote}
          />
          <StatCard
            label="College Interest"
            value={collegeInterests.length}
            icon={IconEye}
            change="Last 30 days"
            changeType="neutral"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Left 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* College Interest Feed */}
            <Card glass>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">College Interest Feed</h2>
                  <p className="text-sm leading-relaxed text-slate-500 mt-1">Recent activity from college coaches</p>
                </div>
                <Link href="/baseball/dashboard/college-interest">
                  <Button variant="ghost" size="sm">
                    View All <IconChevronRight size={16} className="ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {collegeInterests.length === 0 ? (
                  <div className="text-center py-8">
                    <IconEye size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm leading-relaxed text-slate-500">No recent college interest</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Interest events will appear here when college coaches view your players
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {collegeInterests.slice(0, 5).map((interest) => (
                      <div
                        key={interest.id}
                        className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <IconEye size={16} className="text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {interest.school_name}
                            {interest.school_division && (
                              <Badge variant="secondary" className="ml-2">{interest.school_division}</Badge>
                            )}
                          </p>
                          <p className="text-sm leading-relaxed text-slate-600">
                            {interest.coach_name || 'A coach'} {interest.event_type === 'profile_view' ? 'viewed' : 'added to watchlist'} <span className="font-medium">{interest.player_name}</span>
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatRelativeTime(interest.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Academic Overview */}
            <Card glass>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Academic Overview</h2>
                  <p className="text-sm leading-relaxed text-slate-500 mt-1">Monitor academic performance</p>
                </div>
              </CardHeader>
              <CardContent>
                {academicAlerts.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <IconGraduationCap size={16} className="text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900">
                          {academicAlerts.length} player{academicAlerts.length > 1 ? 's' : ''} below 2.5 GPA
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Consider academic support or tutoring
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Team Average GPA</p>
                      <p className="text-xs text-slate-500 mt-1">Based on {rosterCount} players</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold tracking-tight text-slate-900">
                        {avgGPA?.toFixed(2) || 'N/A'}
                      </p>
                      {avgGPA && (
                        <Badge variant={avgGPA >= 3.0 ? 'success' : avgGPA >= 2.5 ? 'warning' : 'error'}>
                          {avgGPA >= 3.0 ? 'Excellent' : avgGPA >= 2.5 ? 'Good' : 'Needs Attention'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {academicAlerts.length > 0 && (
                    <>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400r">
                        Players Needing Support
                      </p>
                      {academicAlerts.map((member: any) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 border border-amber-200 bg-amber-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={getFullName(member.player?.first_name, member.player?.last_name)}
                              src={member.player?.avatar_url || undefined}
                              size="sm"
                            />
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {getFullName(member.player?.first_name, member.player?.last_name)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {member.player?.primary_position} • Class of {member.player?.grad_year}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-amber-900">
                              {member.player?.gpa?.toFixed(2)} GPA
                            </p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Player Development Progress */}
            <Card glass>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Player Development</h2>
                  <p className="text-sm leading-relaxed text-slate-500 mt-1">Track dev plan progress</p>
                </div>
                <Link href="/baseball/dashboard/dev-plans">
                  <Button variant="ghost" size="sm">
                    Manage Plans <IconChevronRight size={16} className="ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {devPlanProgress.length === 0 ? (
                  <div className="text-center py-8">
                    <IconNote size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm leading-relaxed text-slate-500">No active development plans</p>
                    <Link href="/baseball/dashboard/dev-plans">
                      <Button className="mt-3">Create Dev Plan</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {devPlanProgress.map((progress) => (
                      <div key={progress.player_id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">{progress.player_name}</p>
                          <p className="text-xs text-slate-500">
                            {progress.completed_goals}/{progress.total_goals} goals
                          </p>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress.progress_percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right column */}
          <div className="space-y-6">
            {/* Recent Roster Additions */}
            <Card glass>
              <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="font-semibold text-slate-900">Recent Additions</h2>
                <Link href="/baseball/dashboard/roster">
                  <Button variant="ghost" size="sm">
                    <IconChevronRight size={16} />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentMembers.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm leading-relaxed text-slate-500">No players yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentMembers.map((member: any) => (
                      <div key={member.id} className="flex items-center gap-3">
                        <Avatar
                          name={getFullName(member.player?.first_name, member.player?.last_name)}
                          src={member.player?.avatar_url || undefined}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {getFullName(member.player?.first_name, member.player?.last_name)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {member.player?.primary_position}
                          </p>
                        </div>
                        {member.player?.recruiting_activated && (
                          <Badge variant="success" className="text-xs">Active</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card glass>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">Quick Actions</h2>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/baseball/dashboard/roster" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <IconUsers size={16} className="mr-2" /> Manage Roster
                  </Button>
                </Link>
                <Link href="/baseball/dashboard/dev-plans" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <IconNote size={16} className="mr-2" /> Create Dev Plan
                  </Button>
                </Link>
                <Link href="/baseball/dashboard/college-interest" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <IconEye size={16} className="mr-2" /> College Interest
                  </Button>
                </Link>
                <Link href="/baseball/dashboard/calendar" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <IconCalendar size={16} className="mr-2" /> Calendar
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
