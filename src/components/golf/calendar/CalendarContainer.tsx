'use client';

import { useState } from 'react';
import type { GolfEvent } from '@/lib/types/golf';
import { CalendarView, type CalendarClass } from './CalendarView';
import { WeeklyScheduleView } from './WeeklyScheduleView';
import { IconCalendar, IconLayoutGrid } from '@/components/icons';

interface CalendarContainerProps {
  events: GolfEvent[];
  classes?: CalendarClass[];
}

type ViewMode = 'month' | 'week';

export function CalendarContainer({ events, classes = [] }: CalendarContainerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  return (
    <div>
      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewMode('month')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'month'
              ? 'bg-green-600 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <IconCalendar size={16} />
          Month
        </button>
        <button
          onClick={() => setViewMode('week')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'week'
              ? 'bg-green-600 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <IconLayoutGrid size={16} />
          Week
        </button>
      </div>

      {/* Calendar View */}
      {viewMode === 'month' ? (
        <CalendarView events={events} classes={classes} />
      ) : (
        <WeeklyScheduleView events={events} classes={classes} />
      )}
    </div>
  );
}
