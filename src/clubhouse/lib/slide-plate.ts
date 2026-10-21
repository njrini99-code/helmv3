'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { CH_DUR, CH_EASE, chSpringCurve, type ChSpringKind } from './motion';

/**
 * A selected plate that slides from the option it left to the one chosen (a segmented chip, the strip's plate, a tab
 * bar's underline). The plate is rendered inside the chosen option only; when `key` changes this reads the new
 * option's box once and plays the move from the old box as a compositor transform (WAAPI, transform-origin left top).
 *
 * It replaces Motion's shared layout (`layoutId`), which measured the plate, its ancestors and the document's scroll
 * on every render of the component, mid-frame, so a section switch re-laid the incoming page out several times on the
 * main thread (owner, 2026-10-15: "super slow and choppy"; 68 frames dropped of 96 at 4x CPU).
 */
export function useSlidePlate(
  container: RefObject<HTMLElement | null>,
  plate: string,
  key: string | null,
  { reduced = false, still, kind = 'settle', tween }: { reduced?: boolean; still?: () => boolean; kind?: ChSpringKind; tween?: keyof typeof CH_DUR } = {},
): void {
  const last = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = container.current?.querySelector<HTMLElement>(plate);
    const host = el?.parentElement;
    if (!el || !host) {
      last.current = null;
      return undefined;
    }
    const box = () => ({ x: host.offsetLeft, y: host.offsetTop, w: host.offsetWidth, h: host.offsetHeight });
    const from = last.current;
    // Nothing to slide from yet (it has just mounted, or came back): where it sits is read a frame later, once the page
    // has been laid out anyway. Read here, it forced the arriving page's whole layout inside React's commit, the largest
    // part of a section switch's script (27ms of 165 at 4x CPU, a switch to Stats; Chromium, production build, 2026-10-15).
    // Held still (the strip shut as a section's page arrives): nothing moves, so its new place is read a frame later too.
    if (!from || still?.()) {
      last.current = null;
      const frame = requestAnimationFrame(() => {
        if (host.isConnected) last.current = box();
      });
      return () => cancelAnimationFrame(frame);
    }
    const to = box();
    last.current = to;
    if (reduced || !to.w || !to.h) return undefined;
    if (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h) return undefined;
    // A tween where the plate's design gives one (CH_DUR on CH_EASE), otherwise the spring.
    const { ms, linear } = tween ? { ms: CH_DUR[tween] * 1000, linear: `cubic-bezier(${CH_EASE.join(', ')})` } : chSpringCurve(kind);
    el.animate?.(
      [
        { transformOrigin: 'left top', transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})` },
        { transformOrigin: 'left top', transform: 'none' },
      ],
      { duration: ms, easing: linear },
    );
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the move is per choice; `still` is read when it happens
  }, [key, reduced]);
}
