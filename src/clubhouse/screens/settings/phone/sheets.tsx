'use client';

import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { Icon } from '../../../ui/Icon';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useSheetDrag } from '../../../lib/sheet-drag';
import { useReportDirty } from '../parts';

/**
 * The phone's sheets (docs/clubhouse/phone/settings.md), on the native <dialog>
 * top layer like `Modal`: focus is trapped, Esc closes, and toasts raised
 * while one is open render inside it (CH-1812). They are built here, not from
 * `Modal`, because the design's bars differ: Cancel, a title and Save; a title
 * and Done; an iOS action sheet with the destructive choice in red.
 */

/** Opens and closes a <dialog> with `open`, follows the finger down (CH-1611), and sends Esc and the backdrop the same way. */
function useSheetDialog(open: boolean, onClose: () => void, guard?: { busy?: boolean; dirty?: boolean; ask: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const reduced = useChReducedMotion();
  // A drag that is refused (unsaved changes, a save in flight) must not leave the sheet half way down.
  const springBack = () => {
    const d = ref.current;
    if (!d) return;
    d.style.transition = 'translate var(--ch-dur-base) var(--ch-ease)';
    d.style.translate = '';
  };
  const requestClose = () => {
    if (guard?.busy) return springBack();
    if (guard?.dirty) {
      springBack();
      return guard.ask();
    }
    onClose();
  };
  const drag = useSheetDrag(ref, requestClose, { enabled: !reduced });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.style.transition = '';
      d.style.translate = '';
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);
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
  return { dialogProps, drag, requestClose };
}

/**
 * A sheet with Cancel, a title and a Save-type action (the design's Profile sheet). The action is a submit button, so
 * Enter in a field sends it. Cancel, a drag down, Esc and the backdrop all ask first when `dirty` (CH-8509) and do
 * nothing while `busy`.
 */
export function FormSheet({
  open,
  onClose,
  title,
  actionLabel = 'Save',
  onAction,
  actionDisabled,
  danger,
  busy,
  dirty,
  full,
  code,
  note,
  children,
}: {
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
}) {
  const titleId = useId();
  const [asking, setAsking] = useState(false);
  // The page guards on any unsaved edit: closing or reloading the tab asks (CH-8508), and so does a link off the page (CH-8506).
  useReportDirty(titleId, open && !!dirty);
  const { dialogProps, drag, requestClose } = useSheetDialog(open, onClose, { busy, dirty, ask: () => setAsking(true) });
  return (
    <>
      <dialog {...dialogProps} className={'ch-setm-dlg' + (full ? ' is-full' : '')} aria-labelledby={titleId} data-ch-code={code}>
        {open && (
          <form
            className="ch-setm-sheet"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!actionDisabled && !busy) onAction();
            }}
          >
            <div className="ch-setm-grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
            <header className="ch-setm-bar" onPointerDown={drag.onPointerDown}>
              <button type="button" className="ch-setm-bar__b" onClick={requestClose}>
                Cancel
              </button>
              <h2 id={titleId} className="ch-setm-bar__t">
                {title}
              </h2>
              <button
                type="submit"
                className={'ch-setm-bar__b is-action' + (danger ? ' is-danger' : '')}
                disabled={actionDisabled || busy}
                data-ch-code={busy ? 'CH-8402' : undefined}
              >
                {actionLabel}
              </button>
            </header>
            <div className="ch-setm-sheet__body">{children}</div>
            {note && <p className="ch-setm-sheet__note">{note}</p>}
          </form>
        )}
      </dialog>
      <ActionSheet
        open={asking}
        onClose={() => setAsking(false)}
        code="CH-8509"
        title="Discard your changes?"
        message="What you changed hasn't been saved."
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

/** A sheet with a title, a line under it and Done (the design's per-kind notification sheet): every control in it saves as it changes. */
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
  const { dialogProps, drag } = useSheetDialog(open, onClose);
  return (
    <dialog {...dialogProps} className="ch-setm-dlg" aria-labelledby={titleId} data-ch-code={code}>
      {open && (
        <div className="ch-setm-sheet">
          <div className="ch-setm-grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
          <header className="ch-setm-lbar" onPointerDown={drag.onPointerDown}>
            <div className="ch-setm-lbar__t">
              <h2 id={titleId}>{title}</h2>
              {subtitle && <span>{subtitle}</span>}
            </div>
            <button type="button" className="ch-setm-bar__b is-action" onClick={onClose}>
              Done
            </button>
          </header>
          <div className="ch-setm-sheet__body">{children}</div>
          {note && <p className="ch-setm-sheet__note">{note}</p>}
        </div>
      )}
    </dialog>
  );
}

/** A short list of choices in a bottom sheet, instead of a dropdown; choosing one closes it with a selection tick. */
export function PickerSheet<V extends string>({
  open,
  onClose,
  title,
  options,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onPick: (v: V) => void;
}) {
  return (
    <ListSheet open={open} onClose={onClose} title={title}>
      <div className="ch-setm-card" role="radiogroup" aria-label={title}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={'ch-setm-row is-pick' + (o.value === value ? ' is-on' : '')}
            onClick={() => {
              haptic('select');
              onPick(o.value);
            }}
          >
            <span className="ch-setm-row__l">{o.label}</span>
            {o.value === value && <Icon icon={Check} size={18} className="ch-setm-check" />}
          </button>
        ))}
      </div>
    </ListSheet>
  );
}

/**
 * The iOS action sheet: a card with what is about to happen and the destructive choice in red, and Cancel in a card of
 * its own. It warns as it opens (D-70). Focus starts on Cancel, so Enter never confirms by accident.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
  code,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actions: ReadonlyArray<{ label: string; onClick: () => void; disabled?: boolean }>;
  cancelLabel?: string;
  code?: string;
}) {
  const titleId = useId();
  const messageId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      cancel.current?.focus();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    }
  }, [open]);
  useEffect(() => {
    if (open) haptic('warning');
  }, [open]);
  return (
    // The click is only the backdrop dismiss; the keyboard path is Esc, which <dialog> handles through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      role="alertdialog"
      className="ch-setm-act"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      data-ch-code={code}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="ch-setm-act__card">
            <div className="ch-setm-act__msg">
              <b id={titleId}>{title}</b>
              {message && <span id={messageId}>{message}</span>}
            </div>
            {actions.map((a) => (
              <button key={a.label} type="button" className="ch-setm-act__btn is-danger" disabled={a.disabled} onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
          <button ref={cancel} type="button" className="ch-setm-act__cancel" onClick={onClose}>
            {cancelLabel}
          </button>
        </>
      )}
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
