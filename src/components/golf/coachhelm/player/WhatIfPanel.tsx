'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconZap,
  IconTarget,
  IconTrendingUp,
} from '@/components/icons';

interface WhatIfPanelProps {
  // Typed props (used when data is pre-parsed)
  currentPrediction?: number;
  improvements?: Array<{
    metric: string;
    currentValue: number;
    projectedScoringImpact: number;
    difficulty: 'easy' | 'moderate' | 'hard';
    timeEstimate: string;
    priority: number;
  }>;
  onSimulate?: (metric: string, amount: number) => Promise<{ projectedScore: number; rankChange: number }>;
  // Raw data prop (from server action — parsed internally)
  playerId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any>;
}

const difficultyConfig = {
  easy: { label: 'Easy', color: 'bg-primary-100 text-primary-700 border-primary-200' },
  moderate: { label: 'Moderate', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  hard: { label: 'Hard', color: 'bg-red-100 text-red-700 border-red-200' },
};

export function WhatIfPanel({
  currentPrediction,
  improvements,
  onSimulate,
  playerId: _playerId,
  profileData,
}: WhatIfPanelProps) {
  // Resolve props: prefer typed props, fall back to parsing from profileData
  const resolvedCurrentPrediction = currentPrediction ?? (profileData?.currentPrediction as number | undefined) ?? 0;
  const resolvedImprovements = improvements ?? (profileData?.improvements as typeof improvements | undefined) ?? [];
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<{
    metric: string;
    projectedScore: number;
    rankChange: number;
  } | null>(null);

  const sorted = [...resolvedImprovements].sort((a, b) => a.priority - b.priority);

  async function handleSimulate(metric: string, impact: number) {
    if (!onSimulate) return;
    setSimulating(metric);
    setSimResult(null);
    try {
      const result = await onSimulate(metric, impact);
      setSimResult({ metric, ...result });
    } finally {
      setSimulating(null);
    }
  }

  if (!resolvedImprovements.length) {
    return (
      <GlassCard className="relative overflow-hidden" glow="subtle">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <IconSparkles size={32} className="text-warm-300 mb-3" />
          <p className="text-sm font-medium text-warm-500">No improvement data available</p>
          <p className="text-xs text-warm-400 mt-1">Check back after more rounds are analyzed</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="relative overflow-hidden" glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <IconSparkles size={20} className="text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900">Improvement Opportunities</h3>
          </div>
        </div>

        {/* Current prediction */}
        <motion.div
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/40 border border-white/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <IconTarget size={18} className="text-warm-500" />
          <span className="text-sm font-medium text-warm-600">Predicted:</span>
          <span className="text-2xl font-bold text-warm-900 tabular-nums">
            {resolvedCurrentPrediction > 0 ? '+' : ''}{resolvedCurrentPrediction.toFixed(1)}
          </span>
        </motion.div>

        {/* Simulation result */}
        <AnimatePresence>
          {simResult && (
            <motion.div
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary-50 border border-primary-200"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="flex items-center gap-2">
                <IconTrendingUp size={16} className="text-primary-600" />
                <span className="text-sm text-primary-800">
                  If you improve <span className="font-semibold">{simResult.metric}</span>:
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary-700 tabular-nums">
                  {simResult.projectedScore > 0 ? '+' : ''}{simResult.projectedScore.toFixed(1)}
                </p>
                {simResult.rankChange !== 0 && (
                  <p className="text-xs text-primary-500 tabular-nums">
                    {simResult.rankChange > 0 ? '+' : ''}{simResult.rankChange} rank
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Improvement list */}
        <div className="space-y-2">
          {sorted.map((item, i) => {
            const diffConfig = difficultyConfig[item.difficulty];

            return (
              <motion.div
                key={item.metric}
                className="p-3 rounded-xl bg-white/40 border border-white/20"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-warm-900">
                        {item.metric}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                          diffConfig.color
                        )}
                      >
                        {diffConfig.label}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 border border-warm-200 tabular-nums">
                        #{item.priority}
                      </span>
                    </div>
                    <p className="text-sm text-warm-600 mt-1">
                      Improve to average{' '}
                      <span className="font-medium text-primary-600 tabular-nums">
                        &rarr; save {Math.abs(item.projectedScoringImpact).toFixed(1)} strokes/round
                      </span>
                    </p>
                    <p className="text-xs text-warm-400 mt-0.5">{item.timeEstimate}</p>
                  </div>

                  {onSimulate && (
                    <button
                      onClick={() => handleSimulate(item.metric, item.projectedScoringImpact)}
                      disabled={simulating === item.metric}
                      className={cn(
                        'shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold',
                        'bg-primary-100 text-primary-700 hover:bg-primary-200',
                        'transition-colors duration-200',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <IconZap size={12} />
                      {simulating === item.metric ? 'Simulating...' : 'Simulate'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}
