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
  Users,
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

  const eventTypeConfig = getEventTypeConfig(event.event_type as EventType);
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

  // Attendance counts for coaches
  const attendanceInfo = isCoach && event.rsvp_confirmed_count !== undefined ? {
    confirmed: event.rsvp_confirmed_count || 0,
    total: event.rsvp_total_count || 0,
  } : null;

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden',
        'transition-all duration-200 ease-out',
        'active:scale-[0.98]',
        eventTypeConfig.borderColor,
        isEventPast && 'opacity-60',
        className
      )}
    >
      {/* Main card content - tappable */}
      <button
        type="button"
        onClick={handleCardClick}
        className={cn(
          'w-full text-left p-4',
          'min-h-[72px]', // Ensure touch-friendly height
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Event type indicator */}
          <div
            className={cn(
              'w-1 h-full min-h-[48px] rounded-full flex-shrink-0',
              eventTypeConfig.bgColor
            )}
          />

          {/* Event info */}
          <div className="flex-1 min-w-0">
            {/* Date label (if showing date or relative) */}
            {(showDate || relativeLabel) && (
              <div className="flex items-center gap-2 mb-1">
                {relativeLabel && (
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-full',
                    relativeLabel === 'Today' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  )}>
                    {relativeLabel}
                  </span>
                )}
                {showDate && !relativeLabel && (
                  <span className="text-xs text-slate-500">
                    {formatEventDate(event.start_date)}
                  </span>
                )}
              </div>
            )}

            {/* Title */}
            <h3 className={cn(
              'font-semibold text-slate-900 truncate',
              eventTypeConfig.textColor
            )}>
              {event.title}
            </h3>

            {/* Time and location row */}
            <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-600">
              {/* Time */}
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatEventTime(event.start_date, event.end_date)}</span>
              </div>

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-1 truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              )}
            </div>

            {/* Attendance info for coaches */}
            {attendanceInfo && (
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                <Users className="w-3.5 h-3.5" />
                <span>
                  {attendanceInfo.confirmed}/{attendanceInfo.total} confirmed
                </span>
              </div>
            )}
          </div>

          {/* Right side - RSVP status or chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* RSVP status indicator */}
            {userRsvpStatus && (
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center',
                userRsvpStatus === 'accepted' && 'bg-emerald-100 text-emerald-600',
                userRsvpStatus === 'tentative' && 'bg-amber-100 text-amber-600',
                userRsvpStatus === 'declined' && 'bg-rose-100 text-rose-600'
              )}>
                <span className="text-xs font-bold">
                  {userRsvpStatus === 'accepted' ? 'Y' : userRsvpStatus === 'tentative' ? '?' : 'N'}
                </span>
              </div>
            )}

            {/* Expandable indicator */}
            {(onClick || requiresRsvp) && (
              <ChevronRight className={cn(
                'w-5 h-5 text-slate-400 transition-transform',
                isExpanded && 'rotate-90'
              )} />
            )}
          </div>
        </div>
      </button>

      {/* Expanded RSVP section */}
      {isExpanded && requiresRsvp && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100">
          <p className="text-sm font-medium text-slate-700 mb-3">
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
          <p className="font-medium text-sm text-slate-900 truncate">
            {event.title}
          </p>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 ml-4">
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
 * Empty state for no events
 */
export function MobileEmptyEventsState({
  date,
  onAddEvent,
}: {
  date?: Date;
  onAddEvent?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Calendar className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        No events
      </h3>
      <p className="text-sm text-slate-500 max-w-xs mb-4">
        {date
          ? `Nothing scheduled for ${format(date, 'MMMM d')}`
          : 'No events scheduled yet'}
      </p>
      {onAddEvent && (
        <button
          type="button"
          onClick={onAddEvent}
          className={cn(
            'px-4 py-2.5 rounded-xl font-medium text-sm',
            'bg-primary-600 text-white',
            'hover:bg-primary-700 active:scale-95',
            'transition-all min-h-[44px]'
          )}
        >
          Add Event
        </button>
      )}
    </div>
  );
}
