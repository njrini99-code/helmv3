'use client';

/**
 * Unified Stats Dashboard
 *
 * Complete stats view combining all statistics components:
 * 1. Key Performance Indicators
 * 2. Strokes Gained Breakdown
 * 3. Trend Analysis
 * 4. Shot Distribution
 * 5. Comparison Views
 */

import { useState, useEffect } from 'react';
import type {
  PlayerStats,
  MultiMetricTrend,
  StrokesGainedResult,
  StrokesGainedTrend,
  ComparisonBaseline,
  ComparisonResult,
  WeakAreaIdentification,
  DataQuality,
} from '@/lib/types/golf';
import { GolfStatCard, KPIRow, ScoringDistribution } from './StatCard';
import { StrokesGainedDashboard, StrokesGainedSummary } from './StrokesGainedDashboard';
import { TrendVisualization, TrendIndicator } from './TrendVisualization';
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

interface StatsDashboardProps {
  stats: PlayerStats;
  trends?: MultiMetricTrend;
  strokesGainedTrends?: StrokesGainedTrend[];
  comparison?: ComparisonResult;
  weakAreas?: WeakAreaIdentification[];
  dataQuality?: DataQuality;
  trendInsights?: string[];
  prediction?: {
    predicted_score: number;
    confidence: number;
    range_low: number;
    range_high: number;
  };
  onRefresh?: () => void;
  loading?: boolean;
  className?: string;
}

export function StatsDashboard({
  stats,
  trends,
  strokesGainedTrends,
  comparison,
  weakAreas,
  dataQuality,
  trendInsights,
  prediction,
  onRefresh,
  loading = false,
  className,
}: StatsDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Data quality indicator
  const getDataQualityBadge = () => {
    if (!dataQuality) return null;

    const colors = {
      high: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-red-100 text-red-700',
    };

    return (
      <Badge className={cn('text-xs', colors[dataQuality.data_confidence])}>
        {dataQuality.data_confidence === 'high'
          ? 'Full Data'
          : dataQuality.data_confidence === 'medium'
          ? 'Partial Data'
          : 'Limited Data'}
      </Badge>
    );
  };

  if (stats.total_rounds === 0) {
    return (
      <div className={cn('', className)}>
        <Card className="py-12">
          <CardContent className="text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Stats Available</h3>
            <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
              Complete some rounds to see your performance statistics and trends.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">Player Statistics</h2>
            {getDataQualityBadge()}
          </div>
          <p className="text-sm text-gray-500">
            Based on {stats.total_rounds} round{stats.total_rounds !== 1 ? 's' : ''}
            {stats.period_start && stats.period_end && (
              <span className="ml-1">
                ({new Date(stats.period_start).toLocaleDateString()} -{' '}
                {new Date(stats.period_end).toLocaleDateString()})
              </span>
            )}
          </p>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg
              className={cn('w-4 h-4', loading && 'animate-spin')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        )}
      </div>

      {/* KPI Row */}
      <KPIRow
        scoringAvg={stats.scoring_avg}
        puttsPerRound={stats.avg_putts}
        fairwayPct={stats.fairway_percentage}
        girPct={stats.gir_percentage}
        sgTotal={stats.strokes_gained.sg_total}
        trends={
          trends
            ? {
                scoringAvg: trends.scoring_avg?.trend,
                putts: trends.putts?.trend,
                fairway: trends.fairway_pct?.trend,
                gir: trends.gir_pct?.trend,
                sg: trends.sg_total?.trend,
              }
            : undefined
        }
      />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="strokes-gained">Strokes Gained</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          {comparison && <TabsTrigger value="comparison">Comparison</TabsTrigger>}
          {weakAreas && weakAreas.length > 0 && (
            <TabsTrigger value="development">Development</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Main Stats */}
            <div className="col-span-2 space-y-6">
              {/* Scoring Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Scoring Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{stats.best_round}</div>
                      <div className="text-xs text-gray-500">Best Round</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{stats.scoring_avg.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">Average</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-600">{stats.worst_round}</div>
                      <div className="text-xs text-gray-500">Worst Round</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{stats.total_rounds}</div>
                      <div className="text-xs text-gray-500">Rounds</div>
                    </div>
                  </div>

                  {/* Scoring Distribution */}
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Scoring Distribution</h4>
                    <ScoringDistribution
                      eagles={stats.eagles}
                      birdies={stats.birdies}
                      pars={stats.pars}
                      bogeys={stats.bogeys}
                      doublePlus={stats.double_bogeys_plus}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Performance Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Fairways Hit</span>
                        <span className="font-semibold">{stats.fairway_percentage.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Greens in Regulation</span>
                        <span className="font-semibold">{stats.gir_percentage.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Average Putts</span>
                        <span className="font-semibold">{stats.avg_putts.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Up & Down %</span>
                        <span className="font-semibold">{stats.up_and_down_percentage.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Sand Save %</span>
                        <span className="font-semibold">{stats.sand_save_percentage.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Penalties / Round</span>
                        <span className="font-semibold">{stats.avg_penalty_strokes.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Strokes Gained Summary */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Strokes Gained Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <StrokesGainedSummary data={stats.strokes_gained} showDetails={true} />
                </CardContent>
              </Card>

              {/* Quick Insights */}
              {trendInsights && trendInsights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {trendInsights.slice(0, 3).map((insight, i) => (
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
                  <CardContent className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {prediction.predicted_score}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Range: {prediction.range_low} - {prediction.range_high}
                    </div>
                    <Badge variant="outline" className="mt-2">
                      {Math.round(prediction.confidence * 100)}% confidence
                    </Badge>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Strokes Gained Tab */}
        <TabsContent value="strokes-gained">
          <StrokesGainedDashboard
            data={stats.strokes_gained}
            trendData={strokesGainedTrends}
            comparisonData={
              comparison
                ? {
                    baseline: comparison.baseline,
                    data: {
                      sg_off_tee: comparison.comparisons.find(c => c.metric === 'SG: Off the Tee')?.comparison_value || 0,
                      sg_approach: comparison.comparisons.find(c => c.metric === 'SG: Approach')?.comparison_value || 0,
                      sg_around_green: comparison.comparisons.find(c => c.metric === 'SG: Around the Green')?.comparison_value || 0,
                      sg_putting: comparison.comparisons.find(c => c.metric === 'SG: Putting')?.comparison_value || 0,
                      sg_total: comparison.comparisons.find(c => c.metric === 'SG: Total')?.comparison_value || 0,
                    },
                    label: comparison.baseline_label,
                  }
                : undefined
            }
          />
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends">
          {trends ? (
            <TrendVisualization
              trends={trends}
              insights={trendInsights}
              prediction={prediction}
            />
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <p className="text-gray-500">
                  Not enough data for trend analysis. Complete more rounds to see trends.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Comparison Tab */}
        {comparison && (
          <TabsContent value="comparison">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Comparison vs {comparison.baseline_label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {comparison.comparisons.map((comp, i) => {
                    const isBetter = comp.difference > 0;
                    const isNeutral = Math.abs(comp.difference) < 0.1;

                    return (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                        <span className="text-sm font-medium text-gray-700">{comp.metric}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">{comp.player_value.toFixed(2)}</span>
                          <span
                            className={cn(
                              'text-sm font-semibold',
                              isNeutral
                                ? 'text-gray-500'
                                : isBetter
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {comp.difference > 0 ? '+' : ''}{comp.difference.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Strengths and Weaknesses */}
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <div>
                    <h4 className="text-sm font-semibold text-green-600 mb-2">Strengths</h4>
                    {comparison.strengths.length > 0 ? (
                      <ul className="space-y-1">
                        {comparison.strengths.map((s, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="text-green-500">✓</span> {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">No standout strengths</p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-red-600 mb-2">Areas to Improve</h4>
                    {comparison.weaknesses.length > 0 ? (
                      <ul className="space-y-1">
                        {comparison.weaknesses.map((w, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="text-red-500">→</span> {w}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">Well-rounded game</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Development Tab */}
        {weakAreas && weakAreas.length > 0 && (
          <TabsContent value="development">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Identified Weak Areas</h3>
              <p className="text-sm text-gray-500">
                Based on your stats, these areas could benefit from focused practice.
              </p>

              <div className="grid gap-4">
                {weakAreas.map((area, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900">{area.area}</h4>
                            <Badge
                              className={cn(
                                area.severity === 'critical'
                                  ? 'bg-red-100 text-red-700'
                                  : area.severity === 'moderate'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-blue-100 text-blue-700'
                              )}
                            >
                              {area.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Current: {area.current_value.toFixed(2)} | Target: {area.target_value.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          Est. {area.estimated_improvement_time}
                        </div>
                      </div>

                      <div className="mt-4">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Recommended Drills:</h5>
                        <div className="flex flex-wrap gap-2">
                          {area.recommended_drills.map((drill, j) => (
                            <Badge key={j} variant="outline" className="text-xs">
                              {drill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default StatsDashboard;
