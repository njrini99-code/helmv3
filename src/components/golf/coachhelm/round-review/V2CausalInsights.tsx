'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconArrowRight, IconSparkles } from '@/components/icons';
import type { CausalRelationship } from '@/lib/coachhelm/v2/types';

interface V2CausalInsightsProps {
  insights: CausalRelationship[];
}

/** Convert snake_case or camelCase to readable Title Case */
function formatLabel(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function V2CausalInsights({ insights }: V2CausalInsightsProps) {
  if (insights.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-cream-100/82 backdrop-blur-sm border border-warm-200 overflow-clip shadow-sm"
    >
      {/* Header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100/60 flex items-center gap-3">
        <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg shadow-sm shadow-amber-500/20">
          <IconSparkles size={14} className="text-white" />
        </div>
        <h3 className="text-sm font-semibold text-warm-900">Why Your Performance Changed</h3>
      </div>

      <div className="p-4 space-y-2.5">
        {insights.map((insight, index) => {
          const strengthPct = Number.isFinite(insight.strength) ? Math.round(insight.strength * 100) : 0;
          const confPct = Number.isFinite(insight.confidence) ? Math.round(insight.confidence * 100) : 0;

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="p-4 rounded-xl bg-warm-50/50 border border-warm-100 hover:bg-warm-50 active:bg-warm-100 transition-colors"
            >
              {/* Cause -> Effect flow */}
              <div className="flex items-center gap-3 mb-2.5">
                <span className="text-sm font-semibold text-warm-900">
                  {formatLabel(insight.cause)}
                </span>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15 * index + 0.2, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center justify-center w-6 h-6 bg-gradient-to-br from-amber-100 to-amber-50 rounded-full flex-shrink-0 border border-amber-200/50"
                >
                  <IconArrowRight size={12} className="text-amber-600" />
                </motion.div>
                <span className="text-sm font-semibold text-warm-900">
                  {formatLabel(insight.effect)}
                </span>
              </div>

              {/* Mechanism */}
              <p className="text-[13px] text-warm-600 leading-relaxed mb-3">
                {insight.mechanism}
              </p>

              {/* Metrics row */}
              <div className="flex items-center gap-3 text-label">
                {/* Strength bar */}
                <div className="flex items-center gap-1.5">
                  <span className="text-warm-500">Strength</span>
                  <div className="w-14 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${strengthPct}%` }}
                      transition={{ delay: 0.15 * index + 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        'h-full rounded-full',
                        strengthPct >= 70 ? 'bg-primary-500' :
                        strengthPct >= 40 ? 'bg-amber-500' :
                        'bg-warm-400'
                      )}
                    />
                  </div>
                  <span className="font-semibold text-warm-700 tabular-nums">{strengthPct}%</span>
                </div>

                <span className="text-warm-200">|</span>

                {/* Confidence */}
                <div className="flex items-center gap-1.5">
                  <span className="text-warm-500">Confidence</span>
                  <span className="font-semibold text-warm-700 tabular-nums">{confPct}%</span>
                </div>

                {insight.doseResponse && (
                  <>
                    <span className="text-warm-200">|</span>
                    <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-micro font-bold border border-primary-200/50">
                      Actionable
                    </span>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
