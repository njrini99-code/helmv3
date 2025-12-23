'use client';

import { useState } from 'react';
import type { GolfEvent } from '@/lib/types/golf';
import { IconChevronLeft, IconChevronRight, IconBook, IconFlag } from '@/components/icons';
import { formatTimeDisplay } from '@/lib/utils/schedule-parser';

interface CalendarClass {
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

interface WeeklyScheduleViewProps {
  events: GolfEvent[];
  classes?: CalendarClass[];
  onClassClick?: (cls: CalendarClass) => void;
  onEventClick?: (event: GolfEvent) => void;
}

// Map day abbreviations to day numbers (0 = Sunday)
const DAY_MAP: Record<string, number> = {
  'Su': 0, 'M': 1, 'T': 2, 'W': 3, 'Th': 4, 'F': 5, 'Sa': 6
};

// Time slots from 7 AM to 9 PM
const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => {
  const hour = i + 7;
  return {
    hour,
    label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
  };
});

export function WeeklyScheduleView({ events, classes = [], onClassClick, onEventClick }: WeeklyScheduleViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(now.setDate(diff));
  });

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayAbbrevs = ['M', 'T', 'W', 'Th', 'F'];

  // Get dates for the week (Mon-Fri)
  const weekDates = dayNames.map((_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() + i);
    return date;
  });

  const goToPrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToThisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(now.setDate(diff)));
  };

  // Get classes for a specific day
  const getClassesForDay = (dayIndex: number) => {
    const dayAbbrev = dayAbbrevs[dayIndex];
    if (!dayAbbrev) return [];
    return classes.filter(cls => cls.days?.includes(dayAbbrev));
  };

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(event => {
      const eventDate = event.start_date.split('T')[0];
      return eventDate === dateStr;
    });
  };

  // Calculate position and height for an item based on time
  const getTimePosition = (startTime: string | null, endTime: string | null) => {
    if (!startTime) return { top: 0, height: 60 };

    const [startHour = 0, startMin = 0] = startTime.split(':').map(Number);
    const top = ((startHour - 7) * 60 + startMin) * (60 / 60); // pixels per minute

    let height = 60; // default 1 hour
    if (endTime) {
      const [endHour = 0, endMin = 0] = endTime.split(':').map(Number);
      const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      height = duration; // 1 pixel per minute
    }

    return { top: Math.max(0, top), height: Math.max(30, height) };
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Format week range
  const weekEndDate = new Date(currentWeekStart);
  weekEndDate.setDate(currentWeekStart.getDate() + 4);
  const weekRange = `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">Weekly Schedule</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 mr-2">{weekRange}</span>
          <button
            onClick={goToThisWeek}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            This Week
          </button>
          <button
            onClick={goToPrevWeek}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconChevronLeft size={20} />
          </button>
          <button
            onClick={goToNextWeek}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="flex">
        {/* Time column */}
        <div className="w-16 flex-shrink-0 border-r border-slate-100">
          <div className="h-12 border-b border-slate-100" /> {/* Header spacer */}
          {TIME_SLOTS.map(slot => (
            <div
              key={slot.hour}
              className="h-[60px] px-2 text-xs text-slate-400 text-right pr-3 pt-0.5"
            >
              {slot.label}
            </div>
          ))}
        </div>

        {/* Days columns */}
        <div className="flex-1 grid grid-cols-5">
          {dayNames.map((day, dayIndex) => {
            const date = weekDates[dayIndex];
            if (!date) return null;
            const dayClasses = getClassesForDay(dayIndex);
            const dayEvents = getEventsForDate(date);
            const today = isToday(date);

            return (
              <div key={day} className="border-r border-slate-100 last:border-r-0">
                {/* Day header */}
                <div className={`h-12 flex flex-col items-center justify-center border-b border-slate-100 ${today ? 'bg-green-50' : ''}`}>
                  <span className="text-xs font-medium text-slate-500">{day}</span>
                  <span className={`text-sm font-semibold ${today ? 'text-green-600' : 'text-slate-900'}`}>
                    {date.getDate()}
                  </span>
                </div>

                {/* Time grid */}
                <div className="relative" style={{ height: `${TIME_SLOTS.length * 60}px` }}>
                  {/* Grid lines */}
                  {TIME_SLOTS.map((slot, i) => (
                    <div
                      key={slot.hour}
                      className="absolute w-full border-b border-slate-50"
                      style={{ top: `${i * 60}px`, height: '60px' }}
                    />
                  ))}

                  {/* Classes */}
                  {dayClasses.map((cls, idx) => {
                    const { top, height } = getTimePosition(cls.start_time, cls.end_time);
                    return (
                      <button
                        key={cls.id}
                        onClick={() => onClassClick?.(cls)}
                        className="absolute left-1 right-1 rounded-lg px-2 py-1 text-xs overflow-hidden transition-all hover:opacity-90 hover:shadow-md"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: `${cls.color || '#2563EB'}20`,
                          borderLeft: `3px solid ${cls.color || '#2563EB'}`,
                        }}
                      >
                        <div className="flex items-center gap-1" style={{ color: cls.color || '#2563EB' }}>
                          <IconBook size={10} />
                          <span className="font-semibold truncate">{cls.course_code}</span>
                        </div>
                        {cls.start_time && (
                          <div className="text-[10px] text-slate-500 truncate">
                            {formatTimeDisplay(cls.start_time)}
                          </div>
                        )}
                        {cls.location && height > 50 && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {cls.location}
                          </div>
                        )}
                      </button>
                    );
                  })}

                  {/* Events */}
                  {dayEvents.map((event, idx) => {
                    const eventTime = event.start_date.includes('T')
                      ? event.start_date.split('T')[1]?.substring(0, 5) || '09:00'
                      : '09:00';
                    const { top, height } = getTimePosition(eventTime, null);
                    
                    return (
                      <button
                        key={event.id}
                        onClick={() => onEventClick?.(event)}
                        className="absolute left-1 right-1 rounded-lg px-2 py-1 text-xs overflow-hidden transition-all hover:opacity-90 hover:shadow-md bg-green-50 border-l-[3px] border-green-500"
                        style={{
                          top: `${top}px`,
                          minHeight: '30px',
                        }}
                      >
                        <div className="flex items-center gap-1 text-green-700">
                          <IconFlag size={10} />
                          <span className="font-medium truncate">{event.title}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 px-6 py-3 border-t border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Team Events</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>Classes</span>
        </div>
      </div>
    </div>
  );
}
