'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

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
 * For the part of a long page below its first screen: false while a page reached by navigating renders its first frame,
 * then true once that frame is on screen, so the switch's commit renders only what is seen. A render that hydrates is
 * true from the start: the server rendered all of it, and a page that streams in after the shell has hydrated must
 * still match (an app-running flag here was a hydration error, #418, on a hard load of Stats). Coach Stats on the phone:
 * the worst frame of a switch fell from 74–76ms to 38–40ms with the chart's sizing (WebKit, 2026-10-16).
 */
const noSubscribe = () => () => {};
const clientRender = () => false;
const serverRender = () => true;
export function useArrivalPainted(): boolean {
  const hydrating = useSyncExternalStore(noSubscribe, clientRender, serverRender);
  const [painted, setPainted] = useState(hydrating);
  useEffect(() => {
    if (painted) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPainted(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [painted]);
  return painted;
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
