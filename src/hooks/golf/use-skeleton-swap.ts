'use client';

/**
 * Skeleton → content (MOT-17, motion-haptics spec §4 #16).
 *
 * A load that ends in under SKELETON_SWAP_THRESHOLD_MS swaps straight to the
 * content: a fade on a near-instant load reads as lag. A load that took
 * longer fades the content in over SKELETON_CROSSFADE_MS, so a long wait
 * ends softly instead of with a jump. Reduced motion always hard-swaps.
 *
 * Usage: `const reveal = useSkeletonSwap(loading);` then put
 * `reveal.className` on the content's wrapper.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { SKELETON_SWAP_THRESHOLD_MS } from '@/lib/motion/tokens';

export interface SkeletonSwap {
  /** True for the render after a slow load: the content fades in. */
  fade: boolean;
  /** Class for the content wrapper (empty on a hard swap). */
  className: string;
}

// Literal, so Tailwind sees it; 150 is SKELETON_CROSSFADE_MS.
export const SKELETON_FADE_CLASS = 'motion-safe:animate-[fade-in_150ms_ease-out_both]';

export function useSkeletonSwap(loading: boolean, now: () => number = () => performance.now()): SkeletonSwap {
  const reduce = useReducedMotionGuard();
  const startedAt = useRef<number | null>(loading ? now() : null);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (loading) {
      startedAt.current ??= now();
      setFade(false);
      return;
    }
    const started = startedAt.current;
    startedAt.current = null;
    if (started == null) return;
    setFade(!reduce && now() - started >= SKELETON_SWAP_THRESHOLD_MS);
    // `now` is a test seam; a new function identity must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, reduce]);

  return { fade, className: fade ? SKELETON_FADE_CLASS : '' };
}
