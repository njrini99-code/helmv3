'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminAreaChart } from './AdminChart';
import { IconUsers, IconTrendingUp } from '@/components/icons';

interface Props {
  signupsByDay: AdminDashboardData['signupsByDay'];
  visitsByDay: AdminDashboardData['visitsByDay'];
}

function DailyAreaChartCard({
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
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = data.length > 0 ? (total / data.length).toFixed(1) : '0';
  const todayCount = data[data.length - 1]?.count ?? 0;
  const chartData = data.map((d) => ({
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: d.count,
  }));

  // Calculate dynamic height based on data variance
  const variance = data.length > 1
    ? Math.max(...data.map((d) => d.count)) - Math.min(...data.map((d) => d.count))
    : 0;
  const chartHeight = Math.max(160, Math.min(280, 180 + variance * 2));

  return (
    <div className="bg-white rounded-2xl border border-warm-200/50 shadow-sm p-4 sm:p-5 md:p-6">
      {/* Header: icon+title left, stats right — wraps on mobile */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-warm-100 rounded-xl text-warm-600 flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-warm-900 leading-snug">{title}</h3>
            <p className="text-xs text-warm-500">{subtitle}</p>
          </div>
        </div>

        {/* Stats row — always visible, wraps gracefully */}
        <div className="flex items-center gap-4 sm:gap-6 text-right flex-wrap">
          <div>
            <p className="text-xl sm:text-2xl font-bold text-warm-900 tabular-nums">{todayCount}</p>
            <p className="text-label text-warm-400 font-medium">Today</p>
          </div>
          <div>
            <p className="text-base sm:text-lg font-semibold text-warm-700 tabular-nums">{avg}</p>
            <p className="text-label text-warm-400 font-medium">Avg/Day</p>
          </div>
          <div>
            <p className="text-base sm:text-lg font-semibold text-warm-700 tabular-nums">{total}</p>
            <p className="text-label text-warm-400 font-medium">30d Total</p>
          </div>
        </div>
      </div>

      {/* Chart — uses ResizeObserver internally so it fills any width */}
      <AdminAreaChart
        data={chartData}
        title=""
        color={color}
        height={chartHeight}
      />
    </div>
  );
}

export function DailyCharts({ signupsByDay, visitsByDay }: Props) {
  return (
    // 1-col on mobile, 2-col on lg+
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <DailyAreaChartCard
        data={signupsByDay}
        title="User Signups by Day"
        subtitle="New account registrations"
        color="#16A34A"
        icon={<IconUsers size={20} />}
      />
      <DailyAreaChartCard
        data={visitsByDay}
        title="Active Users by Day"
        subtitle="Unique users with round activity"
        color="#2563EB"
        icon={<IconTrendingUp size={20} />}
      />
    </div>
  );
}
