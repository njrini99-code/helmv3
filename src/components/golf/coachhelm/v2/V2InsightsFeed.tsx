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
import { InsightCard } from './V2InsightCard';
import { PatternCard } from './PatternCard';
import { PredictionCard } from './PredictionCard';
import { generateTeamInsight, recordInteraction } from '@/app/golf/actions/insights';
import type { ComposedInsight, MinedPattern, PerformancePrediction } from '@/lib/coachhelm/v2/types';

interface InsightsFeedProps {
  teamId: string;
  coachId: string;
  initialInsights?: ComposedInsight[];
  initialPatterns?: MinedPattern[];
  initialPredictions?: Array<PerformancePrediction & { playerName?: string }>;
}

// Also export as V2InsightsFeed for backwards compatibility
export { InsightsFeed as V2InsightsFeed };

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
    // Record interaction
    await recordInteraction(coachId, 'coach', action === 'acknowledge' ? 'action' : 'dismiss', 'insight');
    
    // Remove from local state
    setInsights(prev => prev.filter(i => i !== insight));
  };

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'insights', label: 'Insights', count: insights.length },
    { id: 'patterns', label: 'Patterns', count: patterns.length },
    { id: 'predictions', label: 'Predictions', count: predictions.length },
  ];

  return (
    <div className="space-y-3 overflow-hidden">
      {/* Header - Compact for narrow dashboard column */}
      <div className="relative overflow-hidden rounded-xl border border-white/70 bg-white/70 px-3 py-3 shadow-glass-sm backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-white/0 to-emerald-400/10 pointer-events-none" />
        <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-6 h-16 w-16 rounded-full bg-emerald-400/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-green text-white shadow-glass-sm">
              <IconSparkles size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.15em] text-slate-400">
                Intelligence Feed
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-900">
                  CoachHelm AI
                </span>
                <span className="text-[10px] font-medium text-primary-700 bg-primary-100/70 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  AI-Powered
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isPending}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all',
              isPending
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-primary-500 to-emerald-500 text-white shadow-glass hover:shadow-glass-hover'
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
        <div className="rounded-xl border border-red-100 bg-red-50/80 px-3 py-2 text-sm text-red-600 shadow-glass-sm">
          {error}
        </div>
      )}

      {/* Tabs - Compact */}
      <div className="flex gap-0.5 rounded-lg border border-white/70 bg-white/70 p-0.5 shadow-glass-sm overflow-hidden">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all truncate',
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-glass-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <span className="truncate">{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={cn(
                  'text-[9px] px-1 py-0.5 rounded-full flex-shrink-0',
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-slate-200 text-slate-600'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

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
                  icon={<IconSparkles size={24} className="text-slate-300" />}
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
                  icon={<IconSparkles size={24} className="text-slate-300" />}
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
                  icon={<IconSparkles size={24} className="text-slate-300" />}
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
        <p className="text-[11px] uppercase tracking-wide text-slate-400 text-center">
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
    <div className="relative overflow-hidden rounded-xl border border-white/70 bg-white/70 px-3 py-6 text-center shadow-glass-sm">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/8 via-white/0 to-emerald-400/8 pointer-events-none" />
      <div className="relative flex flex-col items-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-glass-sm text-primary-600">
          {icon}
        </div>
        <h4 className="text-sm font-semibold text-slate-700 mb-0.5">{title}</h4>
        <p className="text-[11px] text-slate-500 max-w-[200px] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
