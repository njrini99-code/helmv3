'use client';

import { useState, useEffect, useMemo } from 'react';
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
// EVENT TYPE CONFIG
// ============================================================================
const EVENT_TYPE_CONFIG: Record<CRMEventType, { 
  label: string; 
  icon: string; 
  bgColor: string; 
  textColor: string;
  borderColor: string;
}> = {
  demo: { 
    label: 'Demo', 
    icon: '🖥️', 
    bgColor: 'bg-violet-500', 
    textColor: 'text-white',
    borderColor: 'border-violet-600',
  },
  follow_up: { 
    label: 'Follow-up', 
    icon: '📞', 
    bgColor: 'bg-blue-500', 
    textColor: 'text-white',
    borderColor: 'border-blue-600',
  },
  call: { 
    label: 'Call', 
    icon: '☎️', 
    bgColor: 'bg-emerald-500', 
    textColor: 'text-white',
    borderColor: 'border-emerald-600',
  },
  meeting: { 
    label: 'Meeting', 
    icon: '🤝', 
    bgColor: 'bg-amber-500', 
    textColor: 'text-white',
    borderColor: 'border-amber-600',
  },
  email_reminder: { 
    label: 'Email', 
    icon: '✉️', 
    bgColor: 'bg-slate-500', 
    textColor: 'text-white',
    borderColor: 'border-slate-600',
  },
  other: { 
    label: 'Other', 
    icon: '📌', 
    bgColor: 'bg-gray-500', 
    textColor: 'text-white',
    borderColor: 'border-gray-600',
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
  useEffect(() => {
    fetchEvents();
  }, [dateRange]);

  const fetchEvents = async () => {
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
  };

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
        <div className="grid grid-cols-7 border-b border-slate-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-slate-500 bg-slate-50">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex-1 flex flex-col">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex-1 grid grid-cols-7 border-b border-slate-100 min-h-[100px]">
              {week.map((date) => {
                const dayEvents = events.filter(e => isSameDay(parseISO(e.start_time), date));
                const isCurrentMonth = isSameMonth(date, currentDate);
                const isCurrentDay = isToday(date);

                return (
                  <div
                    key={date.toISOString()}
                    onClick={() => onSlotClick?.(date)}
                    className={cn(
                      'border-r border-slate-100 p-1 cursor-pointer transition-colors hover:bg-slate-50',
                      !isCurrentMonth && 'bg-slate-50/50'
                    )}
                  >
                    <div className={cn(
                      'text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full',
                      isCurrentDay && 'bg-emerald-500 text-white',
                      !isCurrentDay && !isCurrentMonth && 'text-slate-400',
                      !isCurrentDay && isCurrentMonth && 'text-slate-700'
                    )}>
                      {format(date, 'd')}
                    </div>
                    
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => {
                        const config = EVENT_TYPE_CONFIG[event.event_type];
                        return (
                          <div
                            key={event.id}
                            onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                            onMouseEnter={() => setHoveredEvent(event.id)}
                            onMouseLeave={() => setHoveredEvent(null)}
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer transition-all',
                              config.bgColor,
                              config.textColor,
                              hoveredEvent === event.id && 'ring-2 ring-offset-1 ring-slate-400 scale-[1.02]'
                            )}
                          >
                            {config.icon} {event.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-slate-500 pl-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
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
        <div className="flex border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="w-16 shrink-0" />
          {days.map((date) => (
            <div
              key={date.toISOString()}
              className={cn(
                'flex-1 p-2 text-center border-l border-slate-100',
                isToday(date) && 'bg-emerald-50'
              )}
            >
              <div className="text-xs font-medium text-slate-500">{format(date, 'EEE')}</div>
              <div className={cn(
                'text-lg font-bold',
                isToday(date) ? 'text-emerald-600' : 'text-slate-800'
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
                <div key={hour} className="h-16 border-b border-slate-100 pr-2 text-right">
                  <span className="text-xs text-slate-400">
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
                  className="flex-1 border-l border-slate-100 relative"
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="h-16 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => onSlotClick?.(setHours(setMinutes(date, 0), hour))}
                    />
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
                      <div
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                        onMouseEnter={() => setHoveredEvent(event.id)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        className={cn(
                          'absolute left-1 right-1 rounded-lg px-2 py-1 cursor-pointer transition-all overflow-hidden',
                          config.bgColor,
                          config.textColor,
                          'border-l-4',
                          config.borderColor,
                          hoveredEvent === event.id && 'ring-2 ring-offset-1 ring-slate-500 shadow-lg z-10'
                        )}
                        style={{ top: `${top}px`, height: `${height}px`, minHeight: '24px' }}
                      >
                        <div className="text-xs font-semibold truncate">
                          {config.icon} {event.title}
                        </div>
                        {height > 40 && (
                          <div className="text-xs opacity-80 truncate">
                            {format(startTime, 'h:mm a')}
                          </div>
                        )}
                        {height > 60 && event.coach_name && (
                          <div className="text-xs opacity-80 truncate">
                            {event.coach_name}
                          </div>
                        )}
                      </div>
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
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className={cn(
            'text-2xl font-bold',
            isToday(currentDate) ? 'text-emerald-600' : 'text-slate-800'
          )}>
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </div>
          <div className="text-sm text-slate-500 mt-1">
            {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''} scheduled
          </div>
        </div>

        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            {/* Time Labels */}
            <div className="w-20 shrink-0">
              {hours.map((hour) => (
                <div key={hour} className="h-20 border-b border-slate-100 pr-3 text-right">
                  <span className="text-sm text-slate-500">
                    {format(setHours(new Date(), hour), 'h:mm a')}
                  </span>
                </div>
              ))}
            </div>

            {/* Event Column */}
            <div className="flex-1 border-l border-slate-200 relative">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="h-20 border-b border-slate-100 hover:bg-emerald-50/50 cursor-pointer transition-colors"
                  onClick={() => onSlotClick?.(setHours(setMinutes(currentDate, 0), hour))}
                />
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
                  <div
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                    onMouseEnter={() => setHoveredEvent(event.id)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    className={cn(
                      'absolute left-2 right-4 rounded-xl px-4 py-2 cursor-pointer transition-all',
                      config.bgColor,
                      config.textColor,
                      'border-l-4',
                      config.borderColor,
                      'shadow-sm',
                      hoveredEvent === event.id && 'ring-2 ring-offset-2 ring-slate-500 shadow-xl z-10 scale-[1.01]'
                    )}
                    style={{ top: `${top}px`, height: `${height}px`, minHeight: '40px' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{event.title}</div>
                        <div className="text-sm opacity-90">
                          {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                        </div>
                      </div>
                    </div>
                    {height > 80 && event.coach_name && (
                      <div className="mt-2 text-sm opacity-90">
                        📋 {event.coach_name} • {event.coach_school}
                      </div>
                    )}
                    {height > 100 && event.location && (
                      <div className="text-sm opacity-80 mt-1">
                        📍 {event.location}
                      </div>
                    )}
                  </div>
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
    <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-lg flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/20 bg-white/50">
        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex items-center bg-white/50 backdrop-blur-sm rounded-xl p-1 border border-white/30">
            {(['month', 'week', 'day'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setViewMode(view)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize',
                  viewMode === view
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                    : 'text-warm-600 hover:text-warm-900 hover:bg-white/60'
                )}
              >
                {view}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('prev')}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => navigate('today')}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigate('next')}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Current Period Label */}
          <h2 className="text-lg font-bold text-slate-800">
            {viewMode === 'month' && format(currentDate, 'MMMM yyyy')}
            {viewMode === 'week' && `Week of ${format(dateRange.start, 'MMM d')} - ${format(dateRange.end, 'MMM d, yyyy')}`}
            {viewMode === 'day' && format(currentDate, 'MMMM d, yyyy')}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Google Calendar Status */}
          {googleConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Synced</span>
            </div>
          ) : (
            <button
              onClick={onConnectGoogle}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Connect Google Calendar</span>
            </button>
          )}

          {/* Legend */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
            {(['demo', 'follow_up', 'call'] as const).map((type) => {
              const config = EVENT_TYPE_CONFIG[type];
              return (
                <div key={type} className="flex items-center gap-1 text-xs">
                  <span>{config.icon}</span>
                  <span className="text-slate-600">{config.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Calendar Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
            <span className="text-slate-500 text-sm">Loading events...</span>
          </div>
        </div>
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
