'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import type { CRMEvent, CRMEventType } from './CalendarView';

// ============================================================================
// TYPES
// ============================================================================
interface EventDetailModalProps {
  event: CRMEvent;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}

const EVENT_TYPE_CONFIG: Record<CRMEventType, { 
  label: string; 
  icon: string; 
  bgColor: string; 
  textColor: string;
}> = {
  demo: { label: 'Demo', icon: '🖥️', bgColor: 'bg-violet-500', textColor: 'text-white' },
  follow_up: { label: 'Follow-up', icon: '📞', bgColor: 'bg-blue-500', textColor: 'text-white' },
  call: { label: 'Call', icon: '☎️', bgColor: 'bg-primary-500', textColor: 'text-white' },
  meeting: { label: 'Meeting', icon: '🤝', bgColor: 'bg-amber-500', textColor: 'text-white' },
  email_reminder: { label: 'Email', icon: '✉️', bgColor: 'bg-warm-500', textColor: 'text-white' },
  other: { label: 'Other', icon: '📌', bgColor: 'bg-warm-500', textColor: 'text-white' },
};

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled', icon: '📅', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: 'Completed', icon: '✅', color: 'bg-primary-100 text-primary-700' },
  { value: 'cancelled', label: 'Cancelled', icon: '❌', color: 'bg-red-100 text-red-700' },
  { value: 'rescheduled', label: 'Rescheduled', icon: '🔄', color: 'bg-amber-100 text-amber-700' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function EventDetailModal({
  event,
  onClose,
  onEdit,
  onRefresh,
}: EventDetailModalProps) {
  const [status, setStatus] = useState(event.status);
  const [outcome, setOutcome] = useState('');
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();
  const startTime = parseISO(event.start_time);
  const endTime = parseISO(event.end_time);
  const duration = differenceInMinutes(endTime, startTime);
  const typeConfig = EVENT_TYPE_CONFIG[event.event_type];

  // Update event status
  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'completed') {
      setShowOutcomeForm(true);
      setStatus(newStatus);
      return;
    }

    setSubmitting(true);
    try {
      await supabase
        .from('crm_events')
        .update({ status: newStatus })
        .eq('id', event.id);
      
      setStatus(newStatus);
      onRefresh();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Complete event with outcome
  const handleComplete = async () => {
    setSubmitting(true);
    try {
      await supabase
        .from('crm_events')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          outcome: outcome || null,
        })
        .eq('id', event.id);

      // Log contact to coach if linked
      if (event.coach_id) {
        await supabase.from('crm_contact_log').insert({
          coach_id: event.coach_id,
          contact_type: event.event_type === 'demo' ? 'demo' : event.event_type === 'call' ? 'call' : 'meeting',
          notes: `${typeConfig.label}: ${outcome || 'No notes'}`,
        });

        // Update coach last contacted
        await supabase
          .from('crm_coaches')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', event.coach_id);
      }

      onRefresh();
      onClose();
    } catch (err) {
      console.error('Failed to complete event:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete event
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    setSubmitting(true);
    try {
      await supabase.from('crm_events').delete().eq('id', event.id);
      onRefresh();
      onClose();
    } catch (err) {
      console.error('Failed to delete:', err);
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Event Type Color */}
        <div className={cn('px-6 py-5', typeConfig.bgColor, typeConfig.textColor)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{typeConfig.icon}</span>
              <div>
                <h2 className="text-xl font-bold">{event.title}</h2>
                <p className="text-sm opacity-90">{typeConfig.label}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Time Info */}
          <div className="flex items-center gap-4 p-4 bg-warm-50 rounded-xl">
            <div className="text-center">
              <div className="text-2xl font-bold text-warm-800">
                {format(startTime, 'd')}
              </div>
              <div className="text-xs font-medium text-warm-500 uppercase">
                {format(startTime, 'MMM')}
              </div>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-warm-800">
                {format(startTime, 'EEEE')}
              </div>
              <div className="text-sm text-warm-600">
                {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
              </div>
              <div className="text-xs text-warm-500 mt-0.5">
                {duration} minutes
              </div>
            </div>
          </div>

          {/* Coach Info */}
          {event.coach_name && (
            <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-xl">
              <span className="text-xl">👤</span>
              <div>
                <div className="font-semibold text-warm-800">{event.coach_school}</div>
                <div className="text-sm text-warm-600">{event.coach_name}</div>
              </div>
            </div>
          )}

          {/* Location / Meeting URL */}
          {(event.location || event.meeting_url) && (
            <div className="space-y-2">
              {event.location && (
                <div className="flex items-center gap-2 text-sm text-warm-600">
                  <span>📍</span>
                  <span>{event.location}</span>
                </div>
              )}
              {event.meeting_url && (
                <a
                  href={event.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <span>🔗</span>
                  <span>Join Meeting</span>
                </a>
              )}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1 block">
                Notes
              </label>
              <p className="text-sm text-warm-700 bg-warm-50 rounded-xl p-3">
                {event.description}
              </p>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2 block">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  disabled={submitting}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    status === opt.value
                      ? `${opt.color} ring-2 ring-offset-1 ring-warm-300`
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                  )}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Outcome Form (when completing) */}
          {showOutcomeForm && (
            <div className="p-4 bg-primary-50 rounded-xl border border-primary-200 space-y-3">
              <h4 className="font-semibold text-primary-800">✅ Mark as Completed</h4>
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="How did it go? Any notes?"
                className="w-full px-3 py-2 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowOutcomeForm(false);
                    setStatus(event.status);
                  }}
                  className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Complete'}
                </button>
              </div>
            </div>
          )}

          {/* Google Calendar Sync Status */}
          {event.google_event_id && (
            <div className="flex items-center gap-2 text-xs text-warm-500 p-2 bg-warm-50 rounded-lg">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              </svg>
              <span>Synced with Google Calendar</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-warm-50 border-t border-warm-200 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={submitting}
            className="px-3 py-2 text-red-600 hover:text-red-700 font-medium text-sm disabled:opacity-50"
          >
            🗑️ Delete
          </button>
          
          <button
            onClick={onEdit}
            className="px-5 py-2.5 bg-warm-800 text-white rounded-xl font-semibold hover:bg-warm-700 transition-colors"
          >
            ✏️ Edit
          </button>
        </div>
      </div>
    </div>
  );
}
