// ============================================================================
// AREA DETECTOR (V1 - DEPRECATED)
// ============================================================================
//
// @deprecated This is the V1 area-to-review detector. Use V2 instead.
//
// For V2 usage, import from '@/lib/coachhelm/v2':
//   import { coachHelmIntelligence } from '@/lib/coachhelm/v2';
//   const analysis = await coachHelmIntelligence.analyzePlayer(playerId);
//   // Focus areas now come from pattern mining and causal analysis
//
// V2 provides statistically-validated patterns with actionable insights,
// rather than simple rule-based area detection.
//
// This file is kept for backwards compatibility during migration.
// It will be removed in a future release.
//
// ============================================================================

import { AreaToReview, RoundStats } from './types';

interface GolfHole {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts?: number | null;
  penalty_strokes?: number | null;
  gir?: boolean | null;
  fairway_hit?: boolean | null;
  up_and_down_attempt?: boolean | null;
  up_and_down_made?: boolean | null;
  first_putt_distance?: number | null;
  first_putt_leave?: number | null;
}

interface RoundWithHoles {
  holes?: GolfHole[] | null;
}

export function detectAreasToReview(
  round: RoundWithHoles,
   
  _roundStats: RoundStats,
   
  _playerAverages: RoundStats
): AreaToReview[] {
  const areas: AreaToReview[] = [];
  const holes = round.holes || [];

  // 1. Find three-putts
  holes.forEach((hole: GolfHole) => {
    const putts = hole.putts ?? 0;
    if (putts >= 3) {
      areas.push({
        id: `three-putt-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'three_putt',
        title: `Three-Putt on Hole ${hole.hole_number}`,
        description: `${putts} putts on the ${hole.par === 3 ? 'par 3' : `par ${hole.par}`}`,
        rootCause: analyzeThreePuttCause(hole),
        pattern: 'putting_lag',
        linkedFocusArea: 'putting_lag',
        severity: putts >= 4 ? 'high' : 'medium',
      });
    }
  });

  // 2. Find double bogeys or worse
  holes.forEach((hole: GolfHole) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);
    if (scoreDiff >= 2) {
      // Don't duplicate if already have a three-putt for this hole
      if (areas.some(a => a.holeNumber === hole.hole_number && a.type === 'three_putt')) {
        return;
      }

      areas.push({
        id: `double-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'double_bogey_plus',
        title: `${scoreDiff === 2 ? 'Double Bogey' : `+${scoreDiff}`} on Hole ${hole.hole_number}`,
        description: `Made ${hole.score} on the par ${hole.par}`,
        rootCause: analyzeDoubleCause(hole),
        pattern: null,
        linkedFocusArea: null,
        severity: scoreDiff >= 3 ? 'high' : 'medium',
      });
    }
  });

  // 3. Find penalties
  holes.forEach((hole: GolfHole) => {
    const penaltyStrokes = hole.penalty_strokes ?? 0;
    if (penaltyStrokes > 0) {
      // Don't duplicate
      if (areas.some(a => a.holeNumber === hole.hole_number)) return;

      areas.push({
        id: `penalty-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'penalty',
        title: `Penalty on Hole ${hole.hole_number}`,
        description: `Took ${penaltyStrokes} penalty stroke${penaltyStrokes > 1 ? 's' : ''}`,
        rootCause: 'Course management or execution error',
        pattern: null,
        linkedFocusArea: 'course_management',
        severity: penaltyStrokes >= 2 ? 'high' : 'medium',
      });
    }
  });

  // 4. Find failed up-and-downs that led to bogey+
  holes.forEach((hole: GolfHole) => {
    if (!hole.gir && hole.up_and_down_attempt && !hole.up_and_down_made) {
      const scoreDiff = (hole.score || 0) - (hole.par || 4);
      if (scoreDiff >= 1) {
        // Don't duplicate
        if (areas.some(a => a.holeNumber === hole.hole_number)) return;

        areas.push({
          id: `failed-updown-${hole.hole_number}`,
          holeNumber: hole.hole_number,
          type: 'failed_up_and_down',
          title: `Missed Up-and-Down on Hole ${hole.hole_number}`,
          description: `Missed green and couldn't get up-and-down for par`,
          rootCause: 'Short game or putting execution',
          pattern: 'scrambling',
          linkedFocusArea: 'short_game',
          severity: 'low',
        });
      }
    }
  });

  // Sort by severity, limit to top 3
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return areas
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

function analyzeThreePuttCause(hole: GolfHole): string {
  // If we have first putt distance data
  if (hole.first_putt_distance) {
    if (hole.first_putt_distance > 30) {
      return `Long lag putt from ${hole.first_putt_distance} feet left too much work`;
    } else if (hole.first_putt_leave && hole.first_putt_leave > 5) {
      return `First putt left ${hole.first_putt_leave} feet remaining`;
    }
  }
  return 'Lag putt distance control or short putt miss';
}

function analyzeDoubleCause(hole: GolfHole): string {
  const penaltyStrokes = hole.penalty_strokes ?? 0;
  if (penaltyStrokes > 0) {
    return `Penalty stroke(s) contributed to the big number`;
  }
  if ((hole.putts ?? 0) >= 3) {
    return `Three-putt added strokes`;
  }
  if (!hole.fairway_hit && (hole.par ?? 0) >= 4) {
    return `Missed fairway led to a tough approach`;
  }
  if (!hole.gir) {
    return `Missed green and couldn't save par`;
  }
  return 'Multiple small mistakes compounded';
}
