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
import { coachHelmIntelligence, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2';
import type { ComposedInsight, InsightEvidenceMetric, IntelligentRoundReview } from '@/lib/coachhelm/v2';
import type { Json } from '@/lib/types/database';

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean { return UUID_REGEX.test(id); }

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

export interface CoachHelmReviewInsight {
  headline: string;
  body: string;
  tone: ComposedInsight['tone'];
  confidence: number;
  strokeImpact?: number;
  evidenceMetrics?: InsightEvidenceMetric[];
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

  // CoachHelm V2 overlay
  coachHelm?: {
    summary: string;
    primaryTakeaway: string;
    practicePriority: string;
    focusAreas: string[];
    tone: ComposedInsight['tone'];
    confidence: number;
  };
  deepInsights?: CoachHelmReviewInsight[];

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

// Hole-level data from golf_holes table (carries known par, score, etc.)
interface HoleParRow {
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

interface ComparisonRoundRow {
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  holes_played?: number | null;
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

function calculateComparisonAverages(rounds: ComparisonRoundRow[]): {
  avgScore: number;
  avgScoreToPar: number;
  avgPutts: number;
  avgGirPct: number;
  avgFairwayPct: number;
} | null {
  const valid = rounds.filter(r => r.total_score !== null);
  if (valid.length < 3) return null;

  const rounds18 = valid.filter(r => (r.holes_played ?? 18) === 18);
  const avgScore = rounds18.length > 0
    ? rounds18.reduce((sum, round) => sum + (round.total_score ?? 0), 0) / rounds18.length
    : 72;

  const roundsWithToPar = valid.filter(r => r.score_to_par !== null);
  const avgScoreToPar = roundsWithToPar.length > 0
    ? roundsWithToPar.reduce((sum, round) => {
      const holesPlayed = round.holes_played ?? 18;
      return sum + ((round.score_to_par ?? 0) * (18 / holesPlayed));
    }, 0) / roundsWithToPar.length
    : avgScore - 72;

  const puttRounds = valid.filter(r => r.total_putts !== null);
  const puttHoles = puttRounds.reduce((sum, round) => sum + (round.holes_played ?? 18), 0);
  const totalPutts = puttRounds.reduce((sum, round) => sum + (round.total_putts ?? 0), 0);
  const avgPutts = puttHoles > 0 ? (totalPutts / puttHoles) * 18 : 32;

  const girRounds = valid.filter(r => r.total_gir !== null && r.total_gir_possible);
  const avgGirPct = girRounds.length > 0
    ? girRounds.reduce((sum, round) => sum + ((round.total_gir ?? 0) / (round.total_gir_possible ?? 18)) * 100, 0) / girRounds.length
    : 50;

  const fwRounds = valid.filter(r => r.total_fairways_hit !== null && r.total_fairways);
  const avgFairwayPct = fwRounds.length > 0
    ? fwRounds.reduce((sum, round) => sum + ((round.total_fairways_hit ?? 0) / (round.total_fairways ?? 14)) * 100, 0) / fwRounds.length
    : 50;

  return { avgScore, avgScoreToPar, avgPutts, avgGirPct, avgFairwayPct };
}

/**
 * Build per-hole breakdowns from shot-level data.
 *
 * Key design decisions:
 * - Score is computed by checking if the last shot holed out. If shot data is
 *   incomplete (ball never reaches hole), we detect this and estimate score
 *   from the shots we have + likely remaining shots.
 * - Chip-ins (around_green with result 'hole') are properly handled — 0 putts.
 * - GIR detection checks for both lie_after='green' AND result='hole' (chip-in
 *   from approach counts as GIR).
 * - Par 3 tee shots that hit the green count as GIR (shot 1 reaching green on
 *   par 3 satisfies girShotLimit of 1).
 */
function buildHoleBreakdowns(shots: ShotRow[], round: RoundData, holePars?: HoleParRow[]): HoleBreakdown[] {
  const byHole = new Map<number, ShotRow[]>();
  for (const s of shots) {
    const arr = byHole.get(s.hole_number) ?? [];
    arr.push(s);
    byHole.set(s.hole_number, arr);
  }

  // Build a lookup for known hole par/score from golf_holes table
  const knownHoles = new Map<number, HoleParRow>();
  if (holePars) {
    for (const hp of holePars) {
      knownHoles.set(hp.hole_number, hp);
    }
  }

  const holes: HoleBreakdown[] = [];
  for (let h = 1; h <= 18; h++) {
    const holeShots = (byHole.get(h) ?? []).sort((a, b) => a.shot_number - b.shot_number);
    const knownHole = knownHoles.get(h);

    // If no shot data AND no hole-level data, skip entirely
    if (holeShots.length === 0 && !knownHole) continue;

    // If no shot data but we have golf_holes data, build a minimal breakdown
    if (holeShots.length === 0 && knownHole) {
      const par = knownHole.par;
      const score = knownHole.score ?? par;
      const scoreToPar = score - par;
      const puttCount = knownHole.putts ?? 2;
      const fairwayHit = par >= 4 ? (knownHole.fairway_hit ?? null) : null;
      const gir = knownHole.gir ?? false;
      holes.push({
        hole: h, par, score, scoreToPar,
        putts: puttCount, fairwayHit, gir,
        threePutt: puttCount >= 3, onePutt: puttCount === 1,
        penalties: 0,
        scrambleAttempt: !gir,
        scrambleSuccess: !gir && scoreToPar <= 0,
        sandSaveAttempt: false, sandSaveSuccess: false,
        driveClub: null, driveDist: null, driveMiss: null,
        firstPuttFeet: null, approachClub: null, approachDist: null, approachMiss: null,
      });
      continue;
    }

    const teeShot = holeShots.find(s => s.shot_type === 'tee');
    const putts = holeShots.filter(s => s.shot_type === 'putting');
    const penalties = holeShots.filter(s => s.is_penalty).length;

    // Use known par from golf_holes if available; otherwise infer from tee distance
    // (knownHole was already looked up above)
    let par: number;
    if (knownHole) {
      par = knownHole.par;
    } else {
      const teeDistYards = teeShot ? parseFloat(teeShot.distance_to_hole_before ?? '0') : 400;
      par = teeDistYards <= 250 ? 3 : teeDistYards >= 470 ? 5 : 4;
    }

    // Determine if the hole was completed (ball holed out)
    const lastShot = holeShots[holeShots.length - 1];
    const holedOut = lastShot?.result === 'hole' || lastShot?.putt_made === true;

    // Score calculation priority:
    // 1. If golf_holes has a known score, use that (ground truth)
    // 2. If shot data shows ball holed out, use shot count
    // 3. Otherwise estimate from shots + likely remaining
    let score: number;
    if (knownHole?.score != null) {
      score = knownHole.score;
    } else if (holedOut) {
      score = holeShots.length;
    } else {
      // Incomplete hole data — shots stop before holing out.
      // Estimate: recorded shots + likely chip/putt to finish.
      const onGreen = lastShot?.lie_after === 'green';
      if (onGreen) {
        // On green but no holing putt — assume 2-putt
        score = holeShots.length + 2;
      } else {
        // Not on green — assume chip on + 2-putt
        score = holeShots.length + 3;
      }
      // Clamp to reasonable range: at least par-2, at most par+6
      score = Math.max(par - 2, Math.min(par + 6, score));
    }

    const scoreToPar = score - par;

    const fairwayHit = par >= 4
      ? (knownHole?.fairway_hit ?? (teeShot ? teeShot.lie_after === 'fairway' : null))
      : null;

    // GIR: reached green within par-2 shots. Also counts chip-ins from
    // approach distance and par 3 tee shots hitting the green.
    const girShotLimit = par - 2;
    let greenReachedAt = -1;
    for (let i = 0; i < holeShots.length; i++) {
      const s = holeShots[i]!;
      if (s.lie_after === 'green' || s.result === 'hole' || s.result === 'green' || s.result === 'gir') {
        greenReachedAt = i + 1; // 1-based
        break;
      }
    }
    const gir = knownHole?.gir ?? (greenReachedAt > 0 && greenReachedAt <= girShotLimit);

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
      putts: knownHole?.putts ?? putts.length, fairwayHit, gir,
      threePutt: (knownHole?.putts ?? putts.length) >= 3, onePutt: (knownHole?.putts ?? putts.length) === 1,
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

  // ── Cross-reference with round-level stats ──
  // If the round table has a known total_score, distribute any score
  // discrepancy across incomplete holes so the total matches.
  if (round.total_score && holes.length > 0) {
    const computedTotal = holes.reduce((s, h) => s + h.score, 0);
    const diff = round.total_score - computedTotal;
    if (diff !== 0) {
      // Find holes where data was incomplete (no holed-out shot)
      const incompleteHoles = holes.filter(h => {
        const holeShots2 = byHole.get(h.hole) ?? [];
        const last = holeShots2[holeShots2.length - 1];
        return !(last?.result === 'hole' || last?.putt_made === true);
      });

      if (incompleteHoles.length > 0) {
        // Weight adjustment by confidence: holes with more recorded shots
        // are more likely to have an accurate estimate already, so they
        // receive less adjustment. Holes with fewer shots get more.
        const shotCounts = incompleteHoles.map(h => (byHole.get(h.hole) ?? []).length);
        const totalShots = shotCounts.reduce((a, b) => a + b, 0);

        // Compute inverse-confidence weights (fewer shots = higher weight)
        const weights = shotCounts.map(sc =>
          totalShots > 0 ? 1 - sc / totalShots : 1 / incompleteHoles.length
        );
        const weightSum = weights.reduce((a, b) => a + b, 0);

        let remaining = diff;
        for (let i = 0; i < incompleteHoles.length; i++) {
          if (remaining === 0) break;
          const h = incompleteHoles[i]!;
          const normalizedWeight = weightSum > 0 ? weights[i]! / weightSum : 1 / incompleteHoles.length;
          const adjustment = Math.round(diff * normalizedWeight);
          const clampedAdj = Math.max(-3, Math.min(3, adjustment));
          const finalAdj = Math.abs(remaining) < Math.abs(clampedAdj) ? remaining : clampedAdj;
          h.score += finalAdj;
          h.scoreToPar = h.score - h.par;
          h.scrambleSuccess = h.scrambleAttempt && h.scoreToPar <= 0;
          h.sandSaveSuccess = h.sandSaveAttempt && h.scoreToPar <= 0;
          remaining -= finalAdj;
        }

        // If any remainder, distribute 1 stroke at a time to least-confident holes
        if (remaining !== 0) {
          const sortedByConfidence = [...incompleteHoles].sort((a, b) => {
            const aShots = (byHole.get(a.hole) ?? []).length;
            const bShots = (byHole.get(b.hole) ?? []).length;
            return aShots - bShots; // fewest shots first = least confident
          });
          for (const h of sortedByConfidence) {
            if (remaining === 0) break;
            const adj = remaining > 0 ? 1 : -1;
            h.score += adj;
            h.scoreToPar = h.score - h.par;
            h.scrambleSuccess = h.scrambleAttempt && h.scoreToPar <= 0;
            h.sandSaveSuccess = h.sandSaveAttempt && h.scoreToPar <= 0;
            remaining -= adj;
          }
        }
      }
    }
  }

  return holes;
}

/**
 * Check whether a stored round_stats object is a valid RoundReviewContent
 * (as opposed to an older V1 ReviewKeyStats format or null).
 */
function isValidReviewContent(obj: unknown): obj is RoundReviewContent {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, unknown>;
  // RoundReviewContent always has summary, holeByHole, and scoringDistribution
  return (
    typeof r.summary === 'string' &&
    Array.isArray(r.holeByHole) &&
    r.scoringDistribution !== undefined
  );
}

function missMatches(direction: string | null | undefined, side: 'left' | 'right' | 'short' | 'long'): boolean {
  if (!direction) return false;
  return direction === side || direction.startsWith(`${side}_`) || direction.endsWith(`_${side}`);
}

function isNarrativeCoachHelmSummary(summary: string | null | undefined): summary is string {
  if (!summary) return false;
  if (summary.length < 40) return false;
  return !/expected score|prediction|forecast|range:/i.test(summary) && !/\bNaN\b/.test(summary);
}

function dedupeStrings(items: Array<string | null | undefined>, limit: number): string[] {
  return Array.from(
    new Set(
      items
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item))
    )
  ).slice(0, limit);
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string, limit: number): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = keyFn(item).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function toCoachHelmInsight(insight: ComposedInsight): CoachHelmReviewInsight {
  return {
    headline: insight.headline,
    body: insight.body,
    tone: insight.tone,
    confidence: insight.confidence,
    strokeImpact: insight.strokeImpact,
    evidenceMetrics: insight.evidenceMetrics,
  };
}

function buildCoachHelmHighlight(review: IntelligentRoundReview): RoundReviewHighlight {
  const impact = review.composedReview.strokeImpact != null
    ? ` Estimated impact: ${review.composedReview.strokeImpact.toFixed(1)} strokes.`
    : '';

  return {
    title: review.primaryTakeaway || review.composedReview.headline,
    description: `${review.composedReview.body}${impact}`.trim(),
  };
}

function buildCoachHelmImprovementAreas(review: IntelligentRoundReview): RoundReviewImprovementArea[] {
  const focusArea = review.focusAreas[0] ?? review.primaryTakeaway;
  const practiceArea = review.focusAreas[1];
  const primaryRecommendation = review.practicePriority || review.composedReview.callToAction || review.composedReview.body;

  const areas: RoundReviewImprovementArea[] = [
    {
      area: focusArea,
      recommendation: primaryRecommendation,
    },
  ];

  if (practiceArea && practiceArea !== focusArea) {
    areas.push({
      area: practiceArea,
      recommendation: review.composedReview.body,
    });
  }

  return areas;
}

function mergeCoachHelmReviewContent(
  base: RoundReviewContent,
  review: IntelligentRoundReview
): RoundReviewContent {
  const coachHelmHighlight = buildCoachHelmHighlight(review);
  const coachHelmAreas = buildCoachHelmImprovementAreas(review);
  const deepInsights = [toCoachHelmInsight(review.composedReview)];

  return {
    ...base,
    summary: isNarrativeCoachHelmSummary(review.summary) ? review.summary : base.summary,
    highlights: dedupeByKey(
      [coachHelmHighlight, ...base.highlights],
      (item) => item.title,
      4
    ),
    areasForImprovement: dedupeByKey(
      [...coachHelmAreas, ...base.areasForImprovement],
      (item) => item.area,
      4
    ),
    recommendations: dedupeStrings(
      [
        review.practicePriority,
        review.composedReview.callToAction,
        review.primaryTakeaway,
        ...base.recommendations,
      ],
      6
    ),
    coachHelm: {
      summary: review.summary,
      primaryTakeaway: review.primaryTakeaway,
      practicePriority: review.practicePriority,
      focusAreas: review.focusAreas,
      tone: review.composedReview.tone,
      confidence: review.composedReview.confidence,
    },
    deepInsights,
  };
}

function determineSentiment(scoreToPar: number): ReviewSentiment {
  if (scoreToPar <= -1) return 'positive';
  if (scoreToPar <= 3) return 'neutral';
  return 'challenging';
}

function determineGrade(
  scoreToPar: number,
  girPct: number,
  fairwayPct: number | null,
  putts: number,
  playerAvgs?: { avgScore: number; avgScoreToPar: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number } | null
): OverallGrade {
  let score = 0;
  let factors = 0;

  // Helper: grade a stat relative to the player's own average
  // Returns 1-5 where 5 = exceptional for this player
  const relativeGrade = (val: number, avg: number, better: 'lower' | 'higher'): number => {
    const pctDiff = avg !== 0 ? ((val - avg) / Math.abs(avg)) * 100 : 0;
    // For "lower is better" stats, invert the difference
    const adjustedDiff = better === 'lower' ? -pctDiff : pctDiff;
    if (adjustedDiff > 15) return 5;
    if (adjustedDiff > 5) return 4;
    if (adjustedDiff >= -5) return 3;
    if (adjustedDiff >= -15) return 2;
    return 1;
  };

  if (playerAvgs) {
    // Player-relative grading: compare to their own history
    const avgScoreToPar = playerAvgs.avgScoreToPar;
    const scoreVal = relativeGrade(scoreToPar, avgScoreToPar, 'lower');
    score += scoreVal * 2;
    factors += 2;

    const girVal = relativeGrade(girPct, playerAvgs.avgGirPct, 'higher');
    score += girVal;
    factors++;

    if (fairwayPct !== null) {
      const fwVal = relativeGrade(fairwayPct, playerAvgs.avgFairwayPct, 'higher');
      score += fwVal;
      factors++;
    }

    const puttVal = relativeGrade(putts, playerAvgs.avgPutts, 'lower');
    score += puttVal;
    factors++;
  } else {
    // Fallback: fixed benchmarks (college-level)
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
  }

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
  playerAvgs: { avgScore: number; avgScoreToPar: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number } | null,
  shotRows: ShotRow[] = []
): RoundReviewContent {
  const highlights: RoundReviewHighlight[] = [];
  const areasForImprovement: RoundReviewImprovementArea[] = [];
  const keyStats: RoundReviewKeyStat[] = [];
  const recommendations: string[] = [];

  // Always use round-level totals as ground truth — shot data may be incomplete
  const scoreToPar = round.score_to_par ?? 0;
  const totalScore = round.total_score ?? 72;

  // ===== Compute stats from hole breakdowns, cross-referenced with round-level data =====
  const shotPutts = holes.reduce((s, h) => s + h.putts, 0);
  // Use round-level total_putts as ground truth if available, since shot data
  // may be missing putting shots on some holes
  const totalPutts = round.total_putts ?? shotPutts;
  const threePutts = holes.filter(h => h.threePutt);
  const onePutts = holes.filter(h => h.onePutt);
  const birdieHoles = holes.filter(h => h.scoreToPar === -1);
  const parHoles = holes.filter(h => h.scoreToPar === 0);
  const bogeyHoles = holes.filter(h => h.scoreToPar === 1);
  const doublePlusHoles = holes.filter(h => h.scoreToPar >= 2);
  const eagleHoles = holes.filter(h => h.scoreToPar <= -2);

  // Fairways — prefer round-level data when available
  const fairwayEligible = holes.filter(h => h.fairwayHit !== null);
  const shotFairwaysHit = fairwayEligible.filter(h => h.fairwayHit).length;
  const fairwaysHit = round.total_fairways_hit ?? shotFairwaysHit;
  const fairwayTotal = round.total_fairways ?? fairwayEligible.length;
  const fairwayPct = fairwayTotal > 0 ? Math.round((fairwaysHit / fairwayTotal) * 100) : null;

  // GIR — prefer round-level data when available
  const shotGirHits = holes.filter(h => h.gir);
  const girHitsCount = round.total_gir ?? shotGirHits.length;
  const girTotal = round.total_gir_possible ?? holes.length;
  const girPct = girTotal > 0 ? Math.round((girHitsCount / girTotal) * 100) : 0;
  // shotGirHits used for highlight descriptions (hole numbers)

  const scrambleAttemptsList = holes.filter(h => h.scrambleAttempt);
  const scrambleSuccessList = holes.filter(h => h.scrambleSuccess);
  const scramblePct = scrambleAttemptsList.length > 0 ? Math.round((scrambleSuccessList.length / scrambleAttemptsList.length) * 100) : null;

  const sandAttemptsList = holes.filter(h => h.sandSaveAttempt);
  const sandSuccessList = holes.filter(h => h.sandSaveSuccess);
  const sandSavePct = sandAttemptsList.length > 0 ? Math.round((sandSuccessList.length / sandAttemptsList.length) * 100) : null;

  // Driving miss pattern — use exact match or startsWith/endsWith to avoid
  // double-counting compound values like "left_short"
  const teeShots = shotRows.filter((shot) => shot.shot_type === 'tee');
  const shotLevelDriveMisses = teeShots.filter((shot) =>
    shot.lie_after !== 'fairway' && shot.lie_after !== 'green' && shot.result !== 'fairway'
  );
  const driveMisses = shotLevelDriveMisses.length > 0
    ? shotLevelDriveMisses.map((shot) => ({ driveMiss: shot.miss_direction }))
    : holes.filter(h => h.driveMiss && h.fairwayHit === false);
  const leftMisses = driveMisses.filter(h => missMatches(h.driveMiss, 'left')).length;
  const rightMisses = driveMisses.filter(h => missMatches(h.driveMiss, 'right')).length;
  const dominantMiss = leftMisses > rightMisses ? 'left' : rightMisses > leftMisses ? 'right' : null;

  // Approach miss pattern — prefer shot-level misses when available
  const shotLevelApproachMisses = shotRows.filter((shot) =>
    shot.shot_type === 'approach' && shot.miss_direction
  );
  const approachMisses = shotLevelApproachMisses.length > 0
    ? shotLevelApproachMisses.map((shot) => ({ approachMiss: shot.miss_direction }))
    : holes.filter(h => !h.gir && h.approachMiss);
  const approachShort = approachMisses.filter(h => missMatches(h.approachMiss, 'short')).length;
  const approachLong = approachMisses.filter(h => missMatches(h.approachMiss, 'long')).length;

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

  // ===== STROKES TO GAIN (distance-aware estimates) =====
  const strokesToGain: StrokesToGainItem[] = [];
  if (threePutts.length > 0) {
    // Estimate savings based on first putt distance for each three-putt
    let threePuttSavings = 0;
    for (const tp of threePutts) {
      const dist = tp.firstPuttFeet ?? 20;
      // Three-putt from far = less savings (still hard to 2-putt)
      // Three-putt from close = more savings (should definitely 2-putt)
      if (dist >= 25) threePuttSavings += 0.5;
      else if (dist >= 15) threePuttSavings += 0.7;
      else threePuttSavings += 1.0;
    }
    const roundedSavings = Math.round(threePuttSavings * 10) / 10;
    strokesToGain.push({
      category: 'Putting',
      potentialStrokes: roundedSavings,
      description: `Eliminating ${threePutts.length} three-putt${threePutts.length > 1 ? 's' : ''} saves ~${roundedSavings} stroke${roundedSavings !== 1 ? 's' : ''}`,
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
    // Use actual scramble rate to estimate realistic improvement
    const currentRate = scramblePct / 100;
    const targetRate = Math.min(0.5, currentRate + 0.15); // aim for 15% improvement or 50%, whichever is lower
    const extraSaves = Math.round(scrambleAttemptsList.length * (targetRate - currentRate) * 10) / 10;
    if (extraSaves > 0) {
      strokesToGain.push({
        category: 'Short Game',
        potentialStrokes: Math.round(extraSaves * 10) / 10,
        description: `Improving scramble rate to ${Math.round(targetRate * 100)}% saves ~${extraSaves.toFixed(1)} strokes from ${scrambleAttemptsList.length} attempts`,
      });
    }
  }
  if (girPct < 50 && girTotal > 0) {
    const improvedGir = Math.round(girTotal * 0.5);
    const additionalGIRs = improvedGir - girHitsCount;
    if (additionalGIRs > 0) {
      // GIR holes typically score 0.7 strokes better than non-GIR holes
      const potentialSaves = Math.round(additionalGIRs * 0.7 * 10) / 10;
      strokesToGain.push({
        category: 'Approach Shots',
        potentialStrokes: potentialSaves,
        description: `Hitting ${additionalGIRs} more green${additionalGIRs > 1 ? 's' : ''} in regulation saves ~${potentialSaves} strokes`,
      });
    }
  }
  strokesToGain.sort((a, b) => b.potentialStrokes - a.potentialStrokes);

  // ===== SENTIMENT & GRADE =====
  const sentiment = determineSentiment(scoreToPar);
  const overallGrade = determineGrade(scoreToPar, girPct, fairwayPct, totalPutts, playerAvgs);

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
  // Use stat-appropriate thresholds instead of a universal ±1
  const cmp = (val: number, avg: number | undefined, better: 'lower' | 'higher', threshold: number = 1): StatComparison => {
    if (!avg) return 'average';
    const diff = val - avg;
    if (better === 'lower') return diff < -threshold ? 'above' : diff > threshold ? 'below' : 'average';
    return diff > threshold ? 'above' : diff < -threshold ? 'below' : 'average';
  };

  keyStats.push({ label: 'Total Putts', value: `${totalPutts}`, comparison: cmp(totalPutts, playerAvgs?.avgPutts, 'lower', 2) });
  keyStats.push({ label: 'Greens in Reg', value: `${girHitsCount}/${girTotal} (${girPct}%)`, comparison: cmp(girPct, playerAvgs?.avgGirPct, 'higher', 5) });
  if (fairwayPct !== null) {
    keyStats.push({ label: 'Fairways', value: `${fairwaysHit}/${fairwayTotal} (${fairwayPct}%)`, comparison: cmp(fairwayPct, playerAvgs?.avgFairwayPct, 'higher', 5) });
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
    const desc = bestHoles.map(h => {
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
      description: `Converted on holes ${onePutts.map(h => `#${h.hole}`).join(', ')}.`,
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
      description: `Hit ${fairwaysHit}/${fairwayTotal} fairways (${fairwayPct}%).`,
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
      recommendation: `Only hit ${girHitsCount} of ${girTotal} greens. This put constant pressure on your short game.`,
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
// OWNERSHIP VERIFICATION HELPER
// ============================================================================

/**
 * Verify the current user has access to a review's player data.
 * Returns the user and player info if authorized, or an error.
 * Access is granted if the user IS the player, or is a coach on the player's team.
 */
async function verifyReviewAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  role: 'player' | 'player_or_coach'
): Promise<{ authorized: boolean; userId?: string; playerId?: string; error?: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Check if user is the player
  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerRecord) {
    return { authorized: true, userId: user.id, playerId: playerRecord.id };
  }

  // For player-only actions, deny here
  if (role === 'player') {
    return { authorized: false, error: 'Not authorized - you do not own this review' };
  }

  // Check if user is a coach with access to this player via organization -> team -> membership
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach?.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .limit(1)
      .maybeSingle();

    if (team) {
      const { data: teamMember } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .maybeSingle();

      if (teamMember) {
        return { authorized: true, userId: user.id, playerId };
      }
    }
  }

  return { authorized: false, error: 'Not authorized to access this review' };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

export async function getRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  if (!isValidUuid(roundId)) return { success: false, error: 'Invalid round ID format' };
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

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, existingReview.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: true, review: undefined };
    }

    if (!isValidReviewContent(existingReview.round_stats)) {
      return { success: true, review: undefined };
    }

    const roundData = existingReview.round as RoundData;
    const review: RoundReviewWithRound = {
      id: existingReview.id,
      player_id: existingReview.player_id,
      round_id: existingReview.round_id,
      review_content: existingReview.round_stats as unknown as RoundReviewContent,
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
  } catch {
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

    // Verify the caller owns this player or is their coach
    const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized to generate review for this player' };
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

    // Fetch shot-level data
    const { data: shots } = await supabase
      .from('golf_shots')
      .select('hole_number, shot_number, shot_type, club_used, distance_to_hole_before, distance_unit_before, result, lie_before, lie_after, miss_direction, putt_distance_feet, shot_distance, is_penalty, putt_made')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true });

    // Fetch hole-level data (par, recorded score) — used as ground truth for
    // par values and scores when shot data is incomplete
    const { data: holeRows } = await supabase
      .from('golf_holes')
      .select('hole_number, par, score, putts, fairway_hit, gir')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true });

    const shotRows = (shots ?? []) as unknown as ShotRow[];
    const holeParRows = (holeRows ?? []) as unknown as HoleParRow[];
    // Build hole breakdowns if we have ANY data (shots or hole-level records)
    const hasData = shotRows.length > 0 || holeParRows.length > 0;
    const holeBreakdowns = hasData
      ? buildHoleBreakdowns(shotRows, roundData, holeParRows.length > 0 ? holeParRows : undefined)
      : [];

    const { data: playerRounds } = await supabase
      .from('golf_rounds')
      .select('total_score, score_to_par, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .neq('id', roundId)
      .order('round_date', { ascending: false })
      .limit(20);

    const playerAvgs = calculateComparisonAverages((playerRounds ?? []) as ComparisonRoundRow[]);

    let reviewContent = generateReviewContent(roundData, holeBreakdowns, playerAvgs, shotRows);

    let coachHelmReview: IntelligentRoundReview | null = null;
    let coachHelmEnhanced = false;

    if (shotRows.length > 0) {
      try {
        const coachHelmStatus = await isCoachHelmEnabledForPlayer(playerId);
        if (coachHelmStatus.effectivelyEnabled) {
          coachHelmReview = await coachHelmIntelligence.generateRoundReview(roundId, playerId);

          if (coachHelmReview) {
            reviewContent = mergeCoachHelmReviewContent(reviewContent, coachHelmReview);
            coachHelmEnhanced = true;
          }
        }
      } catch (error) {
        console.error('[RoundReview] CoachHelm V2 enhancement failed:', error);
      }
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
          primary_takeaway: coachHelmReview?.primaryTakeaway ?? null,
          next_practice_priority: coachHelmReview?.practicePriority ?? null,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          engine_version: coachHelmEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
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
          primary_takeaway: coachHelmReview?.primaryTakeaway ?? null,
          next_practice_priority: coachHelmReview?.practicePriority ?? null,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          round_score: roundData.total_score,
          round_score_to_par: roundData.score_to_par,
          engine_version: coachHelmEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
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
      ai_model_version: coachHelmEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
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
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isValidUuid(reviewId)) return { success: false, error: 'Invalid review ID format' };
  const supabase = await createClient();
  try {
    // Fetch the review to verify ownership
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is the player who owns this review
    const access = await verifyReviewAccess(supabase, review.player_id, 'player');
    if (!access.authorized) {
      return { success: false, error: 'Not authorized to share this review' };
    }

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
  playerAvg?: { avgScore: number; avgScoreToPar: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  teamAvg?: { avgScore: number; avgScoreToPar: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  error?: string;
}> {
  const supabase = await createClient();
  try {
    // Verify the current user owns this player record or is a coach on their team
    const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const { data: playerRounds, error: playerError } = await supabase
      .from('golf_rounds')
      .select('total_score, score_to_par, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(20);

    if (playerError) return { success: false, error: 'Failed to fetch player stats' };

    const playerAvg = calculateComparisonAverages((playerRounds ?? []) as ComparisonRoundRow[]) ?? undefined;

    let teamAvg = undefined;
    if (teamId) {
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');

      if (teamMembers && teamMembers.length > 0) {
        const playerIds = teamMembers.map(m => m.player_id);
        const { data: teamRounds } = await supabase
          .from('golf_rounds')
          .select('total_score, score_to_par, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, holes_played')
          .in('player_id', playerIds)
          .eq('status', 'completed')
          .not('total_score', 'is', null)
          .gte('round_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .limit(100);

        if (teamRounds && teamRounds.length >= 5) {
          teamAvg = calculateComparisonAverages((teamRounds ?? []) as ComparisonRoundRow[]) ?? undefined;
        }
      }
    }

    return { success: true, playerAvg, teamAvg };
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}
