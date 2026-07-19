'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayUnsavedNavModal
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy "Unsaved Shot Data" warning modal
 * (legacy lines ~1445-1483). Pure presentation: the parent owns
 * pendingNavHoleIndex + confirmDiscardAndNavigate; this only renders the warning
 * and calls the two handlers (Stay / Discard & Go).
 * ========================================================================== */

import { AlertTriangle } from 'lucide-react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';

interface FairwayUnsavedNavModalProps {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
}

export function FairwayUnsavedNavModal({ open, onStay, onDiscard }: FairwayUnsavedNavModalProps) {
  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      size="sm"
      title="Unsaved shot data"
      hideTitle
      hideClose
    >
      <div className="px-6 pb-6 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-fw-md bg-fw-warning-bg">
            <AlertTriangle className="h-5 w-5 text-fw-warning" aria-hidden />
          </div>
          <div>
            <h2 className="font-fw-display text-body font-medium tracking-[-0.005em] text-text-primary">Unsaved Shot Data</h2>
            <p className="mt-0.5 font-fw-sans text-sm text-text-tertiary">You have unrecorded shot data that will be lost.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onStay}>
            Stay
          </Button>
          <Button variant="danger" className="flex-1" onClick={onDiscard}>
            Discard &amp; Go
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
