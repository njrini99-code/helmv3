'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Within this of the end counts as reading the newest messages. */
export const NEAR_END_PX = 120;

/** How long a newly shown thread is held at its end while a push or hydration settles (P007 D1). */
const SETTLE_MS = 700;

/**
 * Where a thread sits as messages arrive (high-fidelity audit §6.6, T25). A conversation opens at its end. A new
 * message, or someone starting to type, follows the end only while the reader is already there or the message is
 * their own; someone reading older messages stays put and is told how many arrived below (`unseen`), with `toEnd`
 * taking them down.
 */
export function useThreadAnchor(
  scroller: RefObject<HTMLElement | null>,
  { convId, count, lastMine, typing }: { convId: string; count: number; lastMine: boolean; typing: boolean },
) {
  const nearEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const seen = useRef({ convId, count });
  const [unseen, setUnseen] = useState(0);

  const toEnd = useCallback(() => {
    const s = scroller.current;
    if (s) s.scrollTop = s.scrollHeight;
    nearEnd.current = true;
    setUnseen(0);
  }, [scroller]);

  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const onScroll = () => {
      // A keyboard/composer resize can emit scroll before ResizeObserver runs.
      // Preserve the reader's previous intent until that new geometry is anchored.
      if (viewportHeight.current !== null && viewportHeight.current > 0 && s.clientHeight !== viewportHeight.current) return;
      nearEnd.current = s.scrollHeight - s.scrollTop - s.clientHeight <= NEAR_END_PX;
      if (nearEnd.current) setUnseen(0);
    };
    s.addEventListener('scroll', onScroll, { passive: true });
    return () => s.removeEventListener('scroll', onScroll);
  }, [scroller, convId]);

  // Quote previews, multiline input and the keyboard resize the viewport without
  // changing message count. Follow those changes only for a reader already at the end.
  useLayoutEffect(() => {
    const s = scroller.current;
    if (!s || typeof ResizeObserver === 'undefined') return;
    viewportHeight.current = s.clientHeight;
    const observer = new ResizeObserver(() => {
      viewportHeight.current = s.clientHeight;
      if (nearEnd.current) toEnd();
    });
    observer.observe(s);
    // Loaded attachments can grow the content while the viewport stays unchanged.
    if (s.firstElementChild) observer.observe(s.firstElementChild);
    return () => observer.disconnect();
  }, [scroller, convId, toEnd]);

  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = { convId, count };
    if (was.convId !== convId) {
      toEnd();
      return;
    }
    const arrived = count - was.count;
    if (arrived <= 0) {
      // Typing dots follow the end only for someone already there.
      if (typing && nearEnd.current) toEnd();
      return;
    }
    if (nearEnd.current || lastMine) toEnd();
    else setUnseen((n) => n + arrived);
  }, [convId, count, lastMine, typing, toEnd]);

  // First paint of a thread: its end, held there while the thread settles (P007 D1). A thread pushed during hydration
  // slides in and has its layout and scroll reset under it, which left it at its oldest message; until the reader
  // touches it, each frame of the settle puts it back at the end. Scroll events in that window are the reset's,
  // not the reader's, so they don't decide `nearEnd`.
  useLayoutEffect(() => {
    toEnd();
    const s = scroller.current;
    if (!s || typeof requestAnimationFrame === 'undefined') return;
    const until = performance.now() + SETTLE_MS;
    let frame = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    const hold = () => {
      if (stopped || !s.isConnected) return;
      if (s.scrollHeight - s.scrollTop - s.clientHeight > 1) toEnd();
      if (performance.now() < until) frame = requestAnimationFrame(hold);
    };
    frame = requestAnimationFrame(hold);
    const input = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const t of input) s.addEventListener(t, stop, { passive: true });
    return () => {
      stop();
      for (const t of input) s.removeEventListener(t, stop);
    };
    // Once per mount; conversation changes are handled above.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { unseen, toEnd };
}
