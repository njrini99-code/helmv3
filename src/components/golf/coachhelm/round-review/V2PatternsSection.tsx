'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import type { MinedPattern } from '@/lib/coachhelm/v2/types';

interface V2PatternsSectionProps {
  patterns: MinedPattern[];
}

/** Convert snake_case or camelCase to readable Title Case */
function formatLabel(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Strip NaN artifacts from text */
function sanitizeNaN(text: string): string {
  return text
    .replace(/\bNaN%/g, '')
    .replace(/\bNaN\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const trendLabels: Record<string, string> = {
  strengthening: 'Strengthening',
  stable: 'Stable',
  weakening: 'Weakening',
  new: 'New',
};

export function V2PatternsSection({ patterns }: V2PatternsSectionProps) {
  if (patterns.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-white/80 backdrop-blur-sm border border-warm-200 overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-purple-50 to-violet-50 border-b border-purple-100/60 flex items-center gap-3">
        <div className="p-1.5 bg-gradient-to-br from-purple-500 to-violet-500 rounded-lg shadow-sm shadow-purple-500/20">
          <IconSparkles size={14} className="text-white" />
        </div>
        <h3 className="text-sm font-semibold text-warm-900">Detected Patterns</h3>
        <span className="text-label font-semibold text-warm-500 ml-auto tabular-nums">
          {patterns.length} pattern{patterns.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4 space-y-2.5">
        {patterns.map((pattern, index) => {
          const strokeImpact = Number.isFinite(pattern.strokeImpact) ? pattern.strokeImpact : 0;
          const confidence = Number.isFinite(pattern.confidence) ? pattern.confidence : 0;
          const isNegative = strokeImpact > 0;

          return (
            <motion.div
              key={pattern.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'p-4 rounded-xl border transition-colors',
                isNegative
                  ? 'bg-red-50/40 border-red-100 hover:bg-red-50/60'
                  : 'bg-primary-50/40 border-primary-100 hover:bg-primary-50/60'
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2.5">
                  {isNegative ? (
                    <div className="p-1 bg-red-100 rounded-md">
                      <IconTrendingUp size={12} className="text-red-500" />
                    </div>
                  ) : (
                    <div className="p-1 bg-primary-100 rounded-md">
                      <IconTrendingDown size={12} className="text-primary-500" />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-warm-900">
                    {pattern.description ? sanitizeNaN(pattern.description) : `${formatLabel(pattern.patternType)} Pattern`}
                  </span>
                </div>

                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.12 * index + 0.2, duration: 0.3 }}
                  className={cn(
                    'text-xs font-bold px-2.5 py-0.5 rounded-lg flex-shrink-0 tabular-nums',
                    isNegative
                      ? 'bg-red-100 text-red-700 border border-red-200/50'
                      : 'bg-primary-100 text-primary-700 border border-primary-200/50'
                  )}
                >
                  {isNegative ? '+' : ''}{strokeImpact.toFixed(1)}
                </motion.span>
              </div>

              {pattern.recommendation && (
                <p className="text-[13px] text-warm-600 leading-relaxed mb-3 ml-[30px]">
                  {sanitizeNaN(pattern.recommendation)}
                </p>
              )}

              {/* Metrics row */}
              <div className="flex items-center gap-3 text-label ml-[30px]">
                <span className="text-warm-500 tabular-nums">
                  {Math.round(confidence * 100)}% confidence
                </span>
                <span className="text-warm-200">|</span>
                <span className="text-warm-500 tabular-nums">
                  {pattern.occurrenceCount ?? 0} occurrence{pattern.occurrenceCount !== 1 ? 's' : ''}
                </span>
                <span className="text-warm-200">|</span>
                <span className={cn(
                  'px-2 py-0.5 rounded-md text-micro font-bold border',
                  pattern.trend === 'strengthening' && 'bg-amber-100 text-amber-700 border-amber-200/50',
                  pattern.trend === 'stable' && 'bg-warm-100 text-warm-600 border-warm-200/50',
                  pattern.trend === 'weakening' && 'bg-primary-100 text-primary-700 border-primary-200/50',
                  pattern.trend === 'new' && 'bg-blue-100 text-blue-700 border-blue-200/50',
                )}>
                  {trendLabels[pattern.trend] ?? pattern.trend}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
