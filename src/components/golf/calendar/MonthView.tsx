'use client';

import { useDroppable } from '@dnd-kit/core';
import { Calendar } from 'lucide-react';
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

// Shared day cell content renderer
function DayCellContent({
  date,
  isCurrentMonth,
  isCurrentDay,
  dayEvents,
  onEventClick,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isCurrentDay: boolean;
  dayEvents: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  return (
    <>
      {/* Date Number */}
      <div className="flex items-center justify-between mb-1.5">
        <div
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-bold transition-all',
            isCurrentDay
              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.4)]'
              : isCurrentMonth
              ? 'text-warm-800'
              : 'text-warm-350'
          )}
          style={!isCurrentDay && !isCurrentMonth ? { color: 'rgb(168 162 158 / 0.6)' } : undefined}
        >
          {date.getDate()}
        </div>
        {/* Event count badge for days with many events */}
        {dayEvents.length > 3 && (
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-primary-600/[0.08] text-primary-600/70"
          >
            {dayEvents.length}
          </span>
        )}
      </div>

      {/* Event Previews (max 3) */}
      <div className="space-y-0.5">
        {dayEvents.slice(0, 3).map((event) => (
          <div
            key={event.id}
            role="button"
            tabIndex={0}
            aria-label={`${event.title}${event.start_time ? `, ${event.start_time}` : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick?.(event);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onEventClick?.(event);
              }
            }}
          >
            <PremiumEventBlock
              event={{
                id: event.id,
                title: event.title,
                event_type: event.event_type,
                status: event.status || 'scheduled',
                start_time: event.start_time,
                end_time: event.end_time,
                location: event.location,
                recurring: event.recurring,
              }}
              compact={true}
            />
          </div>
        ))}

        {/* +N more indicator */}
        {dayEvents.length > 3 && (
          <p className="text-xs text-warm-400 pl-2.5 font-medium">
            +{dayEvents.length - 3} more
          </p>
        )}
      </div>
    </>
  );
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

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'timeSlot',
      date: date.toISOString().split('T')[0],
      hour: 9,
    },
  });

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={`${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : ''}`}
      onClick={() => onDateClick?.(date)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onDateClick?.(date);
        }
      }}
      className={cn(
        'min-h-[110px] p-2.5 cursor-pointer transition-all duration-200 relative rounded-xl',
        isCurrentMonth ? 'bg-white/60' : 'bg-warm-50/30',
        'hover:bg-white/80 hover:shadow-sm',
        isCurrentDay && 'bg-primary-50/40 ring-1 ring-primary-200/40',
        isOver && 'bg-primary-100/60 ring-2 ring-primary-400'
      )}
    >
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-primary-400 rounded-lg bg-primary-50/40 pointer-events-none" aria-hidden="true" />
      )}
      <DayCellContent
        date={date}
        isCurrentMonth={isCurrentMonth}
        isCurrentDay={isCurrentDay}
        dayEvents={dayEvents}
        onEventClick={onEventClick}
      />
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
    <div className="flex-1 overflow-auto px-4 md:px-5 pt-2 pb-4 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]" data-scroll-container>
      {/* Container-based grid with soft gaps instead of hard lines */}
      <div
        className="grid grid-cols-7 gap-[3px]"
      >
        {/* Day Headers */}
        {DAYS.map((day) => (
          <div
            key={day}
            className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider rounded-lg text-warm-500/60"
          >
            {day}
          </div>
        ))}

        {/* Calendar Days — rounded container cells */}
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
              role="button"
              tabIndex={0}
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : ''}`}
              onClick={() => onDateClick?.(date)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDateClick?.(date);
                }
              }}
              className={cn(
                'min-h-[110px] p-2.5 cursor-pointer transition-all duration-200 rounded-xl',
                isCurrentMonth ? 'bg-white/60' : 'bg-warm-50/30',
                'hover:bg-white/80 hover:shadow-sm',
                isCurrentDay && 'bg-primary-50/40 ring-1 ring-primary-200/40'
              )}
            >
              <DayCellContent
                date={date}
                isCurrentMonth={isCurrentMonth}
                isCurrentDay={isCurrentDay}
                dayEvents={dayEvents}
                onEventClick={onEventClick}
              />
            </div>
          );
        })}
      </div>

      {/* Empty state for no events this month */}
      {events.length === 0 && (
        <div className="mt-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-warm-100/80 mx-auto flex items-center justify-center mb-4">
            <Calendar className="w-7 h-7 text-warm-400" />
          </div>
          <h3 className="text-lg font-semibold text-warm-900 mb-2">
            No events this month
          </h3>
          <p className="text-sm text-warm-500 max-w-xs mx-auto">
            Click &ldquo;Add Event&rdquo; or tap a date to schedule something
          </p>
        </div>
      )}
    </div>
  );
}
