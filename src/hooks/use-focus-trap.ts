'use client';

import { useEffect, useRef, useCallback } from 'react';
import { isCoarsePointer } from '@/lib/utils/pointer';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Hook for managing focus trapping inside modals.
 *
 * Provides:
 * - Focus trapping (Tab/Shift+Tab cycles within modal)
 * - Focus restoration to trigger element on close
 * - Escape key to close
 * - Auto-focus first focusable element on open
 * - Body scroll lock
 */
export function useFocusTrap(isOpen: boolean, onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null);
  // Latest onClose, read at keypress time. Callers pass inline handlers, so
  // keying the open effect on `onClose` re-ran it on EVERY parent re-render
  // while open (e.g. ConfirmDialog's isLoading flip): that re-captured an
  // element INSIDE the dialog as the "opener" and yanked focus back to the
  // first field mid-interaction, and on close "restored" to a removed node
  // (focus fell to <body>). The effect now depends on `isOpen` alone.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!modalRef.current) return [];
    return Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  // Keyboard handler for Escape and Tab trapping
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0]!;
        const lastElement = focusableElements[focusableElements.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    },
    [getFocusableElements]
  );

  // Focus management, scroll lock, and keyboard listener — one open session
  // per `isOpen === true`; the cleanup restores focus, which also covers a
  // consumer that unmounts while still open (`{open && <Dialog/>}`).
  useEffect(() => {
    if (!isOpen) return;

    // Store currently focused element for restoration
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyDown);

    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first focusable element after render — desktop only. On touch,
    // the first focusable is often a text input, and focusing it summons the
    // iOS keyboard over the overlay on open (owner TestFlight report,
    // 2026-08-26). There we land focus on the trap's root instead — the
    // tabindex is stamped programmatically because this hook has 17 consumers
    // and their roots don't declare one — so focus stays inside the trap and
    // the keyboard waits for a tap.
    const timer = setTimeout(() => {
      const root = modalRef.current;
      if (isCoarsePointer()) {
        if (root) {
          if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
          root.focus({ preventScroll: true });
        }
        return;
      }
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0]?.focus();
      } else if (root) {
        // Nothing tabbable (a read-only panel): still move focus INTO the
        // dialog so assistive tech leaves the page behind.
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
        root.focus({ preventScroll: true });
      }
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      clearTimeout(timer);
      if (previousActiveElement && previousActiveElement.isConnected) {
        previousActiveElement.focus({ preventScroll: true });
      }
    };
  }, [isOpen, handleKeyDown, getFocusableElements]);

  return { modalRef };
}
