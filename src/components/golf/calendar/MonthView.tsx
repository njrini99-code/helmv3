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
              ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.4)]'
              : isCurrentMonth
              ? 'text-stone-800'
              : 'text-stone-350'
          )}
          style={!isCurrentDay && !isCurrentMonth ? { color: 'rgba(168, 162, 158, 0.6)' } : undefined}
        >
          {date.getDate()}
        </div>
        {/* Event count badge for days with many events */}
        {dayEvents.length > 3 && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: 'rgba(22, 163, 74, 0.08)',
              color: 'rgba(22, 163, 74, 0.7)',
            }}
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
          <p className="text-[10px] text-stone-400 pl-2.5 font-medium">
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
      onClick={() => onDateClick?.(date)}
      className={cn(
        'min-h-[110px] p-2.5 cursor-pointer transition-all duration-200 relative rounded-xl',
        isCurrentMonth ? 'bg-white/60' : 'bg-stone-50/30',
        'hover:bg-white/80 hover:shadow-sm',
        isCurrentDay && 'bg-green-50/40 ring-1 ring-green-200/40',
        isOver && 'bg-green-100/60 ring-2 ring-green-400'
      )}
    >
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-green-400 rounded-lg bg-green-50/40 pointer-events-none" />
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
    <div className="flex-1 overflow-auto px-4 md:px-5 pt-2 pb-4 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
      {/* Container-based grid with soft gaps instead of hard lines */}
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
            className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider rounded-lg"
            style={{ color: 'rgba(120, 113, 108, 0.6)' }}
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
              onClick={() => onDateClick?.(date)}
              className={cn(
                'min-h-[110px] p-2.5 cursor-pointer transition-all duration-200 rounded-xl',
                isCurrentMonth ? 'bg-white/60' : 'bg-stone-50/30',
                'hover:bg-white/80 hover:shadow-sm',
                isCurrentDay && 'bg-green-50/40 ring-1 ring-green-200/40'
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
    </div>
  );
}
