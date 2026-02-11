'use client';

import { ChevronLeft, ChevronRight, Plus, Menu } from 'lucide-react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSidebar } from '@/contexts/sidebar-context';

export type CalendarView = 'day' | 'week' | 'month';

export interface CalendarHeaderProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddEvent?: () => void;
}

export function CalendarHeader({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  onAddEvent,
}: CalendarHeaderProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { toggleMobile } = useSidebar();

  const getTitle = () => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }

    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      const startYear = ws.getFullYear();
      const endYear = we.getFullYear();
      const startMonth = format(ws, 'MMM');
      const endMonth = format(we, 'MMM');

      if (startYear !== endYear) {
        // Cross year: "Dec 30, 2024 - Jan 5, 2025"
        return `${format(ws, 'MMM d, yyyy')} \u2013 ${format(we, 'MMM d, yyyy')}`;
      } else if (startMonth !== endMonth) {
        // Cross month: "Dec 30 - Jan 5, 2025"
        return `${format(ws, 'MMM d')} \u2013 ${format(we, 'MMM d, yyyy')}`;
      } else {
        // Same month: "Jan 6 - 12, 2025"
        return `${format(ws, 'MMM d')} \u2013 ${format(we, 'd, yyyy')}`;
      }
    }

    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile hamburger menu */}
        <button
          type="button"
          onClick={toggleMobile}
          className={cn(
            'lg:hidden p-2.5 -ml-2 rounded-xl',
            'text-warm-500 hover:text-warm-700 hover:bg-warm-100/80',
            'transition-colors duration-150 active:scale-95',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
          )}
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Title — larger, bolder */}
        <h2 className="text-lg md:text-xl font-bold text-stone-900 tracking-tight">
          {getTitle()}
        </h2>

        {/* Navigation — minimal glass arrows */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={() => onNavigate('prev')}
            aria-label={`Previous ${view}`}
            className={cn(
              'rounded-lg transition-all duration-150 active:scale-95',
              'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60',
              isMobile ? 'w-12 h-12' : 'w-8 h-8',
              'flex items-center justify-center'
            )}
          >
            <ChevronLeft className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('next')}
            aria-label={`Next ${view}`}
            className={cn(
              'rounded-lg transition-all duration-150 active:scale-95',
              'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60',
              isMobile ? 'w-12 h-12' : 'w-8 h-8',
              'flex items-center justify-center'
            )}
          >
            <ChevronRight className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        </div>

        {/* Today Button — clean pill */}
        <button
          type="button"
          onClick={() => onNavigate('today')}
          className={cn(
            'rounded-lg text-sm font-medium transition-all duration-150 active:scale-95',
            'text-stone-600 hover:text-stone-800',
            'bg-white/50 hover:bg-white/70 border border-stone-200/40',
            isMobile ? 'px-3 py-2 min-h-[40px]' : 'px-3 py-1.5',
          )}
        >
          Today
        </button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* View Toggle — glass segment control (hidden on mobile) */}
        {!isMobile && (
          <div
            role="radiogroup"
            aria-label="Calendar view"
            className="inline-flex rounded-xl p-1 bg-stone-100/60 border border-stone-300/20"
          >
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={view === v}
                onClick={() => onViewChange(v)}
                className={cn(
                  'px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200',
                  view === v
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-400 hover:text-stone-600'
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Add Event Button — brand green (hidden on mobile, uses FAB) */}
        {onAddEvent && !isMobile && (
          <button
            type="button"
            onClick={onAddEvent}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all duration-150 bg-gradient-to-br from-green-500 to-green-600 shadow-[0_2px_10px_rgba(22,163,74,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>
    </header>
  );
}
