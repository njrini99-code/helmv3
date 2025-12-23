'use client';

import type { GolfEvent } from '@/lib/types/golf';
import { IconCalendar, IconMapPin, IconClock } from '@/components/icons';

interface EventsListProps {
  events: GolfEvent[];
  isCoach: boolean;
}

export function EventsList({ events, isCoach }: EventsListProps) {
  // Filter for upcoming events (from today onwards)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = events
    .filter(event => {
      const eventDate = new Date(event.start_date);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate >= today;
    })
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 10);

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'tournament':
        return 'bg-green-100 text-green-700';
      case 'practice':
        return 'bg-blue-100 text-blue-700';
      case 'qualifier':
        return 'bg-purple-100 text-purple-700';
      case 'meeting':
        return 'bg-amber-100 text-amber-700';
      case 'travel':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return null;

    // Handle HH:MM:SS format
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0]);
      const minutes = parts[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${ampm}`;
    }

    return timeStr;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Upcoming Events</h2>

      {upcomingEvents.length === 0 ? (
        <div className="text-center py-8">
          <IconCalendar size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-sm">No upcoming events</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingEvents.map(event => (
            <div
              key={event.id}
              className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-slate-900">{event.title}</h3>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${getEventTypeColor(
                    event.event_type
                  )}`}
                >
                  {event.event_type}
                </span>
              </div>

              <div className="space-y-1 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <IconCalendar size={16} className="text-slate-400" />
                  <span>{formatDate(event.start_date)}</span>
                  {event.end_date && event.end_date !== event.start_date && (
                    <span>- {formatDate(event.end_date)}</span>
                  )}
                </div>

                {(event.start_time || event.end_time) && (
                  <div className="flex items-center gap-2">
                    <IconClock size={16} className="text-slate-400" />
                    <span>
                      {formatTime(event.start_time)}
                      {event.end_time && ` - ${formatTime(event.end_time)}`}
                    </span>
                  </div>
                )}

                {event.location && (
                  <div className="flex items-center gap-2">
                    <IconMapPin size={16} className="text-slate-400" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>

              {event.description && (
                <p className="mt-2 text-sm text-slate-500 line-clamp-2">
                  {event.description}
                </p>
              )}

              {event.is_mandatory && (
                <div className="mt-2">
                  <span className="inline-block px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                    Mandatory
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
