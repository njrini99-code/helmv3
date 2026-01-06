import { AreaToReview, RoundStats } from './types';

export function detectAreasToReview(
  round: any,
  _roundStats: RoundStats,
  _playerAverages: RoundStats
): AreaToReview[] {
  const areas: AreaToReview[] = [];
  const holes = round.holes || [];

  // 1. Find three-putts
  holes.forEach((hole: any) => {
    if ((hole.putts || 0) >= 3) {
      areas.push({
        id: `three-putt-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'three_putt',
        title: `Three-Putt on Hole ${hole.hole_number}`,
        description: `${hole.putts} putts on the ${hole.par === 3 ? 'par 3' : `par ${hole.par}`}`,
        rootCause: analyzeThreePuttCause(hole),
        pattern: 'putting_lag',
        linkedFocusArea: 'putting_lag',
        severity: hole.putts >= 4 ? 'high' : 'medium',
      });
    }
  });

  // 2. Find double bogeys or worse
  holes.forEach((hole: any) => {
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
  holes.forEach((hole: any) => {
    if ((hole.penalty_strokes || 0) > 0) {
      // Don't duplicate
      if (areas.some(a => a.holeNumber === hole.hole_number)) return;

      areas.push({
        id: `penalty-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'penalty',
        title: `Penalty on Hole ${hole.hole_number}`,
        description: `Took ${hole.penalty_strokes} penalty stroke${hole.penalty_strokes > 1 ? 's' : ''}`,
        rootCause: 'Course management or execution error',
        pattern: null,
        linkedFocusArea: 'course_management',
        severity: hole.penalty_strokes >= 2 ? 'high' : 'medium',
      });
    }
  });

  // 4. Find failed up-and-downs that led to bogey+
  holes.forEach((hole: any) => {
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

function analyzeThreePuttCause(hole: any): string {
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

function analyzeDoubleCause(hole: any): string {
  if (hole.penalty_strokes > 0) {
    return `Penalty stroke(s) contributed to the big number`;
  }
  if ((hole.putts || 0) >= 3) {
    return `Three-putt added strokes`;
  }
  if (!hole.fairway_hit && hole.par >= 4) {
    return `Missed fairway led to difficult recovery`;
  }
  if (!hole.gir) {
    return `Missed green and couldn't save par`;
  }
  return 'Multiple small mistakes compounded';
}
