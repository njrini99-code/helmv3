'use client';

import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useSheetDrag } from '../lib/sheet-drag';
import { useChPhone } from '../lib/use-phone';
import { Icon } from './Icon';

/**
 * Dialog on the native <dialog> top layer: focus is trapped and Esc closes
 * for free, and focus returns to the opener. Desktop: a centred sheet (radius
 * 20). Phone: a bottom sheet with a grab handle (see ui-controls.css) that
 * follows the finger down from its grab or header and closes past the
 * threshold (CH-1611). With reduced motion it fades and doesn't drag.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  width = 520,
  footer,
  children,
  code,
}: {
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  width?: number;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const drag = useSheetDrag(ref, onClose, { enabled: phone && !reduced });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      // A sheet dragged shut last time opens from the bottom again.
      d.style.translate = '';
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  return (
    // The click is only the backdrop dismiss; the keyboard path is Esc, which <dialog> handles through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="ch-modal"
      data-ch-code={code}
      style={{ ['--ch-modal-w' as string]: `${width}px` }}
      aria-labelledby="ch-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="ch-modal__panel">
          <div className="ch-modal__grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
          <header className="ch-modal__head" onPointerDown={drag.onPointerDown}>
            {icon && (
              <span className="ch-modal__icon ch-well-soft">
                <Icon icon={icon} size={17} />
              </span>
            )}
            <div className="ch-modal__titles">
              <h2 id="ch-modal-title">{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label="Close" onClick={onClose}>
              <Icon icon={X} size={15} />
            </button>
          </header>
          {children && <div className="ch-modal__body">{children}</div>}
          {footer && <footer className="ch-modal__foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
