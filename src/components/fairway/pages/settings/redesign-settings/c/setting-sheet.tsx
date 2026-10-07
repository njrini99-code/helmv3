'use client';

/**
 * TEMP redesign direction C (removed before ship) — the Sheet a Setup card row
 * opens: a bottom sheet on phones, a right-hand panel from `md` up.
 *
 * Closing never silently drops an explicit-save panel's edits:
 *   - while the panel holds unsaved edits (or a save is in flight) the sheet is
 *     `dismissible={false}`, so the scrim and drag-to-dismiss do nothing. It is
 *     gated up front rather than by refusing onOpenChange, because a refused
 *     close after a drag release can strand the panel at the dragged offset;
 *   - "Done" and Escape ask "Discard unsaved changes?" instead of closing;
 *   - leaving the page is still covered by the screen's UnsavedChangesGuard.
 */

import { useState, type ReactNode } from 'react';
import { Button, ConfirmAlert, Sheet } from '@/components/fairway';
import { useUnsavedProbe } from './unsaved-probe';

/**
 * Every panel wraps itself in SectionCard: a small heading over a bordered
 * Surface. Inside a sheet that Surface is a card on a card and costs 48px of
 * width, so its chrome is dropped and the form sits on the sheet.
 * JoinTeamSection is a bare Surface, handled by the second group.
 */
const FLATTEN_PANEL_CARD = [
  '[&_section]:gap-4',
  '[&_section>div:first-child]:px-0',
  '[&_section>[data-slot=surface]]:border-0',
  '[&_section>[data-slot=surface]]:bg-transparent',
  '[&_section>[data-slot=surface]]:p-0',
  '[&_section>[data-slot=surface]]:shadow-none',
  '[&>[data-slot=surface]]:border-0',
  '[&>[data-slot=surface]]:bg-transparent',
  '[&>[data-slot=surface]]:p-0',
  '[&>[data-slot=surface]]:shadow-none',
].join(' ');

export interface SettingSheetProps {
  open: boolean;
  /** The row's name; the accessible title (the panel shows its own heading). */
  title: string;
  /** The panel has an explicit Save, so closing must not drop its edits. */
  guarded: boolean;
  onRequestClose: () => void;
  onExited?: () => void;
  children: ReactNode;
}

export function SettingSheet({ open, title, guarded, onRequestClose, onExited, children }: SettingSheetProps) {
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const probe = useUnsavedProbe(open && guarded ? body : null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const holdOpen = guarded && (probe.unsaved || probe.saving);

  const requestClose = () => {
    if (guarded) {
      // Fresh read: the rendered verdict can trail the latest keystroke.
      const now = probe.readNow();
      if (now.saving) return;
      if (now.unsaved) {
        setConfirmingDiscard(true);
        return;
      }
    }
    onRequestClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        side="right"
        mobileSide="bottom"
        title={title}
        // The panel's own SectionCard heading is the visible title; showing
        // the sheet title too would print the same words twice.
        hideTitle
        dismissible={!holdOpen}
        onEscapeKeyDown={(event) => {
          if (!holdOpen) return;
          event.preventDefault();
          requestClose();
        }}
        trailingAction={
          <Button variant="ghost" size="md" busy={probe.saving} onClick={requestClose} className="font-semibold">
            Done
          </Button>
        }
        onExited={onExited}
        data-slot="setup-card-sheet"
      >
        <Sheet.Body ref={setBody} className={`pt-5 ${FLATTEN_PANEL_CARD}`}>
          {children}
        </Sheet.Body>
      </Sheet>
      <ConfirmAlert
        open={confirmingDiscard}
        title="Discard unsaved changes?"
        message="You have unsaved edits in this panel. If you close it now, they'll be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={() => {
          setConfirmingDiscard(false);
          onRequestClose();
        }}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </>
  );
}
