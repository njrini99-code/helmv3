'use client';

import type { ElementType, ReactNode } from 'react';
import { m, useTransform, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/** The house cinematic-settle curve — matches `EASE_GLIDE` in
 * `src/components/baseball/living-annual/motion.ts` (the repo's shared
 * motion vocabulary; imported by value here to keep this module
 * dependency-free of the baseball kit). */
const EASE_GLIDE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface MaskedRevealProps {
  /** One entry per visual line — each gets its own overflow-hidden mask. */
  lines: ReactNode[];
  /**
   * Scrub-link the reveal to a `PinnedScrub`/`useScrollProgress` progress
   * value instead of viewport-entry. When provided, each line's write-in
   * window is an even slice of `[0, revealBy]` (see that prop). Omit for
   * the default `whileInView` one-shot entrance.
   */
  progress?: MotionValue<number>;
  /** Wrapper element — `h1`/`h2`/`p`/`div`. Default `div`. */
  as?: ElementType;
  className?: string;
  lineClassName?: string;
  /** `whileInView` mode only: base delay in seconds before the first line. */
  delay?: number;
  /** `whileInView` mode only: seconds between each line's start. */
  stagger?: number;
  /**
   * Scrub mode only: fraction of `progress` (0–1) by which every line
   * should have finished writing in. Default `0.6` — the write-in
   * completes in the first 60% of the scrub window, leaving room for
   * whatever comes next in the same pinned sequence.
   */
  revealBy?: number;
}

/**
 * Serif line write-in — overflow-hidden line masks, translateY reveal,
 * stagger (docs/LANDING_ENTRY_WORLD_DESIGN.md M2/M3 captions). Reads as a
 * pen finishing each line in turn.
 *
 * `prefers-reduced-motion` → every line renders in its final, visible
 * position instantly (no mask animation).
 */
export function MaskedReveal({
  lines,
  progress,
  as: As = 'div',
  className,
  lineClassName,
  delay = 0,
  stagger = 0.09,
  revealBy = 0.6,
}: MaskedRevealProps) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <As className={className}>
        {lines.map((line, i) => (
          <span key={i} className={cn('block', lineClassName)}>
            {line}
          </span>
        ))}
      </As>
    );
  }

  return (
    <As className={className}>
      {lines.map((line, i) =>
        progress ? (
          <MaskedLineScrub
            key={i}
            index={i}
            total={lines.length}
            progress={progress}
            revealBy={revealBy}
            className={lineClassName}
          >
            {line}
          </MaskedLineScrub>
        ) : (
          <MaskedLineInView
            key={i}
            index={i}
            delay={delay}
            stagger={stagger}
            className={lineClassName}
          >
            {line}
          </MaskedLineInView>
        ),
      )}
    </As>
  );
}

interface MaskedLineBaseProps {
  children: ReactNode;
  className?: string;
}

function MaskedLineScrub({
  children,
  index,
  total,
  progress,
  revealBy,
  className,
}: MaskedLineBaseProps & {
  index: number;
  total: number;
  progress: MotionValue<number>;
  revealBy: number;
}) {
  const windowSize = revealBy / Math.max(total, 1);
  const start = index * windowSize;
  const end = Math.min(revealBy, start + windowSize * 1.5);
  const y = useTransform(progress, [start, end], ['110%', '0%']);
  const opacity = useTransform(progress, [start, end], [0, 1]);

  return (
    <span className={cn('fl-line-mask', className)}>
      <m.span style={{ y, opacity }} className="block will-change-transform">
        {children}
      </m.span>
    </span>
  );
}

function MaskedLineInView({
  children,
  index,
  delay,
  stagger,
  className,
}: MaskedLineBaseProps & { index: number; delay: number; stagger: number }) {
  // IMPORTANT: `whileInView` lives on this OUTER, never-transformed wrapper
  // (not the inner span that actually moves) — IntersectionObserver
  // computes intersection post-clip by ancestor `overflow: hidden`, so an
  // element sitting at its own INITIAL translateY(110%) is self-clipped by
  // this wrapper's `overflow: hidden` and would never geometrically
  // intersect, deadlocking the reveal (it can only become visible once the
  // animation fires, and the animation can only fire once it's visible).
  // Observing the stable wrapper and propagating "hidden"/"visible" down
  // to the inner span via matching `variants` sidesteps that paradox.
  return (
    <m.span
      className={cn('fl-line-mask', className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-15%' }}
    >
      <m.span
        variants={{
          hidden: { y: '110%', opacity: 0 },
          visible: {
            y: '0%',
            opacity: 1,
            transition: { duration: 0.7, ease: EASE_GLIDE, delay: delay + index * stagger },
          },
        }}
        className="block will-change-transform"
      >
        {children}
      </m.span>
    </m.span>
  );
}
