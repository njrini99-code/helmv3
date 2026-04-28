/**
 * Sequence Feature Extraction
 *
 * Analyzes hole-to-hole patterns including:
 * - Follow-up patterns (what happens after birdies/bogeys)
 * - Streak analysis (birdie/bogey runs)
 * - Front nine vs back nine performance
 * - Problem holes and collapse patterns
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { SequenceFeatures } from '../types';

interface HoleData {
  hole_number: number;
  score: number | null;
  par: number;
  round_id: string;
}

function getScoreToPar(hole: HoleData): number {
  if (hole.score === null) return 0;
  return hole.score - hole.par;
}

/**
 * Extracts sequence features for a player
 *
 * @param playerId - The player's UUID
 * @returns Sequence features or null if insufficient data
 */
export async function extractSequenceFeatures(
  playerId: string
): Promise<SequenceFeatures | null> {
  // Admin client — analyzePlayer runs in cookie-less cron / fire-and-forget
  // contexts where RLS would block every read. See V1/A2 audit notes.
  const supabase = createAdminClient();

  // Get recent rounds with hole data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', ninetyDaysAgo.toISOString())
    .order('round_date', { ascending: false })
    .limit(20);

  if (roundsError || !rounds || rounds.length < 3) {
    return null;
  }

  const roundIds = rounds.map((r) => r.id);

  // Get hole data for these rounds
  const { data: holes, error: holesError } = await supabase
    .from('golf_holes')
    .select('hole_number, score, par, round_id')
    .in('round_id', roundIds)
    .order('round_id')
    .order('hole_number');

  if (holesError || !holes || holes.length < 36) {
    return null;
  }

  // Group holes by round
  const roundHoles = new Map<string, HoleData[]>();
  for (const hole of holes) {
    if (!roundHoles.has(hole.round_id)) {
      roundHoles.set(hole.round_id, []);
    }
    roundHoles.get(hole.round_id)!.push(hole);
  }

  // Analyze follow-up patterns
  const followUpStats = analyzeFollowUpPatterns(roundHoles);

  // Analyze streaks
  const streakStats = analyzeStreaks(roundHoles);

  // Analyze front vs back nine
  const nineStats = analyzeNines(roundHoles);

  // Find typical collapse hole
  const collapseStats = analyzeCollapsePatterns(roundHoles);

  return {
    // Follow-up patterns
    birdieFollowUpPar: followUpStats.birdieFollowUpPar,
    birdieFollowUpBirdie: followUpStats.birdieFollowUpBirdie,
    birdieFollowUpBogey: followUpStats.birdieFollowUpBogey,
    bogeyFollowUpPar: followUpStats.bogeyFollowUpPar,
    bogeyFollowUpBirdie: followUpStats.bogeyFollowUpBirdie,
    bogeyFollowUpBogey: followUpStats.bogeyFollowUpBogey,

    // Streaks
    averageBirdieStreak: streakStats.avgBirdieStreak,
    averageBogeyStreak: streakStats.avgBogeyStreak,
    longestBirdieStreak: streakStats.longestBirdieStreak,
    longestBogeyStreak: streakStats.longestBogeyStreak,

    // Front vs back
    frontNineAvg: nineStats.frontAvg,
    backNineAvg: nineStats.backAvg,
    frontBackDiff: nineStats.backAvg - nineStats.frontAvg,

    // Collapse patterns
    typicalCollapseHole: collapseStats.typicalCollapseHole,
    finishingHolesAvg: collapseStats.finishingHolesAvg,
  };
}

/**
 * Analyzes what happens after birdies and bogeys
 */
function analyzeFollowUpPatterns(roundHoles: Map<string, HoleData[]>): {
  birdieFollowUpPar: number;
  birdieFollowUpBirdie: number;
  birdieFollowUpBogey: number;
  bogeyFollowUpPar: number;
  bogeyFollowUpBirdie: number;
  bogeyFollowUpBogey: number;
} {
  let afterBirdieCount = 0;
  let afterBirdiePar = 0;
  let afterBirdieBirdie = 0;
  let afterBirdieBogey = 0;

  let afterBogeyCount = 0;
  let afterBogeyPar = 0;
  let afterBogeyBirdie = 0;
  let afterBogeyBogey = 0;

  for (const holes of roundHoles.values()) {
    const sortedHoles = holes.sort((a, b) => a.hole_number - b.hole_number);

    for (let i = 0; i < sortedHoles.length - 1; i++) {
      const current = sortedHoles[i];
      const next = sortedHoles[i + 1];
      const currentScore = current ? getScoreToPar(current) : 0;
      const nextScore = next ? getScoreToPar(next) : 0;

      // After birdie or better
      if (currentScore <= -1) {
        afterBirdieCount++;
        if (nextScore === 0) afterBirdiePar++;
        if (nextScore <= -1) afterBirdieBirdie++;
        if (nextScore >= 1) afterBirdieBogey++;
      }

      // After bogey or worse
      if (currentScore >= 1) {
        afterBogeyCount++;
        if (nextScore === 0) afterBogeyPar++;
        if (nextScore <= -1) afterBogeyBirdie++;
        if (nextScore >= 1) afterBogeyBogey++;
      }
    }
  }

  return {
    birdieFollowUpPar:
      afterBirdieCount > 0 ? afterBirdiePar / afterBirdieCount : 0,
    birdieFollowUpBirdie:
      afterBirdieCount > 0 ? afterBirdieBirdie / afterBirdieCount : 0,
    birdieFollowUpBogey:
      afterBirdieCount > 0 ? afterBirdieBogey / afterBirdieCount : 0,
    bogeyFollowUpPar:
      afterBogeyCount > 0 ? afterBogeyPar / afterBogeyCount : 0,
    bogeyFollowUpBirdie:
      afterBogeyCount > 0 ? afterBogeyBirdie / afterBogeyCount : 0,
    bogeyFollowUpBogey:
      afterBogeyCount > 0 ? afterBogeyBogey / afterBogeyCount : 0,
  };
}

/**
 * Analyzes birdie and bogey streaks
 */
function analyzeStreaks(roundHoles: Map<string, HoleData[]>): {
  avgBirdieStreak: number;
  avgBogeyStreak: number;
  longestBirdieStreak: number;
  longestBogeyStreak: number;
} {
  const birdieStreaks: number[] = [];
  const bogeyStreaks: number[] = [];

  for (const holes of roundHoles.values()) {
    const sortedHoles = holes.sort((a, b) => a.hole_number - b.hole_number);

    let currentBirdieStreak = 0;
    let currentBogeyStreak = 0;

    for (const hole of sortedHoles) {
      const scoreToP = getScoreToPar(hole);
      // Birdie streak
      if (scoreToP <= -1) {
        currentBirdieStreak++;
      } else {
        if (currentBirdieStreak > 0) {
          birdieStreaks.push(currentBirdieStreak);
        }
        currentBirdieStreak = 0;
      }

      // Bogey streak (consecutive bogeys or worse)
      if (scoreToP >= 1) {
        currentBogeyStreak++;
      } else {
        if (currentBogeyStreak > 0) {
          bogeyStreaks.push(currentBogeyStreak);
        }
        currentBogeyStreak = 0;
      }
    }

    // Don't forget trailing streaks
    if (currentBirdieStreak > 0) birdieStreaks.push(currentBirdieStreak);
    if (currentBogeyStreak > 0) bogeyStreaks.push(currentBogeyStreak);
  }

  return {
    avgBirdieStreak:
      birdieStreaks.length > 0
        ? birdieStreaks.reduce((a, b) => a + b, 0) / birdieStreaks.length
        : 0,
    avgBogeyStreak:
      bogeyStreaks.length > 0
        ? bogeyStreaks.reduce((a, b) => a + b, 0) / bogeyStreaks.length
        : 0,
    longestBirdieStreak:
      birdieStreaks.length > 0 ? Math.max(...birdieStreaks) : 0,
    longestBogeyStreak:
      bogeyStreaks.length > 0 ? Math.max(...bogeyStreaks) : 0,
  };
}

/**
 * Analyzes front nine vs back nine performance
 */
function analyzeNines(roundHoles: Map<string, HoleData[]>): {
  frontAvg: number;
  backAvg: number;
} {
  const frontScores: number[] = [];
  const backScores: number[] = [];

  for (const holes of roundHoles.values()) {
    if (holes.length < 18) continue;

    const frontHoles = holes.filter((h) => h.hole_number <= 9);
    const backHoles = holes.filter((h) => h.hole_number > 9);

    if (frontHoles.length === 9) {
      frontScores.push(
        frontHoles.reduce((a, h) => a + getScoreToPar(h), 0)
      );
    }

    if (backHoles.length === 9) {
      backScores.push(
        backHoles.reduce((a, h) => a + getScoreToPar(h), 0)
      );
    }
  }

  return {
    frontAvg:
      frontScores.length > 0
        ? frontScores.reduce((a, b) => a + b, 0) / frontScores.length
        : 0,
    backAvg:
      backScores.length > 0
        ? backScores.reduce((a, b) => a + b, 0) / backScores.length
        : 0,
  };
}

/**
 * Analyzes collapse patterns (where rounds typically fall apart)
 */
function analyzeCollapsePatterns(roundHoles: Map<string, HoleData[]>): {
  typicalCollapseHole: number | undefined;
  finishingHolesAvg: number;
} {
  const holeAvgScores: number[] = Array(18).fill(0);
  const holeCounts: number[] = Array(18).fill(0);
  const finishingScores: number[] = [];

  for (const holes of roundHoles.values()) {
    for (const hole of holes) {
      if (hole.hole_number >= 1 && hole.hole_number <= 18) {
        const idx = hole.hole_number - 1;
        holeAvgScores[idx] = (holeAvgScores[idx] ?? 0) + getScoreToPar(hole);
        holeCounts[idx] = (holeCounts[idx] ?? 0) + 1;
      }
    }

    // Finishing holes (16-18)
    const finishingHoles = holes.filter((h) => h.hole_number >= 16);
    if (finishingHoles.length === 3) {
      finishingScores.push(
        finishingHoles.reduce((a, h) => a + getScoreToPar(h), 0)
      );
    }
  }

  // Find the hole with the worst average (collapse hole)
  let worstHoleIndex = -1;
  let worstAvg = -Infinity;

  for (let i = 0; i < 18; i++) {
    const count = holeCounts[i] ?? 0;
    if (count > 0) {
      const avg = (holeAvgScores[i] ?? 0) / count;
      if (avg > worstAvg) {
        worstAvg = avg;
        worstHoleIndex = i;
      }
    }
  }

  // Only consider it a "collapse hole" if it's notably worse
  const typicalCollapseHole =
    worstAvg > 0.5 ? worstHoleIndex + 1 : undefined;

  return {
    typicalCollapseHole,
    finishingHolesAvg:
      finishingScores.length > 0
        ? finishingScores.reduce((a, b) => a + b, 0) / finishingScores.length
        : 0,
  };
}
