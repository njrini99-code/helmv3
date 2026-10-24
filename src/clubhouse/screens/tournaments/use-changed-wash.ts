'use client';

import { useEffect, useState } from 'react';
import { CH_DUR } from '../../lib/motion';

/**
 * The changed-wash (plan 4.33, 8.5 and D-100): a value that changes after first paint takes its new value in place and
 * its cell is washed for the reveal duration (520 ms), then the wash fades on `--ch-dur-reveal`. Nothing rolls.
 *
 * Returns true while the cell should carry `.ch-tour-changed` (styles/tournaments.css): from the render where `value`
 * changed until 520 ms later, and never on first paint. The hold is a timer, not an animation, so under reduced motion
 * and Animations off (where the duration tokens go to 0) the wash still shows for its 520 ms and only the fade is
 * skipped: it is information, not motion, and there it is the only change signal. Pass a primitive (a number, string or
 * null); a new object each render would read as a change every time.
 */
export function useChangedWash(value: string | number | boolean | null | undefined): boolean {
  const [seen, setSeen] = useState(value);
  const [washing, setWashing] = useState(false);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setWashing(true);
  }
  useEffect(() => {
    if (!washing) return;
    const t = window.setTimeout(() => setWashing(false), CH_DUR.reveal * 1000);
    return () => window.clearTimeout(t);
  }, [washing, seen]);
  return washing;
}
