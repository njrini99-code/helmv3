'use client';

import { Users, Target, Sparkles, Activity, AlertTriangle } from 'lucide-react';
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

  // WoW comparison for rounds (use pre-computed growth rate from data)
  const roundsWoW = data.growth.roundGrowthRate;

  // At-risk users (inactive 14+ days)
  const atRiskTotal = data.userActivity.summary.inactivePlus14d;
  const atRiskPlayers = data.growth.churnedPlayers30d;
  const atRiskCoaches = Math.max(atRiskTotal - atRiskPlayers, 0);

  return (
    <div className="space-y-6">
      {/* ===== ZONE 1: STATUS ===== */}

      {/* Critical Alerts Bar */}
      <CriticalAlertsBanner items={data.needsAttention} onNavigateTab={onNavigateTab} />

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Users"
          value={data.totalPlatformUsers}
          icon={<Users size={20} />}
          trend={{ value: data.growth.userGrowthRate, label: 'WoW' }}
          detail={`${data.users.totalCoaches} coaches · ${data.users.totalPlayers} players · ${data.users.totalAdmins} admin`}
          accentColor="green"
        />
        <AdminStatCard
          label="Weekly Active"
          value={data.health.activeUsers7d}
          icon={<Target size={20} />}
          trend={roundsWoW !== 0 ? { value: roundsWoW, label: 'rounds WoW' } : undefined}
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

      {/* At-Risk Users Banner */}
      {atRiskTotal > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50/80 border border-amber-200/50">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <span>
              {atRiskTotal} user{atRiskTotal !== 1 ? 's' : ''} inactive 14+ days
              {(atRiskCoaches > 0 || atRiskPlayers > 0) && (
                <span className="text-amber-600 font-normal">
                  {' '}| {atRiskCoaches} coach{atRiskCoaches !== 1 ? 'es' : ''}, {atRiskPlayers} player{atRiskPlayers !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('people')}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap transition-colors"
            >
              View in People tab &rarr;
            </button>
          )}
        </div>
      )}

      {/* ===== ZONE 2: ACTIVITY ===== */}

      {/* 2-col row: User Funnel + Error Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <UserFunnelViz funnel={data.playerFunnel.funnel} />
        <div className="space-y-1">
          <ErrorSpotlight errorDetection={data.errorDetection} errorLogs={data.errorLogs} />
          {onNavigateTab && (
            <div className="flex justify-end px-1">
              <button
                onClick={() => onNavigateTab('system')}
                className="text-xs font-medium text-warm-400 hover:text-primary-600 transition-colors"
              >
                View all in System &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live Activity */}
      <div>
        <SectionHeader title="Live Activity" />
        <ActivityFeed activity={data.activity} />
      </div>

      {/* ===== ZONE 3: ANALYSIS ===== */}

      {/* Full-width 30-Day Trends */}
      <div>
        <SectionHeader title="30-Day Trends" />
        <DailyCharts signupsByDay={data.signupsByDay} visitsByDay={data.visitsByDay} />
      </div>

      {/* 2-col: Health + User Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <PlatformHealthCard health={data.health} statsCacheLastUpdated={data.statsCacheLastUpdated} />
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <div /> {/* spacer for alignment */}
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('people')}
                className="text-xs font-medium text-warm-400 hover:text-primary-600 transition-colors"
              >
                View all in People &rarr;
              </button>
            )}
          </div>
          <UserBreakdownCard users={data.users} />
        </div>
      </div>
    </div>
  );
}
