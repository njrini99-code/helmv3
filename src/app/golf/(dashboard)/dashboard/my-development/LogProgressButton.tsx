'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import {
  updateFocusAreaProgress,
  completeFocusArea,
} from '@/app/golf/actions/development';

interface LogProgressButtonProps {
  focusAreaId: string;
  focusAreaTitle: string;
  targetMetric: string | null;
  currentValue: number | null;
  targetValue: number | null;
}

/**
 * "Log progress" button for a player focus area card.
 *
 * Tap → opens a bottom-sheet modal showing the current value (read-only),
 * a numeric input for the new value, and an optional note. Submit calls
 * `updateFocusAreaProgress(id, newValue, { note })`; non-empty notes are
 * appended to the row's `progress_notes` jsonb column server-side.
 */
export function LogProgressButton({
  focusAreaId,
  focusAreaTitle,
  targetMetric,
  currentValue,
  targetValue,
}: LogProgressButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState<string>(
    currentValue != null ? String(currentValue) : ''
  );
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const metricLabel = targetMetric || 'Progress';

  function reset() {
    setNewValue(currentValue != null ? String(currentValue) : '');
    setNote('');
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    setOpen(false);
    // Defer reset so it doesn't flash the form contents during close anim
    setTimeout(reset, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = newValue.trim();
    if (trimmed === '') {
      addToast({ type: 'error', title: 'Please enter a new value' });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      addToast({ type: 'error', title: 'New value must be a number' });
      return;
    }

    setSubmitting(true);
    try {
      const trimmedNote = note.trim();
      const result = await updateFocusAreaProgress(focusAreaId, parsed, {
        note: trimmedNote || undefined,
      });
      if (!result.success) {
        addToast({ type: 'error', title: result.error || 'Failed to log progress' });
        setSubmitting(false);
        return;
      }
      addToast({ type: 'success', title: 'Progress updated' });
      // Clear the note textarea so the next open starts blank.
      setNote('');
      setOpen(false);
      // Trigger server component refresh so the card shows the new value
      router.refresh();
      setTimeout(reset, 200);
    } catch {
      addToast({ type: 'error', title: 'Failed to log progress' });
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="primary"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors"
      >
        Log progress
      </Button>

      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
      >
        <DrawerContent className="sm:max-w-lg sm:mx-auto sm:rounded-3xl overflow-hidden flex flex-col">
          <DrawerHeader className="flex-shrink-0">
            <DrawerTitle>Log progress</DrawerTitle>
            <DrawerDescription>{focusAreaTitle}</DrawerDescription>
          </DrawerHeader>
          <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 space-y-5 px-6 pb-6 overflow-y-auto overscroll-contain"
          >
          {/* Current value (read-only) */}
          <div>
            <p className="block text-sm font-medium text-warm-700 mb-1.5">
              Current value
            </p>
            <div className="px-3 py-2.5 rounded-lg bg-warm-50 border border-warm-200 text-warm-700">
              {currentValue ?? '—'}
              {targetValue != null && (
                <span className="text-warm-400 font-normal">
                  {' '}/ {targetValue}
                </span>
              )}
              {targetMetric && (
                <span className="ml-2 text-xs text-warm-500">{targetMetric}</span>
              )}
            </div>
          </div>

          {/* New value */}
          <Input
            label={`New value (${metricLabel})`}
            type="number"
            inputMode="decimal"
            step="any"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Enter your latest measurement"
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input in progress-logging dialog
            autoFocus
          />

          {/* Optional note */}
          <Textarea
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it go? Any context for your coach…"
            rows={3}
          />

        </form>

          {/* Pinned footer — outside the scrollable form so Save/Cancel stay
              reachable without scrolling, matching the sibling AddClassModal
              drawer's footer pattern (a plain sibling div after the scroll
              region, not the last element inside it). */}
          <div
            className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border-subtle bg-surface-sunken px-6 py-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form={formId} isLoading={submitting} disabled={submitting}>
              Save progress
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

interface MarkCompleteButtonProps {
  focusAreaId: string;
  focusAreaTitle: string;
}

/**
 * Secondary "Mark complete" button for an active focus area card.
 * Single confirm-then-call: clicking once flips into a confirmation state;
 * clicking again invokes `completeFocusArea` and refreshes the page on success.
 */
export function MarkCompleteButton({
  focusAreaId,
  focusAreaTitle,
}: MarkCompleteButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      try {
        const result = await completeFocusArea(focusAreaId);
        if (!result.success) {
          addToast({
            type: 'error',
            title: result.error || 'Failed to mark complete',
          });
          setConfirming(false);
          return;
        }
        addToast({
          type: 'success',
          title: 'Marked complete',
          description: focusAreaTitle,
        });
        setConfirming(false);
        router.refresh();
      } catch {
        addToast({ type: 'error', title: 'Failed to mark complete' });
        setConfirming(false);
      }
    });
  }

  return (
    <Button variant="primary"
      type="button"
      onClick={handleClick}
      onBlur={() => setConfirming(false)}
      disabled={pending}
      aria-label={confirming ? 'Confirm mark complete' : 'Mark complete'}
      className={
        confirming
          ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 border border-primary-600 rounded-lg transition-colors disabled:opacity-60'
          : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-warm-700 bg-cream-100/75 hover:bg-cream-100 border border-warm-200 rounded-lg transition-colors disabled:opacity-60'
      }
    >
      {pending ? 'Saving…' : confirming ? 'Confirm complete' : 'Mark complete'}
    </Button>
  );
}
