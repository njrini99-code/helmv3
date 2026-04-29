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
    <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 md:py-5 flex-shrink-0 min-w-0">
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        <button
          type="button"
          onClick={toggleMobile}
          className={cn(
            'lg:hidden p-2.5 -ml-2 rounded-2xl',
            'text-warm-500 hover:text-warm-700 hover:bg-warm-100/65',
            'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
          )}
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Editorial title — sculptural, light weight */}
        <h2 className="text-[20px] md:text-[26px] font-medium text-warm-900 tracking-[-0.022em] truncate min-w-0">
          {getTitle()}
        </h2>

        {/* Navigation — borderless arrows */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={() => onNavigate('prev')}
            aria-label={`Previous ${view}`}
            className={cn(
              'rounded-full transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
              'text-warm-500 hover:text-warm-800 hover:bg-cream-100/70',
              isMobile ? 'w-10 h-10' : 'w-9 h-9',
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
              'rounded-full transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
              'text-warm-500 hover:text-warm-800 hover:bg-cream-100/70',
              isMobile ? 'w-10 h-10' : 'w-9 h-9',
              'flex items-center justify-center'
            )}
          >
            <ChevronRight className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('today')}
          className="pill-soft"
        >
          Today
        </button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* View Toggle — soft segmented control */}
        {!isMobile && (
          <div
            role="radiogroup"
            aria-label="Calendar view"
            className="inline-flex rounded-full p-1 bg-cream-100/70 ring-1 ring-warm-200/50"
          >
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={view === v}
                onClick={() => onViewChange(v)}
                className={cn(
                  'px-4 py-1.5 text-[12.5px] font-medium rounded-full transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  view === v
                    ? 'bg-cream-50 text-warm-900 shadow-[0_1px_2px_rgba(58,50,40,0.05),0_4px_10px_rgba(58,50,40,0.04)]'
                    : 'text-warm-500 hover:text-warm-700'
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
                'inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                secondaryTimezone
                  ? 'px-3 py-1.5 bg-primary-50/70 text-primary-700'
                  : 'px-2.5 py-1.5 text-warm-400 hover:text-warm-700 hover:bg-cream-100/65'
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              {secondaryTimezone && (
                <span className="text-[11.5px]">
                  {TZ_OPTIONS.find(t => t.value === secondaryTimezone)?.label ?? secondaryTimezone.split('/').pop()}
                </span>
              )}
            </button>
            {tzDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 z-50 w-48 rounded-2xl surface-stone py-2 origin-top-right animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-300"
              >
                {secondaryTimezone && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { void triggerHaptic('light'); onSecondaryTimezoneChange(null); setTzDropdownOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-warm-500 hover:bg-cream-50/70 transition-colors duration-300"
                    >
                      Remove overlay
                    </button>
                    <div className="h-px bg-warm-200/35 my-1 mx-4" />
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
                      'w-full text-left px-4 py-2.5 text-[13px] transition-colors duration-300',
                      secondaryTimezone === tz.value
                        ? 'bg-primary-50/55 text-primary-700 font-medium'
                        : 'text-warm-700 hover:bg-cream-50/70'
                    )}
                  >
                    {tz.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Event — soft primary pill */}
        {onAddEvent && !isMobile && (
          <button
            type="button"
            onClick={onAddEvent}
            className={cn(
              'group inline-flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-medium tracking-[-0.005em]',
              'bg-primary-600/95 text-white',
              'shadow-[0_3px_10px_rgba(22,163,74,0.18)]',
              'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_6px_18px_rgba(22,163,74,0.24)]'
            )}
          >
            <Plus className="w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-90" />
            Add Event
          </button>
        )}
      </div>
    </header>
  );
}
