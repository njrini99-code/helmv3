'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconTrendingUp } from '@/components/icons';

interface Props {
  engagement: AdminDashboardData['engagement'];
  totalPlayers: number;
  totalCoaches: number;
}

export function EngagementCard({ engagement, totalPlayers, totalCoaches }: Props) {
  // Mini sparkline for daily active users
  const maxDaily = Math.max(...engagement.dailyActiveUsers.map((d) => d.count), 1);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <IconTrendingUp size={18} />
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

      {/* Daily activity sparkline */}
      {engagement.dailyActiveUsers.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-2">Daily Activity (30d)</h4>
          <div className="flex items-end gap-[2px] h-16">
            {engagement.dailyActiveUsers.map((d, i) => {
              const h = Math.max((d.count / maxDaily) * 100, 3);
              const isToday = i === engagement.dailyActiveUsers.length - 1;
              return (
                <div
                  key={d.date}
                  className={cn(
                    'flex-1 rounded-t transition-all duration-200',
                    isToday ? 'bg-primary-500' : d.count > 0 ? 'bg-primary-300' : 'bg-warm-100'
                  )}
                  style={{ height: `${h}%`, minHeight: 2 }}
                  title={`${d.date}: ${d.count} rounds`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-warm-400">30d ago</span>
            <span className="text-[10px] text-warm-400">Today</span>
          </div>
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
