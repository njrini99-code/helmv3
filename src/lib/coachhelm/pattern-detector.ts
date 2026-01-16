// ============================================================================
// PATTERN DETECTOR (V1 - DEPRECATED)
// ============================================================================
//
// @deprecated This is the V1 pattern detector. Use V2 instead.
//
// For V2 usage, import from '@/lib/coachhelm/v2':
//   import { PatternMiner } from '@/lib/coachhelm/v2';
//   const miner = new PatternMiner(playerId);
//   const patterns = await miner.minePatterns();
//
// V2 provides:
//   - Statistical pattern mining with confidence intervals
//   - Support, confidence, lift metrics
//   - Actionability scoring
//   - Pattern trend tracking
//
// This file is kept for backwards compatibility during migration.
// It will be removed in a future release.
//
// ============================================================================

import { Pattern } from './types';

interface GolfHole {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts?: number | null;
}

interface RoundWithHoles {
  holes?: GolfHole[] | null;
}

interface PatternDetectionResult {
  newPatterns: Pattern[];
  recurringPatterns: Pattern[];
}

export function detectPatterns(
  currentRound: RoundWithHoles,
  previousRounds: RoundWithHoles[]
): PatternDetectionResult {
  const newPatterns: Pattern[] = [];
  const recurringPatterns: Pattern[] = [];

  const currentHoles = currentRound.holes || [];

  // Analyze three-putt patterns
  const threePutts = currentHoles.filter((h: GolfHole) => (h.putts || 0) >= 3);
  if (threePutts.length >= 2) {
    // Check if this is a recurring pattern
    const previousThreePuttRounds = previousRounds.filter(r => {
      const holes = r.holes || [];
      const tp = holes.filter((h: GolfHole) => (h.putts || 0) >= 3);
      return tp.length >= 2;
    });

    const frequency = previousThreePuttRounds.length / Math.max(previousRounds.length, 1);

    if (frequency >= 0.3) {
      recurringPatterns.push({
        id: 'three-putt-pattern',
        type: 'three_putt_trigger',
        title: 'Multiple Three-Putts',
        description: 'Tendency to three-putt multiple times per round',
        frequency,
        impactStrokes: threePutts.length * 1.0,
        evidence: threePutts.map((h: GolfHole) => `Hole ${h.hole_number}: ${h.putts} putts`),
        isNew: false,
      });
    } else if (previousRounds.length >= 3) {
      newPatterns.push({
        id: 'three-putt-pattern-new',
        type: 'three_putt_trigger',
        title: 'Multiple Three-Putts',
        description: 'New pattern: multiple three-putts in a single round',
        frequency: 0,
        impactStrokes: threePutts.length * 1.0,
        evidence: threePutts.map((h: GolfHole) => `Hole ${h.hole_number}: ${h.putts} putts`),
        isNew: true,
      });
    }
  }

  // Analyze back nine struggles
  const backNineHoles = currentHoles.slice(9, 18);
  const frontNineHoles = currentHoles.slice(0, 9);

  const backNineScore = backNineHoles.reduce((sum: number, h: GolfHole) => sum + ((h.score || 0) - (h.par || 4)), 0);
  const frontNineScore = frontNineHoles.reduce((sum: number, h: GolfHole) => sum + ((h.score || 0) - (h.par || 4)), 0);

  if (backNineScore - frontNineScore >= 3) {
    // Check if this is recurring
    const previousBackNineStruggles = previousRounds.filter(r => {
      const holes = r.holes || [];
      const back = holes.slice(9, 18);
      const front = holes.slice(0, 9);
      const backTotal = back.reduce((sum: number, h: GolfHole) => sum + ((h.score || 0) - (h.par || 4)), 0);
      const frontTotal = front.reduce((sum: number, h: GolfHole) => sum + ((h.score || 0) - (h.par || 4)), 0);
      return backTotal - frontTotal >= 3;
    });

    const frequency = previousBackNineStruggles.length / Math.max(previousRounds.length, 1);

    if (frequency >= 0.25) {
      recurringPatterns.push({
        id: 'back-nine-pressure',
        type: 'pressure',
        title: 'Back Nine Struggles',
        description: 'Tendency to score higher on the back nine',
        frequency,
        impactStrokes: backNineScore - frontNineScore,
        evidence: [`Back nine: +${backNineScore}, Front nine: +${frontNineScore}`],
        isNew: false,
      });
    }
  }

  // Analyze par 3 struggles
  const par3s = currentHoles.filter((h: GolfHole) => h.par === 3);
  const par3OverPar = par3s.filter((h: GolfHole) => (h.score || 0) > (h.par || 3)).length;

  if (par3OverPar >= 3) {
    const previousPar3Struggles = previousRounds.filter(r => {
      const holes = r.holes || [];
      const p3 = holes.filter((h: GolfHole) => h.par === 3);
      const overPar = p3.filter((h: GolfHole) => (h.score || 0) > (h.par || 3)).length;
      return overPar >= 3;
    });

    const frequency = previousPar3Struggles.length / Math.max(previousRounds.length, 1);

    if (frequency >= 0.3) {
      recurringPatterns.push({
        id: 'par-3-issues',
        type: 'hole_type',
        title: 'Par 3 Scoring',
        description: 'Struggling on par 3 holes',
        frequency,
        impactStrokes: par3OverPar * 0.5,
        evidence: par3s
          .filter((h: GolfHole) => (h.score || 0) > (h.par || 3))
          .map((h: GolfHole) => `Hole ${h.hole_number}: ${h.score} on par 3`),
        isNew: false,
      });
    }
  }

  return { newPatterns, recurringPatterns };
}
