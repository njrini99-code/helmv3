'use client';

/**
 * ============================================================================
 * Fairway · Overlays — ConfirmModal (facelift consolidation, 2026-09-10)
 * ----------------------------------------------------------------------------
 * The ONE shared "are you sure?" confirm. Three call sites (FairwaySettings
 * General's `ConfirmActionModal`, FairwaySettingsNotifications' `ConfirmReset
 * Modal`, the classes page's `ConfirmDeleteAllModal`) had each hand-rolled the
 * SAME file-local ModalShell recipe — small ModalShell, hideTitle + hideClose,
 * tinted icon tile + two-button footer — because none of those files was
 * allowed to add a new shared component under overlays/ itself. This is that
 * shared component; migrate a file-local recipe onto this and delete it.
 *
 * Mirrors `DiscardChangesModal`'s structure (same file, same escalation tier);
 * unlike that component, this one is parametrized by severity (`tone`) and
 * copy, since "confirm this destructive/cautionary action" is the common case
 * DiscardChangesModal's narrower "discard unsaved input" phrasing doesn't fit.
 *
 * Danger and warning both render the CONFIRM button as `danger` — Fairway has
 * no dedicated amber CTA variant — with the icon tile still tinted per-tone so
 * the two severities stay visually distinct. `default` is a plain, non-
 * destructive confirm (legacy `ui/confirm-dialog` parity); no current consumer
 * needs it, but it costs nothing to keep for the one that eventually does.
 *
 * Haptics (restores what the legacy `ui/confirm-dialog` did, and what the
 * three file-local recipes it inspired had quietly dropped): a `warning`-class
 * tap fires on open for `danger`, a `light` tap for `warning`/`default`; the
 * Confirm button fires `heavy` for `danger`, `medium` otherwise — via the
 * `haptic` prop `controls/button.tsx` grew for exactly this. Both paths run
 * through `fwHaptic`, which already gates on the user's haptics preference —
 * the same gate every other Fairway primitive uses, nothing bespoke here.
 * ========================================================================== */

import { useEffect, type ReactNode } from 'react';
import { IconWarning } from '@/components/icons';
import { cn } from '@/lib/utils';
import { ModalShell } from './ModalShell';
import { Button } from '@/components/fairway/controls/button';
import { fwHaptic } from '@/lib/fairway/haptics';

export type ConfirmModalTone = 'danger' | 'warning' | 'default';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Plain sentence, or richer JSX (e.g. an inline emphasis) — never re-adds its own icon/tile. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Severity — drives the icon tile tint, the confirm button color, and the open/confirm haptic intensity. Default `'danger'` (the most common call). */
  tone?: ConfirmModalTone;
  isLoading?: boolean;
  onConfirm: () => void;
  /** Fires on Cancel AND on Escape/backdrop-click (the safe default — never treated as Confirm). */
  onCancel: () => void;
}

const TONE_STYLES: Record<
  ConfirmModalTone,
  {
    tileBg: string;
    tileInk: string;
    confirmVariant: 'danger' | 'primary';
    openHaptic: 'warning' | 'light';
    confirmHaptic: 'heavy' | 'medium';
  }
> = {
  danger: {
    tileBg: 'bg-fw-danger-bg',
    tileInk: 'text-fw-danger-ink',
    confirmVariant: 'danger',
    openHaptic: 'warning',
    confirmHaptic: 'heavy',
  },
  // No dedicated amber CTA variant (see doc comment) — the confirm button
  // still renders `danger` so the two severities don't collapse visually.
  warning: {
    tileBg: 'bg-fw-warning-bg',
    tileInk: 'text-fw-warning-ink',
    confirmVariant: 'danger',
    openHaptic: 'light',
    confirmHaptic: 'medium',
  },
  default: {
    tileBg: 'bg-surface-sunken',
    tileInk: 'text-text-secondary',
    confirmVariant: 'primary',
    openHaptic: 'light',
    confirmHaptic: 'medium',
  },
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const styles = TONE_STYLES[tone];

  // Fires once per open, matching the legacy ui/confirm-dialog's own
  // open-effect (never re-fires on isLoading/tone churn while already open).
  useEffect(() => {
    if (open) fwHaptic(styles.openHaptic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      size="sm"
      title={title}
      hideTitle
      hideClose
    >
      <div className="px-6 pb-6 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-fw-md', styles.tileBg)}>
            <IconWarning size={20} className={styles.tileInk} aria-hidden />
          </div>
          <h2 className="font-fw-display text-body font-medium tracking-[-0.005em] text-text-primary">
            {title}
          </h2>
        </div>
        <div className="mb-5 font-fw-sans text-body-sm leading-relaxed text-text-secondary">{message}</div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={styles.confirmVariant}
            className="flex-1"
            haptic={styles.confirmHaptic}
            busy={isLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
