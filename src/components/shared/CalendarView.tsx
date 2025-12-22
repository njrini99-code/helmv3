'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconChevronLeft, IconChevronRight, IconPlus } from '@/components/icons';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, eachHourOfInterval, startOfDay, endOfDay, addDays } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  start_date: string;
  end_date?: string;
  event_category?: 'practice' | 'game' | 'camp' | 'visit' | 'showcase';
  location?: string;
  description?: string;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onAddEvent?: () => void;
  canAddEvents?: boolean;
  view?: 'month' | 'week';
  currentDate?: Date;
  onDateChange?: (date: Date) => void;
}

const EVENT_COLORS = {
  practice: 'bg-blue-100 text-blue-700 border-blue-200',
  game: 'bg-green-100 text-green-700 border-green-200',
  camp: 'bg-purple-100 text-purple-700 border-purple-200',
  visit: 'bg-amber-100 text-amber-700 border-amber-200',
  showcase: 'bg-pink-100 text-pink-700 border-pink-200',
  default: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function CalendarView({
  events = [],
  onEventClick,
  onDateClick,
  onAddEvent,
  canAddEvents = false,
  view = 'month',
  currentDate: externalDate,
  onDateChange,
}: CalendarViewProps) {
  const [internalDate, setInternalDate] = useState(new Date());
  const currentMonth = externalDate || internalDate;

  const setCurrentMonth = (date: Date) => {
    if (onDateChange) {
      onDateChange(date);
    } else {
      setInternalDate(date);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  // For week view
  const weekStart = startOfWeek(currentMonth);
  const weekEnd = endOfWeek(currentMonth);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_date);
      return isSameDay(eventDate, day);
    });
  };

  const previousPeriod = () => {
    if (view === 'week') {
      setCurrentMonth(subWeeks(currentMonth, 1));
    } else {
      setCurrentMonth(subMonths(currentMonth, 1));
    }
  };

  const nextPeriod = () => {
    if (view === 'week') {
      setCurrentMonth(addWeeks(currentMonth, 1));
    } else {
      setCurrentMonth(addMonths(currentMonth, 1));
    }
  };

  const getHeaderText = () => {
    if (view === 'week') {
      const start = format(weekStart, 'MMM d');
      const end = format(weekEnd, 'MMM d, yyyy');
      return `${start} - ${end}`;
    }
    return format(currentMonth, 'MMMM yyyy');
  };

  return (
    <Card className="overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {getHeaderText()}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={previousPeriod}
              className="p-1.5"
              aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
            >
              <IconChevronLeft size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextPeriod}
              className="p-1.5"
              aria-label={view === 'week' ? 'Next week' : 'Next month'}
            >
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>

        {canAddEvents && onAddEvent && (
          <Button size="sm" onClick={onAddEvent}>
            <IconPlus size={16} />
            Add Event
          </Button>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {view === 'month' ? (
          <>
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className="text-center text-[11px] font-medium uppercase tracking-wider text-slate-400 tracking-wide py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const dayEvents = getEventsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isDayToday = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => onDateClick?.(day)}
                    className={`
                      min-h-[100px] p-2 rounded-lg border transition-all
                      ${isCurrentMonth ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100'}
                      ${onDateClick ? 'cursor-pointer hover:border-green-300 hover:shadow-sm' : ''}
                      ${isDayToday ? 'ring-2 ring-green-500 ring-offset-1' : ''}
                    `}
                  >
                    <div
                      className={`
                        text-sm font-medium mb-1
                        ${!isCurrentMonth ? 'text-slate-400' : 'text-slate-900'}
                        ${isDayToday ? 'text-green-600 font-semibold' : ''}
                      `}
                    >
                      {format(day, 'd')}
                    </div>

                    {/* Events for this day */}
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => {
                        const colorClass = EVENT_COLORS[event.event_category || 'default'] || EVENT_COLORS.default;
                        return (
                          <div
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick?.(event);
                            }}
                            className={`
                              text-xs px-2 py-1 rounded border cursor-pointer
                              hover:shadow-sm transition-shadow truncate
                              ${colorClass}
                            `}
                          >
                            {event.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-slate-500 px-2">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Week View */
          <>
            {/* Day Headers with dates */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {weekDays.map((day) => {
                const isDayToday = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className="text-center py-2"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 tracking-wide">
                      {format(day, 'EEE')}
                    </div>
                    <div
                      className={`
                        text-lg font-semibold mt-1
                        ${isDayToday ? 'text-green-600' : 'text-slate-900'}
                      `}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Week Day Columns */}
            <div className="grid grid-cols-7 gap-2 min-h-[400px]">
              {weekDays.map((day) => {
                const dayEvents = getEventsForDay(day);
                const isDayToday = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => onDateClick?.(day)}
                    className={`
                      p-2 rounded-lg border transition-all h-full
                      bg-white border-slate-200
                      ${onDateClick ? 'cursor-pointer hover:border-green-300 hover:shadow-sm' : ''}
                      ${isDayToday ? 'ring-2 ring-green-500 ring-offset-1' : ''}
                    `}
                  >
                    {/* Events for this day */}
                    <div className="space-y-2">
                      {dayEvents.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-4">
                          No events
                        </div>
                      ) : (
                        dayEvents.map((event) => {
                          const colorClass = EVENT_COLORS[event.event_category || 'default'] || EVENT_COLORS.default;
                          const eventTime = format(new Date(event.start_date), 'h:mm a');
                          return (
                            <div
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick?.(event);
                              }}
                              className={`
                                text-xs p-2 rounded border cursor-pointer
                                hover:shadow-sm transition-shadow
                                ${colorClass}
                              `}
                            >
                              <div className="font-medium truncate">{event.title}</div>
                              <div className="text-[10px] opacity-75 mt-0.5">{eventTime}</div>
                              {event.location && (
                                <div className="text-[10px] opacity-75 truncate">{event.location}</div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-xs text-slate-600">Practice</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-xs text-slate-600">Game</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-purple-500"></div>
            <span className="text-xs text-slate-600">Camp</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500"></div>
            <span className="text-xs text-slate-600">Visit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-pink-500"></div>
            <span className="text-xs text-slate-600">Showcase</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
