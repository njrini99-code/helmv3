'use client';

/**
 * Premium Event Block Component
 *
 * Glass-treatment event cards with:
 * - Type-based left border (category ribbon)
 * - Frosted glass background
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

interface PremiumEventBlockProps {
  event: {
    id: string;
    title: string;
    event_type: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    location?: string | null;
    all_day?: boolean;
    recurring?: boolean;
    requires_rsvp?: boolean;
    rsvp_confirmed_count?: number;
    rsvp_total_count?: number;
    max_attendees?: number | null;
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
  // Show RSVP chip when the event requires RSVP and there's data to display
  const hasRSVP = event.requires_rsvp && (event.rsvp_total_count ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Base glass styles
        'relative pl-2.5 pr-2 cursor-pointer text-left w-full',
        'border-l-[3px] rounded-lg',
        // Glass treatment
        'backdrop-blur-sm',
        // Hover micro-interaction
        'hover:shadow-sm hover:brightness-[1.02]',
        'transition-all duration-150',
        // Premium event classes (type + status)
        getEventClasses(event),
        // Spacing
        compact ? 'py-0.5' : 'py-1.5',
        className
      )}
      style={{
        // Frosted glass background — slightly translucent white
        background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Main content */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-medium truncate leading-tight',
                compact ? 'text-xs' : 'text-body-sm',
                event.status === 'cancelled'
                  ? 'text-warm-400 line-through'
                  : 'text-warm-800'
              )}
            >
              {event.title}
            </span>

            {/* Recurring indicator */}
            {event.recurring && (
              <Calendar className="w-3 h-3 text-warm-400 shrink-0" />
            )}
          </div>

          {/* Time (hidden for all-day events) */}
          {!compact && event.start_time && !event.all_day && (
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-warm-400" />
              <span className="text-xs text-warm-500">
                {formatTime(event.start_time)}
                {event.end_time && ` – ${formatTime(event.end_time)}`}
              </span>
            </div>
          )}

          {/* Location (non-compact only) */}
          {!compact && event.location && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-warm-400" />
              <span className="text-xs text-warm-500 truncate">
                {event.location}
              </span>
            </div>
          )}
        </div>

        {/* RSVP Count */}
        {hasRSVP && (
          <div className="shrink-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-warm-50/80 rounded-md">
              <Users className="w-3 h-3 text-warm-500" />
              <span className="text-xs text-warm-600 tabular-nums">
                {event.rsvp_confirmed_count ?? 0}/{event.max_attendees ?? event.rsvp_total_count ?? 0}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status badge (for draft/cancelled) */}
      {(event.status === 'draft' || event.status === 'cancelled') && (
        <div className="absolute top-0.5 right-1">
          <EventStatusBadge status={event.status} compact={compact} />
        </div>
      )}
    </button>
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
      className: 'bg-warm-100/80 text-warm-500 border-warm-200/60',
    },
    cancelled: {
      icon: XCircle,
      label: 'Cancelled',
      className: 'bg-rose-50/80 text-rose-600 border-rose-200/60',
    },
    confirmed: {
      icon: CheckCircle,
      label: 'Confirmed',
      className: 'bg-primary-50/80 text-primary-600 border-primary-200/60',
    },
    scheduled: {
      icon: CheckCircle,
      label: 'Scheduled',
      className: 'bg-primary-50/80 text-primary-600 border-primary-200/60',
    },
  }[status] || {
    icon: AlertCircle,
    label: status,
    className: 'bg-warm-100/80 text-warm-500 border-warm-200/60',
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-eyebrow font-medium uppercase tracking-wider',
        config.className
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {!compact && config.label}
    </span>
  );
}
