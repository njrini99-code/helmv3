'use client';

import { m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconTarget,
  IconTrendingUp,
  IconTrendingDown,
  IconSparkles,
  IconInfo,
} from '@/components/icons';
import type { PerformancePrediction as PerformancePredictionType, TailRiskProbabilities } from '@/lib/coachhelm/v2/types';

interface PerformancePredictionProps {
  prediction: PerformancePredictionType | null;
  playerState: 'improving' | 'stable' | 'struggling' | 'unknown';
}

export function PerformancePrediction({ prediction, playerState }: PerformancePredictionProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  // Empty state when no prediction available
  if (!prediction) {
    return (
      <Card variant="overlay" padding="md" className="relative overflow-hidden" glow="subtle">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconSparkles size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-warm-900">Performance Prediction</h3>
            <p className="text-xs text-warm-500">Powered by CoachHelm AI</p>
          </div>
        </div>

        <EmptyState
          variant="minimal"
          icon={<IconTarget size={20} />}
          description="Not enough data yet. Complete more rounds to unlock AI predictions."
        />
      </Card>
    );
  }

  const predictedValue = prediction.predictedValue != null ? Number(prediction.predictedValue) : 0;
  const isPositive = predictedValue < 0;
  const isNeutral = Math.abs(predictedValue) < 0.5;
  const confidencePercent = Math.round(Number(prediction.calibratedConfidence ?? prediction.confidence ?? 0) * 100);

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

  const getTrendIcon = () => {
    if (isNeutral) return <IconTarget size={24} className="text-warm-400" />;
    if (isPositive) return <IconTrendingUp size={24} className="text-primary-500" />;
    return <IconTrendingDown size={24} className="text-red-500" />;
  };

  const formatScore = (value: number | string | undefined | null) => {
    if (value == null) return '--';
    const num = Number(value);
    if (isNaN(num)) return '--';
    if (num === 0) return 'E';
    return num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1);
  };

  const getStateMessage = () => {
    switch (playerState) {
      case 'improving':
        return { text: 'Your game is trending upward', icon: IconTrendingUp, color: 'text-primary-600' };
      case 'struggling':
        return { text: 'Focus on fundamentals to get back on track', icon: IconTrendingDown, color: 'text-amber-600' };
      case 'stable':
        return { text: 'Your game is consistent', icon: IconTarget, color: 'text-warm-600' };
      default:
        return null;
    }
  };

  const stateMessage = getStateMessage();

  return (
    <Card variant="overlay" padding="md" className="relative overflow-hidden" glow="green">
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconSparkles size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-warm-900">Performance Prediction</h3>
            <p className="text-xs text-warm-500">Your projected next round</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-warm-400 flex items-center gap-1">
            <IconInfo size={12} />
            {confidencePercent}% confidence
          </span>
        </div>
      </div>

      {/* Main Prediction */}
      <div className="flex items-center justify-center gap-6 mb-6">
        <m.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3 })}
          className="text-center"
        >
          <p className="text-xs text-warm-500 uppercase tracking-wide mb-1">Estimated Score</p>
          <div className="flex items-center justify-center gap-3">
            <span className={cn(
              'text-display font-light tabular-nums tracking-[-0.025em]',
              isPositive ? 'text-primary-700' : isNeutral ? 'text-warm-800' : 'text-red-600'
            )}>
              {formatScore(predictedValue)}
            </span>
            {getTrendIcon()}
          </div>
        </m.div>
      </div>

      {/* Confidence Range Bar */}
      {hasRange && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-warm-500 mb-2">
            <span>Likely Range</span>
            <span className="font-medium">{formatScore(rangeLow)} to {formatScore(rangeHigh)}</span>
          </div>
          <div className="relative h-3 bg-warm-100 rounded-full overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary-200 via-warm-200 to-red-200 opacity-50" />

            {/* Confidence fill */}
            <m.div
              initial={{ width: 0 }}
              animate={{ width: `${confidencePercent}%` }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, delay: 0.2, ease: 'easeOut' })}
              className="absolute inset-y-0 left-0 bg-primary-500 rounded-full"
            />

            {/* Predicted value marker */}
            <m.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3, delay: 0.5 })}
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-surface border-2 border-primary-600 rounded-full shadow-md"
              style={{
                left: `${Math.min(Math.max(((Number(rangeHigh) - Number(rangeLow)) > 0 ? ((predictedValue - Number(rangeLow)) / (Number(rangeHigh) - Number(rangeLow))) * 100 : 50), 5), 95)}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </div>
      )}

      {/* Key Factors */}
      {factors.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
            Key Factors
          </h4>
          <div className="space-y-2">
            {factors.slice(0, 3).map((factor, i) => (
              <m.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3, delay: 0.1 * i })}
                className="flex items-center justify-between text-sm bg-surface-sunken rounded-lg px-3 py-2"
              >
                <span className="text-warm-600">{factor.name}</span>
                <span className={cn(
                  'font-medium tabular-nums',
                  Number(factor.contribution ?? 0) > 0 ? 'text-red-500' : 'text-primary-500'
                )}>
                  {Number(factor.contribution ?? 0) > 0 ? '+' : ''}{Number(factor.contribution ?? 0).toFixed(1)}
                </span>
              </m.div>
            ))}
          </div>
        </div>
      )}

      {/* Tail Risks */}
      {isTailRiskProbabilities(prediction.tailRisks) && (
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border-subtle">
          <div className="text-center p-3 bg-red-50/50 rounded-lg">
            <p className="text-xs text-warm-500 mb-1">Rough Round Risk</p>
            <p className="text-body-lg font-medium tracking-[-0.005em] text-red-500">
              {Math.round(Number(prediction.tailRisks.blowupProbability ?? 0) * 100)}%
            </p>
          </div>
          <div className="text-center p-3 bg-primary-50/50 rounded-lg">
            <p className="text-xs text-warm-500 mb-1">Great Round Chance</p>
            <p className="text-body-lg font-medium tracking-[-0.005em] text-primary-500">
              {Math.round(Number(prediction.tailRisks.greatRoundProbability ?? 0) * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* State Message */}
      {stateMessage && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4 })}
          className="mt-4 pt-4 border-t border-border-subtle flex items-center gap-2"
        >
          <stateMessage.icon size={16} className={stateMessage.color} />
          <span className={cn('text-sm font-medium', stateMessage.color)}>
            {stateMessage.text}
          </span>
        </m.div>
      )}
    </Card>
  );
}
