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
// `findMetric` is ALSO bound locally (not just re-exported) so
// isLowerIsBetter / formatTargetMetricLabel below can call it directly.
import type {
  AreaAutoFillStats,
  MetricDirection,
  MetricCatalogEntry,
  FocusWindowRound,
} from '@/lib/coachhelm/focus-areas/catalog';
import {
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
};
// The v3 canonical metric registry (sg_*, putts_made_5_10ft_pct, etc.) — the
// OTHER metric vocabulary a focus area's target_metric can carry (a coach can
// target either a legacy catalog label or a v3 metric id). Pure data lookup,
// no React/DOM, safe for this icon-free shared module.
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';

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
  // #1242: the live inverted bars were all proximity metrics carrying legacy
  // free-text ids ('Avg proximity 80-120y', 'avg_proximity_ft') that resolve in
  // NEITHER registry. Deliberately narrow — bare 'distance' is NOT here because
  // driving distance is higher-is-better; the catalog resolves that one at step
  // 2 anyway, but a free-text "Carry Distance" must not be caught by a guess.
  'proximity',
  'dispersion',
  'distance to',
] as const;

/**
 * Direction of improvement for a target metric, including the honest third
 * state. `unknown` exists because there is no safe default: assuming
 * higher-is-better is what made a player 56% WORSE than target render a full
 * "100% there" bar (#1242).
 */
export type ResolvedMetricDirection = 'lower' | 'higher' | 'unknown';

/**
 * Resolve a target metric's direction of improvement.
 *
 * Resolution order:
 *   1. The v3 canonical metric registry (`getMetricRenderConfig`) — the
 *      authoritative source when `target_metric` is a registered id
 *      (`sg_putting`, `approach_proximity_50_125ft`, …).
 *   2. The focus-area metric catalog (`findMetric`) — the legacy display-label
 *      vocabulary ("Putts Per Round", "1-Putt %", …), by stable key OR label.
 *   3. A keyword heuristic for genuinely unregistered / custom free text, with
 *      the make-rate guard: "___ made ___" / "___ hit ___" / "___ accuracy" is
 *      higher-is-better even when it contains a lower-is-better keyword
 *      (`putts_made_5_10ft_pct` — making MORE putts is better).
 *   4. `unknown` — no guess. Callers must degrade honestly rather than pick a
 *      direction; {@link getProgressPercent} returns null so no bar renders.
 */
export function resolveMetricDirection(
  targetMetric: string | null | undefined,
): ResolvedMetricDirection {
  if (!targetMetric) return 'unknown';

  const v3Cfg = getMetricRenderConfig(targetMetric);
  if (v3Cfg) return v3Cfg.direction === 'lower_better' ? 'lower' : 'higher';

  const catalogEntry = findMetric(targetMetric);
  if (catalogEntry) return catalogEntry.direction === 'lower' ? 'lower' : 'higher';

  const m = targetMetric.toLowerCase();
  if (/\bmade\b|\bhit\b|\baccuracy\b/.test(m)) return 'higher';
  if (LOWER_IS_BETTER_KEYWORDS.some((kw) => m.includes(kw))) return 'lower';
  return 'unknown';
}

/**
 * Whether a target metric is "lower is better" — a real direction lookup
 * against the canonical registries, NOT a naive keyword guess.
 *
 * A bare substring match on "putt" false-positives on MAKE-rate metrics like
 * `putts_made_5_10ft_pct` or "1-Putt %" — making more putts is better (higher
 * is better), even though the string contains "putt" (mustFix: direction
 * flipped for putts-made/percentage-made metrics).
 *
 * Resolution order:
 *   1. The v3 canonical metric registry (`getMetricRenderConfig`) — covers
 *      registered metric ids (`sg_putting`, `putts_made_5_10ft_pct`, …), the
 *      authoritative source when the target_metric matches one exactly.
 *   2. The focus-area metric catalog (`findMetric`) — covers the legacy
 *      display-label vocabulary ("Putts Per Round", "1-Putt %", "3-Putt %", …)
 *      by stable key OR label, case-insensitive.
 *   3. A genuinely unregistered / custom metric (free text in an "Other"
 *      area) — fall back to the keyword heuristic, but guard the exact
 *      false-positive that motivated this fix: a "___ made ___" / "___ hit
 *      ___" / "___ accuracy" phrasing is a make-rate (higher is better) even
 *      when it contains a lower-is-better keyword.
 */
export function isLowerIsBetter(targetMetric: string | null | undefined): boolean {
  return resolveMetricDirection(targetMetric) === 'lower';
}

/**
 * Human display label for a `target_metric` — a raw `target_metric` is a
 * snake_case DB metric identifier (e.g. `putts_made_5_10ft_pct`) or a legacy
 * catalog label (e.g. `Putts Per Round`); it must NEVER render verbatim in
 * player/coach-facing copy (mustFix #202/#60). Resolution mirrors
 * {@link isLowerIsBetter}: the v3 canonical registry's human display_label
 * first, then the focus-area catalog's label, then a title-cased de-snake so
 * an unregistered or custom metric string still never leaks its raw key.
 */
export function formatTargetMetricLabel(targetMetric: string | null | undefined): string | null {
  if (!targetMetric) return null;

  const v3Cfg = getMetricRenderConfig(targetMetric);
  if (v3Cfg) return v3Cfg.display_label;

  const catalogEntry = findMetric(targetMetric);
  if (catalogEntry) return catalogEntry.label;

  return targetMetric
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Progress along a focus area's journey: how far the player has travelled from
 * where they STARTED toward the target, direction-aware, clamped 0–100.
 *
 * `null` means "we cannot honestly compute this — render no bar". Callers must
 * handle it; there is no safe numeric fallback.
 *
 * This replaces the old `current / target` ratio (#1240), which was not a
 * progress measure at all: a brand-new 61 → 66 fairways area opened at "92%
 * there" before the player had swung a club, and completing the entire
 * objective moved the bar only 8 points. The ratio also inverted outright for
 * lower-is-better metrics whose direction could not be resolved (#1242) — a
 * player at 28 ft against an 18 ft target rendered a full "100% there" bar.
 *
 * Returns null when:
 *   - current / target / baseline is missing — no journey to measure. Goals
 *     have shown the honest version of this for a while
 *     (FairwayGoalCard "Not started — baseline captured").
 *   - the metric's direction is unknown — see {@link resolveMetricDirection}.
 *   - baseline === target — a zero-length journey; every value is both 0% and
 *     100% of it.
 *   - the target sits on the WRONG side of the baseline for the metric's
 *     direction (e.g. a lower-is-better area whose target is higher than where
 *     it started). That is bad data, not progress, and rendering a bar for it
 *     would be a confident lie of exactly the kind #1242 was.
 */
export function getProgressPercent(
  current: number | null | undefined,
  target: number | null | undefined,
  targetMetric?: string | null,
  baseline?: number | null,
): number | null {
  if (current == null || target == null || baseline == null) return null;

  const direction = resolveMetricDirection(targetMetric);
  if (direction === 'unknown') return null;

  // Reaching the target is 100% regardless of where the journey started —
  // checked BEFORE the span guards below, because a baseline stamped after the
  // player had already passed the target (the driver's self-heal on a
  // pre-existing area) puts the target on the "wrong" side of it. That is a
  // satisfied objective, not bad data, and must not fall through to no-bar.
  const met = direction === 'lower' ? current <= target : current >= target;
  if (met) return 100;

  const span = target - baseline;
  if (span === 0) return null;
  if (direction === 'lower' && span > 0) return null;
  if (direction === 'higher' && span < 0) return null;

  const travelled = current - baseline;
  return Math.max(0, Math.min(100, Math.round((travelled / span) * 100)));
}

