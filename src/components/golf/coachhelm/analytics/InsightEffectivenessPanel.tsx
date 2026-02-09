'use client';

/**
 * InsightEffectivenessPanel - Shows metrics per insight type
 *
 * Displays action rate, improvement rate, and effectiveness score
 * with a bar chart comparing insight types.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import { IconSparkles, IconCheck, IconTrendingUp } from '@/components/icons';
import type { InsightEffectivenessData, InsightTypeMetrics } from '@/app/golf/actions/coachhelm-analytics';

interface InsightEffectivenessPanelProps {
  data: InsightEffectivenessData;
  compact?: boolean;
  className?: string;
}

export function InsightEffectivenessPanel({
  data,
  compact = false,
  className,
}: InsightEffectivenessPanelProps) {
  const chartData = useMemo(() => {
    return data.byType.map((m) => ({
      name: m.insightType,
      actionRate: Math.round(m.actionRate * 100),
      improvementRate: Math.round(m.improvementRate * 100),
      effectivenessScore: Math.round(m.effectivenessScore * 100),
      generated: m.insightsGenerated,
    }));
  }, [data.byType]);

  const hasData = data.byType.length > 0;

  // Compact view for overview tab
  if (compact) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Action Rate"
            value={`${Math.round(data.overall.overallActionRate * 100)}%`}
            icon={<IconCheck size={14} className="text-blue-500" />}
            color="blue"
          />
          <StatCard
            label="Improvement"
            value={`${Math.round(data.overall.overallImprovementRate * 100)}%`}
            icon={<IconTrendingUp size={14} className="text-green-500" />}
            color="green"
          />
          <StatCard
            label="Effectiveness"
            value={`${Math.round(data.overall.overallEffectivenessScore * 100)}%`}
            icon={<IconSparkles size={14} className="text-purple-500" />}
            color="purple"
          />
        </div>

        {/* Top 3 Types */}
        {hasData && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">
              Top Insight Types
            </p>
            {data.byType.slice(0, 3).map((m, i) => (
              <motion.div
                key={m.insightType}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center justify-between p-2 bg-warm-50 rounded-lg"
              >
                <span className="text-sm text-warm-700">{m.insightType}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warm-500">{m.insightsGenerated} generated</span>
                  <span
                    className={cn(
                      'text-xs font-medium px-1.5 py-0.5 rounded',
                      m.effectivenessScore >= 0.7
                        ? 'bg-green-100 text-green-700'
                        : m.effectivenessScore >= 0.4
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-warm-100 text-warm-600'
                    )}
                  >
                    {Math.round(m.effectivenessScore * 100)}%
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!hasData && <EmptyState />}
      </div>
    );
  }

  // Full view for insights tab
  return (
    <div className={cn('space-y-6', className)}>
      {/* Overall Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCardLarge
          label="Total Insights"
          value={data.overall.totalGenerated}
          subtext="Generated"
        />
        <StatCardLarge
          label="Action Rate"
          value={`${Math.round(data.overall.overallActionRate * 100)}%`}
          subtext={`${data.overall.totalActedUpon} acted upon`}
          color={data.overall.overallActionRate >= 0.5 ? 'green' : 'amber'}
        />
        <StatCardLarge
          label="Improvement Rate"
          value={`${Math.round(data.overall.overallImprovementRate * 100)}%`}
          subtext={`${data.overall.totalImproved} improved`}
          color={data.overall.overallImprovementRate >= 0.5 ? 'green' : 'amber'}
        />
        <StatCardLarge
          label="Effectiveness"
          value={`${Math.round(data.overall.overallEffectivenessScore * 100)}%`}
          subtext="Combined score"
          color={data.overall.overallEffectivenessScore >= 0.5 ? 'green' : 'amber'}
        />
      </div>

      {/* Chart */}
      {hasData && (
        <div className="bg-white rounded-xl border border-warm-100 p-4">
          <h4 className="text-sm font-medium text-warm-700 mb-4">Effectiveness by Type</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="effectivenessScore" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.effectivenessScore >= 70
                          ? '#16A34A'
                          : entry.effectivenessScore >= 40
                          ? '#F59E0B'
                          : '#94A3B8'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detailed Table */}
      {hasData && (
        <div className="bg-white rounded-xl border border-warm-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-warm-100">
            <h4 className="text-sm font-medium text-warm-700">Detailed Breakdown</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-warm-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-warm-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-warm-500 uppercase">
                    Generated
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-warm-500 uppercase">
                    Acted Upon
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-warm-500 uppercase">
                    Action Rate
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-warm-500 uppercase">
                    Improved
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-warm-500 uppercase">
                    Improvement Rate
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-warm-500 uppercase">
                    Effectiveness
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {data.byType.map((m) => (
                  <TableRow key={m.insightType} metrics={m} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasData && <EmptyState />}
    </div>
  );
}

// Helper Components

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    purple: 'bg-purple-50 border-purple-100',
  };

  return (
    <div className={cn('p-3 rounded-xl border', colors[color])}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-warm-500">{label}</span>
      </div>
      <span className="text-lg font-bold text-warm-900">{value}</span>
    </div>
  );
}

function StatCardLarge({
  label,
  value,
  subtext,
  color = 'slate',
}: {
  label: string;
  value: string | number;
  subtext: string;
  color?: 'green' | 'amber' | 'slate';
}) {
  return (
    <div className="p-4 bg-warm-50 rounded-xl">
      <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">{label}</p>
      <p
        className={cn(
          'text-2xl font-bold tabular-nums',
          color === 'green' && 'text-green-600',
          color === 'amber' && 'text-amber-600',
          color === 'slate' && 'text-warm-900'
        )}
      >
        {value}
      </p>
      <p className="text-xs text-warm-400 mt-1">{subtext}</p>
    </div>
  );
}

function TableRow({ metrics }: { metrics: InsightTypeMetrics }) {
  return (
    <tr className="hover:bg-warm-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-warm-900">{metrics.insightType}</td>
      <td className="px-4 py-3 text-sm text-warm-600 text-right tabular-nums">
        {metrics.insightsGenerated}
      </td>
      <td className="px-4 py-3 text-sm text-warm-600 text-right tabular-nums">
        {metrics.insightsActedUpon}
      </td>
      <td className="px-4 py-3 text-right">
        <RateIndicator value={metrics.actionRate} />
      </td>
      <td className="px-4 py-3 text-sm text-warm-600 text-right tabular-nums">
        {metrics.outcomesImproved}
      </td>
      <td className="px-4 py-3 text-right">
        <RateIndicator value={metrics.improvementRate} />
      </td>
      <td className="px-4 py-3 text-right">
        <RateIndicator value={metrics.effectivenessScore} highlighted />
      </td>
    </tr>
  );
}

function RateIndicator({ value, highlighted }: { value: number; highlighted?: boolean }) {
  const percentage = Math.round(value * 100);
  const color =
    percentage >= 70 ? 'text-green-600' : percentage >= 40 ? 'text-amber-600' : 'text-warm-500';
  const bgColor = highlighted
    ? percentage >= 70
      ? 'bg-green-100'
      : percentage >= 40
      ? 'bg-amber-100'
      : 'bg-warm-100'
    : '';

  return (
    <span
      className={cn(
        'text-sm font-medium tabular-nums',
        color,
        highlighted && 'px-2 py-0.5 rounded',
        bgColor
      )}
    >
      {percentage}%
    </span>
  );
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; actionRate: number; improvementRate: number; effectivenessScore: number; generated: number } }>;
}) {
  if (active && payload && payload.length && payload[0]) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-warm-200 px-4 py-3">
        <p className="text-sm font-semibold text-warm-900 mb-2">{data.name}</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-warm-500">Action Rate:</span>
            <span className="font-medium text-blue-600">{data.actionRate}%</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-warm-500">Improvement Rate:</span>
            <span className="font-medium text-green-600">{data.improvementRate}%</span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-warm-100">
            <span className="text-warm-500">Effectiveness:</span>
            <span className="font-bold text-purple-600">{data.effectivenessScore}%</span>
          </div>
          <div className="flex justify-between gap-4 pt-1">
            <span className="text-warm-500">Generated:</span>
            <span className="text-warm-700">{data.generated} insights</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function EmptyState() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-warm-100 flex items-center justify-center">
        <IconSparkles size={24} className="text-warm-400" />
      </div>
      <h4 className="text-sm font-medium text-warm-700 mb-1">No Insight Data Yet</h4>
      <p className="text-xs text-warm-500 max-w-xs mx-auto">
        Generate insights for your team to see effectiveness metrics here.
      </p>
    </div>
  );
}
