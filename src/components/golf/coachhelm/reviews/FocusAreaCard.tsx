'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconTarget,
  IconCheck,
  IconChevronRight,
  IconTrendingUp,
  IconCalendar,
  IconEdit,
  IconTrash,
  IconSparkles,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

export interface FocusArea {
  id: string;
  playerId: string;
  coachId: string | null;
  focusArea: string; // title
  notes: string | null; // description
  priority: number;
  status: 'active' | 'completed' | 'archived';
  targetDate: string | null;
  completedAt: string | null;
  fromReviewId: string | null;
  fromInsightId: string | null;
  reviewContext: string | null;
  targetMetric: string | null;
  currentValue: number | null;
  targetValue: number | null;
  progressNotes: ProgressNote[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgressNote {
  id: string;
  date: string;
  note: string;
  value?: number;
}

interface FocusAreaCardProps {
  focusArea: FocusArea;
  isCoach?: boolean;
  onMarkComplete?: (id: string) => Promise<void>;
  onUpdateProgress?: (id: string, value: number, note?: string) => Promise<void>;
  onEdit?: (focusArea: FocusArea) => void;
  onDelete?: (id: string) => Promise<void>;
  compact?: boolean;
  className?: string;
}

// ============================================================================
// FOCUS AREA TYPE CONFIG
// ============================================================================

const AREA_TYPE_CONFIG: Record<string, { icon: string; color: string; bgColor: string }> = {
  putting: { icon: '🎯', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  driving: { icon: '🏌️', color: 'text-green-600', bgColor: 'bg-green-50' },
  iron_play: { icon: '⛳', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  short_game: { icon: '🕳️', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  mental_game: { icon: '🧠', color: 'text-pink-600', bgColor: 'bg-pink-50' },
  course_management: { icon: '🗺️', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  consistency: { icon: '📊', color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  strength: { icon: '💪', color: 'text-green-600', bgColor: 'bg-green-50' },
  weakness: { icon: '🔧', color: 'text-red-600', bgColor: 'bg-red-50' },
  default: { icon: '📋', color: 'text-warm-600', bgColor: 'bg-warm-100' },
};

function getAreaConfig(area: string) {
  const normalized = area.toLowerCase().replace(/\s+/g, '_');
  return AREA_TYPE_CONFIG[normalized] || AREA_TYPE_CONFIG.default;
}

// ============================================================================
// PROGRESS BAR
// ============================================================================

interface ProgressBarProps {
  current: number | null;
  target: number | null;
  label?: string;
}

function ProgressBar({ current, target, label }: ProgressBarProps) {
  if (current === null || target === null || target === 0) return null;

  const percentage = Math.min(100, Math.max(0, (current / target) * 100));
  const isComplete = percentage >= 100;

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-warm-500">{label}</span>
          <span className="text-xs font-medium text-warm-700">
            {current.toFixed(1)} / {target.toFixed(1)}
          </span>
        </div>
      )}
      <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn(
            'h-full rounded-full',
            isComplete ? 'bg-green-500' : 'bg-primary-500'
          )}
        />
      </div>
      <p className="text-xs text-warm-400 text-right">{percentage.toFixed(0)}% complete</p>
    </div>
  );
}

// ============================================================================
// PRIORITY BADGE
// ============================================================================

function PriorityBadge({ priority }: { priority: number }) {
  const config = {
    1: { label: 'High Priority', color: 'text-red-600', bgColor: 'bg-red-50' },
    2: { label: 'Medium Priority', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    3: { label: 'Low Priority', color: 'text-warm-600', bgColor: 'bg-warm-100' },
  }[Math.min(3, Math.max(1, priority))] || { label: 'Priority', color: 'text-warm-600', bgColor: 'bg-warm-100' };

  return (
    <span className={cn(
      'px-2 py-0.5 text-xs font-medium rounded-full',
      config.bgColor,
      config.color
    )}>
      {config.label}
    </span>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status }: { status: FocusArea['status'] }) {
  const config = {
    active: { label: 'Active', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    completed: { label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-50' },
    archived: { label: 'Archived', color: 'text-warm-500', bgColor: 'bg-warm-100' },
  }[status];

  return (
    <span className={cn(
      'px-2 py-0.5 text-xs font-medium rounded-full',
      config.bgColor,
      config.color
    )}>
      {config.label}
    </span>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FocusAreaCard({
  focusArea,
  isCoach = false,
  onMarkComplete,
  onUpdateProgress,
  onEdit,
  onDelete,
  compact = false,
  className,
}: FocusAreaCardProps) {
  const [loading, setLoading] = useState(false);
  const [showProgressInput, setShowProgressInput] = useState(false);
  const [progressValue, setProgressValue] = useState<string>('');
  const [progressNote, setProgressNote] = useState('');

  const areaConfig = getAreaConfig(focusArea.focusArea);
  const isCompleted = focusArea.status === 'completed';
  const hasMetricTarget = focusArea.targetValue !== null;

  const handleMarkComplete = useCallback(async () => {
    if (!onMarkComplete) return;
    setLoading(true);
    try {
      await onMarkComplete(focusArea.id);
    } finally {
      setLoading(false);
    }
  }, [focusArea.id, onMarkComplete]);

  const handleUpdateProgress = useCallback(async () => {
    if (!onUpdateProgress || !progressValue) return;
    setLoading(true);
    try {
      await onUpdateProgress(focusArea.id, parseFloat(progressValue), progressNote || undefined);
      setShowProgressInput(false);
      setProgressValue('');
      setProgressNote('');
    } finally {
      setLoading(false);
    }
  }, [focusArea.id, progressValue, progressNote, onUpdateProgress]);

  // Compact view for lists
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 bg-white rounded-lg border border-warm-200 hover:border-warm-300 transition-colors',
          isCompleted && 'opacity-60',
          className
        )}
      >
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-base',
          areaConfig.bgColor
        )}>
          {areaConfig.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-medium text-warm-900 truncate',
            isCompleted && 'line-through'
          )}>
            {focusArea.focusArea}
          </p>
          {focusArea.targetDate && (
            <p className="text-xs text-warm-500 flex items-center gap-1">
              <IconCalendar size={10} />
              Due {new Date(focusArea.targetDate).toLocaleDateString()}
            </p>
          )}
        </div>

        <StatusBadge status={focusArea.status} />

        <IconChevronRight size={16} className="text-warm-400" />
      </div>
    );
  }

  // Full card view
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white rounded-xl border border-warm-200 overflow-hidden transition-all duration-200',
        isCompleted && 'border-green-200',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-warm-100">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center text-lg',
            areaConfig.bgColor
          )}>
            {areaConfig.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={focusArea.status} />
              <PriorityBadge priority={focusArea.priority} />
              {focusArea.fromReviewId && (
                <span className="text-xs text-primary-600 flex items-center gap-1">
                  <IconSparkles size={10} />
                  From review
                </span>
              )}
            </div>

            <h3 className={cn(
              'text-base font-semibold text-warm-900',
              isCompleted && 'line-through text-warm-500'
            )}>
              {focusArea.focusArea}
            </h3>

            {focusArea.notes && (
              <p className="text-sm text-warm-600 mt-1 line-clamp-2">
                {focusArea.notes}
              </p>
            )}
          </div>

          {/* Coach actions */}
          {isCoach && !isCompleted && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(focusArea)}
                  className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
                  title="Edit"
                >
                  <IconEdit size={16} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(focusArea.id)}
                  className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress section */}
      {hasMetricTarget && (
        <div className="p-4 border-b border-warm-100">
          <ProgressBar
            current={focusArea.currentValue}
            target={focusArea.targetValue}
            label={focusArea.targetMetric || 'Progress'}
          />
        </div>
      )}

      {/* Review context */}
      {focusArea.reviewContext && (
        <div className="px-4 py-3 bg-warm-50 border-b border-warm-100">
          <p className="text-xs text-warm-500 mb-1">Context from review:</p>
          <p className="text-sm text-warm-600 italic">&quot;{focusArea.reviewContext}&quot;</p>
        </div>
      )}

      {/* Progress notes */}
      {focusArea.progressNotes && focusArea.progressNotes.length > 0 && (
        <div className="p-4 border-b border-warm-100 space-y-2">
          <p className="text-xs font-medium text-warm-500">Progress Notes:</p>
          {focusArea.progressNotes.slice(-3).map((note) => (
            <div key={note.id} className="flex items-start gap-2 text-xs">
              <span className="text-warm-400">
                {new Date(note.date).toLocaleDateString()}
              </span>
              <span className="text-warm-600">{note.note}</span>
              {note.value !== undefined && (
                <span className="text-primary-600 font-medium">({note.value})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Progress input */}
      {showProgressInput && (
        <div className="p-4 border-b border-warm-100 bg-warm-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-warm-500 mb-1 block">New Value</label>
              <input
                type="number"
                value={progressValue}
                onChange={(e) => setProgressValue(e.target.value)}
                placeholder="Enter value"
                className="w-full px-3 py-2 text-sm bg-white border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                step="0.1"
              />
            </div>
            <div>
              <label className="text-xs text-warm-500 mb-1 block">Note (optional)</label>
              <input
                type="text"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                placeholder="Add a note"
                className="w-full px-3 py-2 text-sm bg-white border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleUpdateProgress}
              disabled={loading || !progressValue}
            >
              <IconCheck size={14} className="mr-1.5" />
              Save Progress
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowProgressInput(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Footer with actions */}
      <div className="p-4 bg-warm-50/50">
        <div className="flex items-center justify-between">
          {/* Target date */}
          {focusArea.targetDate && (
            <div className="flex items-center gap-2 text-xs text-warm-500">
              <IconCalendar size={14} />
              <span>Target: {new Date(focusArea.targetDate).toLocaleDateString()}</span>
            </div>
          )}

          {/* Completed date */}
          {focusArea.completedAt && (
            <div className="flex items-center gap-2 text-xs text-green-600">
              <IconCheck size={14} />
              <span>Completed {new Date(focusArea.completedAt).toLocaleDateString()}</span>
            </div>
          )}

          {/* Action buttons */}
          {!isCompleted && (
            <div className="flex items-center gap-2 ml-auto">
              {hasMetricTarget && onUpdateProgress && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowProgressInput(!showProgressInput)}
                >
                  <IconTrendingUp size={14} className="mr-1.5" />
                  Log Progress
                </Button>
              )}

              {onMarkComplete && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleMarkComplete}
                  disabled={loading}
                >
                  <IconCheck size={14} className="mr-1.5" />
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default FocusAreaCard;
