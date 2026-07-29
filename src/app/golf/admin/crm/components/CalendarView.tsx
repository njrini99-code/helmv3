'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  setHours,
  setMinutes,
} from 'date-fns';
import { IconChevronLeft, IconChevronRight, IconCalendar, IconPlus } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/fairway';
import { CRM_PRIMARY_ACTION_CLASS } from '../page-contracts';

// ============================================================================
// TYPES
// ============================================================================
export type CRMEventType = 'demo' | 'follow_up' | 'call' | 'meeting' | 'email_reminder' | 'other';
export type CalendarViewMode = 'month' | 'week' | 'day';

export interface CRMEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: CRMEventType;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string | null;
  meeting_url: string | null;
  coach_id: string | null;
  coach_name: string | null;
  coach_school: string | null;
  status: string;
  google_event_id: string | null;
}

interface CalendarViewProps {
  onEventClick?: (event: CRMEvent) => void;
  onSlotClick?: (date: Date) => void;
  onScheduleDemo?: (coachId: string, date: Date) => void;
  googleConnected?: boolean;
  onConnectGoogle?: () => void;
}

// ============================================================================
// EVENT TYPE CONFIG - Using softer colors
// ============================================================================
const EVENT_TYPE_CONFIG: Record<CRMEventType, {
  label: string;
  dotColor: string;
  softBg: string;
  pillBg: string;
  pillText: string;
}> = {
  demo: {
    label: 'Demo',
    dotColor: 'bg-accent-500',
    softBg: 'bg-accent-50',
    pillBg: 'bg-accent-50 border border-accent-200/60',
    pillText: 'text-accent-700',
  },
  follow_up: {
    label: 'Follow-up',
    dotColor: 'bg-fw-warning',
    softBg: 'bg-fw-warning-bg',
    pillBg: 'bg-fw-warning-bg border border-fw-warning-ring',
    pillText: 'text-fw-warning-ink',
  },
  call: {
    label: 'Call',
    dotColor: 'bg-text-tertiary',
    softBg: 'bg-surface-sunken',
    pillBg: 'bg-surface-sunken border border-border-subtle/60',
    pillText: 'text-text-secondary',
  },
  meeting: {
    label: 'Meeting',
    dotColor: 'bg-accent-500',
    softBg: 'bg-accent-50',
    pillBg: 'bg-accent-50 border border-accent-200/60',
    pillText: 'text-accent-800',
  },
  email_reminder: {
    label: 'Email',
    dotColor: 'bg-text-tertiary',
    softBg: 'bg-surface-sunken',
    pillBg: 'bg-surface-sunken border border-border-subtle',
    pillText: 'text-text-secondary',
  },
  other: {
    label: 'Other',
    dotColor: 'bg-text-tertiary',
    softBg: 'bg-surface-sunken',
    pillBg: 'bg-surface-sunken border border-border-subtle',
    pillText: 'text-text-secondary',
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function CalendarView({
  onEventClick,
  onSlotClick,
  googleConnected,
  onConnectGoogle,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CRMEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  const supabase = createClient();

  // ============================================================================
  // COMPUTED DATES
  // ============================================================================
  const dateRange = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return { start, end };
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return { start, end };
    } else {
      return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
    }
  }, [currentDate, viewMode]);

  // ============================================================================
  // FETCH EVENTS
  // ============================================================================
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_crm_events_in_range', {
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
      });

      if (error) throw error;
      setEvents((data || []) as CRMEvent[]);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      // Fallback to direct query
      const { data } = await supabase
        .from('crm_events')
        .select(`
          *,
          coach:crm_coaches(name, school)
        `)
        .gte('start_time', dateRange.start.toISOString())
        .lt('start_time', dateRange.end.toISOString())
        .order('start_time');
      
      setEvents((data || []).map((e: Record<string, unknown>) => ({
        ...e,
        coach_name: (e.coach as Record<string, string>)?.name || null,
        coach_school: (e.coach as Record<string, string>)?.school || null,
      })) as CRMEvent[]);
    } finally {
      setLoading(false);
    }
  }, [supabase, dateRange]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  const navigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
    } else if (viewMode === 'month') {
      setCurrentDate(prev => addMonths(prev, direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      setCurrentDate(prev => addWeeks(prev, direction === 'next' ? 1 : -1));
    } else {
      setCurrentDate(prev => addDays(prev, direction === 'next' ? 1 : -1));
    }
  };

  // ============================================================================
  // RENDER MONTH VIEW
  // ============================================================================
  const renderMonthView = () => {
    const days: Date[] = [];
    let day = dateRange.start;
    while (day <= dateRange.end) {
      days.push(day);
      day = addDays(day, 1);
    }

    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <div className="flex flex-col flex-1">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-border-subtle">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-2 text-center text-eyebrow font-semibold text-text-tertiary uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex-1 flex flex-col">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex-1 grid grid-cols-7 border-b border-border-subtle last:border-b-0 min-h-[100px]">
              {week.map((date) => {
                const dayEvents = events.filter(e => isSameDay(parseISO(e.start_time), date));
                const isCurrentMonth = isSameMonth(date, currentDate);
                const isCurrentDay = isToday(date);

                return (
                  <Button
                    variant="ghost"
                    key={date.toISOString()}
                    onClick={() => onSlotClick?.(date)}
                    className={cn(
                      'block h-auto min-h-0 items-stretch justify-start text-left border-r border-border-subtle last:border-r-0 p-1.5 rounded-none cursor-pointer transition-colors',
                      !isCurrentMonth && 'bg-surface-sunken/20',
                      isCurrentMonth && 'hover:bg-surface-sunken/40',
                      isCurrentDay && 'bg-accent-50/30'
                    )}
                  >
                    <div className={cn(
                      'text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors',
                      isCurrentDay && 'bg-accent-650 text-text-on-accent',
                      !isCurrentDay && !isCurrentMonth && 'text-text-tertiary',
                      !isCurrentDay && isCurrentMonth && 'text-text-secondary'
                    )}>
                      {format(date, 'd')}
                    </div>
                    
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => {
                        const config = EVENT_TYPE_CONFIG[event.event_type];
                        return (
                          <Button
                            variant="ghost"
                            key={event.id}
                            onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                            onMouseEnter={() => setHoveredEvent(event.id)}
                            onMouseLeave={() => setHoveredEvent(null)}
                            className={cn(
                              'flex h-auto min-h-0 items-center gap-1 text-eyebrow leading-tight px-1.5 py-[3px] rounded-fw-sm truncate cursor-pointer transition-all font-medium w-full text-left justify-start',
                              config.pillBg,
                              config.pillText,
                              hoveredEvent === event.id && 'ring-1 ring-offset-1 ring-border-strong shadow-flat'
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dotColor)} />
                            <span className="truncate">{event.title}</span>
                          </Button>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-eyebrow text-text-tertiary pl-1 font-medium">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER WEEK VIEW
  // ============================================================================
  const renderWeekView = () => {
    const days: Date[] = [];
    let day = dateRange.start;
    while (day <= dateRange.end) {
      days.push(day);
      day = addDays(day, 1);
    }

    const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Day Headers */}
        <div className="flex border-b border-border-subtle sticky top-0 border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] z-10">
          <div className="w-16 shrink-0" />
          {days.map((date) => (
            <div
              key={date.toISOString()}
              className={cn(
                'flex-1 py-2.5 text-center border-l border-border-subtle',
                isToday(date) && 'bg-accent-50/30'
              )}
            >
              <div className="text-eyebrow font-semibold text-text-tertiary uppercase tracking-wider">{format(date, 'EEE')}</div>
              <div className={cn(
                'text-base font-bold mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full',
                isToday(date) ? 'bg-accent-650 text-text-on-accent' : 'text-text-primary'
              )}>
                {format(date, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            {/* Time Labels */}
            <div className="w-16 shrink-0">
              {hours.map((hour) => (
                <div key={hour} className="h-16 border-b border-border-subtle pr-2 text-right">
                  <span className="text-eyebrow text-text-tertiary font-medium">
                    {format(setHours(new Date(), hour), 'h a')}
                  </span>
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {days.map((date) => {
              const dayEvents = events.filter(e => isSameDay(parseISO(e.start_time), date));

              return (
                <div
                  key={date.toISOString()}
                  className="flex-1 border-l border-border-subtle relative"
                >
                  {hours.map((hour) => (
                    <Button
                      variant="ghost"
                      key={hour}
                      className="block h-16 min-h-0 w-full rounded-none border-b border-border-subtle hover:bg-surface-sunken/60 cursor-pointer transition-colors"
                      onClick={() => onSlotClick?.(setHours(setMinutes(date, 0), hour))}
                    >
                      <span className="sr-only">Schedule at {format(setHours(new Date(), hour), 'h a')}</span>
                    </Button>
                  ))}
                  
                  {/* Events */}
                  {dayEvents.map((event) => {
                    const startTime = parseISO(event.start_time);
                    const endTime = parseISO(event.end_time);
                    const startHour = startTime.getHours();
                    const startMinute = startTime.getMinutes();
                    const duration = differenceInMinutes(endTime, startTime);
                    
                    const top = ((startHour - 7) * 64) + ((startMinute / 60) * 64);
                    const height = Math.max((duration / 60) * 64, 24);
                    
                    const config = EVENT_TYPE_CONFIG[event.event_type];
                    
                    return (
                      <Button
                        variant="ghost"
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                        onMouseEnter={() => setHoveredEvent(event.id)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        className={cn(
                          'block h-auto min-h-0 absolute left-1 right-1 rounded-fw-sm px-2 py-1 cursor-pointer transition-all overflow-hidden text-left',
                          config.softBg,
                          hoveredEvent === event.id && 'ring-1 ring-border-strong shadow-soft z-10'
                        )}
                        style={{ top: `${top}px`, height: `${height}px`, minHeight: '24px' }}
                      >
                        <div className="flex items-center gap-1 text-xs font-semibold text-text-primary truncate">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dotColor)} />
                          <span className="truncate">{event.title}</span>
                        </div>
                        {height > 40 && (
                          <div className="text-eyebrow text-text-tertiary truncate">
                            {format(startTime, 'h:mm a')}
                          </div>
                        )}
                        {height > 60 && event.coach_name && (
                          <div className="text-eyebrow text-text-tertiary truncate">
                            {event.coach_name}
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER DAY VIEW
  // ============================================================================
  const renderDayView = () => {
    const hours = Array.from({ length: 14 }, (_, i) => i + 7);
    const dayEvents = events.filter(e => isSameDay(parseISO(e.start_time), currentDate));

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Day Header */}
        <div className="p-5 border-b border-border-subtle border border-border-subtle bg-surface-tint">
          <div className={cn(
            'text-2xl font-bold',
            isToday(currentDate) ? 'text-accent-700' : 'text-text-primary'
          )}>
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </div>
          <div className="text-sm text-text-tertiary mt-1">
            {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''} scheduled
          </div>
        </div>

        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            {/* Time Labels */}
            <div className="w-20 shrink-0">
              {hours.map((hour) => (
                <div key={hour} className="h-20 border-b border-border-subtle pr-3 text-right">
                  <span className="text-xs text-text-tertiary font-medium">
                    {format(setHours(new Date(), hour), 'h:mm a')}
                  </span>
                </div>
              ))}
            </div>

            {/* Event Column */}
            <div className="flex-1 border-l border-border-subtle relative">
              {hours.map((hour) => (
                <Button
                  variant="ghost"
                  key={hour}
                  className="block h-20 min-h-0 w-full rounded-none border-b border-border-subtle hover:bg-surface-sunken/60 cursor-pointer transition-colors"
                  onClick={() => onSlotClick?.(setHours(setMinutes(currentDate, 0), hour))}
                >
                  <span className="sr-only">Schedule at {format(setHours(new Date(), hour), 'h:mm a')}</span>
                </Button>
              ))}

              {/* Events */}
              {dayEvents.map((event) => {
                const startTime = parseISO(event.start_time);
                const endTime = parseISO(event.end_time);
                const startHour = startTime.getHours();
                const startMinute = startTime.getMinutes();
                const duration = differenceInMinutes(endTime, startTime);

                const top = ((startHour - 7) * 80) + ((startMinute / 60) * 80);
                const height = Math.max((duration / 60) * 80, 40);

                const config = EVENT_TYPE_CONFIG[event.event_type];

                return (
                  <Button
                    variant="ghost"
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                    onMouseEnter={() => setHoveredEvent(event.id)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    className={cn(
                      'block h-auto min-h-0 absolute left-2 right-4 rounded-fw-md px-4 py-2.5 cursor-pointer transition-all text-left',
                      config.softBg,
                      'shadow-flat',
                      hoveredEvent === event.id && 'ring-1 ring-border-strong shadow-soft z-10'
                    )}
                    style={{ top: `${top}px`, height: `${height}px`, minHeight: '40px' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', config.dotColor)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-text-primary truncate">{event.title}</div>
                        <div className="text-sm text-text-tertiary">
                          {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                        </div>
                      </div>
                    </div>
                    {height > 80 && event.coach_name && (
                      <div className="mt-1.5 text-sm text-text-tertiary">
                        {event.coach_name} {event.coach_school ? `\u00B7 ${event.coach_school}` : ''}
                      </div>
                    )}
                    {height > 100 && event.location && (
                      <div className="text-sm text-text-tertiary mt-0.5">
                        {event.location}
                      </div>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className={cn(
      'flex flex-col h-[calc(100dvh-220px)] min-h-[500px]',
      'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]',
      'rounded-card p-5',
      'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          {/* Current Period Label */}
          <h2 className="text-lg font-bold text-text-primary tracking-tight">
            {viewMode === 'month' && format(currentDate, 'MMMM yyyy')}
            {viewMode === 'week' && `Week of ${format(dateRange.start, 'MMM d')} - ${format(dateRange.end, 'MMM d, yyyy')}`}
            {viewMode === 'day' && format(currentDate, 'MMMM d, yyyy')}
          </h2>

          {/* Navigation */}
          <div className="flex items-center gap-0.5">
            <IconButton variant="default" aria-label="Previous"
              onClick={() => navigate('prev')}
              className="p-1.5 rounded-fw-sm hover:bg-surface-sunken active:bg-surface-sunken text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <IconChevronLeft size={16} />
            </IconButton>
            <Button variant="ghost"
              onClick={() => navigate('today')}
              className="px-2.5 py-1 rounded-fw-sm text-xs font-semibold text-text-tertiary hover:bg-surface-sunken active:bg-surface-sunken hover:text-text-secondary transition-colors uppercase tracking-wide"
            >
              Today
            </Button>
            <IconButton variant="default" aria-label="Next"
              onClick={() => navigate('next')}
              className="p-1.5 rounded-fw-sm hover:bg-surface-sunken active:bg-surface-sunken text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <IconChevronRight size={16} />
            </IconButton>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className={cn(
            'flex items-center p-0.5 rounded-fw-sm',
            'bg-surface-sunken/70 border border-border-subtle'
          )}>
            {(['month', 'week', 'day'] as const).map((view) => (
              <Button variant="ghost"
                key={view}
                onClick={() => setViewMode(view)}
                className={cn(
                  'px-3 py-1.5 rounded-fw-sm text-xs font-semibold transition-all capitalize',
                  viewMode === view
                    ? 'bg-surface text-text-primary shadow-flat'
                    : 'text-text-tertiary hover:text-text-secondary'
                )}
              >
                {view}
              </Button>
            ))}
          </div>

          {/* Google Calendar Status */}
          {googleConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-50/80 text-accent-700 rounded-fw-sm text-xs font-medium border border-accent-200/40">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Synced</span>
            </div>
          ) : (
            <Button variant="ghost"
              onClick={onConnectGoogle}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-fw-sm text-xs font-medium transition-colors',
                'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] text-text-tertiary',
                'hover:bg-surface-tint active:bg-canvas hover:text-text-secondary'
              )}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Connect Google</span>
            </Button>
          )}

          {/* Legend */}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-surface-sunken/60 rounded-fw-sm border border-border-subtle">
            {(['demo', 'follow_up', 'call', 'meeting'] as const).map((type) => {
              const config = EVENT_TYPE_CONFIG[type];
              return (
                <div key={type} className="flex items-center gap-1.5 text-eyebrow">
                  <span className={cn('w-2 h-2 rounded-full', config.dotColor)} />
                  <span className="text-text-tertiary font-medium">{config.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Calendar Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="space-y-3 w-48">
              <div className="h-4 w-full bg-surface-sunken rounded skeleton-shimmer" />
              <div className="h-4 w-3/4 bg-surface-sunken rounded skeleton-shimmer" />
              <div className="h-4 w-1/2 bg-surface-sunken rounded skeleton-shimmer" />
            </div>
            <span className="text-text-tertiary text-sm font-medium">Loading events...</span>
          </div>
        </div>
      ) : events.length === 0 && viewMode === 'month' ? (
        <EmptyState
          className="flex-1"
          icon={<IconCalendar size={28} />}
          title="No events scheduled"
          description="Schedule your first demo or follow-up to start tracking your outreach pipeline."
          action={
            <Button
              variant="primary"
              onClick={() => onSlotClick?.(new Date())}
              className={cn(CRM_PRIMARY_ACTION_CLASS, 'gap-2')}
            >
              <IconPlus size={16} />
              Schedule event
            </Button>
          }
        />
      ) : (
        <>
          {viewMode === 'month' && renderMonthView()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'day' && renderDayView()}
        </>
      )}
    </div>
  );
}
