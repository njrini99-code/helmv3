'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { haptic } from '../lib/haptics';
import { useDialogLifetime } from '../lib/dialog-lifetime';
import { useSheetDrag } from '../lib/sheet-drag';

/**
 * The phone's bottom sheets (CONS-23), on the native <dialog> top layer like `Modal`: focus is trapped, Esc closes,
 * focus returns to what opened it, and a toast raised while one is open renders inside it (CH-1812). One bar for all
 * of them (controls.css .ch-fsheet-bar): Cancel, a title and Save (FormSheet); a title and Done (ListSheet); and the
 * iOS action sheet, its destructive choice in red (ActionSheet). Settings and Recruiting build on these.
 */

/**
 * An open edit sheet, as a phone stack sees it: whether it holds something (unsaved edits, a save in flight), and its
 * own close request (the discard question when dirty, nothing while busy). The stack asks the topmost held sheet before
 * the browser's Back or the iOS edge swipe pops the page under it (CH-8509), since sheets are not history entries.
 */
export interface ChHeldSheet {
  held: () => boolean;
  requestClose: () => void;
}
/** Registers an open sheet with a phone stack; the returned function takes it off. No provider: nothing registers. */
export const HeldSheetsContext = createContext<((sheet: ChHeldSheet) => () => void) | null>(null);

/** Opens and closes a <dialog> with `open`, follows the finger down (CH-1611), and sends Esc and the backdrop the same way. */
function useSheetDialog(open: boolean, onClose: () => void, guard?: { busy?: boolean; dirty?: boolean; ask?: () => void }) {
  const { ref, reduced, retainContent } = useDialogLifetime(open, { surfaceSelector: '.ch-fsheet', focusSelector: 'h2' });
  // A drag that is refused (unsaved changes, a save in flight) must not leave the sheet half way down.
  const springBack = () => {
    const d = ref.current;
    if (!d) return;
    d.style.transition = 'translate var(--ch-dur-base) var(--ch-ease)';
    d.style.translate = '';
  };
  const requestClose = () => {
    if (guard?.busy) return springBack();
    if (guard?.dirty && guard.ask) {
      springBack();
      return guard.ask();
    }
    onClose();
  };
  const drag = useSheetDrag(ref, requestClose, { reduced });
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
  return { dialogProps, drag, requestClose, retainContent };
}

export interface FormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  actionLabel?: string;
  onAction: () => void;
  /** Save stays off until something changes (and while what is there is invalid). */
  actionDisabled?: boolean;
  danger?: boolean;
  /** A save is in flight: nothing closes the sheet. */
  busy?: boolean;
  /** Unsaved changes: closing asks first. */
  dirty?: boolean;
  /** Full height (an edit sheet), not the height of its content. */
  full?: boolean;
  code?: string;
  note?: ReactNode;
  children: ReactNode;
}

/**
 * A sheet with Cancel, a title and a Save-type action. The action is a submit button, so Enter in a field sends it.
 * Cancel, a drag down, Esc, the backdrop, and the browser's Back or the iOS edge swipe (through HeldSheetsContext) all
 * ask first when `dirty` (CH-8509) and do nothing while `busy`.
 */
export function FormSheet({ open, onClose, title, actionLabel = 'Save', onAction, actionDisabled, danger, busy, dirty, full, code, note, children }: FormSheetProps) {
  const titleId = useId();
  const [asking, setAsking] = useState(false);
  const { dialogProps, drag, requestClose, retainContent } = useSheetDialog(open, onClose, { busy, dirty, ask: () => setAsking(true) });
  // While open, a Back that would pop the page under this sheet asks it first, through the same close as Cancel.
  const register = useContext(HeldSheetsContext);
  const latest = useRef({ held: false, requestClose });
  useEffect(() => {
    latest.current = { held: !!(busy || dirty), requestClose };
  });
  useEffect(() => {
    if (!open || !register) return;
    return register({ held: () => latest.current.held, requestClose: () => latest.current.requestClose() });
  }, [open, register]);
  return (
    <>
      <dialog {...dialogProps} className={'ch-fsheet-dlg' + (full ? ' is-full' : '')} aria-labelledby={titleId} data-ch-code={code}>
        {retainContent(open && (
          <form
            className="ch-fsheet"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!actionDisabled && !busy) onAction();
            }}
          >
            <div className="ch-grab ch-grab--hit" aria-hidden="true" onPointerDown={drag.onPointerDown} />
            <header className="ch-fsheet-bar" onPointerDown={drag.onPointerDown}>
              <button type="button" className="ch-fsheet-bar__b" onClick={requestClose}>
                Cancel
              </button>
              <h2 id={titleId} className="ch-fsheet-bar__t" tabIndex={-1}>
                {title}
              </h2>
              <button
                type="submit"
                className={'ch-fsheet-bar__b is-action' + (danger ? ' is-danger' : '')}
                disabled={actionDisabled || busy}
                data-ch-code={busy ? 'CH-8402' : undefined}
              >
                {actionLabel}
              </button>
            </header>
            <div className="ch-fsheet__body">{children}</div>
            {note && <p className="ch-fsheet__note">{note}</p>}
          </form>
        ))}
      </dialog>
      <ActionSheet
        open={asking}
        onClose={() => setAsking(false)}
        code="CH-8509"
        title="Discard your changes?"
        message="What you changed hasn’t been saved."
        cancelLabel="Keep editing"
        actions={[
          {
            label: 'Discard changes',
            onClick: () => {
              setAsking(false);
              onClose();
            },
          },
        ]}
      />
    </>
  );
}

/** A sheet with a title, a line under it and Done: every control in it saves as it changes (a picker, a list of switches). */
export function ListSheet({
  open,
  onClose,
  title,
  subtitle,
  code,
  note,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  code?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const { dialogProps, drag, retainContent } = useSheetDialog(open, onClose);
  return (
    <dialog {...dialogProps} className="ch-fsheet-dlg" aria-labelledby={titleId} data-ch-code={code}>
      {retainContent(open && (
        <div className="ch-fsheet">
          <div className="ch-grab ch-grab--hit" aria-hidden="true" onPointerDown={drag.onPointerDown} />
          <header className="ch-fsheet-lbar" onPointerDown={drag.onPointerDown}>
            <div className="ch-fsheet-lbar__t">
              <h2 id={titleId} tabIndex={-1}>{title}</h2>
              {subtitle && <span>{subtitle}</span>}
            </div>
            <button type="button" className="ch-fsheet-bar__b is-action" onClick={onClose}>
              Done
            </button>
          </header>
          <div className="ch-fsheet__body">{children}</div>
          {note && <p className="ch-fsheet__note">{note}</p>}
        </div>
      ))}
    </dialog>
  );
}

/**
 * The iOS action sheet: a card with what is about to happen and the destructive choice in red, and Cancel in a card of
 * its own. It warns as it opens (D-70). Focus starts on Cancel, so Enter never confirms by accident. While `busy` (the
 * choice is running) nothing in it answers and nothing closes it.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
  busy,
  code,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actions: ReadonlyArray<{ label: string; onClick: () => void; disabled?: boolean }>;
  cancelLabel?: string;
  busy?: boolean;
  code?: string;
}) {
  const titleId = useId();
  const messageId = useId();
  const { ref, retainContent } = useDialogLifetime(open, { focusSelector: '.ch-fsheet-act__cancel' });
  useEffect(() => {
    if (open) haptic('warning');
  }, [open]);
  const close = () => {
    if (!busy) onClose();
  };
  return (
    // The click is only the backdrop dismiss; the keyboard path is Esc, which <dialog> handles through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      role="alertdialog"
      className="ch-fsheet-act"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      data-ch-code={code}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      {retainContent(open && (
        <>
          <div className="ch-fsheet-act__card">
            <div className="ch-fsheet-act__msg">
              <b id={titleId}>{title}</b>
              {message && <span id={messageId}>{message}</span>}
            </div>
            {actions.map((a) => (
              <button key={a.label} type="button" className="ch-fsheet-act__btn is-danger" disabled={a.disabled || busy} onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
          <button type="button" className="ch-fsheet-act__cancel" disabled={busy} onClick={close}>
            {cancelLabel}
          </button>
        </>
      ))}
    </dialog>
  );
}

/** The draft of a sheet's fields: it starts from what is saved every time the sheet opens, and is dirty while it differs. */
export function useSheetDraft<T>(saved: T, open: boolean) {
  const [draft, setDraft] = useState(saved);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(saved);
  }
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(saved);
  return { draft, setDraft, dirty };
}
