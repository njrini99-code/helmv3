/**
 * ============================================================================
 * CoachHelm · focus areas — metric direction + the write-time target guard
 * ----------------------------------------------------------------------------
 * `resolveMetricDirection` / `isLowerIsBetter` / `LOWER_IS_BETTER_KEYWORDS`
 * were lifted here VERBATIM from
 * `src/components/fairway/pages/coachhelm/areaTypes.ts`, which re-exports them
 * so every existing import keeps working. They only ever depended on two lib
 * modules (the v3 metric registry and the focus-area catalog), but living in a
 * component file made them unreachable from a server action without dragging
 * the whole React icon barrel across the boundary — and #1266 needs exactly
 * that reach.
 *
 * #1266 — why the guard has to be here rather than at display time.
 * `getProgressPercent` returns 100 as soon as the target is met, deliberately
 * and BEFORE its span guards, because a baseline stamped after the player had
 * already passed the target (the driver's self-heal on a pre-existing area) is
 * a satisfied objective, not bad data. That makes the two cases numerically
 * identical after the fact — both are `baseline > target` on a higher-is-
 * better metric:
 *
 *     self-heal (legitimate)   baseline 86 → target 80, current 86 → 100% ✓
 *     mistyped target (bad)    baseline 82 → target 66, current 86 → 100% ✗
 *
 * At WRITE time the ambiguity does not exist yet: the target is being compared
 * against the baseline the coach or player is looking at right now, so
 * "does this target represent an improvement?" is answerable exactly once.
 * ========================================================================== */

import { findMetric } from './catalog';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';

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
 *      direction; `getProgressPercent` returns null so no bar renders.
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
 * is better), even though the string contains "putt".
 */
export function isLowerIsBetter(targetMetric: string | null | undefined): boolean {
  return resolveMetricDirection(targetMetric) === 'lower';
}

/**
 * #1266 — reject a target that asks the player to move the WRONG way.
 *
 * Returns a human-readable reason when the target contradicts the metric's
 * resolved direction, or `null` when the target is acceptable. Deliberately
 * permissive in three cases, each for a stated reason:
 *
 *   • `direction === 'unknown'` — no safe judgement to make, consistent with
 *     how `getProgressPercent` already treats unknown (it renders no bar
 *     rather than guessing). Blocking here would forbid custom metrics.
 *   • either value missing — a focus area is allowed to exist with no target
 *     yet; that is a different (and legitimate) state.
 *   • `target === baseline` — a "hold the line" objective is a real coaching
 *     intent, not a typo. Only a target strictly on the wrong side is refused.
 *
 * `metricLabel` is only used to phrase the message.
 */
export function describeWrongWayTarget(args: {
  targetMetric: string | null | undefined;
  baselineValue: number | null | undefined;
  targetValue: number | null | undefined;
  metricLabel?: string | null;
}): string | null {
  const { targetMetric, baselineValue, targetValue } = args;

  if (baselineValue === null || baselineValue === undefined) return null;
  if (targetValue === null || targetValue === undefined) return null;
  if (!Number.isFinite(baselineValue) || !Number.isFinite(targetValue)) return null;

  const direction = resolveMetricDirection(targetMetric);
  if (direction === 'unknown') return null;

  const label = args.metricLabel?.trim() || targetMetric || 'This metric';

  if (direction === 'higher' && targetValue < baselineValue) {
    return `${label} is better when higher, so a target of ${targetValue} is below the current ${baselineValue}. Set a target above ${baselineValue}.`;
  }
  if (direction === 'lower' && targetValue > baselineValue) {
    return `${label} is better when lower, so a target of ${targetValue} is above the current ${baselineValue}. Set a target below ${baselineValue}.`;
  }
  return null;
}
