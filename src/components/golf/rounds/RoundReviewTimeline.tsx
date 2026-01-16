'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ReviewTimelineItem, ReviewStatus, PlayerReviewHistory } from '@/types/golf';
import { getStatusBadgeColor, getStatusLabel, getScoreColor } from '@/types/golf';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewTimelineProps {
  reviews: ReviewTimelineItem[];
  playerId?: string;
  showPlayerLink?: boolean;
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

// Star Display (read-only)
function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return null;

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={cn(
            'w-3.5 h-3.5',
            star <= rating ? 'text-amber-400' : 'text-gray-200'
          )}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      ))}
    </div>
  );
}

// Timeline Item
function TimelineItem({
  review,
  isLast,
  showPlayerLink,
}: {
  review: ReviewTimelineItem;
  isLast: boolean;
  showPlayerLink?: boolean;
}) {
  const date = new Date(review.round_date);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const scoreVsPar = review.gross_score - review.par;

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-3 h-3 rounded-full border-2',
          review.review_status === 'shared' ? 'bg-brand-500 border-brand-500' :
          review.review_status === 'approved' ? 'bg-green-500 border-green-500' :
          review.review_status === 'failed' ? 'bg-red-500 border-red-500' :
          'bg-white border-gray-300'
        )} />
        {!isLast && (
          <div className="w-0.5 flex-1 bg-gray-200 my-1" />
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
                <span className="text-sm font-medium text-gray-900 truncate">
                  {review.course_name || 'Unknown Course'}
                </span>
                <StatusBadge status={review.review_status} />
              </div>
              <p className="text-xs text-gray-500">{formattedDate}</p>
              {review.coach_rating && (
                <div className="mt-2">
                  <StarDisplay rating={review.coach_rating} />
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className={cn(
                'text-xl font-semibold',
                getScoreColor(review.gross_score, review.par)
              )}>
                {review.gross_score}
              </div>
              <div className="text-xs text-gray-500">
                {scoreVsPar >= 0 ? '+' : ''}{scoreVsPar}
              </div>
            </div>
          </div>

          {/* Hover indicator */}
          <div className="mt-3 flex items-center gap-1 text-xs text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
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
  averageRating,
  improvementTrend,
}: {
  totalRounds: number;
  reviewedRounds: number;
  averageScore: number;
  averageRating: number | null;
  improvementTrend: 'improving' | 'stable' | 'declining' | null;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-cream-50 rounded-xl mb-6">
      <div>
        <p className="text-xs text-gray-500">Total Rounds</p>
        <p className="text-xl font-semibold text-gray-900">{totalRounds}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Reviewed</p>
        <p className="text-xl font-semibold text-gray-900">
          {reviewedRounds}
          <span className="text-sm font-normal text-gray-500 ml-1">
            ({totalRounds > 0 ? Math.round((reviewedRounds / totalRounds) * 100) : 0}%)
          </span>
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Avg Score</p>
        <p className="text-xl font-semibold text-gray-900">{averageScore.toFixed(1)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Trend</p>
        <div className="flex items-center gap-2">
          {improvementTrend === 'improving' && (
            <>
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-green-600 font-medium">Improving</span>
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
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
              <span className="text-gray-600 font-medium">Stable</span>
            </>
          )}
          {!improvementTrend && (
            <span className="text-gray-400">Not enough data</span>
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
  showPlayerLink = false,
}: RoundReviewTimelineProps) {
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');

  const filteredReviews = filter === 'all'
    ? reviews
    : reviews.filter(r => r.review_status === filter);

  if (reviews.length === 0) {
    return (
      <div className="bg-white border border-border-light rounded-xl p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-cream-200 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No Reviews Yet</h3>
          <p className="text-sm text-gray-500">
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
          <h3 className="text-base font-semibold text-gray-900">Review History</h3>
          <div className="flex gap-1 p-1 bg-cream-100 rounded-lg">
            {(['all', 'shared', 'approved', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  filter === status
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
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
          <p className="text-sm text-gray-500 text-center py-4">
            No reviews match this filter.
          </p>
        ) : (
          filteredReviews.map((review, index) => (
            <TimelineItem
              key={review.id}
              review={review}
              isLast={index === filteredReviews.length - 1}
              showPlayerLink={showPlayerLink}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function PlayerReviewTimeline({ history }: PlayerReviewTimelineProps) {
  const { player, reviews, stats } = history;
  const playerName = player.profile
    ? `${player.profile.first_name} ${player.profile.last_name}`
    : 'Player';

  return (
    <div className="space-y-6">
      {/* Player Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-medium text-lg">
          {playerName.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{playerName}</h2>
          <p className="text-sm text-gray-500">
            {player.handicap !== null ? `Handicap: ${player.handicap}` : 'No handicap set'}
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <StatsSummary
        totalRounds={stats.total_rounds}
        reviewedRounds={stats.reviewed_rounds}
        averageScore={stats.average_score}
        averageRating={stats.average_rating}
        improvementTrend={stats.improvement_trend}
      />

      {/* Timeline */}
      <RoundReviewTimeline reviews={reviews} />
    </div>
  );
}

export default RoundReviewTimeline;
