'use client';

/**
 * Trend Visualization Component
 *
 * Multi-metric trend viewer with:
 * - Line charts for selected metrics
 * - Date range selector
 * - Trend direction indicators
 * - Prediction visualization
 * - Comparison overlays
 */

import { useState, useMemo } from 'react';
import type { TrendDirection } from '@/lib/types/golf';
import { TrendLineChart } from './TrendLineChart';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Local type definitions for this component's data structure
interface TrendDataPoint {
  date: string;
  value: number;
}

interface MetricTrendData {
  trend: TrendDirection;
  current_value: number;
  data: TrendDataPoint[];
}

interface MultiMetricTrendData {
  scoring_avg?: MetricTrendData;
  putts?: MetricTrendData;
  fairway_pct?: MetricTrendData;
  gir_pct?: MetricTrendData;
  sg_total?: MetricTrendData;
  sg_off_tee?: MetricTrendData;
  sg_approach?: MetricTrendData;
  sg_around_green?: MetricTrendData;
  sg_putting?: MetricTrendData;
}

interface TrendVisualizationProps {
  trends: MultiMetricTrendData;
  insights?: string[];
  prediction?: {
    predicted_score: number;
    confidence: number;
    range_low: number;
    range_high: number;
  };
  className?: string;
}

// Metric configuration
const METRICS_CONFIG = {
  scoring_avg: {
    label: 'Scoring Average',
    description: 'Average score per round',
    color: '#22c55e',
    isHigherBetter: false,
    format: (v: number) => v.toFixed(1),
    unit: 'strokes',
  },
  putts: {
    label: 'Putts per Round',
    description: 'Average putts per round',
    color: '#3b82f6',
    isHigherBetter: false,
    format: (v: number) => v.toFixed(1),
    unit: 'putts',
  },
  fairway_pct: {
    label: 'Fairway %',
    description: 'Percentage of fairways hit',
    color: '#8b5cf6',
    isHigherBetter: true,
    format: (v: number) => `${v.toFixed(1)}%`,
    unit: '',
  },
  gir_pct: {
    label: 'Greens in Regulation',
    description: 'Percentage of GIR',
    color: '#f59e0b',
    isHigherBetter: true,
    format: (v: number) => `${v.toFixed(1)}%`,
    unit: '',
  },
  sg_total: {
    label: 'Strokes Gained Total',
    description: 'Total strokes gained vs scratch',
    color: '#10b981',
    isHigherBetter: true,
    format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2),
    unit: '',
  },
  sg_off_tee: {
    label: 'SG: Off the Tee',
    description: 'Strokes gained driving',
    color: '#06b6d4',
    isHigherBetter: true,
    format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2),
    unit: '',
  },
  sg_approach: {
    label: 'SG: Approach',
    description: 'Strokes gained on approach shots',
    color: '#8b5cf6',
    isHigherBetter: true,
    format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2),
    unit: '',
  },
  sg_around_green: {
    label: 'SG: Around Green',
    description: 'Strokes gained short game',
    color: '#f59e0b',
    isHigherBetter: true,
    format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2),
    unit: '',
  },
  sg_putting: {
    label: 'SG: Putting',
    description: 'Strokes gained putting',
    color: '#ef4444',
    isHigherBetter: true,
    format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2),
    unit: '',
  },
} as const;

type MetricKey = keyof typeof METRICS_CONFIG;

export function TrendVisualization({
  trends,
  insights,
  prediction,
  className,
}: TrendVisualizationProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('scoring_avg');
  const [activeCategory, setActiveCategory] = useState<'performance' | 'strokes_gained'>('performance');

  // Group metrics by category
  const performanceMetrics: MetricKey[] = ['scoring_avg', 'putts', 'fairway_pct', 'gir_pct'];
  const strokesGainedMetrics: MetricKey[] = ['sg_total', 'sg_off_tee', 'sg_approach', 'sg_around_green', 'sg_putting'];

  const currentMetrics = activeCategory === 'performance' ? performanceMetrics : strokesGainedMetrics;

  // Get trend data for selected metric
  const selectedTrend = trends[selectedMetric as keyof MultiMetricTrendData];
  const config = METRICS_CONFIG[selectedMetric];

  // Get trend indicator styling
  const getTrendBadge = (trendData?: MetricTrendData) => {
    if (!trendData) return null;

    const direction = trendData.trend;
    const isGood = direction === 'improving';

    return {
      icon: direction === 'improving' ? '↑' : direction === 'declining' ? '↓' : '→',
      color: direction === 'stable' || direction === 'insufficient_data'
        ? 'bg-gray-100 text-gray-700'
        : isGood
        ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-700',
      label: direction.charAt(0).toUpperCase() + direction.slice(1).replace('_', ' '),
    };
  };

  // Quick stats summary
  const quickStats = useMemo(() => {
    const stats: Array<{
      label: string;
      value: string;
      trend: TrendDirection;
      isHigherBetter: boolean;
    }> = [];

    if (trends.scoring_avg) {
      stats.push({
        label: 'Scoring',
        value: trends.scoring_avg.current_value.toFixed(1),
        trend: trends.scoring_avg.trend,
        isHigherBetter: false,
      });
    }

    if (trends.putts) {
      stats.push({
        label: 'Putts',
        value: trends.putts.current_value.toFixed(1),
        trend: trends.putts.trend,
        isHigherBetter: false,
      });
    }

    if (trends.gir_pct) {
      stats.push({
        label: 'GIR',
        value: `${trends.gir_pct.current_value.toFixed(1)}%`,
        trend: trends.gir_pct.trend,
        isHigherBetter: true,
      });
    }

    if (trends.sg_total) {
      stats.push({
        label: 'SG Total',
        value: (trends.sg_total.current_value >= 0 ? '+' : '') + trends.sg_total.current_value.toFixed(2),
        trend: trends.sg_total.trend,
        isHigherBetter: true,
      });
    }

    return stats;
  }, [trends]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Quick Stats */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Performance Trends</h2>
          <p className="text-sm text-gray-500">Track your progress over time</p>
        </div>

        {/* Quick Stats Row */}
        <div className="flex items-center gap-3">
          {quickStats.map((stat, i) => {
            const isGood = stat.trend === 'improving';

            return (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
              >
                <span className="text-xs text-gray-500">{stat.label}:</span>
                <span className="text-sm font-semibold">{stat.value}</span>
                <span
                  className={cn(
                    'text-xs',
                    stat.trend === 'stable'
                      ? 'text-gray-500'
                      : isGood
                      ? 'text-green-500'
                      : 'text-red-500'
                  )}
                >
                  {stat.trend === 'improving' ? '↑' : stat.trend === 'declining' ? '↓' : '→'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveCategory('performance')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeCategory === 'performance'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          Performance Stats
        </button>
        <button
          onClick={() => setActiveCategory('strokes_gained')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeCategory === 'strokes_gained'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          Strokes Gained
        </button>
      </div>

      {/* Metric Selection */}
      <div className="flex flex-wrap gap-2">
        {currentMetrics.map((metric) => {
          const metricConfig = METRICS_CONFIG[metric];
          const trendData = trends[metric as keyof MultiMetricTrendData];
          const badge = getTrendBadge(trendData);

          return (
            <button
              key={metric}
              onClick={() => setSelectedMetric(metric)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                selectedMetric === metric
                  ? 'bg-white shadow-md border-2'
                  : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
              )}
              style={{
                borderColor: selectedMetric === metric ? metricConfig.color : undefined,
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: metricConfig.color }}
              />
              <span className="font-medium">{metricConfig.label}</span>
              {badge && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded', badge.color)}>
                  {badge.icon}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{config.label}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
            {selectedTrend && (
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: config.color }}>
                  {config.format(selectedTrend.current_value)}
                </div>
                <div className="text-xs text-gray-500">Current</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedTrend && selectedTrend.data.length > 0 ? (
            <TrendLineChart
              data={selectedTrend.data}
              metric={selectedMetric}
              color={config.color}
              height={300}
              showPrediction={false}
              showMovingAverage={true}
              isHigherBetter={config.isHigherBetter}
              formatValue={config.format}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No trend data available for this metric
            </div>
          )}
        </CardContent>
      </Card>

      {/* Multi-metric comparison grid */}
      <div className="grid grid-cols-2 gap-4">
        {currentMetrics
          .filter((m) => m !== selectedMetric)
          .slice(0, 4)
          .map((metric) => {
            const metricConfig = METRICS_CONFIG[metric];
            const trendData = trends[metric as keyof MultiMetricTrendData];

            return (
              <Card
                key={metric}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedMetric(metric)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{metricConfig.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {trendData && trendData.data.length > 0 ? (
                    <TrendLineChart
                      data={trendData.data}
                      metric={metric}
                      color={metricConfig.color}
                      height={150}
                      showPrediction={false}
                      showMovingAverage={false}
                      isHigherBetter={metricConfig.isHigherBetter}
                      formatValue={metricConfig.format}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                      No data
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </div>

      {/* Insights & Prediction */}
      <div className="grid grid-cols-2 gap-6">
        {/* Insights */}
        {insights && insights.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Trend Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span className="text-gray-700">{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Prediction */}
        {prediction && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Next Round Prediction</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600">
                  {prediction.predicted_score}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Expected Score
                </div>
                <div className="mt-3 text-sm text-gray-600">
                  Range: {prediction.range_low} - {prediction.range_high}
                </div>
                <div className="mt-2">
                  <Badge variant="outline">
                    {Math.round(prediction.confidence * 100)}% confidence
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Compact trend indicator for use in tables/lists
export function TrendIndicator({
  trend,
  value,
  isHigherBetter: _isHigherBetter = false,
  showValue = true,
  className,
}: {
  trend: TrendDirection;
  value?: number;
  isHigherBetter?: boolean;
  showValue?: boolean;
  className?: string;
}) {
  const isGood = trend === 'improving';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
        trend === 'stable'
          ? 'bg-gray-100 text-gray-600'
          : isGood
          ? 'bg-green-50 text-green-600'
          : 'bg-red-50 text-red-600',
        className
      )}
    >
      <span>
        {trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→'}
      </span>
      {showValue && value !== undefined && (
        <span>{Math.abs(value).toFixed(2)}</span>
      )}
    </div>
  );
}
