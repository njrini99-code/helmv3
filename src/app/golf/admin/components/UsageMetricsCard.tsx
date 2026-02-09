'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminBarChart, AdminDonutChart, AdminProgressBar } from './AdminChart';
import { IconChart } from '@/components/icons';

const ROUND_TYPE_COLORS: Record<string, string> = {
  practice: '#16A34A',
  tournament: '#2563EB',
  qualifier: '#F59E0B',
  casual: '#8B5CF6',
  unknown: '#9CA3AF',
};

interface Props {
  usage: AdminDashboardData['usage'];
}

export function UsageMetricsCard({ usage }: Props) {
  const roundTypeData = usage.roundsByType.map((r) => ({
    label: r.type.charAt(0).toUpperCase() + r.type.slice(1),
    value: r.count,
    color: ROUND_TYPE_COLORS[r.type] || '#9CA3AF',
  }));

  const roundsWeeklyData = usage.roundsByWeek.map((w) => ({
    label: w.week.slice(5),
    value: w.count,
  }));

  const maxFeature = Math.max(...usage.featureAdoption.map((f) => f.count), 1);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <IconChart size={18} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Usage Metrics</h3>
      </div>

      {/* Shot stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">
            {usage.totalShots.toLocaleString()}
          </p>
          <p className="text-xs text-warm-500 mt-0.5">Total Shots Tracked</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">
            {usage.totalRounds.toLocaleString()}
          </p>
          <p className="text-xs text-warm-500 mt-0.5">Total Rounds</p>
        </div>
      </div>

      {/* Data quality */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white/50 rounded-xl p-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-warm-600">Completion</span>
            <span className="text-warm-500 tabular-nums">{usage.roundsCompletionRate}%</span>
          </div>
          <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${usage.roundsCompletionRate}%` }}
            />
          </div>
        </div>
        <div className="bg-white/50 rounded-xl p-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-warm-600">Verified</span>
            <span className="text-warm-500 tabular-nums">{usage.verifiedRoundsRate}%</span>
          </div>
          <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${usage.verifiedRoundsRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Rounds by type donut */}
      {roundTypeData.length > 0 && (
        <div className="mb-5">
          <AdminDonutChart data={roundTypeData} title="Rounds by Type" />
        </div>
      )}

      {/* Rounds over time */}
      {roundsWeeklyData.length > 0 && (
        <div className="mb-5">
          <AdminBarChart data={roundsWeeklyData} title="Rounds per Week (12 Weeks)" color="#2563EB" />
        </div>
      )}

      {/* Feature adoption */}
      <div>
        <h4 className="text-sm font-medium text-warm-500 mb-3">Feature Adoption</h4>
        <div className="space-y-2">
          {usage.featureAdoption.map((f) => (
            <AdminProgressBar
              key={f.feature}
              label={f.feature}
              value={f.count}
              max={maxFeature}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
