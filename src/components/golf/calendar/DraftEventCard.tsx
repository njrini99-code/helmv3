'use client';

/**
 * Draft Event Card Component
 *
 * Special visual treatment for draft events:
 * - Dashed border to indicate "work in progress"
 * - Diagonal "DRAFT" watermark overlay
 * - Repeating stripe background pattern
 * - Reduced opacity for muted appearance
 *
 * Used in calendar views to distinguish unpublished events.
 */

import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/calendar/premium-utils';
import { StatusBadge } from './StatusBadge';
import { Calendar, Clock, MapPin, Users, Edit3 } from 'lucide-react';
import '@/styles/calendar-tokens.css';

export interface DraftEventCardProps {
  event: {
    id: string;
    title: string;
    event_type: string;
    start_time: string | null;
    end_time: string | null;
    location?: string | null;
    rsvp_total_count?: number;
    is_recurring?: boolean;
  };
  onClick?: () => void;
  className?: string;
  compact?: boolean;
}

export function DraftEventCard({
  event,
  onClick,
  className,
  compact = false,
}: DraftEventCardProps) {
  const hasRSVP = event.rsvp_total_count && event.rsvp_total_count > 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        // Base card styles
        'relative bg-white rounded-lg cursor-pointer overflow-hidden',
        // Draft-specific: dashed border, reduced opacity
        'border-2 border-dashed border-slate-300',
        'opacity-75 hover:opacity-90',
        // Spacing
        compact ? 'p-3' : 'p-4',
        // Hover effect
        'hover:shadow-md transition-all duration-200',
        'hover:-translate-y-0.5',
        // Custom className
        className
      )}
      style={{
        // Repeating stripe background (subtle)
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(148, 163, 184, 0.05) 10px, rgba(148, 163, 184, 0.05) 20px)',
      }}
    >
      {/* Diagonal "DRAFT" watermark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          className="text-slate-200 font-bold uppercase tracking-widest select-none"
          style={{
            fontSize: compact ? '2rem' : '3rem',
            transform: 'rotate(-45deg)',
            opacity: 0.15,
          }}
        >
          DRAFT
        </div>
      </div>

      {/* Content (above watermark) */}
      <div className="relative" style={{ zIndex: 1 }}>
        {/* Header with status badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Edit3 className="w-4 h-4 text-slate-400 shrink-0" />
              <h3
                className={cn(
                  'font-semibold text-slate-900 truncate',
                  compact ? 'text-sm' : 'text-base'
                )}
              >
                {event.title}
              </h3>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {event.event_type.replace('_', ' ')}
            </p>
          </div>

          <StatusBadge status="draft" size={compact ? 'sm' : 'md'} />
        </div>

        {/* Event details */}
        <div className="space-y-2">
          {/* Time */}
          {event.start_time && (
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm">
                {formatTime(event.start_time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </span>
            </div>
          )}

          {/* Location */}
          {!compact && event.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm truncate">{event.location}</span>
            </div>
          )}

          {/* Recurring indicator */}
          {event.is_recurring && (
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">Repeating event</span>
            </div>
          )}

          {/* RSVP count (if applicable) */}
          {hasRSVP && (
            <div className="flex items-center gap-2 text-slate-600">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm">{event.rsvp_total_count} invited</span>
            </div>
          )}
        </div>

        {/* Call to action (non-compact only) */}
        {!compact && (
          <div className="mt-4 pt-3 border-t border-slate-200 border-dashed">
            <p className="text-xs text-slate-500 italic">
              This event is not yet published. Click to edit and publish.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Draft Event List Item (for compact lists)
 */
export function DraftEventListItem({
  event,
  onClick,
}: Omit<DraftEventCardProps, 'className' | 'compact'>) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-2 rounded-lg border-l-3 border-l-slate-300
                 border-dashed bg-slate-50/50 hover:bg-slate-100/50 cursor-pointer
                 transition-colors"
    >
      <Edit3 className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{event.title}</p>
        {event.start_time && (
          <p className="text-xs text-slate-500">{formatTime(event.start_time)}</p>
        )}
      </div>
      <StatusBadge status="draft" compact size="sm" />
    </div>
  );
}
