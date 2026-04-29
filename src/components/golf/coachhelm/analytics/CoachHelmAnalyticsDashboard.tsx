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
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
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
import { GolfTabBar } from '@/components/golf/GolfTabBar';

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
      <LargeTitleHeader
        title="CoachHelm Analytics"
        subtitle="Track insight effectiveness and prediction accuracy"
      >
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
              <span className="hidden sm:inline">Refreshing...</span>
            </>
          ) : (
            <>
              <IconRefresh size={16} />
              <span className="hidden sm:inline">Refresh</span>
            </>
          )}
        </button>
      </LargeTitleHeader>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
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
          className="mb-6"
        >
          <GolfTabBar
            tabs={tabs}
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="CoachHelm analytics sections"
          />
        </motion.div>

        {/* Tab Content */}
          <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Insight Effectiveness Summary */}
              {effectiveness && (
                <GlassCard className="p-0" padding="none">
                  <div className="px-6 py-4 border-b border-warm-100">
                    <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Insight Effectiveness</h3>
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
                    <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Prediction Accuracy</h3>
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
                    <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Pattern Impact</h3>
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
                  <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Insight Effectiveness</h3>
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
                  <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Prediction Performance</h3>
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
                  <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Pattern Impact Analysis</h3>
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
