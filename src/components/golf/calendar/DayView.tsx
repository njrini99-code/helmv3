'use client';

import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PremiumEventBlock } from './PremiumEventBlock';
import { calculateEventTop, calculateEventHeight, isToday } from '@/lib/calendar/event-styles';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

export interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  isDraggable?: boolean;
}

// Droppable time slot component for DayView with premium styling
function DroppableTimeSlot({ date, hour }: { date: Date; hour: number }) {
  const droppableId = `day-${date.toISOString().split('T')[0]}-${hour}`;

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'timeSlot',
      date: date.toISOString().split('T')[0],
      hour,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-16 relative transition-all duration-200',
        'border-l border-t border-stone-100/30',
        'hover:bg-white/20',
        isOver && 'bg-emerald-100/40 border-emerald-300/50'
      )}
    >
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/40" />
      )}
    </div>
  );
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

export function DayView({ date, events, onEventClick, isDraggable = false }: DayViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const dayEvents = events.filter((event) => {
    const eventDate = new Date(event.start_date);
    return (
      eventDate.getDate() === date.getDate() &&
      eventDate.getMonth() === date.getMonth() &&
      eventDate.getFullYear() === date.getFullYear()
    );
  });

  const getCurrentTimePosition = () => {
    const hour = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    if (hour < 6 || hour >= 22) return null;

    const hoursFromStart = hour - 6;
    const minuteOffset = (minutes / 60) * 64;
    return hoursFromStart * 64 + minuteOffset;
  };

  const currentTimeTop = getCurrentTimePosition();
  const isCurrentDay = isToday(date.toISOString());

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="relative">
          <div className="grid grid-cols-[80px_1fr]">
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                {/* Time label column */}
                <div className="
                  h-16
                  border-r border-stone-100/20
                  flex items-start justify-end pr-4 pt-1

                  /* Gradient fade from left edge */
                  bg-gradient-to-r from-stone-50/40 to-transparent
                ">
                  <span className="text-[11px] font-medium text-stone-400">
                    {hour === 0
                      ? '12 AM'
                      : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                      ? '12 PM'
                      : `${hour - 12} PM`}
                  </span>
                </div>

                {isDraggable ? (
                  <DroppableTimeSlot date={date} hour={hour} />
                ) : (
                  <div className="
                    h-16 relative
                    border-l border-t border-stone-100/30
                    hover:bg-white/30
                    transition-colors duration-150
                  " />
                )}
              </div>
            ))}
          </div>

          {/* Events overlay */}
          <div className="absolute inset-0 pointer-events-none grid grid-cols-[80px_1fr]">
            <div />
            <div className="relative pointer-events-none">
              {dayEvents.map((event) => {
                const top = calculateEventTop(event.start_date, 6);
                const height = calculateEventHeight(event.start_date, event.end_date);

                return (
                  <div
                    key={event.id}
                    className="absolute left-2 right-2 pointer-events-auto"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                    }}
                  >
                    <PremiumEventBlock
                      event={{
                        id: event.id,
                        title: event.title,
                        event_type: event.event_type,
                        status: event.status || 'confirmed',
                        start_time: event.start_time,
                        end_time: event.end_time,
                        location: event.location,
                        rsvp_confirmed_count: event.rsvp_confirmed_count,
                        rsvp_total_count: event.rsvp_total_count,
                        is_recurring: event.is_recurring,
                      }}
                      onClick={() => onEventClick?.(event)}
                      compact={height < 80}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Time Indicator - Premium red line with dot and glow */}
          {currentTimeTop !== null && isCurrentDay && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: `${currentTimeTop}px`,
                left: '80px',
                right: 0,
              }}
            >
              <div className="flex items-center -ml-1.5">
                {/* Red dot with white border */}
                <div className="
                  w-3 h-3
                  rounded-full
                  bg-red-500
                  border-2 border-white
                  shadow-lg shadow-red-500/50
                  flex-shrink-0
                " />
                {/* Red line */}
                <div className="
                  h-0.5
                  bg-red-500
                  flex-1
                  shadow-sm
                " />
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {dayEvents.length === 0 && (
          <div className="mt-16 text-center">
            <div className="
              w-16 h-16 rounded-[16px]
              bg-stone-100/80
              mx-auto
              flex items-center justify-center
              mb-4
            ">
              <Calendar className="w-7 h-7 text-stone-400" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">
              No events scheduled
            </h3>
            <p className="text-sm text-stone-500 max-w-xs mx-auto">
              Click &ldquo;Add Event&rdquo; to schedule something for this day
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
