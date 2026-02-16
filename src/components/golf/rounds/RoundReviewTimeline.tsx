'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ReviewTimelineItem, ReviewStatus, PlayerReviewHistory } from '@/lib/types/golf';
import { getStatusBadgeColor, getStatusLabel, getScoreColor } from '@/lib/types/golf';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewTimelineProps {
  reviews: ReviewTimelineItem[];
  playerId?: string;
}

interface PlayerReviewTimelineProps {
  history: PlayerReviewHistory;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Status Badge
function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded',
      getStatusBadgeColor(status)
    )}>
      {getStatusLabel(status)}
    </span>
  );
}

// Timeline Item
function TimelineItem({
  review,
  isLast,
}: {
  review: ReviewTimelineItem;
  isLast: boolean;
}) {
  const date = review.round_date ? new Date(review.round_date) : new Date(review.created_at);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const scoreVsPar = review.score_to_par ?? 0;

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-3 h-3 rounded-full border-2',
          review.status === 'shared' ? 'bg-primary-500 border-primary-500' :
          review.status === 'approved' ? 'bg-primary-500 border-primary-500' :
          review.status === 'failed' ? 'bg-red-500 border-red-500' :
          'bg-white border-warm-300'
        )} />
        {!isLast && (
          <div className="w-0.5 flex-1 bg-warm-200 my-1" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
        <Link
          href={`/golf/rounds/${review.round_id}`}
          className="block bg-white border border-border-light rounded-xl p-4 hover:border-border hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-warm-900 truncate">
                  {review.course_name || 'Unknown Course'}
                </span>
                <StatusBadge status={review.status} />
              </div>
              <p className="text-xs text-warm-500">{formattedDate}</p>
            </div>
            <div className="text-right flex-shrink-0">
              {review.total_score != null && (
                <div className={cn(
                  'text-xl font-semibold',
                  review.score_to_par != null ? getScoreColor(review.total_score, review.total_score - review.score_to_par) : 'text-warm-900'
                )}>
                  {review.total_score}
                </div>
              )}
              <div className="text-xs text-warm-500">
                {scoreVsPar >= 0 ? '+' : ''}{scoreVsPar}
              </div>
            </div>
          </div>

          {/* Hover indicator */}
          <div className="mt-3 flex items-center gap-1 text-xs text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
            <span>View details</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>
    </div>
  );
}

// Stats Summary
function StatsSummary({
  totalRounds,
  reviewedRounds,
  averageScore,
  improvementTrend,
}: {
  totalRounds: number;
  reviewedRounds: number;
  averageScore: number;
  improvementTrend: 'improving' | 'stable' | 'declining' | null;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-cream-50 rounded-xl mb-6">
      <div>
        <p className="text-xs text-warm-500">Total Rounds</p>
        <p className="text-xl font-semibold text-warm-900">{totalRounds}</p>
      </div>
      <div>
        <p className="text-xs text-warm-500">Reviewed</p>
        <p className="text-xl font-semibold text-warm-900">
          {reviewedRounds}
          <span className="text-sm font-normal text-warm-500 ml-1">
            ({totalRounds > 0 ? Math.round((reviewedRounds / totalRounds) * 100) : 0}%)
          </span>
        </p>
      </div>
      <div>
        <p className="text-xs text-warm-500">Avg Score</p>
        <p className="text-xl font-semibold text-warm-900">{averageScore.toFixed(1)}</p>
      </div>
      <div>
        <p className="text-xs text-warm-500">Trend</p>
        <div className="flex items-center gap-2">
          {improvementTrend === 'improving' && (
            <>
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-primary-600 font-medium">Improving</span>
            </>
          )}
          {improvementTrend === 'declining' && (
            <>
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
              <span className="text-red-600 font-medium">Declining</span>
            </>
          )}
          {improvementTrend === 'stable' && (
            <>
              <svg className="w-5 h-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
              <span className="text-warm-600 font-medium">Stable</span>
            </>
          )}
          {!improvementTrend && (
            <span className="text-warm-400">Not enough data</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENTS
// ============================================================================

export function RoundReviewTimeline({
  reviews,
}: RoundReviewTimelineProps) {
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');

  const filteredReviews = filter === 'all'
    ? reviews
    : reviews.filter(r => r.status === filter);

  if (reviews.length === 0) {
    return (
      <div className="bg-white border border-border-light rounded-xl p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-cream-200 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-warm-900 mb-1">No Reviews Yet</h3>
          <p className="text-sm text-warm-500">
            Reviews will appear here once rounds are completed and reviewed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light rounded-xl">
      {/* Header with filters */}
      <div className="px-6 py-4 border-b border-border-light">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-warm-900">Review History</h3>
          <div className="flex gap-1 p-1 bg-cream-100 rounded-lg">
            {(['all', 'shared', 'approved', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  filter === status
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-600 hover:text-warm-900'
                )}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-6">
        {filteredReviews.length === 0 ? (
          <p className="text-sm text-warm-500 text-center py-4">
            No reviews match this filter.
          </p>
        ) : (
          filteredReviews.map((review, index) => (
            <TimelineItem
              key={review.id}
              review={review}
              isLast={index === filteredReviews.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function PlayerReviewTimeline({ history }: PlayerReviewTimelineProps) {
  const { reviews, player_name, total_reviews, average_score, recent_trend } = history;
  const playerName = player_name || 'Player';

  return (
    <div className="space-y-6">
      {/* Player Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium text-lg">
          {playerName.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-warm-900">{playerName}</h2>
          <p className="text-sm text-warm-500">
            {total_reviews} review{total_reviews !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <StatsSummary
        totalRounds={total_reviews}
        reviewedRounds={total_reviews}
        averageScore={average_score ?? 0}
        improvementTrend={recent_trend ?? null}
      />

      {/* Timeline */}
      <RoundReviewTimeline reviews={reviews} />
    </div>
  );
}

export default RoundReviewTimeline;
