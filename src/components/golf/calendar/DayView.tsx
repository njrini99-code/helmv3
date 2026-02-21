'use client';

import { useEffect, useState, useRef } from 'react';
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
  secondaryTimezone?: string | null;
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

  const formatHour = (h: number) =>
    h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

  return (
    <div
      ref={setNodeRef}
      aria-label={`Drop zone: ${formatHour(hour)}`}
      className={cn(
        'h-16 relative transition-all duration-200',
        'border-l border-t border-warm-100/30',
        'hover:bg-white/20',
        isOver && 'bg-primary-100/50 border-primary-300/50'
      )}
    >
      {isOver && (
        <div className="absolute inset-1 border-2 border-dashed border-primary-400 rounded-lg bg-primary-50/40" aria-hidden="true" />
      )}
    </div>
  );
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

/** Format a local hour (0-23) in a target timezone */
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
      return formatted.replace(/\s?(AM|PM)/, (_, m) => m[0]!.toLowerCase());
    }
    return formatted;
  } catch {
    return '';
  }
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

export function DayView({ date, events, onEventClick, isDraggable = false, secondaryTimezone }: DayViewProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (hour >= 6 && hour < 22) {
      const targetScroll = (hour - 6) * 64 - 64;
      el.scrollTop = Math.max(0, targetScroll);
    }
  }, []);

  const dayEvents = events.filter((event) => {
    const eventDate = new Date(event.start_date);
    return (
      eventDate.getDate() === date.getDate() &&
      eventDate.getMonth() === date.getMonth() &&
      eventDate.getFullYear() === date.getFullYear()
    );
  });

  const layoutItems = layoutOverlappingEvents(dayEvents);

  const getCurrentTimePosition = () => {
    if (!currentTime) return null;
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
    <div ref={scrollRef} className={cn(
      'flex-1 overflow-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]',
      secondaryTimezone ? '[--day-gutter:48px] md:[--day-gutter:96px]' : '[--day-gutter:48px] md:[--day-gutter:80px]'
    )} data-scroll-container>
      <div className="max-w-4xl mx-auto p-3 md:p-6">
        <div className="relative">
          <div className={cn(
            'grid',
            secondaryTimezone ? 'grid-cols-[48px_1fr] md:grid-cols-[96px_1fr]' : 'grid-cols-[48px_1fr] md:grid-cols-[80px_1fr]'
          )}>
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                {/* Time label column - Compact on mobile */}
                <div className="h-16 border-r border-warm-100/20 flex flex-col items-end justify-start pr-2 md:pr-4 pt-1 bg-gradient-to-r from-warm-50/40 to-transparent">
                  <span className="text-xs md:text-xs font-medium text-warm-400">
                    {/* Mobile: compact format (6a), Desktop: full format (6 AM) */}
                    <span className="md:hidden">
                      {hour === 0
                        ? '12a'
                        : hour < 12
                        ? `${hour}a`
                        : hour === 12
                        ? '12p'
                        : `${hour - 12}p`}
                    </span>
                    <span className="hidden md:inline">
                      {hour === 0
                        ? '12 AM'
                        : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                        ? '12 PM'
                        : `${hour - 12} PM`}
                    </span>
                  </span>
                  {secondaryTimezone && (
                    <span className="text-micro font-medium tabular-nums text-warm-400/50 mt-0.5">
                      <span className="md:hidden">{formatHourInTz(hour, secondaryTimezone, true)}</span>
                      <span className="hidden md:inline">{formatHourInTz(hour, secondaryTimezone)}</span>
                    </span>
                  )}
                </div>

                {isDraggable ? (
                  <DroppableTimeSlot date={date} hour={hour} />
                ) : (
                  <div className="
                    h-16 relative
                    border-l border-t border-warm-100/30
                    hover:bg-white/30
                    transition-colors duration-150
                  " />
                )}
              </div>
            ))}
          </div>

          {/* Events overlay */}
          <div className={cn('absolute inset-0 pointer-events-none grid', secondaryTimezone ? 'grid-cols-[48px_1fr] md:grid-cols-[96px_1fr]' : 'grid-cols-[48px_1fr] md:grid-cols-[80px_1fr]')}>
            <div />
            <div className="relative pointer-events-none">
              {layoutItems.map((item) => {
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
                      left: `calc(${leftPercent}% + 4px)`,
                      width: `calc(${widthPercent}% - 8px)`,
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
                      className="h-full"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Time Indicator — brand green line with glowing dot */}
          {currentTimeTop !== null && isCurrentDay && (
            <div
              aria-hidden="true"
              className="absolute pointer-events-none z-10"
              style={{
                top: `${currentTimeTop}px`,
                left: 'var(--day-gutter, 48px)',
                right: 0,
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

        {/* Empty state */}
        {dayEvents.length === 0 && (
          <div className="mt-16 text-center">
            <div className="
              w-16 h-16 rounded-[16px]
              bg-warm-100/80
              mx-auto
              flex items-center justify-center
              mb-4
            ">
              <Calendar className="w-7 h-7 text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">
              No events scheduled
            </h3>
            <p className="text-sm text-warm-500 max-w-xs mx-auto">
              Click &ldquo;Add Event&rdquo; to schedule something for this day
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
