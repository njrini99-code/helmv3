'use client';

/**
 * Event Status Timeline Component
 *
 * Audit log visualization for event status changes:
 * - Who changed what, when
 * - Reason display for cancellations/changes
 * - Visual timeline with status transitions
 * - Chronological display (newest first)
 *
 * Used in event detail views to show full history.
 */

import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { format, formatDistanceToNow } from 'date-fns';
import { User, Clock, MessageSquare, Edit3, XCircle, CheckCircle } from 'lucide-react';

export interface StatusHistoryEntry {
  id: string;
  event_id: string;
  old_status: string | null;
  new_status: string;
  changed_by_user_id: string;
  changed_by_name: string;
  changed_by_avatar?: string | null;
  changed_at: string;
  reason?: string | null;
  metadata?: Record<string, any>;
}

export interface EventStatusTimelineProps {
  history: StatusHistoryEntry[];
  className?: string;
  compact?: boolean;
}

export function EventStatusTimeline({
  history,
  className,
  compact = false,
}: EventStatusTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No status history available</p>
      </div>
    );
  }

  // Sort by newest first
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  return (
    <div className={cn('space-y-0', className)}>
      {sortedHistory.map((entry, index) => {
        const isFirst = index === 0;
        const isLast = index === sortedHistory.length - 1;

        return (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            isFirst={isFirst}
            isLast={isLast}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

/**
 * Individual timeline entry
 */
function TimelineEntry({
  entry,
  isFirst: _isFirst,
  isLast,
  compact,
}: {
  entry: StatusHistoryEntry;
  isFirst: boolean;
  isLast: boolean;
  compact: boolean;
}) {
  const changeDate = new Date(entry.changed_at);
  const relativeTime = formatDistanceToNow(changeDate, { addSuffix: true });
  const absoluteTime = format(changeDate, 'MMM d, yyyy h:mm a');

  const isCancellation = entry.new_status === 'cancelled';
  const isConfirmation = entry.new_status === 'confirmed';
  const isCreation = entry.old_status === null;

  return (
    <div className="relative flex gap-4 pb-6">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[15px] top-[32px] bottom-0 w-0.5 bg-slate-200" />
      )}

      {/* Timeline dot */}
      <div className="relative shrink-0">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            'border-2 bg-white',
            isCancellation && 'border-rose-500 bg-rose-50',
            isConfirmation && 'border-emerald-500 bg-emerald-50',
            isCreation && 'border-blue-500 bg-blue-50',
            !isCancellation && !isConfirmation && !isCreation && 'border-slate-300'
          )}
        >
          {isCancellation && <XCircle className="w-4 h-4 text-rose-600" />}
          {isConfirmation && <CheckCircle className="w-4 h-4 text-emerald-600" />}
          {isCreation && <Edit3 className="w-4 h-4 text-blue-600" />}
          {!isCancellation && !isConfirmation && !isCreation && (
            <Edit3 className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusChangeDescription entry={entry} />
            </div>

            {/* User and time */}
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              {entry.changed_by_avatar ? (
                <img
                  src={entry.changed_by_avatar}
                  alt={entry.changed_by_name}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <User className="w-4 h-4" />
              )}
              <span className="font-medium text-slate-700">{entry.changed_by_name}</span>
              <span>•</span>
              <time title={absoluteTime}>{relativeTime}</time>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 shrink-0">
            {entry.old_status && !isCreation && (
              <>
                <StatusBadge
                  status={entry.old_status as any}
                  size="sm"
                  compact={compact}
                />
                <span className="text-slate-400">→</span>
              </>
            )}
            <StatusBadge status={entry.new_status as any} size="sm" compact={compact} />
          </div>
        </div>

        {/* Reason (if provided) */}
        {entry.reason && (
          <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg mt-2">
            <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 italic">&ldquo;{entry.reason}&rdquo;</p>
          </div>
        )}

        {/* Metadata (if applicable) */}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && !compact && (
          <div className="mt-2 text-xs text-slate-500">
            {entry.metadata.notified_count && (
              <p>Notified {entry.metadata.notified_count} participants</p>
            )}
            {entry.metadata.rsvp_count && (
              <p>{entry.metadata.rsvp_count} had confirmed attendance</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Status change description (human-readable)
 */
function StatusChangeDescription({ entry }: { entry: StatusHistoryEntry }) {
  const isCreation = entry.old_status === null;

  if (isCreation) {
    return <span className="text-sm text-slate-900">Created event as draft</span>;
  }

  const descriptions: Record<string, string> = {
    'draft->confirmed': 'Published and confirmed event',
    'draft->cancelled': 'Cancelled draft event',
    'confirmed->cancelled': 'Cancelled confirmed event',
    'confirmed->draft': 'Reverted to draft',
    'cancelled->confirmed': 'Reinstated event',
    'pending->confirmed': 'Confirmed event',
    'pending->cancelled': 'Cancelled pending event',
  };

  const key = `${entry.old_status}->${entry.new_status}`;
  const description =
    descriptions[key] || `Changed status from ${entry.old_status} to ${entry.new_status}`;

  return <span className="text-sm text-slate-900">{description}</span>;
}

/**
 * Compact timeline (for sidebars/previews)
 */
export function CompactStatusTimeline({
  history,
  maxEntries = 3,
}: {
  history: StatusHistoryEntry[];
  maxEntries?: number;
}) {
  const sortedHistory = [...history]
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
    .slice(0, maxEntries);

  return (
    <div className="space-y-2">
      {sortedHistory.map((entry) => {
        const changeDate = new Date(entry.changed_at);
        const relativeTime = formatDistanceToNow(changeDate, { addSuffix: true });

        return (
          <div key={entry.id} className="flex items-center gap-2 text-xs">
            <StatusBadge status={entry.new_status as any} compact size="sm" />
            <span className="text-slate-600">{relativeTime}</span>
          </div>
        );
      })}
    </div>
  );
}
