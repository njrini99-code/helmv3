'use client';

import { motion } from 'framer-motion';
import { IconSparkles, IconTarget, IconChartBar } from '@/components/icons';
import type { IntelligentRoundReview } from '@/lib/coachhelm/v2/types';
import { cn } from '@/lib/utils';

interface V2ReviewSummaryProps {
  review: IntelligentRoundReview;
}

/** Convert snake_case or camelCase to readable Title Case */
function formatLabel(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Strip NaN artifacts from generated text */
function sanitizeNaN(text: string): string {
  return text
    .replace(/This occurs in NaN% of rounds with NaN% reliability\.?\s*/gi, '')
    .replace(/\bNaN%/g, '')
    .replace(/\bNaN\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function V2ReviewSummary({ review }: V2ReviewSummaryProps) {
  const { composedReview, reasoning, focusAreas, practicePriority } = review;
  const rawConfidence = reasoning.calibratedConfidence ?? reasoning.confidence;
  const calibratedConfidence = Number.isFinite(rawConfidence) ? rawConfidence : 0;

  const headline = composedReview?.headline ? sanitizeNaN(composedReview.headline) : '';
  const body = composedReview?.body ? sanitizeNaN(composedReview.body) : '';
  const takeaway = review.primaryTakeaway ? sanitizeNaN(review.primaryTakeaway) : '';

  if (!headline || !body) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* AI Summary Card */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-warm-200 overflow-clip shadow-sm">
        {/* Header bar */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-primary-50 to-primary-50 border-b border-primary-100/60 flex items-center gap-3">
          <div className="p-1.5 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg shadow-sm shadow-primary-500/20">
            <IconSparkles size={14} className="text-white" />
          </div>
          <h3 className="text-sm font-semibold text-warm-900">AI Round Analysis</h3>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="h-1.5 w-20 bg-primary-200/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${calibratedConfidence * 100}%` }}
                transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'h-full rounded-full',
                  calibratedConfidence >= 0.75 ? 'bg-primary-500' :
                  calibratedConfidence >= 0.5 ? 'bg-amber-500' :
                  'bg-warm-400'
                )}
              />
            </div>
            <span className="text-label font-semibold text-warm-500 tabular-nums">
              {Math.round(calibratedConfidence * 100)}%
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <motion.h4
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="text-base font-semibold text-warm-900 mb-2"
          >
            {headline}
          </motion.h4>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="text-sm text-warm-600 leading-relaxed"
          >
            {body}
          </motion.p>
        </div>
      </div>

      {/* Key Takeaway + Practice Priority row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Key Takeaway */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl bg-primary-50/70 border border-primary-200/50 p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1 bg-primary-100 rounded-md">
              <IconTarget size={12} className="text-primary-600" />
            </div>
            <span className="text-label font-semibold text-primary-700 uppercase tracking-wider">Key Takeaway</span>
          </div>
          <p className="text-sm font-medium text-primary-900 leading-relaxed">
            {takeaway}
          </p>
        </motion.div>

        {/* Practice Priority */}
        {practicePriority && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl bg-amber-50/70 border border-amber-200/50 p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 bg-amber-100 rounded-md">
                <IconTarget size={12} className="text-amber-600" />
              </div>
              <span className="text-label font-semibold text-amber-700 uppercase tracking-wider">Practice Priority</span>
            </div>
            <p className="text-sm font-medium text-amber-900 leading-relaxed">
              {practicePriority}
            </p>
          </motion.div>
        )}
      </div>

      {/* Focus Areas */}
      {focusAreas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.35 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <div className="flex items-center gap-1.5 text-label font-medium text-warm-500">
            <IconChartBar size={12} />
            Focus:
          </div>
          {focusAreas.map((area, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.65 + i * 0.05, duration: 0.25 }}
              className="text-xs px-2.5 py-1 bg-warm-100/80 text-warm-700 rounded-full font-medium border border-warm-200/50"
            >
              {formatLabel(area)}
            </motion.span>
          ))}
        </motion.div>
      )}

      {/* Reasoning (collapsed by default) */}
      {reasoning.evidence && reasoning.evidence.length > 0 && (
        <details className="group">
          <summary className="text-label text-warm-400 cursor-pointer hover:text-warm-600 transition-colors select-none">
            Supporting evidence ({reasoning.evidence.length})
          </summary>
          <div className="mt-2 pl-3 border-l-2 border-warm-100 space-y-1.5">
            {reasoning.evidence.slice(0, 5).map((item: string, i: number) => (
              <div key={i} className="text-label text-warm-500 leading-relaxed">
                {item}
              </div>
            ))}
          </div>
        </details>
      )}
    </motion.div>
  );
}
