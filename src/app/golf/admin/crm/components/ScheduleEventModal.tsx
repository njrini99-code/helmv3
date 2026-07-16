'use client';

import { useState, useEffect, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/error-logging';
import { cn } from '@/lib/utils';
import { format, addDays, addHours, parseISO } from 'date-fns';
import type { Coach } from '../crm-config';
import type { CRMEvent, CRMEventType } from './CalendarView';
import { IconX, IconCalendar, IconVideo, IconPhone, IconMail, IconUsers, IconMapPin, IconTrash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

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

const EVENT_TYPES: { value: CRMEventType; label: string; icon: typeof IconVideo; color: string }[] = [
  { value: 'demo', label: 'Demo', icon: IconVideo, color: 'bg-violet-500' },
  { value: 'follow_up', label: 'Follow-up', icon: IconPhone, color: 'bg-blue-500' },
  { value: 'call', label: 'Call', icon: IconPhone, color: 'bg-primary-500' },
  { value: 'meeting', label: 'Meeting', icon: IconUsers, color: 'bg-amber-500' },
  { value: 'email_reminder', label: 'Email', icon: IconMail, color: 'bg-warm-500' },
  { value: 'other', label: 'Other', icon: IconMapPin, color: 'bg-warm-500' },
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

const inputClass = 'min-h-0 w-full glass-subtle border border-warm-200 rounded-xl px-4 py-2.5 text-sm transition-colors focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none';
const labelClass = 'text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block';

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
  const uid = useId();
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
      const { data, error: searchError } = await supabase
        .from('crm_coaches')
        .select('*')
        .or(`name.ilike.%${coachSearchQuery}%,school.ilike.%${coachSearchQuery}%`)
        .limit(5);
      if (searchError) {
        logError(
          new Error(searchError.message),
          { component: 'ScheduleEventModal', action: 'search-coaches', sport: 'golf' },
          'medium'
        );
      }
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
              status: 'engaged',
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
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'ScheduleEventModal', action: isEditing ? 'update-crm-event' : 'create-crm-event', sport: 'golf', eventId: event?.id, coachId: form.coachId },
        'high'
      );
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
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'ScheduleEventModal', action: 'delete-crm-event', sport: 'golf', eventId: event.id },
        'high'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents backdrop click from closing modal */}
      <div
        className="glass-prominent rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <IconCalendar size={16} className="text-warm-600" />
            <div>
              <h2 className="text-lg font-semibold text-warm-900">
                {isEditing ? 'Edit Event' : 'Schedule Event'}
              </h2>
              {selectedCoach && (
                <p className="text-sm text-warm-500">{selectedCoach.school}</p>
              )}
            </div>
          </div>
          <IconButton variant="default"
            onClick={onClose}
            aria-label="Close"
            className="text-warm-400 hover:text-warm-600 transition-colors"
          >
            <IconX size={18} />
          </IconButton>
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
              <label htmlFor={`${uid}-coach-search`} className={labelClass}>
                Coach <span className="text-warm-400 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <div className="relative">
                <Input
                  id={`${uid}-coach-search`}
                  type="text"
                  value={coachSearchQuery}
                  onChange={(e) => setCoachSearchQuery(e.target.value)}
                  placeholder="Search coach or school..."
                  className={inputClass}
                />
                {coachSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-cream-50 border border-warm-200 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                    {coachSearchResults.map((c) => (
                      <Button variant="ghost"
                        key={c.id}
                        onClick={() => {
                          setSelectedCoach(c);
                          setForm(f => ({ ...f, coachId: c.id }));
                          setCoachSearchQuery('');
                          setCoachSearchResults([]);
                        }}
                        className="w-full p-3 text-left hover:bg-warm-50 transition-colors active:bg-warm-100 flex items-center gap-3"
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
                      </Button>
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
                <IconButton variant="default" aria-label="Close"
                  onClick={() => {
                    setSelectedCoach(null);
                    setForm(f => ({ ...f, coachId: null }));
                  }}
                  className="text-warm-400 hover:text-warm-600 transition-colors"
                >
                  <IconX size={14} />
                </IconButton>
              )}
            </div>
          )}

          {/* Event Type */}
          <div>
            <p className={labelClass}>Event Type</p>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map((type) => {
                const TypeIcon = type.icon;
                return (
                  <Button variant="ghost"
                    key={type.value}
                    onClick={() => setForm(f => ({ ...f, type: type.value }))}
                    className={cn(
                      'p-3 rounded-xl text-center transition-all',
                      form.type === type.value
                        ? `${type.color} text-white shadow-lg`
                        : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                    )}
                  >
                    <span className="flex justify-center mb-1"><TypeIcon size={18} /></span>
                    <span className="text-xs font-medium">{type.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor={`${uid}-title`} className={labelClass}>Title</label>
            <Input
              id={`${uid}-title`}
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Event title"
              className={inputClass}
            />
          </div>

          {/* Quick Time Select */}
          {!isEditing && (
            <div>
              <p className={labelClass}>Quick Select</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TIMES.map((qt) => (
                  <Button variant="ghost"
                    key={qt.label}
                    onClick={() => {
                      const { date, time } = qt.getValue();
                      setForm(f => ({ ...f, date, time }));
                    }}
                    className="px-3 py-2 bg-warm-100 hover:bg-warm-200 rounded-xl text-sm font-medium text-warm-700 transition-colors"
                  >
                    {qt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-date`} className={labelClass}>Date</label>
              <Input
                id={`${uid}-date`}
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-time`} className={labelClass}>Time</label>
              <Input
                id={`${uid}-time`}
                type="time"
                value={form.time}
                onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <p className={labelClass}>Duration</p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Button variant="primary"
                  key={d.value}
                  onClick={() => setForm(f => ({ ...f, duration: d.value }))}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    form.duration === d.value
                      ? 'bg-primary-500 text-white shadow-lg'
                      : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                  )}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label htmlFor={`${uid}-location`} className={labelClass}>
              Location <span className="text-warm-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <Input
              id={`${uid}-location`}
              type="text"
              value={form.location}
              onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g., Zoom, Phone, Office"
              className={inputClass}
            />
          </div>

          {/* Meeting URL */}
          <div>
            <label htmlFor={`${uid}-meeting-url`} className={labelClass}>
              Meeting Link <span className="text-warm-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <Input
              id={`${uid}-meeting-url`}
              type="url"
              value={form.meetingUrl}
              onChange={(e) => setForm(f => ({ ...f, meetingUrl: e.target.value }))}
              placeholder="https://zoom.us/j/..."
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor={`${uid}-description`} className={labelClass}>
              Notes <span className="text-warm-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <Textarea
              id={`${uid}-description`}
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Add any notes for this event..."
              rows={3}
              className={`${inputClass} resize-none min-h-[100px]`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-warm-100 flex items-center justify-between flex-shrink-0">
          {isEditing ? (
            <Button variant="danger"
              onClick={handleDelete}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-red-600 hover:text-red-700 font-medium text-sm disabled:opacity-50 transition-colors"
            >
              <IconTrash size={14} />
              Delete
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <Button variant="ghost"
              onClick={onClose}
              className="bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
            >
              Cancel
            </Button>
            <Button variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !form.title || !form.date || !form.time}
              className="bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Schedule'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
