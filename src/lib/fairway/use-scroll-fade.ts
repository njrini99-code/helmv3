'use client';

/**
 * ============================================================================
 * Fairway · useScrollFade
 * ----------------------------------------------------------------------------
 * The premium scroll-edge fade. Attach to a scroll container; get back a mask
 * style that fades ONLY the edges with hidden content, recomputed on scroll +
 * resize + content change:
 *
 *   not overflowing  → no mask (content reaches the edges crisply)
 *   at the start     → fade the END edge only   (more content that way)
 *   in the middle    → fade BOTH edges
 *   at the end       → fade the START edge only
 *
 * It uses a real alpha `mask-image`, so it is background-independent (the
 * content genuinely bleeds to transparent — no per-surface gradient color to
 * keep in sync) and it never creates a containing block. iOS/Apple-grade: the
 * row reads as "more this way" instead of hard-cutting at a hidden scrollbar.
 *
 * Works on either axis. Returns a callback `ref` (compose it with any forwarded
 * ref via @radix-ui/react-compose-refs) and a `fadeStyle` to spread onto the
 * same element's `style`.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

export type ScrollFadeAxis = 'x' | 'y';

interface ScrollFadeEdges {
  start: boolean;
  end: boolean;
}

/** Fade length at each scrollable edge (px) — long enough to read as a soft
 *  bleed, short enough never to swallow a control or a focused item. */
const FADE_PX = 28;

function maskImageFor(edges: ScrollFadeEdges, axis: ScrollFadeAxis): string | undefined {
  if (!edges.start && !edges.end) return undefined;
  const direction = axis === 'x' ? 'to right' : 'to bottom';
  const startStop = edges.start ? `transparent, #000 ${FADE_PX}px` : '#000 0';
  const endStop = edges.end ? `#000 calc(100% - ${FADE_PX}px), transparent` : '#000 100%';
  return `linear-gradient(${direction}, ${startStop}, ${endStop})`;
}

export interface UseScrollFadeResult<T extends HTMLElement> {
  /** Callback ref for the scroll container (compose with any forwarded ref). */
  ref: (node: T | null) => void;
  /** Which edges currently have hidden content. */
  edges: ScrollFadeEdges;
  /** Spread onto the scroll element's `style` (empty object when not overflowing). */
  fadeStyle: CSSProperties;
  /** Force a re-measure (e.g. after an imperative content change). */
  measure: () => void;
}

export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  axis: ScrollFadeAxis = 'x',
): UseScrollFadeResult<T> {
  const nodeRef = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [edges, setEdges] = useState<ScrollFadeEdges>({ start: false, end: false });

  const measure = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
    const size = axis === 'x' ? el.clientWidth : el.clientHeight;
    const scrollSize = axis === 'x' ? el.scrollWidth : el.scrollHeight;
    const max = scrollSize - size;
    // 1px tolerance absorbs sub-pixel rounding so the fade doesn't flicker at rest.
    const next: ScrollFadeEdges = { start: pos > 1, end: pos < max - 1 };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [axis]);

  // Callback ref: (re)bind listeners whenever the node attaches/detaches. Keeping
  // the wiring here (not a deps-driven effect) means it survives node swaps.
  const ref = useCallback(
    (node: T | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      if (!node) return;

      node.addEventListener('scroll', measure, { passive: true });
      const ro =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
      ro?.observe(node);
      for (const child of Array.from(node.children)) ro?.observe(child);

      // Measure once layout has settled.
      const raf = requestAnimationFrame(measure);

      cleanupRef.current = () => {
        cancelAnimationFrame(raf);
        node.removeEventListener('scroll', measure);
        ro?.disconnect();
      };
    },
    [measure],
  );

  // Re-measure on viewport resize (container width can change without its own
  // ResizeObserver firing, e.g. a flex sibling growing).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Tear down listeners on unmount.
  useEffect(() => () => cleanupRef.current?.(), []);

  const maskImage = maskImageFor(edges, axis);
  const fadeStyle: CSSProperties = maskImage
    ? ({ maskImage, WebkitMaskImage: maskImage } as CSSProperties)
    : {};

  return { ref, edges, fadeStyle, measure };
}
