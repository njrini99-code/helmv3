'use client';

import { useState } from 'react';
import { format, addDays, subDays, isSameDay, isToday, isTomorrow, isYesterday } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/lib/types/calendar';
import { getEventTypeConfig } from '@/lib/calendar/event-styles';
import Link from 'next/link';

interface CalendarWidgetProps {
  events: CalendarEvent[];
  calendarUrl?: string;
}

export function CalendarWidget({ events, calendarUrl = '/dashboard/calendar' }: CalendarWidgetProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Get events for selected date
  const dayEvents = events.filter((event) =>
    isSameDay(new Date(event.start_time), selectedDate)
  );

  // Format date label
  function getDateLabel() {
    if (isToday(selectedDate)) return 'Today';
    if (isTomorrow(selectedDate)) return 'Tomorrow';
    if (isYesterday(selectedDate)) return 'Yesterday';
    return format(selectedDate, 'MMMM d');
  }

  function handlePrevious() {
    setSelectedDate((date) => subDays(date, 1));
  }

  function handleNext() {
    setSelectedDate((date) => addDays(date, 1));
  }

  return (
    <div
      className="
        bg-white/70 backdrop-blur-[12px]
        border border-white/40
        rounded-[20px]
        shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]
        overflow-hidden
      "
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/30">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-warm-900">Schedule</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-warm-500 hover:bg-white/50 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-warm-600 min-w-[80px] text-center">
              {getDateLabel()}
            </span>
            <button
              onClick={handleNext}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-warm-500 hover:bg-white/50 transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="px-5 py-3 space-y-2 max-h-[300px] overflow-y-auto">
        {dayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-3">
              <Calendar className="w-6 h-6 text-warm-400" />
            </div>
            <p className="text-sm text-warm-500">No events scheduled</p>
          </div>
        ) : (
          dayEvents.map((event) => {
            const config = getEventTypeConfig(event.event_type);
            return (
              <div
                key={event.id}
                className="
                  flex items-start gap-3 p-3 rounded-[12px]
                  bg-white/40 backdrop-blur-[4px]
                  border border-white/20
                  hover:bg-white/60 hover:border-white/30
                  transition-all duration-200
                  cursor-pointer
                "
              >
                {/* Time + Type Dot */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                  <div className="text-xs font-semibold text-warm-900">
                    {format(new Date(event.start_time), 'h:mm')}
                  </div>
                  <div className="text-[10px] text-warm-400">
                    {format(new Date(event.start_time), 'a')}
                  </div>
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      config.borderColor.replace('border-l-', 'bg-')
                    )}
                  />
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-warm-900 line-clamp-1">
                    {event.title}
                  </div>
                  {event.location && (
                    <div className="text-xs text-warm-500 mt-0.5 line-clamp-1">
                      {event.location}
                    </div>
                  )}
                  <div
                    className={cn(
                      'inline-block px-1.5 py-0.5 rounded-md mt-1',
                      'text-[10px] font-medium',
                      config.bgColor,
                      config.textColor
                    )}
                  >
                    {config.label}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* View Full Calendar Link */}
      <div className="px-5 py-3 border-t border-white/30 bg-white/20">
        <Link
          href={calendarUrl}
          className="
            flex items-center justify-center gap-1
            text-sm font-medium text-primary-600
            hover:text-primary-700
            transition-colors duration-200
          "
        >
          View Full Calendar
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
