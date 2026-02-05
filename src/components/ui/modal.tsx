'use client';

import { useEffect, useRef, useCallback } from 'react';
import { X, AlertTriangle, HelpCircle } from 'lucide-react';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean; // Backward compatibility
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
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
  size = 'md'
}: ModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

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
        // Shift + Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab: if on last element, go to first
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
      // Restore focus when modal closes
      previousActiveElement.current?.focus();
      return;
    }

    // Store the currently focused element to restore later
    previousActiveElement.current = document.activeElement as HTMLElement;

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first focusable element after a short delay
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

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div
        className="
          absolute inset-0
          bg-warm-900/50
          backdrop-blur-sm
          transition-opacity duration-200
        "
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-description' : undefined}
        className={`
          relative z-10
          w-full ${sizeClasses[size]}
          bg-white/95 backdrop-blur-xl
          border border-white/40
          rounded-[24px]
          shadow-2xl
          transform transition-all duration-200
          animate-in fade-in zoom-in-95
        `}
      >
        {/* Header */}
        {(title || description) && (
          <div className="px-6 pt-6 pb-4">
            {title && (
              <h2 id="modal-title" className="text-lg font-bold text-warm-900">{title}</h2>
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
          className="
            absolute top-3 right-3
            w-11 h-11 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-all duration-200
          "
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Body */}
        <div className="px-6 pb-6">
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
  variant?: 'default' | 'danger';
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
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="text-center">
        {/* Icon */}
        <div className={`
          w-12 h-12 mx-auto mb-4 rounded-full
          flex items-center justify-center
          ${variant === 'danger' ? 'bg-red-100' : 'bg-primary-100'}
        `}>
          {variant === 'danger' ? (
            <AlertTriangle className="w-6 h-6 text-red-600" />
          ) : (
            <HelpCircle className="w-6 h-6 text-primary-600" />
          )}
        </div>

        <h3 className="text-lg font-bold text-warm-900 mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-warm-500 mb-6">{description}</p>
        )}

        <div className="flex items-center gap-3 justify-center">
          <button
            onClick={onClose}
            className="
              px-5 py-2.5 min-h-[44px]
              text-warm-600 font-medium text-sm
              border border-warm-200 rounded-[10px]
              hover:bg-warm-50
              transition-all duration-200
            "
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`
              px-5 py-2.5 min-h-[44px]
              font-medium text-sm
              rounded-[10px]
              transition-all duration-200
              ${variant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary-600 text-white hover:bg-primary-700'
              }
            `}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Modal footer for action buttons (backward compatibility)
export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-3 pt-4 mt-4 border-t border-warm-100 ${className || ''}`}>
      {children}
    </div>
  );
}
