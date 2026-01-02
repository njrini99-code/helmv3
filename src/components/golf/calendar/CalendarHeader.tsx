'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarView = 'day' | 'week' | 'month';

export interface CalendarHeaderProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddEvent?: () => void; // Optional - only coaches can add events
}

export function CalendarHeader({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  onAddEvent,
}: CalendarHeaderProps) {
  // Format title based on view
  const getTitle = () => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }

    // Week and Month views
    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-stone-200/60">
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-stone-900 tracking-tight">
          {getTitle()}
        </h1>

        {/* Navigation arrows - Premium pill style */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('prev')}
            className="
              w-8 h-8 rounded-[10px]
              bg-white/60 backdrop-blur-sm
              border border-stone-200/60
              hover:bg-white hover:border-stone-300/60 hover:scale-105
              active:scale-95
              transition-all duration-200
              flex items-center justify-center
              shadow-[0_1px_3px_rgba(0,0,0,0.04)]
            "
          >
            <ChevronLeft className="w-4 h-4 text-stone-600" />
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="
              w-8 h-8 rounded-[10px]
              bg-white/60 backdrop-blur-sm
              border border-stone-200/60
              hover:bg-white hover:border-stone-300/60 hover:scale-105
              active:scale-95
              transition-all duration-200
              flex items-center justify-center
              shadow-[0_1px_3px_rgba(0,0,0,0.04)]
            "
          >
            <ChevronRight className="w-4 h-4 text-stone-600" />
          </button>
        </div>

        {/* Today Button - Premium ghost style */}
        <button
          onClick={() => onNavigate('today')}
          className="
            px-4 py-2
            rounded-[10px]
            text-sm font-medium text-stone-700
            bg-white/60 backdrop-blur-sm
            border border-stone-200/60
            hover:bg-white hover:border-stone-300/60 hover:text-stone-900
            active:scale-[0.98]
            transition-all duration-200
            shadow-[0_1px_3px_rgba(0,0,0,0.04)]
          "
        >
          Today
        </button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-3">
        {/* View Toggle - Unified pill container */}
        <div className="
          bg-stone-100/80
          p-1
          rounded-full
          inline-flex
          border border-stone-200/50
        ">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={cn(
                // Base styles for ALL states
                'px-4 py-1.5',
                'text-sm font-medium',
                'rounded-full',
                'transition-all duration-200',

                // Conditional styles
                view === v
                  ? [
                      // ACTIVE: White background, shadow, dark text
                      'bg-white',
                      'text-stone-900',
                      'shadow-sm',
                    ]
                  : [
                      // INACTIVE: Transparent, muted text
                      'text-stone-500',
                      'hover:text-stone-700',
                    ]
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Add Event Button - Gradient green with glow */}
        {onAddEvent && (
          <button
            onClick={onAddEvent}
            className="
              inline-flex items-center gap-2
              px-4 py-2

              /* Gradient background */
              bg-gradient-to-br from-emerald-500 to-emerald-600
              text-white

              /* Typography */
              font-medium text-sm

              /* Shape */
              rounded-[10px]

              /* Glow shadow */
              shadow-lg shadow-emerald-500/25

              /* Hover effects */
              transition-all duration-200
              hover:from-emerald-600 hover:to-emerald-700
              hover:shadow-xl hover:shadow-emerald-500/30
              hover:-translate-y-0.5

              /* Active press */
              active:scale-[0.98]

              /* Focus */
              focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2
            "
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>
    </header>
  );
}
