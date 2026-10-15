'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { chSpringCurve, type ChSpringKind } from './motion';

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
  { reduced = false, still, kind = 'settle' }: { reduced?: boolean; still?: () => boolean; kind?: ChSpringKind } = {},
): void {
  const last = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = container.current?.querySelector<HTMLElement>(plate);
    const host = el?.parentElement;
    if (!el || !host) {
      last.current = null;
      return;
    }
    const to = { x: host.offsetLeft, y: host.offsetTop, w: host.offsetWidth, h: host.offsetHeight };
    const from = last.current;
    last.current = to;
    if (!from || reduced || still?.() || !to.w || !to.h) return;
    if (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h) return;
    const { ms, linear } = chSpringCurve(kind);
    el.animate?.(
      [
        { transformOrigin: 'left top', transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})` },
        { transformOrigin: 'left top', transform: 'none' },
      ],
      { duration: ms, easing: linear },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the move is per choice; `still` is read when it happens
  }, [key, reduced]);
}
