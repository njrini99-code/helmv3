'use client';

import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { PremiumEventBlock } from './PremiumEventBlock';
import { calculateEventTop, calculateEventHeight, isToday } from '@/lib/calendar/event-styles';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

export interface BusyPeriod {
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  title?: string;
  // Multi-player color support
  color?: {
    bg: string;
    light: string;
    border: string;
    name: string;
  };
  playerId?: string;
}

export interface WeekViewProps {
  weekStart: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  isDraggable?: boolean;
  playerBusyPeriods?: BusyPeriod[];
  selectedPlayerName?: string;
}

// Droppable time slot component with premium styling
function DroppableTimeSlot({
  date,
  hour,
  isCurrentDay,
  isEvenHour,
}: {
  date: Date;
  hour: number;
  isCurrentDay: boolean;
  isEvenHour: boolean;
}) {
  const droppableId = `${date.toISOString().split('T')[0]}-${hour}`;

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
        // Subtle alternating row tint instead of hard borders
        isEvenHour ? 'bg-white/30' : 'bg-stone-50/20',
        isCurrentDay && 'bg-green-50/25',
        'hover:bg-white/50',
        isOver && 'bg-green-100/50'
      )}
      style={{
        // Soft bottom border only (no left border - column gaps handle separation)
        borderBottom: '1px solid rgba(214, 211, 209, 0.12)',
      }}
    >
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-green-400 rounded-lg bg-green-50/40" />
      )}
    </div>
  );
}

interface LayoutEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

/**
 * Extract total minutes from midnight from a date/time string.
 * Handles both time-only ("HH:MM:SS") and full ISO datetime strings.
 */
function getMinutesFromMidnight(timeString: string): number {
  if (timeString && !timeString.includes('T') && !timeString.includes(' ')) {
    const parts = timeString.split(':').map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }
  const d = new Date(timeString);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Lay out overlapping events into side-by-side columns (Google Calendar style).
 */
function layoutOverlappingEvents(events: CalendarEvent[]): LayoutEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => getMinutesFromMidnight(a.start_date) - getMinutesFromMidnight(b.start_date)
  );

  const columns: CalendarEvent[][] = [];
  const result: LayoutEvent[] = [];

  for (const event of sorted) {
    const startMin = getMinutesFromMidnight(event.start_date);
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const colEvents = columns[col];
      if (!colEvents || colEvents.length === 0) continue;
      const lastInCol = colEvents[colEvents.length - 1];
      if (!lastInCol) continue;
      const lastStart = getMinutesFromMidnight(lastInCol.start_date);
      const lastEndRaw = lastInCol.end_date
        ? getMinutesFromMidnight(lastInCol.end_date)
        : lastStart + 60;
      const lastEnd = lastEndRaw > lastStart ? lastEndRaw : lastStart + 60;

      if (startMin >= lastEnd) {
        colEvents.push(event);
        result.push({ event, column: col, totalColumns: 0 });
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push([event]);
      result.push({ event, column: columns.length - 1, totalColumns: 0 });
    }
  }

  // Determine totalColumns for each event based on its overlapping group
  for (const item of result) {
    const startMin = getMinutesFromMidnight(item.event.start_date);
    const endMinRaw = item.event.end_date
      ? getMinutesFromMidnight(item.event.end_date)
      : startMin + 60;
    const endMin = endMinRaw > startMin ? endMinRaw : startMin + 60;

    let maxCol = item.column;
    for (const other of result) {
      const otherStart = getMinutesFromMidnight(other.event.start_date);
      const otherEndRaw = other.event.end_date
        ? getMinutesFromMidnight(other.event.end_date)
        : otherStart + 60;
      const otherEnd = otherEndRaw > otherStart ? otherEndRaw : otherStart + 60;

      if (startMin < otherEnd && endMin > otherStart) {
        maxCol = Math.max(maxCol, other.column);
      }
    }
    item.totalColumns = maxCol + 1;
  }

  return result;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekView({ 
  weekStart, 
  events, 
  onEventClick, 
  isDraggable = false,
  playerBusyPeriods = [],
  selectedPlayerName,
}: WeekViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  const eventsByDay = weekDates.map((date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_date);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  });

  // Pre-compute overlap layout for each day's events
  const layoutByDay = eventsByDay.map((dayEvents) => layoutOverlappingEvents(dayEvents));

  // Group player busy periods by day for overlay rendering
  const busyPeriodsByDay = weekDates.map((date) => {
    return playerBusyPeriods.filter((period) => {
      const periodDate = new Date(period.start);
      return (
        periodDate.getDate() === date.getDate() &&
        periodDate.getMonth() === date.getMonth() &&
        periodDate.getFullYear() === date.getFullYear()
      );
    });
  });

  // Calculate busy period positioning
  const calculateBusyPeriodTop = (startTime: string) => {
    const date = new Date(startTime);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const hoursFromStart = hours - 6; // HOURS starts at 6
    if (hoursFromStart < 0) return 0;
    return hoursFromStart * 64 + (minutes / 60) * 64;
  };

  const calculateBusyPeriodHeight = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    return (durationMinutes / 60) * 64;
  };

  const getCurrentTimePosition = () => {
    const hour = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    if (hour < 6 || hour >= 22) return null;

    const hoursFromStart = hour - 6;
    const minuteOffset = (minutes / 60) * 64;
    return hoursFromStart * 64 + minuteOffset;
  };

  const currentTimeTop = getCurrentTimePosition();
  const todayIndex = weekDates.findIndex((date) => isToday(date.toISOString()));

  return (
    <div
      className="flex-1 overflow-auto overscroll-contain touch-pan-y"
      style={{ WebkitOverflowScrolling: 'touch', background: 'transparent' }}
      data-scroll-container
    >
      <div className="min-w-[800px] px-3 md:px-5 pt-2" style={{ background: 'transparent' }}>
        {/* Header row - Day names and dates */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '56px repeat(7, 1fr)',
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(255, 254, 250, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(214, 211, 209, 0.15)',
            gap: '2px',
          }}
        >
          <div className="h-16" />
          {weekDates.map((date, index) => {
            const isCurrentDay = index === todayIndex;
            const dayName = DAYS[date.getDay()];
            const dayNum = date.getDate();

            return (
              <div
                key={index}
                className={cn(
                  'h-16 flex flex-col items-center justify-center rounded-t-xl',
                  isCurrentDay && 'bg-green-50/40'
                )}
              >
                <p className={cn(
                  'text-[11px] font-semibold uppercase tracking-wider',
                  isCurrentDay ? 'text-green-600' : 'text-stone-400'
                )}>
                  {dayName}
                </p>
                <div
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold mt-0.5 transition-all',
                    isCurrentDay
                      ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.4)]'
                      : 'text-stone-800'
                  )}
                >
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid — container-based with subtle gaps */}
        <div className="relative">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '56px repeat(7, 1fr)',
              gap: '0 2px',
            }}
          >
            {HOURS.map((hour) => {
              const isEvenHour = hour % 2 === 0;
              return (
                <div key={hour} className="contents">
                  {/* Time label column — clean typography */}
                  <div
                    className="h-16 flex items-start justify-end pr-3 pt-1 select-none"
                    style={{
                      borderBottom: '1px solid rgba(214, 211, 209, 0.08)',
                    }}
                  >
                    <span className="text-[11px] font-medium text-stone-350 tabular-nums" style={{ color: 'rgba(120, 113, 108, 0.7)' }}>
                      {hour === 0
                        ? '12 AM'
                        : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                        ? '12 PM'
                        : `${hour - 12} PM`}
                    </span>
                  </div>

                  {/* Day columns — soft container cells */}
                  {weekDates.map((date, dayIndex) => {
                    const isCurrentDay = dayIndex === todayIndex;

                    return isDraggable ? (
                      <DroppableTimeSlot
                        key={dayIndex}
                        date={date}
                        hour={hour}
                        isCurrentDay={isCurrentDay}
                        isEvenHour={isEvenHour}
                      />
                    ) : (
                      <div
                        key={dayIndex}
                        className={cn(
                          'h-16 relative',
                          'transition-colors duration-150',
                          // Subtle alternating row tint
                          isEvenHour ? 'bg-white/30' : 'bg-stone-50/20',
                          isCurrentDay && 'bg-green-50/25',
                          'hover:bg-white/50',
                        )}
                        style={{
                          borderBottom: '1px solid rgba(214, 211, 209, 0.12)',
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Player Busy Periods overlay (classes, blocked time) - supports multi-player colors */}
          {playerBusyPeriods.length > 0 && (
            <div className="absolute inset-0 pointer-events-none" style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', gap: '0 2px' }}>
              <div />
              {busyPeriodsByDay.map((dayPeriods, dayIndex) => (
                <div key={dayIndex} className="relative pointer-events-none">
                  {dayPeriods.map((period, periodIndex) => {
                    const top = calculateBusyPeriodTop(period.start);
                    const height = calculateBusyPeriodHeight(period.start, period.end);
                    const isClass = period.type === 'class';

                    // Use player-specific color if available, otherwise fall back to defaults
                    const hasColor = !!period.color;
                    const bgColor = hasColor
                      ? period.color!.light
                      : isClass
                        ? 'repeating-linear-gradient(45deg, rgba(244, 63, 94, 0.08), rgba(244, 63, 94, 0.08) 8px, rgba(244, 63, 94, 0.04) 8px, rgba(244, 63, 94, 0.04) 16px)'
                        : 'rgba(251, 146, 60, 0.12)';
                    const borderColor = hasColor
                      ? period.color!.bg
                      : isClass ? 'rgb(244, 63, 94)' : 'rgb(251, 146, 60)';
                    const textColor = hasColor
                      ? period.color!.bg
                      : isClass ? 'rgb(244, 63, 94)' : 'rgb(251, 146, 60)';

                    return (
                      <div
                        key={periodIndex}
                        className="absolute left-0.5 right-0.5 rounded-lg border-l-2 overflow-hidden"
                        style={{
                          top: `${top}px`,
                          height: `${Math.max(height, 24)}px`,
                          background: bgColor,
                          borderColor: borderColor,
                        }}
                      >
                        <div className="px-2 py-1 h-full">
                          <p
                            className="text-[10px] font-medium truncate"
                            style={{ color: textColor }}
                          >
                            {period.title || (isClass ? 'Class' : 'Busy')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Events overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', gap: '0 2px' }}>
            <div />
            {layoutByDay.map((dayLayout, dayIndex) => (
              <div key={dayIndex} className="relative pointer-events-none">
                {dayLayout.map((item) => {
                  const top = calculateEventTop(item.event.start_date, 6);
                  const height = calculateEventHeight(item.event.start_date, item.event.end_date);
                  const widthPercent = (1 / item.totalColumns) * 100;
                  const leftPercent = (item.column / item.totalColumns) * 100;

                  return (
                    <div
                      key={item.event.id}
                      className="absolute pointer-events-auto"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `calc(${leftPercent}% + 2px)`,
                        width: `calc(${widthPercent}% - 4px)`,
                      }}
                    >
                      <PremiumEventBlock
                        event={{
                          id: item.event.id,
                          title: item.event.title,
                          event_type: item.event.event_type,
                          status: item.event.status || 'scheduled',
                          start_time: item.event.start_time,
                          end_time: item.event.end_time,
                          location: item.event.location,
                          recurring: item.event.recurring,
                        }}
                        onClick={() => onEventClick?.(item.event)}
                        compact={height < 80}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Selected player indicator */}
          {selectedPlayerName && (
            <div
              className="absolute top-3 left-16 z-20 px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(22, 163, 74, 0.2)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <p className="text-xs font-medium text-green-700">
                Viewing {selectedPlayerName}&apos;s schedule
              </p>
            </div>
          )}

          {/* Current Time Indicator — brand green line with glowing dot */}
          {currentTimeTop !== null && todayIndex >= 0 && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: `${currentTimeTop}px`,
                // Adjust for new 56px gutter + 2px gaps
                left: `calc(56px + ${todayIndex} * ((100% - 56px - 12px) / 7) + ${todayIndex} * 2px)`,
                width: `calc((100% - 56px - 12px) / 7)`,
              }}
            >
              <div className="flex items-center -ml-1.5">
                {/* Green dot with white border */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    background: '#16a34a',
                    border: '2px solid white',
                    boxShadow: '0 0 8px rgba(22, 163, 74, 0.5), 0 2px 4px rgba(0,0,0,0.1)',
                  }}
                />
                {/* Green line */}
                <div
                  className="h-[2px] flex-1"
                  style={{
                    background: 'linear-gradient(90deg, #16a34a, rgba(22, 163, 74, 0.4))',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
