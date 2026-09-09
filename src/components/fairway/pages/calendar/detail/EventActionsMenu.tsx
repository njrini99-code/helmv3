'use client';

/**
 * EventActionsMenu — the anchored "More" menu for destructive event-detail
 * actions (§2.10). Every action here is OPTIONAL: a handler absent from
 * props means that action is not wired for this call site yet, and the item
 * is simply not rendered — never shown disabled/fake (honesty rule: no
 * fabricated availability). The trigger itself only renders once at least
 * one action applies to the event's current state.
 */

import * as React from 'react';
import { MoreHorizontal, Ban, RotateCcw, Trash2 } from 'lucide-react';
import { PopoverPanel, Button, ModalShell } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

export interface EventActionsMenuProps {
  event: CalendarEvent;
  /** Soft-cancel a live event. Hidden once the event is already cancelled. */
  onCancelEvent?: (event: CalendarEvent) => Promise<{ success: boolean; error?: string }>;
  /** Un-cancel a soft-cancelled event. Shown only when the event is cancelled. */
  onRestoreEvent?: (event: CalendarEvent) => Promise<{ success: boolean; error?: string }>;
  /** Hard-delete an already-cancelled event. Shown only when the event is cancelled. */
  onDeletePermanently?: (event: CalendarEvent) => Promise<{ success: boolean; error?: string }>;
}

export function EventActionsMenu({
  event,
  onCancelEvent,
  onRestoreEvent,
  onDeletePermanently,
}: EventActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Destructive items never run from the menu tap itself: the tap opens a
  // ModalShell confirm with consequence copy (same pattern as the editor's
  // cancel/delete dialogs), and only the confirm's danger button runs.
  const [confirm, setConfirm] = React.useState<'cancel' | 'delete' | null>(null);
  const isCancelled = event.status === 'cancelled';

  const items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    danger?: boolean;
    run: () => Promise<{ success: boolean; error?: string }>;
  }> = [];

  if (!isCancelled && onCancelEvent) {
    items.push({
      key: 'cancel',
      label: 'Cancel event',
      icon: <Ban className="h-4 w-4" aria-hidden />,
      danger: true,
      run: () => onCancelEvent(event),
    });
  }
  if (isCancelled && onRestoreEvent) {
    items.push({
      key: 'restore',
      label: 'Restore event',
      icon: <RotateCcw className="h-4 w-4" aria-hidden />,
      run: () => onRestoreEvent(event),
    });
  }
  if (isCancelled && onDeletePermanently) {
    items.push({
      key: 'delete',
      label: 'Delete permanently',
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      danger: true,
      run: () => onDeletePermanently(event),
    });
  }

  if (items.length === 0) return null;

  const handleRun = async (run: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      if (!result.success) {
        setError(result.error ?? 'Something went wrong. Try again.');
        return;
      }
      setOpen(false);
      setConfirm(null);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancelItem = items.find((item) => item.key === 'cancel');
  const deleteItem = items.find((item) => item.key === 'delete');

  return (
    <>
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      surface="matte"
      side="bottom"
      align="end"
      width="sm"
      ariaLabel="More event actions"
      trigger={
        <button
          type="button"
          aria-label="More actions"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <MoreHorizontal className="h-4.5 w-4.5" aria-hidden />
        </button>
      }
    >
      {error ? (
        <p role="alert" className="px-2.5 pb-1.5 font-fw-sans text-caption text-fw-danger-ink">
          {error}
        </p>
      ) : null}
      {items.map((item) => (
        <PopoverPanel.Item
          key={item.key}
          onClick={() => {
            if (item.key === 'cancel' || item.key === 'delete') {
              setOpen(false);
              setConfirm(item.key);
              return;
            }
            void handleRun(item.run);
          }}
          disabled={busy}
          className={item.danger ? 'text-fw-danger-ink' : undefined}
        >
          {item.icon}
          {busy ? `${item.label}…` : item.label}
        </PopoverPanel.Item>
      ))}
    </PopoverPanel>

    {cancelItem ? (
      <ModalShell
        open={confirm === 'cancel'}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirm(null);
        }}
        size="sm"
        title="Cancel this event?"
        description={
          <>
            Cancel <span className="font-medium text-text-primary">{event.title || 'this event'}</span>?
            Attendees are notified and every RSVP is kept. You can restore it later from the cancelled state.
          </>
        }
      >
        {error ? (
          <p role="alert" className="font-fw-sans text-caption text-fw-danger-ink">
            {error}
          </p>
        ) : null}
        <ModalShell.Footer>
          <Button variant="ghost" type="button" onClick={() => setConfirm(null)} disabled={busy}>
            Keep event
          </Button>
          <Button variant="danger" type="button" busy={busy} onClick={() => void handleRun(cancelItem.run)}>
            Cancel event
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    ) : null}

    {deleteItem ? (
      <ModalShell
        open={confirm === 'delete'}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirm(null);
        }}
        size="sm"
        title="Delete this event permanently?"
        description={
          <>
            Permanently delete <span className="font-medium text-text-primary">{event.title || 'this event'}</span>?
            Every RSVP and attendance record for it is erased forever. This can&apos;t be undone.
          </>
        }
      >
        {error ? (
          <p role="alert" className="font-fw-sans text-caption text-fw-danger-ink">
            {error}
          </p>
        ) : null}
        <ModalShell.Footer>
          <Button variant="ghost" type="button" onClick={() => setConfirm(null)} disabled={busy}>
            Keep event
          </Button>
          <Button variant="danger" type="button" busy={busy} onClick={() => void handleRun(deleteItem.run)}>
            Delete permanently
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    ) : null}
    </>
  );
}
