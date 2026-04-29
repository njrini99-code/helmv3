'use client';

import { useDroppable } from '@dnd-kit/core';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isToday } from '@/lib/calendar/event-styles';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { PremiumEventBlock } from './PremiumEventBlock';

export interface MonthBusyPeriod {
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  playerId?: string;
  color?: { bg: string; light: string; border: string; name: string };
}

interface MonthViewProps {
  month: Date;
  events: CalendarEvent[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  isDraggable?: boolean;
  /**
   * Multi-player busy periods (already color-tagged upstream by
   * PremiumCalendarClient). Surfaced as a row of colored dots at the bottom
   * of each day cell so coaches can scan a month for shared busy days.
   */
  playerBusyPeriods?: MonthBusyPeriod[];
}

interface PlayerBusyDot {
  playerId: string;
  bg: string;
}

// Shared day cell content renderer
function DayCellContent({
  date,
  isCurrentMonth,
  isCurrentDay,
  dayEvents,
  busyDots,
  onEventClick,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isCurrentDay: boolean;
  dayEvents: CalendarEvent[];
  busyDots?: PlayerBusyDot[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  return (
    <>
      {/* Date Number */}
      <div className="flex items-center justify-between mb-1.5">
        <div
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-medium transition-all',
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
            className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-primary-600/[0.08] text-primary-600/70"
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
                all_day: event.all_day,
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

      {/* Player availability dots — one per selected player who is busy this day */}
      {busyDots && busyDots.length > 0 && (
        <div
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 flex items-center gap-1"
        >
          {busyDots.slice(0, 5).map((dot) => (
            <span
              key={dot.playerId}
              className="w-1.5 h-1.5 rounded-full ring-1 ring-white/80"
              style={{ background: dot.bg }}
            />
          ))}
          {busyDots.length > 5 && (
            <span className="text-[10px] font-medium text-warm-500 ml-0.5 tabular-nums">
              +{busyDots.length - 5}
            </span>
          )}
        </div>
      )}
    </>
  );
}

// Droppable day cell component for drag-and-drop
function DroppableDayCell({
  date,
  isCurrentMonth,
  isCurrentDay,
  dayEvents,
  busyDots,
  onDateClick,
  onEventClick,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isCurrentDay: boolean;
  dayEvents: CalendarEvent[];
  busyDots?: PlayerBusyDot[];
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
        isCurrentMonth ? 'bg-cream-100/68' : 'bg-warm-50/30',
        'hover:bg-cream-100/82 active:bg-cream-50/92 hover:shadow-sm',
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
        busyDots={busyDots}
        onEventClick={onEventClick}
      />
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({ month, events, onDateClick, onEventClick, isDraggable = false, playerBusyPeriods = [] }: MonthViewProps) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const days: Date[] = [];
  const current = new Date(startDate);

  // Dynamically calculate 35 vs 42 days — only use 6 rows if last day of month needs it
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const lastDayOfGrid = new Date(startDate);
  lastDayOfGrid.setDate(lastDayOfGrid.getDate() + 34); // 35 days = 5 rows
  const needsSixRows = lastDay > lastDayOfGrid;
  const totalDays = needsSixRows ? 42 : 35;

  while (days.length < totalDays) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const getEventsForDate = (date: Date) => {
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return events.filter((event) => {
      const eventStart = new Date(event.start_date);
      const normalizedStart = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate()).getTime();
      const eventEnd = event.end_date ? new Date(event.end_date) : eventStart;
      const normalizedEnd = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate()).getTime();
      return checkDate >= normalizedStart && checkDate <= normalizedEnd;
    });
  };

  // Pre-bucket player busy periods by YYYY-MM-DD so each cell renders in O(1).
  // Inside a bucket we deduplicate by playerId so two classes on the same day
  // collapse to one dot.
  const dotsByDay = (() => {
    const map = new Map<string, Map<string, PlayerBusyDot>>();
    for (const period of playerBusyPeriods) {
      if (!period.color || !period.playerId) continue;
      const start = new Date(period.start);
      const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
      if (!map.has(key)) map.set(key, new Map());
      const dayMap = map.get(key)!;
      if (!dayMap.has(period.playerId)) {
        dayMap.set(period.playerId, { playerId: period.playerId, bg: period.color.bg });
      }
    }
    return map;
  })();
  const dotsForDate = (date: Date): PlayerBusyDot[] => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const dayMap = dotsByDay.get(key);
    return dayMap ? Array.from(dayMap.values()) : [];
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
            className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.1em] rounded-lg text-warm-500/70"
          >
            {day}
          </div>
        ))}

        {/* Calendar Days — rounded container cells */}
        {days.map((date, index) => {
          const dayEvents = getEventsForDate(date);
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const isCurrentDay = isToday(date.toISOString());

          const busyDots = dotsForDate(date);
          return isDraggable ? (
            <DroppableDayCell
              key={index}
              date={date}
              isCurrentMonth={isCurrentMonth}
              isCurrentDay={isCurrentDay}
              dayEvents={dayEvents}
              busyDots={busyDots}
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
                'min-h-[110px] p-2.5 cursor-pointer transition-all duration-200 rounded-xl relative',
                isCurrentMonth ? 'bg-cream-100/68' : 'bg-warm-50/30',
                'hover:bg-cream-100/82 active:bg-cream-50/92 hover:shadow-sm',
                isCurrentDay && 'bg-primary-50/40 ring-1 ring-primary-200/40'
              )}
            >
              <DayCellContent
                date={date}
                isCurrentMonth={isCurrentMonth}
                isCurrentDay={isCurrentDay}
                dayEvents={dayEvents}
                busyDots={busyDots}
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
          <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">
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
