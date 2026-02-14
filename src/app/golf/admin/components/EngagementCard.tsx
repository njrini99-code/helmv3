'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { AdminAreaChart, AdminDonutChart } from './AdminChart';
import { TrendingUp } from 'lucide-react';

interface Props {
  engagement: AdminDashboardData['engagement'];
  totalPlayers: number;
  totalCoaches: number;
  playerEngagement?: AdminDashboardData['playerEngagement'];
  stickiness?: AdminDashboardData['stickiness'];
}

export function EngagementCard({ engagement, totalPlayers, totalCoaches, playerEngagement, stickiness }: Props) {
  // Convert daily active users to area chart data
  const dailyChartData = engagement.dailyActiveUsers.map((d) => ({
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: d.count,
  }));

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <TrendingUp size={18} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Engagement & Retention</h3>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white/50 rounded-xl p-3">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">
            {engagement.weeklyRetention}%
          </p>
          <p className="text-xs text-warm-500 mt-0.5">Weekly Active Rate</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">
            {engagement.avgRoundsPerPlayer}
          </p>
          <p className="text-xs text-warm-500 mt-0.5">Avg Rounds/Player</p>
        </div>
      </div>

      {/* Stickiness metric */}
      {stickiness && stickiness.mau > 0 && (
        <div className="bg-white/50 rounded-xl p-3 mb-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-warm-600">DAU/MAU Stickiness</span>
            <span className={cn(
              'text-xl font-semibold tabular-nums',
              stickiness.dauMauRatio > 20 ? 'text-emerald-600' : stickiness.dauMauRatio > 10 ? 'text-amber-600' : 'text-red-500'
            )}>
              {stickiness.dauMauRatio}%
            </span>
          </div>
        </div>
      )}

      {/* Daily activity - area chart */}
      {dailyChartData.length > 0 && (
        <div className="mb-5">
          <AdminAreaChart
            data={dailyChartData}
            title="Daily Activity (30d)"
            color="#16A34A"
            height={120}
          />
        </div>
      )}

      {/* Player engagement segments donut */}
      {playerEngagement && playerEngagement.segments.some((s) => s.count > 0) && (
        <div className="mb-5">
          <AdminDonutChart
            data={playerEngagement.segments.map((s) => ({
              label: s.label,
              value: s.count,
              color: s.color,
            }))}
            title="Player Engagement Segments"
            size={110}
          />
        </div>
      )}

      {/* Warning indicators */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-600">Inactive Players</span>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'font-medium tabular-nums',
              engagement.playersWithNoRounds > 0 ? 'text-amber-600' : 'text-emerald-600'
            )}>
              {engagement.playersWithNoRounds}
            </span>
            <span className="text-xs text-warm-400">of {totalPlayers}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-600">Coaches Using AI Insights</span>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-warm-800 tabular-nums">
              {engagement.coachesUsingInsights}
            </span>
            <span className="text-xs text-warm-400">of {totalCoaches}</span>
          </div>
        </div>
        {engagement.eventAttendanceRate != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-600">Event Attendance Rate</span>
            <span className="font-medium text-warm-800 tabular-nums">
              {engagement.eventAttendanceRate.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
