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

/**
 * Minimal player-stats shape the auto-fill reads. Mirrors the legacy
 * `PlayerStats` fields the create-modal consults (rounds_played gate + the four
 * per-area sources). Kept narrow so callers can pass any compatible stats row.
 */
export interface AreaAutoFillStats {
  rounds_played: number;
  avg_score: number | null;
  avg_putts: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
}

/** Result of an area-type change: the suggested metric + an auto-filled current value. */
export interface AreaAutoFill {
  /** First suggested metric for the area (or '' for none). */
  suggestedMetric: string;
  /** Auto-populated current value (as a string for the form field), or '' if unavailable. */
  autoCurrentValue: string;
}

/**
 * Compute the auto-fill for a focus-area form when the area type changes.
 * VERBATIM port of development-client.tsx `handleAreaTypeChange` (the
 * suggested-metric pick + the per-area stat mapping):
 *   putting           → avg_putts
 *   driving           → fairway_pct
 *   iron_play         → gir_pct
 *   course_management → avg_score
 * The stat is only used when the player has at least one recorded round.
 */
export function getAreaAutoFill(
  areaType: string,
  stats: AreaAutoFillStats | null | undefined,
): AreaAutoFill {
  const at = getAreaType(areaType);
  const suggestedMetric = at.suggestedMetrics[0] || '';

  // Auto-populate current value from stats if available (rounds_played gate).
  let autoCurrentValue = '';
  if (stats && stats.rounds_played > 0) {
    if (areaType === 'putting' && stats.avg_putts != null) {
      autoCurrentValue = String(stats.avg_putts);
    } else if (areaType === 'driving' && stats.fairway_pct != null) {
      autoCurrentValue = String(stats.fairway_pct);
    } else if (areaType === 'iron_play' && stats.gir_pct != null) {
      autoCurrentValue = String(stats.gir_pct);
    } else if (areaType === 'course_management' && stats.avg_score != null) {
      autoCurrentValue = String(stats.avg_score);
    }
  }

  return { suggestedMetric, autoCurrentValue };
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
