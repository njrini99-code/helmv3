'use client';

/**
 * MobileEventCard - Touch-optimized event card for mobile calendars
 *
 * Features:
 * - Large touch targets (48px minimum)
 * - Integrated RSVP buttons
 * - Swipeable for quick actions
 * - Event type color coding
 * - Time and location display
 * - RSVP status indicator
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import {
  MapPin,
  Clock,
  ChevronRight,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { MobileRSVPButtons, type RSVPResponse } from './MobileRSVPButtons';
import { getEventTypeConfig, formatTime } from '@/lib/calendar/event-styles';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { EventType } from '@/lib/types/calendar';

interface MobileEventCardProps {
  event: CalendarEvent;
  userRsvpStatus?: RSVPResponse | null;
  onRsvp?: (response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  onClick?: () => void;
  showDate?: boolean;
  isCoach?: boolean;
  className?: string;
}

function getRelativeDateLabel(dateStr: string): string | null {
  try {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return null;
  } catch {
    return null;
  }
}

function formatEventDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    return format(date, 'EEE, MMM d');
  } catch {
    return dateStr;
  }
}

function formatEventTime(start: string, end?: string | null): string {
  const startTime = formatTime(start);
  if (!end) return startTime;
  const endTime = formatTime(end);
  return `${startTime} - ${endTime}`;
}

export function MobileEventCard({
  event,
  userRsvpStatus,
  onRsvp,
  onClick,
  showDate = false,
  isCoach = false,
  className,
}: MobileEventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const relativeLabel = getRelativeDateLabel(event.start_date);
  const isEventPast = isPast(parseISO(event.start_date));
  const requiresRsvp = event.requires_rsvp && !isCoach && onRsvp;

  const handleCardClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else if (requiresRsvp) {
      setIsExpanded(!isExpanded);
    }
  }, [onClick, requiresRsvp, isExpanded]);

  const handleRsvp = useCallback(async (response: RSVPResponse) => {
    if (!onRsvp) return { success: false, error: 'RSVP not available' };
    return onRsvp(response);
  }, [onRsvp]);

  // Get accent color based on event type (matches event-styles.ts)
  const getAccentColor = () => {
    switch (event.event_type) {
      case 'practice': return 'bg-warm-400';
      case 'tournament': return 'bg-primary-600';
      case 'qualifier': return 'bg-amber-500';
      case 'meeting': return 'bg-sky-500';
      case 'travel': return 'bg-purple-500';
      default: return 'bg-warm-400';
    }
  };

  return (
    <div
      className={cn(
        'relative bg-white rounded-2xl overflow-hidden',
        'shadow-sm shadow-warm-200/50',
        'border border-warm-100',
        'transition-all duration-200 ease-out',
        'active:scale-[0.98] active:shadow-none',
        isEventPast && 'opacity-50',
        className
      )}
    >
      {/* Left accent bar */}
      <div className={cn(
        'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
        getAccentColor()
      )} />

      {/* Main card content - tappable */}
      <button
        type="button"
        onClick={handleCardClick}
        className={cn(
          'w-full text-left pl-4 pr-3 py-4',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Event info */}
          <div className="flex-1 min-w-0">
            {/* Date label (if showing date or relative) */}
            {(showDate || relativeLabel) && (
              <div className="flex items-center gap-2 mb-1.5">
                {relativeLabel && (
                  <span className={cn(
                    'text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-md',
                    relativeLabel === 'Today'
                      ? 'bg-primary-500/10 text-primary-700'
                      : 'bg-warm-100 text-warm-500'
                  )}>
                    {relativeLabel}
                  </span>
                )}
                {showDate && !relativeLabel && (
                  <span className="text-xs text-warm-400 font-medium">
                    {formatEventDate(event.start_date)}
                  </span>
                )}
              </div>
            )}

            {/* Title */}
            <h3 className="font-semibold text-[15px] text-warm-900 leading-snug truncate">
              {event.title}
            </h3>

            {/* Time and location row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
              {/* Time */}
              <div className="flex items-center gap-2 text-warm-500">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-sm">{formatEventTime(event.start_date, event.end_date)}</span>
              </div>

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-2 text-warm-500 min-w-0">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-sm truncate">{event.location}</span>
                </div>
              )}
            </div>

            {/* Attendance info for coaches */}
            {/* Attendance info - will be populated when RSVP counts are fetched from attendance table */}
          </div>

          {/* Right side - RSVP status or chevron */}
          <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
            {/* RSVP status indicator */}
            {userRsvpStatus && (
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm',
                userRsvpStatus === 'accepted' && 'bg-primary-500/10 text-primary-600',
                userRsvpStatus === 'tentative' && 'bg-amber-500/10 text-amber-600',
                userRsvpStatus === 'declined' && 'bg-rose-500/10 text-rose-500'
              )}>
                {userRsvpStatus === 'accepted' ? '✓' : userRsvpStatus === 'tentative' ? '?' : '✗'}
              </div>
            )}

            {/* Expandable indicator */}
            {(onClick || requiresRsvp) && (
              <ChevronRight className={cn(
                'w-5 h-5 text-warm-300 transition-transform',
                isExpanded && 'rotate-90'
              )} />
            )}
          </div>
        </div>
      </button>

      {/* Expanded RSVP section */}
      {isExpanded && requiresRsvp && (
        <div className="px-4 pb-4 pt-3 border-t border-warm-100 bg-warm-50/50">
          <p className="text-sm font-medium text-warm-700 mb-3">
            Will you attend?
          </p>
          <MobileRSVPButtons
            currentResponse={userRsvpStatus || null}
            onRespond={handleRsvp}
            size="md"
            layout="horizontal"
            showLabels
          />

          {/* RSVP deadline warning */}
          {event.rsvp_deadline && (
            <div className="flex items-center gap-2 mt-3 text-xs text-amber-600">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>RSVP by {format(parseISO(event.rsvp_deadline), 'MMM d, h:mm a')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact event card for list views - always shows inline RSVP
 */
export function CompactMobileEventCard({
  event,
  userRsvpStatus,
  onRsvp,
  onClick,
}: Pick<MobileEventCardProps, 'event' | 'userRsvpStatus' | 'onRsvp' | 'onClick'>) {
  const eventTypeConfig = getEventTypeConfig(event.event_type as EventType);

  const handleRsvp = useCallback(async (response: RSVPResponse) => {
    if (!onRsvp) return { success: false, error: 'RSVP not available' };
    return onRsvp(response);
  }, [onRsvp]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 bg-white rounded-xl border',
        'transition-all duration-200',
        eventTypeConfig.borderColor
      )}
    >
      {/* Tappable event info */}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left focus-visible:outline-none"
      >
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', eventTypeConfig.bgColor)} />
          <p className="font-medium text-sm text-warm-900 truncate">
            {event.title}
          </p>
        </div>
        <p className="text-xs text-warm-500 mt-0.5 ml-4">
          {formatEventTime(event.start_date, event.end_date)}
          {event.location && ` - ${event.location}`}
        </p>
      </button>

      {/* Inline RSVP buttons */}
      {onRsvp && event.requires_rsvp && (
        <div className="flex-shrink-0">
          <MobileRSVPButtons
            currentResponse={userRsvpStatus || null}
            onRespond={handleRsvp}
            size="sm"
            layout="horizontal"
            showLabels={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Empty state for no events - Premium styled
 */
export function MobileEmptyEventsState({
  date,
  onAddEvent,
}: {
  date?: Date;
  onAddEvent?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary-500/10 rounded-3xl blur-2xl scale-150" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-warm-50 to-warm-100 border border-warm-200/50 flex items-center justify-center shadow-sm">
          <Calendar className="w-10 h-10 text-warm-300" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-warm-800 mb-1.5">
        Nothing scheduled
      </h3>
      <p className="text-sm text-warm-500 max-w-[200px] mb-6">
        {date
          ? `Your ${format(date, 'EEEE')} is free`
          : 'No upcoming events'}
      </p>
      {onAddEvent && (
        <button
          type="button"
          onClick={onAddEvent}
          className={cn(
            'group flex items-center gap-2',
            'px-5 py-2.5 rounded-2xl font-semibold text-sm',
            'bg-primary-600 text-white',
            'shadow-lg shadow-primary-600/20',
            'hover:bg-primary-700 hover:shadow-primary-600/25',
            'active:scale-95',
            'transition-all duration-200'
          )}
        >
          <span className="text-lg leading-none">+</span>
          <span>Add Event</span>
        </button>
      )}
    </div>
  );
}
