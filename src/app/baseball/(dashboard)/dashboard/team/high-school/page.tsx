'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { StatCard } from '@/components/features/stat-card';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { RosterTable } from '@/components/baseball/team/RosterTable';
import { CollegeInterestTracker } from '@/components/baseball/team/CollegeInterestTracker';
import { BatchVideoUpload } from '@/components/baseball/team/BatchVideoUpload';
import { TeamAnalytics } from '@/components/baseball/team/TeamAnalytics';
import {
  IconUsers,
  IconNote,
  IconGraduationCap,
  IconEye,
  IconMessage,
  IconCalendar,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';

interface TeamMember {
  id: string;
  jersey_number: number | null;
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
  const [, setTeamId] = useState<string | null>(null);

  // Stats
  const [rosterCount, setRosterCount] = useState(0);
  const [recruitingActiveCount, setRecruitingActiveCount] = useState(0);
  const [avgGPA, setAvgGPA] = useState<number | null>(null);
  const [devPlanCount, setDevPlanCount] = useState(0);

  // Data
  const [roster, setRoster] = useState<TeamMember[]>([]);
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
        jersey_number,
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
      const typedRoster = roster as TeamMember[];
      setRoster(typedRoster);
      setRosterCount(typedRoster.length);

      // Calculate stats
      const recruitingActive = typedRoster.filter((m) => m.player?.recruiting_activated).length;
      setRecruitingActiveCount(recruitingActive);

      // Calculate average GPA
      const gpas = typedRoster
        .map((m) => m.player?.gpa)
        .filter((gpa): gpa is number => gpa !== null && !isNaN(gpa));
      if (gpas.length > 0) {
        const avg = gpas.reduce((sum, gpa) => sum + gpa, 0) / gpas.length;
        setAvgGPA(Math.round(avg * 100) / 100);
      }

      // Academic alerts (GPA < 2.5)
      const alerts = typedRoster.filter((m) => m.player?.gpa && m.player.gpa < 2.5);
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
        engagement_type,
        coach:coaches(full_name, school_name, division),
        player:players!inner(first_name, last_name, id)
      `)
      .in('player_id', (roster as TeamMember[] | null)?.map((m) => m.player.id) || [])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (interests) {
      type InterestEvent = {
        id: string;
        created_at: string;
        engagement_type: string;
        coach: { full_name: string | null; school_name: string | null; division: string | null } | null;
        player: { first_name: string | null; last_name: string | null; id: string } | null;
      };
      const formatted = (interests as unknown as InterestEvent[]).map((i) => ({
        id: i.id,
        created_at: i.created_at,
        event_type: i.engagement_type,
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
      type DevPlan = {
        player_id: string;
        status: string;
        player: { first_name: string | null; last_name: string | null } | null;
      };
      const progress: DevPlanProgress[] = (devPlans as DevPlan[]).slice(0, 5).map((plan) => ({
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
            <RosterTable roster={roster} />
            <CollegeInterestTracker interests={collegeInterests} />
            <BatchVideoUpload roster={roster} />
          </div>

          {/* Sidebar - Right column */}
          <div className="space-y-6">
            <TeamAnalytics
              rosterCount={rosterCount}
              recruitingActiveCount={recruitingActiveCount}
              avgGPA={avgGPA}
              collegeInterestCount={collegeInterests.length}
              devPlanCount={devPlanCount}
              academicAlertCount={academicAlerts.length}
              devPlanProgress={devPlanProgress}
            />

            {/* Quick Actions */}
            <Card variant="glass">
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
                <Link href="/baseball/dashboard/messages" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <IconMessage size={16} className="mr-2" /> Messages
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
