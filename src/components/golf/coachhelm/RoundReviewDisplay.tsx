'use client';

/**
 * RoundReviewDisplay - Complete AI-generated round analysis display
 *
 * Features:
 * - Summary section with sentiment indicator
 * - Expandable sections with Framer Motion
 * - Highlights, Areas for Improvement, Key Stats, Recommendations
 * - Share/Export functionality
 * - Mobile-friendly design
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconChevronDown,
  IconChevronUp,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconCheck,
  IconStar,
} from '@/components/icons';
import type {
  RoundReviewContent,
  ReviewSentiment,
  OverallGrade,
  StatComparison,
} from '@/app/golf/actions/round-review-system';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewDisplayProps {
  review: RoundReviewContent;
  courseName?: string;
  roundDate?: string;
  score?: number;
  scoreToPar?: number;
  onShare?: () => void;
  onExport?: () => void;
  isShared?: boolean;
  className?: string;
}

interface ExpandableSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

// ============================================================================
// SENTIMENT & GRADE HELPERS
// ============================================================================

const sentimentConfig: Record<
  ReviewSentiment,
  { bg: string; text: string; icon: string; label: string }
> = {
  positive: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: 'text-green-600',
    label: 'Great Round',
  },
  neutral: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: 'text-blue-600',
    label: 'Solid Round',
  },
  challenging: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    label: 'Room to Grow',
  },
};

const gradeConfig: Record<
  OverallGrade,
  { bg: string; text: string; border: string }
> = {
  A: { bg: 'bg-green-500', text: 'text-white', border: 'border-green-600' },
  B: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600' },
  C: { bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-600' },
  D: { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' },
  F: { bg: 'bg-red-500', text: 'text-white', border: 'border-red-600' },
};

const comparisonConfig: Record<
  StatComparison,
  { icon: React.ReactNode; color: string; label: string }
> = {
  above: {
    icon: <IconTrendingUp size={14} />,
    color: 'text-green-600',
    label: 'Above avg',
  },
  below: {
    icon: <IconTrendingDown size={14} />,
    color: 'text-amber-600',
    label: 'Below avg',
  },
  average: {
    icon: <IconTarget size={14} />,
    color: 'text-warm-500',
    label: 'On pace',
  },
};

// ============================================================================
// EXPANDABLE SECTION COMPONENT
// ============================================================================

function ExpandableSection({
  title,
  icon,
  defaultExpanded = true,
  children,
  badge,
}: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-white/20 rounded-xl overflow-hidden bg-white/50 backdrop-blur-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          'hover:bg-white/60 transition-colors',
          'text-left'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
            {icon}
          </div>
          <span className="font-semibold text-warm-900">{title}</span>
          {badge}
        </div>
        <div className="text-warm-400">
          {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundReviewDisplay({
  review,
  courseName,
  roundDate,
  score,
  scoreToPar,
  onShare,
  onExport,
  isShared = false,
  className,
}: RoundReviewDisplayProps) {
  const sentimentStyle = sentimentConfig[review.sentiment];
  const gradeStyle = gradeConfig[review.overallGrade];

  // Format score to par for display
  const formatScoreToPar = (stp: number | undefined) => {
    if (stp === undefined || stp === null) return '';
    if (stp === 0) return 'E';
    return stp > 0 ? `+${stp}` : `${stp}`;
  };

  // Format date
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with Summary */}
      <GlassCard className="overflow-hidden" glow="subtle">
        {/* Top bar with grade and sentiment */}
        <div className="flex items-center justify-between mb-4">
          {/* Grade Badge */}
          <div
            className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center',
              'font-bold text-2xl shadow-lg',
              gradeStyle.bg,
              gradeStyle.text
            )}
          >
            {review.overallGrade}
          </div>

          {/* Sentiment Badge */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
              sentimentStyle.bg,
              sentimentStyle.text
            )}
          >
            <IconSparkles size={14} className={sentimentStyle.icon} />
            {sentimentStyle.label}
          </div>
        </div>

        {/* Round Info */}
        {(courseName || roundDate || score !== undefined) && (
          <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/20">
            {score !== undefined && (
              <div className="text-center">
                <div className="text-3xl font-bold text-warm-900">{score}</div>
                {scoreToPar !== undefined && (
                  <div
                    className={cn(
                      'text-sm font-medium',
                      scoreToPar < 0
                        ? 'text-green-600'
                        : scoreToPar > 0
                          ? 'text-amber-600'
                          : 'text-warm-500'
                    )}
                  >
                    {formatScoreToPar(scoreToPar)}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1">
              {courseName && (
                <div className="font-semibold text-warm-900 text-lg">{courseName}</div>
              )}
              {roundDate && (
                <div className="text-sm text-warm-500">{formatDate(roundDate)}</div>
              )}
            </div>
          </div>
        )}

        {/* Summary Text */}
        <div className="prose prose-sm prose-slate max-w-none">
          <p className="text-warm-700 leading-relaxed m-0">{review.summary}</p>
        </div>

        {/* AI Badge */}
        <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-warm-500">
            <IconSparkles size={12} className="text-purple-500" />
            AI-Powered Analysis
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {onShare && !isShared && (
              <button
                onClick={onShare}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-white/60 hover:bg-white/80 text-warm-700',
                  'transition-colors border border-white/30'
                )}
              >
                Share with Coach
              </button>
            )}
            {isShared && (
              <span className="flex items-center gap-2 text-xs text-green-600 font-medium">
                <IconCheck size={14} />
                Shared with Coach
              </span>
            )}
            {onExport && (
              <button
                onClick={onExport}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-white/60 hover:bg-white/80 text-warm-700',
                  'transition-colors border border-white/30'
                )}
              >
                Export
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Highlights Section */}
      {review.highlights.length > 0 && (
        <ExpandableSection
          title="Highlights"
          icon={<IconStar size={16} />}
          badge={
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
              {review.highlights.length}
            </span>
          }
        >
          <div className="space-y-3">
            {review.highlights.map((highlight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex gap-3 p-3 rounded-lg bg-green-50/50 border border-green-100"
              >
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <IconCheck size={14} className="text-green-600" />
                </div>
                <div>
                  <div className="font-medium text-warm-900 text-sm">
                    {highlight.title}
                  </div>
                  <p className="text-sm text-warm-600 mt-0.5">
                    {highlight.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Areas for Improvement Section */}
      {review.areasForImprovement.length > 0 && (
        <ExpandableSection
          title="Areas for Improvement"
          icon={<IconTarget size={16} />}
          badge={
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
              {review.areasForImprovement.length}
            </span>
          }
        >
          <div className="space-y-3">
            {review.areasForImprovement.map((area, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-3 rounded-lg bg-amber-50/50 border border-amber-100"
              >
                <div className="font-medium text-warm-900 text-sm">{area.area}</div>
                <p className="text-sm text-warm-600 mt-1">{area.recommendation}</p>
              </motion.div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Key Stats Section */}
      {review.keyStats.length > 0 && (
        <ExpandableSection
          title="Key Stats"
          icon={<IconTrendingUp size={16} />}
          defaultExpanded={true}
        >
          <div className="grid grid-cols-2 gap-3">
            {review.keyStats.map((stat, index) => {
              const comparison = comparisonConfig[stat.comparison];
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.08 }}
                  className={cn(
                    'p-3 rounded-lg border',
                    'bg-white/60 border-white/30'
                  )}
                >
                  <div className="text-xs text-warm-500 font-medium mb-1">
                    {stat.label}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-warm-900">
                      {stat.value}
                    </span>
                    <div className={cn('flex items-center gap-1', comparison.color)}>
                      {comparison.icon}
                      <span className="text-xs font-medium">{comparison.label}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ExpandableSection>
      )}

      {/* Recommendations Section */}
      {review.recommendations.length > 0 && (
        <ExpandableSection
          title="Recommendations"
          icon={<IconSparkles size={16} />}
        >
          <div className="space-y-2">
            {review.recommendations.map((rec, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 py-2"
              >
                <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-primary-600">
                    {index + 1}
                  </span>
                </div>
                <p className="text-sm text-warm-700 flex-1">{rec}</p>
              </motion.div>
            ))}
          </div>
        </ExpandableSection>
      )}
    </div>
  );
}
