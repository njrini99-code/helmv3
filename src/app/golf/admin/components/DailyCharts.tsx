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

      <AdminAreaChart
        data={chartData}
        title=""
        color={color}
        height={120}
      />
    </div>
  );
}

export function DailyCharts({ signupsByDay, visitsByDay }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DailyAreaChartCard
        data={signupsByDay}
        title="User Signups by Day"
        subtitle="New account registrations"
        color="#16A34A"
        icon={<IconUsers size={18} />}
      />
      <DailyAreaChartCard
        data={visitsByDay}
        title="Active Users by Day"
        subtitle="Unique users with round activity"
        color="#2563EB"
        icon={<IconTrendingUp size={18} />}
      />
    </div>
  );
}
