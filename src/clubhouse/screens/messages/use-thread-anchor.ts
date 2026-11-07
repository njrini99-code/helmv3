'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Within this of the end counts as reading the newest messages. */
export const NEAR_END_PX = 120;

/** How long a newly shown thread is held at its end while a push or hydration settles (P007 D1). */
export const THREAD_SETTLE_MS = 700;

/**
 * Where a thread sits as messages arrive (high-fidelity audit §6.6, T25). A conversation opens at its end. A new
 * message, or someone starting to type, follows the end only while the reader is already there or the message is
 * their own; someone reading older messages stays put and is told how many arrived below (`unseen`), with `toEnd`
 * taking them down. `atEnd` says whether the reader is at the end at all, for a Jump to latest with nothing new.
 */
export function useThreadAnchor(
  scroller: RefObject<HTMLElement | null>,
  {
    convId,
    count,
    lastMine,
    typing,
    paused = false,
  }: {
    convId: string;
    count: number;
    lastMine: boolean;
    typing: boolean;
    /**
     * A search hit is being shown (useFocusMessage): nothing pulls the thread to its end, neither the settle hold nor
     * arrivals nor a resize, until the jump is done and the reader's own position decides again.
     */
    paused?: boolean;
  },
) {
  const nearEnd = useRef(true);
  const held = useRef(paused);
  // First of this hook's layout effects, so the others read this commit's value.
  useLayoutEffect(() => {
    held.current = paused;
  }, [paused]);
  const viewportHeight = useRef<number | null>(null);
  const seen = useRef({ convId, count });
  const [unseen, setUnseen] = useState(0);
  // State only when it flips, so scrolling doesn't render the thread each frame.
  const [atEnd, setAtEnd] = useState(true);

  const toEnd = useCallback(() => {
    const s = scroller.current;
    if (s) {
      // The thread making room (useThreadMakeRoom) moves the list down by transform, and a transform counts as scrollable
      // overflow: pinning to that inflated height would jump the thread by the room being made. The end is where the list's
      // own box ends, without the transform. Off the redesign nothing moves the list, and this is today's line.
      const list = s.querySelector<HTMLElement>('.ch-ms-msgs');
      const moved = list?.getAnimations?.().length ? new DOMMatrixReadOnly(getComputedStyle(list).transform).m42 : 0;
      if (list && moved > 0) {
        const below = parseFloat(getComputedStyle(s).paddingBottom) || 0;
        const bottom = list.getBoundingClientRect().bottom - moved - s.getBoundingClientRect().top + s.scrollTop;
        s.scrollTop = bottom + below - s.clientHeight;
      } else {
        s.scrollTop = s.scrollHeight;
      }
    }
    nearEnd.current = true;
    setUnseen(0);
    setAtEnd(true);
  }, [scroller]);

  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    // Once the thread is scrolled off its top, its top edge fades (messages.css `.ch-ms-scroll.is-scrolled`) instead of
    // cutting messages off under the header. A class on the scroller, so scrolling never renders the thread.
    const edge = () => s.classList.toggle('is-scrolled', s.scrollTop > 0);
    edge();
    const onScroll = () => {
      edge();
      // A keyboard/composer resize can emit scroll before ResizeObserver runs.
      // Preserve the reader's previous intent until that new geometry is anchored.
      if (viewportHeight.current !== null && viewportHeight.current > 0 && s.clientHeight !== viewportHeight.current) return;
      nearEnd.current = s.scrollHeight - s.scrollTop - s.clientHeight <= NEAR_END_PX;
      if (nearEnd.current) setUnseen(0);
      setAtEnd(nearEnd.current);
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
      if (nearEnd.current && !held.current) toEnd();
    });
    observer.observe(s);
    // Loaded attachments can grow the content while the viewport stays unchanged.
    if (s.firstElementChild) observer.observe(s.firstElementChild);
    return () => observer.disconnect();
  }, [scroller, convId, toEnd]);

  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = { convId, count };
    // Held for a search hit: the messages loading under it are not news below, and the end is not where to go.
    if (held.current) return;
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
  // touches it, the settle puts it back at the end. Scroll events in that window are the reset's,
  // not the reader's, so they don't decide `nearEnd`.
  useLayoutEffect(() => {
    if (!held.current) toEnd();
    const s = scroller.current;
    if (!s) return;
    let stopped = false;
    let timer = 0;
    let frame = 0;
    const input = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      s.removeEventListener('scroll', onScroll);
      for (const t of input) s.removeEventListener(t, stop);
    };
    // Checked in the frame after a scroll, not in every frame: a frame loop kept the main thread drawing through the push (2026-11-07), and the reset it watches for fires this event.
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(hold);
    }
    function hold() {
      if (stopped || !s!.isConnected) return;
      // A search hit took the thread (paused): the settle hold stops for good, so it can't pull the reader off it.
      if (held.current) return stop();
      if (s!.scrollHeight - s!.scrollTop - s!.clientHeight > 1) toEnd();
    }
    s.addEventListener('scroll', onScroll, { passive: true });
    for (const t of input) s.addEventListener(t, stop, { passive: true });
    timer = window.setTimeout(stop, THREAD_SETTLE_MS);
    frame = requestAnimationFrame(hold);
    return stop;
    // Once per mount; conversation changes are handled above.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { unseen, atEnd, toEnd };
}
