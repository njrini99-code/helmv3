'use client';

import { IconUsers, IconTarget, IconSparkles, IconActivity, IconWarning } from '@/components/icons';
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

  // At-risk users (inactive 14+ days) — derive coach vs player breakdown from user activity data
  const atRiskTotal = data.userActivity.summary.inactivePlus14d;
  // Count inactive 14d+ coaches from team members and unassigned users
  const atRiskCoaches = data.userActivity.teams.reduce((sum, team) =>
    sum + team.members.filter(m => m.role === 'coach' && m.daysSinceLastSeen != null && m.daysSinceLastSeen >= 14).length, 0
  ) + data.userActivity.unassigned.filter(u => u.role === 'coach' && u.daysSinceLastSeen != null && u.daysSinceLastSeen >= 14).length;
  const atRiskPlayers = Math.max(atRiskTotal - atRiskCoaches, 0);

  return (
    <div className="space-y-6">
      {/* ===== ZONE 1: STATUS ===== */}

      {/* Critical Alerts Bar */}
      <CriticalAlertsBanner items={data.needsAttention} onNavigateTab={onNavigateTab} />

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="Total Users"
          value={data.totalPlatformUsers}
          icon={<IconUsers size={20} />}
          trend={data.growth.userGrowthRate !== 0 ? { value: data.growth.userGrowthRate, label: 'WoW' } : undefined}
          detail={`${data.users.totalCoaches.toLocaleString()} coaches · ${data.users.totalPlayers.toLocaleString()} players${data.users.totalAdmins > 0 ? ` · ${data.users.totalAdmins} admin` : ''}`}
          accentColor="green"
        />
        <AdminStatCard
          label="Weekly Active"
          value={data.health.activeUsers7d}
          icon={<IconTarget size={20} />}
          trend={roundsWoW !== 0 ? { value: roundsWoW, label: 'round vol. WoW' } : undefined}
          detail={`${data.health.roundsToday} round${data.health.roundsToday !== 1 ? 's' : ''} today · ${data.health.roundsThisWeek.toLocaleString()} this week`}
          accentColor="blue"
        />
        <AdminStatCard
          label="Open Incidents"
          value={data.errorLogs.incidentCounts.open}
          icon={<IconActivity size={20} />}
          accentColor={data.errorLogs.incidentCounts.openCritical > 0 ? 'red' : (data.errorLogs.incidentCounts.open > 0 || data.errorLogs.incidentCounts.active > 0) ? 'amber' : 'green'}
          suffix={data.errorLogs.incidentCounts.open > 0 ? ' unresolved' : ''}
          detail={
            data.errorLogs.incidentCounts.open > 0
              ? `${data.errorLogs.totalErrors7d.toLocaleString()} errors (7d) · ${data.errorLogs.incidentCounts.openCritical} critical`
              : data.errorLogs.totalErrors7d > 0
                ? `${data.errorLogs.totalErrors7d.toLocaleString()} errors (7d) · all resolved`
                : 'No errors this week'
          }
        />
        <AdminStatCard
          label="Health Score"
          value={data.growth.platformHealthScore}
          suffix="/100"
          icon={<IconSparkles size={20} />}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-4 py-3.5 rounded-2xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50">
          <div className="flex items-start sm:items-center gap-2.5 text-amber-800 text-sm font-medium min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <IconWarning size={14} className="text-amber-600" />
            </div>
            <span className="min-w-0">
              <span className="font-semibold">{atRiskTotal}</span> user{atRiskTotal !== 1 ? 's' : ''} inactive 14+ days
              {(atRiskCoaches > 0 || atRiskPlayers > 0) && (
                <span className="text-amber-600 font-normal ml-1">
                  ({atRiskCoaches} coach{atRiskCoaches !== 1 ? 'es' : ''}, {atRiskPlayers} player{atRiskPlayers !== 1 ? 's' : ''})
                </span>
              )}
            </span>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('people')}
              className="min-h-[44px] text-xs font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap transition-colors px-3 py-1.5 rounded-lg hover:bg-amber-100 self-end sm:self-auto"
            >
              Review &rarr;
            </button>
          )}
        </div>
      )}

      {/* ===== ZONE 2: ACTIVITY ===== */}

      {/* 2-col row: User Funnel + Error Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <UserFunnelViz funnel={data.playerFunnel.funnel} />
        <div className="space-y-2">
          <ErrorSpotlight errorDetection={data.errorDetection} errorLogs={data.errorLogs} />
          {onNavigateTab && (
            <div className="flex justify-end px-1">
              <button
                onClick={() => onNavigateTab('system')}
                className="min-h-[44px] text-xs font-medium text-warm-400 hover:text-primary-600 transition-colors px-2 py-2"
              >
                Full error log &rarr;
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
        <PlatformHealthCard health={data.health} infraHealth={data.infraHealth} statsCacheLastUpdated={data.statsCacheLastUpdated} />
        <div className="space-y-2">
          <UserBreakdownCard users={data.users} />
          {onNavigateTab && (
            <div className="flex justify-end px-1">
              <button
                onClick={() => onNavigateTab('people')}
                className="min-h-[44px] text-xs font-medium text-warm-400 hover:text-primary-600 transition-colors px-2 py-2"
              >
                All users &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
