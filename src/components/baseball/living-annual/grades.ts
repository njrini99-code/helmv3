/**
 * grades.ts — pure helpers for the 20-80 scouting scale (spec §4.2).
 *
 * The ramp maps a grade onto one of three ink bands:
 *   • low  (20–40)  → muted clay-red   (--grade-low)
 *   • avg  (45–55)  → ink-neutral      (--grade-avg)
 *   • plus (60–80)  → team green       (--grade-plus)
 *
 * All functions are pure (no side effects, no DOM). The class/var maps below
 * are static string tables so Tailwind's JIT sees the full utility names and
 * consumers never build class strings dynamically (which would be purged).
 */

export type GradeBand = 'low' | 'avg' | 'plus';

/**
 * Which 20-80 ramp band a grade falls in. Boundaries per spec §4.2:
 * below 45 → low, 45–55 inclusive → avg, above 55 → plus. The scale is
 * continuous, so the 41–44 / 56–59 gaps resolve to the nearest band.
 */
export function gradeColor(value: number): GradeBand {
  if (value < 45) return 'low';
  if (value <= 55) return 'avg';
  return 'plus';
}

/**
 * Standard scouting descriptor for a 20-80 grade (used as a stamp ring label
 * or tooltip). 50 is MLB average; 60+ is a "plus" tool.
 */
export function gradeLabel(value: number): string {
  if (value >= 80) return 'ELITE';
  if (value >= 70) return 'PLUS-PLUS';
  if (value >= 60) return 'PLUS';
  if (value >= 55) return 'ABOVE AVG';
  if (value >= 50) return 'AVERAGE';
  if (value >= 45) return 'FRINGE';
  if (value >= 40) return 'BELOW AVG';
  if (value >= 30) return 'WELL BELOW';
  return 'POOR';
}

/** A tool grading 60 or higher is a "plus" (above-average) tool. */
export function isPlus(value: number): boolean {
  return value >= 60;
}

/** Static `text-*` class per band (Tailwind-safe — full names appear here). */
export const GRADE_TEXT_CLASS: Record<GradeBand, string> = {
  low: 'text-grade-low',
  avg: 'text-grade-avg',
  plus: 'text-grade-plus',
};

/** Static `bg-*` class per band. */
export const GRADE_BG_CLASS: Record<GradeBand, string> = {
  low: 'bg-grade-low',
  avg: 'bg-grade-avg',
  plus: 'bg-grade-plus',
};

/** Raw CSS custom-property reference per band — for inline `style` on viz
 *  primitives (pip fills, ring borders) where a dynamic class won't do. */
export const GRADE_VAR: Record<GradeBand, string> = {
  low: 'var(--grade-low)',
  avg: 'var(--grade-avg)',
  plus: 'var(--grade-plus)',
};
