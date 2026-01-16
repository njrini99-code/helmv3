// ============================================================================
// STROKES GAINED CALCULATOR (V1 - DEPRECATED)
// ============================================================================
//
// @deprecated This is the V1 strokes gained calculator. Use V2 instead.
//
// For V2 usage, the strokes gained analysis is now integrated into the
// pattern mining and feature extraction systems:
//   import { extractAllFeatures } from '@/lib/coachhelm/v2';
//   const features = await extractAllFeatures(playerId);
//
// V2 provides shot-level pattern analysis with:
//   - Distance range grouping
//   - Miss tendency analysis
//   - Dispersion pattern detection
//   - Statistically validated insights
//
// This file is kept for backwards compatibility during migration.
// It will be removed in a future release.
//
// ============================================================================

import { StrokesGainedBreakdown } from './types';

interface GolfHole {
  par?: number | null;
  fairway_hit?: boolean | null;
  gir?: boolean | null;
  up_and_down_made?: boolean | null;
  up_and_down_attempt?: boolean | null;
  putts?: number | null;
}

/**
 * Calculate strokes gained breakdown from shots and holes data.
 * This is a simplified calculation - a full implementation would use
 * PGA Tour benchmark data for expected strokes from various positions.
 */
export function calculateStrokesGained(
  _shots: unknown[],
  holes: GolfHole[]
): StrokesGainedBreakdown {
  // Default to neutral if no data
  if (!holes || holes.length === 0) {
    return {
      total: 0,
      tee: 0,
      approach: 0,
      aroundGreen: 0,
      putting: 0,
    };
  }

  let teeSG = 0;
  let approachSG = 0;
  let aroundGreenSG = 0;
  let puttingSG = 0;

  // Simplified SG calculation based on hole-level data
  holes.forEach((hole: GolfHole) => {
    const par = hole.par || 4;

    // Tee shot (par 4s and 5s)
    if (par >= 4) {
      if (hole.fairway_hit) {
        teeSG += 0.2; // Hitting fairway is slightly positive
      } else if (hole.fairway_hit === false) {
        teeSG -= 0.2; // Missing fairway is slightly negative
      }
    }

    // Approach (GIR)
    if (hole.gir) {
      approachSG += 0.3; // GIR is positive
    } else if (hole.gir === false) {
      approachSG -= 0.2; // Missing green is negative
    }

    // Around the green (scrambling attempts)
    if (!hole.gir) {
      if (hole.up_and_down_made) {
        aroundGreenSG += 0.5; // Successful up-and-down
      } else if (hole.up_and_down_attempt && !hole.up_and_down_made) {
        aroundGreenSG -= 0.3; // Failed up-and-down
      }
    }

    // Putting
    const putts = hole.putts || 2;
    if (hole.gir) {
      // On GIR, expected is 2 putts
      puttingSG += (2 - putts) * 0.5;
    } else {
      // Off green, factor in the chip/pitch
      if (putts === 1) {
        puttingSG += 0.4; // One-putt is good
      } else if (putts >= 3) {
        puttingSG -= (putts - 2) * 0.5; // Three-putt is bad
      }
    }
  });

  // Normalize to per-round scale
  const numHoles = holes.length;
  const scale = 18 / numHoles;

  const result: StrokesGainedBreakdown = {
    tee: Number((teeSG * scale).toFixed(2)),
    approach: Number((approachSG * scale).toFixed(2)),
    aroundGreen: Number((aroundGreenSG * scale).toFixed(2)),
    putting: Number((puttingSG * scale).toFixed(2)),
    total: 0,
  };

  result.total = Number((result.tee + result.approach + result.aroundGreen + result.putting).toFixed(2));

  return result;
}
