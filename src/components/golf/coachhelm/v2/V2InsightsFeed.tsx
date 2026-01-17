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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg">
            <IconSparkles size={16} className="text-white" />
          </div>
          <span className="text-sm font-medium text-slate-700">
            CoachHelm AI
          </span>
          <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-600 rounded-full font-medium">
            Powered by AI
          </span>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isPending}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
            isPending
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
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
              Analyzing...
            </>
          ) : (
            <>
              <IconSparkles size={14} />
              Analyze Team
            </>
          )}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all',
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  activeTab === tab.id
                    ? 'bg-green-100 text-green-700'
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
      <GlassCard className="p-4" glow="subtle">
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
        <p className="text-xs text-slate-400 text-center">
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
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3">{icon}</div>
      <h4 className="text-sm font-medium text-slate-600 mb-1">{title}</h4>
      <p className="text-xs text-slate-400 max-w-[200px]">{description}</p>
    </div>
  );
}
