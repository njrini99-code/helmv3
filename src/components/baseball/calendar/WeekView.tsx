'use client';

import { useEffect, useState, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventTypeConfig } from './event-type-config';
import type { BaseballCalendarEvent } from './MonthView';

export interface WeekViewProps {
  weekStart: Date;
  events: BaseballCalendarEvent[];
  onEventClick?: (event: BaseballCalendarEvent) => void;
  onDateClick?: (date: Date) => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 9 PM
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function getMinutesFromMidnight(dateStr: string): number {
  const date = new Date(dateStr);
  return date.getHours() * 60 + date.getMinutes();
}

function calculateEventTop(startDate: string, startHour: number): number {
  const minutes = getMinutesFromMidnight(startDate);
  const hoursFromStart = minutes / 60 - startHour;
  return Math.max(0, hoursFromStart * 64);
}

function calculateEventHeight(startDate: string, endDate: string | null | undefined): number {
  const startMinutes = getMinutesFromMidnight(startDate);
  const endMinutes = endDate ? getMinutesFromMidnight(endDate) : startMinutes + 60;
  const durationMinutes = Math.max(30, endMinutes - startMinutes);
  return (durationMinutes / 60) * 64;
}

export function WeekView({ weekStart, events, onEventClick, onDateClick }: WeekViewProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 22) {
      const targetScroll = (hour - 6) * 64 - 64;
      el.scrollTop = Math.max(0, targetScroll);
    }
  }, []);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  const eventsByDay = weekDates.map((date) =>
    events.filter((event) => {
      const eventDate = new Date(event.start_date);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    })
  );

  const getCurrentTimePosition = () => {
    if (!currentTime) return null;
    const hour = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    if (hour < 6 || hour >= 22) return null;
    const hoursFromStart = hour - 6;
    return hoursFromStart * 64 + (minutes / 60) * 64;
  };

  const currentTimeTop = getCurrentTimePosition();
  const todayIndex = weekDates.findIndex((d) => isToday(d));

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto overscroll-contain touch-pan-y"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="min-w-[800px] px-3 md:px-5 pt-2">
        {/* Header */}
        <div className="grid sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-200/30 gap-0.5 grid-cols-[56px_repeat(7,1fr)]">
          <div className="h-16" />
          {weekDates.map((date, index) => {
            const isCurrentDay = isToday(date);
            const dayName = DAYS[date.getDay()];
            const dayNum = date.getDate();

            return (
              <button
                type="button"
                key={index}
                onClick={() => onDateClick?.(date)}
                className={cn(
                  'h-16 flex flex-col items-center justify-center rounded-t-xl transition-colors',
                  isCurrentDay && 'bg-primary-50/50',
                  'hover:bg-slate-50'
                )}
              >
                <p
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    isCurrentDay ? 'text-primary-600' : 'text-slate-400'
                  )}
                >
                  {dayName}
                </p>
                <div
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold mt-0.5 transition-all',
                    isCurrentDay
                      ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30'
                      : 'text-slate-800'
                  )}
                >
                  {dayNum}
                </div>
              </button>
            );
          })}
        </div>

        {/* Time Grid */}
        <div className="relative">
          <div className="grid gap-x-0.5 grid-cols-[56px_repeat(7,1fr)]">
            {HOURS.map((hour) => {
              const isEvenHour = hour % 2 === 0;
              return (
                <div key={hour} className="contents">
                  {/* Time label */}
                  <div className="h-16 flex items-start justify-end pr-3 pt-1 select-none border-b border-slate-100/50">
                    <span className="text-xs font-medium tabular-nums text-slate-400">
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
                  {weekDates.map((_, dayIndex) => {
                    const isCurrentDay = dayIndex === todayIndex;
                    return (
                      <div
                        key={dayIndex}
                        className={cn(
                          'h-16 relative transition-colors duration-150',
                          'border-b border-slate-100/30',
                          isEvenHour ? 'bg-white/50' : 'bg-slate-50/30',
                          isCurrentDay && 'bg-primary-50/30',
                          'hover:bg-white/70'
                        )}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Events overlay */}
          <div className="absolute inset-0 pointer-events-none grid gap-x-0.5 grid-cols-[56px_repeat(7,1fr)]">
            <div />
            {eventsByDay.map((dayEvents, dayIndex) => (
              <div key={dayIndex} className="relative">
                {dayEvents.map((event) => {
                  const top = calculateEventTop(event.start_date, 6);
                  const height = calculateEventHeight(event.start_date, event.end_time);
                  const config = getEventTypeConfig(event.event_type);

                  return (
                    <button
                      type="button"
                      key={event.id}
                      onClick={() => onEventClick?.(event)}
                      className={cn(
                        'absolute left-0.5 right-0.5 pointer-events-auto',
                        'rounded-lg overflow-hidden border-l-[3px]',
                        'transition-all duration-150 hover:scale-[1.02] hover:shadow-md hover:z-10',
                        'bg-white/90 backdrop-blur-sm shadow-sm',
                        config.borderColor
                      )}
                      style={{ top: `${top}px`, height: `${Math.max(height, 28)}px` }}
                    >
                      <div className="px-2 py-1 h-full flex flex-col justify-center overflow-hidden">
                        <p
                          className={cn(
                            'font-semibold truncate leading-tight',
                            height < 40 ? 'text-xs' : 'text-[13px]',
                            config.textColor
                          )}
                        >
                          {event.title}
                        </p>
                        {height >= 48 && event.location && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{event.location}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Current Time Indicator */}
          {currentTimeTop !== null && todayIndex >= 0 && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: `${currentTimeTop}px`,
                left: `calc(56px + ${todayIndex} * ((100% - 56px - 12px) / 7) + ${todayIndex} * 2px)`,
                width: `calc((100% - 56px - 12px) / 7)`,
              }}
            >
              <div className="flex items-center -ml-1.5">
                <div className="w-3 h-3 rounded-full flex-shrink-0 bg-primary-600 border-2 border-white shadow-[0_0_8px_rgba(22,163,74,0.5)]" />
                <div className="h-[2px] flex-1 bg-gradient-to-r from-primary-600 to-primary-600/30" />
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {events.length === 0 && (
          <div className="mt-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No events this week</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Click &ldquo;Add Event&rdquo; to schedule something for this week
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
