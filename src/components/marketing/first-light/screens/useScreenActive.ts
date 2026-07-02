'use client';

import { useState } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';

/**
 * Converts a 0→1 "activeness" `MotionValue` (already computed off the film
 * column's dwell/handoff clock — see `M3ProductCinema.tsx`'s timing map) into
 * a ONE-WAY boolean: once a screen crosses `threshold` engaged, its replica
 * "writes itself in" and STAYS written in even if the user scrubs back past
 * the threshold. Per spec, reversal on scrub-back is fine to leave as
 * completed-state, so this never flips back to `false`.
 */
export function useScreenActive(activeness: MotionValue<number>, threshold = 0.4): boolean {
  const [entered, setEntered] = useState(() => activeness.get() > threshold);
  useMotionValueEvent(activeness, 'change', (v) => {
    if (v > threshold) setEntered(true);
  });
  return entered;
}
