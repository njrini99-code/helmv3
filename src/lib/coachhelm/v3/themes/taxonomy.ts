/**
 * ============================================================================
 * CoachHelm v3 · THEMES — taxonomy
 * ----------------------------------------------------------------------------
 * The fixed scaffold: every `InsightCategory` maps to exactly ONE theme, so the
 * theme list is stable and NEVER blank (honest degradation — a category with no
 * insights still renders a `thin` stub). The 4 SG categories anchor on their SG
 * headline metric; the 3 outcome categories (scoring / course management /
 * pressure) have no SG metric and are sized from counterfactuals + outcome rates.
 *
 * Category ↔ SG-metric note (verified): the `InsightCategory` members are
 * `tee` / `short_game` (NOT `off_the_tee` / `around_green`), while the SG
 * `MetricId`s are `sg_ott` / `sg_around_green`. They intentionally differ.
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

export interface ThemeDef {
  category: InsightCategory;
  /** SG headline metric for the 4 SG themes; null for outcome themes. */
  sgMetricId: MetricId | null;
  displayLabel: string;
  isOutcomeTheme: boolean;
}

/**
 * Ordered scaffold. Runtime card order is by `themeStrokesPerRound` desc (the
 * rate-limiting theme floats up); this array is the stable tiebreak + the
 * canonical "render every theme" list. Roughly ordered by typical college
 * stroke-leak magnitude so a zero-data player still sees a sensible order.
 */
export const THEME_TAXONOMY: readonly ThemeDef[] = [
  { category: 'putting',           sgMetricId: 'sg_putting',       displayLabel: 'Putting',           isOutcomeTheme: false },
  { category: 'approach',          sgMetricId: 'sg_approach',      displayLabel: 'Approach',          isOutcomeTheme: false },
  { category: 'tee',               sgMetricId: 'sg_ott',           displayLabel: 'Off the Tee',       isOutcomeTheme: false },
  { category: 'short_game',        sgMetricId: 'sg_around_green',  displayLabel: 'Around the Green',  isOutcomeTheme: false },
  { category: 'scoring',           sgMetricId: null,               displayLabel: 'Scoring',           isOutcomeTheme: true },
  { category: 'course_management', sgMetricId: null,               displayLabel: 'Course Management', isOutcomeTheme: true },
  { category: 'pressure',          sgMetricId: null,               displayLabel: 'Pressure',          isOutcomeTheme: true },
] as const;

/** Lookup by category. */
const BY_CATEGORY = new Map<InsightCategory, ThemeDef>(
  THEME_TAXONOMY.map((d) => [d.category, d]),
);

export function getThemeDef(category: InsightCategory): ThemeDef | null {
  return BY_CATEGORY.get(category) ?? null;
}

/** Stable scaffold index for tiebreak ordering (lower = earlier). */
export function themeScaffoldIndex(category: InsightCategory): number {
  const i = THEME_TAXONOMY.findIndex((d) => d.category === category);
  return i === -1 ? THEME_TAXONOMY.length : i;
}
