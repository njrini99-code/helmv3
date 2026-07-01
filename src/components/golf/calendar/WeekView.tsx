'use client';

import { useEffect, useState, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Calendar } from 'lucide-react';
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

interface WeekViewProps {
  weekStart: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  isDraggable?: boolean;
  playerBusyPeriods?: BusyPeriod[];
  selectedPlayerName?: string;
  secondaryTimezone?: string | null;
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
        'border-b border-warm-200/[0.12]',
        // Subtle alternating row tint instead of hard borders
        isEvenHour ? 'bg-white/30' : 'bg-warm-50/20',
        isCurrentDay && 'bg-primary-50/25',
        'hover:bg-cream-100/60 active:bg-cream-100/75',
        isOver && 'bg-primary-100/50'
      )}
    >
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-primary-400 rounded-lg bg-primary-50/40" />
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

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22; // exclusive — 6AM to 10PM

/** Build dynamic hour range that extends to cover events outside default bounds */
function getHoursRange(events: CalendarEvent[]): number[] {
  let minHour = DEFAULT_START_HOUR;
  let maxHour = DEFAULT_END_HOUR;

  for (const event of events) {
    if (event.all_day) continue;
    const startMins = getMinutesFromMidnight(event.start_date);
    const endMins = event.end_date ? getMinutesFromMidnight(event.end_date) : startMins + 60;
    const startH = Math.floor(startMins / 60);
    const endH = Math.ceil(endMins / 60);
    if (startH < minHour) minHour = startH;
    if (endH > maxHour) maxHour = endH;
  }

  // Clamp to valid hour range
  minHour = Math.max(0, minHour);
  maxHour = Math.min(24, maxHour);

  return Array.from({ length: maxHour - minHour }, (_, i) => i + minHour);
}

/** Format a local hour (0-23) in a target timezone. Returns e.g. "3 PM" or "3p" */
function formatHourInTz(localHour: number, targetTz: string, compact = false): string {
  const now = new Date();
  now.setHours(localHour, 0, 0, 0);
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: targetTz,
    }).format(now);
    if (compact) {
      // "3 AM" -> "3a", "12 PM" -> "12p"
      return formatted.replace(/\s?(AM|PM)/, (_, m) => m[0]!.toLowerCase());
    }
    return formatted;
  } catch {
    return '';
  }
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekView({
  weekStart,
  events,
  onEventClick,
  isDraggable = false,
  playerBusyPeriods = [],
  selectedPlayerName,
  secondaryTimezone,
}: WeekViewProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  // Helper: check if a date falls within an event's date range
  const isDateInEventRange = (date: Date, event: CalendarEvent) => {
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const eventStart = new Date(event.start_date);
    const normalizedStart = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate()).getTime();
    const eventEnd = event.end_date ? new Date(event.end_date) : eventStart;
    const normalizedEnd = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate()).getTime();
    return checkDate >= normalizedStart && checkDate <= normalizedEnd;
  };

  // Separate all-day events from timed events
  const allDayEventsByDay = weekDates.map((date) => {
    return events.filter((event) => {
      if (!event.all_day) return false;
      return isDateInEventRange(date, event);
    });
  });

  const timedEventsByDay = weekDates.map((date) => {
    return events.filter((event) => {
      if (event.all_day) return false;
      return isDateInEventRange(date, event);
    });
  });

  const hasAllDayEvents = allDayEventsByDay.some((dayEvents) => dayEvents.length > 0);

  // Dynamic hour range based on timed events
  const allTimedEvents = timedEventsByDay.flat();
  const HOURS = getHoursRange(allTimedEvents);
  const gridStartHour = HOURS[0] ?? DEFAULT_START_HOUR;

  // Pre-compute overlap layout for each day's timed events (all-day excluded from grid)
  const layoutByDay = timedEventsByDay.map((dayEvents) => layoutOverlappingEvents(dayEvents));

  // Initialize currentTime on client only to avoid hydration mismatch
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to current time on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = new Date().getHours();
    const lastHour = HOURS[HOURS.length - 1] ?? DEFAULT_END_HOUR;
    if (hour >= gridStartHour && hour < lastHour) {
      const targetScroll = (hour - gridStartHour) * 64 - 64; // one row above current time
      el.scrollTop = Math.max(0, targetScroll);
    }
  }, [HOURS, gridStartHour]);

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
    const hoursFromStart = hours - gridStartHour;
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
    if (!currentTime) return null;
    const hour = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    const lastHour = HOURS[HOURS.length - 1] ?? DEFAULT_END_HOUR;
    if (hour < gridStartHour || hour >= lastHour) return null;

    const hoursFromStart = hour - gridStartHour;
    const minuteOffset = (minutes / 60) * 64;
    return hoursFromStart * 64 + minuteOffset;
  };

  const currentTimeTop = getCurrentTimePosition();
  const todayIndex = weekDates.findIndex((date) => isToday(date.toISOString()));

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
      data-scroll-container
    >
      {/* Desktop time-grid — hidden on <md (it requires an 800px min-width that
          forces an awkward horizontal scroll on phones). The <md companion is a
          vertical day-list rendered below. */}
      <div className="hidden md:block min-w-[800px] px-3 md:px-5 pt-2">
        {/* Header row - Day names and dates */}
        <div
          className={cn(
            // Near-opaque so scrolled time-axis labels (e.g. "11 AM") can't
            // bleed through the frozen day-of-week row behind it.
            'grid sticky top-0 z-20 bg-cream/95 backdrop-blur-xl border-b border-warm-200/[0.15] gap-0.5 shadow-[0_1px_0_rgba(255,255,255,0.6)]',
            secondaryTimezone ? 'grid-cols-[72px_repeat(7,1fr)]' : 'grid-cols-[56px_repeat(7,1fr)]'
          )}
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
                  isCurrentDay && 'bg-primary-50/40'
                )}
              >
                <p className={cn(
                  'text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80',
                  isCurrentDay ? 'text-primary-600' : 'text-warm-400'
                )}>
                  {dayName}
                </p>
                <div
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-full text-body-sm font-medium mt-0.5 transition-all',
                    isCurrentDay
                      ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.4)]'
                      : 'text-warm-800'
                  )}
                >
                  {dayNum}
                </div>
                {isCurrentDay && (
                  <span className="mt-0.5 text-eyebrow font-medium uppercase tracking-[0.1em] text-primary-600">
                    Today
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* All-day events header row */}
        {hasAllDayEvents && (
          <div
            className={cn(
              'grid sticky top-16 z-raised bg-cream/95 backdrop-blur-xl border-b border-warm-200/[0.15] gap-0.5',
              secondaryTimezone ? 'grid-cols-[72px_repeat(7,1fr)]' : 'grid-cols-[56px_repeat(7,1fr)]'
            )}
          >
            <div className="px-2 py-1.5 flex items-center justify-end">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary-50/70 ring-1 ring-primary-100/70 text-eyebrow font-medium uppercase tracking-[0.08em] text-primary-700">
                <span className="w-1 h-1 rounded-full bg-primary-500" aria-hidden="true" />
                All day
              </span>
            </div>
            {allDayEventsByDay.map((dayEvents, dayIndex) => (
              <div key={dayIndex} className="px-0.5 py-1 space-y-0.5 min-h-[32px]">
                {dayEvents.map((event) => (
                  <div key={event.id} className="pointer-events-auto">
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
                      onClick={() => onEventClick?.(event)}
                      compact={true}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Time grid — container-based with subtle gaps */}
        <div className="relative">
          <div
            className={cn(
              'grid gap-x-0.5',
              secondaryTimezone ? 'grid-cols-[72px_repeat(7,1fr)]' : 'grid-cols-[56px_repeat(7,1fr)]'
            )}
          >
            {HOURS.map((hour) => {
              const isEvenHour = hour % 2 === 0;
              return (
                <div key={hour} className="contents">
                  {/* Time label column — clean typography */}
                  <div
                    className="h-16 flex flex-col items-end justify-start pr-3 pt-1 select-none border-b border-warm-200/[0.08]"
                  >
                    <span className="text-xs font-medium tabular-nums text-warm-500/70">
                      {hour === 0
                        ? '12 AM'
                        : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                        ? '12 PM'
                        : `${hour - 12} PM`}
                    </span>
                    {secondaryTimezone && (
                      <span className="text-micro font-medium tabular-nums text-warm-400/50 mt-0.5">
                        {formatHourInTz(hour, secondaryTimezone)}
                      </span>
                    )}
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
                          'border-b border-warm-200/[0.12]',
                          isEvenHour ? 'bg-white/30' : 'bg-warm-50/20',
                          isCurrentDay && 'bg-primary-50/25',
                          'hover:bg-cream-100/60 active:bg-cream-100/75',
                        )}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Player Busy Periods overlay (classes, blocked time) - supports multi-player colors */}
          {playerBusyPeriods.length > 0 && (
            <div className={cn('absolute inset-0 pointer-events-none grid gap-x-0.5', secondaryTimezone ? 'grid-cols-[72px_repeat(7,1fr)]' : 'grid-cols-[56px_repeat(7,1fr)]')}>
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
                            className="text-xs font-medium truncate"
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
          <div className={cn('absolute inset-0 pointer-events-none grid gap-x-0.5', secondaryTimezone ? 'grid-cols-[72px_repeat(7,1fr)]' : 'grid-cols-[56px_repeat(7,1fr)]')}>
            <div />
            {layoutByDay.map((dayLayout, dayIndex) => (
              <div key={dayIndex} className="relative pointer-events-none">
                {dayLayout.map((item) => {
                  const top = calculateEventTop(item.event.start_date, gridStartHour);
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
                          all_day: item.event.all_day,
                          recurring: item.event.recurring,
                        }}
                        onClick={() => onEventClick?.(item.event)}
                        compact={height < 80}
                        className="h-full"
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
              className="absolute top-3 left-16 z-20 px-3 py-1.5 rounded-full bg-cream-100/82 backdrop-blur-md border border-primary-600/20 shadow-sm"
            >
              <p className="text-xs font-medium text-primary-700">
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
                // Adjust for gutter + 2px gaps (gutter widens when secondary TZ is shown)
                left: `calc(${secondaryTimezone ? '72px' : '56px'} + ${todayIndex} * ((100% - ${secondaryTimezone ? '72px' : '56px'} - 12px) / 7) + ${todayIndex} * 2px)`,
                width: `calc((100% - ${secondaryTimezone ? '72px' : '56px'} - 12px) / 7)`,
              }}
            >
              <div className="flex items-center -ml-1.5">
                {/* Green dot with white border */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0 bg-primary-600 border-2 border-white shadow-[0_0_8px_rgba(22,163,74,0.5),0_2px_4px_rgba(0,0,0,0.1)]"
                />
                {/* Green line */}
                <div
                  className="h-[2px] flex-1 bg-gradient-to-r from-primary-600 to-primary-600/40"
                />
              </div>
            </div>
          )}
        </div>

        {/* Empty state for no events this week — check per-day arrays, not all events */}
        {timedEventsByDay.every(d => d.length === 0) && allDayEventsByDay.every(d => d.length === 0) && (
          <div className="mt-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100/80 mx-auto flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">
              No events this week
            </h3>
            <p className="text-sm text-warm-500 max-w-xs mx-auto">
              Click &ldquo;Add Event&rdquo; to schedule something for this week
            </p>
          </div>
        )}
      </div>

      {/* Mobile vertical day-list companion — shown only on <md. One section per
          day (Sun–Sat) listing that day's all-day AND timed events plus any
          player busy periods, in start-time order, using the same
          PremiumEventBlock + onEventClick handler as the desktop grid. Avoids
          the 800px horizontal scroll the time-grid requires. Nothing dropped. */}
      <div className="md:hidden px-3 pt-2 pb-4">
        {/* Selected player indicator (mirrors the desktop overlay badge) */}
        {selectedPlayerName && (
          <div className="mb-3 inline-flex px-3 py-1.5 rounded-full bg-cream-100/82 backdrop-blur-md border border-primary-600/20 shadow-sm">
            <p className="text-xs font-medium text-primary-700">
              Viewing {selectedPlayerName}&apos;s schedule
            </p>
          </div>
        )}

        {timedEventsByDay.every(d => d.length === 0) && allDayEventsByDay.every(d => d.length === 0) ? (
          <div className="mt-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100/80 mx-auto flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">
              No events this week
            </h3>
            <p className="text-sm text-warm-500 max-w-xs mx-auto">
              Click &ldquo;Add Event&rdquo; to schedule something for this week
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {weekDates.map((date, dayIndex) => {
              const isCurrentDay = dayIndex === todayIndex;
              const dayName = DAYS[date.getDay()];
              const dayNum = date.getDate();
              const allDay = allDayEventsByDay[dayIndex] ?? [];
              // Timed events sorted by start, matching the grid's layout order.
              const timed = [...(timedEventsByDay[dayIndex] ?? [])].sort(
                (a, b) => getMinutesFromMidnight(a.start_date) - getMinutesFromMidnight(b.start_date)
              );
              const busy = busyPeriodsByDay[dayIndex] ?? [];

              // Skip days with no content to keep the list compact.
              if (allDay.length === 0 && timed.length === 0 && busy.length === 0) return null;

              return (
                <div key={dayIndex}>
                  {/* Day heading */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      'inline-flex items-center justify-center w-7 h-7 rounded-full text-body-sm font-medium',
                      isCurrentDay
                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.4)]'
                        : 'text-warm-800'
                    )}>
                      {dayNum}
                    </span>
                    <span className={cn(
                      'text-eyebrow font-medium uppercase tracking-[0.12em]',
                      isCurrentDay ? 'text-primary-600' : 'text-warm-400'
                    )}>
                      {dayName}
                    </span>
                    {isCurrentDay && (
                      <span className="text-eyebrow font-medium uppercase tracking-[0.1em] text-primary-600">
                        Today
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {/* All-day events */}
                    {allDay.map((event) => (
                      <div key={event.id} className="pointer-events-auto">
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
                          onClick={() => onEventClick?.(event)}
                          compact={true}
                        />
                      </div>
                    ))}

                    {/* Timed events */}
                    {timed.map((event) => (
                      <div key={event.id} className="pointer-events-auto">
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
                          onClick={() => onEventClick?.(event)}
                        />
                      </div>
                    ))}

                    {/* Player busy periods (classes / blocked time) */}
                    {busy.map((period, periodIndex) => {
                      const isClass = period.type === 'class';
                      const hasColor = !!period.color;
                      const bgColor = hasColor
                        ? period.color!.light
                        : isClass
                          ? 'rgba(244, 63, 94, 0.08)'
                          : 'rgba(251, 146, 60, 0.12)';
                      const borderColor = hasColor
                        ? period.color!.bg
                        : isClass ? 'rgb(244, 63, 94)' : 'rgb(251, 146, 60)';
                      const textColor = hasColor
                        ? period.color!.bg
                        : isClass ? 'rgb(244, 63, 94)' : 'rgb(251, 146, 60)';
                      return (
                        <div
                          key={`busy-${periodIndex}`}
                          className="rounded-lg border-l-2 px-2.5 py-1.5"
                          style={{ background: bgColor, borderColor }}
                        >
                          <p className="text-xs font-medium truncate" style={{ color: textColor }}>
                            {period.title || (isClass ? 'Class' : 'Busy')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
