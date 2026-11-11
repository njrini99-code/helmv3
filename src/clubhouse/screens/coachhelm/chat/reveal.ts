'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * How an answer's words are released to the page while it streams (MOTION, "The benchmark": text arriving).
 *
 * `burst`: every flush of the stream paints as it arrives (the hook flushes every 50 ms), each burst fading in.
 * `smooth`: the stream fills a backlog and a frame clock releases it, whole words at a time, at a rate that follows the
 * backlog, so an uneven stream reads as an even one and the newest words are always the soft ones. Nothing is held once the
 * stream ends: the moment the turn is not live, everything that arrived is on the page.
 *
 * One switch, set once by the surface that mounts the thread. The default is the one the measurements chose (MOTION).
 */
export type RevealMode = 'burst' | 'smooth';
let MODE: RevealMode = 'burst';
export const setRevealMode = (mode: RevealMode): void => {
  MODE = mode;
};
export const revealMode = (): RevealMode => MODE;

/**
 * The waiting state's passing light (MOTION MO-4-I10): a soft glint that crosses the island's line while work is live. One
 * switch, off until the owner has seen both; Reduce Motion never draws it.
 */
let LIGHT = false;
export const setWaitLight = (on: boolean): void => {
  LIGHT = on;
};
export const waitLight = (): boolean => LIGHT;

/** The backlog is cleared in about this long: long enough to even out the stream's flushes, short enough that the page is never far behind it. */
export const REVEAL_CLEAR_MS = 200;
/** Never slower than this many characters a second, so the last few words of a pause are not rationed. */
export const REVEAL_FLOOR_CPS = 40;

/** Where the release point is after `dt` ms: it closes on the end at a rate that follows the backlog. Pure. */
export function advance(pos: number, length: number, dt: number): number {
  const backlog = length - pos;
  if (backlog <= 0) return length;
  const perMs = Math.max(REVEAL_FLOOR_CPS / 1000, backlog / REVEAL_CLEAR_MS);
  return Math.min(length, pos + perMs * Math.max(0, dt));
}

/** Whole words only: the last word boundary at or before the release point (the end itself is always a boundary). Pure. */
export function wordEdge(text: string, pos: number): number {
  if (pos >= text.length) return text.length;
  let i = Math.floor(pos);
  while (i > 0 && !/\s/.test(text[i - 1]!)) i -= 1;
  return i;
}

/** The part of `text` to draw now. With `on` false (burst mode, or a turn that is not live) it is all of it. */
export function useReveal(text: string, on: boolean, /** The block being written: a new one starts from its first word. */ id: string | null = null): string {
  const [shown, setShown] = useState(on ? 0 : text.length);
  const pos = useRef(on ? 0 : text.length);
  const target = useRef(text);
  target.current = text;
  const block = useRef(id);
  if (block.current !== id) {
    block.current = id;
    pos.current = 0;
  }
  useEffect(() => {
    if (!on) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const t = target.current;
      // Words taken back (a discard) are gone at once.
      if (pos.current > t.length) pos.current = t.length;
      pos.current = advance(pos.current, t.length, now - last);
      last = now;
      const edge = wordEdge(t, pos.current);
      setShown((s) => (s === edge ? s : edge));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return on ? text.slice(0, Math.min(shown, text.length)) : text;
}
