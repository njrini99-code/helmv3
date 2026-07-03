'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminAreaChart, AdminDonutChart, AdminProgressBar, AdminFunnelChart } from './AdminChart';
import { IconChartBar } from '@/components/icons';

const ROUND_TYPE_COLORS: Record<string, string> = {
  practice: 'var(--color-primary-600)',
  tournament: '#2563EB',
  qualifier: '#F59E0B',
  casual: '#8B5CF6',
  unknown: '#9CA3AF',
};

interface Props {
  usage: AdminDashboardData['usage'];
  dataQuality?: AdminDashboardData['dataQuality'];
  funnel?: AdminDashboardData['funnel'];
}

function QualityGauge({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  return (
    <div className="bg-cream-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-warm-600">{label}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {percentage}%
        </span>
      </div>
      <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function UsageMetricsCard({ usage, dataQuality, funnel }: Props) {
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

  const funnelStages = funnel ? [
    { label: 'Started', value: funnel.roundsStarted, color: '#3B82F6' },
    { label: 'Completed', value: funnel.roundsCompleted, color: '#2563EB' },
    { label: 'Scored', value: funnel.roundsWithScore, color: 'var(--color-primary-600)' },
    { label: 'Reviewed', value: funnel.roundsReviewed, color: '#8B5CF6' },
    { label: 'With Insights', value: funnel.roundsWithInsights, color: '#F59E0B' },
  ] : [];

  return (
    <div className="glass-standard rounded-2xl p-6 transition-all duration-200 hover:bg-cream-50 active:bg-cream-100 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-cream-50 rounded-lg text-warm-500">
          <IconChartBar size={18} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Usage Metrics</h3>
      </div>

      {/* Shot stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-cream-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">
            {usage.totalShots.toLocaleString()}
          </p>
          <p className="text-xs text-warm-500 mt-0.5">Total Shots Tracked</p>
        </div>
        <div className="bg-cream-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-semibold text-warm-900 tabular-nums">
            {usage.totalRounds.toLocaleString()}
          </p>
          <p className="text-xs text-warm-500 mt-0.5">Total Rounds</p>
        </div>
      </div>

      {/* Shot data quality gauges */}
      {dataQuality && dataQuality.totalShots > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-2.5">Shot Data Quality</h4>
          <div className="grid grid-cols-3 gap-2">
            <QualityGauge
              label="Distance"
              percentage={dataQuality.distancePercentage}
              color={dataQuality.distancePercentage > 70 ? 'var(--color-primary-600)' : dataQuality.distancePercentage > 40 ? '#F59E0B' : '#EF4444'}
            />
            <QualityGauge
              label="Lie"
              percentage={dataQuality.liePercentage}
              color={dataQuality.liePercentage > 70 ? 'var(--color-primary-600)' : dataQuality.liePercentage > 40 ? '#F59E0B' : '#EF4444'}
            />
            <QualityGauge
              label="Club"
              percentage={dataQuality.clubPercentage}
              color={dataQuality.clubPercentage > 70 ? 'var(--color-primary-600)' : dataQuality.clubPercentage > 40 ? '#F59E0B' : '#EF4444'}
            />
          </div>
        </div>
      )}

      {/* Round completion funnel */}
      {funnel && funnel.roundsStarted > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-2.5">Round Completion Funnel</h4>
          <AdminFunnelChart stages={funnelStages} height={180} />
        </div>
      )}

      {/* Rounds by type donut */}
      {roundTypeData.length > 0 && (
        <div className="mb-5">
          <AdminDonutChart data={roundTypeData} title="Rounds by Type" />
        </div>
      )}

      {/* Rounds over time - area chart */}
      {roundsWeeklyData.length > 0 && (
        <div className="mb-5">
          <AdminAreaChart data={roundsWeeklyData} title="Rounds per Week (12 Weeks)" color="#2563EB" height={140} />
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
