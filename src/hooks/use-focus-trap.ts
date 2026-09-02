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
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!modalRef.current) return [];
    return Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  // Keyboard handler for Escape and Tab trapping
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
    [onClose, getFocusableElements]
  );

  // Focus management, scroll lock, and keyboard listener
  useEffect(() => {
    if (!isOpen) {
      // Restore focus when modal closes
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
        previousActiveElement.current = null;
      }
      return;
    }

    // Store currently focused element for restoration
    previousActiveElement.current = document.activeElement as HTMLElement;

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
      if (isCoarsePointer()) {
        const root = modalRef.current;
        if (root) {
          if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
          root.focus({ preventScroll: true });
        }
        return;
      }
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0]?.focus();
      }
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      clearTimeout(timer);
    };
  }, [isOpen, handleKeyDown, getFocusableElements]);

  return { modalRef };
}
