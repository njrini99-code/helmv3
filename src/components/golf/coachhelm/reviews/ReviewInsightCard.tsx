'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconCheck,
  IconX,
  IconMinus,
  IconStar,
  IconEye,
  IconTarget,
  IconChevronDown,
  IconSparkles,
} from '@/components/icons';
import type {
  ReviewInsight,
  InsightAccuracy,
  InsightType,
} from '@/lib/coachhelm/review-types';
import {
  INSIGHT_TYPE_CONFIG,
  SEVERITY_CONFIG,
  ACCURACY_CONFIG,
} from '@/lib/coachhelm/review-types';

// ============================================================================
// TYPES
// ============================================================================

interface ReviewInsightCardProps {
  insight: ReviewInsight;
  isCoach?: boolean;
  onFeedback?: (insightId: string, accuracy: InsightAccuracy, notes?: string) => Promise<void>;
  onToggleHighlight?: (insightId: string, isHighlighted: boolean) => Promise<void>;
  onToggleHidden?: (insightId: string, isHidden: boolean) => Promise<void>;
  onCreateFocusArea?: (insight: ReviewInsight) => void;
  className?: string;
}

// ============================================================================
// INSIGHT ICON COMPONENT
// ============================================================================

function InsightIcon({ type }: { type: InsightType }) {
  const config = INSIGHT_TYPE_CONFIG[type];

  return (
    <div className={cn(
      'w-9 h-9 rounded-xl flex items-center justify-center text-lg',
      config.bgColor
    )}>
      {config.icon}
    </div>
  );
}

// ============================================================================
// ACCURACY FEEDBACK BUTTONS
// ============================================================================

interface AccuracyButtonsProps {
  currentAccuracy: InsightAccuracy | null;
  onSelect: (accuracy: InsightAccuracy) => void;
  disabled?: boolean;
}

function AccuracyButtons({ currentAccuracy, onSelect, disabled }: AccuracyButtonsProps) {
  const options: { value: InsightAccuracy; icon: React.ReactNode; label: string }[] = [
    { value: 'accurate', icon: <IconCheck size={14} />, label: 'Accurate' },
    { value: 'partially_accurate', icon: <IconMinus size={14} />, label: 'Partial' },
    { value: 'inaccurate', icon: <IconX size={14} />, label: 'Inaccurate' },
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map((option) => {
        const config = ACCURACY_CONFIG[option.value];
        const isSelected = currentAccuracy === option.value;

        return (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
              isSelected
                ? `${config.bgColor} ${config.color}`
                : 'bg-warm-100 text-warm-500 hover:bg-warm-200',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            title={option.label}
          >
            {option.icon}
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// METRIC DISPLAY
// ============================================================================

interface MetricDisplayProps {
  name: string;
  value: number | null;
  baseline: number | null;
  comparison: string | null;
}

function MetricDisplay({ name, value, baseline, comparison }: MetricDisplayProps) {
  if (value === null) return null;

  const diff = baseline !== null ? value - baseline : null;
  const isPositive = diff !== null && diff < 0; // For golf, lower is better
  const isNegative = diff !== null && diff > 0;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-warm-50 rounded-lg">
      <div className="flex-1">
        <p className="text-xs text-warm-500">{name}</p>
        <p className="text-sm font-semibold text-warm-900">
          {typeof value === 'number' ? value.toFixed(1) : value}
        </p>
      </div>
      {baseline !== null && (
        <div className="text-right">
          <p className="text-xs text-warm-500">
            vs {comparison === 'vs_average' ? 'avg' : comparison === 'vs_team' ? 'team' : 'prev'}
          </p>
          <p className={cn(
            'text-sm font-medium',
            isPositive && 'text-green-600',
            isNegative && 'text-red-600',
            !isPositive && !isNegative && 'text-warm-600'
          )}>
            {diff !== null && diff > 0 && '+'}
            {diff !== null ? diff.toFixed(1) : '-'}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HOLE BADGES
// ============================================================================

function HoleBadges({ holes }: { holes: number[] }) {
  if (!holes || holes.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-warm-500 mr-1">Holes:</span>
      {holes.map((hole) => (
        <span
          key={hole}
          className="px-2 py-0.5 text-xs font-medium bg-warm-100 text-warm-700 rounded"
        >
          #{hole}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ReviewInsightCard({
  insight,
  isCoach = false,
  onFeedback,
  onToggleHighlight,
  onToggleHidden,
  onCreateFocusArea,
  className,
}: ReviewInsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [localNotes, setLocalNotes] = useState(insight.coachNotes || '');

  const typeConfig = INSIGHT_TYPE_CONFIG[insight.insightType];
  const severityConfig = SEVERITY_CONFIG[insight.severity];

  const handleFeedback = useCallback(async (accuracy: InsightAccuracy) => {
    if (!onFeedback) return;
    setFeedbackLoading(true);
    try {
      await onFeedback(insight.id, accuracy, localNotes || undefined);
    } finally {
      setFeedbackLoading(false);
    }
  }, [insight.id, localNotes, onFeedback]);

  const handleToggleHighlight = useCallback(async () => {
    if (!onToggleHighlight) return;
    await onToggleHighlight(insight.id, !insight.isHighlighted);
  }, [insight.id, insight.isHighlighted, onToggleHighlight]);

  const handleToggleHidden = useCallback(async () => {
    if (!onToggleHidden) return;
    await onToggleHidden(insight.id, !insight.isHidden);
  }, [insight.id, insight.isHidden, onToggleHidden]);

  // Don't show hidden insights to players
  if (!isCoach && insight.isHidden) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative bg-white rounded-xl border transition-all duration-200',
        insight.isHighlighted && 'border-primary-300 ring-1 ring-primary-100',
        !insight.isHighlighted && 'border-warm-200',
        insight.isHidden && 'opacity-60',
        className
      )}
    >
      {/* Highlighted indicator */}
      {insight.isHighlighted && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center shadow-md">
          <IconStar size={14} className="text-white" />
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <InsightIcon type={insight.insightType} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-medium', typeConfig.color)}>
                {typeConfig.label}
              </span>
              <span className={cn(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                severityConfig.bgColor,
                severityConfig.color
              )}>
                {severityConfig.label}
              </span>
              {insight.confidence < 0.6 && (
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                  Low confidence
                </span>
              )}
            </div>

            <h4 className="text-sm font-semibold text-warm-900 mt-1">
              {insight.title}
            </h4>

            <p className="text-sm text-warm-600 mt-1 line-clamp-2">
              {insight.description}
            </p>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
          >
            <IconChevronDown
              size={16}
              className={cn('transition-transform', isExpanded && 'rotate-180')}
            />
          </button>
        </div>

        {/* Expandable content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-3 border-t border-warm-100 mt-4">
                {/* Metric display */}
                {insight.metricName && (
                  <MetricDisplay
                    name={insight.metricName}
                    value={insight.metricValue}
                    baseline={insight.metricBaseline}
                    comparison={insight.metricComparison}
                  />
                )}

                {/* Hole badges */}
                <HoleBadges holes={insight.holeNumbers} />

                {/* Evidence */}
                {insight.evidence && insight.evidence.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-warm-500">Evidence:</p>
                    <ul className="text-xs text-warm-600 space-y-1">
                      {insight.evidence.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-warm-400 mt-0.5">-</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Coach feedback section */}
                {isCoach && (
                  <div className="pt-3 border-t border-warm-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-warm-700">Rate Accuracy:</p>
                      <AccuracyButtons
                        currentAccuracy={insight.coachAccuracy}
                        onSelect={handleFeedback}
                        disabled={feedbackLoading}
                      />
                    </div>

                    {/* Coach notes */}
                    <div>
                      <textarea
                        value={localNotes}
                        onChange={(e) => setLocalNotes(e.target.value)}
                        placeholder="Add notes for this insight..."
                        className="w-full px-3 py-2 text-sm bg-warm-50 border border-warm-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        rows={2}
                      />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleToggleHighlight}
                        className={cn(
                          insight.isHighlighted && 'bg-primary-50 text-primary-700 border-primary-200'
                        )}
                      >
                        <IconStar size={14} className="mr-1.5" />
                        {insight.isHighlighted ? 'Highlighted' : 'Highlight'}
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleToggleHidden}
                        className={cn(
                          insight.isHidden && 'bg-warm-100 text-warm-700'
                        )}
                      >
                        <IconEye size={14} className="mr-1.5" />
                        {insight.isHidden ? 'Hidden' : 'Hide from Player'}
                      </Button>

                      {onCreateFocusArea && !insight.createdFocusAreaId && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCreateFocusArea(insight)}
                          className="ml-auto"
                        >
                          <IconTarget size={14} className="mr-1.5" />
                          Create Focus Area
                        </Button>
                      )}

                      {insight.createdFocusAreaId && (
                        <span className="ml-auto text-xs text-primary-600 flex items-center gap-1">
                          <IconSparkles size={12} />
                          Focus area created
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Player view of coach feedback */}
                {!isCoach && insight.coachAccuracy && (
                  <div className="pt-3 border-t border-warm-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-warm-500">Coach verification:</span>
                      <span className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded-full',
                        ACCURACY_CONFIG[insight.coachAccuracy].bgColor,
                        ACCURACY_CONFIG[insight.coachAccuracy].color
                      )}>
                        {ACCURACY_CONFIG[insight.coachAccuracy].label}
                      </span>
                    </div>
                    {insight.coachNotes && (
                      <p className="text-xs text-warm-600 mt-2 italic">
                        &quot;{insight.coachNotes}&quot;
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default ReviewInsightCard;
