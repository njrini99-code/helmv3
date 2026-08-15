'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconTrophy, IconXCircle, IconActivity as Sprout } from '@/components/icons';
import { useFocusTrap } from '@/hooks/use-focus-trap';
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
    iconBg: 'bg-accent-50',
    iconColor: 'text-accent-700',
    submitLabel: 'Mark won',
    submitClass: 'bg-accent-650 hover:bg-accent-750',
  },
  lost:    {
    title: 'Mark as Lost',
    description: 'Logging the loss reason helps you spot patterns across deals you didn’t close.',
    Icon: IconXCircle,
    iconBg: 'bg-fw-danger-bg',
    iconColor: 'text-fw-danger-ink',
    submitLabel: 'Mark lost',
    submitClass: 'bg-fw-danger hover:bg-fw-danger/85',
  },
  nurture: {
    title: 'Move to Nurture',
    description: 'They’re not closing today — note why so the follow-up shows up in your queue.',
    Icon: Sprout,
    // Deeper primary tint than `won` (not a second green hue) — keeps the
    // two "closed" outcomes visually distinct while staying in one family.
    iconBg: 'bg-accent-100',
    iconColor: 'text-accent-700',
    submitLabel: 'Move to nurture',
    submitClass: 'bg-accent-750 hover:bg-accent-800',
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

  // Focus trap + Escape + scroll-lock + focus-restore. Mounted == open.
  const { modalRef } = useFocusTrap(true, onClose);

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
        onClick={onClose}
        className="absolute inset-0 bg-nav-bg/30"
      ><span className="sr-only">Close dialog</span></IconButton>

      {/* display:contents wrapper — pure ref anchor for useFocusTrap's Tab-cycle
          scope; a <form> can't take the hook's HTMLDivElement ref directly, and
          `contents` keeps it invisible to layout so the visual markup is unchanged. */}
      <div ref={modalRef} className="contents">
        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-md rounded-card bg-surface shadow-raise border border-border-subtle"
        >
          <div className="px-5 pt-5 pb-3 flex items-start gap-3">
            <span
              className={cn(
                'w-10 h-10 rounded-fw-md flex items-center justify-center flex-shrink-0',
                meta.iconBg,
                meta.iconColor,
              )}
            >
              <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 id="winloss-dialog-title" className="text-base font-semibold text-text-primary">
                {meta.title}
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">{coach.name} · {coach.school}</p>
              <p className="text-xs text-text-tertiary mt-2">{meta.description}</p>
            </div>
            <IconButton variant="default"
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-fw-sm hover:bg-surface-sunken text-text-tertiary hover:text-text-secondary"
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
                className="block text-xs font-semibold text-text-secondary mb-1.5"
              >
                Notes <span className="text-text-tertiary font-normal">(optional)</span>
              </label>
              <Textarea
                id="winloss-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={submitting}
                placeholder="What happened? Anything we should remember next time?"
                className="text-sm bg-surface"
              />
            </div>

            {error && (
              <div className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/20 rounded-fw-sm px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="px-5 pb-5 pt-2 flex items-center justify-end gap-2">
            <Button variant="ghost"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </Button>
            <Button variant="ghost"
              type="submit"
              disabled={submitting}
              className={cn(
                'px-4 py-1.5 text-sm font-semibold text-text-on-accent rounded-fw-md shadow-flat transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                meta.submitClass,
              )}
            >
              {submitting ? 'Saving…' : meta.submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
