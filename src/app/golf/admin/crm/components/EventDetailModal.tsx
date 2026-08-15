'use client';

import { useState, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import type { CRMEvent, CRMEventType } from './CalendarView';
import { IconX, IconVideo, IconPhone, IconUsers, IconMail, IconMapPin, IconCalendar, IconCheck, IconEdit, IconTrash, IconUser, IconLink, IconClock } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

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
  icon: typeof IconVideo;
}> = {
  demo: { label: 'Demo', icon: IconVideo },
  follow_up: { label: 'Follow-up', icon: IconPhone },
  call: { label: 'Call', icon: IconPhone },
  meeting: { label: 'Meeting', icon: IconUsers },
  email_reminder: { label: 'Email', icon: IconMail },
  other: { label: 'Other', icon: IconMapPin },
};

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled', icon: IconCalendar, color: 'bg-surface-sunken text-text-secondary' },
  { value: 'completed', label: 'Completed', icon: IconCheck, color: 'bg-accent-100 text-accent-700' },
  { value: 'cancelled', label: 'Cancelled', icon: IconX, color: 'bg-fw-danger-bg text-fw-danger-ink' },
  { value: 'rescheduled', label: 'Rescheduled', icon: IconClock, color: 'bg-fw-warning-bg text-fw-warning-ink' },
];

const inputClass = 'w-full bg-surface-sunken border border-border-subtle rounded-fw-sm px-4 py-2.5 text-sm transition-colors focus:ring-2 focus:ring-border-focus/30 focus:border-accent-400 outline-none';
const labelClass = 'text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block';

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function EventDetailModal({
  event,
  onClose,
  onEdit,
  onRefresh,
}: EventDetailModalProps) {
  const uid = useId();
  const [status, setStatus] = useState(event.status);
  const [outcome, setOutcome] = useState('');
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Focus trap + Escape + scroll-lock + focus-restore. Mounted == open.
  const { modalRef } = useFocusTrap(true, onClose);

  const supabase = createClient();
  const startTime = parseISO(event.start_time);
  const endTime = parseISO(event.end_time);
  const duration = differenceInMinutes(endTime, startTime);
  const typeConfig = EVENT_TYPE_CONFIG[event.event_type];
  const TypeIcon = typeConfig.icon;

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

        // Update coach last contacted + auto-advance new_lead -> contacted
        const completedNow = new Date().toISOString();
        await supabase
          .from('crm_coaches')
          .update({ last_contacted_at: completedNow, updated_at: completedNow })
          .eq('id', event.coach_id);
        await supabase
          .from('crm_coaches')
          .update({ status: 'contacted' })
          .eq('id', event.coach_id)
          .eq('status', 'new_lead');
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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nav-bg/40 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation-only wrapper prevents backdrop click from closing modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="rounded-card bg-elevated shadow-raise w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TypeIcon size={16} className="text-text-secondary" />
              <div>
                <h2 id={`${uid}-title`} className="text-lg font-semibold text-text-primary">{event.title}</h2>
                <p className="text-sm text-text-tertiary">{typeConfig.label}</p>
              </div>
            </div>
            <IconButton variant="default"
              onClick={onClose}
              aria-label="Close"
              className="text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <IconX size={18} />
            </IconButton>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {/* Time Info */}
          <div className="flex items-center gap-4 p-4 bg-surface-sunken rounded-fw-md">
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">
                {format(startTime, 'd')}
              </div>
              <div className="text-xs font-medium text-text-tertiary uppercase">
                {format(startTime, 'MMM')}
              </div>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-text-primary">
                {format(startTime, 'EEEE')}
              </div>
              <div className="text-sm text-text-secondary">
                {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">
                {duration} minutes
              </div>
            </div>
          </div>

          {/* Coach Info */}
          {event.coach_name && (
            <div className="flex items-center gap-3 p-3 bg-accent-50 rounded-fw-md">
              <IconUser size={18} className="text-accent-700" />
              <div>
                <div className="font-semibold text-text-primary">{event.coach_school}</div>
                <div className="text-sm text-text-secondary">{event.coach_name}</div>
              </div>
            </div>
          )}

          {/* Location / Meeting URL */}
          {(event.location || event.meeting_url) && (
            <div className="space-y-2">
              {event.location && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <IconMapPin size={14} className="text-text-tertiary" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.meeting_url && (
                <a
                  href={event.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-accent-700 hover:underline"
                >
                  <IconLink size={14} />
                  <span>Join Meeting</span>
                </a>
              )}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <p className={labelClass}>
                Notes
              </p>
              <p className="text-sm text-text-secondary bg-surface-sunken rounded-fw-md p-3">
                {event.description}
              </p>
            </div>
          )}

          {/* Status */}
          <div>
            <p className={labelClass}>
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const OptIcon = opt.icon;
                return (
                  <Button variant="ghost"
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    disabled={submitting}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-fw-sm text-sm font-medium transition-all',
                      status === opt.value
                        ? `${opt.color} ring-2 ring-offset-1 ring-border-strong`
                        : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                    )}
                  >
                    <OptIcon size={14} />
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Outcome Form (when completing) */}
          {showOutcomeForm && (
            <div className="p-4 bg-accent-50 rounded-fw-md border border-accent-200 space-y-3">
              <h4 className="font-semibold text-fw-success-ink flex items-center gap-1.5">
                <IconCheck size={16} className="text-accent-700" />
                Mark as Completed
              </h4>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
              <Textarea autoFocus
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="How did it go? Any notes?"
                className={`${inputClass} resize-none min-h-[100px]`}
                rows={3}
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost"
                  onClick={() => {
                    setShowOutcomeForm(false);
                    setStatus(event.status);
                  }}
                  className="bg-surface border border-border-subtle text-text-secondary rounded-fw-md px-5 py-2.5 text-sm font-medium hover:bg-surface-sunken transition-colors"
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  onClick={handleComplete}
                  disabled={submitting}
                  className="bg-accent-650 hover:bg-accent-750 text-text-on-accent rounded-fw-md px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Complete'}
                </Button>
              </div>
            </div>
          )}

          {/* Google Calendar Sync Status */}
          {event.google_event_id && (
            <div className="flex items-center gap-2 text-xs text-text-tertiary p-2 bg-surface-sunken rounded-fw-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              </svg>
              <span>Synced with Google Calendar</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between flex-shrink-0">
          <Button variant="danger"
            onClick={handleDelete}
            disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-2 text-fw-danger-ink hover:text-fw-danger-ink font-medium text-sm disabled:opacity-50 transition-colors"
          >
            <IconTrash size={14} />
            Delete
          </Button>

          <Button variant="primary"
            onClick={onEdit}
            className="bg-accent-650 hover:bg-accent-750 text-text-on-accent rounded-fw-md px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <IconEdit size={14} />
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}
