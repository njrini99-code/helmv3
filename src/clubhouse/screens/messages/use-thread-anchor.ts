'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Within this of the end counts as reading the newest messages. */
export const NEAR_END_PX = 120;

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

  // First paint of a thread: its end.
  useLayoutEffect(() => {
    toEnd();
    // Once per mount; conversation changes are handled above.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { unseen, toEnd };
}
