'use client';

/**
 * Trace — the viz STROKE primitive (spec §4.4 #4, §7 `<Trace>`).
 *
 * The one stroke language for baseball motion data: a pitch breaking, a ball
 * sprayed, a season climbing (the Break Room / Climb waves). It renders a single
 * SVG `<path>` that DRAWS on mount via `stroke-dashoffset` (framer-motion
 * `pathLength`, wired through `traceDraw` in motion.ts), like a pen moving.
 * `weight` + optional `glow` encode quality (velo, strength).
 *
 * ┌─ USAGE ────────────────────────────────────────────────────────────────┐
 * │ This is an SVG-CHILD component: it renders a `<path>` (plus an optional  │
 * │ blurred glow path) and NOTHING ELSE. The CALLER provides the enclosing   │
 * │ `<svg>` with its own `viewBox`, and the `d` here is authored in that     │
 * │ coordinate space. Usable inside a `<ClayCanvas>` (chalk/team/sodium      │
 * │ strokes on dark) AND on paper.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `prefers-reduced-motion` (or `animate={false}`) → the stroke renders fully
 * drawn and static, per the motion contract. The stroke color is applied via
 * `style` (SVG presentation attributes do not resolve `var(--…)`).
 */
import { m, useReducedMotion } from 'framer-motion';
import { traceDraw } from './motion';

export interface TraceProps {
  /** SVG path data, authored in the caller's `<svg viewBox>` coordinate space. */
  d: string;
  /** Stroke width (default 2). Also the base for the glow halo width. */
  weight?: number;
  /** Stroke ink: `team` green, `sodium`, `chalk` (on clay), or `pursuit` clay. */
  ink?: 'team' | 'sodium' | 'chalk' | 'pursuit';
  /** Render a soft blurred halo behind the stroke (encodes quality). */
  glow?: boolean;
  /** Draw on mount (default true). `false` renders already-drawn. */
  animate?: boolean;
  className?: string;
}

const INK_VAR: Record<NonNullable<TraceProps['ink']>, string> = {
  team: 'var(--grade-plus)',
  sodium: 'var(--sodium)',
  chalk: 'var(--chalk)',
  pursuit: 'var(--pursuit-ink)',
};

export function Trace({ d, weight = 2, ink = 'team', glow = false, animate = true, className }: TraceProps) {
  const reduced = useReducedMotion() ?? false;
  const stroke = INK_VAR[ink];
  const still = !animate || reduced;
  const draw = still ? {} : { variants: traceDraw(false), initial: 'hidden' as const, animate: 'visible' as const };

  return (
    <>
      {/* Soft quality halo — a static, faint, blurred under-stroke. */}
      {glow ? (
        <path
          d={d}
          fill="none"
          strokeWidth={weight * 2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.22}
          aria-hidden
          style={{ stroke, filter: `blur(${Math.max(weight, 2)}px)` }}
        />
      ) : null}
      {/* The crisp stroke — draws via pathLength (stroke-dashoffset). */}
      <m.path
        d={d}
        fill="none"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ stroke }}
        {...draw}
      />
    </>
  );
}
