'use client';

/**
 * Reveal — the generic entrance wrapper for the interaction layer.
 *
 * "INK SETTLES" (spec §4.4 #1) generalized: any child fades in + rises +
 * unblurs on mount, reusing the exact {@link inkSettles} variant that
 * `<Masthead>` / `<RuledStatLine>` already apply to hero numerals — so a
 * card grid, a roster wall, or a stat spread settles on the SAME curve as
 * the kit's ink, not a bespoke one. `staggerIndex` cascades siblings at
 * {@link STAGGER_STEP} apart (the same cadence `inkColumn` uses), so a
 * `PlayerRowPlate` wall or a `KPIContentsStrip` grid can settle top-to-bottom
 * or left-to-right with one prop, no manual `AnimatePresence`/variants wiring.
 *
 * Deliberately MOUNT-based, not `whileInView`. `src/components/ui/reveal.tsx`
 * already tried `whileInView` and reverted it (see that file's May 2026 note):
 * the baseball dashboard shell scrolls an inner `<main>` container, so
 * IntersectionObserver against the document viewport never fires for content
 * below the fold — pages got stuck at `opacity: 0`. `StatVisualFrame.tsx`
 * still uses `whileInView` safely because it sits low enough in a shorter
 * surface that the effect isn't exposed; don't copy that pattern into a
 * general-purpose primitive that other surfaces will nest arbitrarily deep.
 * Mount + stagger gets the same "settling into place" read without the trap.
 *
 * `prefers-reduced-motion` → renders in its final state instantly (no fade,
 * no rise, no blur — `inkSettles`'s own reduced path).
 *
 * ```tsx
 * {rows.map((row, i) => (
 *   <Reveal key={row.id} staggerIndex={i}><PlayerRowPlate {...row} /></Reveal>
 * ))}
 * ```
 */
import type { ReactNode } from 'react';
import type { TargetAndTransition, Variants } from 'framer-motion';
import { m, useReducedMotion } from 'framer-motion';
import { inkSettles, STAGGER_STEP } from './motion';

export interface RevealProps {
  children: ReactNode;
  /**
   * Stagger this Reveal behind sibling Reveals in the same group — each step
   * adds one {@link STAGGER_STEP} (60ms). Pass the row/card index (0, 1, 2…).
   */
  staggerIndex?: number;
  className?: string;
}

export function Reveal({ children, staggerIndex = 0, className }: RevealProps) {
  const reduced = useReducedMotion() ?? false;

  // A component-level `transition` prop would be ignored — framer-motion
  // resolves the transition embedded IN a variant target ahead of the prop —
  // so the stagger delay is merged straight into `inkSettles`'s "visible"
  // transition instead of passed alongside it.
  const base = inkSettles(reduced);
  const visible = base.visible as TargetAndTransition;
  const delay = reduced ? 0 : Math.max(0, staggerIndex) * STAGGER_STEP;
  const variants: Variants = {
    hidden: base.hidden as TargetAndTransition, // inkSettles always sets both keys
    visible: { ...visible, transition: { ...visible.transition, delay } },
  };

  return (
    <m.div initial="hidden" animate="visible" variants={variants} className={className}>
      {children}
    </m.div>
  );
}
