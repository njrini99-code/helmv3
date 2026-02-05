'use client';

/**
 * Strokes Gained Dashboard
 *
 * Complete SG visualization including:
 * - Radar chart overview
 * - Category breakdown bars
 * - Trend lines for each category
 * - Comparison to baselines
 * - Insights and recommendations
 */

import { useState } from 'react';
import type { ComparisonBaseline } from '@/lib/types/golf';
import {
  identifyStrengthsWeaknesses,
  formatStrokesGained,
  getStrokesGainedColor,
  type StrokesGainedResult,
  type StrokesGainedBreakdown,
  type StatisticalStrengthWeakness,
} from '@/lib/golf/strokes-gained';
import { StrokesGainedRadar } from './StrokesGainedRadar';
import { StrokesGainedBreakdownChart, StrokesGainedCompact } from './StrokesGainedBreakdownChart';
import { TrendLineChart } from './TrendLineChart';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

// Local type for trend data points
interface StrokesGainedTrend extends StrokesGainedResult {
  date: string;
  round_id?: string;
}

interface StrokesGainedDashboardProps {
  data: StrokesGainedResult | StrokesGainedBreakdown;
  trendData?: StrokesGainedTrend[];
  comparisonData?: {
    baseline: ComparisonBaseline;
    data: StrokesGainedResult;
    label: string;
  };
  insights?: string[];
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
  showTrends?: boolean;
  showComparison?: boolean;
  className?: string;
}

export function StrokesGainedDashboard({
  data,
  trendData,
  comparisonData,
  insights,
  statisticalStrengths,
  statisticalWeaknesses,
  showTrends = true,
  showComparison = true,
  className,
}: StrokesGainedDashboardProps) {
  const [selectedCategory, setSelectedCategory] = useState<keyof StrokesGainedResult | null>(null);

  // Cast data to StrokesGainedResult since StrokesGainedBreakdown extends it
  // This ensures we can access the common SG properties
  const sgData = data as StrokesGainedResult;

  // Identify strengths and weaknesses
  const { strengths, weaknesses, primaryStrength, primaryWeakness } = identifyStrengthsWeaknesses(sgData);

  // Categories for trend selection
  const categories = [
    { key: 'sg_total' as const, label: 'Total', color: '#22c55e' },
    { key: 'sg_off_tee' as const, label: 'Off the Tee', color: '#3b82f6' },
    { key: 'sg_approach' as const, label: 'Approach', color: '#8b5cf6' },
    { key: 'sg_around_green' as const, label: 'Around Green', color: '#f59e0b' },
    { key: 'sg_putting' as const, label: 'Putting', color: '#ef4444' },
  ];

  // Convert trend data to TrendPoint format
  const getTrendPoints = (key: keyof StrokesGainedResult) => {
    if (!trendData) return [];
    return trendData.map(t => ({
      date: t.date,
      value: t[key],
      round_id: t.round_id,
    }));
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-warm-900">Strokes Gained Analysis</h2>
          <p className="text-sm text-slate-500">
            Performance relative to scratch golfer baseline
          </p>
        </div>

        {/* Quick summary badges */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium',
              sgData.sg_total >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            )}
          >
            {formatStrokesGained(sgData.sg_total)} Total
          </div>
          {primaryStrength && (
            <Badge variant="outline" className="text-green-600 border-green-200">
              Strong: {primaryStrength}
            </Badge>
          )}
          {primaryWeakness && (
            <Badge variant="outline" className="text-red-600 border-red-200">
              Focus: {primaryWeakness}
            </Badge>
          )}
        </div>
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">Detailed Breakdown</TabsTrigger>
          {showTrends && trendData && trendData.length > 0 && (
            <TabsTrigger value="trends">Trends</TabsTrigger>
          )}
          {showComparison && comparisonData && (
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-3 gap-6">
            {/* Radar Chart */}
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Performance Radar</CardTitle>
                <CardDescription>
                  Your strokes gained by category vs scratch (0 line)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StrokesGainedRadar
                  data={sgData}
                  comparisonData={comparisonData?.data}
                  comparisonLabel={comparisonData?.label}
                  showComparison={showComparison && !!comparisonData}
                  size={350}
                />
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="space-y-4">
              {/* Category Cards */}
              {categories.map((cat) => {
                const value = sgData[cat.key];
                return (
                  <Card
                    key={cat.key}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      selectedCategory === cat.key && 'ring-2 ring-offset-2',
                    )}
                    style={{ ['--tw-ring-color' as string]: cat.color }}
                    onClick={() => setSelectedCategory(
                      selectedCategory === cat.key ? null : cat.key
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm font-medium text-slate-700">
                            {cat.label}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'text-lg font-bold',
                            getStrokesGainedColor(value)
                          )}
                        >
                          {formatStrokesGained(value)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Insights Section */}
          {insights && insights.length > 0 && (
            <Card className="mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Key Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-green-500 mt-0.5">•</span>
                      <span className="text-slate-700">{insight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Strengths and Weaknesses */}
          <div className="grid grid-cols-2 gap-6 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-green-600">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                {statisticalStrengths && statisticalStrengths.length > 0 ? (
                  <div className="space-y-3">
                    {statisticalStrengths.map((s, i) => (
                      <StrengthWeaknessCard key={i} item={s} type="strength" />
                    ))}
                  </div>
                ) : strengths.length > 0 ? (
                  <ul className="space-y-1">
                    {strengths.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-green-500">✓</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    No standout strengths identified (all categories near scratch level)
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-600">Areas for Improvement</CardTitle>
              </CardHeader>
              <CardContent>
                {statisticalWeaknesses && statisticalWeaknesses.length > 0 ? (
                  <div className="space-y-3">
                    {statisticalWeaknesses.map((w, i) => (
                      <StrengthWeaknessCard key={i} item={w} type="weakness" />
                    ))}
                  </div>
                ) : weaknesses.length > 0 ? (
                  <ul className="space-y-1">
                    {weaknesses.map((w, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-red-500" aria-hidden="true">→</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    No major weaknesses identified - well-rounded game
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category Breakdown</CardTitle>
              <CardDescription>
                Detailed strokes gained by category with shot counts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StrokesGainedBreakdownChart
                data={data}
                comparisonData={comparisonData?.data}
                comparisonLabel={comparisonData?.label}
                showPerShot={'shots_off_tee' in data}
                maxValue={2}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        {showTrends && trendData && trendData.length > 0 && (
          <TabsContent value="trends">
            <div className="space-y-6">
              {/* Total SG Trend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Total Strokes Gained Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendLineChart
                    data={getTrendPoints('sg_total')}
                    metric="sg_total"
                    color="#22c55e"
                    height={250}
                    showPrediction={true}
                    isHigherBetter={true}
                    formatValue={(v) => formatStrokesGained(v)}
                  />
                </CardContent>
              </Card>

              {/* Category Trends */}
              <div className="grid grid-cols-2 gap-4">
                {categories.slice(1).map((cat) => (
                  <Card key={cat.key}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{cat.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TrendLineChart
                        data={getTrendPoints(cat.key)}
                        metric={cat.key}
                        color={cat.color}
                        height={180}
                        showPrediction={false}
                        showMovingAverage={true}
                        isHigherBetter={true}
                        formatValue={(v) => formatStrokesGained(v)}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        )}

        {/* Comparison Tab */}
        {showComparison && comparisonData && (
          <TabsContent value="comparison">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Comparison vs {comparisonData.label}
                </CardTitle>
                <CardDescription>
                  How your strokes gained compares to {comparisonData.label.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Radar comparison */}
                  <StrokesGainedRadar
                    data={sgData}
                    comparisonData={comparisonData.data}
                    comparisonLabel={comparisonData.label}
                    showComparison={true}
                    size={350}
                  />

                  {/* Detailed comparison table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-white/40">
                        <tr>
                          <th className="text-left px-4 py-2 text-sm font-medium text-slate-700">
                            Category
                          </th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-slate-700">
                            You
                          </th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-slate-700">
                            {comparisonData.label}
                          </th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-slate-700">
                            Difference
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {categories.map((cat) => {
                          const yours = sgData[cat.key];
                          const theirs = comparisonData.data[cat.key];
                          const diff = yours - theirs;

                          return (
                            <tr key={cat.key}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: cat.color }}
                                  />
                                  <span className="text-sm">{cat.label}</span>
                                </div>
                              </td>
                              <td
                                className={cn(
                                  'text-right px-4 py-3 font-medium',
                                  getStrokesGainedColor(yours)
                                )}
                              >
                                {formatStrokesGained(yours)}
                              </td>
                              <td className="text-right px-4 py-3 text-slate-600">
                                {formatStrokesGained(theirs)}
                              </td>
                              <td
                                className={cn(
                                  'text-right px-4 py-3 font-medium',
                                  diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-500'
                                )}
                              >
                                {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Rich strength/weakness card for statistical data
function StrengthWeaknessCard({
  item,
  type,
}: {
  item: StatisticalStrengthWeakness;
  type: 'strength' | 'weakness';
}) {
  const isStrength = type === 'strength';
  const sign = item.strokeImpact >= 0 ? '+' : '';
  const impactColor = isStrength ? 'text-green-600' : 'text-red-600';
  const impactBg = isStrength ? 'bg-green-50' : 'bg-red-50';
  const borderColor = isStrength ? 'border-green-100' : 'border-red-100';

  return (
    <div className={cn('rounded-lg border p-3', borderColor)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warm-900 truncate">
            {item.label}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap',
            impactBg,
            impactColor
          )}
        >
          {sign}{item.strokeImpact.toFixed(1)}
        </span>
      </div>
      {item.recommendation && (
        <p className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
          {item.recommendation}
        </p>
      )}
    </div>
  );
}

// Compact version for embedding in other views
export function StrokesGainedSummary({
  data,
  showDetails = false,
  className,
}: {
  data: StrokesGainedResult;
  showDetails?: boolean;
  className?: string;
}) {
  const { primaryStrength, primaryWeakness } = identifyStrengthsWeaknesses(data);

  return (
    <div className={cn('', className)}>
      <StrokesGainedCompact data={data} />
      {showDetails && (primaryStrength || primaryWeakness) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {primaryStrength && (
            <span className="text-green-600">Strong: {primaryStrength}</span>
          )}
          {primaryStrength && primaryWeakness && <span className="text-slate-300">|</span>}
          {primaryWeakness && (
            <span className="text-red-600">Focus: {primaryWeakness}</span>
          )}
        </div>
      )}
    </div>
  );
}
