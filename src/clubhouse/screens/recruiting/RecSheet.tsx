'use client';

import type { ReactNode } from 'react';
import { ActionSheet, FormSheet, ListSheet } from '../../ui/FormSheet';

/**
 * The phone's sheets for Recruiting (docs/clubhouse/phone/recruiting.md) are the shared ones (ui/FormSheet.tsx,
 * CONS-23): Cancel, a title and Save (the edit sheet); a title and Done (the stage picker); and the iOS action sheet,
 * its destructive choice in red.
 */

/** A full-height sheet with Cancel, a title and Save. Save is a submit button, so Enter in a field sends it. Nothing closes it while a save is in flight. */
export function RecFormSheet({
  open,
  onClose,
  title,
  actionLabel = 'Save',
  onAction,
  busy,
  code,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  actionLabel?: string;
  onAction: () => void;
  busy?: boolean;
  code?: string;
  children: ReactNode;
}) {
  return (
    <FormSheet open={open} onClose={onClose} title={title} actionLabel={actionLabel} onAction={onAction} busy={busy} code={code} full>
      {children}
    </FormSheet>
  );
}

/** A sheet with a title and Done: every choice in it saves as it is made (the stage picker). */
export function RecPickSheet({
  open,
  onClose,
  title,
  code,
  note,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  code?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListSheet open={open} onClose={onClose} title={title} code={code} note={note}>
      {children}
    </ListSheet>
  );
}

/** "Delete prospect" on the phone (CH-14501): the choice in red, Cancel apart below it, and both refused while it runs. */
export function RecActionSheet({
  open,
  onClose,
  title,
  message,
  actionLabel,
  onAction,
  busy,
  code,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  code?: string;
}) {
  return <ActionSheet open={open} onClose={onClose} title={title} message={message} actions={[{ label: actionLabel, onClick: onAction }]} busy={busy} code={code} />;
}
