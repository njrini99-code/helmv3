'use client';

/**
 * TrendIndicator - Inline Trend Display Component
 *
 * Small, elegant component showing improvement/decline with
 * arrow indicators, percentage change, and optional tooltips.
 */

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn, formatMetricLabel } from '@/lib/utils';
import { IconTrendingUp, IconTrendingDown } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';
import type { TrendData } from '@/app/golf/actions/shot-analytics';

interface TrendIndicatorProps {
  trend: TrendData;
  size?: 'xs' | 'sm' | 'md';
  showValue?: boolean;
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

export function TrendIndicator({
  trend,
  size = 'sm',
  showValue = true,
  showLabel = false,
  animated = true,
  className,
}: TrendIndicatorProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showTooltip, setShowTooltip] = useState(false);

  const isPositive = trend.isImprovement;
  const isFlat = trend.direction === 'flat';

  const iconSizes = {
    xs: 12,
    sm: 14,
    md: 16,
  };

  const textSizes = {
    xs: 'text-xs',
    sm: 'text-xs',
    md: 'text-sm',
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn('relative inline-flex items-center gap-1', className)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Arrow indicator */}
      <motion.div
        initial={animated ? { scale: 0 } : undefined}
        animate={{ scale: 1 }}
        transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.2, type: 'spring' } : undefined)}
        className={cn(
          'flex items-center justify-center rounded-full',
          size === 'xs' && 'w-4 h-4',
          size === 'sm' && 'w-5 h-5',
          size === 'md' && 'w-6 h-6',
          isFlat && 'bg-warm-100',
          isPositive && !isFlat && 'bg-primary-100',
          !isPositive && !isFlat && 'bg-red-100'
        )}
      >
        {isFlat ? (
          <span className="text-warm-400 font-medium" style={{ fontSize: iconSizes[size] - 2 }}>
            -
          </span>
        ) : trend.direction === 'up' ? (
          <IconTrendingUp
            size={iconSizes[size]}
            className={isPositive ? 'text-primary-600' : 'text-red-500'}
          />
        ) : (
          <IconTrendingDown
            size={iconSizes[size]}
            className={isPositive ? 'text-primary-600' : 'text-red-500'}
          />
        )}
      </motion.div>

      {/* Change value */}
      {showValue && !isFlat && (
        <motion.span
          initial={animated ? { opacity: 0, x: -5 } : undefined}
          animate={{ opacity: 1, x: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.2, delay: 0.1 } : undefined)}
          className={cn(
            'font-medium tabular-nums',
            textSizes[size],
            isPositive ? 'text-primary-600' : 'text-red-500'
          )}
        >
          {trend.changePercent > 0 ? '+' : ''}{trend.changePercent}
        </motion.span>
      )}

      {/* Label */}
      {showLabel && (
        <span className={cn('text-warm-500', textSizes[size])}>
          {trend.metric}
        </span>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.15 })}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50"
          >
            <div className="bg-warm-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
              <div className="font-medium mb-1">{formatMetricLabel(trend.metric)}</div>
              <div className="flex items-center gap-2 text-warm-300">
                <span>Now: {trend.currentValue}</span>
                <span className="text-warm-500">|</span>
                <span>Was: {trend.previousValue}</span>
              </div>
              {/* Arrow pointer */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                <div className="border-4 border-transparent border-t-warm-900" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Trend summary for multiple metrics
interface TrendSummaryProps {
  trends: TrendData[];
  className?: string;
  animated?: boolean;
}

export function TrendSummary({ trends, className, animated = true }: TrendSummaryProps) {
  const prefersReducedMotion = useReducedMotion();
  const improvements = trends.filter(t => t.isImprovement).length;
  const declines = trends.filter(t => !t.isImprovement && t.direction !== 'flat').length;
  const flat = trends.filter(t => t.direction === 'flat').length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary header */}
      <div className="flex items-center gap-4">
        {improvements > 0 && (
          <motion.div
            initial={animated ? { opacity: 0, scale: 0.9 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
              <IconTrendingUp size={12} className="text-primary-600" />
            </div>
            <span className="text-sm font-medium text-primary-700">{improvements} improving</span>
          </motion.div>
        )}

        {declines > 0 && (
          <motion.div
            initial={animated ? { opacity: 0, scale: 0.9 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : (animated ? { delay: 0.1 } : undefined)}
            className="flex items-center gap-2"
          >
            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
              <IconTrendingDown size={12} className="text-red-500" />
            </div>
            <span className="text-sm font-medium text-red-600">{declines} declining</span>
          </motion.div>
        )}

        {flat > 0 && improvements === 0 && declines === 0 && (
          <motion.div
            initial={animated ? { opacity: 0, scale: 0.9 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-5 h-5 rounded-full bg-warm-100 flex items-center justify-center">
              <span className="text-warm-400 text-xs font-medium">—</span>
            </div>
            <span className="text-sm text-warm-500">{flat} stable</span>
          </motion.div>
        )}
      </div>

      {/* Individual trends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {trends.map((trend, index) => (
          <motion.div
            key={trend.metric}
            initial={animated ? { opacity: 0, x: -10 } : undefined}
            animate={{ opacity: 1, x: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : (animated ? { delay: 0.05 * index } : undefined)}
            className={cn(
              'flex items-center justify-between p-2 rounded-lg',
              trend.isImprovement && trend.direction !== 'flat' && 'bg-primary-50',
              !trend.isImprovement && trend.direction !== 'flat' && 'bg-red-50',
              trend.direction === 'flat' && 'bg-warm-50'
            )}
          >
            <div className="flex items-center gap-2">
              <TrendIndicator trend={trend} size="xs" showValue={false} animated={false} />
              <span className="text-sm text-warm-700">{formatMetricLabel(trend.metric)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warm-900 tabular-nums">
                {trend.currentValue}
              </span>
              {trend.direction !== 'flat' && (
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    trend.isImprovement ? 'text-primary-600' : 'text-red-500'
                  )}
                >
                  ({trend.changePercent > 0 ? '+' : ''}{trend.changePercent})
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {trends.length === 0 && (
        <EmptyState
          variant="minimal"
          type="stats"
          description="No trend data yet — need more rounds to compare."
        />
      )}
    </div>
  );
}
