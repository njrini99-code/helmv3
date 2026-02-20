'use client';

/**
 * MobileCalendarListView - Default mobile calendar view
 *
 * Features:
 * - Grouped events by date
 * - Touch-optimized event cards with RSVP
 * - Sticky date headers
 * - Pull to refresh (future)
 * - Infinite scroll for past/future events
 */

import { useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  isYesterday,
  isSameDay,
  startOfDay,
  compareAsc,
} from 'date-fns';
import { MobileEventCard, MobileEmptyEventsState } from './MobileEventCard';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPResponse } from './MobileRSVPButtons';

interface MobileCalendarListViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPResponse>; // eventId -> status
  onRsvp?: (eventId: string, response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  onEventClick?: (event: CalendarEvent) => void;
  onAddEvent?: () => void;
  className?: string;
}

interface EventGroup {
  date: Date;
  dateKey: string;
  label: string;
  isToday: boolean;
  events: CalendarEvent[];
}

function getDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
}

function groupEventsByDate(events: CalendarEvent[]): EventGroup[] {
  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = parseISO(a.start_date);
    const dateB = parseISO(b.start_date);
    return compareAsc(dateA, dateB);
  });

  // Group by date
  const groups: Map<string, EventGroup> = new Map();

  for (const event of sortedEvents) {
    const eventDate = startOfDay(parseISO(event.start_date));
    const dateKey = format(eventDate, 'yyyy-MM-dd');

    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        date: eventDate,
        dateKey,
        label: getDateLabel(eventDate),
        isToday: isToday(eventDate),
        events: [],
      });
    }

    groups.get(dateKey)!.events.push(event);
  }

  return Array.from(groups.values());
}

export function MobileCalendarListView({
  events,
  currentDate,
  isCoach,
  userRsvpStatuses,
  onRsvp,
  onEventClick,
  onAddEvent,
  className,
}: MobileCalendarListViewProps) {
  const eventGroups = useMemo(() => groupEventsByDate(events), [events]);

  const handleRsvp = useCallback(
    (eventId: string) => async (response: RSVPResponse) => {
      if (!onRsvp) return { success: false, error: 'RSVP not available' };
      return onRsvp(eventId, response);
    },
    [onRsvp]
  );

  // Find today's group index for initial scroll position
  // Note: Computed for potential future scroll positioning
  void useMemo(() => {
    return eventGroups.findIndex((g) => g.isToday);
  }, [eventGroups]);

  if (events.length === 0) {
    return (
      <MobileEmptyEventsState
        date={currentDate}
        onAddEvent={isCoach ? onAddEvent : undefined}
      />
    );
  }

  return (
    <div className={cn('flex-1 overflow-y-auto overscroll-contain', className)} style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="px-4 py-3">
        {eventGroups.map((group, groupIndex) => (
          <div
            key={group.dateKey}
            className={cn(
              groupIndex > 0 && 'mt-8'
            )}
          >
            {/* Premium sticky date header — solid bg to avoid Safari sticky+blur bugs */}
            <div
              className={cn(
                'sticky top-0 z-10 -mx-4 px-4 py-2',
                'bg-[#FFFEFA]'
              )}
            >
              <div className="flex items-center gap-2">
                {/* Date circle for today */}
                {group.isToday && (
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center shadow-sm shadow-primary-600/20">
                    <span className="text-xs font-bold text-white">
                      {format(group.date, 'd')}
                    </span>
                  </div>
                )}
                <div className="flex flex-col">
                  <h3
                    className={cn(
                      'text-sm font-semibold leading-tight',
                      group.isToday ? 'text-primary-700' : 'text-warm-800'
                    )}
                  >
                    {group.label}
                  </h3>
                  {!group.isToday && (
                    <span className="text-xs text-warm-400 font-medium">
                      {format(group.date, 'MMM d')}
                    </span>
                  )}
                </div>
                {group.isToday && group.events.length > 0 && (
                  <span className="ml-auto px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide bg-primary-100 text-primary-700 rounded-md">
                    {group.events.length} event{group.events.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Events for this date */}
            <div className="space-y-3 mt-3">
              {group.events.map((event, eventIndex) => (
                <div
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-200"
                  style={{ animationDelay: `${eventIndex * 30}ms` }}
                >
                  <MobileEventCard
                    event={event}
                    userRsvpStatus={userRsvpStatuses?.get(event.id) || null}
                    onRsvp={onRsvp ? handleRsvp(event.id) : undefined}
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    isCoach={isCoach}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Bottom padding for safe area and FAB */}
        <div className="h-28" />
      </div>
    </div>
  );
}

/**
 * Compact list view for specific date range (e.g., week view)
 */
export function MobileWeekListView({
  events,
  startDate,
  endDate,
  isCoach,
  userRsvpStatuses,
  onRsvp,
  onEventClick,
  className,
}: {
  events: CalendarEvent[];
  startDate: Date;
  endDate: Date;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPResponse>;
  onRsvp?: (eventId: string, response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
}) {
  // Filter events to date range
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const eventDate = parseISO(event.start_date);
      return eventDate >= startDate && eventDate <= endDate;
    });
  }, [events, startDate, endDate]);

  const eventGroups = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  const handleRsvp = useCallback(
    (eventId: string) => async (response: RSVPResponse) => {
      if (!onRsvp) return { success: false, error: 'RSVP not available' };
      return onRsvp(eventId, response);
    },
    [onRsvp]
  );

  if (filteredEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-warm-500">
          No events from {format(startDate, 'MMM d')} to {format(endDate, 'MMM d')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {eventGroups.map((group) => (
        <div key={group.dateKey}>
          {/* Compact date header */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                'text-xs font-bold uppercase tracking-wide',
                group.isToday ? 'text-primary-600' : 'text-warm-500'
              )}
            >
              {format(group.date, 'EEE d')}
            </span>
            {group.isToday && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
            )}
          </div>

          {/* Compact event cards */}
          <div className="space-y-2">
            {group.events.map((event) => (
              <MobileEventCard
                key={event.id}
                event={event}
                userRsvpStatus={userRsvpStatuses?.get(event.id) || null}
                onRsvp={onRsvp ? handleRsvp(event.id) : undefined}
                onClick={onEventClick ? () => onEventClick(event) : undefined}
                isCoach={isCoach}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Day-specific view showing all events for a single day
 */
export function MobileDayListView({
  events,
  date,
  isCoach,
  userRsvpStatuses,
  onRsvp,
  onEventClick,
  onAddEvent,
}: {
  events: CalendarEvent[];
  date: Date;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPResponse>;
  onRsvp?: (eventId: string, response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  onEventClick?: (event: CalendarEvent) => void;
  onAddEvent?: () => void;
}) {
  // Filter events to specific date
  const dayEvents = useMemo(() => {
    return events.filter((event) => {
      const eventDate = parseISO(event.start_date);
      return isSameDay(eventDate, date);
    });
  }, [events, date]);

  const handleRsvp = useCallback(
    (eventId: string) => async (response: RSVPResponse) => {
      if (!onRsvp) return { success: false, error: 'RSVP not available' };
      return onRsvp(eventId, response);
    },
    [onRsvp]
  );

  const dateLabel = getDateLabel(date);

  return (
    <div className="flex-1 px-4 py-3">
      {/* Day header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-warm-900">{dateLabel}</h2>
        <p className="text-sm text-warm-500">{format(date, 'MMMM d, yyyy')}</p>
      </div>

      {dayEvents.length === 0 ? (
        <MobileEmptyEventsState
          date={date}
          onAddEvent={isCoach ? onAddEvent : undefined}
        />
      ) : (
        <div className="space-y-3">
          {dayEvents.map((event) => (
            <MobileEventCard
              key={event.id}
              event={event}
              userRsvpStatus={userRsvpStatuses?.get(event.id) || null}
              onRsvp={onRsvp ? handleRsvp(event.id) : undefined}
              onClick={onEventClick ? () => onEventClick(event) : undefined}
              isCoach={isCoach}
            />
          ))}
        </div>
      )}
    </div>
  );
}
