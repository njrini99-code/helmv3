/**
 * Pure display-shaping helpers for the trace tree view.
 *
 * Kept out of `TraceTree.tsx` (a `'use client'` component) so they're testable
 * without React Testing Library, and kept out of `trace-tree.ts` (the
 * containment builder this Bridge tab must not change the logic/API of)
 * since these are presentation math over an already-built tree, not tree
 * construction.
 */

export const EM_DASH = '—';

/** Never a blank field — an absent value reads as the em dash, not a missing row. */
export function displayValue(value: unknown): string | number {
  if (value === null || value === undefined || value === '') return EM_DASH;
  return value as string | number;
}

/**
 * Percentage width (0–100, rounded to one decimal) for a step's proportional
 * duration bar. Zero — an empty track, never a fabricated sliver — whenever
 * either input can't support a real ratio: no recorded duration for this
 * step, an invalid duration, or no positive total to measure it against.
 */
export function durationBarPercent(durationMs: number | null, totalMs: number): number {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return 0;
  return Math.min(100, Math.round((durationMs / totalMs) * 1000) / 10);
}

/**
 * The reference scale for every step's duration bar, and for the KPI strip's
 * own "total duration" figure: the trace's own authoritative run duration
 * when it's known, else the sum of root-level (top-of-trace) step durations.
 * Root steps run sequentially (validation → auth → player → the RPC), so
 * their sum approximates the same wall-clock span without inventing a number
 * the trace never recorded.
 */
export function deriveTraceTotalMs(
  runDurationMs: number | null,
  rootDurationsMs: readonly (number | null)[],
): number {
  if (runDurationMs !== null && Number.isFinite(runDurationMs)) return runDurationMs;
  return rootDurationsMs.reduce((sum: number, ms) => sum + (ms ?? 0), 0);
}
