'use client';

import { Calendar } from 'lucide-react';
import { BaseballEventCard } from './EventCard';
import type { BaseballCalendarEvent } from './MonthView';

interface EventListViewProps {
  events: BaseballCalendarEvent[];
  onEventClick?: (event: BaseballCalendarEvent) => void;
}

function formatDateHeading(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();

  if (isToday) return 'Today';
  if (isTomorrow) return 'Tomorrow';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function groupByDate(events: BaseballCalendarEvent[]): Map<string, BaseballCalendarEvent[]> {
  const groups = new Map<string, BaseballCalendarEvent[]>();

  for (const event of events) {
    const dateKey = new Date(event.start_date).toISOString().split('T')[0] || '';
    const existing = groups.get(dateKey) || [];
    existing.push(event);
    groups.set(dateKey, existing);
  }

  return groups;
}

export function EventListView({ events, onEventClick }: EventListViewProps) {
  // Only show current and future events, sorted by date
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcomingEvents = events
    .filter((e) => new Date(e.start_date) >= now)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  const grouped = groupByDate(upcomingEvents);

  if (upcomingEvents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Calendar className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No upcoming events</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          When events are added to the team calendar, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 md:px-6 py-4 space-y-6 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
      {Array.from(grouped.entries()).map(([dateKey, dateEvents]) => (
        <div key={dateKey}>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
            {formatDateHeading(dateKey)}
          </h3>
          <div className="space-y-2">
            {dateEvents.map((event) => (
              <BaseballEventCard
                key={event.id}
                id={event.id}
                title={event.title}
                eventType={event.event_type}
                startTime={event.start_time}
                endTime={event.end_time}
                location={event.location}
                isMandatory={event.is_mandatory}
                rsvpGoingCount={event.rsvp_going_count}
                rsvpMaybeCount={event.rsvp_maybe_count}
                onClick={() => onEventClick?.(event)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
