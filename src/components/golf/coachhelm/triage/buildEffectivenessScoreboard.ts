/**
 * ============================================================================
 * buildEffectivenessScoreboard — pure adapter for the Triage Desk's compact
 * Effectiveness scoreboard (Triage Desk spec §4)
 * ----------------------------------------------------------------------------
 * Plain functions of their inputs (no React, no Supabase) so the adoption
 * ring, the top-3 working/not-working lists, and the calibration line are
 * unit-testable without mounting anything. Reads the SAME
 * `InsightEffectivenessData` / `PredictionPerformanceData` shapes
 * `coachhelm-analytics.ts` already produces for the retired 1,800-line
 * cockpit — no new server action, no re-derived scoring.
 * ========================================================================== */

import type {
  InsightEffectivenessData,
  InsightTypeMetrics,
  PredictionPerformanceData,
} from '@/app/golf/actions/coachhelm-analytics';

/* ───────────────────────────────────────────────────────────────────────────
 * Adoption — the RingGauge's fraction + the "N of M acted on" caption.
 * ────────────────────────────────────────────────────────────────────────── */

export interface AdoptionSummary {
  /** False when no insights have generated in the window — an honest
   *  awaiting state, never a fabricated 0%. */
  live: boolean;
  /** 0–100, RingGauge's expected scale. */
  pct: number;
  actedUpon: number;
  generated: number;
}

export function summarizeAdoption(effectiveness: InsightEffectivenessData | undefined): AdoptionSummary {
  const generated = effectiveness?.overall.totalGenerated ?? 0;
  const actedUpon = effectiveness?.overall.totalActedUpon ?? 0;
  return {
    live: generated > 0,
    pct: generated > 0 ? Math.round((actedUpon / generated) * 100) : 0,
    actedUpon,
    generated,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Working / not working — top-3 insight types by effectivenessScore.
 * ────────────────────────────────────────────────────────────────────────── */

export interface RankedInsightType {
  insightType: string;
  effectivenessScore: number;
  outcomesImproved: number;
  insightsWithOutcome: number;
}

/** Top-N insight types by `effectivenessScore`, best or worst first. Only
 *  types with at least one recorded outcome qualify — an untested type is
 *  neither "working" nor "not working", it's unmeasured, so it's excluded
 *  rather than padding a list with a fabricated rank. */
export function topInsightTypes(
  byType: readonly InsightTypeMetrics[] | undefined,
  direction: 'best' | 'worst',
  limit = 3,
): RankedInsightType[] {
  const measured = (byType ?? []).filter((m) => m.insightsWithOutcome > 0);
  const sorted = [...measured].sort((a, b) =>
    direction === 'best'
      ? b.effectivenessScore - a.effectivenessScore
      : a.effectivenessScore - b.effectivenessScore,
  );
  return sorted.slice(0, limit).map((m) => ({
    insightType: m.insightType,
    effectivenessScore: m.effectivenessScore,
    outcomesImproved: m.outcomesImproved,
    insightsWithOutcome: m.insightsWithOutcome,
  }));
}

/* ───────────────────────────────────────────────────────────────────────────
 * Calibration line — one honest sentence, gated on a minimum validated
 * sample (mirrors the cockpit's own `BUCKET_MIN_RESOLVED`-style honesty
 * gate) so a 1-for-1 sample never reads as an authoritative "perfectly
 * calibrated" line.
 * ────────────────────────────────────────────────────────────────────────── */

export type CalibrationTone = 'positive' | 'warning' | 'neutral';

export interface CalibrationSummary {
  live: boolean;
  label: string;
  tone: CalibrationTone;
}

const CALIBRATION_MIN_VALIDATED = 5;
/** Rate-gap floor before calling a lean "over"/"under" confident rather than
 *  "well matched" — avoids flip-flopping the verdict on noise near parity. */
const CALIBRATION_LEAN_GAP = 0.1;

export function summarizeCalibration(performance: PredictionPerformanceData | undefined): CalibrationSummary {
  const validated = performance?.summary.validatedPredictions ?? 0;
  if (!performance || validated < CALIBRATION_MIN_VALIDATED) {
    return {
      live: false,
      label: `Calibration — awaiting validated predictions (${validated} of ${CALIBRATION_MIN_VALIDATED} needed).`,
      tone: 'neutral',
    };
  }
  const { calibrationScore, overconfidenceRate, underconfidenceRate } = performance.summary;
  const scorePct = Math.round(calibrationScore * 100);
  if (overconfidenceRate > underconfidenceRate + CALIBRATION_LEAN_GAP) {
    return { live: true, label: `Calibration ${scorePct}% — trends overconfident.`, tone: 'warning' };
  }
  if (underconfidenceRate > overconfidenceRate + CALIBRATION_LEAN_GAP) {
    return { live: true, label: `Calibration ${scorePct}% — trends underconfident.`, tone: 'warning' };
  }
  return { live: true, label: `Calibration ${scorePct}% — well matched to actual outcomes.`, tone: 'positive' };
}
