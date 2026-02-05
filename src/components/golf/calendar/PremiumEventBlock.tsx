'use client';

/**
 * Premium Event Block Component
 *
 * Implements the premium event visualization from the UI guide:
 * - Type-based left border (category ribbon)
 * - Status overlays (draft, cancelled, confirmed)
 * - Hover micro-interactions
 * - RSVP count display
 * - Time formatting
 */

import { cn } from '@/lib/utils';
import { getEventClasses, formatTime } from '@/lib/calendar/premium-utils';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle,
  AlertCircle,
  XCircle,
} from 'lucide-react';

export interface PremiumEventBlockProps {
  event: {
    id: string;
    title: string;
    event_type: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    location?: string | null;
    recurring?: boolean;
  };
  onClick?: () => void;
  className?: string;
  compact?: boolean;
}

export function PremiumEventBlock({
  event,
  onClick,
  className,
  compact = false,
}: PremiumEventBlockProps) {
  // RSVP counts are no longer stored on the event; remove RSVP display for now
  const hasRSVP = false;

  return (
    <div
      onClick={onClick}
      className={cn(
        // Base styles
        'relative pl-2.5 pr-2 rounded-r-lg cursor-pointer',
        'border-l-[3px] bg-white',
        // Premium event classes (type + status)
        getEventClasses(event),
        // Spacing
        compact ? 'py-1' : 'py-1.5',
        // Custom className
        className
      )}
    >
      {/* Main content */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-medium truncate',
                compact ? 'text-xs' : 'text-sm',
                event.status === 'cancelled'
                  ? 'text-slate-400 line-through'
                  : 'text-slate-900'
              )}
            >
              {event.title}
            </span>

            {/* Recurring indicator */}
            {event.recurring && (
              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            )}
          </div>

          {/* Time */}
          {event.start_time && (
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {formatTime(event.start_time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </span>
            </div>
          )}

          {/* Location (non-compact only) */}
          {!compact && event.location && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500 truncate">
                {event.location}
              </span>
            </div>
          )}
        </div>

        {/* RSVP Count */}
        {hasRSVP && (
          <div className="shrink-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 rounded">
              <Users className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-600 tabular-nums">
                0/0
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status badge (for draft/cancelled) */}
      {(event.status === 'draft' || event.status === 'cancelled') && (
        <div className="absolute top-1 right-1">
          <EventStatusBadge status={event.status} compact={compact} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

interface EventStatusBadgeProps {
  status: string;
  compact?: boolean;
}

function EventStatusBadge({ status, compact }: EventStatusBadgeProps) {
  const config = {
    draft: {
      icon: AlertCircle,
      label: 'Draft',
      className: 'bg-slate-100 text-slate-600 border-slate-200',
    },
    cancelled: {
      icon: XCircle,
      label: 'Cancelled',
      className: 'bg-rose-100 text-rose-700 border-rose-200',
    },
    confirmed: {
      icon: CheckCircle,
      label: 'Confirmed',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    scheduled: {
      icon: CheckCircle,
      label: 'Scheduled',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
  }[status] || {
    icon: AlertCircle,
    label: status,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide',
        config.className
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {!compact && config.label}
    </span>
  );
}
