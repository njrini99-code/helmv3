'use client';

import { motion } from 'framer-motion';
import { IconSparkles, IconTarget, IconChartBar } from '@/components/icons';
import type { IntelligentRoundReview } from '@/lib/coachhelm/v2/types';
import { cn } from '@/lib/utils';

interface V2ReviewSummaryProps {
  review: IntelligentRoundReview;
}

export function V2ReviewSummary({ review }: V2ReviewSummaryProps) {
  const { composedReview, reasoning, focusAreas, practicePriority } = review;
  const calibratedConfidence = reasoning.calibratedConfidence ?? reasoning.confidence;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5"
    >
      {/* Header with V2 badge */}
      <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
        <div className="p-1.5 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg">
          <IconSparkles size={14} className="text-white" />
        </div>
        CoachHelm V2 Summary
        <span className="text-xs px-2 py-0.5 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 rounded-full font-medium ml-auto">
          AI Intelligence
        </span>
      </h3>

      {/* Headline */}
      <div className="p-4 bg-white rounded-lg border border-green-100 mb-4">
        <div className="text-lg font-semibold text-warm-900 mb-2">
          {composedReview.headline}
        </div>
        <div className="text-sm text-warm-600 leading-relaxed">
          {composedReview.body}
        </div>
        
        {/* Confidence indicator */}
        <div className="mt-3 flex items-center gap-2">
          <div className="text-xs text-warm-500">AI Confidence:</div>
          <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${calibratedConfidence * 100}%` }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className={cn(
                'h-full rounded-full',
                calibratedConfidence >= 0.75 ? 'bg-green-500' :
                calibratedConfidence >= 0.5 ? 'bg-amber-500' :
                'bg-warm-400'
              )}
            />
          </div>
          <div className="text-xs font-medium text-warm-700">
            {Math.round(calibratedConfidence * 100)}%
          </div>
        </div>
      </div>

      {/* Primary Takeaway */}
      <div className="p-3 bg-green-100/50 rounded-lg border border-green-200 mb-4">
        <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-2">
          <IconTarget size={12} />
          Key Takeaway
        </div>
        <p className="text-sm font-medium text-green-900">{review.primaryTakeaway}</p>
      </div>

      {/* Focus Areas */}
      {focusAreas.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-warm-600 mb-2 flex items-center gap-2">
            <IconChartBar size={12} />
            Focus Areas
          </div>
          <div className="flex flex-wrap gap-2">
            {focusAreas.map((area, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1.5 bg-warm-100 text-warm-700 rounded-full"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Practice Priority */}
      {practicePriority && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="text-xs font-medium text-amber-700 mb-1">Next Practice Priority</div>
          <p className="text-sm font-medium text-amber-900">{practicePriority}</p>
        </div>
      )}

      {/* Reasoning breakdown */}
      {reasoning.evidence && reasoning.evidence.length > 0 && (
        <details className="mt-4 group">
          <summary className="text-xs text-warm-500 cursor-pointer hover:text-warm-700 transition-colors">
            View reasoning ({reasoning.evidence.length} supporting facts)
          </summary>
          <div className="mt-2 pl-3 border-l-2 border-warm-200 space-y-1">
            {reasoning.evidence.slice(0, 5).map((item: string, i: number) => (
              <div key={i} className="text-xs text-warm-600">
                • {item}
              </div>
            ))}
          </div>
        </details>
      )}
    </motion.div>
  );
}
