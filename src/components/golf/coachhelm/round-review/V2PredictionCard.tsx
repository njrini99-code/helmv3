'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconTarget, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import type { PerformancePrediction } from '@/lib/coachhelm/v2/types';

interface V2PredictionCardProps {
  prediction: PerformancePrediction;
}

/** Convert snake_case or camelCase to readable Title Case */
function formatLabel(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function V2PredictionCard({ prediction }: V2PredictionCardProps) {
  const predictedValue = Number.isFinite(prediction.predictedValue) ? prediction.predictedValue : 0;
  const rawConfidence = prediction.confidence;
  const confidencePercent = Number.isFinite(rawConfidence) ? Math.round(rawConfidence * 100) : 0;
  const lowerBound = prediction.lowerBound ?? prediction.predictedRangeLow;
  const upperBound = prediction.upperBound ?? prediction.predictedRangeHigh;
  const hasRange = Number.isFinite(lowerBound) && Number.isFinite(upperBound);
  const trend =
    prediction.trend ??
    (prediction.predictedValue < 0
      ? 'improving'
      : prediction.predictedValue > 0
        ? 'declining'
        : 'stable');
  const inputFeatureCount =
    prediction.inputFeatures?.length ?? prediction.keyFactors?.length ?? 0;
  const keyDrivers =
    prediction.keyDrivers ??
    prediction.keyFactors?.map((factor) => factor.name).filter(Boolean) ??
    [];

  const isPositive =
    prediction.predictionType === 'round_score'
      ? predictedValue < 0
      : trend === 'improving';

  const trendLabel = trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-white/80 backdrop-blur-sm border border-warm-200 overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100/60 flex items-center gap-3">
        <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-sm shadow-blue-500/20">
          <IconTarget size={14} className="text-white" />
        </div>
        <h3 className="text-sm font-semibold text-warm-900">Performance Forecast</h3>
        <span className={cn(
          'text-[11px] font-semibold px-2.5 py-0.5 rounded-full ml-auto',
          confidencePercent >= 75 ? 'bg-green-100 text-green-700' :
          confidencePercent >= 50 ? 'bg-amber-100 text-amber-700' :
          'bg-warm-100 text-warm-600'
        )}>
          {confidencePercent}% confidence
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-6">
          {/* Predicted Score */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <div className={cn(
              'text-3xl font-bold tabular-nums',
              isPositive ? 'text-green-600' : predictedValue === 0 ? 'text-warm-800' : 'text-red-500',
            )}>
              {predictedValue > 0 ? '+' : ''}{predictedValue.toFixed(1)}
            </div>
            {isPositive ? (
              <IconTrendingDown size={20} className="text-green-500" />
            ) : predictedValue !== 0 ? (
              <IconTrendingUp size={20} className="text-red-500" />
            ) : null}
          </motion.div>

          {/* Separator */}
          <div className="h-10 w-px bg-warm-100" />

          {/* Trend */}
          <div>
            <div className="text-[11px] text-warm-500 mb-0.5">Trend</div>
            <div className={cn(
              'text-sm font-semibold',
              trend === 'improving' && 'text-green-600',
              trend === 'declining' && 'text-red-500',
              trend === 'stable' && 'text-warm-600',
            )}>
              {trendLabel}
            </div>
          </div>

          {/* Range */}
          {hasRange && (
            <>
              <div className="h-10 w-px bg-warm-100" />
              <div>
                <div className="text-[11px] text-warm-500 mb-0.5">Range</div>
                <div className="text-sm font-medium text-warm-700 tabular-nums">
                  {Number(lowerBound).toFixed(1)} to {Number(upperBound).toFixed(1)}
                </div>
              </div>
            </>
          )}

          {/* Factors */}
          {inputFeatureCount > 0 && (
            <>
              <div className="h-10 w-px bg-warm-100" />
              <div>
                <div className="text-[11px] text-warm-500 mb-0.5">Factors</div>
                <div className="text-sm font-medium text-warm-700">{inputFeatureCount}</div>
              </div>
            </>
          )}
        </div>

        {/* Key Drivers */}
        {keyDrivers.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-warm-100 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-warm-500">Drivers:</span>
            {keyDrivers.slice(0, 4).map((driver: string, i: number) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.06, duration: 0.25 }}
                className="text-[11px] px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-100/50"
              >
                {formatLabel(driver)}
              </motion.span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
