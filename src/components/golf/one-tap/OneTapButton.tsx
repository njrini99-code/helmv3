'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapRoundView } from './use-one-tap-round';
import type { OneTapView } from './use-one-tap';

/** The one primary action of the screen: MARK BALL while the hole is open,
 * NEXT HOLE once it is closed. Undo (inside its 5 s window), Holed out and
 * Reopen hole are quiet secondaries that appear only when they apply, so the
 * thumb never has to choose. */
export function OneTapButton({ view, round }: { view: OneTapView; round?: OneTapRoundView | null }) {
  const pending = view.snapshot.state === 'CAPTURE_PENDING';
  const undoable = view.snapshot.undoableId != null;
  const complete = round?.status === 'COMPLETE';
  if (complete) {
    return <div className="flex flex-col gap-2" data-slot="one-tap-actions" data-hole-status="COMPLETE">
      <Button variant="primary" size="lg" fullWidth disabled={!round.hasNextHole} onClick={round.nextHole} className="uppercase tracking-[0.08em]" data-slot="one-tap-next-hole">
        {round.hasNextHole ? 'Next hole' : 'Round complete'}
      </Button>
      <div className="flex gap-2">
        {undoable && <Button variant="secondary" size="sm" fullWidth onClick={view.undo} data-slot="one-tap-undo">Undo mark</Button>}
        <Button variant="ghost" size="sm" fullWidth onClick={round.reopenHole} data-slot="one-tap-reopen">Reopen hole</Button>
      </div>
    </div>;
  }
  return <div className="flex flex-col gap-2" data-slot="one-tap-actions" data-hole-status="OPEN">
    <Button variant="primary" size="lg" fullWidth busy={pending} disabled={view.snapshot.paused} onClick={view.markBall}
      className="uppercase tracking-[0.08em]" data-slot="one-tap-mark" aria-label="Mark ball">
      {pending ? 'Marking' : 'Mark ball'}
    </Button>
    {(undoable || view.canHoleOut) && <div className="flex gap-2">
      {undoable && <Button variant="secondary" size="sm" fullWidth onClick={view.undo} data-slot="one-tap-undo">Undo mark</Button>}
      {view.canHoleOut && <Button variant="ghost" size="sm" fullWidth onClick={view.holeOut} data-slot="one-tap-holed">Holed out</Button>}
    </div>}
  </div>;
}
