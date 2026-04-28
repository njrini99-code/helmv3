'use client';

/**
 * AnalyticsSummaryCards - Overview summary stats for CoachHelm Analytics
 *
 * Displays key metrics: total insights, action rate, improvement rate,
 * prediction accuracy, and strokes saved estimate.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconTarget,
  IconTrendingUp,
  IconTrendingDown,
  IconCheck,
  IconChartBar,
} from '@/components/icons';
import type { CoachHelmOverviewData } from '@/app/golf/actions/coachhelm-analytics';

interface AnalyticsSummaryCardsProps {
  data: CoachHelmOverviewData;
  className?: string;
}

export function AnalyticsSummaryCards({ data, className }: AnalyticsSummaryCardsProps) {
  const cards = [
    {
      label: 'Total Insights',
      value: data.totalInsights,
      subtext: `${data.insightsThisWeek} this week`,
      change: data.insightsChange,
      icon: <IconSparkles size={20} className="text-purple-600" />,
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-100',
    },
    {
      label: 'Action Rate',
      value: `${(data.actionRate * 100).toFixed(0)}%`,
      subtext: 'Insights acted upon',
      icon: <IconCheck size={20} className="text-blue-600" />,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-100',
      isPercentage: true,
      percentValue: data.actionRate,
    },
    {
      label: 'Improvement Rate',
      value: `${(data.improvementRate * 100).toFixed(0)}%`,
      subtext: 'Led to improvement',
      icon: <IconTrendingUp size={20} className="text-primary-600" />,
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-100',
      isPercentage: true,
      percentValue: data.improvementRate,
    },
    {
      label: 'Prediction Accuracy',
      value: `${(data.predictionAccuracy * 100).toFixed(0)}%`,
      subtext: 'Model accuracy',
      icon: <IconTarget size={20} className="text-amber-600" />,
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-100',
      isPercentage: true,
      percentValue: data.predictionAccuracy,
    },
    {
      label: 'Strokes Saved',
      value: data.strokesSavedEstimate.toFixed(1),
      subtext: 'Estimated impact',
      icon: <IconChartBar size={20} className="text-primary-600" />,
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-100',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4', className)}>
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: index * 0.04 }}
          className="relative rounded-2xl border bg-white/70 backdrop-blur-xl border-white/20 shadow-glass p-5 overflow-hidden hover:shadow-card-hover transition-all duration-200"
        >
          {/* Per-card color tint preserves chromatic cue over the glass base */}
          <div className={cn('absolute inset-0 pointer-events-none opacity-40', card.bgColor)} />
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />

          <div className="relative">
            {/* Icon */}
            <div className="mb-3">{card.icon}</div>

            {/* Value */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-warm-900 tabular-nums">{card.value}</span>
              {card.change !== undefined && card.change !== 0 && (
                <span
                  className={cn(
                    'flex items-center text-xs font-medium',
                    card.change > 0 ? 'text-primary-600' : 'text-red-500'
                  )}
                >
                  {card.change > 0 ? (
                    <IconTrendingUp size={12} className="mr-0.5" />
                  ) : (
                    <IconTrendingDown size={12} className="mr-0.5" />
                  )}
                  {Math.abs(card.change).toFixed(0)}%
                </span>
              )}
            </div>

            {/* Label */}
            <p className="text-sm font-medium text-warm-700 mt-1">{card.label}</p>

            {/* Subtext */}
            <p className="text-xs text-warm-500 mt-0.5">{card.subtext}</p>

            {/* Progress bar for percentages */}
            {card.isPercentage && card.percentValue !== undefined && (
              <div className="mt-3">
                <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      card.percentValue >= 0.7
                        ? 'bg-primary-500'
                        : card.percentValue >= 0.4
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(card.percentValue * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + index * 0.04 }}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
