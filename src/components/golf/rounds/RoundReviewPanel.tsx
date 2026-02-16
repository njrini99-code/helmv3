'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type {
  GolfRoundReview,
  GolfRound,
  ReviewStatus,
  CoachFeedbackInput,
} from '@/lib/types/golf';
import {
  getStatusBadgeColor,
  getStatusLabel,
  isReviewEditable,
  canShareReview,
  getScoreColor,
} from '@/lib/types/golf';
import {
  saveCoachFeedback,
  shareReviewWithPlayer,
  retryReviewGeneration,
  getReviewGenerationStatus,
} from '@/app/golf/actions/round-reviews';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewPanelProps {
  review: GolfRoundReview;
  round: GolfRound;
  isCoach: boolean;
  onUpdate?: (updatedReview: GolfRoundReview) => void;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Status Badge Component
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

// Star Rating Component
function StarRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange?: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(star)}
          aria-label={`Rate ${star} out of 5 stars`}
          aria-pressed={value !== null && star <= value}
          className={cn(
            'w-6 h-6 transition-colors',
            disabled ? 'cursor-default' : 'cursor-pointer hover:scale-110',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill={value && star <= value ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            className={cn(
              value && star <= value ? 'text-amber-400' : 'text-warm-300'
            )}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

// Loading Dots
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  };

  return (
    <span className="flex items-center gap-1">
      <span className={cn('rounded-full bg-current skeleton-shimmer', dotSizes[size])} style={{ animationDelay: '0ms' }} />
      <span className={cn('rounded-full bg-current skeleton-shimmer', dotSizes[size])} style={{ animationDelay: '150ms' }} />
      <span className={cn('rounded-full bg-current skeleton-shimmer', dotSizes[size])} style={{ animationDelay: '300ms' }} />
    </span>
  );
}

// Progress Bar
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div
      className="w-full bg-warm-200/60 rounded-full h-2"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${progress}% complete`}
    >
      <div
        className="bg-primary-600 h-2 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// Section Card
function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-glass-sm', className)}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <div className="px-6 py-4 border-b border-white/20">
        <h3 className="text-base font-semibold text-warm-900">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// Editable List
function EditableList({
  items,
  onChange,
  placeholder,
  disabled = false,
}: {
  items: string[];
  onChange?: (items: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim() && onChange) {
      onChange([...items, newItem.trim()]);
      setNewItem('');
    }
  };

  const removeItem = (index: number) => {
    if (onChange) {
      onChange(items.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-2 p-2 bg-primary-50 rounded-lg"
        >
          <span className="flex-1 text-sm text-warm-700">{item}</span>
          {!disabled && onChange && (
            <button
              type="button"
              onClick={() => removeItem(index)}
              aria-label={`Remove: ${item}`}
              className="p-1 text-warm-400 hover:text-red-500 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
      {!disabled && onChange && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 text-base md:text-sm bg-white border border-border rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
          />
          <button
            type="button"
            onClick={addItem}
            className="px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundReviewPanel({
  review: initialReview,
  round,
  isCoach,
  onUpdate,
}: RoundReviewPanelProps) {
  const [review, setReview] = useState(initialReview);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Form state for coach feedback
  const [coachNotes, setCoachNotes] = useState(review.coach_notes || '');
  const [coachRating, setCoachRating] = useState<number | null>(review.coach_rating ?? null);
  const [coachHighlights, setCoachHighlights] = useState<string[]>(review.coach_highlights || []);
  const [coachFocusAreas, setCoachFocusAreas] = useState<string[]>(review.coach_focus_areas || []);

  // Poll for generation status if generating
  useEffect(() => {
    if (review.status !== 'generating') return;

    const pollStatus = async () => {
      const result = await getReviewGenerationStatus(review.id);
      if (result.success) {
        setGenerationProgress(result.progress || 0);

        if (result.status && result.status !== 'generating') {
          // Refresh review data
          window.location.reload(); // Simple refresh; could use SWR/React Query for better UX
        }
      }
    };

    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [review.id, review.status]);

  // Reset form when review changes
  useEffect(() => {
    setCoachNotes(review.coach_notes || '');
    setCoachRating(review.coach_rating ?? null);
    setCoachHighlights(review.coach_highlights || []);
    setCoachFocusAreas(review.coach_focus_areas || []);
  }, [review]);

  // Handle save feedback
  const handleSave = useCallback(async (approve: boolean = false) => {
    setIsSaving(true);
    setError(null);

    const feedback: CoachFeedbackInput = {
      coach_notes: coachNotes,
      coach_rating: coachRating as 1 | 2 | 3 | 4 | 5 | undefined,
      coach_highlights: coachHighlights,
      coach_focus_areas: coachFocusAreas,
    };

    const result = await saveCoachFeedback(review.id, feedback, approve);

    if (result.success) {
      const updatedReview = {
        ...review,
        ...feedback,
        status: approve ? 'approved' as ReviewStatus : 'coach_review' as ReviewStatus,
        coach_approved: approve,
        coach_approved_at: approve ? new Date().toISOString() : review.coach_approved_at,
      };
      setReview(updatedReview);
      onUpdate?.(updatedReview);
      setIsEditing(false);
    } else {
      setError(result.error || 'Failed to save feedback');
    }

    setIsSaving(false);
  }, [review, coachNotes, coachRating, coachHighlights, coachFocusAreas, onUpdate]);

  // Handle share with player
  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setError(null);

    const result = await shareReviewWithPlayer(review.id);

    if (result.success) {
      const updatedReview = {
        ...review,
        status: 'shared' as ReviewStatus,
        shared_with_player: true,
        shared_at: new Date().toISOString(),
      };
      setReview(updatedReview);
      onUpdate?.(updatedReview);
    } else {
      setError(result.error || 'Failed to share review');
    }

    setIsSharing(false);
  }, [review, onUpdate]);

  // Handle retry generation
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setError(null);

    const result = await retryReviewGeneration(review.id);

    if (result.success && result.status === 'generating') {
      setReview({ ...review, status: 'generating' });
    } else if (!result.success) {
      setError(result.error || 'Failed to retry generation');
    }

    setIsRetrying(false);
  }, [review]);

  // Render generating state
  if (review.status === 'generating') {
    return (
      <div className="relative overflow-hidden bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl p-8 shadow-glass-sm">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div className="flex flex-col items-center text-center">
          <LoadingSpinner size="lg" />
          <h3 className="mt-4 text-lg font-semibold text-warm-900">
            Generating Review
          </h3>
          <p className="mt-2 text-sm text-warm-500">
            {review.status_message || 'Analyzing round data...'}
          </p>
          <div className="mt-4 w-full max-w-xs">
            <ProgressBar progress={generationProgress} />
            <p className="mt-1 text-xs text-warm-400">{generationProgress}% complete</p>
          </div>
        </div>
      </div>
    );
  }

  // Render failed state
  if (review.status === 'failed') {
    return (
      <div className="relative overflow-hidden bg-white/70 backdrop-blur-xl border border-red-200/50 rounded-2xl p-8 shadow-glass-sm">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-200/60 to-transparent" />
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-red-50/80 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-warm-900">
            Review Generation Failed
          </h3>
          <p className="mt-2 text-sm text-warm-500">
            {review.last_error || 'An error occurred while generating the review.'}
          </p>
          {isCoach && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isRetrying ? (
                <>
                  <LoadingSpinner size="sm" />
                  Retrying...
                </>
              ) : (
                'Retry Generation'
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render pending state
  if (review.status === 'pending') {
    return (
      <div className="relative overflow-hidden bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl p-8 shadow-glass-sm">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-warm-100/70 flex items-center justify-center">
            <svg className="w-6 h-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-warm-900">
            Review Pending
          </h3>
          <p className="mt-2 text-sm text-warm-500">
            This review is waiting to be generated.
          </p>
        </div>
      </div>
    );
  }

  // Main review display
  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-warm-900">Round Review</h2>
          {review.status && <StatusBadge status={review.status} />}
        </div>
        <div className="flex items-center gap-2">
          {isCoach && review.status && isReviewEditable(review.status) && (
            <>
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-sm font-medium text-warm-600 hover:bg-warm-100/70 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={isSaving}
                    className="px-3 py-1.5 text-sm font-medium text-warm-900 bg-white border border-border hover:bg-warm-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={isSaving}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Approve'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Edit Feedback
                </button>
              )}
            </>
          )}
          {isCoach && review.status && canShareReview(review.status) && (
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSharing ? 'Sharing...' : 'Share with Player'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {review.summary && (
        <SectionCard title="Summary">
          <p className="text-sm text-warm-600 leading-relaxed">{review.summary}</p>
        </SectionCard>
      )}

      {/* Key Stats */}
      {review.key_stats && (
        <SectionCard title="Key Statistics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-warm-500">Score</p>
              <p className={cn('text-2xl font-semibold', round.total_score && round.score_to_par !== null ? getScoreColor(round.total_score, round.total_score - (round.score_to_par ?? 0)) : 'text-warm-900')}>
                {round.total_score ?? '-'}
                {review.key_stats.score_vs_par !== null && (
                  <span className="text-sm font-normal text-warm-500 ml-1">
                    ({review.key_stats.score_vs_par >= 0 ? '+' : ''}{review.key_stats.score_vs_par})
                  </span>
                )}
              </p>
            </div>
            {review.key_stats.fairway_pct !== null && (
              <div>
                <p className="text-xs text-warm-500">Fairways</p>
                <p className="text-2xl font-semibold text-warm-900">
                  {review.key_stats.fairway_pct}%
                </p>
              </div>
            )}
            {review.key_stats.gir_pct !== null && (
              <div>
                <p className="text-xs text-warm-500">GIR</p>
                <p className="text-2xl font-semibold text-warm-900">
                  {review.key_stats.gir_pct}%
                </p>
              </div>
            )}
            {review.key_stats.putts_per_round !== null && (
              <div>
                <p className="text-xs text-warm-500">Putts</p>
                <p className="text-2xl font-semibold text-warm-900">
                  {review.key_stats.putts_per_round}
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* AI Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        {review.strengths && review.strengths.length > 0 && (
          <SectionCard title="Strengths">
            <ul className="space-y-2">
              {review.strengths.map((strength, index) => (
                <li key={index} className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-warm-600">{strength}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* Areas for Improvement */}
        {review.areas_for_improvement && review.areas_for_improvement.length > 0 && (
          <SectionCard title="Areas for Improvement">
            <ul className="space-y-2">
              {review.areas_for_improvement.map((area, index) => (
                <li key={index} className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-sm text-warm-600">{area}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {/* AI Recommendations */}
      {review.ai_recommendations && review.ai_recommendations.length > 0 && (
        <SectionCard title="Recommendations">
          <ul className="space-y-2">
            {review.ai_recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2">
                <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <span className="text-sm text-warm-600">{rec}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Coach Feedback Section */}
      {(isCoach || review.shared_with_player) && (
        <div className="border-t border-border-light pt-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">Coach Feedback</h3>

          {/* Coach Rating */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Overall Rating
            </label>
            <StarRating
              value={isEditing ? coachRating : (review.coach_rating ?? null)}
              onChange={isEditing ? setCoachRating : undefined}
              disabled={!isEditing}
            />
          </div>

          {/* Coach Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Notes
            </label>
            {isEditing ? (
              <textarea
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                rows={4}
                placeholder="Add your notes and observations..."
                className="w-full px-3 py-2.5 text-base md:text-sm bg-white border border-border rounded-lg placeholder:text-warm-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50 resize-none"
              />
            ) : (
              <p className="text-sm text-warm-600 whitespace-pre-wrap">
                {review.coach_notes || 'No notes added yet.'}
              </p>
            )}
          </div>

          {/* Coach Highlights */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Highlights
            </label>
            <EditableList
              items={isEditing ? coachHighlights : (review.coach_highlights ?? [])}
              onChange={isEditing ? setCoachHighlights : undefined}
              placeholder="Add a highlight..."
              disabled={!isEditing}
            />
          </div>

          {/* Focus Areas */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Focus Areas for Next Round
            </label>
            <EditableList
              items={isEditing ? coachFocusAreas : (review.coach_focus_areas ?? [])}
              onChange={isEditing ? setCoachFocusAreas : undefined}
              placeholder="Add a focus area..."
              disabled={!isEditing}
            />
          </div>
        </div>
      )}

      {/* Player Feedback Section (for shared reviews) */}
      {review.shared_with_player && review.player_feedback && (
        <SectionCard title="Player Response">
          <p className="text-sm text-warm-600 whitespace-pre-wrap">
            {review.player_feedback}
          </p>
        </SectionCard>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between pt-4 border-t border-border-light text-xs text-warm-400">
        <div className="flex items-center gap-4">
          {review.ai_model_used && (
            <span>Generated by {review.ai_model_used}</span>
          )}
          {review.ai_generation_duration_ms && (
            <span>in {(review.ai_generation_duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {review.coach_approved_at && (
            <span>Approved {new Date(review.coach_approved_at).toLocaleDateString()}</span>
          )}
          {review.shared_at && (
            <span>Shared {new Date(review.shared_at).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default RoundReviewPanel;
