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

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  format,
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

  // Filter events for current date — use new Date() consistently (handles both ISO and timestamptz)
  const dayEvents = useMemo(() => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_date);
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
    const touch = e.touches[0];
    if (!touch) return;

    setTouchStart({
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    });
    setPullDistance(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart || isTransitioning) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
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

    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
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
      className={cn('flex flex-col h-full overflow-hidden', className)}
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
              'w-5 h-5 text-primary-600',
              isRefreshing && 'animate-spin',
              pullDistance > 60 && !isRefreshing && 'scale-110'
            )}
          />
          {pullDistance > 60 && !isRefreshing && (
            <span className="ml-2 text-sm text-primary-600 font-medium">Release to refresh</span>
          )}
        </div>
      )}

      {/* Compact Day Navigation Header */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          {/* Left: Date info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className={cn(
                'text-xl font-bold tracking-tight',
                isTodayDate ? 'text-primary-600' : 'text-warm-900'
              )}>
                {dateLabel}
              </h2>
              {isTodayDate && (
                <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wide bg-primary-100 text-primary-700 rounded-full">
                  Now
                </span>
              )}
            </div>
            <p className="text-sm text-warm-500 mt-0.5">{fullDateLabel}</p>
          </div>

          {/* Right: Navigation controls */}
          <div className="flex items-center gap-1">
            {/* Today button (only when not on today) */}
            {!isTodayDate && (
              <button
                type="button"
                onClick={goToToday}
                className={cn(
                  'flex items-center justify-center',
                  'w-10 h-10 rounded-xl',
                  'bg-primary-100 text-primary-700',
                  'hover:bg-primary-200 active:scale-95',
                  'transition-all duration-200',
                  'touch-manipulation mr-1'
                )}
                aria-label="Go to today"
              >
                <Calendar className="w-4 h-4" />
              </button>
            )}

            {/* Nav buttons */}
            <button
              type="button"
              onClick={goToPrevDay}
              disabled={isTransitioning}
              className={cn(
                'flex items-center justify-center',
                'w-10 h-10 rounded-xl',
                'bg-warm-100/80 text-warm-600',
                'hover:bg-warm-200 active:bg-warm-300 active:scale-95',
                'transition-all duration-200',
                'touch-manipulation',
                isTransitioning && 'opacity-50'
              )}
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goToNextDay}
              disabled={isTransitioning}
              className={cn(
                'flex items-center justify-center',
                'w-10 h-10 rounded-xl',
                'bg-warm-100/80 text-warm-600',
                'hover:bg-warm-200 active:bg-warm-300 active:scale-95',
                'transition-all duration-200',
                'touch-manipulation',
                isTransitioning && 'opacity-50'
              )}
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Swipeable content area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          transform: `translateX(${touchDelta}px)`,
          transition: isTransitioning ? 'transform 0.2s ease-out' : 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="px-4 py-3">
          {dayEvents.length === 0 ? (
            // Premium empty state
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-primary-500/10 rounded-3xl blur-2xl scale-150" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-warm-50 to-warm-100 border border-warm-200/50 flex items-center justify-center shadow-sm">
                  <Calendar className="w-10 h-10 text-warm-300" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-warm-800 mb-1.5">
                Nothing scheduled
              </h3>
              <p className="text-sm text-warm-500 max-w-[200px] mb-8">
                Your {format(currentDate, 'EEEE')} is free
              </p>
              {isCoach && onAddEvent && (
                <button
                  type="button"
                  onClick={onAddEvent}
                  className={cn(
                    'group flex items-center gap-2',
                    'px-6 py-3 rounded-2xl font-semibold text-sm',
                    'bg-primary-600 text-white',
                    'shadow-lg shadow-primary-600/25',
                    'hover:bg-primary-700 hover:shadow-primary-600/30',
                    'active:scale-95',
                    'transition-all duration-200',
                    'touch-manipulation'
                  )}
                >
                  <span className="text-lg leading-none">+</span>
                  <span>Add Event</span>
                </button>
              )}
            </div>
          ) : (
            // Events list with improved styling
            <div className="space-y-3">
              {dayEvents.map((event, index) => (
                <div
                  key={event.id}
                  style={{
                    animationDelay: `${index * 50}ms`
                  }}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <MobileEventCard
                    event={event}
                    userRsvpStatus={userRsvpStatuses?.get(event.id) || null}
                    onRsvp={onRsvp ? handleRsvp(event.id) : undefined}
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    isCoach={isCoach}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Bottom padding for safe area and FAB */}
          <div className="h-28" />
        </div>
      </div>

    </div>
  );
}

/**
 * Week quick picker for mobile - Premium Apple-calendar inspired selector
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generate 21 days centered around today
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const result: Date[] = [];
    for (let i = -7; i <= 13; i++) {
      result.push(addDays(today, i));
    }
    return result;
  }, []);

  // Count events per day — use new Date() consistently
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => {
      const dateKey = format(new Date(event.start_date), 'yyyy-MM-dd');
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    });
    return counts;
  }, [events]);

  const handleSelect = (date: Date) => {
    triggerHaptic('light');
    onDateSelect(date);
  };

  // Scroll to selected date on mount
  useEffect(() => {
    if (scrollRef.current) {
      const selectedIndex = days.findIndex(d => isSameDay(d, currentDate));
      if (selectedIndex >= 0) {
        const itemWidth = 48;
        const gap = 6;
        const containerWidth = scrollRef.current.offsetWidth;
        const scrollPosition = (selectedIndex * (itemWidth + gap)) - (containerWidth / 2) + (itemWidth / 2);
        scrollRef.current.scrollTo({ left: Math.max(0, scrollPosition), behavior: 'smooth' });
      }
    }
  }, [currentDate, days]);

  return (
    <div
      ref={scrollRef}
      className="pills-scroll"
    >
      <div className="flex gap-2 px-3 py-2" style={{ width: 'max-content' }}>
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const eventCount = eventCounts.get(dateKey) || 0;
          const isSelected = isSameDay(day, currentDate);
          const isTodayDate = isToday(day);
          const isPastDate = day < startOfDay(new Date()) && !isTodayDate;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => handleSelect(day)}
              className={cn(
                'flex flex-col items-center justify-center relative',
                'w-12 h-16 rounded-2xl',
                'transition-all duration-200 ease-out',
                'touch-manipulation select-none',
                isSelected
                  ? 'bg-primary-600 shadow-lg shadow-primary-600/30 scale-105'
                  : isTodayDate
                    ? 'bg-primary-50 ring-2 ring-primary-500/30'
                    : 'bg-white/60 hover:bg-white/90',
                isPastDate && !isSelected && 'opacity-50',
                'active:scale-95'
              )}
            >
              {/* Day of week */}
              <span className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                isSelected
                  ? 'text-primary-100'
                  : isTodayDate
                    ? 'text-primary-600'
                    : 'text-warm-400'
              )}>
                {format(day, 'EEE')}
              </span>

              {/* Day number */}
              <span className={cn(
                'text-lg font-bold leading-tight',
                isSelected
                  ? 'text-white'
                  : isTodayDate
                    ? 'text-primary-700'
                    : 'text-warm-800'
              )}>
                {format(day, 'd')}
              </span>

              {/* Event indicator dots */}
              {eventCount > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {Array.from({ length: Math.min(eventCount, 3) }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-1 h-1 rounded-full',
                        isSelected
                          ? 'bg-white/80'
                          : 'bg-primary-500'
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Today ring indicator */}
              {isTodayDate && !isSelected && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-primary-500/40 pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
