'use client';

/**
 * PredictionAccuracyPanel - Shows prediction model performance
 *
 * Displays accuracy rate over time, calibration chart, error distribution,
 * and overconfidence/underconfidence indicators.
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
} from 'recharts';
import { cn } from '@/lib/utils';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import {
  IconTarget,
  IconCheck,
} from '@/components/icons';
import type { PredictionPerformanceData } from '@/app/golf/actions/coachhelm-analytics';

interface PredictionAccuracyPanelProps {
  data: PredictionPerformanceData;
  compact?: boolean;
  className?: string;
}

export function PredictionAccuracyPanel({
  data,
  compact = false,
  className,
}: PredictionAccuracyPanelProps) {
  const hasAccuracyData = data.accuracyOverTime.length > 0;
  const hasCalibrationData = data.calibration.some((b) => b.predictionsCount > 0);
  const hasErrorData = data.errorDistribution.length > 0;

  // Format dates for chart
  const accuracyChartData = useMemo(() => {
    return data.accuracyOverTime.map((p) => ({
      ...p,
      date: formatDate(p.date),
      accuracyRate: Math.round(p.accuracyRate * 100),
    }));
  }, [data.accuracyOverTime]);

  // Calibration chart data
  const calibrationChartData = useMemo(() => {
    return data.calibration.map((b) => ({
      range: b.range,
      actual: Math.round(b.actualAccuracy * 100),
      expected: Math.round(b.expectedAccuracy * 100),
      count: b.predictionsCount,
      error: Math.round(b.calibrationError * 100),
    }));
  }, [data.calibration]);

  // Error distribution chart data (typed for Recharts compatibility)
  const errorChartData = useMemo(() => {
    return data.errorDistribution.map((e) => ({
      category: e.category,
      count: e.count,
      percentage: e.percentage,
    }));
  }, [data.errorDistribution]);

  // Compact view for overview tab
  if (compact) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            label="Accuracy"
            value={`${Math.round(data.summary.overallAccuracy * 100)}%`}
            icon={<IconTarget size={14} className="text-primary-500" />}
            color={data.summary.overallAccuracy >= 0.7 ? 'green' : 'amber'}
          />
          <StatCard
            label="Calibration"
            value={`${Math.round(data.summary.calibrationScore * 100)}%`}
            icon={<IconCheck size={14} className="text-blue-500" />}
            color={data.summary.calibrationScore >= 0.8 ? 'green' : 'amber'}
          />
          <StatCard
            // Show predictions made (activity), not validated (which stays 0
            // until rounds with outcomes are scored). Label clarifies the
            // denominator: "53 made · 0 validated" reads as honest pipeline,
            // "Predictions: 0" reads like the model isn't running.
            label="Predictions"
            value={
              data.summary.totalPredictions > 0
                ? `${data.summary.totalPredictions}`
                : '0'
            }
            icon={<IconTarget size={14} className="text-purple-500" />}
            color="slate"
          />
        </div>

        {/* Mini accuracy trend */}
        {hasAccuracyData && (
          <div className="bg-warm-50 rounded-xl p-3">
            <p className="text-xs font-medium text-warm-500 mb-2">Accuracy Trend</p>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accuracyChartData}>
                  <Line
                    type="monotone"
                    dataKey="accuracyRate"
                    stroke="#16A34A"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Confidence indicators */}
        <div className="flex items-center gap-3">
          <ConfidenceIndicator
            label="Overconfident"
            value={data.summary.overconfidenceRate}
            type="over"
          />
          <ConfidenceIndicator
            label="Underconfident"
            value={data.summary.underconfidenceRate}
            type="under"
          />
        </div>

        {!hasAccuracyData && <EmptyState />}
      </div>
    );
  }

  // Full view for predictions tab
  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCardLarge
          label="Total Predictions"
          value={data.summary.totalPredictions}
          subtext="Made"
        />
        <StatCardLarge
          label="Validated"
          value={data.summary.validatedPredictions}
          subtext="Confirmed"
        />
        <StatCardLarge
          label="Accuracy"
          value={`${Math.round(data.summary.overallAccuracy * 100)}%`}
          subtext="Overall"
          color={data.summary.overallAccuracy >= 0.7 ? 'green' : 'amber'}
        />
        <StatCardLarge
          label="Calibration"
          value={`${Math.round(data.summary.calibrationScore * 100)}%`}
          subtext="Score"
          color={data.summary.calibrationScore >= 0.8 ? 'green' : 'amber'}
        />
        <StatCardLarge
          label="Mean Error"
          value={data.summary.meanAbsoluteError.toFixed(1)}
          subtext="Strokes"
          color={data.summary.meanAbsoluteError <= 2 ? 'green' : 'amber'}
        />
      </div>

      {/* Accuracy Over Time Chart */}
      {hasAccuracyData && (
        <div className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
          <h4 className="text-sm font-medium text-warm-700 mb-4">Accuracy Over Time</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyChartData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length || !payload[0]) return null;
                    const d = payload[0].payload as {
                      date: string;
                      accuracyRate: number;
                      predictionsMade: number;
                      predictionsValidated: number;
                    };
                    // Accuracy is a pre-rounded integer percent; the two
                    // prediction counts are integers — all preserved exactly.
                    return (
                      <ChartTooltip
                        label={d.date}
                        rows={[
                          { name: 'Accuracy', value: d.accuracyRate, suffix: '%', color: '#16a34a' },
                          { name: 'Predictions', value: d.predictionsMade },
                          { name: 'Validated', value: d.predictionsValidated },
                        ]}
                        formatter={(v) => Math.round(v).toLocaleString()}
                      />
                    );
                  }}
                />
                <ReferenceLine y={70} stroke="#16A34A" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="accuracyRate"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={{ fill: '#16A34A', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-warm-400 mt-2 text-center">
            Dashed line indicates 70% accuracy target
          </p>
        </div>
      )}

      {/* Calibration Chart */}
      {hasCalibrationData && (
        <div className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
          <h4 className="text-sm font-medium text-warm-700 mb-1">Calibration Chart</h4>
          <p className="text-xs text-warm-500 mb-4">
            Comparing predicted confidence vs actual accuracy
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calibrationChartData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length || !payload[0]) return null;
                    const d = payload[0].payload as {
                      range: string;
                      actual: number;
                      expected: number;
                      count: number;
                    };
                    const diff = d.actual - d.expected;
                    // Actual-accuracy keeps its calibration color cue (green when
                    // within 10pts, amber otherwise). Percents are pre-rounded
                    // integers; count is an integer. All values preserved.
                    return (
                      <ChartTooltip
                        label={`${d.range} Confidence`}
                        rows={[
                          { name: 'Expected Accuracy', value: d.expected, suffix: '%' },
                          {
                            name: 'Actual Accuracy',
                            value: d.actual,
                            suffix: '%',
                            color: Math.abs(diff) <= 10 ? '#16a34a' : '#d97706',
                          },
                          { name: 'Predictions', value: d.count },
                        ]}
                        formatter={(v) => Math.round(v).toLocaleString()}
                      />
                    );
                  }}
                />
                <Bar dataKey="expected" fill="#e7e5e4" radius={[4, 4, 0, 0]} name="Expected" />
                <Bar dataKey="actual" radius={[4, 4, 0, 0]} name="Actual">
                  {calibrationChartData.map((entry, index) => {
                    const diff = Math.abs(entry.actual - entry.expected);
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={diff <= 10 ? '#16A34A' : diff <= 20 ? '#F59E0B' : '#EF4444'}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary-500" />
              Well Calibrated
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Minor Gap
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Significant Gap
            </span>
          </div>
        </div>
      )}

      {/* Error Distribution & Confidence Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Error Distribution */}
        {hasErrorData && (
          <div className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
            <h4 className="text-sm font-medium text-warm-700 mb-4">Error Distribution</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={errorChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="category"
                  >
                    {errorChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getErrorColor(entry.category)} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length || !payload[0]) return null;
                      const d = payload[0].payload as {
                        category: string;
                        count: number;
                        percentage: number;
                      };
                      // Preserve the exact "12 errors (34.5%)" reading: integer
                      // error count + 1-decimal percent, passed as a single
                      // pre-formatted string row.
                      return (
                        <ChartTooltip
                          label={d.category}
                          rows={[
                            {
                              name: '',
                              value: `${d.count} errors (${d.percentage.toFixed(1)}%)`,
                            },
                          ]}
                        />
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {data.errorDistribution.map((e) => (
                <span
                  key={e.category}
                  className="flex items-center gap-1 text-xs text-warm-600"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getErrorColor(e.category) }}
                  />
                  {e.category}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Analysis */}
        <div className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
          <h4 className="text-sm font-medium text-warm-700 mb-4">Confidence Analysis</h4>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-800">Overconfidence Rate</span>
                <span className="text-body-lg font-medium tracking-[-0.005em] text-amber-700">
                  {Math.round(data.summary.overconfidenceRate * 100)}%
                </span>
              </div>
              <p className="text-xs text-amber-600">
                Predictions with high confidence that turned out inaccurate
              </p>
              <ProgressBar value={data.summary.overconfidenceRate} color="amber" />
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">Underconfidence Rate</span>
                <span className="text-body-lg font-medium tracking-[-0.005em] text-blue-700">
                  {Math.round(data.summary.underconfidenceRate * 100)}%
                </span>
              </div>
              <p className="text-xs text-blue-600">
                Predictions with low confidence that turned out accurate
              </p>
              <ProgressBar value={data.summary.underconfidenceRate} color="blue" />
            </div>

            <div className="p-3 bg-warm-50 rounded-lg">
              <p className="text-xs text-warm-600">
                <strong>Ideal:</strong> Both rates should be low (&lt;15%). High overconfidence
                suggests the model is too certain; high underconfidence suggests missed
                opportunities.
              </p>
            </div>
          </div>
        </div>
      </div>

      {!hasAccuracyData && !hasCalibrationData && <EmptyState />}
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
  color: 'green' | 'amber' | 'slate';
}) {
  const colors = {
    green: 'bg-primary-50 border-primary-100',
    amber: 'bg-amber-50 border-amber-100',
    slate: 'bg-warm-50 border-warm-100',
  };

  return (
    <div className={cn('p-3 rounded-xl border', colors[color])}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-warm-500">{label}</span>
      </div>
      <span className="text-body-lg font-medium tracking-[-0.005em] text-warm-900">{value}</span>
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
          'text-h2 md:text-h1 font-light tabular-nums tracking-[-0.025em]',
          color === 'green' && 'text-primary-600',
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

function ConfidenceIndicator({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type: 'over' | 'under';
}) {
  const percentage = Math.round(value * 100);
  const isHigh = percentage > 15;

  return (
    <div
      className={cn(
        'flex-1 p-2 rounded-lg text-center',
        type === 'over' ? 'bg-amber-50' : 'bg-blue-50'
      )}
    >
      <p className="text-xs text-warm-500">{label}</p>
      <p
        className={cn(
          'text-body-sm font-medium',
          isHigh ? 'text-red-600' : type === 'over' ? 'text-amber-600' : 'text-blue-600'
        )}
      >
        {percentage}%
      </p>
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: 'amber' | 'blue' }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="mt-2">
      <div className="h-1.5 bg-cream-100/60 rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', color === 'amber' ? 'bg-amber-400' : 'bg-blue-400')}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value * 100, 100)}%` }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.8, ease: 'easeOut' })}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-warm-100 flex items-center justify-center">
        <IconTarget size={24} className="text-warm-400" />
      </div>
      <h4 className="text-sm font-medium text-warm-700 mb-1">No Prediction Data Yet</h4>
      <p className="text-xs text-warm-500 max-w-xs mx-auto">
        As predictions are made and validated, accuracy metrics will appear here.
      </p>
    </div>
  );
}

// Utility functions

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getErrorColor(category: string): string {
  const colors: Record<string, string> = {
    Overconfident: '#F59E0B',
    Underconfident: '#3B82F6',
    'Systematic Bias': '#EF4444',
    'Outlier Event': '#8B5CF6',
    'Data Quality': '#6B7280',
    'Model Limitation': '#EC4899',
    'External Factor': '#14B8A6',
  };
  return colors[category] || '#94A3B8';
}
