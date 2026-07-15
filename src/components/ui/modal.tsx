'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { X, AlertTriangle, HelpCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean; // Backward compatibility
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * OPT-IN: below `md` (768px), render as a bottom sheet — anchored to the
   * viewport bottom, square bottom corners, a drag-affordance bar, safe-area
   * bottom padding, and a keyboard-safe `dvh`-based max height. At `md` and
   * above the centered dialog is unchanged. Pure CSS (`md:` breakpoints) —
   * no client-side media-query read, so there is no hydration flash.
   * Absent (the default) renders byte-identical to before this prop existed.
   * @default false
   */
  sheetOnMobile?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-3xl',
};

// Get all focusable elements within a container
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
}

export function Modal({
  open,
  isOpen, // Backward compatibility
  onClose,
  title,
  description,
  children,
  size = 'md',
  sheetOnMobile = false,
}: ModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (isModalOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
      return;
    }
    setIsAnimating(false);
    const timer = setTimeout(() => setIsVisible(false), 200);
    return () => clearTimeout(timer);
  }, [isModalOpen]);

  // Focus trap handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = getFocusableElements(modalRef.current);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

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
  }, [onClose]);

  // Focus management and keyboard handling
  useEffect(() => {
    if (!isModalOpen) {
      previousActiveElement.current?.focus();
      return;
    }

    previousActiveElement.current = document.activeElement as HTMLElement;
    document.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusableElements = getFocusableElements(modalRef.current);
        focusableElements[0]?.focus();
      }
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isModalOpen, handleKeyDown]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        sheetOnMobile
          ? 'items-end justify-center p-0 md:items-center md:justify-center md:p-4'
          : 'items-center justify-center p-4',
      )}
    >
      {/* Backdrop with blur */}
      <div
        className={cn(
          'absolute inset-0 bg-warm-900/50 backdrop-blur-sm transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-description' : undefined}
        className={cn(
          'relative z-10 w-full bg-cream-50/95 backdrop-blur-xl border border-warm-200/55 shadow-2xl',
          'transition-all duration-200 ease-out flex flex-col',
          sheetOnMobile
            ? [
                // Keyboard-safe: `dvh` tracks the *visual* viewport (iOS
                // Safari URL bar / on-screen keyboard), unlike static `vh`.
                'max-h-[calc(100dvh-2rem)]',
                'rounded-t-[24px] rounded-b-none md:rounded-[24px]',
                isAnimating
                  ? 'opacity-100 translate-y-0 scale-100'
                  : 'opacity-0 translate-y-full scale-100 md:translate-y-4 md:scale-[0.97]',
              ]
            : [
                'max-h-[calc(100vh-2rem)]',
                'rounded-[24px]',
                isAnimating
                  ? 'opacity-100 translate-y-0 scale-100'
                  : 'opacity-0 translate-y-4 scale-[0.97]',
              ],
          sizeClasses[size],
        )}
      >
        {/* Drag-affordance bar — mobile bottom-sheet only, decorative. */}
        {sheetOnMobile && (
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 shrink-0 rounded-full bg-warm-300 md:hidden"
          />
        )}

        {/* Header */}
        {(title || description) && (
          <div className="px-6 pt-6 pb-4 flex-shrink-0">
            {title && (
              <h2 id="modal-title" className="text-lg font-bold text-warm-900 pr-10">{title}</h2>
            )}
            {description && (
              <p id="modal-description" className="text-sm text-warm-500 mt-1">{description}</p>
            )}
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          className={cn(
            'absolute top-3 right-3 z-10 w-11 h-11 rounded-[10px]',
            'flex items-center justify-center',
            'text-warm-400 hover:text-warm-600 hover:bg-warm-100',
            'transition-all duration-150',
            'active:scale-90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
          )}
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Body — scrollable when content is tall */}
        <div
          className={cn(
            'px-6 overflow-y-auto flex-1 min-h-0',
            sheetOnMobile ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6' : 'pb-6',
          )}
          data-scroll-container
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'success';
  isLoading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmModalProps) {
  const iconConfig = {
    default: { Icon: HelpCircle, bg: 'bg-primary-100', color: 'text-primary-600' },
    danger: { Icon: AlertTriangle, bg: 'bg-red-100', color: 'text-red-600' },
    success: { Icon: CheckCircle, bg: 'bg-primary-100', color: 'text-primary-600' },
  };

  const { Icon, bg, color } = iconConfig[variant];

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="text-center">
        {/* Icon with animation */}
        <div className={cn(
          'w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center',
          'animate-scale-in',
          bg
        )}>
          <Icon className={cn('w-6 h-6', color)} />
        </div>

        <h3 className="text-lg font-bold text-warm-900 mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-warm-500 mb-6">{description}</p>
        )}

        <div className="flex items-center gap-3 justify-center">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={cn(
              'px-5 py-2.5 min-h-[44px] text-warm-600 font-medium text-sm',
              'border border-warm-200 rounded-[10px]',
              'hover:bg-warm-50 active:scale-[0.97]',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'px-5 py-2.5 min-h-[44px] font-medium text-sm rounded-[10px]',
              'transition-all duration-200 active:scale-[0.97]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary-600 text-white hover:bg-primary-700',
            )}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {confirmText}
              </div>
            ) : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Modal footer for action buttons (backward compatibility)
export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 pt-4 mt-4 border-t border-warm-100', className)}>
      {children}
    </div>
  );
}
