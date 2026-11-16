'use client';

import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';

const subscribeNothing = () => () => {};

/**
 * The reader's reduced-motion setting, safe to branch markup on. While the page hydrates it is false, as it was on the
 * server (which can't know the setting and rendered the moving version); right after, it is the real setting. Branching
 * on motion's own hook during hydration drew a different tree from the server's under reduced motion: a React
 * attribute mismatch on every BaseballHelm sign-in page and the landing page (prod audit SWP-24, 15 Nov 2026).
 * Its own client module: the kit's index (and so motion.ts) is imported by server pages, where React's hooks can't be.
 */
export function useLivingReducedMotion(): boolean {
  const reduced = useReducedMotion() ?? false;
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return hydrated && reduced;
}
