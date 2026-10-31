'use client';

import { useEffect, useState } from 'react';
import { holeKind, nextHole, orderedHoles, type LiveLane } from './model';
import type { LaneChange } from './use-live-rounds';

/**
 * The bead row (ScoreMark micro, 4.1): one small mark per hole, in the order the round is played, so a shotgun start on
 * 10 shows 10 to 18 then 1 to 9. Shape carries the result without colour: a filled circle under par, a dot for par, a
 * hollow square for bogey, a filled square for double or worse, a hollow circle for a hole not yet played, and a green
 * ring around the hole the player is on. Hidden from VoiceOver; the lane's label says everything the beads show.
 *
 * Compact (Home) shows the last six played holes. Full shows every planned hole, a gap after the ninth. A hole that
 * gained a score since the last commit scales in over the release beat (opacity and transform only); under reduced
 * motion it takes a ring in its own colour for three seconds instead.
 */

export const RING_MS = 3000;

export function HoleBeads({
  lane,
  density,
  change,
  reduced,
}: {
  lane: Pick<LiveLane, 'holesPlanned' | 'startPosition' | 'holes' | 'currentHole'>;
  density: 'compact' | 'full';
  change?: LaneChange;
  reduced: boolean;
}) {
  const ordered = orderedHoles(lane);
  const next = nextHole(lane)?.hole ?? null;
  const fresh = new Set(change?.holes ?? []);
  const shown = density === 'compact' ? ordered.filter((h) => h.score != null).slice(-6) : ordered;
  const ring = useRing(reduced ? change?.n : undefined);
  return (
    <span className="ch-lv-beads" data-density={density} aria-hidden="true">
      {shown.map((h, i) => {
        const kind = holeKind(h.score, h.par);
        const isFresh = fresh.has(h.n);
        // The gap after the ninth mark played (4.1): nine, then six pixels, then nine.
        const gap = density === 'full' && lane.holesPlanned === 18 && i === 9;
        return (
          <span
            // A new change to the same hole remounts the mark, so its scale-in runs again.
            key={`${h.n}-${isFresh ? change?.n : 0}`}
            className={'ch-lv-bead' + (gap ? ' has-gap' : '')}
            data-kind={kind}
            data-hole={h.n}
            data-current={density === 'full' && h.n === next && h.score == null ? '' : undefined}
            data-fresh={isFresh && !reduced ? '' : undefined}
            data-ring={isFresh && reduced && ring ? '' : undefined}
          />
        );
      })}
    </span>
  );
}

/** True for three seconds after `n` changes (reduced motion's static ring), then false without any animation. */
export function useRing(n: number | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (n === undefined) {
      setOn(false);
      return;
    }
    setOn(true);
    const t = window.setTimeout(() => setOn(false), RING_MS);
    return () => window.clearTimeout(t);
  }, [n]);
  return on;
}
