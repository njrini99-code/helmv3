'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Users, AlertTriangle, UserX } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { TeamHealthCards } from './TeamHealthCards';
import { TeamUserDirectory } from './TeamUserDirectory';
import { UserDetailPanel } from './UserDetailPanel';

interface Props {
  data: AdminDashboardData;
}

export function PeopleTab({ data }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const { userActivity, userDirectory } = data;
  const { summary } = userActivity;

  function handleSelectTeam(teamId: string) {
    setExpandedTeamId(teamId);
    // Scroll to the directory
    const el = document.getElementById('team-user-directory');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-6">
      {/* Team Health Cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-warm-900">Teams</h3>
          <span className="text-xs text-warm-400">{userActivity.teams.length} teams</span>
        </div>
        <TeamHealthCards teams={userActivity.teams} onSelectTeam={handleSelectTeam} />
      </div>

      {/* Alert Banners */}
      <div className="space-y-2">
        {summary.neverLoggedIn > 0 && (
          <div className={cn(
            'flex items-start gap-3 p-4 rounded-2xl',
            'bg-amber-50/80 border border-amber-200/40',
            'backdrop-blur-sm'
          )}>
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <UserX size={18} className="text-amber-600" />
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
              <AlertTriangle size={18} className="text-red-600" />
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

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Users" value={summary.totalUsers} icon={<Users size={14} />} />
        <SummaryCard label="Active Today" value={summary.activeToday} color={summary.activeToday > 0 ? 'green' : undefined} icon={<div className="w-2 h-2 rounded-full bg-primary-500" />} />
        <SummaryCard label="Active 7d" value={summary.activeThisWeek} color={summary.activeThisWeek > 5 ? 'green' : undefined} />
        <SummaryCard label="Never Logged In" value={summary.neverLoggedIn} color={summary.neverLoggedIn > 0 ? 'amber' : undefined} />
        <SummaryCard label="Inactive 14d+" value={summary.inactivePlus14d} color={summary.inactivePlus14d > 0 ? 'red' : undefined} />
        <SummaryCard label="Churn Risk" value={summary.churnRisk} color={summary.churnRisk > 0 ? 'red' : undefined} />
      </div>

      {/* Team User Directory */}
      <div id="team-user-directory">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-warm-900">User Directory</h3>
          <span className="text-xs text-warm-400">Grouped by team</span>
        </div>
        <TeamUserDirectory
          teams={userActivity.teams}
          unassigned={userActivity.unassigned}
          onSelectUser={setSelectedUserId}
          expandedTeamId={expandedTeamId}
        />
      </div>

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
      <p className="text-[10px] text-warm-400 uppercase tracking-wider font-medium">{label}</p>
    </div>
  );
}
