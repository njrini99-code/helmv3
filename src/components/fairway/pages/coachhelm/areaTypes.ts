/**
 * ============================================================================
 * Fairway · CoachHelm · areaTypes — the SHARED focus-area vocabulary
 * ----------------------------------------------------------------------------
 * A VERBATIM lift of the 8 AREA_TYPES + getAreaType + suggestedMetrics + the
 * area-type auto-fill vocabulary from
 *   src/app/golf/(dashboard)/dashboard/development/development-client.tsx
 *   (AREA_TYPES ~l.106–171, getAreaType ~l.180, handleAreaTypeChange ~l.455–479)
 *
 * The values, labels, icons, suggested metrics and the per-area stat auto-fill
 * are preserved EXACTLY so the re-skinned create-focus-area ModalShell form
 * behaves identically to the legacy form. This is the single source of truth
 * for BOTH coach Development (PlayersGridView) and player My Development
 * (FairwayMyDevelopment).
 *
 * NAMING / SAFETY: this is a NEW shared module. The original
 * development-client.tsx is NOT edited in this workflow — re-pointing the
 * legacy form to this module happens in the surfaces workflow. Do NOT rewrite
 * the vocabulary; it is a copy, not a redesign.
 *
 * Pure data + pure functions — no DOM, no 'use client'. Icons are the same SVG
 * icon components used app-wide (@/components/icons), so this stays consumable
 * by either a server or client component.
 * ========================================================================== */

import type { ReactNode } from 'react';
import {
  IconWind,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconDumbbell,
  IconClipboardList,
} from '@/components/icons';

// The metric catalog + its helpers (and the windowed auto-tracking the cron
// uses) now live in a pure, icon-free lib module so the server tracker can
// import them without pulling React. Re-exported below so existing
// `./areaTypes` importers (modal, cards, index, tests) keep their import path.
import type {
  AreaAutoFillStats,
  MetricDirection,
  MetricCatalogEntry,
  FocusWindowRound,
} from '@/lib/coachhelm/focus-areas/catalog';
export type { AreaAutoFillStats, MetricDirection, MetricCatalogEntry, FocusWindowRound };
export {
  METRIC_CATALOG,
  metricsForArea,
  findMetric,
  readMetricValue,
  suggestTarget,
  formatMetricValue,
  WINDOWABLE_FOCUS_METRIC_KEYS,
  isWindowableFocusMetric,
  aggregateFocusMetric,
} from '@/lib/coachhelm/focus-areas/catalog';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

/** The canonical area_type value union (mirrors golf_player_focus_areas.area_type). */
export type AreaTypeValue =
  | 'driving'
  | 'iron_play'
  | 'short_game'
  | 'putting'
  | 'course_management'
  | 'mental_game'
  | 'fitness'
  | 'other';

export interface AreaTypeConfig {
  value: AreaTypeValue;
  label: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  /** Legacy warm-mode text color token (kept for parity; Fairway cards tint via tokens). */
  color: string;
  /** Legacy warm-mode bg color token (kept for parity). */
  bgColor: string;
  suggestedMetrics: string[];
}

/* ---------------------------------------------------------------------------
 * AREA_TYPES — VERBATIM from development-client.tsx (do NOT rewrite values)
 * ------------------------------------------------------------------------- */

export const AREA_TYPES: AreaTypeConfig[] = [
  {
    value: 'driving',
    label: 'Driving',
    icon: IconWind,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    suggestedMetrics: ['Driving Distance', 'Fairways Hit %', 'Fairway Accuracy'],
  },
  {
    value: 'iron_play',
    label: 'Iron Play',
    icon: IconCrosshair,
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
    suggestedMetrics: ['GIR %', 'Proximity to Hole', 'Iron Accuracy'],
  },
  {
    value: 'short_game',
    label: 'Short Game',
    icon: IconFlag,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    suggestedMetrics: ['Scrambling %', 'Up & Down %', 'Sand Save %'],
  },
  {
    value: 'putting',
    label: 'Putting',
    icon: IconCircleDot,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    suggestedMetrics: ['Putts Per Round', '1-Putt %', '3-Putt Avoidance %'],
  },
  {
    value: 'course_management',
    label: 'Course Mgmt',
    icon: IconMap,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    suggestedMetrics: ['Scoring Average', 'Par 3 Avg', 'Par 5 Avg'],
  },
  {
    value: 'mental_game',
    label: 'Mental Game',
    icon: IconBrain,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    suggestedMetrics: ['Bounce Back %', 'Closing Holes Avg', 'Pressure Putts Made %'],
  },
  {
    value: 'fitness',
    label: 'Fitness',
    icon: IconDumbbell,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    suggestedMetrics: ['Workouts Per Week', 'Flexibility Score', 'Club Head Speed'],
  },
  {
    value: 'other',
    label: 'Other',
    icon: IconClipboardList,
    color: 'text-warm-600',
    bgColor: 'bg-warm-50',
    suggestedMetrics: ['Custom Metric'],
  },
];

/* ---------------------------------------------------------------------------
 * getAreaType — VERBATIM resolver (falls back to the last entry, "other")
 * ------------------------------------------------------------------------- */

/**
 * Resolve an `area_type` string to its config; falls back to the trailing
 * "other" entry (matching the legacy `?? AREA_TYPES[AREA_TYPES.length - 1]`).
 */
export function getAreaType(value: string | null | undefined): AreaTypeConfig {
  return AREA_TYPES.find((t) => t.value === value) ?? AREA_TYPES[AREA_TYPES.length - 1]!;
}

/** Convenience: the first suggested metric for an area (auto-fill default). */
export function suggestedMetrics(value: string | null | undefined): string[] {
  return getAreaType(value).suggestedMetrics;
}

/* ---------------------------------------------------------------------------
 * Area-type auto-fill — VERBATIM logic lifted from handleAreaTypeChange
 * ------------------------------------------------------------------------- */

// `AreaAutoFillStats` (the player-stats shape the auto-fill reads) now lives in
// `@/lib/coachhelm/focus-areas/catalog` alongside the metric catalog that reads
// it, and is imported + re-exported at the top of this file.

/** Result of an area-type change: the suggested metric + an auto-filled current value. */
export interface AreaAutoFill {
  /** First suggested metric for the area (or '' for none). */
  suggestedMetric: string;
  /** Auto-populated current value (as a string for the form field), or '' if unavailable. */
  autoCurrentValue: string;
}

/**
 * Resolve a focus-area's CURRENT value from the player's real stats, keyed by
 * the chosen TARGET METRIC (not the area type). This is what makes "pick the
 * stat → its current value autofills" work: every metric maps to the matching
 * cached stat, so changing the metric re-derives the starting value.
 *
 * Returns '' (never a fabricated number) when:
 *   - the player has no recorded rounds, or
 *   - the metric is unknown / custom, or
 *   - the matching stat is null (not tracked yet).
 *
 * Match order is most-specific-first because the labels share keywords
 * ("Putts Per Round" vs "1-Putt %" vs "3-Putt Avoidance %" all contain "putt").
 */
export function getMetricCurrentValue(
  metric: string | null | undefined,
  stats: AreaAutoFillStats | null | undefined,
): string {
  if (!stats || !(stats.rounds_played > 0)) return '';
  const m = (metric ?? '').toLowerCase().trim();
  if (!m) return '';

  const v = (n: number | null | undefined): string => (n == null ? '' : String(n));

  // Driving
  if (m.includes('distance')) return v(stats.driving_distance);
  if (m.includes('fairway') || m.includes('driving accuracy')) return v(stats.fairway_pct);
  // Approach / irons
  if (m.includes('proximity')) return v(stats.proximity_to_hole);
  if (m.includes('gir') || m.includes('greens in regulation')) return v(stats.gir_pct);
  // Short game
  if (m.includes('scrambl')) return v(stats.scrambling_pct);
  if (m.includes('up') && m.includes('down')) return v(stats.up_and_down_pct);
  if (m.includes('sand')) return v(stats.sand_save_pct);
  // Putting — specific buckets before the generic "putts per round"
  if (m.includes('1-putt') || m.includes('one putt') || m.includes('one-putt')) {
    return v(stats.one_putt_pct);
  }
  if (m.includes('3-putt') || m.includes('three putt') || m.includes('three-putt')) {
    // The cache exposes the 3-putt RATE; "avoidance" is its inverse, so filling
    // it with the rate would mislead — leave blank for the coach to set.
    if (m.includes('avoid')) return '';
    return v(stats.three_putt_pct);
  }
  // Generic putts-per-round ONLY — never a make-rate like "Pressure Putts Made %"
  // (we don't cache that, so leave it blank rather than mislabel putts/round).
  if (m.includes('putts per round') || (m.includes('putt') && m.includes('round'))) {
    return v(stats.avg_putts);
  }
  // Scoring / course management
  if (m.includes('par 3') || m.includes('par3')) return v(stats.par3_avg);
  if (m.includes('par 4') || m.includes('par4')) return v(stats.par4_avg);
  if (m.includes('par 5') || m.includes('par5')) return v(stats.par5_avg);
  if (m.includes('best')) return v(stats.best_score);
  if (m.includes('scoring') || m.includes('score')) return v(stats.avg_score);

  return '';
}

/**
 * Compute the auto-fill for a focus-area form when the area type (or player)
 * changes: pick the area's first suggested metric, then derive its current
 * value from that metric via {@link getMetricCurrentValue}. Deriving the value
 * FROM the metric keeps the two consistent (the legacy port mislabeled driving
 * as "Driving Distance" while filling the fairway %); broadening the source map
 * also lets short-game / scoring metrics autofill, which the legacy four-case
 * mapping never did.
 */
export function getAreaAutoFill(
  areaType: string,
  stats: AreaAutoFillStats | null | undefined,
): AreaAutoFill {
  const at = getAreaType(areaType);
  const suggestedMetric = at.suggestedMetrics[0] || '';
  return { suggestedMetric, autoCurrentValue: getMetricCurrentValue(suggestedMetric, stats) };
}

/* ---------------------------------------------------------------------------
 * Progress — lower-is-better aware (shared by coach + player cards)
 * ------------------------------------------------------------------------- */

/** Metrics whose value should DECREASE toward the target (golf is lower-is-better). */
export const LOWER_IS_BETTER_KEYWORDS = [
  'putt',
  'penalty',
  'bogey',
  'score',
  'three_putt',
] as const;

/** Whether a target metric is "lower is better" (substring match, case-insensitive). */
export function isLowerIsBetter(targetMetric: string | null | undefined): boolean {
  const m = (targetMetric ?? '').toLowerCase();
  return LOWER_IS_BETTER_KEYWORDS.some((kw) => m.includes(kw));
}

/**
 * Compute progress % toward a focus-area target, honoring lower-is-better
 * metrics. VERBATIM port of my-development/page.tsx `getProgressPercent`:
 *   - missing/zero target → 0
 *   - lower-is-better: current ≤ target → 100; else round(target / current * 100)
 *   - higher-is-better: round(current / target * 100), clamped 0–100
 */
export function getProgressPercent(
  current: number | null,
  target: number | null,
  targetMetric?: string | null,
): number {
  if (current == null || target == null || target === 0) return 0;

  if (isLowerIsBetter(targetMetric)) {
    if (current <= target) return 100;
    return Math.round((target / current) * 100);
  }

  if (target < 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

