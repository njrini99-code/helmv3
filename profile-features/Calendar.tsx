// components/shared/Calendar.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  IconChevronLeft, IconChevronRight, IconPlus, IconClock, IconMapPin,
  IconUsers, IconNote, IconSend, IconX, IconCalendar
} from '@/components/icons';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  event_category: 'practice' | 'game' | 'camp' | 'visit' | 'showcase' | 'other';
  is_public: boolean;
  description?: string;
  practice_plan_id?: string;
}

interface CalendarProps {
  events: CalendarEvent[];
  onDateSelect?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onCreateEvent?: (date: Date) => void;
  canCreateEvents?: boolean;
  showPracticePlanButton?: boolean;
  onCreatePracticePlan?: (date: Date) => void;
}

const categoryColors: Record<string, { bg: string; text: string; dot: string }> = {
  practice: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  game: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  camp: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  visit: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  showcase: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  other: { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-500' },
};

export function Calendar({
  events,
  onDateSelect,
  onEventClick,
  onCreateEvent,
  canCreateEvents = false,
  showPracticePlanButton = false,
  onCreatePracticePlan,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    
    const days: Date[] = [];
    let day = start;
    while (day <= end) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const dateKey = format(new Date(event.start_time), 'yyyy-MM-dd');
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    return map;
  }, [events]);

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const selectedDateEvents = selectedDate 
    ? eventsByDate.get(format(selectedDate, 'yyyy-MM-dd')) || []
    : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <IconChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <IconChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {canCreateEvents && (
          <button
            onClick={() => onCreateEvent?.(selectedDate || new Date())}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <IconPlus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>

      <div className="flex">
        {/* Calendar Grid */}
        <div className="flex-1 p-4">
          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDate.get(dateKey) || [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isTodayDate = isToday(day);

              return (
                <button
                  key={i}
                  onClick={() => handleDateClick(day)}
                  className={`
                    relative min-h-[80px] p-2 rounded-lg text-left transition-all
                    ${isCurrentMonth ? 'bg-white' : 'bg-slate-50 opacity-50'}
                    ${isSelected ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-slate-50'}
                  `}
                >
                  <span className={`
                    inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium
                    ${isTodayDate ? 'bg-green-600 text-white' : ''}
                    ${isSelected && !isTodayDate ? 'bg-green-100 text-green-700' : ''}
                    ${!isTodayDate && !isSelected ? 'text-slate-700' : ''}
                  `}>
                    {format(day, 'd')}
                  </span>

                  {/* Event Dots */}
                  {dayEvents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dayEvents.slice(0, 3).map((event, j) => (
                        <div
                          key={j}
                          className={`w-2 h-2 rounded-full ${categoryColors[event.event_category]?.dot || 'bg-slate-400'}`}
                          title={event.title}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-xs text-slate-400">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-slate-100">
            {Object.entries(categoryColors).map(([category, colors]) => (
              <div key={category} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                <span className="text-xs text-slate-500 capitalize">{category}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Date Panel */}
        {selectedDate && (
          <div className="w-80 border-l border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-slate-900">
                  {format(selectedDate, 'EEEE')}
                </p>
                <p className="text-sm text-slate-500">
                  {format(selectedDate, 'MMMM d, yyyy')}
                </p>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions */}
            {canCreateEvents && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => onCreateEvent?.(selectedDate)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <IconPlus className="w-4 h-4" />
                  Event
                </button>
                {showPracticePlanButton && (
                  <button
                    onClick={() => onCreatePracticePlan?.(selectedDate)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <IconNote className="w-4 h-4" />
                    Practice
                  </button>
                )}
              </div>
            )}

            {/* Events List */}
            <div className="space-y-2">
              {selectedDateEvents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  No events scheduled
                </p>
              ) : (
                selectedDateEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => onEventClick?.(event)}
                    className={`
                      w-full p-3 rounded-lg text-left transition-colors
                      ${categoryColors[event.event_category]?.bg || 'bg-slate-100'}
                      hover:opacity-80
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-1 h-full min-h-[40px] rounded-full ${categoryColors[event.event_category]?.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${categoryColors[event.event_category]?.text}`}>
                          {event.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <IconClock className="w-3 h-3" />
                            {format(new Date(event.start_time), 'h:mm a')}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1 truncate">
                              <IconMapPin className="w-3 h-3" />
                              {event.location}
                            </span>
                          )}
                        </div>
                        {event.practice_plan_id && (
                          <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-white/50 rounded text-xs">
                            <IconNote className="w-3 h-3" />
                            Has practice plan
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Practice Plan Creator Modal
interface PracticePlanCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: any) => void;
  initialDate?: Date;
  templates?: any[];
}

export function PracticePlanCreator({ 
  isOpen, 
  onClose, 
  onSave, 
  initialDate,
  templates = []
}: PracticePlanCreatorProps) {
  const [title, setTitle] = useState('');
  const [activities, setActivities] = useState<{ name: string; duration: number; description: string }[]>([
    { name: 'Warm Up', duration: 15, description: '' },
  ]);
  const [sendToTeam, setSendToTeam] = useState(false);

  const addActivity = () => {
    setActivities([...activities, { name: '', duration: 15, description: '' }]);
  };

  const removeActivity = (index: number) => {
    setActivities(activities.filter((_, i) => i !== index));
  };

  const updateActivity = (index: number, field: string, value: string | number) => {
    const updated = [...activities];
    updated[index] = { ...updated[index], [field]: value } as { name: string; duration: number; description: string };
    setActivities(updated);
  };

  const totalDuration = activities.reduce((sum, a) => sum + a.duration, 0);

  const handleSave = () => {
    onSave({
      title,
      duration_minutes: totalDuration,
      activities,
      date: initialDate,
      sendToTeam,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Practice Plan</h2>
            {initialDate && (
              <p className="text-sm text-slate-500">{format(initialDate, 'EEEE, MMMM d')}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Title */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Practice Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Hitting Focus Practice"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Templates */}
          {templates.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Load from Template
              </label>
              <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100">
                <option value="">Select a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Activities */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-700">
                Activities
              </label>
              <span className="text-sm text-slate-500">
                Total: {totalDuration} min
              </span>
            </div>

            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={activity.name}
                      onChange={(e) => updateActivity(index, 'name', e.target.value)}
                      placeholder="Activity name"
                      className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={activity.duration}
                        onChange={(e) => updateActivity(index, 'duration', parseInt(e.target.value) || 0)}
                        className="w-16 px-3 py-2 rounded-lg border border-slate-200 text-sm text-center"
                      />
                      <span className="text-sm text-slate-500">min</span>
                    </div>
                    <input
                      type="text"
                      value={activity.description}
                      onChange={(e) => updateActivity(index, 'description', e.target.value)}
                      placeholder="Description / notes"
                      className="col-span-3 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeActivity(index)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <IconX className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addActivity}
              className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            >
              <IconPlus className="w-4 h-4" />
              Add Activity
            </button>
          </div>

          {/* Send to Team */}
          <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={sendToTeam}
              onChange={(e) => setSendToTeam(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <div>
              <p className="font-medium text-slate-900">Send to team</p>
              <p className="text-sm text-slate-500">Notify all players about this practice plan</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Save as Template
            </button>
            <button
              onClick={handleSave}
              disabled={!title}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {sendToTeam && <IconSend className="w-4 h-4" />}
              {sendToTeam ? 'Save & Send' : 'Save Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
