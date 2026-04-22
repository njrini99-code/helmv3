/**
 * Shot Sequence Analysis
 *
 * Analyzes how a player's performance on one shot affects their next shot.
 * Measures resilience, compounding errors, and recovery ability.
 *
 * Key metrics:
 * - Resilience score: does the player bounce back after bad shots?
 * - Compounding rate: how often does a bad shot lead to another bad shot?
 * - Recovery rate: how often does a bad shot get followed by a good shot?
 */

import type { ShotData } from './shot-level-sg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SequenceAnalysis {
  resilienceScore: number;    // 1.0 = no effect, <1.0 = compounds, >1.0 = bounces back
  afterBadShot: { avgSG: number; sampleSize: number };
  afterGoodShot: { avgSG: number; sampleSize: number };
  afterNeutralShot: { avgSG: number; sampleSize: number };
  compoundingRate: number;    // % of bad shots followed by another bad shot
  recoveryRate: number;       // % of bad shots followed by good shot
}

export interface CompoundingPattern {
  startHole: number;
  length: number;
  totalSGLost: number;
  triggerShot: string;        // Description of what started the cascade
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const BAD_THRESHOLD = -0.5;
const GOOD_THRESHOLD = 0.5;

type ShotQuality = 'bad' | 'neutral' | 'good';

function classifySG(sg: number): ShotQuality {
  if (sg < BAD_THRESHOLD) return 'bad';
  if (sg > GOOD_THRESHOLD) return 'good';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Resilience score
// ---------------------------------------------------------------------------

/**
 * Calculate a resilience score from a sequence of SG values.
 *
 * Resilience = 1.0 + (avgSG_after_bad - avgSG_overall)
 * - 1.0 means the player performs the same after bad shots (no mental effect)
 * - < 1.0 means performance drops further after bad shots (compounds)
 * - > 1.0 means the player bounces back stronger after bad shots
 *
 * If there are no bad shots or insufficient data, returns 1.0.
 */
export function calculateResilienceScore(sgValues: number[]): number {
  if (sgValues.length < 3) return 1.0;

  const overallAvg = sgValues.reduce((a, b) => a + b, 0) / sgValues.length;
  if (overallAvg === 0) return 1.0;

  const afterBadSG: number[] = [];
  for (let i = 1; i < sgValues.length; i++) {
    const prev = sgValues[i - 1];
    const curr = sgValues[i];
    if (prev === undefined || curr === undefined) continue;
    if (classifySG(prev) === 'bad') {
      afterBadSG.push(curr);
    }
  }

  if (afterBadSG.length === 0) return 1.0;

  const afterBadAvg = afterBadSG.reduce((a, b) => a + b, 0) / afterBadSG.length;

  // Resilience: ratio of after-bad performance to overall average
  // We use a relative comparison: if both are negative, closer to 0 is better
  // Formula: 1 + (afterBadAvg - overallAvg) to normalize around 1.0
  // If afterBad === overall, resilience = 1.0
  // If afterBad is worse (more negative), resilience < 1.0
  // If afterBad is better (less negative), resilience > 1.0
  const resilience = 1.0 + (afterBadAvg - overallAvg);

  // Clamp to reasonable range
  return Math.max(0, Math.min(2.0, resilience));
}

// ---------------------------------------------------------------------------
// Full sequence analysis
// ---------------------------------------------------------------------------

/**
 * Analyze how prior shot quality affects subsequent shot performance.
 *
 * @param shots - Shot data (used for metadata only; order must match sgValues)
 * @param sgValues - Pre-calculated SG value for each shot
 */
export function analyzeSequenceEffects(
  shots: ShotData[],
  sgValues: number[],
): SequenceAnalysis {
  const afterBadSG: number[] = [];
  const afterGoodSG: number[] = [];
  const afterNeutralSG: number[] = [];

  let badFollowedByBad = 0;
  let badFollowedByGood = 0;
  let totalBadShots = 0;

  for (let i = 1; i < sgValues.length; i++) {
    const currShot = shots[i];
    const prevShot = shots[i - 1];
    const prevSG = sgValues[i - 1];
    const currSG = sgValues[i];
    if (!currShot || !prevShot || prevSG === undefined || currSG === undefined) continue;

    // Only consider sequential shots within the same round
    if (currShot.roundId !== prevShot.roundId) continue;

    const prevQuality = classifySG(prevSG);
    const currQuality = classifySG(currSG);

    switch (prevQuality) {
      case 'bad':
        afterBadSG.push(currSG);
        totalBadShots++;
        if (currQuality === 'bad') badFollowedByBad++;
        if (currQuality === 'good') badFollowedByGood++;
        break;
      case 'good':
        afterGoodSG.push(currSG);
        break;
      case 'neutral':
        afterNeutralSG.push(currSG);
        break;
    }
  }

  const avg = (arr: number[]): number =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    resilienceScore: calculateResilienceScore(sgValues),
    afterBadShot: { avgSG: avg(afterBadSG), sampleSize: afterBadSG.length },
    afterGoodShot: { avgSG: avg(afterGoodSG), sampleSize: afterGoodSG.length },
    afterNeutralShot: { avgSG: avg(afterNeutralSG), sampleSize: afterNeutralSG.length },
    compoundingRate: totalBadShots > 0 ? badFollowedByBad / totalBadShots : 0,
    recoveryRate: totalBadShots > 0 ? badFollowedByGood / totalBadShots : 0,
  };
}

// ---------------------------------------------------------------------------
// Compounding pattern detection
// ---------------------------------------------------------------------------

/**
 * Detect sequences of 3+ consecutive bad shots (compounding errors).
 *
 * @param shots - Shot data array
 * @param sgValues - Pre-calculated SG values matching shots array
 * @param threshold - SG threshold for a "bad" shot (default -0.5)
 */
export function detectCompoundingPatterns(
  shots: ShotData[],
  sgValues: number[],
  threshold = BAD_THRESHOLD,
): CompoundingPattern[] {
  const patterns: CompoundingPattern[] = [];

  let streakStart = -1;
  let streakSGLost = 0;
  let streakLength = 0;

  for (let i = 0; i < sgValues.length; i++) {
    const currSG = sgValues[i];
    const currShot = shots[i];
    if (currSG === undefined || !currShot) continue;

    const isBad = currSG < threshold;

    // Break streak if different round
    const prevShot = i > 0 ? shots[i - 1] : undefined;
    const prevSG = i > 0 ? sgValues[i - 1] : undefined;
    const sameRound = i === 0 || (prevShot !== undefined && currShot.roundId === prevShot.roundId);
    const prevIsBad = prevSG !== undefined && prevSG < threshold;

    if (isBad && sameRound && (streakStart !== -1 || i === 0 || prevIsBad)) {
      if (streakStart === -1) {
        // Start of a new potential streak — look back to find the actual start
        streakStart = i > 0 && prevIsBad ? i - 1 : i;
        streakSGLost = i > 0 && prevIsBad && prevSG !== undefined
          ? prevSG + currSG
          : currSG;
        streakLength = i > 0 && prevIsBad ? 2 : 1;
      } else {
        streakLength++;
        streakSGLost += currSG;
      }
    } else {
      // End of streak — record if long enough
      if (streakLength >= 3) {
        const triggerShot = shots[streakStart];
        if (triggerShot) {
          const triggerDesc =
            `Hole ${triggerShot.holeNumber}, shot ${triggerShot.shotNumber}: ` +
            `${triggerShot.lieBefore} at ${triggerShot.distanceBefore}y` +
            (triggerShot.club ? ` (${triggerShot.club})` : '');

          patterns.push({
            startHole: triggerShot.holeNumber,
            length: streakLength,
            totalSGLost: streakSGLost,
            triggerShot: triggerDesc,
          });
        }
      }
      streakStart = -1;
      streakSGLost = 0;
      streakLength = 0;
    }
  }

  // Handle streak that extends to end of data
  if (streakLength >= 3) {
    const triggerShot = shots[streakStart];
    if (triggerShot) {
      const triggerDesc =
        `Hole ${triggerShot.holeNumber}, shot ${triggerShot.shotNumber}: ` +
        `${triggerShot.lieBefore} at ${triggerShot.distanceBefore}y` +
        (triggerShot.club ? ` (${triggerShot.club})` : '');

      patterns.push({
        startHole: triggerShot.holeNumber,
        length: streakLength,
        totalSGLost: streakSGLost,
        triggerShot: triggerDesc,
      });
    }
  }

  // Sort by total SG lost (most damaging first)
  patterns.sort((a, b) => a.totalSGLost - b.totalSGLost);

  return patterns;
}
