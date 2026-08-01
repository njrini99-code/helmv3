'use client';

/**
 * ============================================================================
 * Fairway · Overlays — DiscardChangesModal (audit W4)
 * ----------------------------------------------------------------------------
 * The reusable "Discard this <thing>?" guard a create/edit ModalShell shows
 * when the user tries to close it (Escape / backdrop-click / the X button /
 * an explicit Cancel) while the form holds typed-but-unsaved input, instead of
 * silently throwing that input away. Mirrors the rounds-tracking
 * FairwayUnsavedNavModal recipe (small ModalShell, hideTitle + hideClose,
 * warning icon + Stay/Discard) generalized so every create/edit dialog can
 * reuse the same look and the same safe default.
 *
 * Nests on top of an already-open parent ModalShell: both are Radix Dialog
 * portals to `document.body`, so the later-opened one (this) mounts its
 * portal container after the parent's and paints on top at the shared
 * z-fw-modal layer — the same nested-Dialog stacking Radix supports natively.
 * Escape/backdrop-click on THIS modal is treated as "Stay" (the safe
 * default), never as "Discard" — see `onOpenChange` below.
 * ========================================================================== */

import { AlertTriangle } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { Button } from '@/components/fairway/controls/button';

export interface DiscardChangesModalProps {
  open: boolean;
  /** Keep editing — fires on the Stay button AND on Escape/backdrop-click of THIS modal. */
  onStay: () => void;
  /** Confirm discarding the unsaved input. */
  onDiscard: () => void;
  /** Lowercase noun for what's being discarded, e.g. "task", "announcement", "event". */
  itemLabel: string;
}

export function DiscardChangesModal({ open, onStay, onDiscard, itemLabel }: DiscardChangesModalProps) {
  const title = `Discard this ${itemLabel}?`;
  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      size="sm"
      title={title}
      hideTitle
      hideClose
    >
      <div className="px-6 pb-6 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-fw-md bg-fw-warning-bg">
            <AlertTriangle className="h-5 w-5 text-fw-warning-ink" aria-hidden />
          </div>
          <div>
            <h2 className="font-fw-display text-body font-medium tracking-[-0.005em] text-text-primary">
              {title}
            </h2>
            <p className="mt-0.5 font-fw-sans text-sm text-text-tertiary">Your changes won&apos;t be saved.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onStay}>
            Keep editing
          </Button>
          <Button variant="danger" className="flex-1" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
