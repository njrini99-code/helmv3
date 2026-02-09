'use server';

/**
 * Round Review System - Server Actions
 *
 * Complete round review management including:
 * - Fetching existing reviews
 * - Generating and storing AI reviews with deep shot analytics
 * - Regenerating reviews with latest engine
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateRoundReview as generateAIRoundReview } from '@/app/golf/actions/insights';
import type { Json } from '@/lib/types/database';

// ============================================================================
// TYPES
// ============================================================================

export type ReviewSentiment = 'positive' | 'neutral' | 'challenging';
export type OverallGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type StatComparison = 'above' | 'below' | 'average';

export interface RoundReviewHighlight {
  title: string;
  description: string;
}

export interface RoundReviewImprovementArea {
  area: string;
  recommendation: string;
}

export interface RoundReviewKeyStat {
  label: string;
  value: string;
  comparison: StatComparison;
}

export interface PuttingRange {
  label: string;
  attempts: number;
  made: number;
  pct: number;
}

export interface ThreePuttDetail {
  hole: number;
  firstPuttFeet: number | null;
  putts: number;
}

export interface HalfStats {
  score: number;
  putts: number;
  gir: number;
  girTotal: number;
  fairways: number;
  fairwayTotal: number;
}

export interface StrokesToGainItem {
  category: string;
  potentialStrokes: number;
  description: string;
}

// Per-hole analysis computed from shots — exported for UI use
export interface HoleBreakdown {
  hole: number;
  par: number;
  score: number;
  scoreToPar: number;
  putts: number;
  fairwayHit: boolean | null;
  gir: boolean;
  threePutt: boolean;
  onePutt: boolean;
  penalties: number;
  scrambleAttempt: boolean;
  scrambleSuccess: boolean;
  sandSaveAttempt: boolean;
  sandSaveSuccess: boolean;
  driveClub: string | null;
  driveDist: number | null;
  driveMiss: string | null;
  firstPuttFeet: number | null;
  approachClub: string | null;
  approachDist: number | null;
  approachMiss: string | null;
}

export interface RoundReviewContent {
  // Core narrative
  summary: string;
  sentiment: ReviewSentiment;
  overallGrade: OverallGrade;
  highlights: RoundReviewHighlight[];
  areasForImprovement: RoundReviewImprovementArea[];
  keyStats: RoundReviewKeyStat[];
  recommendations: string[];

  // Scoring distribution (hole numbers per category)
  scoringDistribution: {
    eagles: number[];
    birdies: number[];
    pars: number[];
    bogeys: number[];
    doublePlus: number[];
  };

  // Front 9 / Back 9 split
  frontBackSplit: {
    front: HalfStats;
    back: HalfStats;
  };

  // Momentum — rolling 3-hole cumulative score to par
  momentumData: { hole: number; rollingScoreToPar: number }[];

  // Putting deep-dive
  puttingBreakdown: {
    ranges: PuttingRange[];
    avgFirstPuttDist: number | null;
    threePuttHoles: ThreePuttDetail[];
    onePuttCount: number;
    totalPutts: number;
  };

  // Driving analysis
  drivingAnalysis: {
    avgDistance: number | null;
    longestDrive: { distance: number; hole: number } | null;
    fairwayPct: number | null;
    missPattern: { left: number; right: number; total: number };
  };

  // Short game
  shortGameAnalysis: {
    scramblePct: number | null;
    scrambleAttempts: number;
    scrambleSuccesses: number;
    sandSavePct: number | null;
    sandAttempts: number;
    sandSuccesses: number;
    upAndDownDetails: { hole: number; success: boolean; from: string }[];
  };

  // Penalties
  penaltyAnalysis: {
    total: number;
    holes: { hole: number; count: number }[];
    strokesLost: number;
  };

  // Where to improve most
  strokesToGain: StrokesToGainItem[];

  // Full hole-by-hole data for scorecard rendering
  holeByHole: HoleBreakdown[];
}

export interface StoredRoundReview {
  id: string;
  player_id: string;
  round_id: string;
  review_content: RoundReviewContent;
  generated_at: string;
  ai_model_version: string;
  shared_with_coach: boolean;
  shared_at: string | null;
  coach_notes: string | null;
  coach_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoundReviewWithRound extends StoredRoundReview {
  round: {
    id: string;
    player_id: string;
    course_name: string | null;
    round_date: string;
    total_score: number | null;
    score_to_par: number | null;
    total_putts: number | null;
    total_fairways_hit: number | null;
    total_fairways: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
  };
}

// Internal round type for processing
interface RoundData {
  id: string;
  player_id: string;
  course_name: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  status?: string;
}

// Shot row from golf_shots table
interface ShotRow {
  hole_number: number;
  shot_number: number;
  shot_type: string;
  club_used: string | null;
  distance_to_hole_before: string | null;
  distance_unit_before: string | null;
  result: string | null;
  lie_before: string | null;
  lie_after: string | null;
  miss_direction: string | null;
  putt_distance_feet: string | null;
  shot_distance: string | null;
  is_penalty: boolean;
  putt_made: boolean | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build per-hole breakdowns from shot-level data
 */
function buildHoleBreakdowns(shots: ShotRow[], _round: RoundData): HoleBreakdown[] {
  const byHole = new Map<number, ShotRow[]>();
  for (const s of shots) {
    const arr = byHole.get(s.hole_number) ?? [];
    arr.push(s);
    byHole.set(s.hole_number, arr);
  }

  const holes: HoleBreakdown[] = [];
  for (let h = 1; h <= 18; h++) {
    const holeShots = (byHole.get(h) ?? []).sort((a, b) => a.shot_number - b.shot_number);
    if (holeShots.length === 0) continue;

    const teeShot = holeShots.find(s => s.shot_type === 'tee');
    const putts = holeShots.filter(s => s.shot_type === 'putting');
    const penalties = holeShots.filter(s => s.is_penalty).length;

    // Infer par from tee distance
    const teeDistYards = teeShot ? parseFloat(teeShot.distance_to_hole_before ?? '0') : 400;
    const par = teeDistYards <= 250 ? 3 : teeDistYards >= 470 ? 5 : 4;

    const score = holeShots.length;
    const scoreToPar = score - par;

    const fairwayHit = par >= 4 && teeShot ? (teeShot.lie_after === 'fairway') : null;

    const girShotLimit = par - 2;
    const greenReachedAt = holeShots.findIndex(s => s.lie_after === 'green') + 1;
    const gir = greenReachedAt > 0 && greenReachedAt <= girShotLimit;

    const scrambleAttempt = !gir;
    const scrambleSuccess = scrambleAttempt && scoreToPar <= 0;

    const hadBunkerShot = holeShots.some(s =>
      (s.shot_type === 'around_green' || s.shot_type === 'approach') && s.lie_before === 'sand'
    );
    const sandSaveAttempt = hadBunkerShot && !gir;
    const sandSaveSuccess = sandSaveAttempt && scoreToPar <= 0;

    const driveDist = teeShot?.shot_distance ? parseFloat(teeShot.shot_distance) : null;
    const driveMiss = teeShot?.miss_direction ?? null;
    const driveClub = teeShot?.club_used ?? null;

    const firstPutt = putts[0];
    const firstPuttFeet = firstPutt?.putt_distance_feet ? parseFloat(firstPutt.putt_distance_feet) : null;

    const approachShot = holeShots.find(s =>
      s.shot_type === 'approach' || (s.shot_type === 'around_green' && !gir)
    );
    const approachClub = approachShot?.club_used ?? null;
    const approachDist = approachShot?.distance_to_hole_before ? parseFloat(approachShot.distance_to_hole_before) : null;
    const approachMiss = approachShot?.miss_direction ?? null;

    holes.push({
      hole: h, par, score, scoreToPar,
      putts: putts.length, fairwayHit, gir,
      threePutt: putts.length >= 3, onePutt: putts.length === 1,
      penalties, scrambleAttempt, scrambleSuccess,
      sandSaveAttempt, sandSaveSuccess,
      driveClub,
      driveDist: driveDist ? Math.round(driveDist) : null,
      driveMiss, firstPuttFeet,
      approachClub,
      approachDist: approachDist ? Math.round(approachDist) : null,
      approachMiss,
    });
  }
  return holes;
}

function determineSentiment(scoreToPar: number): ReviewSentiment {
  if (scoreToPar <= -1) return 'positive';
  if (scoreToPar <= 3) return 'neutral';
  return 'challenging';
}

function determineGrade(scoreToPar: number, girPct: number, fairwayPct: number | null, putts: number): OverallGrade {
  let score = 0;
  let factors = 0;

  const scoreVal = scoreToPar <= -3 ? 5 : scoreToPar <= -1 ? 4 : scoreToPar <= 1 ? 3.5 : scoreToPar <= 3 ? 3 : scoreToPar <= 5 ? 2 : 1;
  score += scoreVal * 2;
  factors += 2;

  const girVal = girPct >= 70 ? 5 : girPct >= 60 ? 4 : girPct >= 50 ? 3 : girPct >= 40 ? 2 : 1;
  score += girVal;
  factors++;

  if (fairwayPct !== null) {
    const fwVal = fairwayPct >= 70 ? 5 : fairwayPct >= 60 ? 4 : fairwayPct >= 50 ? 3 : fairwayPct >= 40 ? 2 : 1;
    score += fwVal;
    factors++;
  }

  const puttVal = putts <= 28 ? 5 : putts <= 30 ? 4 : putts <= 32 ? 3 : putts <= 34 ? 2 : 1;
  score += puttVal;
  factors++;

  const avg = score / factors;
  if (avg >= 4.2) return 'A';
  if (avg >= 3.5) return 'B';
  if (avg >= 2.5) return 'C';
  if (avg >= 1.5) return 'D';
  return 'F';
}

/**
 * Generate full review content from round data + shot data
 */
function generateReviewContent(
  round: RoundData,
  holes: HoleBreakdown[],
  playerAvgs: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number } | null
): RoundReviewContent {
  const highlights: RoundReviewHighlight[] = [];
  const areasForImprovement: RoundReviewImprovementArea[] = [];
  const keyStats: RoundReviewKeyStat[] = [];
  const recommendations: string[] = [];

  const scoreToPar = round.score_to_par ?? 0;
  const totalScore = round.total_score ?? 72;

  // ===== Compute stats from hole breakdowns =====
  const totalPutts = holes.reduce((s, h) => s + h.putts, 0);
  const threePutts = holes.filter(h => h.threePutt);
  const onePutts = holes.filter(h => h.onePutt);
  const birdieHoles = holes.filter(h => h.scoreToPar === -1);
  const parHoles = holes.filter(h => h.scoreToPar === 0);
  const bogeyHoles = holes.filter(h => h.scoreToPar === 1);
  const doublePlusHoles = holes.filter(h => h.scoreToPar >= 2);
  const eagleHoles = holes.filter(h => h.scoreToPar <= -2);

  const fairwayEligible = holes.filter(h => h.fairwayHit !== null);
  const fairwaysHit = fairwayEligible.filter(h => h.fairwayHit).length;
  const fairwayPct = fairwayEligible.length > 0 ? Math.round((fairwaysHit / fairwayEligible.length) * 100) : null;

  const girHits = holes.filter(h => h.gir);
  const girPct = holes.length > 0 ? Math.round((girHits.length / holes.length) * 100) : 0;

  const scrambleAttemptsList = holes.filter(h => h.scrambleAttempt);
  const scrambleSuccessList = holes.filter(h => h.scrambleSuccess);
  const scramblePct = scrambleAttemptsList.length > 0 ? Math.round((scrambleSuccessList.length / scrambleAttemptsList.length) * 100) : null;

  const sandAttemptsList = holes.filter(h => h.sandSaveAttempt);
  const sandSuccessList = holes.filter(h => h.sandSaveSuccess);
  const sandSavePct = sandAttemptsList.length > 0 ? Math.round((sandSuccessList.length / sandAttemptsList.length) * 100) : null;

  // Driving miss pattern
  const driveMisses = holes.filter(h => h.driveMiss && h.fairwayHit === false);
  const leftMisses = driveMisses.filter(h => h.driveMiss?.includes('left')).length;
  const rightMisses = driveMisses.filter(h => h.driveMiss?.includes('right')).length;
  const dominantMiss = leftMisses > rightMisses ? 'left' : rightMisses > leftMisses ? 'right' : null;

  // Approach miss pattern
  const approachMisses = holes.filter(h => !h.gir && h.approachMiss);
  const approachShort = approachMisses.filter(h => h.approachMiss?.includes('short')).length;
  const approachLong = approachMisses.filter(h => h.approachMiss?.includes('long')).length;

  // First putt distances
  const firstPuttDists = holes.filter(h => h.firstPuttFeet !== null).map(h => h.firstPuttFeet!);
  const avgFirstPuttDist = firstPuttDists.length > 0 ? Math.round(firstPuttDists.reduce((a, b) => a + b, 0) / firstPuttDists.length) : null;

  // Drive distances
  const driveDists = holes.filter(h => h.driveDist !== null && h.par >= 4).map(h => ({ dist: h.driveDist!, hole: h.hole }));
  const avgDriveDist = driveDists.length > 0 ? Math.round(driveDists.reduce((a, b) => a + b.dist, 0) / driveDists.length) : null;
  const longestDrive = driveDists.length > 0
    ? driveDists.reduce((best, d) => d.dist > best.dist ? d : best, driveDists[0]!)
    : null;

  // Worst & best holes
  const worstHoles = [...holes].sort((a, b) => b.scoreToPar - a.scoreToPar).filter(h => h.scoreToPar >= 2);
  const bestHoles = [...holes].sort((a, b) => a.scoreToPar - b.scoreToPar).filter(h => h.scoreToPar <= -1);

  // ===== SCORING DISTRIBUTION =====
  const scoringDistribution = {
    eagles: eagleHoles.map(h => h.hole),
    birdies: birdieHoles.map(h => h.hole),
    pars: parHoles.map(h => h.hole),
    bogeys: bogeyHoles.map(h => h.hole),
    doublePlus: doublePlusHoles.map(h => h.hole),
  };

  // ===== FRONT/BACK SPLIT =====
  const frontHoles = holes.filter(h => h.hole <= 9);
  const backHoles = holes.filter(h => h.hole >= 10);
  const halfStats = (hh: HoleBreakdown[]): HalfStats => {
    const fwEligible = hh.filter(h => h.fairwayHit !== null);
    return {
      score: hh.reduce((s, h) => s + h.score, 0),
      putts: hh.reduce((s, h) => s + h.putts, 0),
      gir: hh.filter(h => h.gir).length,
      girTotal: hh.length,
      fairways: fwEligible.filter(h => h.fairwayHit).length,
      fairwayTotal: fwEligible.length,
    };
  };
  const frontBackSplit = {
    front: halfStats(frontHoles),
    back: halfStats(backHoles),
  };

  // ===== MOMENTUM — rolling 3-hole cumulative score to par =====
  const momentumData: { hole: number; rollingScoreToPar: number }[] = [];
  let cumulative = 0;
  for (const h of holes) {
    cumulative += h.scoreToPar;
    momentumData.push({ hole: h.hole, rollingScoreToPar: cumulative });
  }

  // ===== PUTTING BREAKDOWN by distance =====
  const puttBuckets = [
    { label: '0-5 ft', min: 0, max: 5 },
    { label: '5-15 ft', min: 5, max: 15 },
    { label: '15-25 ft', min: 15, max: 25 },
    { label: '25+ ft', min: 25, max: 999 },
  ];
  const puttingRanges: PuttingRange[] = puttBuckets.map(bucket => {
    const inBucket = holes.filter(h => {
      if (h.firstPuttFeet === null) return false;
      return h.firstPuttFeet >= bucket.min && h.firstPuttFeet < bucket.max;
    });
    const made = inBucket.filter(h => h.onePutt).length;
    return {
      label: bucket.label,
      attempts: inBucket.length,
      made,
      pct: inBucket.length > 0 ? Math.round((made / inBucket.length) * 100) : 0,
    };
  });

  const puttingBreakdown = {
    ranges: puttingRanges,
    avgFirstPuttDist,
    threePuttHoles: threePutts.map(h => ({ hole: h.hole, firstPuttFeet: h.firstPuttFeet, putts: h.putts })),
    onePuttCount: onePutts.length,
    totalPutts,
  };

  // ===== DRIVING ANALYSIS =====
  const drivingAnalysis = {
    avgDistance: avgDriveDist,
    longestDrive: longestDrive ? { distance: longestDrive.dist, hole: longestDrive.hole } : null,
    fairwayPct,
    missPattern: { left: leftMisses, right: rightMisses, total: driveMisses.length },
  };

  // ===== SHORT GAME =====
  const upAndDownDetails = scrambleAttemptsList.map(h => ({
    hole: h.hole,
    success: h.scrambleSuccess,
    from: h.sandSaveAttempt ? 'sand' : h.approachMiss ? `missed ${h.approachMiss}` : 'rough/fringe',
  }));
  const shortGameAnalysis = {
    scramblePct,
    scrambleAttempts: scrambleAttemptsList.length,
    scrambleSuccesses: scrambleSuccessList.length,
    sandSavePct,
    sandAttempts: sandAttemptsList.length,
    sandSuccesses: sandSuccessList.length,
    upAndDownDetails,
  };

  // ===== PENALTY ANALYSIS =====
  const penaltyHoles = holes.filter(h => h.penalties > 0);
  const penaltyAnalysis = {
    total: penaltyHoles.reduce((s, h) => s + h.penalties, 0),
    holes: penaltyHoles.map(h => ({ hole: h.hole, count: h.penalties })),
    strokesLost: penaltyHoles.reduce((s, h) => s + h.penalties, 0),
  };

  // ===== STROKES TO GAIN =====
  const strokesToGain: StrokesToGainItem[] = [];
  if (threePutts.length > 0) {
    strokesToGain.push({
      category: 'Putting',
      potentialStrokes: threePutts.length,
      description: `Eliminating ${threePutts.length} three-putt${threePutts.length > 1 ? 's' : ''} saves ${threePutts.length} stroke${threePutts.length > 1 ? 's' : ''}`,
    });
  }
  if (penaltyAnalysis.total > 0) {
    strokesToGain.push({
      category: 'Course Management',
      potentialStrokes: penaltyAnalysis.strokesLost,
      description: `${penaltyAnalysis.total} penalty stroke${penaltyAnalysis.total > 1 ? 's' : ''} cost ${penaltyAnalysis.strokesLost} stroke${penaltyAnalysis.strokesLost > 1 ? 's' : ''}`,
    });
  }
  const missedScrambles = scrambleAttemptsList.length - scrambleSuccessList.length;
  if (missedScrambles > 0 && scramblePct !== null && scramblePct < 50) {
    const potentialSaves = Math.round(missedScrambles * 0.5);
    if (potentialSaves > 0) {
      strokesToGain.push({
        category: 'Short Game',
        potentialStrokes: potentialSaves,
        description: `Converting ${potentialSaves} more scramble${potentialSaves > 1 ? 's' : ''} of ${missedScrambles} missed saves ${potentialSaves} stroke${potentialSaves > 1 ? 's' : ''}`,
      });
    }
  }
  if (girPct < 50 && holes.length > 0) {
    const improvedGir = Math.round(holes.length * 0.5);
    const additionalGIRs = improvedGir - girHits.length;
    if (additionalGIRs > 0) {
      strokesToGain.push({
        category: 'Approach Shots',
        potentialStrokes: Math.round(additionalGIRs * 0.5),
        description: `Hitting ${additionalGIRs} more green${additionalGIRs > 1 ? 's' : ''} in regulation reduces scramble pressure`,
      });
    }
  }
  strokesToGain.sort((a, b) => b.potentialStrokes - a.potentialStrokes);

  // ===== SENTIMENT & GRADE =====
  const sentiment = determineSentiment(scoreToPar);
  const overallGrade = determineGrade(scoreToPar, girPct, fairwayPct, totalPutts);

  // ===== SUMMARY =====
  let summary = '';
  if (scoreToPar <= -3) {
    summary = `Outstanding ${totalScore} at ${round.course_name || 'the course'}. `;
  } else if (scoreToPar <= -1) {
    summary = `Solid under-par ${totalScore} at ${round.course_name || 'the course'}. `;
  } else if (scoreToPar === 0) {
    summary = `Even-par ${totalScore} at ${round.course_name || 'the course'}. `;
  } else if (scoreToPar <= 3) {
    summary = `Shot ${totalScore} (+${scoreToPar}) at ${round.course_name || 'the course'}. `;
  } else {
    summary = `Tough ${totalScore} (+${scoreToPar}) at ${round.course_name || 'the course'}. `;
  }

  const scoreParts: string[] = [];
  if (eagleHoles.length > 0) scoreParts.push(`${eagleHoles.length} eagle${eagleHoles.length > 1 ? 's' : ''}`);
  if (birdieHoles.length > 0) scoreParts.push(`${birdieHoles.length} birdie${birdieHoles.length > 1 ? 's' : ''}`);
  scoreParts.push(`${parHoles.length} par${parHoles.length !== 1 ? 's' : ''}`);
  if (bogeyHoles.length > 0) scoreParts.push(`${bogeyHoles.length} bogey${bogeyHoles.length > 1 ? 's' : ''}`);
  if (doublePlusHoles.length > 0) scoreParts.push(`${doublePlusHoles.length} double+`);
  summary += scoreParts.join(', ') + '. ';

  if (worstHoles.length > 0) {
    const blowups = worstHoles.slice(0, 2).map(h => `#${h.hole} (+${h.scoreToPar})`).join(' and ');
    summary += `Biggest damage on ${blowups}. `;
  }
  if (bestHoles.length > 0 && bestHoles.length <= 4) {
    summary += `Picked up strokes on ${bestHoles.map(h => `#${h.hole}`).join(', ')}. `;
  }

  // ===== KEY STATS =====
  const cmp = (val: number, avg: number | undefined, better: 'lower' | 'higher'): StatComparison => {
    if (!avg) return 'average';
    const diff = val - avg;
    if (better === 'lower') return diff < -1 ? 'above' : diff > 1 ? 'below' : 'average';
    return diff > 1 ? 'above' : diff < -1 ? 'below' : 'average';
  };

  keyStats.push({ label: 'Total Putts', value: `${totalPutts}`, comparison: cmp(totalPutts, playerAvgs?.avgPutts, 'lower') });
  keyStats.push({ label: 'Greens in Reg', value: `${girHits.length}/${holes.length} (${girPct}%)`, comparison: cmp(girPct, playerAvgs?.avgGirPct, 'higher') });
  if (fairwayPct !== null) {
    keyStats.push({ label: 'Fairways', value: `${fairwaysHit}/${fairwayEligible.length} (${fairwayPct}%)`, comparison: cmp(fairwayPct, playerAvgs?.avgFairwayPct, 'higher') });
  }
  if (scramblePct !== null) {
    keyStats.push({ label: 'Scrambling', value: `${scrambleSuccessList.length}/${scrambleAttemptsList.length} (${scramblePct}%)`, comparison: scramblePct >= 50 ? 'above' : scramblePct >= 33 ? 'average' : 'below' });
  }
  if (avgDriveDist !== null) {
    keyStats.push({ label: 'Avg Drive', value: `${avgDriveDist}y`, comparison: avgDriveDist >= 260 ? 'above' : avgDriveDist >= 240 ? 'average' : 'below' });
  }
  if (avgFirstPuttDist !== null) {
    keyStats.push({ label: 'Avg 1st Putt', value: `${avgFirstPuttDist}ft`, comparison: avgFirstPuttDist <= 15 ? 'above' : avgFirstPuttDist <= 25 ? 'average' : 'below' });
  }

  // ===== HIGHLIGHTS =====
  if (bestHoles.length > 0) {
    const desc = bestHoles.slice(0, 3).map(h => {
      const parts: string[] = [`Hole ${h.hole} (par ${h.par})`];
      if (h.firstPuttFeet && h.onePutt) parts.push(`sank a ${Math.round(h.firstPuttFeet)}ft putt`);
      else if (h.gir && h.putts === 2) parts.push(`solid GIR and 2-putt`);
      return parts.join(' — ');
    });
    highlights.push({
      title: `${bestHoles.length} Birdie${bestHoles.length > 1 ? 's' : ''} or Better`,
      description: desc.join('. ') + '.',
    });
  }
  if (onePutts.length >= 4) {
    highlights.push({
      title: `${onePutts.length} One-Putts`,
      description: `Converted on holes ${onePutts.slice(0, 5).map(h => `#${h.hole}`).join(', ')}.`,
    });
  }
  if (scramblePct !== null && scramblePct >= 50) {
    highlights.push({
      title: `${scramblePct}% Scrambling`,
      description: `Saved par ${scrambleSuccessList.length} of ${scrambleAttemptsList.length} times when missing the green.`,
    });
  }
  if (fairwayPct !== null && fairwayPct >= 65) {
    highlights.push({
      title: 'Accurate Driving',
      description: `Hit ${fairwaysHit}/${fairwayEligible.length} fairways (${fairwayPct}%).`,
    });
  }
  if (sandSuccessList.length > 0) {
    highlights.push({
      title: `Sand Save${sandSuccessList.length > 1 ? 's' : ''}`,
      description: `Saved par from the bunker ${sandSuccessList.length} of ${sandAttemptsList.length} time${sandAttemptsList.length > 1 ? 's' : ''}.`,
    });
  }

  // ===== AREAS FOR IMPROVEMENT =====
  if (threePutts.length > 0) {
    const tpHoles = threePutts.map(h => `#${h.hole} (from ${h.firstPuttFeet ? Math.round(h.firstPuttFeet) : '?'}ft)`).join(', ');
    areasForImprovement.push({
      area: `${threePutts.length} Three-Putt${threePutts.length > 1 ? 's' : ''}`,
      recommendation: `Three-putted on ${tpHoles}. ${
        threePutts.some(h => (h.firstPuttFeet ?? 0) >= 25)
          ? 'Work on lag putting from 25+ feet to leave tap-in second putts.'
          : 'Focus on speed control and reading break inside 15 feet.'
      }`,
    });
    recommendations.push('Lag putting drill: hit 10 putts from 30ft, all must stop within 3ft of the hole');
  }
  if (doublePlusHoles.length > 0) {
    const dbHoles = doublePlusHoles.map(h => {
      const parts = [`#${h.hole} (+${h.scoreToPar})`];
      if (h.penalties > 0) parts.push('penalty');
      else if (h.threePutt) parts.push('3-putt');
      else if (!h.gir && !h.scrambleSuccess) parts.push('missed green, no save');
      return parts.join(' — ');
    });
    areasForImprovement.push({
      area: 'Big Numbers',
      recommendation: `Double bogey+ on: ${dbHoles.join('; ')}. Limiting blow-up holes is the fastest path to lower scores.`,
    });
  }
  if (dominantMiss && driveMisses.length >= 3) {
    const count = dominantMiss === 'left' ? leftMisses : rightMisses;
    areasForImprovement.push({
      area: `Tee Shot Miss: ${dominantMiss}`,
      recommendation: `Missed ${count}/${driveMisses.length} fairways to the ${dominantMiss}. Adjust aim or work on your release pattern.`,
    });
    recommendations.push(`On the range, aim ${dominantMiss === 'left' ? 'slightly right' : 'slightly left'} of target and focus on a consistent release pattern`);
  }
  if (approachMisses.length >= 4) {
    const shortPct = Math.round((approachShort / approachMisses.length) * 100);
    if (approachShort > approachLong && shortPct >= 50) {
      areasForImprovement.push({
        area: 'Approaches Landing Short',
        recommendation: `${shortPct}% of missed greens were short. Take one extra club to carry pin-high.`,
      });
      recommendations.push('On the range, note carry distance vs total distance for each iron');
    } else if (approachLong > approachShort) {
      areasForImprovement.push({
        area: 'Approaches Going Long',
        recommendation: 'Most missed greens were long. Dial back club selection and trust your swing.',
      });
    }
  }
  if (girPct < 40) {
    areasForImprovement.push({
      area: `Low GIR (${girPct}%)`,
      recommendation: `Only hit ${girHits.length} of ${holes.length} greens. This put constant pressure on your short game.`,
    });
    recommendations.push('Practice approach shots from your 3 most common approach yardages');
  }

  if (recommendations.length === 0) {
    if (sentiment === 'positive') {
      recommendations.push('Maintain this form — focus on consistency in your next round');
    } else if (sentiment === 'neutral') {
      recommendations.push('Review your pre-shot routine to tighten up decision-making');
    } else {
      recommendations.push('Simplify your game plan next round — fairways and greens, avoid hero shots');
    }
  }
  if (scoreToPar > 0 && scoreToPar <= 5 && strokesToGain.length > 0 && strokesToGain[0]) {
    recommendations.push(`${strokesToGain[0].description} — your biggest opportunity`);
  }

  if (highlights.length === 0) {
    if (parHoles.length >= 10) {
      highlights.push({ title: `${parHoles.length} Pars`, description: 'Solid consistency — the foundation for lower scores.' });
    } else {
      highlights.push({ title: 'Round Logged', description: 'Tracking your rounds is the first step to improvement.' });
    }
  }

  return {
    summary, sentiment, overallGrade,
    highlights, areasForImprovement, keyStats, recommendations,
    scoringDistribution, frontBackSplit, momentumData,
    puttingBreakdown, drivingAnalysis, shortGameAnalysis,
    penaltyAnalysis, strokesToGain,
    holeByHole: holes,
  };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

export async function getRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: existingReview, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          id, player_id, course_name, round_date,
          total_score, score_to_par, total_putts,
          total_fairways_hit, total_fairways,
          total_gir, total_gir_possible
        )
      `)
      .eq('round_id', roundId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: 'Failed to fetch review' };
    }

    if (!existingReview) {
      return { success: true, review: undefined };
    }

    const roundData = existingReview.round as RoundData;
    const review: RoundReviewWithRound = {
      id: existingReview.id,
      player_id: existingReview.player_id,
      round_id: existingReview.round_id,
      review_content: (existingReview.round_stats as unknown as RoundReviewContent) || generateReviewContent(roundData, [], null),
      generated_at: existingReview.created_at ?? new Date().toISOString(),
      ai_model_version: existingReview.engine_version ?? 'v1.0',
      shared_with_coach: existingReview.shared_with_coach ?? false,
      shared_at: existingReview.shared_at,
      coach_notes: existingReview.coach_notes,
      coach_viewed_at: existingReview.coach_viewed_at,
      created_at: existingReview.created_at ?? new Date().toISOString(),
      updated_at: existingReview.updated_at ?? new Date().toISOString(),
      round: roundData,
    };

    return { success: true, review };
  } catch (error) {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function generateAndStoreRoundReview(
  roundId: string,
  playerId: string
): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, course_name, round_date, total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, status')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    const roundData = round as unknown as RoundData;
    if (roundData.status !== 'completed') {
      return { success: false, error: 'Round must be completed before generating a review' };
    }

    const { data: shots } = await supabase
      .from('golf_shots')
      .select('hole_number, shot_number, shot_type, club_used, distance_to_hole_before, distance_unit_before, result, lie_before, lie_after, miss_direction, putt_distance_feet, shot_distance, is_penalty, putt_made')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true });

    const shotRows = (shots ?? []) as unknown as ShotRow[];
    const holeBreakdowns = shotRows.length > 0 ? buildHoleBreakdowns(shotRows, roundData) : [];

    const { data: playerRounds } = await supabase
      .from('golf_rounds')
      .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .neq('id', roundId)
      .order('round_date', { ascending: false })
      .limit(20);

    let playerAvgs = null;
    if (playerRounds && playerRounds.length >= 3) {
      const valid = playerRounds.filter(r => r.total_score !== null);
      const avgScore = valid.reduce((s, r) => s + (r.total_score ?? 0), 0) / valid.length;
      const puttRounds = valid.filter(r => r.total_putts !== null);
      const avgPutts = puttRounds.length > 0 ? puttRounds.reduce((s, r) => s + (r.total_putts ?? 0), 0) / puttRounds.length : 32;
      const girRounds = valid.filter(r => r.total_gir !== null && r.total_gir_possible);
      const avgGirPct = girRounds.length > 0
        ? girRounds.reduce((s, r) => s + ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100, 0) / girRounds.length
        : 50;
      const fwRounds = valid.filter(r => r.total_fairways_hit !== null && r.total_fairways);
      const avgFairwayPct = fwRounds.length > 0
        ? fwRounds.reduce((s, r) => s + ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100, 0) / fwRounds.length
        : 50;
      playerAvgs = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
    }

    const reviewContent = generateReviewContent(roundData, holeBreakdowns, playerAvgs);

    // Optional AI enhancement
    let aiEnhanced = false;
    try {
      const aiResult = await generateAIRoundReview(roundId, playerId);
      if (aiResult.success && aiResult.review) {
        if (aiResult.review.summary) reviewContent.summary = aiResult.review.summary;
        if (aiResult.review.primaryTakeaway) reviewContent.recommendations.unshift(aiResult.review.primaryTakeaway);
        aiEnhanced = true;
      }
    } catch {
      // AI enhancement failed, rule-based review is sufficient
    }

    const { data: existingReview } = await supabase
      .from('golf_round_reviews')
      .select('id')
      .eq('round_id', roundId)
      .maybeSingle();

    let reviewId: string;

    if (existingReview) {
      const { error: updateError } = await supabase
        .from('golf_round_reviews')
        .update({
          round_stats: reviewContent as unknown as Json,
          summary: reviewContent.summary,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          engine_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReview.id);

      if (updateError) return { success: false, error: 'Failed to update review' };
      reviewId = existingReview.id;
    } else {
      const { data: newReview, error: insertError } = await supabase
        .from('golf_round_reviews')
        .insert({
          round_id: roundId,
          player_id: playerId,
          round_stats: reviewContent as unknown as Json,
          summary: reviewContent.summary,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          round_score: roundData.total_score,
          round_score_to_par: roundData.score_to_par,
          engine_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
        })
        .select('id')
        .single();

      if (insertError || !newReview) return { success: false, error: 'Failed to create review' };
      reviewId = newReview.id;
    }

    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${roundId}`);
    revalidatePath(`/golf/dashboard/rounds/${roundId}/review`);

    const review: RoundReviewWithRound = {
      id: reviewId,
      player_id: playerId,
      round_id: roundId,
      review_content: reviewContent,
      generated_at: new Date().toISOString(),
      ai_model_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
      shared_with_coach: false,
      shared_at: null,
      coach_notes: null,
      coach_viewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      round: {
        id: roundData.id, player_id: roundData.player_id,
        course_name: roundData.course_name, round_date: roundData.round_date,
        total_score: roundData.total_score, score_to_par: roundData.score_to_par,
        total_putts: roundData.total_putts,
        total_fairways_hit: roundData.total_fairways_hit, total_fairways: roundData.total_fairways,
        total_gir: roundData.total_gir, total_gir_possible: roundData.total_gir_possible,
      },
    };

    return { success: true, review };
  } catch (error) {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function regenerateRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();
  try {
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('player_id')
      .eq('id', roundId)
      .single();
    if (roundError || !round) return { success: false, error: 'Round not found' };
    return generateAndStoreRoundReview(roundId, round.player_id);
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({ shared_with_coach: true, shared_at: new Date().toISOString() })
      .eq('id', reviewId);
    if (error) return { success: false, error: 'Failed to share review' };
    revalidatePath('/golf/dashboard/rounds');
    return { success: true };
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function getStatAverages(
  playerId: string,
  teamId?: string
): Promise<{
  success: boolean;
  playerAvg?: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  teamAvg?: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  error?: string;
}> {
  const supabase = await createClient();
  try {
    const { data: playerRounds, error: playerError } = await supabase
      .from('golf_rounds')
      .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(20);

    if (playerError) return { success: false, error: 'Failed to fetch player stats' };

    let playerAvg = undefined;
    if (playerRounds && playerRounds.length >= 3) {
      const valid = playerRounds.filter(r => r.total_score !== null);
      const avgScore = valid.reduce((s, r) => s + (r.total_score ?? 0), 0) / valid.length;
      const puttRounds = valid.filter(r => r.total_putts !== null);
      const avgPutts = puttRounds.length > 0 ? puttRounds.reduce((s, r) => s + (r.total_putts ?? 0), 0) / puttRounds.length : 32;
      const girRounds = valid.filter(r => r.total_gir !== null && r.total_gir_possible);
      const avgGirPct = girRounds.length > 0
        ? girRounds.reduce((s, r) => s + ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100, 0) / girRounds.length
        : 50;
      const fwRounds = valid.filter(r => r.total_fairways_hit !== null && r.total_fairways);
      const avgFairwayPct = fwRounds.length > 0
        ? fwRounds.reduce((s, r) => s + ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100, 0) / fwRounds.length
        : 50;
      playerAvg = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
    }

    let teamAvg = undefined;
    if (teamId) {
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId);

      if (teamMembers && teamMembers.length > 0) {
        const playerIds = teamMembers.map(m => m.player_id);
        const { data: teamRounds } = await supabase
          .from('golf_rounds')
          .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
          .in('player_id', playerIds)
          .eq('status', 'completed')
          .not('total_score', 'is', null)
          .gte('round_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .limit(100);

        if (teamRounds && teamRounds.length >= 5) {
          const valid = teamRounds.filter(r => r.total_score !== null);
          const avgScore = valid.reduce((s, r) => s + (r.total_score ?? 0), 0) / valid.length;
          const puttRounds = valid.filter(r => r.total_putts !== null);
          const avgPutts = puttRounds.length > 0 ? puttRounds.reduce((s, r) => s + (r.total_putts ?? 0), 0) / puttRounds.length : 32;
          const girRounds = valid.filter(r => r.total_gir !== null && r.total_gir_possible);
          const avgGirPct = girRounds.length > 0
            ? girRounds.reduce((s, r) => s + ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100, 0) / girRounds.length
            : 50;
          const fwRounds = valid.filter(r => r.total_fairways_hit !== null && r.total_fairways);
          const avgFairwayPct = fwRounds.length > 0
            ? fwRounds.reduce((s, r) => s + ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100, 0) / fwRounds.length
            : 50;
          teamAvg = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
        }
      }
    }

    return { success: true, playerAvg, teamAvg };
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}
