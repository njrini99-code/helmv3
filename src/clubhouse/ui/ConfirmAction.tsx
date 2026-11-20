'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * A question before an action that can't be undone (premium plan batch 5), as iOS's destructive alert and Radix's
 * AlertDialog: an alert dialog, Cancel first and focused as it opens (the safe choice), the action named by its verb
 * ("Delete round", never "OK"), and a warning haptic as the destructive key is pressed (Button's danger feel). The
 * dialog stays up while the action runs (`busy`) and closes when the caller says so.
 */
export function ConfirmAction({
  open,
  onClose,
  title,
  body,
  confirm,
  onConfirm,
  busy = false,
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: ReactNode;
  /** The action's own words: "Delete round", "Remove player". */
  confirm: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      role="alertdialog"
      title={title}
      initialFocus="[data-ch-confirm-cancel]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data={{ 'data-ch-confirm-cancel': '' }} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirm}
          </Button>
        </>
      }
    >
      {body && <div className="ch-confirm__body">{body}</div>}
    </Modal>
  );
}
