'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { format, addDays, addHours, parseISO } from 'date-fns';
import type { Coach } from '../crm-config';
import type { CRMEvent, CRMEventType } from './CalendarView';

// ============================================================================
// TYPES
// ============================================================================
interface ScheduleEventModalProps {
  coach?: Coach | null;
  event?: CRMEvent | null; // For editing
  initialDate?: Date;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormState {
  type: CRMEventType;
  title: string;
  date: string;
  time: string;
  duration: number;
  location: string;
  meetingUrl: string;
  description: string;
  coachId: string | null;
}

const EVENT_TYPES: { value: CRMEventType; label: string; icon: string; color: string }[] = [
  { value: 'demo', label: 'Demo', icon: '🖥️', color: 'bg-violet-500' },
  { value: 'follow_up', label: 'Follow-up', icon: '📞', color: 'bg-blue-500' },
  { value: 'call', label: 'Call', icon: '☎️', color: 'bg-primary-500' },
  { value: 'meeting', label: 'Meeting', icon: '🤝', color: 'bg-amber-500' },
  { value: 'email_reminder', label: 'Email', icon: '✉️', color: 'bg-warm-500' },
  { value: 'other', label: 'Other', icon: '📌', color: 'bg-warm-500' },
];

const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

const QUICK_TIMES = [
  { label: 'Tomorrow 10am', getValue: () => ({ date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '10:00' }) },
  { label: 'Tomorrow 2pm', getValue: () => ({ date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '14:00' }) },
  { label: 'In 2 days 10am', getValue: () => ({ date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), time: '10:00' }) },
  { label: 'Next week', getValue: () => ({ date: format(addDays(new Date(), 7), 'yyyy-MM-dd'), time: '10:00' }) },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function ScheduleEventModal({
  coach,
  event,
  initialDate,
  onClose,
  onSuccess,
}: ScheduleEventModalProps) {
  const isEditing = !!event;
  
  const getInitialForm = (): FormState => {
    if (event) {
      const startTime = parseISO(event.start_time);
      const endTime = parseISO(event.end_time);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      
      return {
        type: event.event_type,
        title: event.title,
        date: format(startTime, 'yyyy-MM-dd'),
        time: format(startTime, 'HH:mm'),
        duration: durationMinutes,
        location: event.location || '',
        meetingUrl: event.meeting_url || '',
        description: event.description || '',
        coachId: event.coach_id,
      };
    }
    
    const date = initialDate || addDays(new Date(), 1);
    return {
      type: 'demo',
      title: coach ? `Demo with ${coach.school}` : '',
      date: format(date, 'yyyy-MM-dd'),
      time: '10:00',
      duration: 30,
      location: '',
      meetingUrl: '',
      description: '',
      coachId: coach?.id || null,
    };
  };

  const [form, setForm] = useState<FormState>(getInitialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Coach search for FAB flow
  const [coachSearchQuery, setCoachSearchQuery] = useState('');
  const [coachSearchResults, setCoachSearchResults] = useState<Coach[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(coach || null);

  const supabase = createClient();

  // Update title when event type changes
  useEffect(() => {
    if (!isEditing && selectedCoach) {
      const typeConfig = EVENT_TYPES.find(t => t.value === form.type);
      setForm(f => ({ ...f, title: `${typeConfig?.label || 'Event'} with ${selectedCoach.school}` }));
    }
  }, [form.type, selectedCoach, isEditing]);

  // Coach search
  useEffect(() => {
    if (!coachSearchQuery.trim()) {
      setCoachSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('crm_coaches')
        .select('*')
        .or(`name.ilike.%${coachSearchQuery}%,school.ilike.%${coachSearchQuery}%`)
        .limit(5);
      setCoachSearchResults((data || []) as Coach[]);
    }, 200);

    return () => clearTimeout(timer);
  }, [coachSearchQuery, supabase]);

  // Handle submit
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    
    try {
      const startTime = new Date(`${form.date}T${form.time}`);
      const endTime = addHours(startTime, form.duration / 60);

      const payload = {
        title: form.title,
        event_type: form.type,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        coach_id: form.coachId,
        location: form.location || null,
        meeting_url: form.meetingUrl || null,
        description: form.description || null,
      };

      if (isEditing && event) {
        const { error: updateError } = await supabase
          .from('crm_events')
          .update(payload)
          .eq('id', event.id);
        
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('crm_events')
          .insert(payload);
        
        if (insertError) throw insertError;

        // Update coach status if scheduling a demo
        if (form.coachId && form.type === 'demo') {
          await supabase
            .from('crm_coaches')
            .update({
              status: 'demo_scheduled',
              next_follow_up_at: startTime.toISOString(),
            })
            .eq('id', form.coachId);
        } else if (form.coachId) {
          await supabase
            .from('crm_coaches')
            .update({ next_follow_up_at: startTime.toISOString() })
            .eq('id', form.coachId);
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save event:', err);
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!event || !confirm('Are you sure you want to delete this event?')) return;
    
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('crm_events')
        .delete()
        .eq('id', event.id);
      
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to delete event:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📅</span>
              <div>
                <h2 className="text-xl font-bold">
                  {isEditing ? 'Edit Event' : 'Schedule Event'}
                </h2>
                {selectedCoach && (
                  <p className="text-violet-200 text-sm">{selectedCoach.school}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Coach Selection (if not pre-selected) */}
          {!selectedCoach && !isEditing && (
            <div>
              <label className="text-sm font-semibold text-warm-700 mb-2 block">
                Coach <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={coachSearchQuery}
                  onChange={(e) => setCoachSearchQuery(e.target.value)}
                  placeholder="Search coach or school..."
                  className="w-full px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
                />
                {coachSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-warm-200 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                    {coachSearchResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCoach(c);
                          setForm(f => ({ ...f, coachId: c.id }));
                          setCoachSearchQuery('');
                          setCoachSearchResults([]);
                        }}
                        className="w-full p-3 text-left hover:bg-warm-50 flex items-center gap-3"
                      >
                        <span className={cn(
                          'px-2 py-1 rounded text-xs font-bold',
                          c.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                        )}>
                          {c.division}
                        </span>
                        <div>
                          <div className="font-medium text-warm-800">{c.school}</div>
                          <div className="text-xs text-warm-500">{c.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selected Coach Badge */}
          {selectedCoach && (
            <div className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl">
              <span className={cn(
                'px-2 py-1 rounded text-xs font-bold',
                selectedCoach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
              )}>
                {selectedCoach.division}
              </span>
              <div className="flex-1">
                <div className="font-medium text-warm-800">{selectedCoach.school}</div>
                <div className="text-xs text-warm-500">{selectedCoach.name}</div>
              </div>
              {!isEditing && (
                <button
                  onClick={() => {
                    setSelectedCoach(null);
                    setForm(f => ({ ...f, coachId: null }));
                  }}
                  className="text-warm-400 hover:text-warm-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Event Type */}
          <div>
            <label className="text-sm font-semibold text-warm-700 mb-2 block">Event Type</label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setForm(f => ({ ...f, type: type.value }))}
                  className={cn(
                    'p-3 rounded-xl text-center transition-all',
                    form.type === type.value
                      ? `${type.color} text-white shadow-lg`
                      : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                  )}
                >
                  <span className="text-xl block mb-1">{type.icon}</span>
                  <span className="text-xs font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm font-semibold text-warm-700 mb-2 block">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Event title"
              className="w-full px-4 py-3 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Quick Time Select */}
          {!isEditing && (
            <div>
              <label className="text-sm font-semibold text-warm-700 mb-2 block">Quick Select</label>
              <div className="flex flex-wrap gap-2">
                {QUICK_TIMES.map((qt) => (
                  <button
                    key={qt.label}
                    onClick={() => {
                      const { date, time } = qt.getValue();
                      setForm(f => ({ ...f, date, time }));
                    }}
                    className="px-3 py-2 bg-warm-100 hover:bg-warm-200 rounded-lg text-sm font-medium text-warm-700 transition-colors"
                  >
                    {qt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-warm-700 mb-2 block">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-4 py-3 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-warm-700 mb-2 block">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                className="w-full px-4 py-3 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-semibold text-warm-700 mb-2 block">Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setForm(f => ({ ...f, duration: d.value }))}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    form.duration === d.value
                      ? 'bg-violet-500 text-white shadow-lg'
                      : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-sm font-semibold text-warm-700 mb-2 block">
              Location <span className="text-warm-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g., Zoom, Phone, Office"
              className="w-full px-4 py-3 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Meeting URL */}
          <div>
            <label className="text-sm font-semibold text-warm-700 mb-2 block">
              Meeting Link <span className="text-warm-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={form.meetingUrl}
              onChange={(e) => setForm(f => ({ ...f, meetingUrl: e.target.value }))}
              placeholder="https://zoom.us/j/..."
              className="w-full px-4 py-3 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-semibold text-warm-700 mb-2 block">
              Notes <span className="text-warm-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Add any notes for this event..."
              rows={3}
              className="w-full px-4 py-3 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-warm-50 border-t border-warm-200 flex items-center justify-between">
          {isEditing ? (
            <button
              onClick={handleDelete}
              disabled={submitting}
              className="px-4 py-2 text-red-600 hover:text-red-700 font-medium text-sm disabled:opacity-50"
            >
              🗑️ Delete
            </button>
          ) : (
            <div />
          )}
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-warm-600 hover:text-warm-800 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.title || !form.date || !form.time}
              className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : isEditing ? 'Save Changes' : '📅 Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
