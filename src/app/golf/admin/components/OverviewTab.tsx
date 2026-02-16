'use client';

import { Users, Target, Sparkles, Activity } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminStatCard } from './AdminStatCard';
import { CriticalAlertsBanner } from './CriticalAlertsBanner';
import { UserFunnelViz } from './UserFunnelViz';
import { ErrorSpotlight } from './ErrorSpotlight';
import { PlatformHealthCard } from './PlatformHealthCard';
import { ActivityFeed } from './ActivityFeed';
import { UserBreakdownCard } from './UserBreakdownCard';
import { DailyCharts } from './DailyCharts';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';

interface Props {
  data: AdminDashboardData;
  onNavigateTab?: (tab: string) => void;
}

export function OverviewTab({ data, onNavigateTab }: Props) {
  const healthScoreColor = data.growth.platformHealthScore >= 70 ? 'green' :
    data.growth.platformHealthScore >= 40 ? 'amber' : 'red';

  return (
    <div className="space-y-6">
      {/* Critical Alerts Bar */}
      <CriticalAlertsBanner items={data.needsAttention} onNavigateTab={onNavigateTab} />

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Users"
          value={data.totalPlatformUsers}
          icon={<Users size={20} />}
          trend={{ value: data.growth.userGrowthRate, label: 'vs last week' }}
          detail={`${data.users.totalCoaches} coaches · ${data.users.totalPlayers} players · ${data.users.totalAdmins} admin`}
          accentColor="green"
        />
        <AdminStatCard
          label="Weekly Active"
          value={data.health.activeUsers7d}
          icon={<Target size={20} />}
          detail={`${data.health.roundsToday} rounds today · ${data.health.roundsThisWeek} this week`}
          accentColor="blue"
        />
        <AdminStatCard
          label="Errors (7d)"
          value={data.errorLogs.totalErrors7d}
          icon={<Activity size={20} />}
          accentColor={data.errorLogs.criticalErrors7d > 0 ? 'red' : data.errorLogs.totalErrors7d > 0 ? 'amber' : 'green'}
          detail={data.errorLogs.criticalErrors7d > 0 ? `${data.errorLogs.criticalErrors7d} critical` : 'no critical errors'}
        />
        <AdminStatCard
          label="Health Score"
          value={data.growth.platformHealthScore}
          suffix="/100"
          icon={<Sparkles size={20} />}
          accentColor={healthScoreColor}
          detail={
            data.growth.platformHealthScore >= 70 ? 'Platform running well' :
            data.growth.platformHealthScore >= 40 ? 'Needs improvement' :
            'Critical — needs attention'
          }
        />
      </div>

      {/* 2-col row: User Funnel + Error Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <UserFunnelViz funnel={data.playerFunnel.funnel} />
        <ErrorSpotlight errorDetection={data.errorDetection} errorLogs={data.errorLogs} />
      </div>

      {/* Full-width 30-Day Trends */}
      <div>
        <SectionHeader title="30-Day Trends" />
        <DailyCharts signupsByDay={data.signupsByDay} visitsByDay={data.visitsByDay} />
      </div>

      {/* 3-col: Health + Activity + User Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        <PlatformHealthCard health={data.health} />
        <ActivityFeed activity={data.activity} />
        <UserBreakdownCard users={data.users} />
      </div>
    </div>
  );
}
