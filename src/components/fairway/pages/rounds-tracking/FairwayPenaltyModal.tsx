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
import type { PenaltyOrigin, ShotAction } from '@/hooks/golf/use-shot-state-machine';
import type { ShotRecord } from '@/lib/types/golf';
import type { LieType } from '@/lib/utils/shot-helpers';

interface FairwayPenaltyModalProps {
  open: boolean;
  penaltyType: string | null;
  /** Which stroke an OB / lost penalty is for — see PenaltyOrigin. */
  penaltyOrigin: PenaltyOrigin;
  /** The last shot on the card, if any: the 'entered' choice replays from where it was hit. */
  lastEnteredShot: ShotRecord | null;
  /** Where the player is now: the 'here' choice records the errant stroke from this spot and replays from it. */
  currentLie: LieType;
  currentDistance: number;
  currentUnit: 'yards' | 'feet';
  dispatch: React.Dispatch<ShotAction>;
  onConfirm: () => void;
}

const STROKE_AND_DISTANCE = new Set(['ob', 'lost']);

function describeSpot(lie: string, distance: number, unit: string): string {
  const lieLabel = lie.charAt(0).toUpperCase() + lie.slice(1);
  return `${lieLabel} · ${Math.round(distance)} ${unit === 'feet' ? 'ft' : 'yds'}`;
}

const PENALTY_OPTIONS = [
  { v: 'ob', l: 'Out of Bounds' },
  { v: 'water', l: 'Water Hazard' },
  { v: 'unplayable', l: 'Unplayable Lie' },
  { v: 'lost', l: 'Lost Ball' },
];

/** What happens next, per rule — OB/lost replay from the original spot (usePenaltyHandler). */
const PENALTY_HINT: Record<string, string> = {
  ob: 'Stroke and distance: +1 and you play again from where that shot was hit. Enter the replay as your next shot.',
  lost: 'Stroke and distance: +1 and you play again from where that shot was hit. Enter the replay as your next shot.',
  water: '+1 stroke. Play on from where you said the ball finished.',
  unplayable: '+1 stroke. Play on from where you said the ball finished.',
};

export function FairwayPenaltyModal({
  open,
  penaltyType,
  penaltyOrigin,
  lastEnteredShot,
  currentLie,
  currentDistance,
  currentUnit,
  dispatch,
  onConfirm,
}: FairwayPenaltyModalProps) {
  // Stroke and distance has to know WHICH stroke went: the last one entered
  // (replay from where it was hit) or one the player hit from here and never
  // typed in (recorded now, replay from here). Players use both flows; the
  // reducer picks a default from the card and this lets them flip it.
  const askOrigin = !!penaltyType && STROKE_AND_DISTANCE.has(penaltyType);
  const enteredChoice = lastEnteredShot && !lastEnteredShot.isPenalty ? lastEnteredShot : null;
  const originOptions: Array<{ v: PenaltyOrigin; title: string; detail: string }> = [
    {
      v: 'here',
      title: 'My next shot from here',
      detail: `Not entered yet · from ${describeSpot(currentLie, currentDistance, currentUnit)}`,
    },
    ...(enteredChoice
      ? [{
          v: 'entered' as const,
          title: `Shot ${enteredChoice.shotNumber} that I entered`,
          detail: `Replay from ${describeSpot(enteredChoice.lieBefore, enteredChoice.distanceToHoleBefore, enteredChoice.distanceUnitBefore)}`,
        }]
      : []),
  ];

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
        {askOrigin ? (
          <fieldset className="mb-4">
            <legend className="mb-2 font-fw-sans text-caption font-medium text-text-secondary">Which shot went {penaltyType === 'ob' ? 'out of bounds' : 'missing'}?</legend>
            <div className="space-y-2" role="radiogroup" aria-label="Which shot">
              {originOptions.map((o) => {
                const selected = penaltyOrigin === o.v || (o.v === 'here' && !enteredChoice);
                return (
                  <Button
                    key={o.v}
                    type="button"
                    variant="ghost"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => dispatch({ type: 'SET_PENALTY_ORIGIN', payload: o.v })}
                    className={cn(
                      'block h-auto min-h-[44px] w-full rounded-fw-md border-0 px-4 py-2.5 text-left font-fw-sans transition-colors',
                      'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      selected
                        ? 'bg-accent-500/12 text-text-primary ring-1 ring-accent-500/40'
                        : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:bg-surface',
                    )}
                  >
                    <span className="block text-sm font-medium">{o.title}</span>
                    <span className="block text-caption text-text-secondary">{o.detail}</span>
                  </Button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <p className="mb-4 min-h-[2.5rem] font-fw-sans text-sm text-text-secondary" aria-live="polite">
          {penaltyType ? PENALTY_HINT[penaltyType] : 'Pick the penalty for the shot that earned it.'}
        </p>
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
