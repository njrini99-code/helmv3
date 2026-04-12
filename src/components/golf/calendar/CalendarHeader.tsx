'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Menu, Globe } from 'lucide-react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSidebarSafe } from '@/contexts/sidebar-context';
import { triggerHaptic } from '@/lib/utils/capacitor';

export type CalendarView = 'day' | 'week' | 'month';

interface CalendarHeaderProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddEvent?: () => void;
  teamTimezone?: string;
  secondaryTimezone?: string | null;
  onSecondaryTimezoneChange?: (tz: string | null) => void;
}

const TZ_OPTIONS = [
  { value: 'America/New_York', label: 'ET' },
  { value: 'America/Chicago', label: 'CT' },
  { value: 'America/Denver', label: 'MT' },
  { value: 'America/Los_Angeles', label: 'PT' },
  { value: 'America/Phoenix', label: 'AZ' },
  { value: 'Pacific/Honolulu', label: 'HI' },
] as const;

export function CalendarHeader({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  onAddEvent,
  teamTimezone,
  secondaryTimezone,
  onSecondaryTimezoneChange,
}: CalendarHeaderProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const sidebar = useSidebarSafe();
  const toggleMobile = sidebar?.toggleMobile ?? (() => {});
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  const tzDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!tzDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (tzDropdownRef.current && !tzDropdownRef.current.contains(e.target as Node)) {
        setTzDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tzDropdownOpen]);

  const getTitle = () => {
    if (view === 'day') {
      // Mobile: "Apr 11" — desktop: "Thursday, April 11, 2026"
      if (isMobile) {
        return currentDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
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
    <header className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 md:py-4 flex-shrink-0 min-w-0">
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
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
        <h2 className="text-base md:text-xl font-bold text-warm-900 tracking-tight truncate min-w-0">
          {getTitle()}
        </h2>

        {/* Navigation — minimal glass arrows */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={() => onNavigate('prev')}
            aria-label={`Previous ${view}`}
            className={cn(
              'rounded-lg transition-[color,background-color,transform] duration-150 active:scale-95',
              'text-warm-500 hover:text-warm-700 hover:bg-warm-100/60',
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
              'rounded-lg transition-[color,background-color,transform] duration-150 active:scale-95',
              'text-warm-500 hover:text-warm-700 hover:bg-warm-100/60',
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
            'rounded-lg text-sm font-medium transition-[color,background-color,transform] duration-150 active:scale-95',
            'text-warm-600 hover:text-warm-800',
            'bg-white/50 hover:bg-white/70 border border-warm-200/40',
            isMobile ? 'px-3 py-2 min-h-[40px]' : 'px-3 py-1.5',
          )}
        >
          Today
        </button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* View Toggle — glass segment control (hidden on mobile) */}
        {!isMobile && (
          <div
            role="radiogroup"
            aria-label="Calendar view"
            className="inline-flex rounded-xl p-1 bg-warm-100/60 border border-warm-300/20"
          >
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={view === v}
                onClick={() => onViewChange(v)}
                className={cn(
                  'px-3.5 py-1.5 text-footnote font-medium rounded-lg transition-[color,background-color,box-shadow] duration-200',
                  view === v
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-400 hover:text-warm-600'
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Timezone Toggle — desktop only */}
        {!isMobile && onSecondaryTimezoneChange && (
          <div ref={tzDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => { void triggerHaptic('light'); setTzDropdownOpen(!tzDropdownOpen); }}
              aria-label={secondaryTimezone ? `Secondary timezone: ${secondaryTimezone}` : 'Add secondary timezone'}
              aria-haspopup="menu"
              aria-expanded={tzDropdownOpen}
              className={cn(
                'flex items-center gap-1.5 rounded-lg text-footnote font-medium transition-[color,background-color,transform] duration-150 active:scale-95',
                secondaryTimezone
                  ? 'px-2.5 py-1.5 bg-primary-50 text-primary-700 border border-primary-200/60'
                  : 'px-2 py-1.5 text-warm-400 hover:text-warm-600 hover:bg-warm-100/60'
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              {secondaryTimezone && (
                <span className="text-xs">
                  {TZ_OPTIONS.find(t => t.value === secondaryTimezone)?.label ?? secondaryTimezone.split('/').pop()}
                </span>
              )}
            </button>
            {tzDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-2xl bg-white/95 backdrop-blur-xl border border-warm-200/50 shadow-[0_12px_40px_rgba(16,24,40,0.14)] py-1.5 origin-top-right animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-180"
              >
                {secondaryTimezone && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { void triggerHaptic('light'); onSecondaryTimezoneChange(null); setTzDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2.5 min-h-[40px] text-[14px] font-medium text-warm-500 hover:bg-warm-100/60 active:bg-warm-100/80 transition-colors"
                    >
                      Remove overlay
                    </button>
                    <div className="h-px bg-warm-200/50 my-1" />
                  </>
                )}
                {TZ_OPTIONS
                  .filter(tz => tz.value !== teamTimezone)
                  .map(tz => (
                  <button
                    key={tz.value}
                    type="button"
                    role="menuitem"
                    onClick={() => { void triggerHaptic('light'); onSecondaryTimezoneChange(tz.value); setTzDropdownOpen(false); }}
                    className={cn(
                      'w-full text-left px-3 py-2.5 min-h-[40px] text-[14px] transition-colors',
                      secondaryTimezone === tz.value
                        ? 'bg-primary-50/70 text-primary-700 font-semibold'
                        : 'text-warm-800 font-medium hover:bg-warm-100/60 active:bg-warm-100/80'
                    )}
                  >
                    {tz.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Event Button — brand green (hidden on mobile, uses FAB) */}
        {onAddEvent && !isMobile && (
          <button
            type="button"
            onClick={onAddEvent}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-[transform,box-shadow] duration-150 bg-gradient-to-br from-primary-500 to-primary-600 shadow-[0_2px_10px_rgba(22,163,74,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>
    </header>
  );
}
