'use client';

import { useId, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { useDialogLifetime } from '../../lib/dialog-lifetime';
import { useSheetDrag } from '../../lib/sheet-drag';

/**
 * The phone's sheets for Recruiting (docs/clubhouse/phone/recruiting.md), on the native <dialog> top layer like
 * `Modal`: focus is trapped, Esc closes, focus returns to what opened it, and a toast raised while one is open
 * renders inside it (CH-1812). They are built here, not from `Modal`, because the boards' bars differ: Cancel, a
 * title and Save (the edit sheet); a title and Done (the stage picker); and an iOS action sheet whose destructive
 * choice is red.
 */

function useSheetDialog(open: boolean, onClose: () => void, busy = false, surfaceSelector = '.ch-rec-sheet') {
  const { ref, reduced, retainContent } = useDialogLifetime(open, { surfaceSelector, focusSelector: 'h2' });
  // A drag that is refused (a save in flight) must not leave the sheet half way down.
  const requestClose = () => {
    if (busy) {
      const d = ref.current;
      if (d) {
        d.style.transition = 'translate var(--ch-dur-base) var(--ch-ease)';
        d.style.translate = '';
      }
      return;
    }
    onClose();
  };
  const drag = useSheetDrag(ref, requestClose, { enabled: !reduced });
  const dialogProps = {
    ref,
    onCancel: (e: SyntheticEvent) => {
      e.preventDefault();
      requestClose();
    },
    // The click is only the backdrop dismiss; the keyboard path is Esc, which <dialog> handles through onCancel.
    onClick: (e: MouseEvent) => {
      if (e.target === ref.current) requestClose();
    },
  };
  return { dialogProps, drag, retainContent };
}

/** A sheet with Cancel, a title and Save. Save is a submit button, so Enter in a field sends it. Nothing closes it while a save is in flight. */
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
  const titleId = useId();
  const { dialogProps, drag, retainContent } = useSheetDialog(open, onClose, busy);
  return (
    <dialog {...dialogProps} className="ch-rec-dlg" aria-labelledby={titleId} data-ch-code={code}>
      {retainContent(open && (
        <form
          className="ch-rec-sheet is-full"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onAction();
          }}
        >
          <div className="ch-rec-grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
          <header className="ch-rec-bar" onPointerDown={drag.onPointerDown}>
            <button type="button" className="ch-rec-bar__b" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <h2 id={titleId} className="ch-rec-bar__t" tabIndex={-1}>
              {title}
            </h2>
            <button type="submit" className="ch-rec-bar__b is-action" disabled={busy}>
              {actionLabel}
            </button>
          </header>
          <div className="ch-rec-sheet__body">{children}</div>
        </form>
      ))}
    </dialog>
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
  const titleId = useId();
  const { dialogProps, drag, retainContent } = useSheetDialog(open, onClose);
  return (
    <dialog {...dialogProps} className="ch-rec-dlg" aria-labelledby={titleId} data-ch-code={code}>
      {retainContent(open && (
        <div className="ch-rec-sheet">
          <div className="ch-rec-grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
          <header className="ch-rec-bar is-pick" onPointerDown={drag.onPointerDown}>
            <h2 id={titleId} className="ch-rec-bar__t" tabIndex={-1}>
              {title}
            </h2>
            <button type="button" className="ch-rec-bar__b is-action" onClick={onClose}>
              Done
            </button>
          </header>
          <div className="ch-rec-sheet__body">{children}</div>
          {note && <p className="ch-rec-sheet__note">{note}</p>}
        </div>
      ))}
    </dialog>
  );
}

/**
 * The iOS action sheet: a title and a line, the destructive choice in red, and Cancel apart below it. Used for
 * "Delete prospect" on the phone (CH-14501). The choice is refused while it runs.
 */
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
  const titleId = useId();
  const { dialogProps, retainContent } = useSheetDialog(open, onClose, busy, '.ch-rec-act');
  return (
    <dialog {...dialogProps} className="ch-rec-dlg is-act" aria-labelledby={titleId} data-ch-code={code}>
      {retainContent(open && (
        <div className="ch-rec-act">
          <div className="ch-rec-act__group">
            <div className="ch-rec-act__head">
              <h2 id={titleId} tabIndex={-1}>{title}</h2>
              <p>{message}</p>
            </div>
            <button type="button" className="ch-rec-act__b is-danger" disabled={busy} onClick={onAction}>
              {actionLabel}
            </button>
          </div>
          <button type="button" className="ch-rec-act__b is-cancel" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      ))}
    </dialog>
  );
}
