'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconTrendingUp, IconTrendingDown, IconTarget } from '@/components/icons';
import type { PerformancePrediction, TailRiskProbabilities } from '@/lib/coachhelm/v2/types';

interface PredictionCardProps {
  prediction: PerformancePrediction;
  playerName?: string;
}

export function PredictionCard({ prediction, playerName }: PredictionCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const isPositive = prediction.predictedValue < 0;
  const isNeutral = Math.abs(prediction.predictedValue) < 0.5;

  const getTrendIcon = () => {
    if (isNeutral) return <IconTarget size={18} className="text-warm-400" />;
    if (isPositive) return <IconTrendingDown size={18} className="text-primary-500" />;
    return <IconTrendingUp size={18} className="text-red-500" />;
  };

  const getScoreColor = () => {
    if (isNeutral) return 'text-warm-600';
    if (isPositive) return 'text-primary-600';
    return 'text-red-600';
  };

  const confidencePercent = Math.round((prediction.calibratedConfidence ?? prediction.confidence) * 100);
  const rangeLow = prediction.predictionRange?.low ?? prediction.predictedRangeLow;
  const rangeHigh = prediction.predictionRange?.high ?? prediction.predictedRangeHigh;
  const hasRange = Number.isFinite(rangeLow) && Number.isFinite(rangeHigh);
  const factors = prediction.factors ?? prediction.keyFactors ?? [];

  // Type guard for TailRiskProbabilities
  const isTailRiskProbabilities = (
    risks: typeof prediction.tailRisks
  ): risks is TailRiskProbabilities => {
    return risks !== undefined && !Array.isArray(risks) && 'blowupProbability' in risks;
  };

  // Format predicted score for display
  const formatScore = (value: number) => {
    if (value === 0) return 'E';
    return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-cream-50/85 rounded-xl border border-warm-200 p-4 hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <IconTarget size={16} className="text-blue-600" />
          </div>
          <span className="text-xs font-medium text-warm-500 uppercase tracking-wide">
            Next Round Prediction
          </span>
        </div>
        {playerName && (
          <span className="text-xs text-warm-400">{playerName}</span>
        )}
      </div>

      {/* Main Prediction */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-baseline gap-1">
          <span className={cn('text-h1 md:text-display font-light tracking-[-0.025em]', getScoreColor())}>
            {formatScore(prediction.predictedValue)}
          </span>
        </div>
        {getTrendIcon()}
      </div>

      {/* Confidence Range */}
      {hasRange && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-warm-500 mb-1">
            <span>Likely Range</span>
            <span>{confidencePercent}% confidence</span>
          </div>
          <div className="h-2 bg-warm-100 rounded-full overflow-hidden relative">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${confidencePercent}%` }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.2 })}
              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-warm-400">
            <span>{formatScore(rangeLow)}</span>
            <span>{formatScore(rangeHigh)}</span>
          </div>
        </div>
      )}

      {/* Key Factors */}
      {factors.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-warm-500 uppercase mb-2">
            Key Factors
          </h4>
          <div className="space-y-1">
            {factors.slice(0, 3).map((factor: { name: string; contribution: number }, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-warm-600">{factor.name}</span>
                <span
                  className={cn(
                    'font-medium',
                    factor.contribution > 0 ? 'text-red-500' : 'text-primary-500'
                  )}
                >
                  {factor.contribution > 0 ? '+' : ''}
                  {factor.contribution.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tail Risks */}
      {isTailRiskProbabilities(prediction.tailRisks) && (
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-warm-100">
          <div className="text-center">
            <div className="text-xs text-warm-400">Blowup Risk</div>
            <div className="text-sm font-medium text-red-500">
              {Math.round(prediction.tailRisks.blowupProbability * 100)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-warm-400">Great Round</div>
            <div className="text-sm font-medium text-primary-500">
              {Math.round(prediction.tailRisks.greatRoundProbability * 100)}%
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
