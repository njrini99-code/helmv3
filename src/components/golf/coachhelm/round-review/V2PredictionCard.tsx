'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconTarget, IconTrendingUp, IconTrendingDown, IconChartBar } from '@/components/icons';
import type { PerformancePrediction } from '@/lib/coachhelm/v2/types';

interface V2PredictionCardProps {
  prediction: PerformancePrediction;
}

export function V2PredictionCard({ prediction }: V2PredictionCardProps) {
  const predictedValue = prediction.predictedValue;
  const confidencePercent = Math.round(prediction.confidence * 100);
  
  // Determine if prediction is positive or negative based on type
  const isPositive = prediction.predictionType === 'round_score' 
    ? predictedValue < 72 
    : prediction.trend === 'improving';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5"
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
          <IconTarget size={14} className="text-white" />
        </div>
        Performance Prediction
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full font-medium ml-auto',
          confidencePercent >= 75 ? 'bg-green-100 text-green-700' :
          confidencePercent >= 50 ? 'bg-amber-100 text-amber-700' :
          'bg-slate-100 text-slate-600'
        )}>
          {confidencePercent}% confidence
        </span>
      </h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Predicted Score */}
        <div className="p-4 bg-white rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500 mb-1">Next Round Prediction</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {predictedValue.toFixed(1)}
            </span>
            {isPositive ? (
              <IconTrendingDown size={18} className="text-green-500" />
            ) : (
              <IconTrendingUp size={18} className="text-red-500" />
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Range: {prediction.lowerBound?.toFixed(1)} - {prediction.upperBound?.toFixed(1)}
          </div>
        </div>

        {/* Trend */}
        <div className="p-4 bg-white rounded-lg border border-slate-200">
          <div className="text-xs text-slate-500 mb-1">Current Trend</div>
          <div className={cn(
            'text-lg font-semibold capitalize',
            prediction.trend === 'improving' && 'text-green-600',
            prediction.trend === 'declining' && 'text-red-600',
            prediction.trend === 'stable' && 'text-slate-600',
          )}>
            {prediction.trend}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Based on {prediction.inputFeatures?.length || 0} factors
          </div>
        </div>
      </div>

      {/* Key Drivers */}
      {prediction.keyDrivers && prediction.keyDrivers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
            <IconChartBar size={12} />
            Key Performance Drivers
          </div>
          <div className="flex flex-wrap gap-2">
            {prediction.keyDrivers.slice(0, 4).map((driver: string, i: number) => (
              <span
                key={i}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-md"
              >
                {driver}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
