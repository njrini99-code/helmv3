/**
 * CoachHelm shared engine — sport-agnostic generator helpers (W10.1).
 *
 * PURE RE-HOME. The golf v3 `BaseGenerator` (`@/lib/coachhelm/v3/engine/
 * generator-base.ts`) mixes two things:
 *
 *   1. Golf-DB-coupled orchestration (loadStandingForMetric, computeCounterfactual,
 *      upsertInsightV3, golf_coach_insights retraction) — these STAY in golf;
 *      they read/write golf tables and import golf counterfactual/standing types.
 *   2. SPORT-AGNOSTIC decisions — confidence measurement, the priority
 *      confidence-honesty gate, the matured-row retraction window, the
 *      per-event dispersion signal contract, and the plain-language confidence
 *      reason. NONE of these touch a golf table or a golf-only type.
 *
 * This file is the new home for category (2). BaseballHelm (Wave 10) imports
 * these directly so its generators reuse the EXACT confidence/lifecycle/window
 * honesty logic — the wave plan's highest-risk item is that a forked engine
 * would "learn backward". One implementation, two sports.
 *
 * SAFETY CONTRACT (golf must not break): the golf `generator-base.ts` keeps its
 * own `BaseGenerator` class plus its golf-specific pure helpers
 * (`backfilledStrokesImpact`, `leveragePriorityFloor`, `buildDiagnosis` — all of
 * which reference golf counterfactual/standing/`golf_player_stats_cache`) and
 * RE-EXPORTS the three sport-agnostic helpers below so every existing golf
 * import (`computeMeasuredFactors`, `buildConfidenceReason`,
 * `enforcePriorityConfidenceGate`, `MIN_CONF_FOR_HIGH`,
 * `MATURED_RETRACT_AFTER_DAYS`, `DispersionSignals`) keeps resolving from the
 * golf path UNCHANGED. The integration agent later rewires golf to consume
 * these re-exports; this packet only ADDS the shared home + re-exports.
 */

import type {
  InsightConfidenceFactors,
  InsightPriority,
} from '@/lib/coachhelm/shared/evidence-types';

/**
 * DC-CONF-2 threshold: a written 'high'/'urgent' priority requires at least
 * this confidence, regardless of which path produced it. Sport-agnostic — a
 * thin-sample baseball leak must clear the same bar a golf one does.
 */
export const MIN_CONF_FOR_HIGH = 0.5;

/**
 * Matured rows are archived only after going un-refreshed this many days
 * (regrade LIFE-P2). Matured carries movement history, so retraction waits for
 * this many consecutive non-emitting daily runs rather than firing immediately
 * like tentative/detected. Sport-agnostic lifecycle constant.
 */
export const MATURED_RETRACT_AFTER_DAYS = 7;

/**
 * Optional per-event dispersion an aggregate may expose so the base can compute
 * a GENUINE recency/variance instead of placeholders. Both fields are
 * duck-typed (a generator opts in by returning either) — absent → honest
 * sample-adequacy. Nothing is fabricated. Sport-agnostic: golf uses per-ROUND
 * dispersion + round dates; baseball uses per-GAME (or per-session) dispersion
 * + game dates. The field names stay generic on purpose.
 */
export interface DispersionSignals {
  /** Per-event stddev of the metric in the SAME unit as `playerValue`. */
  stddev?: number;
  /** Scale for the stddev → variance-confidence map (default 20). A spread
   *  ≥ scale reads as "high variance" (0); 0 spread reads as "tight" (1). */
  stddev_scale?: number;
  /** ISO event dates contributing to the aggregate (any order). */
  round_dates?: string[];
}

const clamp01 = (n: number): number =>
  !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n;

/**
 * Compute genuinely-measured recency + variance from per-event dispersion an
 * aggregate exposes (SV-1). Returns `null` unless BOTH a real per-event stddev
 * AND ≥1 parseable event date are present — only then can the full
 * `factors_measured: true` blend be claimed without fabricating either term.
 * When null, the caller keeps the generator's placeholder factors flagged
 * unmeasured, and calcConfidence surfaces honest sample-adequacy. Pure.
 *
 * - variance: `clamp01(1 - stddev / scale)` — smaller spread → higher confidence.
 * - recency: fraction of contributing events inside the freshness half-window
 *   (`windowDays / 2`).
 */
export function computeMeasuredFactors(
  signals: DispersionSignals | undefined,
  windowDays: number,
  now: number = Date.now(),
): { recency: number; variance: number; factors_measured: true } | null {
  if (!signals) return null;
  if (!Number.isFinite(signals.stddev)) return null;
  const dates = (signals.round_dates ?? []).filter((d) => Number.isFinite(Date.parse(d)));
  if (dates.length === 0) return null;

  // Variance: smaller spread → higher confidence (default 20-unit scale).
  const scale = signals.stddev_scale && signals.stddev_scale > 0 ? signals.stddev_scale : 20;
  const variance = clamp01(1 - (signals.stddev as number) / scale);

  // Recency: share of events within the freshness half-window.
  const halfWindowMs = (Math.max(1, windowDays) / 2) * 86400_000;
  const fresh = dates.filter((d) => now - Date.parse(d) <= halfWindowMs).length;
  const recency = clamp01(fresh / dates.length);

  return { recency, variance, factors_measured: true };
}

/**
 * Write-side priority honesty gate (DC-CONF-2 closure, regrade VAL-P1): every
 * written priority must clear the confidence bar regardless of which path
 * produced it. Below MIN_CONF_FOR_HIGH a row can be at most 'medium'. Pure +
 * sport-agnostic.
 */
export function enforcePriorityConfidenceGate(
  priority: InsightPriority | undefined,
  confidence: number,
): InsightPriority | undefined {
  if (!priority) return priority;
  if ((priority === 'high' || priority === 'urgent') && confidence < MIN_CONF_FOR_HIGH) {
    return 'medium';
  }
  return priority;
}

/**
 * Plain-language confidence reason from the confidence factors (P0-05). Lets a
 * downstream surface explain WHY a number is trusted (or not) without re-running
 * the blend. Pure + sport-agnostic — reads only the shared confidence factors
 * and the observation count.
 */
export function buildConfidenceReason(evidence: {
  sample_n: number;
  confidence_factors: InsightConfidenceFactors;
}): string {
  const f = evidence.confidence_factors;
  const parts: string[] = [`${evidence.sample_n} observations`];
  if (f.factors_measured === true) {
    parts.push(`recency measured ${f.recency.toFixed(2)}`);
    parts.push(`variance measured ${f.variance.toFixed(2)}`);
  } else if (f.factors_measured === false) {
    parts.push('recency/variance not measured (sample-adequacy only)');
  }
  parts.push(
    f.sample_adequacy >= 1
      ? 'sample adequate'
      : `sample ${(f.sample_adequacy * 100).toFixed(0)}% of target`,
  );
  return parts.join('; ');
}
