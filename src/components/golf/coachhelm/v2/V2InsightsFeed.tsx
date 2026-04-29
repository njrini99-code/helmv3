'use client';

/**
 * InsightsFeed - Unified feed showing CoachHelm AI insights, patterns, and predictions
 *
 * Features:
 * - Tabbed view: Insights, Patterns, Predictions
 * - Generate insights on demand
 * - Record user interactions for learning
 */

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconRefresh } from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import { InsightCard } from './V2InsightCard';
import { PatternCard } from './PatternCard';
import { PredictionCard } from './PredictionCard';
import {
  generateTeamInsight,
  recordInteraction,
  acknowledgeComposedInsight,
  dismissComposedInsight,
} from '@/app/golf/actions/insights';
import type { ComposedInsight, MinedPattern, PerformancePrediction } from '@/lib/coachhelm/v2/types';

interface InsightsFeedProps {
  teamId: string;
  coachId: string;
  initialInsights?: ComposedInsight[];
  initialPatterns?: MinedPattern[];
  initialPredictions?: Array<PerformancePrediction & { playerName?: string }>;
}

type TabType = 'insights' | 'patterns' | 'predictions';
type TeamPrediction = PerformancePrediction & { playerName?: string };

export function InsightsFeed({
  teamId: _teamId, // Reserved for future use
  coachId,
  initialInsights = [],
  initialPatterns = [],
  initialPredictions = [],
}: InsightsFeedProps) {
  void _teamId;

  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabType>('insights');
  const [insights, setInsights] = useState<ComposedInsight[]>(initialInsights);
  const [patterns, setPatterns] = useState<MinedPattern[]>(initialPatterns);
  const [predictions, setPredictions] = useState<TeamPrediction[]>(initialPredictions);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

  const handleGenerate = () => {
    startTransition(async () => {
      setError(null);

      try {
        const result = await generateTeamInsight();

        if (result.success) {
          setInsights(result.insights || []);
          setPatterns(result.patterns || []);
          setPredictions(result.predictions || []);
          setLastGenerated(new Date());

          // Record interaction for learning
          try {
            await recordInteraction(coachId, 'coach', 'action', 'generate_insights');
          } catch {
            // Non-critical, don't fail the whole operation
          }
        } else {
          setError(result.error || 'Failed to generate insights');
        }
      } catch (err) {
        console.error('Error generating insights:', err);
        setError('Unable to analyze team. Please check your connection and try again.');
      }
    });
  };

  const handleInsightAction = async (insight: ComposedInsight, action: 'acknowledge' | 'dismiss') => {
    // Optimistically remove from local state for immediate UI feedback
    setInsights(prev => prev.filter(i => i !== insight));

    try {
      // Persist the action to the database
      // Note: These insights are in-memory (V2 ComposedInsight), so we use the
      // acknowledgeComposedInsight/dismissComposedInsight actions which persist
      // and mark as acknowledged/dismissed in one operation
      const result = action === 'acknowledge'
        ? await acknowledgeComposedInsight(insight)
        : await dismissComposedInsight(insight);

      if (!result.success) {
        // Revert the optimistic update on failure
        setInsights(prev => [...prev, insight]);
        setError(result.error || `Failed to ${action} insight`);
      }
    } catch (err) {
      // Revert the optimistic update on error
      setInsights(prev => [...prev, insight]);
      console.error(`Error ${action}ing insight:`, err);
      setError(`Failed to ${action} insight. Please try again.`);
    }
  };

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'insights', label: 'Insights', count: insights.length },
    { id: 'patterns', label: 'Patterns', count: patterns.length },
    { id: 'predictions', label: 'Predictions', count: predictions.length },
  ];

  return (
    <div className="space-y-3 overflow-hidden">
      {/* Header - Compact for narrow dashboard column */}
      <div className="relative overflow-clip rounded-xl border border-white/70 bg-cream-100/75 px-3 py-3 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-white/0 to-primary-400/10 pointer-events-none" />
        <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-6 h-16 w-16 rounded-full bg-primary-400/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-green text-white ">
              <IconSparkles size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.15em] text-warm-400">
                Intelligence Feed
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-warm-900">
                  CoachHelm AI
                </span>
                <span className="text-xs font-medium text-primary-700 bg-primary-100/70 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  AI-Powered
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isPending}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all',
              isPending
                ? 'bg-warm-200 text-warm-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-primary-500 to-primary-500 text-white hover:-hover'
            )}
          >
            {isPending ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <IconRefresh size={14} />
                </motion.div>
                Analyzing
              </>
            ) : (
              <>
                <IconSparkles size={14} />
                Analyze Team
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50/80 px-3 py-2 text-sm text-red-600 ">
          {error}
        </div>
      )}

      {/* Tabs - Compact */}
      <GolfTabBar
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="CoachHelm feed sections"
        stretch
        compact
      />

      {/* Content */}
      <GlassCard className="p-3" glow="subtle" variant="secondary">
        <AnimatePresence mode="wait">
          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              {insights.length > 0 ? (
                insights.map((insight, i) => (
                  <InsightCard
                    key={i}
                    insight={insight}
                    onAction={(action) => handleInsightAction(insight, action)}
                  />
                ))
              ) : (
                <EmptyState
                  icon={<IconSparkles size={24} className="text-warm-300" />}
                  title="No insights yet"
                  description="Click 'Analyze Team' to generate AI-powered insights"
                />
              )}
            </motion.div>
          )}

          {activeTab === 'patterns' && (
            <motion.div
              key="patterns"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              {patterns.length > 0 ? (
                patterns.map((pattern) => (
                  <PatternCard key={pattern.id} pattern={pattern} />
                ))
              ) : (
                <EmptyState
                  icon={<IconSparkles size={24} className="text-warm-300" />}
                  title="No patterns detected"
                  description="Patterns will appear after analysis identifies recurring trends"
                />
              )}
            </motion.div>
          )}

          {activeTab === 'predictions' && (
            <motion.div
              key="predictions"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              {predictions.length > 0 ? (
                predictions.map((prediction, i) => (
                  <PredictionCard
                    key={i}
                    prediction={prediction}
                    playerName={prediction.playerName}
                  />
                ))
              ) : (
                <EmptyState
                  icon={<IconSparkles size={24} className="text-warm-300" />}
                  title="No predictions yet"
                  description="Predictions require sufficient round data to generate forecasts"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Last Generated */}
      {lastGenerated && (
        <p className="text-xs uppercase tracking-wide text-warm-400 text-center">
          Last analyzed: {lastGenerated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative overflow-clip rounded-xl border border-white/70 bg-cream-100/75 px-3 py-6 text-center ">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/8 via-white/0 to-primary-400/8 pointer-events-none" />
      <div className="relative flex flex-col items-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-cream-100/82 text-primary-600">
          {icon}
        </div>
        <h4 className="text-sm font-semibold text-warm-700 mb-0.5">{title}</h4>
        <p className="text-xs text-warm-500 max-w-[200px] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
