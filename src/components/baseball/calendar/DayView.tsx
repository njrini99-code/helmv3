'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventTypeConfig } from './event-type-config';
import type { BaseballCalendarEvent } from './MonthView';

export interface DayViewProps {
  date: Date;
  events: BaseballCalendarEvent[];
  onEventClick?: (event: BaseballCalendarEvent) => void;
  onDateChange?: (date: Date) => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 9 PM

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

export function DayView({ date, events, onEventClick, onDateChange }: DayViewProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

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

  // Filter events for this day
  const dayEvents = events.filter((event) => {
    const eventDate = new Date(event.start_date);
    return (
      eventDate.getDate() === date.getDate() &&
      eventDate.getMonth() === date.getMonth() &&
      eventDate.getFullYear() === date.getFullYear()
    );
  });

  const getCurrentTimePosition = () => {
    if (!currentTime) return null;
    const hour = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    if (hour < 6 || hour >= 22) return null;
    const hoursFromStart = hour - 6;
    return hoursFromStart * 64 + (minutes / 60) * 64;
  };

  const currentTimeTop = getCurrentTimePosition();
  const isCurrentDay = isToday(date);

  // Swipe handlers for mobile navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
    touchStartY.current = e.touches[0]?.clientY ?? 0;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touchEndX = e.changedTouches[0]?.clientX ?? 0;
      const touchEndY = e.changedTouches[0]?.clientY ?? 0;
      const deltaX = touchEndX - touchStartX.current;
      const deltaY = Math.abs(touchEndY - touchStartY.current);

      // Only swipe if horizontal movement is significant and more than vertical
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY * 2) {
        const newDate = new Date(date);
        if (deltaX > 0) {
          newDate.setDate(newDate.getDate() - 1); // Swipe right = previous day
        } else {
          newDate.setDate(newDate.getDate() + 1); // Swipe left = next day
        }
        onDateChange?.(newDate);
      }
    },
    [date, onDateChange]
  );

  const goToPreviousDay = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange?.(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange?.(newDate);
  };

  const dateTitle = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto overscroll-contain touch-pan-y"
      style={{ WebkitOverflowScrolling: 'touch' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile Date Navigation */}
      <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-200/30 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPreviousDay}
          className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="text-center">
          <p className={cn('text-sm font-semibold', isCurrentDay ? 'text-primary-600' : 'text-slate-900')}>
            {isCurrentDay ? 'Today' : dateTitle}
          </p>
          {isCurrentDay && (
            <p className="text-xs text-slate-500">{dateTitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={goToNextDay}
          className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Swipe hint on mobile */}
      <div className="md:hidden text-center py-2 text-xs text-slate-400">
        Swipe left or right to change days
      </div>

      <div className="max-w-4xl mx-auto p-3 md:p-6">
        <div className="relative">
          <div className="grid grid-cols-[48px_1fr] md:grid-cols-[80px_1fr]">
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                {/* Time label */}
                <div className="h-16 border-r border-slate-100/30 flex items-start justify-end pr-2 md:pr-4 pt-1 bg-gradient-to-r from-slate-50/50 to-transparent">
                  <span className="text-xs font-medium text-slate-400">
                    <span className="md:hidden">
                      {hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`}
                    </span>
                    <span className="hidden md:inline">
                      {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                    </span>
                  </span>
                </div>

                {/* Time slot */}
                <div
                  className={cn(
                    'h-16 relative border-l border-t border-slate-100/30',
                    'hover:bg-white/40 transition-colors duration-150',
                    isCurrentDay && 'bg-primary-50/20'
                  )}
                />
              </div>
            ))}
          </div>

          {/* Events overlay */}
          <div className="absolute inset-0 pointer-events-none grid grid-cols-[48px_1fr] md:grid-cols-[80px_1fr]">
            <div />
            <div className="relative">
              {dayEvents.map((event) => {
                const top = calculateEventTop(event.start_date, 6);
                const height = calculateEventHeight(event.start_date, event.end_time);
                const config = getEventTypeConfig(event.event_type);
                const Icon = config.icon;

                return (
                  <button
                    type="button"
                    key={event.id}
                    onClick={() => onEventClick?.(event)}
                    className={cn(
                      'absolute left-1 right-1 md:left-2 md:right-2 pointer-events-auto',
                      'rounded-xl overflow-hidden border-l-[4px]',
                      'transition-all duration-150 hover:scale-[1.01] hover:shadow-lg hover:z-10',
                      'bg-white/95 backdrop-blur-sm shadow-md',
                      config.borderColor
                    )}
                    style={{ top: `${top}px`, height: `${Math.max(height, 48)}px` }}
                  >
                    <div className="px-3 py-2 h-full flex items-start gap-3 overflow-hidden">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                          config.bgColor
                        )}
                      >
                        <Icon className={cn('w-4 h-4', config.textColor)} />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className={cn('font-semibold truncate', config.textColor)}>
                          {event.title}
                        </p>
                        {event.start_time && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(event.start_time).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </p>
                        )}
                        {height >= 80 && event.location && (
                          <p className="text-xs text-slate-400 truncate mt-1">{event.location}</p>
                        )}
                      </div>
                      {event.is_mandatory && (
                        <span className="flex-shrink-0 px-2 py-0.5 text-micro font-bold rounded bg-red-100 text-red-600 uppercase">
                          Required
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Time Indicator */}
          {currentTimeTop !== null && isCurrentDay && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: `${currentTimeTop}px`,
                left: '48px',
                right: 0,
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
        {dayEvents.length === 0 && (
          <div className="mt-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No events scheduled</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Click &ldquo;Add Event&rdquo; to schedule something for this day
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
