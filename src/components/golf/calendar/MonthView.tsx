'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { isToday } from '@/lib/calendar/event-styles';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { PremiumEventBlock } from './PremiumEventBlock';

export interface MonthViewProps {
  month: Date;
  events: CalendarEvent[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  isDraggable?: boolean;
}

// Droppable day cell component for drag-and-drop
function DroppableDayCell({
  date,
  isCurrentMonth,
  isCurrentDay,
  dayEvents,
  onDateClick,
  onEventClick,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isCurrentDay: boolean;
  dayEvents: CalendarEvent[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const droppableId = `month-${date.toISOString().split('T')[0]}`;
  const dateNum = date.getDate();

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'timeSlot',
      date: date.toISOString().split('T')[0],
      hour: 9, // Default to 9am for month view drops
    },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDateClick?.(date)}
      className={cn(
        'bg-white/80 min-h-[120px] p-3 cursor-pointer transition-all duration-200 relative',
        'hover:bg-white hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]',
        !isCurrentMonth && 'bg-stone-50/50',
        isCurrentDay && 'bg-emerald-50/40',
        isOver && 'bg-emerald-100/60 ring-2 ring-emerald-400 ring-inset'
      )}
    >
      {/* Drop indicator */}
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-50/40 pointer-events-none" />
      )}

      {/* Date Number */}
      <div className="flex items-center justify-between mb-2">
        <div
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition-all',
            isCurrentDay
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.3)]'
              : isCurrentMonth
              ? 'text-stone-900'
              : 'text-stone-400'
          )}
        >
          {dateNum}
        </div>
      </div>

      {/* Event Previews (max 3) */}
      <div className="space-y-1">
        {dayEvents.slice(0, 3).map((event) => {
          return (
            <div
              key={event.id}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event);
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
                compact={true}
              />
            </div>
          );
        })}

        {/* +N more indicator */}
        {dayEvents.length > 3 && (
          <p className="text-[11px] text-stone-500 pl-2 font-medium">
            +{dayEvents.length - 3} more
          </p>
        )}
      </div>
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({ month, events, onDateClick, onEventClick, isDraggable = false }: MonthViewProps) {
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
    <div className="flex-1 overflow-auto p-5 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
      <div className="
        grid grid-cols-7 gap-px
        bg-stone-200/60
        border border-stone-200/60
        rounded-[16px]
        overflow-hidden
        shadow-[0_2px_8px_rgba(0,0,0,0.04)]
      ">
        {/* Day Headers */}
        {DAYS.map((day) => (
          <div
            key={day}
            className="
              bg-stone-50/80 backdrop-blur-sm
              px-4 py-3
              text-center text-xs font-semibold text-stone-500 uppercase tracking-wide
            "
          >
            {day}
          </div>
        ))}

        {/* Calendar Days */}
        {days.map((date, index) => {
          const dayEvents = getEventsForDate(date);
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const isCurrentDay = isToday(date.toISOString());

          return isDraggable ? (
            <DroppableDayCell
              key={index}
              date={date}
              isCurrentMonth={isCurrentMonth}
              isCurrentDay={isCurrentDay}
              dayEvents={dayEvents}
              onDateClick={onDateClick}
              onEventClick={onEventClick}
            />
          ) : (
            <div
              key={index}
              onClick={() => onDateClick?.(date)}
              className={cn(
                'bg-white/80 min-h-[120px] p-3 cursor-pointer transition-all duration-200',
                'hover:bg-white hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]',
                !isCurrentMonth && 'bg-stone-50/50',
                isCurrentDay && 'bg-emerald-50/40'
              )}
            >
              {/* Date Number */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    'w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition-all',
                    isCurrentDay
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.3)]'
                      : isCurrentMonth
                      ? 'text-stone-900'
                      : 'text-stone-400'
                  )}
                >
                  {date.getDate()}
                </div>
              </div>

              {/* Event Previews (max 3) */}
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => {
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
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
                        compact={true}
                      />
                    </div>
                  );
                })}

                {/* +N more indicator */}
                {dayEvents.length > 3 && (
                  <p className="text-[11px] text-stone-500 pl-2 font-medium">
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
