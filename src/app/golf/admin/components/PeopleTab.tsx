'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconUsers, IconWarning, IconUserX, IconCheckCircle2, IconMail, IconDownload } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { TeamHealthCards } from './TeamHealthCards';
import { TeamUserDirectory } from './TeamUserDirectory';
import { UserDetailPanel } from './UserDetailPanel';

interface Props {
  data: AdminDashboardData;
}

type ViewMode = 'all' | 'coaches' | 'players' | 'teams' | 'at_risk';

function isAtRisk(member: { daysSinceLastSeen: number | null; activityStatus: string }): boolean {
  return (member.daysSinceLastSeen !== null && member.daysSinceLastSeen > 14) || member.activityStatus === 'never';
}

function countAtRiskUsers(teams: AdminDashboardData['userActivity']['teams'], unassigned: AdminDashboardData['userActivity']['unassigned']): number {
  let count = 0;
  for (const team of teams) {
    for (const m of team.members) {
      if (isAtRisk(m)) count++;
    }
  }
  for (const u of unassigned) {
    if (isAtRisk(u)) count++;
  }
  return count;
}

export function PeopleTab({ data }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedAtRiskIds, setSelectedAtRiskIds] = useState<Set<string>>(new Set());

  const { userActivity, userDirectory } = data;
  const { summary } = userActivity;

  const atRiskCount = useMemo(() => countAtRiskUsers(userActivity.teams, userActivity.unassigned), [userActivity.teams, userActivity.unassigned]);

  // Filter teams based on viewMode
  const filteredTeams = useMemo(() => {
    if (viewMode === 'teams' || viewMode === 'all') return userActivity.teams;
    if (viewMode === 'coaches') {
      return userActivity.teams.map(t => ({
        ...t,
        members: t.members.filter(m => m.role === 'coach'),
        memberCount: t.members.filter(m => m.role === 'coach').length,
      })).filter(t => t.members.length > 0);
    }
    if (viewMode === 'players') {
      return userActivity.teams.map(t => ({
        ...t,
        members: t.members.filter(m => m.role === 'player'),
        memberCount: t.members.filter(m => m.role === 'player').length,
      })).filter(t => t.members.length > 0);
    }
    if (viewMode === 'at_risk') {
      return userActivity.teams.map(t => ({
        ...t,
        members: t.members.filter(m => isAtRisk(m)),
        memberCount: t.members.filter(m => isAtRisk(m)).length,
      })).filter(t => t.members.length > 0);
    }
    return userActivity.teams;
  }, [userActivity.teams, viewMode]);

  const filteredUnassigned = useMemo(() => {
    if (viewMode === 'teams') return userActivity.unassigned;
    if (viewMode === 'coaches') return userActivity.unassigned.filter(u => u.role === 'coach');
    if (viewMode === 'players') return userActivity.unassigned.filter(u => u.role === 'player');
    if (viewMode === 'at_risk') return userActivity.unassigned.filter(u => isAtRisk(u));
    return userActivity.unassigned;
  }, [userActivity.unassigned, viewMode]);

  // Collect all at-risk user IDs for bulk selection
  const allAtRiskIds = useMemo(() => {
    const ids: string[] = [];
    for (const team of userActivity.teams) {
      for (const m of team.members) {
        if (isAtRisk(m)) ids.push(m.id);
      }
    }
    for (const u of userActivity.unassigned) {
      if (isAtRisk(u)) ids.push(u.id);
    }
    return ids;
  }, [userActivity.teams, userActivity.unassigned]);

  function handleSelectAll() {
    if (selectedAtRiskIds.size === allAtRiskIds.length) {
      setSelectedAtRiskIds(new Set());
    } else {
      setSelectedAtRiskIds(new Set(allAtRiskIds));
    }
  }

  function handleEmailReengagement() {
    console.log('[PeopleTab] Email re-engagement triggered for users:', Array.from(selectedAtRiskIds.size > 0 ? selectedAtRiskIds : allAtRiskIds));
  }

  function handleExportCsv() {
    console.log('[PeopleTab] Export CSV triggered for at-risk users:', allAtRiskIds);
  }

  function handleSelectTeam(teamId: string) {
    setExpandedTeamId(teamId);
    const el = document.getElementById('team-user-directory');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const viewTabs: { label: string; value: ViewMode; count?: number }[] = [
    { label: 'All Users', value: 'all', count: summary.totalUsers },
    { label: 'Coaches', value: 'coaches' },
    { label: 'Players', value: 'players' },
    { label: 'Teams', value: 'teams', count: userActivity.teams.length },
    { label: 'At-Risk', value: 'at_risk', count: atRiskCount },
  ];

  const hasAtRiskUsers = atRiskCount > 0;
  const showAtRiskEmptyState = viewMode === 'at_risk' && !hasAtRiskUsers;

  return (
    <div className="space-y-6">
      {/* View Mode Sub-Tabs */}
      <div className="flex items-center gap-1 p-1 bg-warm-50/60 rounded-full border border-warm-100/50 w-fit">
        {viewTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setViewMode(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
              viewMode === tab.value
                ? 'bg-white shadow text-warm-900'
                : 'text-warm-500 hover:text-warm-700 hover:bg-white/40',
              tab.value === 'at_risk' && atRiskCount > 0 && viewMode !== 'at_risk' && 'text-red-500'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'ml-1.5 text-xs tabular-nums',
                viewMode === tab.value ? 'text-warm-500' : 'text-warm-400',
                tab.value === 'at_risk' && atRiskCount > 0 && 'text-red-400'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk Action Bar for At-Risk view */}
      {viewMode === 'at_risk' && hasAtRiskUsers && (
        <div className={cn(
          'flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl',
          'bg-red-50/60 border border-red-200/30',
          'backdrop-blur-sm'
        )}>
          <p className="text-sm font-semibold text-red-800">
            {atRiskCount} user{atRiskCount !== 1 ? 's' : ''} at risk
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleSelectAll}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                'bg-white/80 text-warm-700 hover:bg-white border border-warm-200/50'
              )}
            >
              {selectedAtRiskIds.size === allAtRiskIds.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleEmailReengagement}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                'bg-red-600 text-white hover:bg-red-700',
                'flex items-center gap-1.5'
              )}
            >
              <IconMail size={12} />
              Email Re-engagement
            </button>
            <button
              onClick={handleExportCsv}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                'bg-white/80 text-warm-700 hover:bg-white border border-warm-200/50',
                'flex items-center gap-1.5'
              )}
            >
              <IconDownload size={12} />
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* At-Risk Empty State */}
      {showAtRiskEmptyState && (
        <div className={cn(
          'flex flex-col items-center justify-center py-12 rounded-2xl',
          'bg-primary-50/40 border border-primary-200/30',
          'backdrop-blur-sm'
        )}>
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mb-3">
            <IconCheckCircle2 size={24} className="text-primary-600" />
          </div>
          <p className="text-sm font-semibold text-primary-900">No at-risk users!</p>
          <p className="text-xs text-primary-700 mt-1">All users are active.</p>
        </div>
      )}

      {/* Team Health Cards - hide in at_risk empty state */}
      {!showAtRiskEmptyState && (viewMode === 'all' || viewMode === 'teams') && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-warm-900">Teams</h3>
            <span className="text-xs text-warm-400">{userActivity.teams.length} teams</span>
          </div>
          <TeamHealthCards teams={userActivity.teams} onSelectTeam={handleSelectTeam} />
        </div>
      )}

      {/* Alert Banners - only show in 'all' mode */}
      {viewMode === 'all' && (
        <div className="space-y-2">
          {summary.neverLoggedIn > 0 && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-2xl',
              'bg-amber-50/80 border border-amber-200/40',
              'backdrop-blur-sm'
            )}>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconUserX size={18} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  {summary.neverLoggedIn} of {summary.totalUsers} users have never logged in
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {Math.round((summary.neverLoggedIn / Math.max(summary.totalUsers, 1)) * 100)}% never-login rate suggests onboarding needs attention.
                </p>
              </div>
            </div>
          )}

          {summary.inactivePlus14d > 0 && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-2xl',
              'bg-red-50/80 border border-red-200/40',
              'backdrop-blur-sm'
            )}>
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconWarning size={18} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900">
                  {summary.inactivePlus14d} users inactive for 14+ days
                </p>
                <p className="text-xs text-red-700 mt-1">
                  These users logged in before but haven&apos;t been back. Re-engagement needed.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Stats Row */}
      {!showAtRiskEmptyState && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total Users" value={summary.totalUsers} icon={<IconUsers size={14} />} />
          <SummaryCard label="Active Today" value={summary.activeToday} color={summary.activeToday > 0 ? 'green' : undefined} icon={<div className="w-2 h-2 rounded-full bg-primary-500" />} />
          <SummaryCard label="Active 7d" value={summary.activeThisWeek} color={summary.activeThisWeek > 5 ? 'green' : undefined} />
          <SummaryCard label="Never Logged In" value={summary.neverLoggedIn} color={summary.neverLoggedIn > 0 ? 'amber' : undefined} />
          <SummaryCard label="Inactive 14d+" value={summary.inactivePlus14d} color={summary.inactivePlus14d > 0 ? 'red' : undefined} />
          <SummaryCard label="Churn Risk" value={summary.churnRisk} color={summary.churnRisk > 0 ? 'red' : undefined} />
        </div>
      )}

      {/* Team User Directory */}
      {!showAtRiskEmptyState && (
        <div id="team-user-directory">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-warm-900">User Directory</h3>
            <span className="text-xs text-warm-400">
              {viewMode === 'all' ? 'Grouped by team' :
               viewMode === 'coaches' ? 'Coaches only' :
               viewMode === 'players' ? 'Players only' :
               viewMode === 'teams' ? 'Grouped by team' :
               'At-risk users'}
            </span>
          </div>
          <TeamUserDirectory
            teams={filteredTeams}
            unassigned={filteredUnassigned}
            onSelectUser={setSelectedUserId}
            expandedTeamId={expandedTeamId}
          />
        </div>
      )}

      {/* User Detail Slide-Over */}
      {selectedUserId && (
        <UserDetailPanel
          userId={selectedUserId}
          teams={userActivity.teams}
          unassigned={userActivity.unassigned}
          userDirectory={userDirectory}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn(
      'p-3 rounded-xl glass-standard',
      'text-center'
    )}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <p className={cn(
          'text-xl font-bold tabular-nums',
          color === 'green' ? 'text-primary-600' :
          color === 'amber' ? 'text-amber-600' :
          color === 'red' ? 'text-red-600' :
          'text-warm-900'
        )}>{value}</p>
      </div>
      <p className="text-micro text-warm-400 uppercase tracking-wider font-medium">{label}</p>
    </div>
  );
}
