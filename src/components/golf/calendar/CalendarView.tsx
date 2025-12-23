'use client';

import { useState } from 'react';
import type { GolfEvent } from '@/lib/types/golf';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

interface CalendarViewProps {
  events: GolfEvent[];
}

export function CalendarView({ events }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

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
    if (!isCurrentMonth) return [];

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return events.filter(event => {
      const eventDate = event.start_date.split('T')[0];
      return eventDate === dateStr;
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
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
            className="bg-white px-2 py-3 min-h-[80px] text-slate-300"
          >
            <div className="text-sm">{day}</div>
          </div>
        ))}

        {/* Current Month Days */}
        {currentMonthDays.map(day => {
          const dayEvents = getEventsForDay(day, true);
          const today = isToday(day, true);

          return (
            <div
              key={`current-${day}`}
              className={`bg-white px-2 py-3 min-h-[80px] ${
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
                {dayEvents.slice(0, 2).map(event => (
                  <div
                    key={event.id}
                    className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded truncate"
                    title={event.title}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-xs text-slate-400 px-1.5">
                    +{dayEvents.length - 2} more
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
            className="bg-white px-2 py-3 min-h-[80px] text-slate-300"
          >
            <div className="text-sm">{day}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
