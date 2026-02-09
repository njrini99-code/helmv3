'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconArrowRight, IconSparkles } from '@/components/icons';
import type { CausalRelationship } from '@/lib/coachhelm/v2/types';

interface V2CausalInsightsProps {
  insights: CausalRelationship[];
}

export function V2CausalInsights({ insights }: V2CausalInsightsProps) {
  if (insights.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5"
    >
      <h3 className="text-sm font-semibold text-warm-900 mb-4 flex items-center gap-2">
        <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
          <IconSparkles size={14} className="text-white" />
        </div>
        Causal Insights
        <span className="text-xs text-warm-500 ml-auto">
          Why your performance changed
        </span>
      </h3>

      <div className="space-y-3">
        {insights.map((insight, index) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * index }}
            className="p-4 bg-white rounded-lg border border-amber-100"
          >
            {/* Cause → Effect */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 p-2 bg-warm-50 rounded-lg text-center">
                <div className="text-xs text-warm-500 mb-0.5">Cause</div>
                <div className="text-sm font-medium text-warm-900">{insight.cause}</div>
              </div>
              
              <div className="flex items-center justify-center w-8 h-8 bg-amber-100 rounded-full flex-shrink-0">
                <IconArrowRight size={16} className="text-amber-600" />
              </div>
              
              <div className="flex-1 p-2 bg-warm-50 rounded-lg text-center">
                <div className="text-xs text-warm-500 mb-0.5">Effect</div>
                <div className="text-sm font-medium text-warm-900">{insight.effect}</div>
              </div>
            </div>

            {/* Mechanism */}
            <div className="text-sm text-warm-600 mb-3">
              <span className="font-medium">How: </span>
              {insight.mechanism}
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-warm-500">
                Strength:
                <span className={cn(
                  'ml-1 font-medium',
                  Number.isFinite(insight.strength) && insight.strength >= 0.7 ? 'text-green-600' :
                  Number.isFinite(insight.strength) && insight.strength >= 0.4 ? 'text-amber-600' :
                  'text-warm-600'
                )}>
                  {Number.isFinite(insight.strength) ? `${Math.round(insight.strength * 100)}%` : '--'}
                </span>
              </span>
              <span className="text-warm-500">
                Confidence:
                <span className="ml-1 font-medium text-warm-700">
                  {Number.isFinite(insight.confidence) ? `${Math.round(insight.confidence * 100)}%` : '--'}
                </span>
              </span>
              {insight.doseResponse && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                  Actionable
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
