/**
 * BaselineRegistry — single source of truth for `(source, label, value)`
 * triples emitted into evidence cards.
 *
 * Generators look up an entry by BaselineKey and spread the result into the
 * evidence object so callers cannot construct an insight where
 * `comparison_source`, `comparison_label`, and `comparison_value` disagree.
 *
 * Why this exists: the 2026-05-17 audit found `putt-analytics.ts` reading
 * `D2_BASELINE[...]` numerically while emitting `comparison_label: 'PGA Tour
 * avg'` and `comparison_source: 'pga_baseline'`. The values pointed at one
 * benchmark; the label/source claimed another. This registry makes that class
 * of bug structurally impossible.
 *
 * To add a new comparison:
 *   1. Add a BaselineEntry to ENTRIES below.
 *   2. Generators call `baselineRegistry.get(key)` and spread the result.
 *   3. Never hard-code a comparison_label or comparison_source string at a
 *      call site — the static test at
 *      `src/test/coachhelm/v2/insights/baseline-registry.test.ts` will fail.
 */
import type { BaselineKey, InsightComparisonSource } from './types';

interface BaselineEntry {
  source: InsightComparisonSource;
  label: string;
  value: number;
}

// Putting make percentages are sourced from prior in-file FALLBACK_BASELINE
// in putt-analytics.ts (which itself is a D2-style distribution).
const ENTRIES = {
  // Putting — D2 division.
  'd2_avg.putting_make_pct_0_3ft':   { source: 'd2_avg', label: 'Division II average', value: 0.95 },
  'd2_avg.putting_make_pct_3_6ft':   { source: 'd2_avg', label: 'Division II average', value: 0.75 },
  'd2_avg.putting_make_pct_6_10ft':  { source: 'd2_avg', label: 'Division II average', value: 0.48 },
  'd2_avg.putting_make_pct_10_15ft': { source: 'd2_avg', label: 'Division II average', value: 0.28 },
  'd2_avg.putting_make_pct_15_20ft': { source: 'd2_avg', label: 'Division II average', value: 0.18 },
  'd2_avg.putting_make_pct_20+ft':   { source: 'd2_avg', label: 'Division II average', value: 0.08 },

  // Putting — PGA Tour reference (kept for future generators that want it).
  'pga_baseline.putting_make_pct_0_3ft':   { source: 'pga_baseline', label: 'PGA Tour avg', value: 0.99 },
  'pga_baseline.putting_make_pct_3_6ft':   { source: 'pga_baseline', label: 'PGA Tour avg', value: 0.88 },
  'pga_baseline.putting_make_pct_6_10ft':  { source: 'pga_baseline', label: 'PGA Tour avg', value: 0.55 },
  'pga_baseline.putting_make_pct_10_15ft': { source: 'pga_baseline', label: 'PGA Tour avg', value: 0.31 },
  'pga_baseline.putting_make_pct_15_20ft': { source: 'pga_baseline', label: 'PGA Tour avg', value: 0.20 },
  'pga_baseline.putting_make_pct_20+ft':   { source: 'pga_baseline', label: 'PGA Tour avg', value: 0.10 },

  // Approach — uniform-distribution targets (was 'peer_percentile' pre-2026-05-17).
  'absolute_target.uniform_4way':  { source: 'absolute_target', label: 'Balanced distribution (25% each)', value: 0.25 },
  'absolute_target.balanced_lr':   { source: 'absolute_target', label: 'Balanced left/right (50/50)', value: 0.5 },

  // Course management.
  'absolute_target.par':           { source: 'absolute_target', label: 'par', value: 0 },
} as const satisfies Record<BaselineKey, BaselineEntry>;

class BaselineRegistry {
  /** Look up a baseline by stable key. Throws if the key is not registered. */
  get(key: BaselineKey): BaselineEntry {
    const entry = (ENTRIES as Record<BaselineKey, BaselineEntry | undefined>)[key];
    if (!entry) throw new Error(`unknown baseline key: ${key}`);
    return entry;
  }

  /** Non-throwing variant — returns null when the key isn't registered. */
  tryGet(key: BaselineKey): BaselineEntry | null {
    return (ENTRIES as Record<BaselineKey, BaselineEntry | undefined>)[key] ?? null;
  }

  /** List every registered key — used by the coverage test. */
  allKeys(): BaselineKey[] {
    return Object.keys(ENTRIES) as BaselineKey[];
  }
}

export const baselineRegistry = new BaselineRegistry();
export type { BaselineEntry };
