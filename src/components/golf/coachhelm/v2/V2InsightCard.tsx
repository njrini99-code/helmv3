'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconChevronDown,
  IconSparkles,
  IconSparkles as IconBrain,
  IconCheck,
  IconX,
} from '@/components/icons';
import type { ComposedInsight } from '@/lib/coachhelm/v2/types';

interface V2InsightCardProps {
  insight: ComposedInsight;
  onAction?: (action: 'acknowledge' | 'dismiss') => void;
}

const toneStyles = {
  encouraging: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-600',
    accent: 'bg-green-500',
  },
  neutral: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: 'text-slate-600',
    accent: 'bg-slate-500',
  },
  cautionary: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    accent: 'bg-amber-500',
  },
  urgent: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-600',
    accent: 'bg-red-500',
  },
  celebratory: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: 'text-purple-600',
    accent: 'bg-purple-500',
  },
};

export function V2InsightCard({ insight, onAction }: V2InsightCardProps) {
  const [expanded, setExpanded] = useState(false);

  const style = toneStyles[insight.tone] || toneStyles.neutral;
  const confidencePercent = Math.round(insight.confidence * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'rounded-xl border overflow-hidden',
        style.bg,
        style.border
      )}
    >
      {/* Accent bar */}
      <div className={cn('h-1', style.accent)} />

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start gap-3"
      >
        {/* Icon */}
        <div className={cn('p-2 rounded-lg bg-white shadow-sm', style.icon)}>
          {insight.tone === 'celebratory' ? (
            <IconSparkles size={18} />
          ) : (
            <IconBrain size={18} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 mb-1">
            {insight.headline}
          </h3>
          <p className="text-sm text-slate-600 line-clamp-2">
            {insight.body}
          </p>
          
          {/* Confidence badge */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-400">
              {confidencePercent}% confidence
            </span>
            {insight.reasoning && (
              <span className="text-xs px-2 py-0.5 bg-white/50 rounded-full text-slate-500">
                AI Reasoning
              </span>
            )}
          </div>
        </div>

        {/* Expand Icon */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400"
        >
          <IconChevronDown size={20} />
        </motion.div>
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              {/* Full body text */}
              <p className="text-sm text-slate-700 mb-4">
                {insight.body}
              </p>

              {/* Reasoning Chain */}
              {insight.reasoning && insight.reasoning.reasoningChain && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
                    How We Reached This Conclusion
                  </h4>
                  <div className="space-y-2">
                    {insight.reasoning.reasoningChain.slice(0, 3).map((step, i) => (
                      <div
                        key={i}
                        className="text-xs bg-white/60 rounded-lg p-2 border border-white"
                      >
                        <span className="font-medium text-slate-600">
                          Step {step.stepNumber}:
                        </span>{' '}
                        <span className="text-slate-500">
                          {step.conclusion}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Call to Action */}
              {insight.callToAction && (
                <div className="p-3 bg-white/50 rounded-lg border border-white mb-4">
                  <h4 className="text-xs font-medium text-slate-500 uppercase mb-1">
                    Suggested Action
                  </h4>
                  <p className="text-sm text-slate-700">
                    {insight.callToAction}
                  </p>
                </div>
              )}

              {/* Actions */}
              {onAction && (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction('acknowledge');
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:text-green-700 px-3 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 transition-colors"
                  >
                    <IconCheck size={14} />
                    Got It
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction('dismiss');
                    }}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-white/50 transition-colors"
                  >
                    <IconX size={14} />
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
