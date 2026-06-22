'use client';

import { useEffect } from 'react';
import { Button } from '@/components/fairway';
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

  // Fairway-token recipes (DESIGN-SYSTEM §4): the destructive-account modal is
  // the highest-stakes control on the settings screen and must match the
  // redesign. fw-danger / accent are bridged onto :root so these resolve in
  // every consumer (live Fairway + retiring legacy fork) with no warm/primary.
  const variantStyles = {
    danger: {
      icon: 'bg-fw-danger-bg text-fw-danger',
      button: 'bg-fw-danger hover:bg-fw-danger/90 text-text-on-accent',
    },
    warning: {
      // Canonical Fairway amber tokens (fw-warning) — tinted tile + solid fill,
      // mirroring the danger recipe. No raw warning hex.
      icon: 'bg-fw-warning-bg text-fw-warning',
      button: 'bg-fw-warning hover:bg-fw-warning/90 text-text-on-accent',
    },
    default: {
      icon: 'bg-surface-sunken text-text-secondary',
      button: 'bg-accent-700 hover:bg-accent-800 text-text-on-accent',
    },
  };

  const styles = variantStyles[variant];

  // iOS-style action sheet (danger on native): bottom-anchored, red destructive
  // button on top, Cancel as a separate rounded card below. Matches UIAlertController
  // with UIAlertControllerStyleActionSheet.
  if (variant === 'danger' && isNativeApp()) {
    return (
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop click from closing dialog */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-md px-3 pb-[max(12px,env(safe-area-inset-bottom))] space-y-2 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Sheet body: title + message + destructive action */}
          <div className="overflow-hidden rounded-2xl bg-surface/95 backdrop-blur-xl shadow-fw-modal">
            <div className="px-5 pt-4 pb-3 text-center border-b border-border-subtle">
              <h2 className="font-fw-sans text-body-sm font-semibold text-text-primary">{title}</h2>
              <p className="mt-1 font-fw-sans text-caption leading-snug text-text-secondary">{message}</p>
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className="w-full px-5 py-3.5 font-fw-sans text-body-lg font-semibold text-fw-danger transition-colors active:bg-surface-sunken disabled:opacity-50"
            >
              {isLoading ? 'Please wait…' : confirmLabel}
            </button>
          </div>
          {/* Cancel as separate card */}
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full rounded-2xl bg-surface/95 px-5 py-3.5 font-fw-sans text-body-lg font-semibold text-text-primary shadow-fw-modal backdrop-blur-xl transition-colors active:bg-surface-sunken disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop click from closing dialog */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md overflow-hidden rounded-fw-lg bg-surface shadow-fw-modal animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${styles.icon}`}>
              <IconWarning size={20} aria-hidden />
            </div>
            <h2 className="font-fw-display text-h2 font-semibold text-text-primary">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-fw-sm p-2 text-text-tertiary outline-none transition-colors hover:bg-surface-sunken hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
            aria-label="Close dialog"
          >
            <IconX size={20} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="font-fw-sans text-body-sm leading-relaxed text-text-secondary">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-6 py-4">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`rounded-full px-4 py-2 font-fw-sans font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:opacity-50 ${styles.button}`}
          >
            {isLoading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
