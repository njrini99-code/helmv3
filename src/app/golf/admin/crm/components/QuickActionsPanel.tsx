'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconStar,
  IconX,
  IconCalendar,
  IconPencil,
  IconMail,
  IconPhone,
  IconFileText,
  IconVideo,
  IconUsers,
  IconArrowLeft,
  IconCheck,
  IconSave,
  IconZap,
  IconFlame,
} from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';
import { format, addDays, addHours } from 'date-fns';

// ============================================================================
// TYPES
// ============================================================================
interface QuickActionsPanelProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: (updates: Partial<Coach>) => void;
  onRefreshEvents?: () => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }>;
}

type ActionView = 'main' | 'schedule' | 'log' | 'note';

interface ScheduleForm {
  type: 'demo' | 'follow_up' | 'call' | 'meeting';
  date: string;
  time: string;
  duration: number;
  title: string;
  location: string;
  meetingUrl: string;
  notes: string;
}

const ACTION_TYPES = [
  { value: 'demo' as const, label: 'Demo', icon: <IconVideo size={18} />, color: 'bg-violet-500' },
  { value: 'follow_up' as const, label: 'Follow-up', icon: <IconPhone size={18} />, color: 'bg-blue-500' },
  { value: 'call' as const, label: 'Call', icon: <IconPhone size={18} />, color: 'bg-primary-500' },
  { value: 'meeting' as const, label: 'Meeting', icon: <IconUsers size={18} />, color: 'bg-amber-500' },
];

const QUICK_TIMES = [
  { label: 'Tomorrow 10am', getValue: () => ({ date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '10:00' }) },
  { label: 'Tomorrow 2pm', getValue: () => ({ date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '14:00' }) },
  { label: 'In 2 days', getValue: () => ({ date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), time: '10:00' }) },
  { label: 'Next week', getValue: () => ({ date: format(addDays(new Date(), 7), 'yyyy-MM-dd'), time: '10:00' }) },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function QuickActionsPanel({
  coach,
  onClose,
  onUpdate,
  onRefreshEvents,
  statusConfig,
}: QuickActionsPanelProps) {
  const [view, setView] = useState<ActionView>('main');
  const [submitting, setSubmitting] = useState(false);

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    type: 'demo',
    date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    time: '10:00',
    duration: 30,
    title: `Demo with ${coach.school}`,
    location: '',
    meetingUrl: '',
    notes: '',
  });

  const [logForm, setLogForm] = useState({
    type: 'email' as 'email' | 'call' | 'demo' | 'meeting' | 'note',
    notes: '',
    nextAction: '',
    nextActionDate: '',
  });

  const [noteForm, setNoteForm] = useState(coach.notes || '');

  const supabase = createClient();

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleSchedule = async () => {
    setSubmitting(true);
    try {
      const startTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      const endTime = addHours(startTime, scheduleForm.duration / 60);

      const { error } = await supabase.from('crm_events').insert({
        title: scheduleForm.title,
        event_type: scheduleForm.type,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        coach_id: coach.id,
        location: scheduleForm.location || null,
        meeting_url: scheduleForm.meetingUrl || null,
        notes: scheduleForm.notes || null,
      });

      if (error) throw error;

      // Update coach status if scheduling demo
      if (scheduleForm.type === 'demo') {
        onUpdate({ status: 'engaged', next_follow_up_at: startTime.toISOString() });
      } else {
        onUpdate({ next_follow_up_at: startTime.toISOString() });
      }

      onRefreshEvents?.();
      onClose();
    } catch (err) {
      console.error('Failed to schedule:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogContact = async () => {
    setSubmitting(true);
    try {
      await supabase.from('crm_contact_log').insert({
        coach_id: coach.id,
        contact_type: logForm.type,
        notes: logForm.notes || null,
        next_action: logForm.nextAction || null,
        next_action_date: logForm.nextActionDate || null,
      });

      const updates: Partial<Coach> = { last_contacted_at: new Date().toISOString() };
      if (logForm.nextActionDate) {
        updates.next_follow_up_at = logForm.nextActionDate;
      }
      // Auto-advance status if still new_lead
      if (coach.status === 'new_lead') {
        updates.status = 'contacted';
      }

      onUpdate(updates);
      onClose();
    } catch (err) {
      console.error('Failed to log contact:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveNote = async () => {
    setSubmitting(true);
    try {
      onUpdate({ notes: noteForm || null });
      onClose();
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (status: CoachStatus) => {
    onUpdate({ status });
  };

  const handlePriorityChange = async (priority: number) => {
    onUpdate({ priority });
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-warm-800 to-warm-900 text-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onUpdate({ is_starred: !coach.is_starred })}
                className="hover:scale-110 transition-transform"
              >
                <IconStar size={20} className={cn(coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-white/40')} />
              </button>
              <div>
                <h2 className="text-xl font-bold">{coach.school}</h2>
                <p className="text-warm-300 text-sm">{coach.name} &middot; {coach.conference}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            >
              <IconX size={18} className="text-white/70" />
            </button>
          </div>

          {/* Quick Status Bar */}
          <div className="flex items-center gap-2 mt-4">
            <span className={cn(
              'px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-1',
              statusConfig[coach.status]?.bgColor,
              statusConfig[coach.status]?.color
            )}>
              {statusConfig[coach.status]?.icon} {statusConfig[coach.status]?.label}
            </span>
            <span className={cn(
              'px-2 py-1 rounded-lg text-xs font-bold',
              coach.division === 'D2' ? 'bg-blue-500/20 text-blue-300' : 'bg-violet-500/20 text-violet-300'
            )}>
              {coach.division}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {view === 'main' && (
            <div className="space-y-4">
              {/* Primary Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setView('schedule')}
                  className="flex items-center justify-center gap-2 p-4 bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-[transform,box-shadow] hover:scale-[1.02]"
                >
                  <IconCalendar size={20} />
                  <span>Schedule</span>
                </button>
                <button
                  onClick={() => setView('log')}
                  className="flex items-center justify-center gap-2 p-4 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-[transform,box-shadow] hover:scale-[1.02]"
                >
                  <IconPencil size={20} />
                  <span>Log Contact</span>
                </button>
              </div>

              {/* Quick Contact */}
              <div className="flex items-center gap-2">
                {coach.email && (
                  <a
                    href={`mailto:${coach.email}`}
                    className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors"
                  >
                    <IconMail size={16} /> Email
                  </a>
                )}
                {coach.phone && (
                  <a
                    href={`tel:${coach.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 p-3 bg-primary-50 text-primary-700 rounded-xl font-medium hover:bg-primary-100 transition-colors"
                  >
                    <IconPhone size={16} /> Call
                  </a>
                )}
                <button
                  onClick={() => setView('note')}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-xl font-medium hover:bg-amber-100 transition-colors"
                >
                  <IconFileText size={16} /> Note
                </button>
              </div>

              {/* Change Status */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-2 block">
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(statusConfig) as CoachStatus[]).map((status) => {
                    const config = statusConfig[status];
                    const isActive = coach.status === status;
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={cn(
                          'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          isActive
                            ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-warm-300`
                            : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                        )}
                      >
                        {config.icon} {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Change Priority */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-2 block">
                  Priority
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePriorityChange(0)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-sm font-medium transition-colors',
                      coach.priority === 0
                        ? 'bg-warm-200 text-warm-700 ring-2 ring-warm-400'
                        : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                    )}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => handlePriorityChange(1)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1',
                      coach.priority === 1
                        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400'
                        : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                    )}
                  >
                    <IconZap size={14} /> High
                  </button>
                  <button
                    onClick={() => handlePriorityChange(2)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1',
                      coach.priority === 2
                        ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-400'
                        : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                    )}
                  >
                    <IconFlame size={14} /> Hot
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === 'schedule' && (
            <div className="space-y-4">
              <button
                onClick={() => setView('main')}
                className="flex items-center gap-1 text-sm text-warm-500 hover:text-warm-700 mb-2"
              >
                <IconArrowLeft size={14} /> Back
              </button>

              <h3 className="text-lg font-bold text-warm-800">Schedule Event</h3>

              {/* Event Type */}
              <div className="grid grid-cols-4 gap-2">
                {ACTION_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setScheduleForm(f => ({
                      ...f,
                      type: type.value,
                      title: `${type.label} with ${coach.school}`,
                    }))}
                    className={cn(
                      'p-3 rounded-xl text-center transition-colors',
                      scheduleForm.type === type.value
                        ? `${type.color} text-white shadow-lg`
                        : 'bg-warm-100 hover:bg-warm-200'
                    )}
                  >
                    <span className="block mb-1">{type.icon}</span>
                    <span className="text-xs font-medium">{type.label}</span>
                  </button>
                ))}
              </div>

              {/* Quick Time Select */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-2 block">
                  Quick Select
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TIMES.map((qt) => (
                    <button
                      key={qt.label}
                      onClick={() => {
                        const { date, time } = qt.getValue();
                        setScheduleForm(f => ({ ...f, date, time }));
                      }}
                      className="px-3 py-1.5 bg-warm-100 hover:bg-warm-200 rounded-xl text-sm font-medium text-warm-700 transition-colors"
                    >
                      {qt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                    Time
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.time}
                    onChange={(e) => setScheduleForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                  Duration
                </label>
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map((d) => (
                    <button
                      key={d}
                      onClick={() => setScheduleForm(f => ({ ...f, duration: d }))}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-sm font-medium transition-colors',
                        scheduleForm.duration === d
                          ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-400'
                          : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                      )}
                    >
                      {d}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                  Title
                </label>
                <input
                  type="text"
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  placeholder="Event title"
                />
              </div>

              {/* Meeting URL (optional) */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                  Meeting Link <span className="text-warm-400 font-normal">(optional)</span>
                </label>
                <input
                  type="url"
                  value={scheduleForm.meetingUrl}
                  onChange={(e) => setScheduleForm(f => ({ ...f, meetingUrl: e.target.value }))}
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  placeholder="https://zoom.us/j/..."
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSchedule}
                disabled={submitting || !scheduleForm.date || !scheduleForm.time}
                className="w-full py-3 bg-primary-500 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-primary-600 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <IconCalendar size={18} />
                {submitting ? 'Scheduling...' : 'Schedule Event'}
              </button>
            </div>
          )}

          {view === 'log' && (
            <div className="space-y-4">
              <button
                onClick={() => setView('main')}
                className="flex items-center gap-1 text-sm text-warm-500 hover:text-warm-700 mb-2"
              >
                <IconArrowLeft size={14} /> Back
              </button>

              <h3 className="text-lg font-bold text-warm-800">Log Contact</h3>

              {/* Contact Type */}
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'email' as const, icon: <IconMail size={14} />, label: 'Email' },
                  { value: 'call' as const, icon: <IconPhone size={14} />, label: 'Call' },
                  { value: 'demo' as const, icon: <IconVideo size={14} />, label: 'Demo' },
                  { value: 'meeting' as const, icon: <IconUsers size={14} />, label: 'Meeting' },
                  { value: 'note' as const, icon: <IconFileText size={14} />, label: 'Note' },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setLogForm(f => ({ ...f, type: type.value }))}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5',
                      logForm.type === type.value
                        ? 'bg-primary-500 text-white shadow-lg'
                        : 'bg-warm-100 hover:bg-warm-200 text-warm-600'
                    )}
                  >
                    {type.icon} {type.label}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                  Notes
                </label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) => setLogForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none"
                  rows={3}
                  placeholder="What happened during this contact?"
                />
              </div>

              {/* Next Action */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                    Next Action
                  </label>
                  <input
                    type="text"
                    value={logForm.nextAction}
                    onChange={(e) => setLogForm(f => ({ ...f, nextAction: e.target.value }))}
                    className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    placeholder="e.g., Follow up call"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1 block">
                    Follow-up Date
                  </label>
                  <input
                    type="date"
                    value={logForm.nextActionDate}
                    onChange={(e) => setLogForm(f => ({ ...f, nextActionDate: e.target.value }))}
                    className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleLogContact}
                disabled={submitting}
                className="w-full py-3 bg-primary-500 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-primary-600 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <IconCheck size={18} />
                {submitting ? 'Saving...' : 'Log Contact'}
              </button>
            </div>
          )}

          {view === 'note' && (
            <div className="space-y-4">
              <button
                onClick={() => setView('main')}
                className="flex items-center gap-1 text-sm text-warm-500 hover:text-warm-700 mb-2"
              >
                <IconArrowLeft size={14} /> Back
              </button>

              <h3 className="text-lg font-bold text-warm-800 flex items-center gap-2">
                <IconFileText size={20} className="text-warm-600" /> Notes
              </h3>

              <textarea
                value={noteForm}
                onChange={(e) => setNoteForm(e.target.value)}
                className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none"
                rows={6}
                placeholder="Add notes about this coach..."
                autoFocus
              />

              <button
                onClick={handleSaveNote}
                disabled={submitting}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-amber-600 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <IconSave size={18} />
                {submitting ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
