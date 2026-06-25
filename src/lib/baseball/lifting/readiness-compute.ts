// =============================================================================
// src/lib/baseball/lifting/readiness-compute.ts
//
// V11 Premium Lifting — transparent readiness computation (spec L631-638 + V5
// "Readiness Composite"). PURE functions, no DB, no I/O — safe to unit-test.
//
// HONESTY RULES (binding guardrails):
//   * Never a medical claim / diagnosis / injury prediction. Bands are
//     OPERATIONAL ("readiness risk", "reported soreness", "training modification
//     recommended", "review with staff").
//   * Recalibrated for 12-25-player rosters + box-score-only confidence: with
//     sparse inputs the band defaults conservative and confidence is 'low'. We
//     never emit a false "high" (here: never emit 'green' with high confidence
//     off a single stale input).
//   * Every band carries its reasons (each citing an input) + missing/stale
//     inputs so the UI can show why and what to fix.
//
// Bands (spec "Readiness Queue" L141-148):
//   green         -> train as planned
//   yellow        -> monitor
//   orange_lower  -> modify lower body
//   orange_upper  -> modify upper body
//   red           -> hold and review
//   blue          -> return-to-play progression (set by availability, not score)
// =============================================================================

import type { BaseballReadinessBand, BaseballReadinessComputation } from '@/lib/types/baseball-lifting-v11';

export interface ReadinessInputs {
  playerId: string;
  /** YYYY-MM-DD of the check-in; used for staleness vs `today`. */
  checkDate: string | null;
  today: string; // YYYY-MM-DD
  sleepHours: number | null;
  energyLevel: number | null;        // 1 (low) .. 5 (high)
  stressLevel: number | null;        // 1 (low) .. 5 (high)
  sorenessLevel: number | null;      // 1 (none) .. 5 (severe)
  armStatus: 'fresh' | 'normal' | 'tight' | 'sore' | 'pain' | null;
  lowerBodyStatus: number | null;    // 1 (fresh) .. 5 (very sore)
  illnessFlag: boolean;
  /** Highest soreness severity reported on the soreness map (0..10). */
  maxSorenessSeverity: number | null;
  /** Whether any soreness region is upper-body / arm. */
  hasUpperSoreness: boolean;
  /** Whether any soreness region is lower-body. */
  hasLowerSoreness: boolean;
  /** 7-day bodyweight delta in lbs (negative = dropping). */
  bodyweightDelta7d: number | null;
  /** Coach-set availability status, if any — overrides the score. */
  availabilityStatus:
    | 'available' | 'limited' | 'hold' | 'return_to_play' | 'unavailable' | null;
}

const STALE_AFTER_DAYS = 1; // a check-in older than yesterday is stale for "today"

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Compute an operational readiness band. Deterministic; never invents data.
 */
export function computeReadiness(input: ReadinessInputs): BaseballReadinessComputation {
  const reasons: string[] = [];
  const missing: string[] = [];

  // Availability is staff-authored and authoritative — it short-circuits.
  if (input.availabilityStatus === 'unavailable' || input.availabilityStatus === 'hold') {
    return {
      player_id: input.playerId,
      band: 'red',
      reasons: ['staff marked status: ' + input.availabilityStatus],
      missing_inputs: [],
      stale: false,
      confidence: 'high',
      suggested_action: 'Hold and review with staff before training.',
    };
  }
  if (input.availabilityStatus === 'return_to_play') {
    return {
      player_id: input.playerId,
      band: 'blue',
      reasons: ['staff marked return-to-play progression'],
      missing_inputs: [],
      stale: false,
      confidence: 'high',
      suggested_action: 'Follow the return-to-play progression for today.',
    };
  }

  // Staleness / missing-data honesty.
  const stale =
    input.checkDate == null || daysBetween(input.checkDate, input.today) > STALE_AFTER_DAYS;
  if (input.checkDate == null) missing.push('no check-in submitted');
  else if (stale) reasons.push(`check-in is ${daysBetween(input.checkDate, input.today)}d old`);

  if (input.sleepHours == null) missing.push('sleep');
  if (input.energyLevel == null) missing.push('energy');
  if (input.sorenessLevel == null) missing.push('soreness');
  if (input.armStatus == null) missing.push('arm status');

  // ---- Red signals (hold / review) ----------------------------------------
  let red = false;
  if (input.illnessFlag) {
    red = true;
    reasons.push('reported illness');
  }
  if (input.armStatus === 'pain') {
    red = true;
    reasons.push('reported arm pain');
  }
  if (input.maxSorenessSeverity != null && input.maxSorenessSeverity >= 8) {
    red = true;
    reasons.push(`reported soreness ${input.maxSorenessSeverity}/10`);
  }
  if (red) {
    return {
      player_id: input.playerId,
      band: 'red',
      reasons,
      missing_inputs: missing,
      stale,
      confidence: stale ? 'low' : 'moderate',
      suggested_action: 'Review with staff before training; modification recommended.',
    };
  }

  // ---- Orange signals (modify a region) -----------------------------------
  const upperFlag =
    input.armStatus === 'sore' ||
    input.hasUpperSoreness ||
    (input.maxSorenessSeverity != null && input.maxSorenessSeverity >= 6 && input.hasUpperSoreness);
  const lowerFlag =
    (input.lowerBodyStatus != null && input.lowerBodyStatus >= 4) ||
    input.hasLowerSoreness;

  if (upperFlag && !lowerFlag) {
    if (input.armStatus === 'sore') reasons.push('reported arm soreness');
    if (input.hasUpperSoreness) reasons.push('reported upper-body soreness');
    return finalize('orange_upper', 'Modify upper-body work; staff review recommended.');
  }
  if (lowerFlag && !upperFlag) {
    if (input.lowerBodyStatus != null) reasons.push(`lower-body status ${input.lowerBodyStatus}/5`);
    if (input.hasLowerSoreness) reasons.push('reported lower-body soreness');
    return finalize('orange_lower', 'Modify lower-body work; staff review recommended.');
  }
  if (upperFlag && lowerFlag) {
    reasons.push('reported upper- and lower-body soreness');
    return finalize('red', 'Multiple sore regions; review with staff before training.', 'red');
  }

  // ---- Yellow signals (monitor) -------------------------------------------
  let yellow = false;
  if (input.sleepHours != null && input.sleepHours < 6) {
    yellow = true;
    reasons.push(`reported ${input.sleepHours}h sleep`);
  }
  if (input.energyLevel != null && input.energyLevel <= 2) {
    yellow = true;
    reasons.push(`low energy (${input.energyLevel}/5)`);
  }
  if (input.stressLevel != null && input.stressLevel >= 4) {
    yellow = true;
    reasons.push(`high stress (${input.stressLevel}/5)`);
  }
  if (input.sorenessLevel != null && input.sorenessLevel >= 4) {
    yellow = true;
    reasons.push(`general soreness ${input.sorenessLevel}/5`);
  }
  if (input.bodyweightDelta7d != null && input.bodyweightDelta7d <= -3) {
    yellow = true;
    reasons.push(`bodyweight down ${Math.abs(input.bodyweightDelta7d).toFixed(1)} lb / 7d`);
  }
  if (yellow) {
    return finalize('yellow', 'Monitor; train as planned with attention to flagged inputs.');
  }

  // ---- Green (train as planned) -------------------------------------------
  // CONFIDENCE HONESTY: if too much is missing or the data is stale, we do NOT
  // emit a confident green — confidence drops to 'low' and we keep yellow.
  if (missing.length >= 3 || stale) {
    return {
      player_id: input.playerId,
      band: 'yellow',
      reasons: reasons.length ? reasons : ['insufficient recent check-in data'],
      missing_inputs: missing,
      stale,
      confidence: 'low',
      suggested_action: 'Ask the athlete to complete a check-in to confirm readiness.',
    };
  }
  return {
    player_id: input.playerId,
    band: 'green',
    reasons: ['no readiness flags reported'],
    missing_inputs: missing,
    stale: false,
    confidence: missing.length === 0 ? 'high' : 'moderate',
    suggested_action: null,
  };

  function finalize(
    band: BaseballReadinessBand,
    action: string,
    forceBand?: BaseballReadinessBand,
  ): BaseballReadinessComputation {
    return {
      player_id: input.playerId,
      band: forceBand ?? band,
      reasons,
      missing_inputs: missing,
      stale,
      confidence: stale || missing.length >= 3 ? 'low' : 'moderate',
      suggested_action: action,
    };
  }
}

/** Player-safe summary label for a band (never medical). */
export function readinessBandLabel(band: BaseballReadinessBand): string {
  switch (band) {
    case 'green': return 'Train as planned';
    case 'yellow': return 'Monitor';
    case 'orange_lower': return 'Modify lower body';
    case 'orange_upper': return 'Modify upper body';
    case 'red': return 'Hold and review';
    case 'blue': return 'Return-to-play progression';
  }
}

/** Maps a band to a cream/green-palette status tone (no new palette). */
export function readinessBandTone(band: BaseballReadinessBand):
  'success' | 'warning' | 'error' | 'info' {
  switch (band) {
    case 'green': return 'success';
    case 'yellow': return 'warning';
    case 'orange_lower':
    case 'orange_upper': return 'warning';
    case 'red': return 'error';
    case 'blue': return 'info';
  }
}
