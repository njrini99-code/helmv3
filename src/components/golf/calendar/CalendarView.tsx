'use client';

import { useState } from 'react';
import type { GolfEvent } from '@/lib/types/golf';
import { IconChevronLeft, IconChevronRight, IconBook, IconFlag } from '@/components/icons';
import { formatTimeDisplay } from '@/lib/utils/schedule-parser';

export interface CalendarClass {
  id: string;
  course_code: string;
  course_name: string;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  color: string | null;
  instructor: string | null;
}

interface CalendarViewProps {
  events: GolfEvent[];
  classes?: CalendarClass[];
  onClassClick?: (cls: CalendarClass) => void;
  onEventClick?: (event: GolfEvent) => void;
}

// Map day abbreviations to day numbers (0 = Sunday)
const DAY_MAP: Record<string, number> = {
  'Su': 0, 'M': 1, 'T': 2, 'W': 3, 'Th': 4, 'F': 5, 'Sa': 6
};

export function CalendarView({ events, classes = [], onClassClick, onEventClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showClasses, setShowClasses] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  // Get days from previous month to fill the grid
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = Array.from(
    { length: startingDayOfWeek },
    (_, i) => daysInPrevMonth - startingDayOfWeek + i + 1
  );

  // Get days from current month
  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Get days from next month to fill the grid (to complete 6 weeks)
  const totalCells = 42; // 6 weeks * 7 days
  const remainingCells = totalCells - prevMonthDays.length - currentMonthDays.length;
  const nextMonthDays = Array.from({ length: remainingCells }, (_, i) => i + 1);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get events for a specific day
  const getEventsForDay = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth || !showEvents) return [];

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return events.filter(event => {
      const eventDate = event.start_date.split('T')[0];
      return eventDate === dateStr;
    });
  };

  // Get classes for a specific day of week
  const getClassesForDay = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth || !showClasses) return [];

    // Get the day of week for this date
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();

    // Find classes that occur on this day
    return classes.filter(cls => {
      return cls.days.some(d => DAY_MAP[d] === dayOfWeek);
    });
  };

  const isToday = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return false;

    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  // Combined items for a day (both events and classes)
  const getItemsForDay = (day: number, isCurrentMonth: boolean) => {
    const dayEvents = getEventsForDay(day, isCurrentMonth).map(e => ({
      type: 'event' as const,
      data: e,
      time: e.start_date.includes('T') ? e.start_date.split('T')[1]?.substring(0, 5) || null : null,
      color: '#16A34A', // green for events
    }));

    const dayClasses = getClassesForDay(day, isCurrentMonth).map(c => ({
      type: 'class' as const,
      data: c,
      time: c.start_time,
      color: c.color || '#2563EB', // blue default for classes
    }));

    // Sort by time
    return [...dayEvents, ...dayClasses].sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {monthNames[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToPrevMonth}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconChevronLeft size={20} />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Filter toggles */}
      {classes.length > 0 && (
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100">
          <span className="text-sm text-slate-500">Show:</span>
          <button
            onClick={() => setShowEvents(!showEvents)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showEvents 
                ? 'bg-green-100 text-green-700' 
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <IconFlag size={14} />
            Events
          </button>
          <button
            onClick={() => setShowClasses(!showClasses)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showClasses 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <IconBook size={14} />
            Classes
          </button>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
        {/* Day Names */}
        {dayNames.map(day => (
          <div
            key={day}
            className="bg-slate-50 px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase"
          >
            {day}
          </div>
        ))}

        {/* Previous Month Days */}
        {prevMonthDays.map(day => (
          <div
            key={`prev-${day}`}
            className="bg-white px-2 py-3 min-h-[100px] text-slate-300"
          >
            <div className="text-sm">{day}</div>
          </div>
        ))}

        {/* Current Month Days */}
        {currentMonthDays.map(day => {
          const items = getItemsForDay(day, true);
          const today = isToday(day, true);

          return (
            <div
              key={`current-${day}`}
              className={`bg-white px-2 py-2 min-h-[100px] ${
                today ? 'bg-green-50' : ''
              }`}
            >
              <div
                className={`text-sm font-medium mb-1 ${
                  today ? 'text-green-600' : 'text-slate-900'
                }`}
              >
                {day}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((item, idx) => (
                  <button
                    key={`${item.type}-${item.type === 'event' ? item.data.id : item.data.id}-${idx}`}
                    onClick={() => {
                      if (item.type === 'event' && onEventClick) {
                        onEventClick(item.data as GolfEvent);
                      } else if (item.type === 'class' && onClassClick) {
                        onClassClick(item.data as CalendarClass);
                      }
                    }}
                    className="w-full text-left text-xs px-1.5 py-1 rounded truncate transition-all hover:opacity-80"
                    style={{ 
                      backgroundColor: `${item.color}15`,
                      color: item.color,
                    }}
                    title={item.type === 'event' 
                      ? (item.data as GolfEvent).title 
                      : `${(item.data as CalendarClass).course_code} - ${(item.data as CalendarClass).course_name}`
                    }
                  >
                    <span className="flex items-center gap-1">
                      {item.type === 'class' && <IconBook size={10} />}
                      {item.type === 'event' && <IconFlag size={10} />}
                      <span className="truncate">
                        {item.type === 'event' 
                          ? (item.data as GolfEvent).title 
                          : (item.data as CalendarClass).course_code
                        }
                      </span>
                    </span>
                    {item.time && (
                      <span className="text-[10px] opacity-75 block">
                        {formatTimeDisplay(item.time)}
                      </span>
                    )}
                  </button>
                ))}
                {items.length > 3 && (
                  <div className="text-xs text-slate-400 px-1.5">
                    +{items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Next Month Days */}
        {nextMonthDays.map(day => (
          <div
            key={`next-${day}`}
            className="bg-white px-2 py-3 min-h-[100px] text-slate-300"
          >
            <div className="text-sm">{day}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      {classes.length > 0 && (
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Team Events</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span>Classes</span>
          </div>
        </div>
      )}
    </div>
  );
}
