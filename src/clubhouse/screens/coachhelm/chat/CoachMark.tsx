'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** One cycle of the wheel's turn (`ch-th-turn`): it turns one spoke, then holds. Matches `--ch-dur-shimmer`. */
const TURN_MS = 1900;
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * CoachHelm's avatar (owner, 2026-10-29: "the icon looks like garbage"): a ship's wheel drawn on a 24-unit grid in the
 * Clubhouse icon weight, mint on a deep green disc, so it is one crisp shape at every size instead of the logo's wheel and
 * ball shrunk to 28px. While CoachHelm works the wheel turns one spoke at a time, on the compositor (transform only).
 *
 * Two things keep the turn smooth: every wheel on the page shares one phase (a negative delay taken from the document
 * clock), so the placeholder's wheel handing over to the answer's never jumps; and when the work ends the wheel finishes
 * its current turn before it stops, at a spoke, where the 8-fold wheel looks exactly as it did at rest.
 */
export function CoachMark({ working = false }: { working?: boolean }) {
  const [turning, setTurning] = useState(working);
  const [delay, setDelay] = useState<string | undefined>(undefined);
  const workingRef = useRef(working);
  workingRef.current = working;

  useLayoutEffect(() => {
    if (working) {
      setTurning(true);
      setDelay(`-${Math.round(performance.now() % TURN_MS)}ms`);
    }
  }, [working]);

  return (
    <span className={'ch-th-mark' + (turning ? ' is-working' : '')} aria-hidden="true">
      <svg
        className="ch-th-mk"
        viewBox="0 0 24 24"
        width={22}
        height={22}
        focusable="false"
        style={turning && delay ? { animationDelay: delay } : undefined}
        onAnimationIteration={() => {
          if (!workingRef.current) setTurning(false);
        }}
      >
        <g className="ch-th-mk-helm" fill="none" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="6" />
          {SPOKES.map((a) => (
            <line key={a} x1="12" y1="9.5" x2="12" y2="2.25" transform={`rotate(${a} 12 12)`} />
          ))}
          {/* An open hub, so the spokes meet a ring instead of crossing in a knot at small sizes. */}
          <circle className="ch-th-mk-hub" cx="12" cy="12" r="2.5" />
        </g>
      </svg>
    </span>
  );
}
