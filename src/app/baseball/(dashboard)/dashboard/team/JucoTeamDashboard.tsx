'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import {
  TeamHealthHero,
  TeamHealthHeroSkeleton,
  TeamDevProgress,
  PlayersNeedingAttention,
  CollegeInterestSummary,
  TeamStatsChart,
  TeamActivityFeed,
  UpcomingSection,
} from '@/components/baseball/dashboard';
import { StatCard } from '@/components/features/stat-card';
import { Skeleton } from '@/components/ui/skeleton-loader';
import {
  IconGraduationCap,
  IconMessage,
} from '@/components/icons';
import { getTeamDashboardData } from '@/app/baseball/actions/team-dashboard';
import type { TeamDashboardData } from '@/app/baseball/actions/team-dashboard';

interface JucoTeamDashboardProps {
  coachName: string;
  coachType: string;
  organizationName?: string;
  teamId?: string;
}

export function JucoTeamDashboard({
  coachName,
  coachType,
  organizationName,
  teamId,
}: JucoTeamDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeamDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const result = await getTeamDashboardData(teamId);
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }

    fetchData();
  }, [teamId]);

  // Subtitle computed but used in Header - keeping for reference
  const _subtitle = organizationName 
    ? `${organizationName} - ${coachType.replace('_', ' ').toUpperCase()}`
    : coachType.replace('_', ' ').toUpperCase();
  void _subtitle; // Mark as intentionally unused

  return (
    <>
      <Header
        title="Team Dashboard"
        subtitle={`Welcome back, ${coachName.split(' ')[0]}`}
      />
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Row 1: Hero + Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              <TeamHealthHeroSkeleton />
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
                  <div>
                    <Skeleton variant="text" width={80} height={12} className="mb-2" />
                    <Skeleton variant="text" width={40} height={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
                  <div>
                    <Skeleton variant="text" width={80} height={12} className="mb-2" />
                    <Skeleton variant="text" width={40} height={24} />
                  </div>
                </div>
              </div>
            </>
          ) : data ? (
            <>
              <TeamHealthHero data={data.health} />
              <Link href="/baseball/dashboard/academics" className="block">
                <StatCard
                  label="Academics"
                  value={data.academics.teamGpa?.toFixed(2) || '—'}
                  change={
                    data.academics.atRiskCount > 0 
                      ? `${data.academics.atRiskCount} at risk` 
                      : 'All eligible'
                  }
                  icon={IconGraduationCap}
                />
              </Link>
              <Link href="/baseball/dashboard/messages" className="block">
                <StatCard
                  label="Messages"
                  value={data.unreadMessages}
                  change={data.unreadMessages === 1 ? 'unread' : 'unread messages'}
                  icon={IconMessage}
                />
              </Link>
            </>
          ) : null}
        </div>

        {/* Row 2: Dev Plans + Needs Attention */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TeamDevProgress 
            data={data?.devPlanProgress || []} 
            loading={loading} 
          />
          <PlayersNeedingAttention 
            data={data?.attentionItems || []} 
            loading={loading} 
          />
        </div>

        {/* Row 3: Stats Chart + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TeamStatsChart 
            data={data?.statsTrend || []} 
            loading={loading} 
          />
          <TeamActivityFeed 
            data={data?.recentActivity || []} 
            loading={loading} 
          />
        </div>

        {/* Row 4: College Interest (JUCO unique!) */}
        {coachType === 'juco' && (
          <CollegeInterestSummary 
            data={data?.collegeInterest || {
              totalProfileViews: 0,
              profileViewsChange: 0,
              schoolsInterested: 0,
              watchlistAdds: 0,
              topInterest: [],
            }} 
            loading={loading} 
          />
        )}

        {/* Row 5: Upcoming Events/Tasks/Messages */}
        <UpcomingSection
          events={data?.upcomingEvents || []}
          pendingTasks={data?.pendingTasks || 0}
          unreadMessages={data?.unreadMessages || 0}
          loading={loading}
        />
      </div>
    </>
  );
}
