'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconChevronDown,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
  IconSparkles,
  IconStar,
} from '@/components/icons';
import type { MinedPattern } from '@/lib/coachhelm/v2/types';

interface PatternCardProps {
  pattern: MinedPattern;
  onDismiss?: () => void;
}

export function PatternCard({ pattern, onDismiss }: PatternCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isNegative = pattern.strokeImpact > 0;
  const impactColor = isNegative ? 'text-red-600' : 'text-green-600';
  const impactBg = isNegative ? 'bg-red-50' : 'bg-green-50';

  const getPatternIcon = () => {
    switch (pattern.patternType) {
      case 'conditional':
        return <IconStar size={16} className="text-amber-500" />;
      case 'compound':
        return <IconSparkles size={16} className="text-purple-500" />;
      case 'anomaly':
        return <IconAlertCircle size={16} className="text-orange-500" />;
      default:
        return <IconStar size={16} className="text-blue-500" />;
    }
  };

  const getTrendIcon = () => {
    if (pattern.trend === 'strengthening') {
      return <IconTrendingUp size={14} className="text-slate-400" />;
    }
    if (pattern.trend === 'weakening') {
      return <IconTrendingDown size={14} className="text-slate-400" />;
    }
    return null;
  };

  const confidencePercent = Math.round(pattern.confidence * 100);
  const supportPercent = Math.round(pattern.support * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'bg-white rounded-xl border border-slate-200 overflow-hidden',
        'hover:shadow-md transition-shadow'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start gap-3"
      >
        {/* Icon */}
        <div className={cn('p-2 rounded-lg', impactBg)}>
          {getPatternIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              {pattern.patternType} Pattern
            </span>
            {getTrendIcon()}
          </div>

          <p className="text-sm text-slate-800 font-medium line-clamp-2">
            {pattern.description || 'Pattern detected in your performance data'}
          </p>

          {/* Impact Badge */}
          <div className="flex items-center gap-3 mt-2">
            <span className={cn('text-sm font-semibold', impactColor)}>
              {isNegative ? '+' : ''}{pattern.strokeImpact.toFixed(1)} strokes
            </span>
            <span className="text-xs text-slate-400">
              {confidencePercent}% confidence
            </span>
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
            <div className="px-4 pb-4 pt-0 border-t border-slate-100">
              {/* Conditions */}
              <div className="mt-3">
                <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
                  When This Happens
                </h4>
                <div className="space-y-1">
                  {pattern.conditions.map((condition, i) => (
                    <div
                      key={i}
                      className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2"
                    >
                      {condition.label || `${condition.field} ${condition.operator} ${condition.value}`}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="text-center">
                  <div className="text-lg font-semibold text-slate-800">
                    {supportPercent}%
                  </div>
                  <div className="text-xs text-slate-500">Frequency</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-slate-800">
                    {pattern.lift.toFixed(1)}x
                  </div>
                  <div className="text-xs text-slate-500">Lift</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-slate-800">
                    {pattern.sampleSize}
                  </div>
                  <div className="text-xs text-slate-500">Samples</div>
                </div>
              </div>

              {/* Recommendation */}
              {pattern.recommendation && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100">
                  <h4 className="text-xs font-medium text-green-700 uppercase mb-1">
                    Recommendation
                  </h4>
                  <p className="text-sm text-green-800">
                    {pattern.recommendation}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                {onDismiss && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
