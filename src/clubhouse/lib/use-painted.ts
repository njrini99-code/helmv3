'use client';

import { useEffect, useState } from 'react';

/**
 * False from the render where `on` turns true until that frame has been painted, then true. A popup's entrance is held
 * on it: an animation started as the popup mounts has its clock running before the first paint, so on a phone the
 * first frame seen was already a quarter of the way up (WebKit, the Account sheet: 69px of 265 on its first frame,
 * 2026-10-15). Started after the paint, it rises from its start. Same idea as dialog-lifetime's holdRise, for Motion.
 */
export function usePaintedAfter(on: boolean): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!on) {
      setPainted(false);
      return;
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPainted(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return on && painted;
}

/**
 * `value`, a painted frame late: a change reaches the caller once the frame that rendered it is on screen. For a popup
 * that stays mounted and moves between states (the bell's drop), so its animation starts from where it is rather than
 * with its first frames already spent on the commit.
 */
export function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setShown(value));
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}
