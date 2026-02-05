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
}: {
  date: Date;
  hour: number;
  isCurrentDay: boolean;
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
        'border-l border-t border-stone-100/30',
        'hover:bg-white/20',
        isCurrentDay && 'bg-emerald-50/20',
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
      <div className="min-w-[800px]" style={{ background: 'transparent' }}>
        {/* Header row - Day names and dates */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px repeat(7, 1fr)',
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(214, 211, 209, 0.3)',
          }}
        >
          <div className="h-14" />
          {weekDates.map((date, index) => {
            const isCurrentDay = index === todayIndex;
            const dayName = DAYS[date.getDay()];
            const dayNum = date.getDate();

            return (
              <div
                key={index}
                className={cn(
                  'h-14 flex flex-col items-center justify-center border-l border-stone-100/30',
                  isCurrentDay && 'bg-emerald-50/30'
                )}
              >
                <p className={cn(
                  'text-xs font-medium uppercase tracking-wide',
                  isCurrentDay ? 'text-emerald-700' : 'text-stone-500'
                )}>
                  {dayName}
                </p>
                <div
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold mt-0.5 transition-all',
                    isCurrentDay
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.3)]'
                      : 'text-stone-900'
                  )}
                >
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative">
          <div className="grid grid-cols-[64px_repeat(7,1fr)]">
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                {/* Time label column */}
                <div
                  style={{
                    height: '64px',
                    borderRight: '1px solid rgba(231, 229, 228, 0.2)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    paddingRight: '12px',
                    paddingTop: '4px',
                    background: 'linear-gradient(to right, rgba(250, 250, 249, 0.4), transparent)',
                  }}
                >
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

                {/* Day columns */}
                {weekDates.map((date, dayIndex) => {
                  const isCurrentDay = dayIndex === todayIndex;

                  return isDraggable ? (
                    <DroppableTimeSlot
                      key={dayIndex}
                      date={date}
                      hour={hour}
                      isCurrentDay={isCurrentDay}
                    />
                  ) : (
                    <div
                      key={dayIndex}
                      className={cn(
                        'h-16 relative',
                        'border-l border-t border-stone-100/30',
                        'hover:bg-white/30',
                        'transition-colors duration-150',
                        isCurrentDay && 'bg-emerald-50/20'
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Player Busy Periods overlay (classes, blocked time) - supports multi-player colors */}
          {playerBusyPeriods.length > 0 && (
            <div className="absolute inset-0 pointer-events-none grid grid-cols-[64px_repeat(7,1fr)]">
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
          <div className="absolute inset-0 pointer-events-none grid grid-cols-[64px_repeat(7,1fr)]">
            <div />
            {eventsByDay.map((dayEvents, dayIndex) => (
              <div key={dayIndex} className="relative pointer-events-none">
                {dayEvents.map((event) => {
                  const top = calculateEventTop(event.start_date, 6);
                  const height = calculateEventHeight(event.start_date, event.end_date);

                  return (
                    <div
                      key={event.id}
                      className="absolute left-1 right-1 pointer-events-auto"
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
            ))}
          </div>

          {/* Selected player indicator */}
          {selectedPlayerName && (
            <div className="absolute top-2 left-20 z-20 px-3 py-1.5 rounded-full bg-rose-100/90 backdrop-blur-sm border border-rose-200">
              <p className="text-xs font-medium text-rose-700">
                Viewing {selectedPlayerName}&apos;s schedule
              </p>
            </div>
          )}

          {/* Current Time Indicator - Premium red line with dot and glow */}
          {currentTimeTop !== null && todayIndex >= 0 && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: `${currentTimeTop}px`,
                left: `calc(64px + ${todayIndex} * (100% - 64px) / 7)`,
                width: `calc((100% - 64px) / 7)`,
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
      </div>
    </div>
  );
}
