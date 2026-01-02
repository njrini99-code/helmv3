'use client';

import { useEffect } from 'react';
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
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, onClose]);

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
      <div className={`
        relative z-10
        w-full ${sizeClasses[size]}
        bg-white/95 backdrop-blur-xl
        border border-white/40
        rounded-[24px]
        shadow-2xl
        transform transition-all duration-200
        animate-in fade-in zoom-in-95
      `}>
        {/* Header */}
        {(title || description) && (
          <div className="px-6 pt-6 pb-4">
            {title && (
              <h2 className="text-lg font-bold text-warm-900">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-warm-500 mt-1">{description}</p>
            )}
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          className="
            absolute top-4 right-4
            w-8 h-8 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-all duration-200
          "
        >
          <X className="w-5 h-5" />
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
              px-5 py-2.5
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
              px-5 py-2.5
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
