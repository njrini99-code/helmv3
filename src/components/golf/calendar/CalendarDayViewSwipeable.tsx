'use client';

/**
 * CalendarDayViewSwipeable - Mobile-optimized day view with swipe navigation
 *
 * Features:
 * - Swipe left/right to navigate between days
 * - Smooth transitions between days
 * - Touch-optimized event cards
 * - Pull-to-refresh support
 * - Large touch targets throughout
 * - Today indicator and quick navigation
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  format,
  parseISO,
  addDays,
  subDays,
  isToday,
  isSameDay,
  startOfDay,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { MobileEventCard } from './MobileEventCard';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPResponse } from './MobileRSVPButtons';
import { useHapticFeedback } from '@/hooks/use-mobile-detection';

interface CalendarDayViewSwipeableProps {
  events: CalendarEvent[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPResponse>;
  onRsvp?: (eventId: string, response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  onEventClick?: (event: CalendarEvent) => void;
  onAddEvent?: () => void;
  onRefresh?: () => Promise<void>;
  className?: string;
}

// Swipe threshold in pixels
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export function CalendarDayViewSwipeable({
  events,
  currentDate,
  onDateChange,
  isCoach,
  userRsvpStatuses,
  onRsvp,
  onEventClick,
  onAddEvent,
  onRefresh,
  className,
}: CalendarDayViewSwipeableProps) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { triggerHaptic } = useHapticFeedback();

  // Filter events for current date
  const dayEvents = useMemo(() => {
    return events.filter((event) => {
      const eventDate = parseISO(event.start_date);
      return isSameDay(eventDate, currentDate);
    }).sort((a, b) => {
      return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
    });
  }, [events, currentDate]);

  // Navigation functions
  const goToNextDay = useCallback(() => {
    if (isTransitioning) return;
    triggerHaptic('light');
    setIsTransitioning(true);
    setTouchDelta(-window.innerWidth);

    setTimeout(() => {
      onDateChange(addDays(currentDate, 1));
      setTouchDelta(0);
      setIsTransitioning(false);
    }, 200);
  }, [currentDate, onDateChange, isTransitioning, triggerHaptic]);

  const goToPrevDay = useCallback(() => {
    if (isTransitioning) return;
    triggerHaptic('light');
    setIsTransitioning(true);
    setTouchDelta(window.innerWidth);

    setTimeout(() => {
      onDateChange(subDays(currentDate, 1));
      setTouchDelta(0);
      setIsTransitioning(false);
    }, 200);
  }, [currentDate, onDateChange, isTransitioning, triggerHaptic]);

  const goToToday = useCallback(() => {
    if (isSameDay(currentDate, new Date())) return;
    triggerHaptic('medium');
    onDateChange(startOfDay(new Date()));
  }, [currentDate, onDateChange, triggerHaptic]);

  // Touch handlers for swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Check if we're at the top of the scroll (for pull-to-refresh)
    const isAtTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;

    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    });
    setPullDistance(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart || isTransitioning) return;

    const deltaX = e.touches[0].clientX - touchStart.x;
    const deltaY = e.touches[0].clientY - touchStart.y;
    const isAtTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;

    // Determine if horizontal or vertical swipe
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalSwipe && Math.abs(deltaX) > 10) {
      // Prevent default scrolling during horizontal swipe
      e.preventDefault();
      // Add resistance at the edges
      const resistance = 0.4;
      setTouchDelta(deltaX * resistance);
    } else if (deltaY > 0 && isAtTop && onRefresh) {
      // Pull-to-refresh
      e.preventDefault();
      const pullResistance = 0.5;
      setPullDistance(Math.min(deltaY * pullResistance, 100));
    }
  }, [touchStart, isTransitioning, onRefresh]);

  const handleTouchEnd = useCallback(async (e: React.TouchEvent) => {
    if (!touchStart) return;

    const deltaX = e.changedTouches[0].clientX - touchStart.x;
    const deltaY = e.changedTouches[0].clientY - touchStart.y;
    const deltaTime = Date.now() - touchStart.time;
    const velocity = Math.abs(deltaX) / deltaTime;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    // Check for pull-to-refresh
    if (pullDistance > 60 && onRefresh) {
      triggerHaptic('medium');
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);

    // Check for horizontal swipe
    if (isHorizontalSwipe) {
      if (deltaX < -SWIPE_THRESHOLD || (deltaX < 0 && velocity > SWIPE_VELOCITY_THRESHOLD)) {
        goToNextDay();
      } else if (deltaX > SWIPE_THRESHOLD || (deltaX > 0 && velocity > SWIPE_VELOCITY_THRESHOLD)) {
        goToPrevDay();
      } else {
        // Return to center
        setTouchDelta(0);
      }
    } else {
      setTouchDelta(0);
    }

    setTouchStart(null);
  }, [touchStart, pullDistance, onRefresh, goToNextDay, goToPrevDay, triggerHaptic]);

  // Handle RSVP for individual events
  const handleRsvp = useCallback(
    (eventId: string) => async (response: RSVPResponse) => {
      if (!onRsvp) return { success: false, error: 'RSVP not available' };
      return onRsvp(eventId, response);
    },
    [onRsvp]
  );

  // Date display helpers
  const dateLabel = useMemo(() => {
    if (isToday(currentDate)) return 'Today';
    const yesterday = subDays(new Date(), 1);
    const tomorrow = addDays(new Date(), 1);
    if (isSameDay(currentDate, yesterday)) return 'Yesterday';
    if (isSameDay(currentDate, tomorrow)) return 'Tomorrow';
    return format(currentDate, 'EEEE');
  }, [currentDate]);

  const fullDateLabel = format(currentDate, 'MMMM d, yyyy');
  const isTodayDate = isToday(currentDate);

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col h-full overflow-hidden bg-[#FFFEFA]', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="flex items-center justify-center py-3 transition-all duration-200"
          style={{ height: isRefreshing ? 48 : pullDistance }}
        >
          <RefreshCw
            className={cn(
              'w-5 h-5 text-emerald-600',
              isRefreshing && 'animate-spin',
              pullDistance > 60 && !isRefreshing && 'scale-110'
            )}
          />
          {pullDistance > 60 && !isRefreshing && (
            <span className="ml-2 text-sm text-emerald-600 font-medium">Release to refresh</span>
          )}
        </div>
      )}

      {/* Day Navigation Header */}
      <div className="px-4 py-3 border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          {/* Previous day button */}
          <button
            type="button"
            onClick={goToPrevDay}
            disabled={isTransitioning}
            className={cn(
              'flex items-center justify-center',
              'min-w-[44px] min-h-[44px] rounded-xl',
              'bg-white/80 border border-slate-200/50',
              'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
              'transition-all duration-200',
              'touch-manipulation',
              isTransitioning && 'opacity-50'
            )}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Date display */}
          <div className="flex-1 text-center">
            <h2 className={cn(
              'text-lg font-bold',
              isTodayDate ? 'text-emerald-600' : 'text-slate-900'
            )}>
              {dateLabel}
            </h2>
            <p className="text-sm text-slate-500">{fullDateLabel}</p>
          </div>

          {/* Next day button */}
          <button
            type="button"
            onClick={goToNextDay}
            disabled={isTransitioning}
            className={cn(
              'flex items-center justify-center',
              'min-w-[44px] min-h-[44px] rounded-xl',
              'bg-white/80 border border-slate-200/50',
              'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
              'transition-all duration-200',
              'touch-manipulation',
              isTransitioning && 'opacity-50'
            )}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Today quick navigation */}
        {!isTodayDate && (
          <div className="flex justify-center mt-3">
            <button
              type="button"
              onClick={goToToday}
              className={cn(
                'flex items-center gap-1.5',
                'px-4 py-2 rounded-full',
                'bg-emerald-100 text-emerald-700',
                'text-sm font-medium',
                'hover:bg-emerald-200 active:scale-95',
                'transition-all duration-200',
                'touch-manipulation'
              )}
            >
              <Calendar className="w-4 h-4" />
              <span>Go to Today</span>
            </button>
          </div>
        )}
      </div>

      {/* Swipeable content area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          transform: `translateX(${touchDelta}px)`,
          transition: isTransitioning ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        <div className="px-4 py-4">
          {dayEvents.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No events
              </h3>
              <p className="text-sm text-slate-500 max-w-xs mb-6">
                Nothing scheduled for {format(currentDate, 'MMMM d')}
              </p>
              {isCoach && onAddEvent && (
                <button
                  type="button"
                  onClick={onAddEvent}
                  className={cn(
                    'px-5 py-3 rounded-xl font-semibold text-sm',
                    'bg-emerald-600 text-white',
                    'hover:bg-emerald-700 active:scale-95',
                    'transition-all min-h-[48px]',
                    'touch-manipulation'
                  )}
                >
                  Add Event
                </button>
              )}
            </div>
          ) : (
            // Events list
            <div className="space-y-3">
              {/* Event count badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-bold',
                  isTodayDate ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                )}>
                  {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                </span>
              </div>

              {dayEvents.map((event) => (
                <MobileEventCard
                  key={event.id}
                  event={event}
                  userRsvpStatus={userRsvpStatuses?.get(event.id) || null}
                  onRsvp={onRsvp ? handleRsvp(event.id) : undefined}
                  onClick={onEventClick ? () => onEventClick(event) : undefined}
                  isCoach={isCoach}
                />
              ))}
            </div>
          )}

          {/* Bottom padding for safe area */}
          <div className="h-24" />
        </div>
      </div>

      {/* Swipe hint dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <div className={cn(
          'w-1.5 h-1.5 rounded-full transition-colors',
          touchDelta > 20 ? 'bg-emerald-400' : 'bg-slate-300'
        )} />
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <div className={cn(
          'w-1.5 h-1.5 rounded-full transition-colors',
          touchDelta < -20 ? 'bg-emerald-400' : 'bg-slate-300'
        )} />
      </div>
    </div>
  );
}

/**
 * Week quick picker for mobile - horizontal scrolling week selector
 */
export function MobileWeekPicker({
  currentDate,
  onDateSelect,
  events,
}: {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events: CalendarEvent[];
}) {
  const { triggerHaptic } = useHapticFeedback();

  // Generate 14 days centered around today
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const result: Date[] = [];
    for (let i = -3; i <= 10; i++) {
      result.push(addDays(today, i));
    }
    return result;
  }, []);

  // Count events per day
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => {
      const dateKey = format(parseISO(event.start_date), 'yyyy-MM-dd');
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    });
    return counts;
  }, [events]);

  const handleSelect = (date: Date) => {
    triggerHaptic('light');
    onDateSelect(date);
  };

  return (
    <div className="overflow-x-auto scrollbar-hide py-2">
      <div className="flex gap-2 px-4" style={{ width: 'max-content' }}>
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const eventCount = eventCounts.get(dateKey) || 0;
          const isSelected = isSameDay(day, currentDate);
          const isTodayDate = isToday(day);

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => handleSelect(day)}
              className={cn(
                'flex flex-col items-center justify-center',
                'min-w-[52px] min-h-[64px] px-2 py-2 rounded-xl',
                'transition-all duration-200',
                'touch-manipulation',
                isSelected
                  ? 'bg-emerald-600 text-white shadow-md'
                  : isTodayDate
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-white/80 text-slate-700 border border-slate-200/50',
                'hover:scale-105 active:scale-95'
              )}
            >
              <span className="text-[10px] font-medium uppercase opacity-70">
                {format(day, 'EEE')}
              </span>
              <span className="text-lg font-bold">
                {format(day, 'd')}
              </span>
              {eventCount > 0 && (
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full mt-0.5',
                  isSelected ? 'bg-white/80' : 'bg-emerald-500'
                )} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
