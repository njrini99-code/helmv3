'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayPenaltyModal
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy penalty modal (legacy lines
 * ~1485-1523). The penalty-type option list + the confirm gating
 * (disabled until penaltyType selected) is copied VERBATIM. The actual penalty
 * ShotRecord build lives in usePenaltyHandler — this only dispatches the SAME
 * SET_PENALTY_TYPE / CLOSE_PENALTY_MODAL actions and calls confirmPenalty.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';

interface FairwayPenaltyModalProps {
  open: boolean;
  penaltyType: string | null;
  dispatch: React.Dispatch<ShotAction>;
  onConfirm: () => void;
}

const PENALTY_OPTIONS = [
  { v: 'ob', l: 'Out of Bounds' },
  { v: 'water', l: 'Water Hazard' },
  { v: 'unplayable', l: 'Unplayable Lie' },
  { v: 'lost', l: 'Lost Ball' },
];

export function FairwayPenaltyModal({ open, penaltyType, dispatch, onConfirm }: FairwayPenaltyModalProps) {
  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) dispatch({ type: 'CLOSE_PENALTY_MODAL' });
      }}
      size="sm"
      title="Add Penalty Stroke"
      hideTitle
      hideClose
    >
      <div className="px-6 pb-6 pt-6">
        <h2 className="mb-6 font-fw-display text-body-lg font-medium tracking-[-0.012em] text-text-primary">Add Penalty Stroke</h2>
        <div className="mb-6 space-y-2">
          {PENALTY_OPTIONS.map((p) => (
            <Button
              key={p.v}
              type="button"
              variant="ghost"
              onClick={() => dispatch({ type: 'SET_PENALTY_TYPE', payload: p.v })}
              className={cn(
                'block h-auto min-h-[44px] w-full rounded-fw-md border-0 px-4 py-3 text-left font-fw-sans text-sm font-medium transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                penaltyType === p.v
                  ? 'bg-fw-danger text-text-on-accent shadow-flat hover:bg-fw-danger'
                  : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:bg-fw-danger-bg hover:ring-fw-danger/25',
              )}
            >
              {p.l}
            </Button>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => dispatch({ type: 'CLOSE_PENALTY_MODAL' })}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm} disabled={!penaltyType}>
            Add +1 Stroke
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
