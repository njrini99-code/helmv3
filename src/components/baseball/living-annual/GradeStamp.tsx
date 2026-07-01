'use client';

/**
 * GradeStamp — the 20-80 evaluation atom of the recruiting lane (spec §7).
 *
 * A debossed rounded-square token: a mono grade numeral over a small-caps tool
 * ring label, tinted by the {@link gradeColor} ramp (low clay-red → avg neutral
 * → plus green), tilted ±1.5° for hand-stamped character. It reveals with a
 * STAMP PRESS (fast down → settle with a hair of overshoot, spec §4.4 #5) over
 * a soft ink-bleed soak.
 *
 * `present` = a solid, letterpressed stamp (a graded tool). `future` (i.e.
 * `present={false}`) = a ghost dashed outline — the projected/ceiling grade
 * not yet earned. Reduced motion → shown instantly, no press, no bleed.
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { gradeColor, GRADE_VAR } from './grades';
import { inkBleed, stampPress } from './motion';

export interface GradeStampProps {
  /** The 20-80 grade. */
  value: number;
  /** Tool name shown as the ring label, e.g. `HIT`, `POWER`, `RUN`, `ARM`. */
  tool: string;
  /** Solid present grade vs. ghost future/projected outline (default present). */
  present?: boolean;
  /** Override the tilt in degrees (default deterministic ±1.5° from the grade). */
  rotate?: number;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE: Record<'sm' | 'md', { box: string; num: string; tool: string }> = {
  sm: { box: 'h-12 w-12', num: 'text-base', tool: 'text-[7px]' },
  md: { box: 'h-16 w-16', num: 'text-2xl', tool: 'text-[8px]' },
};

export function GradeStamp({ value, tool, present = true, rotate, size = 'md', className }: GradeStampProps) {
  const reduced = useReducedMotion() ?? false;
  const band = gradeColor(value);
  const color = GRADE_VAR[band];
  const tilt = rotate ?? (value % 2 === 0 ? -1.5 : 1.5);
  const dims = SIZE[size];

  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={stampPress(reduced)}
      style={{ rotate: tilt, color, borderColor: color }}
      className={cn(
        'relative inline-flex select-none flex-col items-center justify-center rounded-fw-sm border',
        dims.box,
        present
          ? 'bg-[var(--paper)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_2px_rgba(0,0,0,0.12)]'
          : 'border-dashed opacity-45',
        className,
      )}
    >
      {/* Ink-bleed soak (present stamps only). */}
      {present ? (
        <m.span
          aria-hidden
          initial="hidden"
          animate="visible"
          variants={inkBleed(reduced)}
          className="pointer-events-none absolute inset-0 rounded-fw-sm blur-[1px]"
          style={{ background: color }}
        />
      ) : null}

      <span className={cn('relative font-fw-mono font-semibold leading-none tabular-nums', dims.num)}>{value}</span>
      <span className={cn('relative mt-0.5 uppercase tracking-[0.14em] text-text-tertiary', dims.tool)}>{tool}</span>
    </m.div>
  );
}
