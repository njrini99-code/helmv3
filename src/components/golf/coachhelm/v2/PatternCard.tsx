'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
import { Button } from '@/components/ui/button';

interface PatternCardProps {
  pattern: MinedPattern;
  onDismiss?: () => void;
}

export function PatternCard({ pattern, onDismiss }: PatternCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const isNegative = pattern.strokeImpact > 0;
  const impactColor = isNegative ? 'text-destructive' : 'text-primary-600';
  const impactBg = isNegative ? 'bg-destructive/10' : 'bg-primary-50';

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
      return <IconTrendingUp size={14} className="text-warm-400" />;
    }
    if (pattern.trend === 'weakening') {
      return <IconTrendingDown size={14} className="text-warm-400" />;
    }
    return null;
  };

  const confidencePercent = Math.round(pattern.confidence * 100);
  const supportPercent = Math.round(pattern.support * 100);
  // Actionability (0-1) — how worth-acting-on a pattern is. Surfaced at a glance
  // so coaches can triage without opening the detail modal.
  const actionPercent = Math.round(pattern.actionability * 100);
  const actionTone =
    pattern.actionability >= 0.7
      ? 'text-primary-700 bg-primary-50'
      : pattern.actionability >= 0.4
        ? 'text-amber-700 bg-amber-50'
        : 'text-warm-500 bg-warm-100';
  const trendLabel =
    pattern.trend === 'strengthening'
      ? 'Strengthening'
      : pattern.trend === 'weakening'
        ? 'Weakening'
        : pattern.trend === 'new'
          ? 'New'
          : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'bg-white rounded-xl border border-warm-200 overflow-hidden',
        'hover:shadow-md transition-shadow'
      )}
    >
      {/* Header */}
      <Button variant="ghost"
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
            <span className="text-xs font-medium text-warm-400 uppercase tracking-wide">
              {pattern.patternType} Pattern
            </span>
            {getTrendIcon()}
            {trendLabel ? (
              <span className="text-xs text-warm-400">{trendLabel}</span>
            ) : null}
          </div>

          <p className="text-sm text-warm-800 font-medium line-clamp-2">
            {pattern.description || 'Pattern detected in your performance data'}
          </p>

          {/* Impact Badge */}
          <div className="flex items-center gap-3 mt-2">
            <span className={cn('text-sm font-medium', impactColor)}>
              {isNegative ? '+' : ''}{pattern.strokeImpact.toFixed(1)} strokes
            </span>
            <span className="text-xs text-warm-400">
              {confidencePercent}% confidence
            </span>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', actionTone)}>
              {actionPercent}% actionable
            </span>
          </div>
        </div>

        {/* Expand Icon */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
          className="text-warm-400"
        >
          <IconChevronDown size={20} />
        </motion.div>
      </Button>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } })}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-warm-100">
              {/* Conditions */}
              <div className="mt-3">
                <h4 className="text-xs font-medium text-warm-500 uppercase mb-2">
                  When This Happens
                </h4>
                <div className="space-y-1">
                  {pattern.conditions.map((condition, i) => (
                    <div
                      key={i}
                      className="text-sm text-warm-600 bg-warm-50 rounded-lg px-3 py-2"
                    >
                      {condition.label || `${condition.field} ${condition.operator} ${condition.value}`}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                <div className="text-center">
                  <div className="text-lg font-medium text-warm-800">
                    {supportPercent}%
                  </div>
                  <div className="text-xs text-warm-500">Frequency</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-medium text-warm-800">
                    {pattern.lift.toFixed(1)}x
                  </div>
                  <div className="text-xs text-warm-500">Lift</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-medium text-warm-800">
                    {pattern.sampleSize}
                  </div>
                  <div className="text-xs text-warm-500">Samples</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-medium text-warm-800">
                    {pattern.occurrenceCount}
                  </div>
                  <div className="text-xs text-warm-500">Occurrences</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-medium text-warm-800">
                    {actionPercent}%
                  </div>
                  <div className="text-xs text-warm-500">Actionable</div>
                </div>
              </div>

              {/* Recommendation */}
              {pattern.recommendation && (
                <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-primary-100">
                  <h4 className="text-xs font-medium text-primary-700 uppercase mb-1">
                    Recommendation
                  </h4>
                  <p className="text-sm text-primary-800">
                    {pattern.recommendation}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                {onDismiss && (
                  <Button variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}
                    className="text-xs text-warm-500 hover:text-warm-700 px-3 py-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 transition-colors"
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
