'use client';

/**
 * Shared helpers for the M3 screen replicas (`CommandCenterScreen`,
 * `StatsCenterScreen`, `DecisionRoomScreen`, `LiftLabScreen`) — kept small
 * and generic on purpose so each replica file stays focused on ITS
 * surface's content, not on re-deriving the "write itself in" motion
 * plumbing four times. See CONTRACTS.md's "Screen replica contract" for
 * the full write-up.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

/** The house cinematic-settle ease (CONTRACTS.md's motion-discipline
 * recap) — typed as a tuple, not `number[]`, so it satisfies framer-
 * motion's `Easing` type inside a `Variants` object below. */
const EASE_GLIDE: readonly [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Kelly is demoted to product-only per CONTRACTS.md's sage/cream amendment
 * (`--fl-green`/`--fl-sage-deep`) — legitimate INSIDE these replicas
 * because they ARE simulated product screens (content, not landing
 * chrome), the same carve-out the placeholder PNGs this replaced used.
 * Never reach for this outside the four screen replica files.
 */
export const KELLY = '#16A34A';

export interface ScreenReplicaProps {
  /** This screen's dwell window is (or has been) engaged — flips the
   * one-way "write itself in" stagger. Ignored when `instant` is true. */
  active: boolean;
  /** Render the fully-resolved end state immediately, zero animation —
   * `StaticCinema`'s contract (mobile + `prefers-reduced-motion`; the
   * structural fork already happened one level up, per CONTRACTS.md's
   * "Reduced-motion: two valid patterns"). */
  instant?: boolean;
  className?: string;
}

/**
 * Small-caps dateline label — the Living-Annual `Eyebrow` grammar
 * (`living-annual/Eyebrow.tsx`: uppercase, wide tracking, recessive ink),
 * reimplemented in first-light's OWN tokens rather than importing the
 * baseball kit directly (CONTRACTS.md: the two font/token systems stay
 * deliberately separate). Sized for an in-app micro-label, not the
 * landing's own (larger) `text-eyebrow` heading utility.
 */
export function ScreenEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn('text-microbadge font-semibold uppercase tracking-[0.14em]', className)}
      style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.5)' }}
    >
      {children}
    </span>
  );
}

/** Row/element stagger — 'hidden' → 'shown', shared across all four
 * replicas so their write-in cadence reads as one system. */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
};

/** Orchestrates `rowVariants` children with a stagger — mirrors the
 * `[0.16, 1, 0.3, 1]` house ease via each row's own transition default. */
export function containerVariants(staggerChildren = 0.05, delayChildren = 0) {
  return {
    hidden: {},
    shown: { transition: { staggerChildren, delayChildren } },
  };
}

/** A bar that scales in from the left, `origin-left` required on the
 * element — confidence bars, meter fills. */
export const barVariants: Variants = {
  hidden: { scaleX: 0 },
  shown: { scaleX: 1, transition: { duration: 0.5, ease: EASE_GLIDE } },
};

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export interface RollingStatProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  active: boolean;
  instant?: boolean;
  className?: string;
}

/**
 * Numeral roll-in — the "ODOMETER TRUTH" idiom (`living-annual/
 * StatReadout.tsx`, `ui/animated-number.tsx`) reimplemented as a plain rAF
 * tween instead of wrapping `@number-flow/react` directly: these screens
 * mount once (inside the always-mounted `FilmColumn`) and need to roll on
 * the `active` FLIP, not on mount, which `AnimatedNumber`'s own mount-roll
 * doesn't support. `instant` (`StaticCinema`) skips the tween entirely and
 * renders the resting figure — zero motion, per contract.
 */
export function RollingStat({ value, decimals = 0, prefix = '', suffix = '', active, instant = false, className }: RollingStatProps) {
  const [display, setDisplay] = useState(instant || active ? value : 0);
  const rolledRef = useRef(instant);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (instant || rolledRef.current || !active) return;
    rolledRef.current = true;
    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(value * easeOutExpo(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, instant, value]);

  return (
    <span className={cn('font-annual tabular-nums', className)}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
