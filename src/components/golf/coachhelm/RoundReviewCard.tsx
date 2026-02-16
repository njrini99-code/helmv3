'use client';

/**
 * RoundReviewCard - Compact card for round review preview
 *
 * Used in lists and player dashboards
 * Shows: course, date, score, sentiment indicator, key takeaway
 * Clicks navigate to full review
 */

import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  IconCalendar,
  IconChevronRight,
  IconSparkles,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
} from '@/components/icons';
import type { ReviewSentiment, OverallGrade } from '@/app/golf/actions/round-review-system';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewCardProps {
  roundId: string;
  courseName: string;
  date: string;
  score: number;
  scoreToPar: number;
  sentiment: ReviewSentiment;
  grade: OverallGrade;
  keyTakeaway: string;
  hasReview?: boolean;
  index?: number;
  className?: string;
}

interface RoundReviewCardListProps {
  rounds: Array<{
    id: string;
    courseName: string;
    date: string;
    score: number;
    scoreToPar: number;
    sentiment: ReviewSentiment;
    grade: OverallGrade;
    keyTakeaway: string;
    hasReview?: boolean;
  }>;
  emptyMessage?: string;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const sentimentConfig: Record<
  ReviewSentiment,
  { bg: string; ring: string; icon: React.ReactNode }
> = {
  positive: {
    bg: 'bg-primary-50',
    ring: 'ring-primary-200',
    icon: <IconTrendingUp size={12} className="text-primary-600" />,
  },
  neutral: {
    bg: 'bg-blue-50',
    ring: 'ring-blue-200',
    icon: <IconTarget size={12} className="text-blue-600" />,
  },
  challenging: {
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    icon: <IconTrendingDown size={12} className="text-amber-600" />,
  },
};

const gradeColors: Record<OverallGrade, string> = {
  A: 'bg-primary-500 text-white',
  B: 'bg-blue-500 text-white',
  C: 'bg-amber-500 text-white',
  D: 'bg-orange-500 text-white',
  F: 'bg-red-500 text-white',
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatScoreToPar(score: number): string {
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundReviewCard({
  roundId,
  courseName,
  date,
  score,
  scoreToPar,
  sentiment,
  grade,
  keyTakeaway,
  hasReview = true,
  index = 0,
  className,
}: RoundReviewCardProps) {
  const sentimentStyle = sentimentConfig[sentiment];
  const isUnderPar = scoreToPar < 0;
  const isOverPar = scoreToPar > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className={className}
    >
      <Link
        href={`/golf/dashboard/rounds/${roundId}/review`}
        className={cn(
          'flex items-center gap-4 p-4 rounded-xl transition-all duration-200',
          'bg-white/70 backdrop-blur-sm border border-white/30',
          'hover:bg-white/90 hover:shadow-md hover:-translate-y-0.5',
          'group'
        )}
      >
        {/* Score badge with grade indicator */}
        <div className="relative">
          <div
            className={cn(
              'w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
              isUnderPar
                ? 'bg-primary-50 border border-primary-100'
                : isOverPar
                  ? 'bg-amber-50 border border-amber-100'
                  : 'bg-warm-50 border border-warm-100'
            )}
          >
            <span
              className={cn(
                'text-xl font-bold',
                isUnderPar
                  ? 'text-primary-600'
                  : isOverPar
                    ? 'text-amber-600'
                    : 'text-warm-600'
              )}
            >
              {score}
            </span>
            <span
              className={cn(
                'text-xs font-medium',
                isUnderPar
                  ? 'text-primary-500'
                  : isOverPar
                    ? 'text-amber-500'
                    : 'text-warm-400'
              )}
            >
              {formatScoreToPar(scoreToPar)}
            </span>
          </div>

          {/* Grade badge - positioned at corner */}
          <div
            className={cn(
              'absolute -top-1 -right-1 w-5 h-5 rounded-md flex items-center justify-center',
              'text-xs font-bold shadow-sm',
              gradeColors[grade]
            )}
          >
            {grade}
          </div>
        </div>

        {/* Round info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-warm-900 text-sm truncate group-hover:text-primary-600 transition-colors">
              {courseName}
            </h4>
            {/* Sentiment indicator */}
            <div
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center ring-1',
                sentimentStyle.bg,
                sentimentStyle.ring
              )}
            >
              {sentimentStyle.icon}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-warm-500">
              <IconCalendar size={12} className="text-warm-400" />
              {formatDate(date)}
            </span>
            {hasReview && (
              <span className="flex items-center gap-1 text-xs font-medium text-primary-600">
                <IconSparkles size={12} />
                AI Review
              </span>
            )}
          </div>

          {/* Key takeaway */}
          {keyTakeaway && (
            <p className="text-xs text-warm-500 mt-1.5 line-clamp-1">{keyTakeaway}</p>
          )}
        </div>

        {/* Action hint */}
        <div className="flex items-center gap-1 text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          View
          <IconChevronRight size={14} />
        </div>
      </Link>
    </motion.div>
  );
}

// ============================================================================
// LIST COMPONENT
// ============================================================================

export function RoundReviewCardList({
  rounds,
  emptyMessage = 'No rounds to review yet',
  className,
}: RoundReviewCardListProps) {
  if (rounds.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
          <IconSparkles size={24} className="text-warm-400" />
        </div>
        <p className="text-sm text-warm-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {rounds.map((round, index) => (
        <RoundReviewCard
          key={round.id}
          roundId={round.id}
          courseName={round.courseName}
          date={round.date}
          score={round.score}
          scoreToPar={round.scoreToPar}
          sentiment={round.sentiment}
          grade={round.grade}
          keyTakeaway={round.keyTakeaway}
          hasReview={round.hasReview}
          index={index}
        />
      ))}
    </div>
  );
}

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

export function RoundReviewCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 rounded-xl bg-white/70 backdrop-blur-sm border border-white/30 animate-pulse"
        >
          {/* Score skeleton */}
          <div className="w-14 h-14 rounded-xl bg-warm-200" />

          {/* Info skeleton */}
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-warm-200 rounded w-32" />
            <div className="h-3 bg-warm-200 rounded w-20" />
            <div className="h-3 bg-warm-200 rounded w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// COMPACT VARIANT
// ============================================================================

interface CompactRoundReviewCardProps {
  roundId: string;
  courseName: string;
  score: number;
  scoreToPar: number;
  sentiment: ReviewSentiment;
  grade: OverallGrade;
  className?: string;
}

export function CompactRoundReviewCard({
  roundId,
  courseName,
  score,
  scoreToPar,
  sentiment,
  grade,
  className,
}: CompactRoundReviewCardProps) {
  const sentimentStyle = sentimentConfig[sentiment];
  const isUnderPar = scoreToPar < 0;
  const isOverPar = scoreToPar > 0;

  return (
    <Link
      href={`/golf/dashboard/rounds/${roundId}/review`}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg transition-all duration-200',
        'bg-white/60 hover:bg-white/80 border border-white/20',
        'hover:shadow-sm group',
        className
      )}
    >
      {/* Score */}
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex flex-col items-center justify-center',
          isUnderPar
            ? 'bg-primary-50 text-primary-600'
            : isOverPar
              ? 'bg-amber-50 text-amber-600'
              : 'bg-warm-50 text-warm-600'
        )}
      >
        <span className="text-sm font-bold">{score}</span>
        <span className="text-[8px] font-medium">{formatScoreToPar(scoreToPar)}</span>
      </div>

      {/* Course name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-warm-900 truncate block group-hover:text-primary-600 transition-colors">
          {courseName}
        </span>
      </div>

      {/* Sentiment & grade */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-4 h-4 rounded-full flex items-center justify-center',
            sentimentStyle.bg
          )}
        >
          {sentimentStyle.icon}
        </div>
        <span
          className={cn('text-xs font-bold rounded px-1.5 py-0.5', gradeColors[grade])}
        >
          {grade}
        </span>
      </div>
    </Link>
  );
}
