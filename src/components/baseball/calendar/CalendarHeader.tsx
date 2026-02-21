'use client';

import { ChevronLeft, ChevronRight, Plus, List, CalendarDays, Menu, LayoutGrid } from 'lucide-react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

export type BaseballCalendarView = 'day' | 'week' | 'month' | 'list';

export interface CalendarHeaderProps {
  view: BaseballCalendarView;
  onViewChange: (view: BaseballCalendarView) => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddEvent?: () => void;
  onToggleMobileMenu?: () => void;
}

export function CalendarHeader({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  onAddEvent,
  onToggleMobileMenu,
}: CalendarHeaderProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

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
        return `${format(ws, 'MMM d, yyyy')} \u2013 ${format(we, 'MMM d, yyyy')}`;
      } else if (startMonth !== endMonth) {
        return `${format(ws, 'MMM d')} \u2013 ${format(we, 'MMM d, yyyy')}`;
      } else {
        return `${format(ws, 'MMM d')} \u2013 ${format(we, 'd, yyyy')}`;
      }
    }

    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const title = getTitle();

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile hamburger */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className={cn(
              'lg:hidden p-2.5 -ml-2 rounded-xl',
              'text-warm-500 hover:text-warm-700 hover:bg-warm-100/80',
              'transition-colors duration-150 active:scale-95',
            )}
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
          {title}
        </h1>

        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={() => onNavigate('prev')}
            aria-label="Previous month"
            className={cn(
              'rounded-lg transition-all duration-150 active:scale-95',
              'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60',
              isMobile ? 'w-12 h-12' : 'w-8 h-8',
              'flex items-center justify-center',
            )}
          >
            <ChevronLeft className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('next')}
            aria-label="Next month"
            className={cn(
              'rounded-lg transition-all duration-150 active:scale-95',
              'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60',
              isMobile ? 'w-12 h-12' : 'w-8 h-8',
              'flex items-center justify-center',
            )}
          >
            <ChevronRight className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('today')}
          className={cn(
            'rounded-lg text-sm font-medium transition-all duration-150 active:scale-95',
            'text-slate-600 hover:text-slate-800',
            'bg-white/50 hover:bg-white/70 border border-slate-200/40',
            isMobile ? 'px-3 py-2 min-h-[40px]' : 'px-3 py-1.5',
          )}
        >
          Today
        </button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* View Toggle - Desktop: Day/Week/Month, Mobile: Day/List */}
        <div
          className="inline-flex rounded-xl p-1"
          style={{
            background: 'rgba(245, 243, 240, 0.6)',
            border: '1px solid rgba(214, 211, 209, 0.2)',
          }}
        >
          {(isMobile
            ? [
                { key: 'day' as const, icon: CalendarDays, label: 'Day' },
                { key: 'list' as const, icon: List, label: 'List' },
              ]
            : [
                { key: 'day' as const, icon: CalendarDays, label: 'Day' },
                { key: 'week' as const, icon: LayoutGrid, label: 'Week' },
                { key: 'month' as const, icon: CalendarDays, label: 'Month' },
              ]
          ).map(({ key, icon: Icon, label }) => (
            <button
              type="button"
              key={key}
              onClick={() => onViewChange(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200',
                view === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {!isMobile && <span>{label}</span>}
            </button>
          ))}
        </div>

        {/* Add Event Button - desktop only, FAB used on mobile */}
        {onAddEvent && !isMobile && (
          <button
            type="button"
            onClick={onAddEvent}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              boxShadow:
                '0 2px 10px rgba(22, 163, 74, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>
    </header>
  );
}
