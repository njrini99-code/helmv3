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
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { coachHelmIntelligence, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2';
import type { ComposedInsight, InsightEvidenceMetric, IntelligentRoundReview } from '@/lib/coachhelm/v2';
import type { Json } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess as sharedVerifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { generateReviewContent } from './round-review-content';
import { withAdminObserved } from '@/lib/admin/observed-action';

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean { return UUID_REGEX.test(id); }

// ============================================================================
// TYPES
// ============================================================================

export type ReviewSentiment = 'positive' | 'neutral' | 'challenging';
export type OverallGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type StatComparison = 'above' | 'below' | 'average';

/** Whether a highlight/area came from THIS round's data or from a longer-term
 *  trend (CoachHelm career-level insight). Drives a small UI badge so users
 *  don't conflate "your driving was bad today" with "your driving is a 90-day
 *  weakness". Defaults to 'round' for backward compatibility on stored data. */
export type RoundReviewItemSource = 'round' | 'trend';

export interface RoundReviewHighlight {
  title: string;
  description: string;
  source?: RoundReviewItemSource;
}

export interface RoundReviewImprovementArea {
  area: string;
  recommendation: string;
  source?: RoundReviewItemSource;
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

  // Scoring distribution (hole numbers per category).
  // The eagle/birdie/par/bogey/doublePlus buckets are mutually exclusive and
  // cover every integer scoreToPar value (≤-2, -1, 0, 1, ≥2). `holesPlayed`
  // is the denominator: number of holes that contributed a real score to
  // the distribution. On incomplete rounds it can be < 18 — consumers should
  // use `holesPlayed` (when present) rather than assuming 18.
  scoringDistribution: {
    eagles: number[];
    birdies: number[];
    pars: number[];
    bogeys: number[];
    doublePlus: number[];
    holesPlayed?: number;
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
export interface RoundData {
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
  holes_played?: number | null;
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

/**
 * Player/team comparison averages. Each field is independently null when the
 * round history can't honestly support it (no 18-hole rounds for avgScore,
 * no putt/GIR/fairway data for the others). Consumers must SKIP a comparison
 * whose average is null — never substitute a fabricated benchmark.
 */
export interface ComparisonAverages {
  avgScore: number | null;
  avgScoreToPar: number | null;
  avgPutts: number | null;
  avgGirPct: number | null;
  avgFairwayPct: number | null;
}

// Shot row from golf_shots table
export interface ShotRow {
  hole_number: number;
  shot_number: number;
  shot_type: string;
  club_type: string | null;
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

function calculateComparisonAverages(rounds: ComparisonRoundRow[]): ComparisonAverages | null {
  const valid = rounds.filter(r => r.total_score !== null);
  if (valid.length < 3) return null;

  // Null-honest throughout: when a stat has no supporting data we return null
  // for that field instead of a fabricated benchmark (72 / 32 / 50%). These
  // values are presented to players as "your averages" — fabricating them
  // turns the comparison card into fiction.
  const rounds18 = valid.filter(r => (r.holes_played ?? 18) === 18);
  const avgScore = rounds18.length > 0
    ? rounds18.reduce((sum, round) => sum + (round.total_score ?? 0), 0) / rounds18.length
    : null;

  const roundsWithToPar = valid.filter(r => r.score_to_par !== null);
  const avgScoreToPar = roundsWithToPar.length > 0
    ? roundsWithToPar.reduce((sum, round) => {
      const holesPlayed = round.holes_played ?? 18;
      return sum + ((round.score_to_par ?? 0) * (18 / holesPlayed));
    }, 0) / roundsWithToPar.length
    : null;

  const puttRounds = valid.filter(r => r.total_putts !== null);
  const puttHoles = puttRounds.reduce((sum, round) => sum + (round.holes_played ?? 18), 0);
  const totalPutts = puttRounds.reduce((sum, round) => sum + (round.total_putts ?? 0), 0);
  // Round at the source so no consumer (UI labels, tooltips) ever prints a raw
  // float like "76.11111111111113%". Grade/comparison logic is unaffected.
  const avgPutts = puttHoles > 0 ? Math.round((totalPutts / puttHoles) * 18) : null;

  // Weighted averages: (Σ made ÷ Σ opportunities) × 100, NOT the mean of
  // per-round percentages — a 9-hole round contributes 9 opportunities, not a
  // full vote, so short or partial rounds no longer skew the average.
  const girRounds = valid.filter(r => r.total_gir !== null && r.total_gir_possible);
  const girHit = girRounds.reduce((sum, round) => sum + (round.total_gir ?? 0), 0);
  const girPossible = girRounds.reduce((sum, round) => sum + (round.total_gir_possible ?? 0), 0);
  const avgGirPct = girPossible > 0 ? Math.round((girHit / girPossible) * 100) : null;

  const fwRounds = valid.filter(r => r.total_fairways_hit !== null && r.total_fairways);
  const fwHit = fwRounds.reduce((sum, round) => sum + (round.total_fairways_hit ?? 0), 0);
  const fwPossible = fwRounds.reduce((sum, round) => sum + (round.total_fairways ?? 0), 0);
  const avgFairwayPct = fwPossible > 0 ? Math.round((fwHit / fwPossible) * 100) : null;

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
    // A greenside-bunker visit is the sand-save attempt; do NOT gate on !gir
    // (canonical denominator = bunker visits, matching the cache — STAGE 4).
    const sandSaveAttempt = hadBunkerShot;
    const sandSaveSuccess = sandSaveAttempt && scoreToPar <= 0;

    const driveDist = teeShot?.shot_distance ? parseFloat(teeShot.shot_distance) : null;
    const driveMiss = teeShot?.miss_direction ?? null;
    const driveClub = teeShot?.club_type ?? null;

    const firstPutt = putts[0];
    const firstPuttFeet = firstPutt?.putt_distance_feet ? parseFloat(firstPutt.putt_distance_feet) : null;

    const approachShot = holeShots.find(s =>
      s.shot_type === 'approach' || (s.shot_type === 'around_green' && !gir)
    );
    const approachClub = approachShot?.club_type ?? null;
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

function buildCoachHelmHighlight(review: IntelligentRoundReview): RoundReviewHighlight | null {
  // Only surface the CoachHelm composed insight in HIGHLIGHTS when the tone is
  // actually positive. A `cautionary`/`urgent` takeaway with body like
  // "92% of your missed approaches are severe" is a weakness — putting it in
  // Highlights reads like the engine is celebrating a problem.
  const tone = review.composedReview.tone;
  if (tone !== 'encouraging' && tone !== 'celebratory') {
    return null;
  }

  const impact = review.composedReview.strokeImpact != null
    ? ` Estimated impact: ${review.composedReview.strokeImpact.toFixed(1)} strokes.`
    : '';

  return {
    title: review.primaryTakeaway || review.composedReview.headline,
    description: `${review.composedReview.body}${impact}`.trim(),
    source: 'trend',
  };
}

function buildCoachHelmImprovementAreas(review: IntelligentRoundReview): RoundReviewImprovementArea[] {
  const focusArea = review.focusAreas[0] ?? review.primaryTakeaway;
  const primaryRecommendation = review.practicePriority || review.composedReview.callToAction || review.composedReview.body;

  // Only emit the primary focus area. The original code also pushed
  // `focusAreas[1]` with `composedReview.body` as its recommendation — but
  // `body` describes the PRIMARY weakness, so the second card displayed a
  // mismatched (e.g. "Driving" header with approach-miss body). Without a
  // per-area recommendation in the IntelligentRoundReview shape, the second
  // entry can't have honest content.
  return [
    {
      area: focusArea,
      recommendation: primaryRecommendation,
      source: 'trend',
    },
  ];
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
    summary: base.summary,
    highlights: dedupeByKey(
      coachHelmHighlight ? [coachHelmHighlight, ...base.highlights] : base.highlights,
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

// ============================================================================
// OWNERSHIP VERIFICATION HELPER
// ============================================================================

/**
 * Verify the current user has access to a review's player data.
 *
 * Thin wrapper over the shared `verifyPlayerAccess` helper
 * (`@/lib/auth/verify-player-access`) that preserves the local
 * `{ authorized, userId, playerId, error }` shape callers in this file rely on.
 *
 * Access is granted if:
 *   1. The user IS the player (self), OR
 *   2. `role === 'player_or_coach'` and the user is a coach staffing ANY team
 *      the player is an active member of (multi-team-safe via
 *      `public.verify_coach_owns_player` RPC).
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

  const access = await sharedVerifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) {
    return { authorized: false, error: 'Not authorized to access this review' };
  }

  if (access.reason === 'self') {
    return { authorized: true, userId: user.id, playerId };
  }

  // Coach branch — player-only actions deny coaches.
  if (role === 'player') {
    return { authorized: false, error: 'Not authorized - you do not own this review' };
  }

  return { authorized: true, userId: user.id, playerId };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

async function getRoundReviewImpl(roundId: string): Promise<{
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
      review_content: existingReview.round_stats,
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
    await logServerError(
      `[RoundReview] getRoundReview failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'round_review_system.getRoundReview', featureArea: 'round_reviews', roundId }
    );
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGetRoundReview = withAdminObserved(
  'getRoundReview',
  { sport: 'golf', feature: 'round_review_ai' },
  getRoundReviewImpl,
);

export async function getRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  return observedGetRoundReview(roundId);
}

type GenerateReviewResult = {
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
};

/**
 * P2-13 — single-flight coordinator keyed by `round_id`.
 *
 * The cold round-review path is reachable from three places at once: the
 * review PAGE's auto-generate effect, the `useRoundReviewV2` hook's
 * auto-generate effect, and (via the hook) the AI-enhance pass. The DB upsert
 * (UNIQUE on round_id) already collapses the *row*, but each caller still ran
 * the full expensive `coachHelmIntelligence.generateRoundReview` analysis —
 * computing the same review up to three times (latency, cost, race risk).
 *
 * This process-global map locks the COMPUTATION by round_id: the first cold
 * request seeds the promise; concurrent requests for the same round await that
 * same promise and resolve from the SAME analysis job (and the SAME review id).
 * The entry is cleared when the promise settles so a later user-triggered
 * Refresh always recomputes. Auth + access are checked PER caller BEFORE the
 * lock (security is never shared), so an unauthorized caller can never piggyback
 * an authorized caller's in-flight job.
 */
const inFlightRoundReviews = new Map<string, Promise<GenerateReviewResult>>();

async function generateAndStoreRoundReviewImpl(
  roundId: string,
  playerId: string
): Promise<GenerateReviewResult> {
  const supabase = await createClient();

  // Auth + access are verified per-caller, never shared through the coordinator.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }
  const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
  if (!access.authorized) {
    return { success: false, error: access.error || 'Not authorized to generate review for this player' };
  }

  // Single-flight by round_id: join an in-progress analysis instead of
  // dispatching a second concurrent compute for the same round.
  const existing = inFlightRoundReviews.get(roundId);
  if (existing) {
    return existing;
  }

  const run = computeAndStoreRoundReview(roundId, playerId);
  inFlightRoundReviews.set(roundId, run);
  try {
    return await run;
  } finally {
    // Clear only if we still own the slot (a settled job must not evict a newer
    // run that a later Refresh may have started).
    // NOTE: `run` is intentionally NOT awaited a second time here — it was
    // already awaited above via `return await run;`. This is a Promise
    // *reference* (identity) comparison against the map entry, used solely to
    // detect whether a later caller has since replaced this round's in-flight
    // slot with a newer job; awaiting would resolve to the settled value and
    // defeat the identity check.
    if (inFlightRoundReviews.get(roundId) === run) {
      inFlightRoundReviews.delete(roundId);
    }
  }
}

const observedGenerateAndStoreRoundReview = withAdminObserved(
  'generateAndStoreRoundReview',
  { sport: 'golf', feature: 'round_review_ai' },
  generateAndStoreRoundReviewImpl,
);

export async function generateAndStoreRoundReview(roundId: string, playerId: string): Promise<GenerateReviewResult> {
  return observedGenerateAndStoreRoundReview(roundId, playerId);
}

/**
 * The expensive compute + idempotent upsert. Invoked through the
 * {@link generateAndStoreRoundReview} coordinator so concurrent cold callers
 * share ONE invocation. Assumes the caller already verified auth + access.
 */
async function computeAndStoreRoundReview(
  roundId: string,
  playerId: string
): Promise<GenerateReviewResult> {
  const supabase = await createClient();

  try {
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, course_name, round_date, total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, holes_played, status')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // RoundData defines `status?: string`; the typed select returns `string | null`.
    // The narrowing is safe but TS needs the bridge cast.
    const roundData = round as RoundData;
    if (roundData.status !== 'completed') {
      return { success: false, error: 'Round must be completed before generating a review' };
    }

    // Fetch shot-level data
    const { data: shots } = await supabase
      .from('golf_shots')
      .select('hole_number, shot_number, shot_type, club_type, distance_to_hole_before, distance_unit_before, result, lie_before, lie_after, miss_direction, putt_distance_feet, shot_distance, is_penalty, putt_made')
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

    // Local ShotRow models distance fields as `string | null` to match the
    // historical parseFloat() callers in this file; the DB returns them as
    // `number | null`. parseFloat() accepts both, so the runtime is safe — the
    // cast bridges the static-type mismatch only.
    const shotRows = (shots ?? []) as unknown as ShotRow[];
    const holeParRows = (holeRows ?? []) as HoleParRow[];
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
        await logServerError(`[RoundReview] CoachHelm V2 enhancement failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'round_review_system.generateAndStoreRoundReview' });
      }
    }

    // Single upsert keyed by round_id. The `golf_round_reviews_round_id_unique`
    // UNIQUE index on (round_id) means concurrent generations for the same
    // round (e.g. user-triggered + auto-retry from useRoundReviewV2) collapse
    // safely into one row. The previous select-then-update/insert pattern had
    // a TOCTOU race window between the SELECT and the INSERT where two
    // concurrent calls could both read "no existing" and then race the INSERT,
    // with the loser hitting a UNIQUE-violation error path.
    //
    // Payload mirrors the prior INSERT path 1:1, plus the counter columns
    // (highlights_count, areas_count, insights_count) and engine_version that
    // tonight's counter-fix relies on. round_score / round_score_to_par stay
    // populated so historical lookups by round outcome work.
    const highlightsCount = Array.isArray(reviewContent.highlights) ? reviewContent.highlights.length : 0;
    const areasCount = Array.isArray(reviewContent.areasForImprovement) ? reviewContent.areasForImprovement.length : 0;
    const insightsCount = Array.isArray(reviewContent.deepInsights)
      ? reviewContent.deepInsights.length
      : Array.isArray(reviewContent.keyStats) ? reviewContent.keyStats.length : 0;

    const { data: upserted, error: upsertError } = await supabase
      .from('golf_round_reviews')
      .upsert(
        {
          round_id: roundId,
          player_id: playerId,
          // Json's index signature does not accept typed shapes with optional
          // properties; double-cast through unknown is required by TS.
          round_stats: reviewContent as unknown as Json,
          summary: reviewContent.summary,
          primary_takeaway: coachHelmReview?.primaryTakeaway ?? null,
          next_practice_priority: coachHelmReview?.practicePriority ?? null,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          highlights_count: highlightsCount,
          areas_count: areasCount,
          insights_count: insightsCount,
          round_score: roundData.total_score,
          round_score_to_par: roundData.score_to_par,
          engine_version: coachHelmEnhanced ? 'coachhelm-v2' : 'rule-based-v2',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'round_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (upsertError || !upserted) return { success: false, error: 'Failed to save review' };
    const reviewId: string = upserted.id;

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
  } catch (error) {
    await logServerError(
      `[RoundReview] generateAndStoreRoundReview failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'round_review_system.generateAndStoreRoundReview', featureArea: 'round_reviews', roundId, playerId }
    );
    return { success: false, error: 'An unexpected error occurred' };
  }
}

async function shareRoundReviewWithCoachImpl(reviewId: string): Promise<{
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
  } catch (error) {
    await logServerError(
      `[RoundReview] shareRoundReviewWithCoach failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'round_review_system.shareRoundReviewWithCoach', featureArea: 'round_reviews' }
    );
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedShareRoundReviewWithCoach = withAdminObserved(
  'shareRoundReviewWithCoach',
  { sport: 'golf', feature: 'round_review_ai' },
  shareRoundReviewWithCoachImpl,
);

export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return observedShareRoundReviewWithCoach(reviewId);
}

async function getStatAveragesImpl(
  playerId: string,
  teamId?: string
): Promise<{
  success: boolean;
  playerAvg?: ComparisonAverages;
  teamAvg?: ComparisonAverages;
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

    // Player-scoped RLS on golf_rounds returns only own rounds, so the team
    // comparison would always be sparse. We've already authorized the caller
    // for this player via verifyReviewAccess above; the team aggregate output
    // reveals no individual-round data, so the admin client is safe here.
    const admin = createAdminClient();

    // Resolve the player's active team when the caller doesn't supply one.
    // golf_players has no team_id column — team scope is derived via
    // golf_team_members (status='active'). Without this lookup the teamAvg
    // branch below never runs and the "vs team" comparison is silently dead.
    let resolvedTeamId = teamId;
    if (!resolvedTeamId) {
      const { data: ownMembership } = await admin
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', playerId)
        .eq('status', 'active')
        .maybeSingle();
      resolvedTeamId = ownMembership?.team_id ?? undefined;
    }

    let teamAvg = undefined;
    if (resolvedTeamId) {
      const { data: teamMembers } = await admin
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', resolvedTeamId)
        .eq('status', 'active');

      if (teamMembers && teamMembers.length > 0) {
        const playerIds = teamMembers.map(m => m.player_id);
        const { data: teamRounds } = await admin
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
  } catch (error) {
    await logServerError(
      `[RoundReview] getStatAverages failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'round_review_system.getStatAverages', featureArea: 'round_reviews', playerId }
    );
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGetStatAverages = withAdminObserved(
  'getStatAverages',
  { sport: 'golf', feature: 'round_review_ai' },
  getStatAveragesImpl,
);

export async function getStatAverages(playerId: string, teamId?: string): Promise<{
  success: boolean;
  playerAvg?: ComparisonAverages;
  teamAvg?: ComparisonAverages;
  error?: string;
}> {
  return observedGetStatAverages(playerId, teamId);
}

/**
 * Season-level standing snapshot for the round-review surface.
 *
 * Thin auth-checked wrapper over `loadPlayerStandingMap` (v3 standing loader,
 * which uses the admin client and so can't be called from a client component).
 * Returns a plain `Record<metric_id, PlayerStanding>` so it serializes cleanly
 * across the server→client boundary; the StandingBar band on the round-review
 * page joins these season rows by canonical metric_id (gir_pct + the SG
 * metrics this round exercised). It does NOT use round-level values — the
 * standing `player_value` is the season figure the PGA/team markers are
 * calibrated against.
 *
 * Auth mirrors `getStatAverages` exactly: the caller must be the player (self)
 * or a coach on a team the player is an active member of
 * (`verifyReviewAccess(..., 'player_or_coach')`). Returns `{}` on any failure
 * or cold-start (cron hasn't populated standing yet) so the surface degrades
 * gracefully to its existing RoundStatsComparison fallback.
 */
async function getPlayerStandingForReviewImpl(
  playerId: string,
): Promise<Record<string, PlayerStanding>> {
  if (!isValidUuid(playerId)) return {};
  const supabase = await createClient();
  try {
    const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
    if (!access.authorized) return {};

    const map = await loadPlayerStandingMap(playerId);
    return Object.fromEntries(map) as Record<string, PlayerStanding>;
  } catch (error) {
    await logServerError(
      `[RoundReview] getPlayerStandingForReview failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'round_review_system.getPlayerStandingForReview', featureArea: 'round_reviews', playerId }
    );
    return {};
  }
}

const observedGetPlayerStandingForReview = withAdminObserved(
  'getPlayerStandingForReview',
  { sport: 'golf', feature: 'round_review_ai' },
  getPlayerStandingForReviewImpl,
);

export async function getPlayerStandingForReview(playerId: string): Promise<Record<string, PlayerStanding>> {
  return observedGetPlayerStandingForReview(playerId);
}
