'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminBarChart, AdminDonutChart } from './AdminChart';
import { IconUsers, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import { cn } from '@/lib/utils';

interface Props {
  users: AdminDashboardData['users'];
}

export function UserBreakdownCard({ users }: Props) {
  const chartData = users.signupsByWeek.map((w) => ({
    label: w.week.slice(5),
    value: w.count,
  }));

  const signupDelta = users.newUsersThisWeek - users.newUsersLastWeek;
  const isGrowth = signupDelta >= 0;

  const statusData = users.playersByStatus.filter((s) => s.count > 0).map((s) => ({
    label: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.count,
    color: s.status === 'active' ? '#16A34A' : s.status === 'inactive' ? '#9CA3AF' : s.status === 'graduated' ? '#2563EB' : s.status === 'transferred' ? '#F59E0B' : '#8B5CF6',
  }));

  const yearData = users.playersByYear.filter((y) => y.count > 0).map((y) => ({
    label: y.year.charAt(0).toUpperCase() + y.year.slice(1),
    value: y.count,
    color: y.year === 'freshman' ? '#16A34A' : y.year === 'sophomore' ? '#2563EB' : y.year === 'junior' ? '#F59E0B' : y.year === 'senior' ? '#EF4444' : '#8B5CF6',
  }));

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconUsers size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">User Analytics</h3>
        </div>
        {/* Growth badge */}
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
          isGrowth ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        )}>
          {isGrowth ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
          {isGrowth ? '+' : ''}{signupDelta} this week
        </div>
      </div>

      {/* Role breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">{users.totalCoaches}</p>
          <p className="text-xs text-warm-500 mt-0.5">Coaches</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">{users.totalPlayers}</p>
          <p className="text-xs text-warm-500 mt-0.5">Players</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">{users.totalAdmins}</p>
          <p className="text-xs text-warm-500 mt-0.5">Admins</p>
        </div>
      </div>

      {/* Onboarding rates */}
      <div className="space-y-3 mb-5">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-warm-600">Coach Onboarding</span>
            <span className="text-warm-500 tabular-nums">{users.coachOnboardingRate}%</span>
          </div>
          <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 rounded-full transition-all duration-500"
              style={{ width: `${users.coachOnboardingRate}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-warm-600">Player Onboarding</span>
            <span className="text-warm-500 tabular-nums">{users.playerOnboardingRate}%</span>
          </div>
          <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${users.playerOnboardingRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active teams */}
      <div className="bg-white/50 rounded-xl p-3 mb-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-warm-600">Active Teams</span>
          <span className="text-xl font-semibold text-warm-900 tabular-nums">{users.activeTeams}</span>
        </div>
      </div>

      {/* Player status distribution */}
      {statusData.length > 0 && (
        <div className="mb-5">
          <AdminDonutChart data={statusData} title="Player Status" size={100} />
        </div>
      )}

      {/* Year distribution */}
      {yearData.length > 0 && (
        <div className="mb-5">
          <AdminDonutChart data={yearData} title="Class Year" size={100} />
        </div>
      )}

      {/* Signups chart */}
      {chartData.length > 0 && (
        <AdminBarChart data={chartData} title="New Signups (12 Weeks)" />
      )}
    </div>
  );
}
