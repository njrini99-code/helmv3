'use client';

/**
 * ============================================================================
 * CoachHelm · chat · evidence motion
 * ----------------------------------------------------------------------------
 * How a visual arrives. Owner, 2026-10-29: the answer visuals get motion, the
 * way the best chat products bring a chart in. Three rules keep it honest:
 *
 *   1. Only a visual that arrives in the LIVE answer moves. A thread loaded
 *      from history renders final, so scrolling back through old answers never
 *      replays a dozen entrances. The decision is captured once, at mount
 *      (`useState` initialiser), so the stream finishing does not snap or
 *      replay anything.
 *   2. Reduced motion means no motion: everything renders final.
 *   3. Only opacity and transform, plus SVG path length, so WKWebView keeps it
 *      on the compositor. Figures are never counted up: a number is shown final
 *      the moment it is shown at all.
 *
 * Timings (research synthesis, docs/architecture/coachhelm-visual-playbook.md):
 * card 320ms rise of 8px, 80ms stagger between blocks, line draw 600ms, bars
 * 420ms, dots 220ms after the line.
 * ========================================================================== */

import * as React from 'react';
import { motion } from 'motion/react';
import { EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

const EvidenceMotionContext = React.createContext(false);

/** Wrap a turn. `live` is read once, when the turn mounts. */
export function EvidenceMotionProvider({ live, children }: { live: boolean; children: React.ReactNode }) {
  const [animate] = React.useState(live);
  return <EvidenceMotionContext.Provider value={animate}>{children}</EvidenceMotionContext.Provider>;
}

/** Whether visuals under this point should animate in. */
export function useEvidenceMotion(): boolean {
  const live = React.useContext(EvidenceMotionContext);
  const reduced = useReducedMotionGuard() ?? false;
  return live && !reduced;
}

export const EVIDENCE_MOTION = {
  /** Card entrance. */
  rise: { duration: 0.32, ease: EASE_CINEMATIC },
  /** Between blocks of one visual, capped so a long composition never drags. */
  stagger: (i: number) => Math.min(i, 6) * 0.08,
  /** Figures start once their card has mostly arrived. */
  figureDelay: 0.14,
  line: { duration: 0.6, ease: EASE_CINEMATIC },
  bar: { duration: 0.42, ease: EASE_CINEMATIC },
  dot: { duration: 0.22, ease: EASE_CINEMATIC },
} as const;

/** A block's entrance: fade and an 8px rise, staggered by its place in the visual. */
export function EvidenceReveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const animate = useEvidenceMotion();
  return (
    <motion.div
      className={className}
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EVIDENCE_MOTION.rise, delay: animate ? EVIDENCE_MOTION.stagger(index) : 0 }}
    >
      {children}
    </motion.div>
  );
}
