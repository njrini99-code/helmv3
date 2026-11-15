'use client';

import type { ChReaction, ChReactionKey } from '../model';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { REACTIONS } from './reactions';

/**
 * The six keys of the lift's reaction bar (MSG-403): Like, Love, Laugh, Celebrate, Surprised, Thanks, each named exactly that
 * (`aria-label`), 40 px with a 22 glyph. A key the viewer already used is `on` (`aria-pressed`, accent fill). One component for the
 * phone's lift and the desktop's, so the two bars cannot drift.
 */
export function HoldReactKeys({ reacts, onPick }: { reacts: readonly ChReaction[]; onPick: (key: ChReactionKey, on: boolean) => void }) {
  return (
    <>
      {REACTIONS.map((r) => {
        const on = reacts.some((x) => x.key === r.key && x.mine);
        return (
          <button
            key={r.key}
            type="button"
            className={on ? 'is-on' : undefined}
            aria-label={r.key}
            aria-pressed={on}
            onClick={() => {
              haptic('select');
              onPick(r.key, !on);
            }}
          >
            <Icon icon={r.icon} size={22} />
          </button>
        );
      })}
    </>
  );
}
