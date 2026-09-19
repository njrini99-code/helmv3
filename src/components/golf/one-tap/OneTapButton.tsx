'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapRoundView } from './use-one-tap-round';
import type { OneTapStage, OneTapView } from './use-one-tap';

/** The one primary action of the screen (§6, §14), named for the stage of
 * play (on-course ask, 2026-09-17): START HOLE on the tee, MARK BALL after
 * that, and on the green PUTT MADE beside it; NEXT HOLE once the hole is
 * closed. Every one of them is "the ball is here now": Start hole is the
 * first mark, Putt made is the last one, at the cup. Undo lives in the
 * transient status (§13), never here; Reopen hole only on a closed hole. */
const MARK_LABEL: Record<OneTapStage, string> = { tee: 'Start hole', play: 'Mark ball', green: 'Mark ball', holed: 'Mark ball' };
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
  return <div className="flex flex-col gap-2" data-slot="one-tap-actions" data-hole-status="OPEN" data-stage={view.stage}>
    <Button variant="primary" size="lg" fullWidth busy={pending} disabled={view.snapshot.paused} onClick={view.markBall}
      className="uppercase tracking-[0.08em]" data-slot="one-tap-mark" aria-label={view.stage === 'tee' ? 'Start hole: mark the ball at current location' : 'Mark ball at current location'}>
      {pending ? 'Marking' : MARK_LABEL[view.stage]}
    </Button>
    {view.stage === 'green' && <Button variant="secondary" size="lg" fullWidth disabled={pending || view.snapshot.paused} onClick={view.puttMade}
      className="uppercase tracking-[0.08em]" data-slot="one-tap-putt-made" aria-label="Putt made: mark the cup here and finish the hole">
      Putt made
    </Button>}
  </div>;
}
