'use client';

/**
 * CoachHelmAnalyticsDashboard - Main Analytics Dashboard for CoachHelm
 *
 * Shows coaches the effectiveness of their AI insights and prediction accuracy.
 * Features tabs for Overview, Insights, Predictions, and Patterns.
 */

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconRefresh,
  IconChart,
  IconTarget,
  IconChartBar,
  IconChartRadar,
  IconCalendar,
} from '@/components/icons';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import { AnalyticsSummaryCards } from './AnalyticsSummaryCards';
import { InsightEffectivenessPanel } from './InsightEffectivenessPanel';
import { PredictionAccuracyPanel } from './PredictionAccuracyPanel';
import { PatternImpactPanel } from './PatternImpactPanel';
import {
  getCoachHelmOverview,
  getInsightEffectiveness,
  getPredictionPerformance,
  getPatternImpact,
  type CoachHelmOverviewData,
  type InsightEffectivenessData,
  type PredictionPerformanceData,
  type PatternImpactData,
} from '@/app/golf/actions/coachhelm-analytics';

interface CoachHelmAnalyticsDashboardProps {
  teamId: string;
  coachId: string;
  initialOverview?: CoachHelmOverviewData;
  initialEffectiveness?: InsightEffectivenessData;
  initialPerformance?: PredictionPerformanceData;
  initialPatternImpact?: PatternImpactData;
}

type TabType = 'overview' | 'insights' | 'predictions' | 'patterns';
type DateRangeType = '7d' | '14d' | '30d' | '60d' | '90d';

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <IconChart size={16} /> },
  { id: 'insights', label: 'Insights', icon: <IconSparkles size={16} /> },
  { id: 'predictions', label: 'Predictions', icon: <IconTarget size={16} /> },
  { id: 'patterns', label: 'Patterns', icon: <IconChartRadar size={16} /> },
];

const dateRanges: { id: DateRangeType; label: string; days: number }[] = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '14d', label: '14 days', days: 14 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '60d', label: '60 days', days: 60 },
  { id: '90d', label: '90 days', days: 90 },
];

export function CoachHelmAnalyticsDashboard({
  teamId,
   
  coachId: _coachId,
  initialOverview,
  initialEffectiveness,
  initialPerformance,
  initialPatternImpact,
}: CoachHelmAnalyticsDashboardProps) {
  // coachId is available for future use (e.g., coach-specific analytics)
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedRange, setSelectedRange] = useState<DateRangeType>('30d');
  const [isPending, startTransition] = useTransition();

  const [overview, setOverview] = useState(initialOverview);
  const [effectiveness, setEffectiveness] = useState(initialEffectiveness);
  const [performance, setPerformance] = useState(initialPerformance);
  const [patternImpact, setPatternImpact] = useState(initialPatternImpact);

  const handleRefresh = () => {
    startTransition(async () => {
      const days = dateRanges.find((r) => r.id === selectedRange)?.days || 30;
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

      const [overviewResult, effectivenessResult, performanceResult, patternResult] =
        await Promise.all([
          getCoachHelmOverview(teamId),
          getInsightEffectiveness(teamId, { start, end }),
          getPredictionPerformance(teamId, { start, end }),
          getPatternImpact(teamId, { start, end }),
        ]);

      if (overviewResult.success) setOverview(overviewResult.data);
      if (effectivenessResult.success) setEffectiveness(effectivenessResult.data);
      if (performanceResult.success) setPerformance(performanceResult.data);
      if (patternResult.success) setPatternImpact(patternResult.data);
    });
  };

  const handleDateRangeChange = (range: DateRangeType) => {
    setSelectedRange(range);
    startTransition(async () => {
      const days = dateRanges.find((r) => r.id === range)?.days || 30;
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

      const [effectivenessResult, performanceResult, patternResult] = await Promise.all([
        getInsightEffectiveness(teamId, { start, end }),
        getPredictionPerformance(teamId, { start, end }),
        getPatternImpact(teamId, { start, end }),
      ]);

      if (effectivenessResult.success) setEffectiveness(effectivenessResult.data);
      if (performanceResult.success) setPerformance(performanceResult.data);
      if (patternResult.success) setPatternImpact(patternResult.data);
    });
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <MobileMenuButton />
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20"
              >
                <IconChartBar size={24} className="text-white" />
              </motion.div>
              <div>
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900">
                  CoachHelm Analytics
                </h1>
                <p className="text-warm-500 text-sm">
                  Track insight effectiveness and prediction accuracy
                </p>
              </div>
            </div>

            <div className="w-full md:w-auto flex items-center gap-3">
              {/* Date Range Selector */}
              <div className="flex items-center gap-2">
                <IconCalendar size={16} className="text-warm-400" />
                <select
                  value={selectedRange}
                  onChange={(e) => handleDateRangeChange(e.target.value as DateRangeType)}
                  disabled={isPending}
                  className="text-base md:text-sm px-3 py-1.5 rounded-lg border border-warm-200 bg-white text-warm-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                >
                  {dateRanges.map((range) => (
                    <option key={range.id} value={range.id}>
                      Last {range.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isPending}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
                  isPending
                    ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                )}
              >
                {isPending ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <IconRefresh size={16} />
                    </motion.div>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <IconRefresh size={16} />
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        {overview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <AnalyticsSummaryCards data={overview} />
          </motion.div>
        )}

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-1 p-1 bg-warm-100/80 backdrop-blur-sm rounded-xl mb-6 w-fit"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                activeTab === tab.id
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-700'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Tab Content */}
          <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Insight Effectiveness Summary */}
              {effectiveness && (
                <GlassCard className="p-0" padding="none">
                  <div className="px-6 py-4 border-b border-warm-100">
                    <h3 className="text-lg font-semibold text-warm-900">Insight Effectiveness</h3>
                    <p className="text-sm text-warm-500">How well insights translate to action</p>
                  </div>
                  <div className="p-6">
                    <InsightEffectivenessPanel data={effectiveness} compact />
                  </div>
                </GlassCard>
              )}

              {/* Prediction Accuracy Summary */}
              {performance && (
                <GlassCard className="p-0" padding="none">
                  <div className="px-6 py-4 border-b border-warm-100">
                    <h3 className="text-lg font-semibold text-warm-900">Prediction Accuracy</h3>
                    <p className="text-sm text-warm-500">Model performance over time</p>
                  </div>
                  <div className="p-6">
                    <PredictionAccuracyPanel data={performance} compact />
                  </div>
                </GlassCard>
              )}

              {/* Pattern Impact Summary */}
              {patternImpact && (
                <GlassCard className="p-0 lg:col-span-2" padding="none">
                  <div className="px-6 py-4 border-b border-warm-100">
                    <h3 className="text-lg font-semibold text-warm-900">Pattern Impact</h3>
                    <p className="text-sm text-warm-500">Detected patterns and their resolution</p>
                  </div>
                  <div className="p-6">
                    <PatternImpactPanel data={patternImpact} compact />
                  </div>
                </GlassCard>
              )}
            </div>
          </div>

          <div className={activeTab === 'insights' ? 'block' : 'hidden'}>
            {effectiveness && (
              <GlassCard className="p-0" padding="none">
                <div className="px-6 py-4 border-b border-warm-100">
                  <h3 className="text-lg font-semibold text-warm-900">Insight Effectiveness</h3>
                  <p className="text-sm text-warm-500">
                    Detailed breakdown of insight types and their outcomes
                  </p>
                </div>
                <div className="p-6">
                  <InsightEffectivenessPanel data={effectiveness} />
                </div>
              </GlassCard>
            )}
          </div>

          <div className={activeTab === 'predictions' ? 'block' : 'hidden'}>
            {performance && (
              <GlassCard className="p-0" padding="none">
                <div className="px-6 py-4 border-b border-warm-100">
                  <h3 className="text-lg font-semibold text-warm-900">Prediction Performance</h3>
                  <p className="text-sm text-warm-500">
                    Accuracy, calibration, and error analysis
                  </p>
                </div>
                <div className="p-6">
                  <PredictionAccuracyPanel data={performance} />
                </div>
              </GlassCard>
            )}
          </div>

          <div className={activeTab === 'patterns' ? 'block' : 'hidden'}>
            {patternImpact && (
              <GlassCard className="p-0" padding="none">
                <div className="px-6 py-4 border-b border-warm-100">
                  <h3 className="text-lg font-semibold text-warm-900">Pattern Impact Analysis</h3>
                  <p className="text-sm text-warm-500">
                    Pattern lifecycle and strokes saved
                  </p>
                </div>
                <div className="p-6">
                  <PatternImpactPanel data={patternImpact} />
                </div>
              </GlassCard>
            )}
          </div>

        {/* Empty State */}
        {!overview && !effectiveness && !performance && !patternImpact && (
          <GlassCard className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-warm-100 flex items-center justify-center">
              <IconChartBar size={32} className="text-warm-400" />
            </div>
            <h4 className="text-lg font-medium text-warm-700 mb-2">No Analytics Data Yet</h4>
            <p className="text-sm text-warm-500 max-w-sm mx-auto mb-4">
              Start using CoachHelm to generate insights and track their effectiveness over time.
            </p>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <IconRefresh size={16} />
              Load Data
            </button>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
