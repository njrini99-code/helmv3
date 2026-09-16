'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapRoundView } from './use-one-tap-round';
import type { OneTapView } from './use-one-tap';

/** The one primary action of the screen (§6, §14): MARK BALL while the hole
 * is open, NEXT HOLE once it is closed. Undo lives in the transient status
 * (§13), never here. "Finish hole" is offered only once the last mark sits
 * in the green complex; Reopen hole only on a closed hole. */
export function OneTapButton({ view, round }: { view: OneTapView; round?: OneTapRoundView | null }) {
  const pending = view.snapshot.state === 'CAPTURE_PENDING';
  const complete = round?.status === 'COMPLETE';
  if (complete) {
    return <div className="flex flex-col gap-2" data-slot="one-tap-actions" data-hole-status="COMPLETE">
      <Button variant="primary" size="lg" fullWidth disabled={!round.hasNextHole} onClick={round.nextHole} className="uppercase tracking-[0.08em]" data-slot="one-tap-next-hole">
        {round.hasNextHole ? 'Next hole' : 'Round complete'}
      </Button>
      <Button variant="ghost" size="sm" fullWidth onClick={round.reopenHole} data-slot="one-tap-reopen">Reopen hole</Button>
    </div>;
  }
  return <div className="flex flex-col gap-2" data-slot="one-tap-actions" data-hole-status="OPEN">
    <Button variant="primary" size="lg" fullWidth busy={pending} disabled={view.snapshot.paused} onClick={view.markBall}
      className="uppercase tracking-[0.08em]" data-slot="one-tap-mark" aria-label="Mark ball at current location">
      {pending ? 'Marking' : 'Mark ball'}
    </Button>
    {view.finishSuggested && <Button variant="ghost" size="sm" fullWidth onClick={view.holeOut} data-slot="one-tap-holed">At the cup? Finish hole</Button>}
  </div>;
}
