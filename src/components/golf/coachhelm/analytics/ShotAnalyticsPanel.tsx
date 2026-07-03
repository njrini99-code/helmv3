'use client';

/**
 * ShotAnalyticsPanel - Main Shot Analytics Dashboard Component
 *
 * Combines all visualization components into a cohesive analytics panel
 * with AI-generated insights and responsive layout.
 */

import { useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Shimmer } from '@/components/ui/shimmer';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSparkles, IconRefresh, IconTarget, IconChartRadar, IconChart, IconTrendingUp } from '@/components/icons';
import { MissPatternChart } from './MissPatternChart';
import { ShotTypeBreakdown } from './ShotTypeBreakdown';
import { TrendSummary } from './TrendIndicator';
import type { PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';

async function loadShotAnalyticsAction() {
  const { getPlayerShotAnalytics } = await import('@/app/golf/actions/shot-analytics');
  return getPlayerShotAnalytics;
}

interface ShotAnalyticsPanelProps {
  playerId: string;
  playerName?: string;
  initialData?: PlayerShotAnalytics | null;
  periodDays?: number;
  className?: string;
}

type TabType = 'overview' | 'patterns' | 'breakdown' | 'trends';

export function ShotAnalyticsPanel({
  playerId,
  playerName,
  initialData,
  periodDays = 30,
  className,
}: ShotAnalyticsPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<PlayerShotAnalytics | null>(initialData || null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState(periodDays);

  const handleRefresh = () => {
    startTransition(async () => {
      setError(null);
      const getPlayerShotAnalytics = await loadShotAnalyticsAction();
      const result = await getPlayerShotAnalytics(playerId, selectedPeriod);
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  };

  const handlePeriodChange = (days: number) => {
    setSelectedPeriod(days);
    startTransition(async () => {
      setError(null);
      const getPlayerShotAnalytics = await loadShotAnalyticsAction();
      const result = await getPlayerShotAnalytics(playerId, days);
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <IconTarget size={14} /> },
    { id: 'patterns', label: 'Patterns', icon: <IconChartRadar size={14} /> },
    { id: 'breakdown', label: 'Breakdown', icon: <IconChart size={14} /> },
    { id: 'trends', label: 'Trends', icon: <IconTrendingUp size={14} /> },
  ];

  return (
    <Tabs
      value={activeTab}
      onChange={(v) => setActiveTab(v as TabType)}
      className={cn('space-y-4', className)}
    >
      {/* Header — slim control strip. The "Shot Analytics" label lives on
          the outer section tab, so we don't repeat it here; this row is
          just period + refresh so it reads as sub-navigation, not a new
          page title. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium text-warm-500 uppercase tracking-wider">
          {playerName ? `${playerName} · ` : ''}Last {selectedPeriod} days
        </p>

        <div className="flex items-center gap-2">
          {/* Period selector — segmented control for the small set of windows
              we actually support. Replaces a legacy <select>. */}
          <ToggleGroup
            type="single"
            value={String(selectedPeriod)}
            onValueChange={(v) => {
              if (v) handlePeriodChange(Number(v));
            }}
            disabled={isPending}
            aria-label="Analytics window in days"
          >
            <ToggleGroupItem value="7">7d</ToggleGroupItem>
            <ToggleGroupItem value="14">14d</ToggleGroupItem>
            <ToggleGroupItem value="30">30d</ToggleGroupItem>
            <ToggleGroupItem value="60">60d</ToggleGroupItem>
            <ToggleGroupItem value="90">90d</ToggleGroupItem>
          </ToggleGroup>

          {/* Refresh button */}
          <Button variant="primary"
            onClick={handleRefresh}
            disabled={isPending}
            className={cn(
              'flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
              isPending
                ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
            )}
          >
            {isPending ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 1, repeat: Infinity, ease: 'linear' })}
                >
                  <IconRefresh size={14} />
                </motion.div>
                Analyzing...
              </>
            ) : (
              <>
                <IconRefresh size={14} />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <TabsList aria-label="Shot analytics sections" className="grid w-full grid-cols-4">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} icon={t.icon}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Content */}
      <Card variant="overlay" className="p-0" padding="none">
        <AnimatePresence mode="wait">
          {/* Overview Tab */}
          {activeTab === 'overview' && data && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-6"
            >
              {/* Stats summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Rounds"
                  value={data.roundsAnalyzed}
                  subtitle={`Last ${data.periodDays} days`}
                />
                <StatCard
                  label="Fairway %"
                  value={data.teeStats.fairwayPct !== null ? `${data.teeStats.fairwayPct}%` : '—'}
                  color={data.teeStats.fairwayPct === null ? 'slate' : data.teeStats.fairwayPct >= 55 ? 'green' : data.teeStats.fairwayPct >= 45 ? 'amber' : 'red'}
                />
                <StatCard
                  label="GIR %"
                  value={data.approachStats.girPct !== null ? `${data.approachStats.girPct}%` : '—'}
                  color={data.approachStats.girPct === null ? 'slate' : data.approachStats.girPct >= 50 ? 'green' : data.approachStats.girPct >= 35 ? 'amber' : 'red'}
                />
                <StatCard
                  label="Putts/Round"
                  value={data.puttingStats.avgPuttsPerRound}
                  color={data.puttingStats.avgPuttsPerRound <= 30 ? 'green' : data.puttingStats.avgPuttsPerRound <= 33 ? 'amber' : 'red'}
                />
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-primary-50 border border-primary-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                      <IconTrendingUp size={14} className="text-primary-600" />
                    </div>
                    <span className="text-xs font-medium text-primary-800 uppercase tracking-wide">Strength</span>
                  </div>
                  <p className="text-sm font-medium text-primary-900">
                    {data.primaryStrength}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                      <IconTarget size={14} className="text-amber-600" />
                    </div>
                    <span className="text-xs font-medium text-amber-800 uppercase tracking-wide">Focus Area</span>
                  </div>
                  <p className="text-sm font-medium text-amber-900">
                    {data.primaryWeakness}
                  </p>
                </div>
              </div>

              {/* AI Insights */}
              {data.insights.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <IconSparkles size={14} className="text-purple-500" />
                    <span className="text-xs font-medium text-warm-600 uppercase tracking-wide">AI Insights</span>
                  </div>
                  <div className="space-y-2">
                    {data.insights.map((insight, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={prefersReducedMotion ? { duration: 0 } : ({ delay: i * 0.1 })}
                        className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800"
                      >
                        {insight}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Patterns Tab */}
          {activeTab === 'patterns' && data && (
            <motion.div
              key="patterns"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Approach miss patterns */}
                <div>
                  <MissPatternChart
                    data={Object.entries(data.approachStats.missBreakdown)
                      .filter((e): e is [string, number] => e[1] !== null && e[1] > 0)
                      .map(([direction, percentage]) => ({
                        direction,
                        percentage,
                      }))}
                    title="Approach Shot Misses"
                    subtitle={`${data.approachStats.totalApproaches} approach shots analyzed`}
                    size="md"
                  />
                </div>

                {/* Distance range patterns */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-warm-700">Miss Patterns by Distance</h4>
                  {data.distanceRanges.length > 0 ? (
                    <div className="space-y-3">
                      {data.distanceRanges.map((range) => (
                        <div
                          key={range.range}
                          className="p-3 bg-warm-50 rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-warm-700">
                              {range.rangeLabel}
                            </span>
                            <span className="text-xs text-warm-500">
                              {range.totalShots} shots
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-warm-500">GIR:</span>
                            <span className={cn(
                              'text-xs font-medium',
                              range.greenHitRate === null ? 'text-warm-500' :
                              range.greenHitRate >= 50 ? 'text-primary-600' :
                              range.greenHitRate >= 30 ? 'text-amber-600' : 'text-red-600'
                            )}>
                              {range.greenHitRate !== null ? `${range.greenHitRate}%` : '—'}
                            </span>
                            {range.primaryMiss !== 'none' && (
                              <>
                                <span className="text-warm-300">|</span>
                                <span className="text-xs text-warm-500">Primary miss:</span>
                                <span className="text-xs font-medium text-warm-700">
                                  {range.primaryMiss.replace('_', '-')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      variant="minimal"
                      type="stats"
                      description="Not enough shot data for distance analysis yet."
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Breakdown Tab */}
          {activeTab === 'breakdown' && data && (
            <motion.div
              key="breakdown"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6"
            >
              <ShotTypeBreakdown
                teeStats={data.teeStats}
                approachStats={data.approachStats}
                aroundGreenStats={data.aroundGreenStats}
                puttingStats={data.puttingStats}
              />
            </motion.div>
          )}

          {/* Trends Tab */}
          {activeTab === 'trends' && data && (
            <motion.div
              key="trends"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6"
            >
              <TrendSummary trends={data.trends} />
            </motion.div>
          )}

          {/* Loading state */}
          {isPending && !data && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6"
            >
              <LoadingSkeleton />
            </motion.div>
          )}

          {/* Empty state */}
          {!isPending && !data && !error && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-warm-100 flex items-center justify-center">
                <IconChartRadar size={32} className="text-warm-400" />
              </div>
              <h4 className="text-lg font-medium text-warm-700 mb-2">
                No Shot Analytics Yet
              </h4>
              <p className="text-sm text-warm-500 max-w-sm mx-auto mb-4">
                Click refresh to analyze this player&apos;s shot data and discover patterns.
              </p>
              <Button variant="primary"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                <IconSparkles size={16} />
                Analyze Shots
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </Tabs>
  );
}

// Stat card component
function StatCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: 'green' | 'amber' | 'red' | 'slate';
}) {
  return (
    <div className="p-4 rounded-xl bg-cream-50 border border-warm-100">
      <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={cn(
        'text-2xl font-medium tabular-nums',
        color === 'green' && 'text-primary-600',
        color === 'amber' && 'text-amber-600',
        color === 'red' && 'text-red-600',
        (!color || color === 'slate') && 'text-warm-900'
      )}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-warm-400 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i, idx) => (
          <Shimmer key={i} staggerIndex={idx} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Shimmer className="h-32 rounded-xl" />
        <Shimmer staggerIndex={1} className="h-32 rounded-xl" />
      </div>
      <Shimmer className="h-24 rounded-xl" />
    </div>
  );
}
