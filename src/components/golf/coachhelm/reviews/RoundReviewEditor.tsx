'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconSparkles,
  IconCheck,
  IconStar,
  IconEye,
  IconSend,
  IconRefresh,
  IconTarget,
  IconEdit,
  IconNote,
} from '@/components/icons';
import { ReviewInsightCard } from './ReviewInsightCard';
import type {
  EnhancedRoundReview,
  ReviewInsight,
  InsightAccuracy,
} from '@/lib/coachhelm/review-types';
import {
  annotateInsight,
  annotateReview,
  publishReview,
  createFocusAreaFromReview,
  markReviewViewedByCoach,
} from '@/app/golf/actions/round-reviews';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewEditorProps {
  review: EnhancedRoundReview;
  coachId: string;
  playerName?: string;
  onPublished?: () => void;
  onRefresh?: () => void;
  className?: string;
}

// ============================================================================
// COACH RATING SELECTOR
// ============================================================================

interface RatingSelectProps {
  value: number | null;
  onChange: (rating: number) => void;
}

function RatingSelect({ value, onChange }: RatingSelectProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          onClick={() => onChange(rating)}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
            value !== null && rating <= value
              ? 'bg-amber-100 text-amber-600'
              : 'bg-warm-100 text-warm-400 hover:bg-warm-200'
          )}
        >
          <IconStar size={16} className={value !== null && rating <= value ? 'fill-current' : ''} />
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// REVIEW SUMMARY CARD
// ============================================================================

interface ReviewSummaryCardProps {
  review: EnhancedRoundReview;
  onUpdateSummary: (summary: string, takeaway: string, priority: string | null) => void;
}

function ReviewSummaryCard({ review, onUpdateSummary }: ReviewSummaryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState(review.summary);
  const [takeaway, setTakeaway] = useState(review.primaryTakeaway);
  const [priority, setPriority] = useState(review.nextPracticePriority || '');

  const handleSave = () => {
    onUpdateSummary(summary, takeaway, priority || null);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border border-warm-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-warm-900">Edit Summary</h3>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <IconCheck size={14} className="mr-1.5" />
              Save
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-warm-500 mb-1 block">Summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            rows={3}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-warm-500 mb-1 block">Primary Takeaway</label>
          <input
            type="text"
            value={takeaway}
            onChange={(e) => setTakeaway(e.target.value)}
            className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-warm-500 mb-1 block">Practice Priority</label>
          <input
            type="text"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="What should they focus on in practice?"
            className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-warm-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-warm-900">AI Summary</h3>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
        >
          <IconEdit size={14} />
        </button>
      </div>

      <p className="text-sm text-warm-600 mb-4">{review.summary}</p>

      {review.primaryTakeaway && (
        <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg mb-3">
          <p className="text-sm font-medium text-primary-900">
            Key Takeaway: {review.primaryTakeaway}
          </p>
        </div>
      )}

      {review.nextPracticePriority && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
          <p className="text-sm text-amber-900">
            <span className="font-medium">Practice Focus:</span> {review.nextPracticePriority}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// INSIGHTS SECTION
// ============================================================================

interface InsightsSectionProps {
  insights: ReviewInsight[];
  coachId: string;
  onInsightFeedback: (insightId: string, accuracy: InsightAccuracy, notes?: string) => Promise<void>;
  onToggleHighlight: (insightId: string, isHighlighted: boolean) => Promise<void>;
  onToggleHidden: (insightId: string, isHidden: boolean) => Promise<void>;
  onCreateFocusArea: (insight: ReviewInsight) => void;
}

function InsightsSection({
  insights,
   
  coachId: _coachId,
  onInsightFeedback,
  onToggleHighlight,
  onToggleHidden,
  onCreateFocusArea,
}: InsightsSectionProps) {
  const [filter, setFilter] = useState<'all' | 'highlights' | 'areas'>('all');

  const filteredInsights = insights.filter((insight) => {
    if (filter === 'all') return true;
    if (filter === 'highlights') return insight.insightType === 'highlight';
    if (filter === 'areas') return insight.insightType === 'area_to_review';
    return true;
  });

  const highlightCount = insights.filter((i) => i.insightType === 'highlight').length;
  const areaCount = insights.filter((i) => i.insightType === 'area_to_review').length;
  const feedbackCount = insights.filter((i) => i.coachAccuracy !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warm-900">
          Insights ({insights.length})
        </h3>

        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-500">
            {feedbackCount}/{insights.length} reviewed
          </span>

          <div className="flex items-center bg-warm-100 rounded-lg p-0.5">
            {[
              { key: 'all', label: 'All' },
              { key: 'highlights', label: `Highlights (${highlightCount})` },
              { key: 'areas', label: `Areas (${areaCount})` },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setFilter(option.key as typeof filter)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all',
                  filter === option.key
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-500 hover:text-warm-700'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredInsights.map((insight) => (
          <ReviewInsightCard
            key={insight.id}
            insight={insight}
            isCoach={true}
            onFeedback={onInsightFeedback}
            onToggleHighlight={onToggleHighlight}
            onToggleHidden={onToggleHidden}
            onCreateFocusArea={onCreateFocusArea}
          />
        ))}

        {filteredInsights.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-warm-500">No insights match this filter</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COACH NOTES SECTION
// ============================================================================

interface CoachNotesSectionProps {
  notes: string | null;
  rating: number | null;
  onUpdate: (notes: string, rating: number | null) => void;
}

function CoachNotesSection({ notes, rating, onUpdate }: CoachNotesSectionProps) {
  const [localNotes, setLocalNotes] = useState(notes || '');
  const [localRating, setLocalRating] = useState(rating);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHasChanges(localNotes !== (notes || '') || localRating !== rating);
  }, [localNotes, localRating, notes, rating]);

  const handleSave = () => {
    onUpdate(localNotes, localRating);
    setHasChanges(false);
  };

  return (
    <div className="bg-white rounded-xl border border-warm-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warm-900 flex items-center gap-2">
          <IconNote size={16} />
          Your Notes for Player
        </h3>
        {hasChanges && (
          <Button size="sm" onClick={handleSave}>
            Save Notes
          </Button>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-warm-500 mb-2 block">
          Overall Round Rating
        </label>
        <RatingSelect value={localRating} onChange={setLocalRating} />
      </div>

      <div>
        <label className="text-xs font-medium text-warm-500 mb-1 block">
          Notes for Player
        </label>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder="Add notes that will be visible to the player..."
          className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          rows={4}
        />
      </div>
    </div>
  );
}

// ============================================================================
// CREATE FOCUS AREA MODAL
// ============================================================================

interface CreateFocusAreaModalProps {
  insight: ReviewInsight;
  reviewId: string;
  coachId: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateFocusAreaModal({
  insight,
  reviewId,
   
  coachId: _coachId,
  onClose,
  onCreated,
}: CreateFocusAreaModalProps) {
  const [title, setTitle] = useState(insight.title);
  const [description, setDescription] = useState(insight.description);
  const [areaType, setAreaType] = useState('general');
  const [targetMetric, setTargetMetric] = useState(insight.metricName || '');
  const [targetValue, setTargetValue] = useState('');
  const [loading, setLoading] = useState(false);
  // Keep track of currentValue for potential future use
  void insight.metricValue;

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await createFocusAreaFromReview(reviewId, {
        name: title,
        description,
      });

      if (result.success) {
        onCreated();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-warm-100">
          <h2 className="text-lg font-semibold text-warm-900 flex items-center gap-2">
            <IconTarget size={20} />
            Create Focus Area
          </h2>
          <p className="text-sm text-warm-500 mt-1">
            Turn this insight into an actionable focus area for the player
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-warm-700 mb-1 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-warm-700 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              rows={3}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-warm-700 mb-1 block">Area Type</label>
            <select
              value={areaType}
              onChange={(e) => setAreaType(e.target.value)}
              className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="general">General</option>
              <option value="putting">Putting</option>
              <option value="driving">Driving</option>
              <option value="iron_play">Iron Play</option>
              <option value="short_game">Short Game</option>
              <option value="mental_game">Mental Game</option>
              <option value="course_management">Course Management</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-warm-700 mb-1 block">
                Target Metric (optional)
              </label>
              <input
                type="text"
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
                placeholder="e.g., GIR %"
                className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-warm-700 mb-1 block">
                Target Value
              </label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="e.g., 65"
                className="w-full px-3 py-2 text-base md:text-sm bg-warm-50 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                step="0.1"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-warm-100 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading || !title}>
            <IconTarget size={14} className="mr-1.5" />
            Create Focus Area
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundReviewEditor({
  review,
  coachId,
  playerName,
  onPublished,
  onRefresh,
  className,
}: RoundReviewEditorProps) {
  const [localReview, setLocalReview] = useState(review);
  const [publishing, setPublishing] = useState(false);
  const [focusAreaInsight, setFocusAreaInsight] = useState<ReviewInsight | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  // Mark as viewed by coach on mount
  useEffect(() => {
    if (!review.coachViewedAt) {
      markReviewViewedByCoach(review.id);
    }
  }, [review.id, review.coachViewedAt]);

  const handleInsightFeedback = useCallback(async (
    insightId: string,
    accuracy: InsightAccuracy,
    notes?: string
  ) => {
    await annotateInsight(insightId, JSON.stringify({ accuracy, notes }));

    // Update local state
    setLocalReview((prev) => ({
      ...prev,
      insights: prev.insights.map((i) =>
        i.id === insightId
          ? { ...i, coachAccuracy: accuracy, coachNotes: notes || null }
          : i
      ),
    }));
  }, []);

  const handleToggleHighlight = useCallback(async (insightId: string, isHighlighted: boolean) => {
    await annotateInsight(insightId, JSON.stringify({ isHighlighted }));

    setLocalReview((prev) => ({
      ...prev,
      insights: prev.insights.map((i) =>
        i.id === insightId ? { ...i, isHighlighted } : i
      ),
    }));
  }, []);

  const handleToggleHidden = useCallback(async (insightId: string, isHidden: boolean) => {
    await annotateInsight(insightId, JSON.stringify({ isHidden }));

    setLocalReview((prev) => ({
      ...prev,
      insights: prev.insights.map((i) =>
        i.id === insightId ? { ...i, isHidden } : i
      ),
    }));
  }, []);

  const handleUpdateNotes = useCallback(async (notes: string, rating: number | null) => {
    await annotateReview(localReview.id, JSON.stringify({ notes, rating }));

    setLocalReview((prev) => ({
      ...prev,
      coachNotes: notes,
      coachRating: rating,
    }));
  }, [localReview.id]);

  const handleUpdateSummary = useCallback(async (
    summary: string,
    takeaway: string,
    priority: string | null
  ) => {
    // Note: Would need a separate action for updating summary
    setLocalReview((prev) => ({
      ...prev,
      summary,
      primaryTakeaway: takeaway,
      nextPracticePriority: priority,
    }));
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const result = await publishReview(localReview.id);

      if (result.success) {
        setLocalReview((prev) => ({
          ...prev,
          status: 'published',
          publishedAt: new Date().toISOString(),
        }));
        setShowPublishConfirm(false);
        onPublished?.();
      }
    } finally {
      setPublishing(false);
    }
  }, [localReview.id, onPublished]);

  const isPublished = localReview.status === 'published';
  const highlightedCount = localReview.insights.filter((i) => i.isHighlighted).length;
  const hiddenCount = localReview.insights.filter((i) => i.isHidden).length;
  const reviewedCount = localReview.insights.filter((i) => i.coachAccuracy !== null).length;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-primary-500 to-emerald-600 rounded-xl shadow-lg shadow-primary-500/20">
              <IconSparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-warm-900">Round Review</h2>
              <p className="text-xs text-warm-500">
                {playerName && `For ${playerName} - `}
                {localReview.status === 'draft' ? 'Draft' : 'Published'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              <IconRefresh size={14} className="mr-1.5" />
              Refresh
            </Button>
          )}

          {!isPublished && (
            <Button
              onClick={() => setShowPublishConfirm(true)}
              className="bg-gradient-to-r from-primary-600 to-emerald-600"
            >
              <IconSend size={14} className="mr-1.5" />
              Publish to Player
            </Button>
          )}

          {isPublished && (
            <span className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-full flex items-center gap-1">
              <IconCheck size={12} />
              Published
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 p-3 bg-warm-50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-500">Insights:</span>
          <span className="text-sm font-semibold text-warm-900">{localReview.insights.length}</span>
        </div>
        <div className="w-px h-4 bg-warm-200" />
        <div className="flex items-center gap-2">
          <IconStar size={14} className="text-amber-500" />
          <span className="text-sm font-medium text-warm-700">{highlightedCount} highlighted</span>
        </div>
        <div className="w-px h-4 bg-warm-200" />
        <div className="flex items-center gap-2">
          <IconEye size={14} className="text-warm-400" />
          <span className="text-sm font-medium text-warm-700">{hiddenCount} hidden</span>
        </div>
        <div className="w-px h-4 bg-warm-200" />
        <div className="flex items-center gap-2">
          <IconCheck size={14} className="text-green-500" />
          <span className="text-sm font-medium text-warm-700">
            {reviewedCount}/{localReview.insights.length} reviewed
          </span>
        </div>
      </div>

      {/* AI Summary */}
      <ReviewSummaryCard
        review={localReview}
        onUpdateSummary={handleUpdateSummary}
      />

      {/* Insights */}
      <InsightsSection
        insights={localReview.insights}
        coachId={coachId}
        onInsightFeedback={handleInsightFeedback}
        onToggleHighlight={handleToggleHighlight}
        onToggleHidden={handleToggleHidden}
        onCreateFocusArea={(insight) => setFocusAreaInsight(insight)}
      />

      {/* Coach notes */}
      <CoachNotesSection
        notes={localReview.coachNotes}
        rating={localReview.coachRating}
        onUpdate={handleUpdateNotes}
      />

      {/* Create Focus Area Modal */}
      {focusAreaInsight && (
        <CreateFocusAreaModal
          insight={focusAreaInsight}
          reviewId={localReview.id}
          coachId={coachId}
          onClose={() => setFocusAreaInsight(null)}
          onCreated={() => {
            // Refresh the review to show updated insight
            onRefresh?.();
          }}
        />
      )}

      {/* Publish Confirmation */}
      {showPublishConfirm && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <h3 className="text-lg font-semibold text-warm-900 mb-2">Publish Review?</h3>
            <p className="text-sm text-warm-600 mb-4">
              This will make the review visible to {playerName || 'the player'}. They will be able
              to see all insights except those you&apos;ve marked as hidden.
            </p>

            <div className="space-y-2 mb-6">
              <p className="text-xs text-warm-500">Review includes:</p>
              <ul className="text-sm text-warm-700 space-y-1">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-green-500" />
                  {localReview.insights.length - hiddenCount} visible insights
                </li>
                <li className="flex items-center gap-2">
                  <IconStar size={14} className="text-amber-500" />
                  {highlightedCount} highlighted for attention
                </li>
                {localReview.coachNotes && (
                  <li className="flex items-center gap-2">
                    <IconNote size={14} className="text-blue-500" />
                    Your personal notes included
                  </li>
                )}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowPublishConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? (
                  <>
                    <IconRefresh size={14} className="mr-1.5 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <IconSend size={14} className="mr-1.5" />
                    Publish Now
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default RoundReviewEditor;
