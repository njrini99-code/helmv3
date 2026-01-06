'use client';

/**
 * Cancellation Dialog Component
 *
 * Respectful UX for cancelling events:
 * - Urgency warning (if today/tomorrow)
 * - RSVP count notification preview
 * - Reason textarea with quick chips
 * - Player notification confirmation
 * - Clear cancel/confirm actions
 *
 * Prevents accidental cancellations while making the process smooth.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/calendar/premium-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  Users,
  Calendar,
  Clock,
  CloudRain,
  Building,
  AlertCircle,
  User,
  X,
} from 'lucide-react';
import { format, differenceInHours, isToday, isTomorrow } from 'date-fns';

export interface CancellationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notifyParticipants: boolean) => Promise<void>;
  event: {
    id: string;
    title: string;
    event_type: string;
    start_time: string;
    end_time?: string | null;
    location?: string | null;
    rsvp_confirmed_count?: number;
    rsvp_total_count?: number;
  };
}

const QUICK_REASONS = [
  { icon: CloudRain, label: 'Weather', value: 'Cancelled due to weather conditions' },
  { icon: Building, label: 'Facility', value: 'Facility unavailable' },
  { icon: User, label: 'Coach', value: 'Coach unavailable' },
  { icon: AlertCircle, label: 'Low Attendance', value: 'Insufficient attendance' },
  { icon: Calendar, label: 'Rescheduling', value: 'Event will be rescheduled' },
  { icon: AlertTriangle, label: 'Other', value: '' },
];

export function CancellationDialog({
  open,
  onClose,
  onConfirm,
  event,
}: CancellationDialogProps) {
  const [reason, setReason] = useState('');
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [loading, setLoading] = useState(false);

  const eventDate = new Date(event.start_time);
  const hoursUntil = differenceInHours(eventDate, new Date());
  const isUrgent = hoursUntil <= 24;
  const isVeryUrgent = isToday(eventDate) || isTomorrow(eventDate);

  const hasRSVP = event.rsvp_total_count && event.rsvp_total_count > 0;
  const confirmedCount = event.rsvp_confirmed_count || 0;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(reason, notifyParticipants);
      // Reset form
      setReason('');
      setNotifyParticipants(true);
      onClose();
    } catch (error) {
      console.error('Failed to cancel event:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickReason(value: string) {
    setReason(value);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-2xl p-0 max-w-lg">
        <DialogHeader className="px-6 py-4 border-b border-slate-200">
          <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <X className="w-5 h-5 text-rose-600" />
            Cancel Event
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-sm mt-1">
            This action cannot be undone. Participants will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
          {/* Event summary */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-slate-900">{event.title}</h4>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{format(eventDate, 'MMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{formatTime(event.start_time)}</span>
              </div>
            </div>
          </div>

          {/* Urgency warning */}
          {isUrgent && (
            <div
              className={cn(
                'flex items-start gap-3 p-4 rounded-lg border-l-4',
                isVeryUrgent
                  ? 'bg-rose-50 border-rose-500'
                  : 'bg-amber-50 border-amber-500'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-5 h-5 shrink-0 mt-0.5',
                  isVeryUrgent ? 'text-rose-600' : 'text-amber-600'
                )}
              />
              <div>
                <p
                  className={cn(
                    'font-medium text-sm',
                    isVeryUrgent ? 'text-rose-900' : 'text-amber-900'
                  )}
                >
                  {isVeryUrgent ? 'Last-Minute Cancellation' : 'Short Notice'}
                </p>
                <p
                  className={cn(
                    'text-xs mt-1',
                    isVeryUrgent ? 'text-rose-700' : 'text-amber-700'
                  )}
                >
                  This event is{' '}
                  {isToday(eventDate) ? 'today' : isTomorrow(eventDate) ? 'tomorrow' : 'soon'}.
                  Players may have already made plans.
                </p>
              </div>
            </div>
          )}

          {/* RSVP notification preview */}
          {hasRSVP && (
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Users className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-blue-900">
                  {confirmedCount} of {event.rsvp_total_count} players confirmed
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {notifyParticipants
                    ? `${event.rsvp_total_count} players will be notified via email and app notification`
                    : 'No notifications will be sent'}
                </p>
              </div>
            </div>
          )}

          {/* Quick reason chips */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Reason for cancellation
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {QUICK_REASONS.map((quickReason) => {
                const Icon = quickReason.icon;
                const isSelected = reason === quickReason.value;

                return (
                  <button
                    key={quickReason.label}
                    type="button"
                    onClick={() => handleQuickReason(quickReason.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all',
                      'hover:border-slate-300 hover:bg-slate-50',
                      isSelected
                        ? 'border-green-600 bg-green-50'
                        : 'border-slate-200 bg-white'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        isSelected ? 'text-green-600' : 'text-slate-400'
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isSelected ? 'text-green-700' : 'text-slate-600'
                      )}
                    >
                      {quickReason.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom reason textarea */}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add details or explanation (optional)"
              className="min-h-[80px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-slate-500 mt-1">{reason.length}/500 characters</p>
          </div>

          {/* Notification toggle */}
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={notifyParticipants}
              onChange={(e) => setNotifyParticipants(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-2 focus:ring-green-100"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">
                Notify all participants
              </p>
              <p className="text-xs text-slate-600">
                Send cancellation notification via email and app
              </p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="px-4"
          >
            Keep Event
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 bg-rose-600 hover:bg-rose-700"
          >
            {loading ? 'Cancelling...' : 'Cancel Event'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
