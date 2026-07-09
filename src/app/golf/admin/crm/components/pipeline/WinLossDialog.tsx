'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconTrophy, IconXCircle, IconActivity as Sprout } from '@/components/icons';
import type { Coach, CoachStatus } from '../../crm-config';
import { Button, IconButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// ============================================================================
// WinLossDialog — modal prompt shown when a coach card is dropped into one of
// the "Closed" pipeline columns (won / lost / nurture).
// On submit, the parent persists:
//   - crm_coaches.status = newStatus
//   - crm_contact_log row with contact_type='note' carrying the reason + notes
// ============================================================================

export type WinLossReason =
  | 'price'
  | 'timing'
  | 'competitor'
  | 'no_response'
  | 'budget'
  | 'feature_gap'
  | 'success'
  | 'long_term'
  | 'other';

export interface WinLossSubmission {
  status: CoachStatus;
  reason: WinLossReason;
  notes: string | null;
}

interface WinLossDialogProps {
  coach: Coach;
  newStatus: CoachStatus;
  onClose: () => void;
  onSubmit: (input: WinLossSubmission) => Promise<void> | void;
}

const REASONS_BY_STATUS: Record<'won' | 'lost' | 'nurture', { value: WinLossReason; label: string }[]> = {
  won: [
    { value: 'success', label: 'Closed via outreach' },
    { value: 'competitor', label: 'Switched from a competitor' },
    { value: 'other', label: 'Other' },
  ],
  lost: [
    { value: 'price', label: 'Price' },
    { value: 'timing', label: 'Bad timing' },
    { value: 'competitor', label: 'Chose a competitor' },
    { value: 'budget', label: 'Budget' },
    { value: 'feature_gap', label: 'Feature gap' },
    { value: 'no_response', label: 'No response / went dark' },
    { value: 'other', label: 'Other' },
  ],
  nurture: [
    { value: 'long_term', label: 'Long-term opportunity' },
    { value: 'timing', label: 'Bad timing — revisit later' },
    { value: 'no_response', label: 'No response — keep warm' },
    { value: 'other', label: 'Other' },
  ],
};

const STATUS_META: Record<'won' | 'lost' | 'nurture', { title: string; description: string; Icon: typeof IconTrophy; iconBg: string; iconColor: string; submitLabel: string; submitClass: string }> = {
  won: {
    title: 'Mark as Customer',
    description: 'Capture the closing context so you can replay successful playbooks later.',
    Icon: IconTrophy,
    iconBg: 'bg-primary-50',
    iconColor: 'text-primary-600',
    submitLabel: 'Mark won',
    submitClass: 'bg-primary-600 hover:bg-primary-700',
  },
  lost:    {
    title: 'Mark as Lost',
    description: 'Logging the loss reason helps you spot patterns across deals you didn’t close.',
    Icon: IconXCircle,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    submitLabel: 'Mark lost',
    submitClass: 'bg-red-600 hover:bg-red-700',
  },
  nurture: {
    title: 'Move to Nurture',
    description: 'They’re not closing today — note why so the follow-up shows up in your queue.',
    Icon: Sprout,
    // Deeper primary tint than `won` (not a second green hue) — keeps the
    // two "closed" outcomes visually distinct while staying in one family.
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-700',
    submitLabel: 'Move to nurture',
    submitClass: 'bg-primary-700 hover:bg-primary-800',
  },
};

export function WinLossDialog({ coach, newStatus, onClose, onSubmit }: WinLossDialogProps) {
  // Keep the closing-status string narrow so the meta lookup is type-safe.
  const closingStatus = (newStatus === 'won' || newStatus === 'lost' || newStatus === 'nurture')
    ? newStatus
    : 'lost';
  const meta = STATUS_META[closingStatus];
  const reasons = REASONS_BY_STATUS[closingStatus];

  const [reason, setReason] = useState<WinLossReason>(reasons[0]?.value ?? 'other');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC closes dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ status: newStatus, reason, notes: notes.trim() || null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = meta.Icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="winloss-dialog-title"
      className="fixed inset-0 z-modal flex items-center justify-center px-4"
    >
      <IconButton variant="default"
        type="button"
        aria-label="Close dialog"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      ><span className="sr-only">Close dialog</span></IconButton>

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl bg-cream-50 shadow-2xl border border-warm-100"
      >
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <span
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              meta.iconBg,
              meta.iconColor,
            )}
          >
            <Icon size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="winloss-dialog-title" className="text-base font-semibold text-warm-900">
              {meta.title}
            </h2>
            <p className="text-xs text-warm-500 mt-0.5">{coach.name} · {coach.school}</p>
            <p className="text-xs text-warm-500 mt-2">{meta.description}</p>
          </div>
          <IconButton variant="default"
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="p-1.5 rounded-md hover:bg-warm-100 text-warm-400 hover:text-warm-700"
          >
            <IconX size={14} />
          </IconButton>
        </div>

        <div className="px-5 py-3 space-y-4">
          <div>
            <Select
              label="Reason"
              options={reasons.map((r) => ({ value: r.value, label: r.label }))}
              value={reason}
              onChange={(v) => setReason(v as WinLossReason)}
              disabled={submitting}
            />
          </div>

          <div>
            <label
              htmlFor="winloss-notes"
              className="block text-xs font-semibold text-warm-700 mb-1.5"
            >
              Notes <span className="text-warm-400 font-normal">(optional)</span>
            </label>
            <Textarea
              id="winloss-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={submitting}
              placeholder="What happened? Anything we should remember next time?"
              className="text-sm bg-cream-50"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 flex items-center justify-end gap-2">
          <Button variant="ghost"
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button variant="ghost"
            type="submit"
            disabled={submitting}
            className={cn(
              'px-4 py-1.5 text-sm font-semibold text-white rounded-xl shadow-sm transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              meta.submitClass,
            )}
          >
            {submitting ? 'Saving…' : meta.submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
