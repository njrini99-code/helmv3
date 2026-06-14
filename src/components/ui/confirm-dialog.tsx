'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { IconWarning, IconX } from '@/components/icons';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { triggerHaptic, isNativeApp } from '@/lib/utils/capacitor';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { modalRef } = useFocusTrap(open, onCancel);

  useEffect(() => {
    if (open) {
      void triggerHaptic(variant === 'danger' ? 'warning' : 'light');
    }
  }, [open, variant]);

  if (!open) return null;

  const handleConfirm = () => {
    void triggerHaptic(variant === 'danger' ? 'heavy' : 'medium');
    onConfirm();
  };

  const variantStyles = {
    danger: {
      // Icon tint must read as destructive text on a light tile — the raw
      // `destructive` token (#FF3B30) is ~3.7:1 on white and fails WCAG AA,
      // so darken to #B91C1C (~6.8:1 on white) for the foreground glyph.
      icon: 'bg-destructive/10 text-[#B91C1C]',
      button: 'bg-destructive hover:bg-[#E0352B] text-white',
    },
    warning: {
      // Amber `warning` token (#F59E0B) — replaces the divergent SF Orange (#FF9500).
      icon: 'bg-warning/10 text-warning',
      button: 'bg-warning hover:bg-[#D97706] text-white',
    },
    default: {
      icon: 'bg-warm-100 text-warm-600',
      button: 'bg-primary-600 hover:bg-primary-700 text-white',
    },
  };

  const styles = variantStyles[variant];

  // iOS-style action sheet (danger on native): bottom-anchored, red destructive
  // button on top, Cancel as a separate rounded card below. Matches UIAlertController
  // with UIAlertControllerStyleActionSheet.
  if (variant === 'danger' && isNativeApp()) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-md px-3 pb-[max(12px,env(safe-area-inset-bottom))] space-y-2 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sheet body: title + message + destructive action */}
          <div className="overflow-hidden rounded-2xl bg-cream-50/95 backdrop-blur-xl shadow-xl">
            <div className="px-5 pt-4 pb-3 text-center border-b border-warm-200/70">
              <h2 className="text-[13px] font-semibold text-warm-900">{title}</h2>
              <p className="mt-1 text-[12px] leading-snug text-warm-600">{message}</p>
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              // Destructive label on a light sheet — darkened from the
              // #FF3B30 destructive token (fails AA) to #B91C1C (~6.8:1) for WCAG AA.
              className="w-full px-5 py-3.5 text-[17px] font-semibold text-[#B91C1C] active:bg-warm-100/80 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Please wait…' : confirmLabel}
            </button>
          </div>
          {/* Cancel as separate card */}
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full rounded-2xl bg-cream-50/95 backdrop-blur-xl px-5 py-3.5 text-[17px] font-semibold text-warm-900 shadow-xl active:bg-warm-100/80 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${styles.icon}`}>
              <IconWarning size={20} />
            </div>
            <h2 className="text-lg font-semibold text-warm-900">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
            aria-label="Close dialog"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-sm leading-relaxed text-warm-600">{message}</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-warm-200 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${styles.button}`}
          >
            {isLoading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
