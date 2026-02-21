'use client';

import { cn } from '@/lib/utils';
import { getEventTypeConfig } from './event-type-config';

export interface BaseballCalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string | null;
  end_time?: string | null;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  description?: string | null;
  is_mandatory?: boolean;
  rsvp_going_count?: number;
  rsvp_maybe_count?: number;
  rsvp_not_going_count?: number;
  rsvp_pending_count?: number;
  rsvp_total_count?: number;
  max_attendees?: number | null;
  rsvp_deadline?: string | null;
  created_by?: string | null;
}

interface MonthViewProps {
  month: Date;
  events: BaseballCalendarEvent[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: BaseballCalendarEvent) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export function MonthView({ month, events, onDateClick, onEventClick }: MonthViewProps) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const days: Date[] = [];
  const current = new Date(startDate);
  while (days.length < 42) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_date);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  return (
    <div className="flex-1 overflow-auto px-4 md:px-5 pt-2 pb-4 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '3px',
        }}
      >
        {/* Day Headers */}
        {DAYS.map((day) => (
          <div
            key={day}
            className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-400"
          >
            {day}
          </div>
        ))}

        {/* Calendar Days */}
        {days.map((date, index) => {
          const dayEvents = getEventsForDate(date);
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const isCurrentDay = isToday(date);

          return (
            <div
              key={index}
              onClick={() => onDateClick?.(date)}
              className={cn(
                'min-h-[110px] p-2.5 cursor-pointer transition-all duration-200 rounded-xl',
                isCurrentMonth ? 'bg-white/60' : 'bg-slate-50/30',
                'hover:bg-white/80 hover:shadow-sm',
                isCurrentDay && 'bg-primary-50/40 ring-1 ring-primary-200/40',
              )}
            >
              {/* Date Number */}
              <div className="flex items-center justify-between mb-1.5">
                <div
                  className={cn(
                    'w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-bold transition-all',
                    isCurrentDay
                      ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.4)]'
                      : isCurrentMonth
                      ? 'text-slate-800'
                      : 'text-slate-300',
                  )}
                >
                  {date.getDate()}
                </div>
                {dayEvents.length > 3 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* Event Previews (max 3) */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => {
                  const config = getEventTypeConfig(event.event_type);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      className={cn(
                        'w-full rounded-[6px] px-1.5 py-0.5 text-left',
                        'border-l-[2px]',
                        'transition-all duration-150',
                        'hover:scale-[1.02] hover:shadow-sm',
                        config.bgColor,
                        config.borderColor,
                      )}
                    >
                      <p className={cn('font-semibold text-micro truncate leading-tight', config.textColor)}>
                        {event.title}
                      </p>
                    </button>
                  );
                })}

                {dayEvents.length > 3 && (
                  <p className="text-xs text-slate-400 pl-2 font-medium">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
