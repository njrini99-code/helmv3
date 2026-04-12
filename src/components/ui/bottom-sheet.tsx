'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, type PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { IconX } from '@/components/icons';
import { IOS_SPRING, IOS_DURATION_SLOW } from '@/lib/ios-animations';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /**
   * Optional pinned footer. Rendered OUTSIDE the scroll container so the last
   * scroll item can fully clear it (no "partial card behind footer" bug). The
   * footer stays flush to the bottom of the sheet and respects the safe area.
   */
  footer?: React.ReactNode;
  /** Snap points as percentages of viewport height — default [0.9] = 90% height */
  snapPoints?: number[];
  /** Show drag handle at top (default: true) */
  showHandle?: boolean;
  /** Enable swipe-down to dismiss (default: true on native, true on web too) */
  swipeToClose?: boolean;
  /** Class applied to the sheet content wrapper */
  className?: string;
  /** Class applied to the scrollable content area */
  contentClassName?: string;
}

// iOS sheet presentation curve — matches UIKit's default modal presentation.
// Sourced from the shared ios-animations token file.
const SHEET_EASE = IOS_SPRING as unknown as [number, number, number, number];

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  snapPoints = [0.9],
  showHandle = true,
  swipeToClose = true,
  className,
  contentClassName,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  const titleId = useId();
  const descriptionId = useId();

  // Clamp first snap point to a sensible range and derive max height.
  const primarySnap = Math.min(Math.max(snapPoints[0] ?? 0.9, 0.1), 1);
  const maxHeightStyle = `${primarySnap * 100}vh`;

  // SSR-safe portal mounting.
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Haptic feedback on open/close transitions.
  useEffect(() => {
    if (!mounted) return;
    void triggerHaptic('light');
  }, [open, mounted]);

  // Focus management + Escape + Tab trap.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = getFocusableElements(sheetRef.current);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      if (sheetRef.current) {
        const focusable = getFocusableElements(sheetRef.current);
        focusable[0]?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
      previousActiveElement.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  // Body scroll lock while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!swipeToClose) return;
      const shouldClose = info.offset.y > 100 || info.velocity.y > 500;
      if (shouldClose) {
        onClose();
      }
    },
    [onClose, swipeToClose],
  );

  if (!mounted) return null;

  const sheet = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop — iOS-style dimmed, subtle blur */}
          <m.div
            key="bottom-sheet-backdrop"
            className="absolute inset-0 bg-warm-900/40 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: IOS_DURATION_SLOW, ease: SHEET_EASE }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <m.div
            key="bottom-sheet-panel"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              'absolute bottom-0 left-0 right-0 mx-auto w-full max-w-2xl',
              'flex flex-col',
              'bg-white/95 backdrop-blur-xl',
              'rounded-t-3xl shadow-2xl',
              'border-t border-white/40',
              className,
            )}
            style={{ maxHeight: maxHeightStyle }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: IOS_DURATION_SLOW, ease: SHEET_EASE }}
            drag={swipeToClose ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle — subtle iOS pill */}
            {showHandle && (
              <div
                className="flex-shrink-0 flex items-center justify-center pt-2.5 pb-1.5"
                aria-hidden="true"
              >
                <span className="block h-[5px] w-[36px] rounded-full bg-warm-300/80" />
              </div>
            )}

            {/* Header */}
            {(title || description) && (
              <div className="relative flex-shrink-0 px-6 pt-2 pb-3.5 border-b border-warm-100/80">
                {title && (
                  <h2
                    id={titleId}
                    className="text-[17px] font-semibold text-warm-900 tracking-[-0.01em] pr-10"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descriptionId}
                    className="text-[13px] text-warm-500 mt-1 pr-10"
                  >
                    {description}
                  </p>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className={cn(
                    'absolute top-2 right-3 w-10 h-10 rounded-full',
                    'flex items-center justify-center',
                    'text-warm-400 hover:text-warm-600 hover:bg-warm-100',
                    'transition-colors duration-150 active:scale-90',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  )}
                >
                  <IconX size={18} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Close button when there is no header */}
            {!title && !description && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  'absolute top-2 right-3 w-10 h-10 rounded-full',
                  'flex items-center justify-center',
                  'text-warm-400 hover:text-warm-600 hover:bg-warm-100',
                  'transition-colors duration-150 active:scale-90',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                )}
              >
                <IconX size={18} aria-hidden="true" />
              </button>
            )}

            {/* Content */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-4',
                '[-webkit-overflow-scrolling:touch]',
                contentClassName,
              )}
              style={
                footer
                  ? { paddingBottom: '1rem' }
                  : { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }
              }
              data-scroll-container
            >
              {children}
            </div>

            {/* Pinned footer — lives outside the scroll area so the last
                content item can fully clear it. Carries the safe-area inset
                itself so the home indicator never overlaps buttons. */}
            {footer && (
              <div
                className="flex-shrink-0 px-6 pt-3 bg-white/95 backdrop-blur-xl border-t border-warm-100/80"
                style={{
                  paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
                }}
              >
                {footer}
              </div>
            )}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(sheet, document.body);
}

export default BottomSheet;
