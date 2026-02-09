'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import type { MinedPattern } from '@/lib/coachhelm/v2/types';

interface V2PatternsSectionProps {
  patterns: MinedPattern[];
}

export function V2PatternsSection({ patterns }: V2PatternsSectionProps) {
  if (patterns.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5"
    >
      <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
        <div className="p-1.5 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
          <IconSparkles size={14} className="text-white" />
        </div>
        V2 Pattern Analysis
        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium ml-auto">
          AI Powered
        </span>
      </h3>

      <div className="space-y-3">
        {patterns.map((pattern, index) => (
          <motion.div
            key={pattern.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * index }}
            className={cn(
              'p-4 rounded-lg border bg-white',
              pattern.strokeImpact > 0 ? 'border-red-200' : 'border-green-200'
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {pattern.strokeImpact > 0 ? (
                    <IconTrendingUp size={14} className="text-red-500" />
                  ) : (
                    <IconTrendingDown size={14} className="text-green-500" />
                  )}
                  <span className="text-sm font-medium text-warm-900">
                    {pattern.description || `${pattern.patternType} pattern`}
                  </span>
                </div>
                <p className="text-xs text-warm-500">
                  {pattern.recommendation || 'Pattern detected in your recent rounds'}
                </p>
              </div>

              <div className={cn(
                'text-sm font-semibold px-2 py-1 rounded',
                pattern.strokeImpact > 0 
                  ? 'bg-red-100 text-red-700' 
                  : 'bg-green-100 text-green-700'
              )}>
                {pattern.strokeImpact > 0 ? '+' : ''}{pattern.strokeImpact.toFixed(1)} strokes
              </div>
            </div>

            {/* Pattern metrics */}
            <div className="flex items-center gap-4 text-xs text-warm-500">
              <span>
                Confidence: <span className="font-medium text-warm-700">{Math.round(pattern.confidence * 100)}%</span>
              </span>
              <span>
                Occurrences: <span className="font-medium text-warm-700">{pattern.occurrenceCount}</span>
              </span>
              <span className={cn(
                'px-1.5 py-0.5 rounded text-xs font-medium',
                pattern.trend === 'strengthening' && 'bg-amber-100 text-amber-700',
                pattern.trend === 'stable' && 'bg-warm-100 text-warm-600',
                pattern.trend === 'weakening' && 'bg-green-100 text-green-700',
                pattern.trend === 'new' && 'bg-blue-100 text-blue-700',
              )}>
                {pattern.trend}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
