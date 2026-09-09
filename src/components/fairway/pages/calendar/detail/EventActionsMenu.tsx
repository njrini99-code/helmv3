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
import { PopoverPanel } from '@/components/fairway';
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
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
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
          onClick={() => handleRun(item.run)}
          disabled={busy}
          className={item.danger ? 'text-fw-danger-ink' : undefined}
        >
          {item.icon}
          {busy ? `${item.label}…` : item.label}
        </PopoverPanel.Item>
      ))}
    </PopoverPanel>
  );
}
