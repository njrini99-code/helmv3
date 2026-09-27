'use client';

/**
 * ============================================================================
 * Fairway · ConfirmAlert — the golf confirm, on the ONE modal / ONE sheet
 * ----------------------------------------------------------------------------
 * Replaces `ui/confirm-dialog` on golf surfaces (audit W3: MOT-06, DS-03).
 * That component is a hand-rolled `fixed inset-0` overlay with no exit, no
 * scroll lock and its own focus trap; it still renders Baseball screens, so it
 * stays untouched there (owner decision OD-17) and golf moves here instead.
 *
 * Same props as `ConfirmDialog`, so a call site changes only its import.
 *
 *   • default / warning, and danger on the web → a centred `ModalShell`
 *     (`role="alertdialog"`, size sm, no corner close: Cancel is the way out).
 *   • danger inside the native app → an iOS action sheet on `Sheet`: title and
 *     message, the destructive action, then Cancel. Cancel is first in the
 *     DOM so focus never lands on the destructive action.
 *
 * Both inherit the primitives' contract: focus moves in on open and returns
 * to the opener on close, Escape and the scrim cancel (one level per press, so
 * an alert opened over a Sheet closes alone), the page behind is scroll-locked,
 * and the surface is opaque. While `isLoading`, dismissal is ignored so the
 * dialog cannot vanish under an in-flight action.
 *
 * Haptics (motion spec §6.2): none on open; `warning` when a destructive
 * action commits. The Fairway Button adds its own press tick.
 * ============================================================================
 */

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { isNativeApp } from '@/lib/utils/capacitor';
import { fwHaptic } from '@/lib/fairway/haptics';
import { ModalShell } from './ModalShell';
import { Sheet } from './Sheet';

export interface ConfirmAlertProps {
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

const ICON_CLASS = {
  danger: 'bg-fw-danger-bg text-fw-danger-ink',
  warning: 'bg-fw-warning-bg text-fw-warning-ink',
  default: 'bg-surface-sunken text-text-secondary',
} as const;

export function ConfirmAlert({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmAlertProps) {
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && !isLoading) onCancel();
    },
    [isLoading, onCancel],
  );

  const handleConfirm = () => {
    if (variant === 'danger') fwHaptic('warning');
    onConfirm();
  };

  const busyLabel = isLoading ? 'Please wait…' : confirmLabel;

  if (variant === 'danger' && isNativeApp()) {
    return (
      <Sheet
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        customTitle
        hideClose
        dismissible={!isLoading}
        // This sheet usually stacks on an open Sheet (course detail, class
        // detail). vaul keeps ONE module-level saved body position, so an
        // inner sheet's close would restore the body while the outer one is
        // still open. Opt out of the body hack here.
        noBodyStyles
        data-slot="confirm-alert-sheet"
      >
        <div className="flex flex-col-reverse gap-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* DOM-first so focus lands on the safe action; renders last. */}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <div className="overflow-hidden rounded-fw-md border border-border-subtle bg-surface">
            <div className="border-b border-border-subtle px-5 pt-4 pb-3 text-center">
              <Sheet.Title className="font-fw-sans text-body-sm font-semibold tracking-normal text-text-primary">
                {title}
              </Sheet.Title>
              <Sheet.Description className="mt-1 text-caption leading-snug text-text-secondary">
                {message}
              </Sheet.Description>
            </div>
            {/* The action-sheet row is edge-to-edge text, not a pill. */}
            {/* eslint-disable-next-line helm/no-raw-button */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className="min-h-11 w-full px-5 py-3.5 font-fw-sans text-body-lg font-semibold text-fw-danger-ink outline-none transition-colors active:bg-surface-sunken focus-visible:bg-surface-sunken disabled:opacity-50"
            >
              {busyLabel}
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      hideTitle
      description={message}
      hideClose
      size="sm"
      role="alertdialog"
      data-slot="confirm-alert"
    >
      <div className="flex items-start gap-3 px-6 pt-6 pb-2">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            ICON_CLASS[variant],
          )}
        >
          <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0">
          <p aria-hidden className="font-fw-display text-h3 font-semibold text-text-primary">
            {title}
          </p>
          <p aria-hidden className="mt-1 font-fw-sans text-body-sm leading-relaxed text-text-secondary">
            {message}
          </p>
        </div>
      </div>
      {/* A row at every width, as before: stacking put the primary above
          Cancel on phones (the SHEET-04 tell). */}
      <ModalShell.Footer className="flex-row justify-end">
        <Button
          type="button"
          variant={variant === 'danger' ? 'ghost' : 'secondary'}
          onClick={onCancel}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={handleConfirm}
          busy={isLoading}
          className={
            variant === 'danger'
              ? 'bg-fw-danger text-text-on-accent hover:bg-fw-danger/90'
              : variant === 'warning'
                ? 'bg-fw-warning text-text-on-accent hover:bg-fw-warning/90'
                : undefined
          }
        >
          {busyLabel}
        </Button>
      </ModalShell.Footer>
    </ModalShell>
  );
}
