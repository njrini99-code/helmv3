'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconUsers, IconTrendingUp } from '@/components/icons';

interface Props {
  signupsByDay: AdminDashboardData['signupsByDay'];
  visitsByDay: AdminDashboardData['visitsByDay'];
}

function DailyBarChart({
  data,
  title,
  subtitle,
  color,
  icon,
}: {
  data: { date: string; count: number }[];
  title: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = data.length > 0 ? (total / data.length).toFixed(1) : '0';
  const todayCount = data[data.length - 1]?.count ?? 0;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            {icon}
          </div>
          <div>
            <h3 className="text-base font-semibold text-warm-900">{title}</h3>
            <p className="text-xs text-warm-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-xl font-semibold text-warm-900 tabular-nums">{todayCount}</p>
            <p className="text-[10px] text-warm-400">Today</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-warm-700 tabular-nums">{avg}</p>
            <p className="text-[10px] text-warm-400">Daily Avg</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-warm-700 tabular-nums">{total}</p>
            <p className="text-[10px] text-warm-400">30d Total</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex items-end gap-[3px] h-28">
        {data.map((d, i) => {
          const barHeight = (d.count / max) * 100;
          const isToday = i === data.length - 1;
          const dateLabel = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <div
              key={d.date}
              className="flex-1 group relative"
            >
              {/* Tooltip */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-warm-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {dateLabel}: {d.count}
              </div>
              <div
                className={cn(
                  'w-full rounded-t transition-all duration-200 group-hover:opacity-80',
                  isToday ? '' : d.count > 0 ? '' : 'bg-warm-100'
                )}
                style={{
                  height: `${Math.max(barHeight, 3)}%`,
                  backgroundColor: d.count > 0 ? (isToday ? color : `${color}99`) : undefined,
                  minHeight: 2,
                }}
              />
              {/* Show day labels for every 7th day */}
              {i % 7 === 0 && (
                <p className="text-[9px] text-warm-400 text-center mt-1 truncate">{dateLabel}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-warm-400">30 days ago</span>
        <span className="text-[10px] text-warm-400">Today</span>
      </div>
    </div>
  );
}

export function DailyCharts({ signupsByDay, visitsByDay }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DailyBarChart
        data={signupsByDay}
        title="User Signups by Day"
        subtitle="New account registrations"
        color="#16A34A"
        icon={<IconUsers size={18} />}
      />
      <DailyBarChart
        data={visitsByDay}
        title="Active Users by Day"
        subtitle="Unique users with round activity"
        color="#2563EB"
        icon={<IconTrendingUp size={18} />}
      />
    </div>
  );
}
