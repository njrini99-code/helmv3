'use server';

/**
 * Round Review System - Server Actions
 *
 * Complete round review management including:
 * - Fetching existing reviews
 * - Generating and storing AI reviews
 * - Regenerating reviews with latest AI
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

export interface RoundReviewContent {
  summary: string;
  sentiment: ReviewSentiment;
  highlights: RoundReviewHighlight[];
  areasForImprovement: RoundReviewImprovementArea[];
  keyStats: RoundReviewKeyStat[];
  recommendations: string[];
  overallGrade: OverallGrade;
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

// Internal round type for processing (matches database.types.ts schema)
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

// Per-hole analysis computed from shots
interface HoleBreakdown {
  hole: number;
  par: number;
  score: number;
  scoreToPar: number;
  putts: number;
  fairwayHit: boolean | null; // null for par 3
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build per-hole breakdowns from shot-level data
 */
function buildHoleBreakdowns(shots: ShotRow[], _round: RoundData): HoleBreakdown[] {
  // Group shots by hole
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

    // Infer par: 165y tee = par 3, 530y = par 5, else par 4
    const teeDistYards = teeShot ? parseFloat(teeShot.distance_to_hole_before ?? '0') : 400;
    const par = teeDistYards <= 250 ? 3 : teeDistYards >= 470 ? 5 : 4;

    const score = holeShots.length; // total shots = score
    const scoreToPar = score - par;

    // Fairway: only par 4/5, check if tee shot result is 'fairway'
    const fairwayHit = par >= 4 && teeShot ? (teeShot.lie_after === 'fairway') : null;

    // GIR: reached green in (par - 2) shots or fewer
    const girShotLimit = par - 2;
    const greenReachedAt = holeShots.findIndex(s => s.lie_after === 'green') + 1;
    const gir = greenReachedAt > 0 && greenReachedAt <= girShotLimit;

    // Scramble: missed GIR but made par or better
    const scrambleAttempt = !gir;
    const scrambleSuccess = scrambleAttempt && scoreToPar <= 0;

    // Sand save: had a bunker shot around the green and made par or better
    const hadBunkerShot = holeShots.some(s =>
      (s.shot_type === 'around_green' || s.shot_type === 'approach') && s.lie_before === 'sand'
    );
    const sandSaveAttempt = hadBunkerShot && !gir;
    const sandSaveSuccess = sandSaveAttempt && scoreToPar <= 0;

    // Drive details
    const driveDist = teeShot?.shot_distance ? parseFloat(teeShot.shot_distance) : null;
    const driveMiss = teeShot?.miss_direction ?? null;
    const driveClub = teeShot?.club_used ?? null;

    // First putt distance
    const firstPutt = putts[0];
    const firstPuttFeet = firstPutt?.putt_distance_feet ? parseFloat(firstPutt.putt_distance_feet) : null;

    // Approach shot (first non-tee, non-putting shot that targets the green)
    const approachShot = holeShots.find(s =>
      s.shot_type === 'approach' || (s.shot_type === 'around_green' && !gir)
    );
    const approachClub = approachShot?.club_used ?? null;
    const approachDist = approachShot?.distance_to_hole_before ? parseFloat(approachShot.distance_to_hole_before) : null;
    const approachMiss = approachShot?.miss_direction ?? null;

    holes.push({
      hole: h,
      par,
      score,
      scoreToPar,
      putts: putts.length,
      fairwayHit,
      gir,
      threePutt: putts.length >= 3,
      onePutt: putts.length === 1,
      penalties,
      scrambleAttempt,
      scrambleSuccess,
      sandSaveAttempt,
      sandSaveSuccess,
      driveClub,
      driveDist: driveDist ? Math.round(driveDist) : null,
      driveMiss,
      firstPuttFeet,
      approachClub,
      approachDist: approachDist ? Math.round(approachDist) : null,
      approachMiss,
    });
  }
  return holes;
}

/**
 * Determine sentiment based on score to par
 */
function determineSentiment(scoreToPar: number): ReviewSentiment {
  if (scoreToPar <= -1) return 'positive';
  if (scoreToPar <= 3) return 'neutral';
  return 'challenging';
}

/**
 * Determine overall grade
 */
function determineGrade(scoreToPar: number, girPct: number, fairwayPct: number | null, putts: number): OverallGrade {
  let score = 0;
  let factors = 0;

  // Score to par (weighted 2x)
  const scoreVal = scoreToPar <= -3 ? 5 : scoreToPar <= -1 ? 4 : scoreToPar <= 1 ? 3.5 : scoreToPar <= 3 ? 3 : scoreToPar <= 5 ? 2 : 1;
  score += scoreVal * 2;
  factors += 2;

  // GIR
  const girVal = girPct >= 70 ? 5 : girPct >= 60 ? 4 : girPct >= 50 ? 3 : girPct >= 40 ? 2 : 1;
  score += girVal;
  factors++;

  // Fairways
  if (fairwayPct !== null) {
    const fwVal = fairwayPct >= 70 ? 5 : fairwayPct >= 60 ? 4 : fairwayPct >= 50 ? 3 : fairwayPct >= 40 ? 2 : 1;
    score += fwVal;
    factors++;
  }

  // Putts
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
 * Generate review content from round data + actual shot data
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

  // --- Compute real stats from hole breakdowns ---
  const totalPutts = holes.reduce((s, h) => s + h.putts, 0);
  const threePutts = holes.filter(h => h.threePutt);
  const onePutts = holes.filter(h => h.onePutt);
  const birdies = holes.filter(h => h.scoreToPar === -1);
  const pars = holes.filter(h => h.scoreToPar === 0);
  const bogeys = holes.filter(h => h.scoreToPar === 1);
  const doublePlus = holes.filter(h => h.scoreToPar >= 2);
  const eagles = holes.filter(h => h.scoreToPar <= -2);

  const fairwayHoles = holes.filter(h => h.fairwayHit !== null);
  const fairwaysHit = fairwayHoles.filter(h => h.fairwayHit).length;
  const fairwayPct = fairwayHoles.length > 0 ? Math.round((fairwaysHit / fairwayHoles.length) * 100) : null;

  const girHoles = holes.filter(h => h.gir);
  const girPct = holes.length > 0 ? Math.round((girHoles.length / holes.length) * 100) : 0;

  const scrambleAttempts = holes.filter(h => h.scrambleAttempt);
  const scrambleSuccesses = holes.filter(h => h.scrambleSuccess);
  const scramblePct = scrambleAttempts.length > 0 ? Math.round((scrambleSuccesses.length / scrambleAttempts.length) * 100) : null;

  const sandAttempts = holes.filter(h => h.sandSaveAttempt);
  const sandSuccesses = holes.filter(h => h.sandSaveSuccess);

  // Driving miss pattern
  const driveMisses = holes.filter(h => h.driveMiss && h.fairwayHit === false);
  const leftMisses = driveMisses.filter(h => h.driveMiss?.includes('left')).length;
  const rightMisses = driveMisses.filter(h => h.driveMiss?.includes('right')).length;
  const dominantMiss = leftMisses > rightMisses ? 'left' : rightMisses > leftMisses ? 'right' : null;

  // Approach miss pattern
  const approachMisses = holes.filter(h => !h.gir && h.approachMiss);
  const approachShort = approachMisses.filter(h => h.approachMiss?.includes('short')).length;
  const approachLong = approachMisses.filter(h => h.approachMiss?.includes('long')).length;

  // First putt distance analysis
  const firstPuttDists = holes.filter(h => h.firstPuttFeet !== null).map(h => h.firstPuttFeet!);
  const avgFirstPuttDist = firstPuttDists.length > 0 ? Math.round(firstPuttDists.reduce((a, b) => a + b, 0) / firstPuttDists.length) : null;

  // Driving distance
  const driveDists = holes.filter(h => h.driveDist !== null && h.par >= 4).map(h => h.driveDist!);
  const avgDriveDist = driveDists.length > 0 ? Math.round(driveDists.reduce((a, b) => a + b, 0) / driveDists.length) : null;

  // Worst holes (biggest blow-ups)
  const worstHoles = [...holes].sort((a, b) => b.scoreToPar - a.scoreToPar).filter(h => h.scoreToPar >= 2);

  // Best holes
  const bestHoles = [...holes].sort((a, b) => a.scoreToPar - b.scoreToPar).filter(h => h.scoreToPar <= -1);

  // --- Sentiment & grade ---
  const sentiment = determineSentiment(scoreToPar);
  const overallGrade = determineGrade(scoreToPar, girPct, fairwayPct, totalPutts);

  // --- SUMMARY: reference specific holes ---
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

  // Scoring distribution summary
  const scoreParts: string[] = [];
  if (eagles.length > 0) scoreParts.push(`${eagles.length} eagle${eagles.length > 1 ? 's' : ''}`);
  if (birdies.length > 0) scoreParts.push(`${birdies.length} birdie${birdies.length > 1 ? 's' : ''}`);
  scoreParts.push(`${pars.length} par${pars.length !== 1 ? 's' : ''}`);
  if (bogeys.length > 0) scoreParts.push(`${bogeys.length} bogey${bogeys.length > 1 ? 's' : ''}`);
  if (doublePlus.length > 0) scoreParts.push(`${doublePlus.length} double+`);
  summary += scoreParts.join(', ') + '. ';

  // Mention where strokes were lost
  if (worstHoles.length > 0) {
    const blowupHoles = worstHoles.slice(0, 2).map(h => `#${h.hole} (+${h.scoreToPar})`).join(' and ');
    summary += `Biggest damage came on hole${worstHoles.length > 1 ? 's' : ''} ${blowupHoles}. `;
  }
  if (bestHoles.length > 0 && bestHoles.length <= 3) {
    const birdieHoles = bestHoles.map(h => `#${h.hole}`).join(', ');
    summary += `Picked up strokes on ${birdieHoles}. `;
  }

  // --- KEY STATS with real data ---
  const cmp = (val: number, avg: number | undefined, better: 'lower' | 'higher'): StatComparison => {
    if (!avg) return 'average';
    const diff = val - avg;
    if (better === 'lower') return diff < -1 ? 'above' : diff > 1 ? 'below' : 'average';
    return diff > 1 ? 'above' : diff < -1 ? 'below' : 'average';
  };

  keyStats.push({ label: 'Total Putts', value: `${totalPutts}`, comparison: cmp(totalPutts, playerAvgs?.avgPutts, 'lower') });
  keyStats.push({ label: 'Greens in Reg', value: `${girHoles.length}/${holes.length} (${girPct}%)`, comparison: cmp(girPct, playerAvgs?.avgGirPct, 'higher') });
  if (fairwayPct !== null) {
    keyStats.push({ label: 'Fairways', value: `${fairwaysHit}/${fairwayHoles.length} (${fairwayPct}%)`, comparison: cmp(fairwayPct, playerAvgs?.avgFairwayPct, 'higher') });
  }
  if (scramblePct !== null) {
    keyStats.push({ label: 'Scrambling', value: `${scrambleSuccesses.length}/${scrambleAttempts.length} (${scramblePct}%)`, comparison: scramblePct >= 50 ? 'above' : scramblePct >= 33 ? 'average' : 'below' });
  }
  if (avgDriveDist !== null) {
    keyStats.push({ label: 'Avg Drive', value: `${avgDriveDist}y`, comparison: avgDriveDist >= 260 ? 'above' : avgDriveDist >= 240 ? 'average' : 'below' });
  }
  if (avgFirstPuttDist !== null) {
    keyStats.push({ label: 'Avg 1st Putt', value: `${avgFirstPuttDist}ft`, comparison: avgFirstPuttDist <= 15 ? 'above' : avgFirstPuttDist <= 25 ? 'average' : 'below' });
  }

  // --- HIGHLIGHTS: reference specific holes/clubs ---
  if (bestHoles.length > 0) {
    const birdieDesc = bestHoles.slice(0, 3).map(h => {
      const parts: string[] = [`Hole ${h.hole} (par ${h.par})`];
      if (h.firstPuttFeet && h.onePutt) parts.push(`sank a ${h.firstPuttFeet}ft putt`);
      else if (h.gir && h.putts === 2) parts.push(`solid GIR and 2-putt`);
      return parts.join(' — ');
    });
    highlights.push({
      title: `${bestHoles.length} Birdie${bestHoles.length > 1 ? 's' : ''} or Better`,
      description: birdieDesc.join('. ') + '.',
    });
  }

  if (onePutts.length >= 4) {
    highlights.push({
      title: `${onePutts.length} One-Putts`,
      description: `Strong short-range putting — converted on holes ${onePutts.slice(0, 4).map(h => `#${h.hole}`).join(', ')}.`,
    });
  }

  if (scramblePct !== null && scramblePct >= 50) {
    highlights.push({
      title: `${scramblePct}% Scrambling`,
      description: `Saved par ${scrambleSuccesses.length} of ${scrambleAttempts.length} times when missing the green. Effective short game.`,
    });
  }

  if (fairwayPct !== null && fairwayPct >= 65) {
    highlights.push({
      title: 'Accurate Driving',
      description: `Hit ${fairwaysHit}/${fairwayHoles.length} fairways (${fairwayPct}%). Consistently found the short grass.`,
    });
  }

  if (sandSuccesses.length > 0) {
    highlights.push({
      title: `Sand Save${sandSuccesses.length > 1 ? 's' : ''}`,
      description: `Saved par from the bunker ${sandSuccesses.length} of ${sandAttempts.length} time${sandAttempts.length > 1 ? 's' : ''}.`,
    });
  }

  // --- AREAS FOR IMPROVEMENT: reference specific patterns ---
  if (threePutts.length > 0) {
    const tpHoles = threePutts.map(h => `#${h.hole} (from ${h.firstPuttFeet ?? '?'}ft)`).join(', ');
    areasForImprovement.push({
      area: `${threePutts.length} Three-Putt${threePutts.length > 1 ? 's' : ''}`,
      recommendation: `Three-putted on ${tpHoles}. ${
        threePutts.some(h => (h.firstPuttFeet ?? 0) >= 25)
          ? 'Work on lag putting from 25+ feet to leave tap-in second putts.'
          : 'Focus on speed control and reading break inside 15 feet.'
      }`,
    });
    recommendations.push(`Lag putting drill: hit 10 putts from 30ft, all must stop within 3ft of the hole`);
  }

  if (doublePlus.length > 0) {
    const dbHoles = doublePlus.map(h => {
      const parts = [`#${h.hole} (+${h.scoreToPar})`];
      if (h.penalties > 0) parts.push('penalty');
      else if (h.threePutt) parts.push('3-putt');
      else if (!h.gir && !h.scrambleSuccess) parts.push('missed green, no save');
      return parts.join(' — ');
    });
    areasForImprovement.push({
      area: 'Big Numbers',
      recommendation: `Double bogey or worse on: ${dbHoles.join('; ')}. Limiting blow-up holes is the fastest way to lower scores.`,
    });
  }

  if (dominantMiss && driveMisses.length >= 3) {
    const count = dominantMiss === 'left' ? leftMisses : rightMisses;
    areasForImprovement.push({
      area: `Tee Shot Miss Pattern: ${dominantMiss}`,
      recommendation: `Missed ${count}/${driveMisses.length} fairways to the ${dominantMiss}. Work on alignment or adjust aim to account for your natural shot shape.`,
    });
    recommendations.push(`On the range, aim ${dominantMiss === 'left' ? 'slightly right' : 'slightly left'} of target and focus on a consistent release pattern`);
  }

  if (approachMisses.length >= 4) {
    const shortPct = approachMisses.length > 0 ? Math.round((approachShort / approachMisses.length) * 100) : 0;
    if (approachShort > approachLong && shortPct >= 50) {
      areasForImprovement.push({
        area: 'Approach Shots Landing Short',
        recommendation: `${shortPct}% of missed greens were short. Consider taking one extra club on approach shots to carry pin-high.`,
      });
      recommendations.push('On the range, note your carry distance vs total distance for each iron');
    } else if (approachLong > approachShort) {
      areasForImprovement.push({
        area: 'Approach Shots Going Long',
        recommendation: `Most missed greens were long. Dial back club selection and trust your swing.`,
      });
    }
  }

  if (girPct < 40) {
    areasForImprovement.push({
      area: `Low GIR (${girPct}%)`,
      recommendation: `Only hit ${girHoles.length} of ${holes.length} greens. This put constant pressure on your short game.`,
    });
    recommendations.push('Practice approach shots from your 3 most common approach yardages');
  }

  // Add default recommendations if still empty
  if (recommendations.length === 0) {
    if (sentiment === 'positive') {
      recommendations.push('Maintain this form — focus on consistency in your next round');
    } else if (sentiment === 'neutral') {
      recommendations.push('Review your pre-shot routine to tighten up decision-making');
    } else {
      recommendations.push('Simplify your game plan next round — fairways and greens, avoid hero shots');
    }
  }

  if (scoreToPar > 0 && scoreToPar <= 5) {
    const easiestSaves = threePutts.length > 0 ? `Eliminating ${threePutts.length} three-putt${threePutts.length > 1 ? 's' : ''}` : 'Tighter approach shots';
    recommendations.push(`${easiestSaves} alone would have saved ${Math.min(threePutts.length, scoreToPar)} stroke${threePutts.length > 1 ? 's' : ''}`);
  }

  // Ensure at least one highlight
  if (highlights.length === 0) {
    if (pars.length >= 10) {
      highlights.push({ title: `${pars.length} Pars`, description: 'Solid consistency — the foundation for lower scores.' });
    } else {
      highlights.push({ title: 'Round Logged', description: 'Tracking your rounds is the first step to improvement.' });
    }
  }

  return { summary, sentiment, highlights, areasForImprovement, keyStats, recommendations, overallGrade };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get existing round review by round ID
 */
export async function getRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // First check if review exists in the golf_round_reviews table
    const { data: existingReview, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          id,
          player_id,
          course_name,
          round_date,
          total_score,
          score_to_par,
          total_putts,
          total_fairways_hit,
          total_fairways,
          total_gir,
          total_gir_possible
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

    // Transform the data to our expected format
    const roundData = existingReview.round as RoundData;
    const review: RoundReviewWithRound = {
      id: existingReview.id,
      player_id: existingReview.player_id,
      round_id: existingReview.round_id,
      review_content: (existingReview.round_stats as unknown as RoundReviewContent) || generateReviewContent(
        roundData,
        [],
        null
      ),
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
    console.error('Error fetching round review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Generate and store a new round review
 */
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
    // 1. Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // 2. Get the round data
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        player_id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        total_putts,
        total_fairways_hit,
        total_fairways,
        total_gir,
        total_gir_possible,
        status
      `)
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    const roundData = round as unknown as RoundData;

    if (roundData.status !== 'completed') {
      return { success: false, error: 'Round must be completed before generating a review' };
    }

    // 3. Fetch actual shot data for this round
    const { data: shots } = await supabase
      .from('golf_shots')
      .select('hole_number, shot_number, shot_type, club_used, distance_to_hole_before, distance_unit_before, result, lie_before, lie_after, miss_direction, putt_distance_feet, shot_distance, is_penalty, putt_made')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true });

    const shotRows = (shots ?? []) as unknown as ShotRow[];

    // 4. Build hole-by-hole analysis from shot data
    const holeBreakdowns = shotRows.length > 0 ? buildHoleBreakdowns(shotRows, roundData) : [];

    // 5. Get player averages for comparison
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
      const validRounds = playerRounds.filter(r => r.total_score !== null);
      const avgScore = validRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0) / validRounds.length;
      const avgPutts = validRounds.filter(r => r.total_putts !== null).reduce((sum, r) => sum + (r.total_putts ?? 0), 0) /
        validRounds.filter(r => r.total_putts !== null).length || 32;

      const girRounds = validRounds.filter(r => r.total_gir !== null && r.total_gir_possible);
      const avgGirPct = girRounds.length > 0
        ? girRounds.reduce((sum, r) => {
            const pct = ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100;
            return sum + pct;
          }, 0) / girRounds.length
        : 50;

      const fwRounds = validRounds.filter(r => r.total_fairways_hit !== null && r.total_fairways);
      const avgFairwayPct = fwRounds.length > 0
        ? fwRounds.reduce((sum, r) => {
            const pct = ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100;
            return sum + pct;
          }, 0) / fwRounds.length
        : 50;

      playerAvgs = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
    }

    // 6. Generate review content from actual shot data
    const reviewContent = generateReviewContent(roundData, holeBreakdowns, playerAvgs);

    // 5. Try to get enhanced AI review from CoachHelm
    let aiEnhanced = false;
    try {
      const aiResult = await generateAIRoundReview(roundId, playerId);
      if (aiResult.success && aiResult.review) {
        // Merge AI insights with our review content
        if (aiResult.review.summary) {
          reviewContent.summary = aiResult.review.summary;
        }
        if (aiResult.review.primaryTakeaway) {
          reviewContent.recommendations.unshift(aiResult.review.primaryTakeaway);
        }
        aiEnhanced = true;
      }
    } catch (err) {
      // AI enhancement failed, continue with rule-based review
      console.error('[GolfHelm] AI review enhancement failed, using rule-based review:', err);
    }

    // 6. Check if review already exists
    const { data: existingReview } = await supabase
      .from('golf_round_reviews')
      .select('id')
      .eq('round_id', roundId)
      .maybeSingle();

    let reviewId: string;

    if (existingReview) {
      // Update existing review
      const { error: updateError } = await supabase
        .from('golf_round_reviews')
        .update({
          round_stats: reviewContent as unknown as Json,
          summary: reviewContent.summary,
          highlights: reviewContent.highlights as unknown as Json,
          areas_to_review: reviewContent.areasForImprovement as unknown as Json,
          engine_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v1',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReview.id);

      if (updateError) {
        return { success: false, error: 'Failed to update review' };
      }

      reviewId = existingReview.id;
    } else {
      // Create new review
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
          engine_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v1',
        })
        .select('id')
        .single();

      if (insertError || !newReview) {
        return { success: false, error: 'Failed to create review' };
      }

      reviewId = newReview.id;
    }

    // 7. Revalidate paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${roundId}`);
    revalidatePath(`/golf/dashboard/rounds/${roundId}/review`);

    // 8. Return the complete review
    const review: RoundReviewWithRound = {
      id: reviewId,
      player_id: playerId,
      round_id: roundId,
      review_content: reviewContent,
      generated_at: new Date().toISOString(),
      ai_model_version: aiEnhanced ? 'coachhelm-v2' : 'rule-based-v1',
      shared_with_coach: false,
      shared_at: null,
      coach_notes: null,
      coach_viewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      round: {
        id: roundData.id,
        player_id: roundData.player_id,
        course_name: roundData.course_name,
        round_date: roundData.round_date,
        total_score: roundData.total_score,
        score_to_par: roundData.score_to_par,
        total_putts: roundData.total_putts,
        total_fairways_hit: roundData.total_fairways_hit,
        total_fairways: roundData.total_fairways,
        total_gir: roundData.total_gir,
        total_gir_possible: roundData.total_gir_possible,
      },
    };

    return { success: true, review };
  } catch (error) {
    console.error('Error generating round review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Regenerate a round review with latest AI
 */
export async function regenerateRoundReview(roundId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithRound;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get the round to find player_id
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('player_id')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Force regeneration by calling generateAndStoreRoundReview
    return generateAndStoreRoundReview(roundId, round.player_id);
  } catch (error) {
    console.error('Error regenerating round review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Share a round review with the coach
 */
export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        shared_with_coach: true,
        shared_at: new Date().toISOString(),
      })
      .eq('id', reviewId);

    if (error) {
      return { success: false, error: 'Failed to share review' };
    }

    revalidatePath('/golf/dashboard/rounds');
    return { success: true };
  } catch (error) {
    console.error('Error sharing review:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get player and team averages for stat comparison
 */
export async function getStatAverages(
  playerId: string,
  teamId?: string
): Promise<{
  success: boolean;
  playerAvg?: {
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  };
  teamAvg?: {
    avgScore: number;
    avgPutts: number;
    avgGirPct: number;
    avgFairwayPct: number;
  };
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get player averages from last 20 rounds
    const { data: playerRounds, error: playerError } = await supabase
      .from('golf_rounds')
      .select('total_score, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(20);

    if (playerError) {
      return { success: false, error: 'Failed to fetch player stats' };
    }

    let playerAvg = undefined;
    if (playerRounds && playerRounds.length >= 3) {
      const validRounds = playerRounds.filter(r => r.total_score !== null);
      const avgScore = validRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0) / validRounds.length;
      const avgPutts = validRounds.filter(r => r.total_putts !== null).reduce((sum, r) => sum + (r.total_putts ?? 0), 0) /
        validRounds.filter(r => r.total_putts !== null).length || 32;

      const girRounds = validRounds.filter(r => r.total_gir !== null && r.total_gir_possible);
      const avgGirPct = girRounds.length > 0
        ? girRounds.reduce((sum, r) => {
            const pct = ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100;
            return sum + pct;
          }, 0) / girRounds.length
        : 50;

      const fwRounds = validRounds.filter(r => r.total_fairways_hit !== null && r.total_fairways);
      const avgFairwayPct = fwRounds.length > 0
        ? fwRounds.reduce((sum, r) => {
            const pct = ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100;
            return sum + pct;
          }, 0) / fwRounds.length
        : 50;

      playerAvg = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
    }

    // Get team averages if team ID provided
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
          const validRounds = teamRounds.filter(r => r.total_score !== null);
          const avgScore = validRounds.reduce((sum, r) => sum + (r.total_score ?? 0), 0) / validRounds.length;
          const avgPutts = validRounds.filter(r => r.total_putts !== null).reduce((sum, r) => sum + (r.total_putts ?? 0), 0) /
            validRounds.filter(r => r.total_putts !== null).length || 32;

          const girRounds = validRounds.filter(r => r.total_gir !== null && r.total_gir_possible);
          const avgGirPct = girRounds.length > 0
            ? girRounds.reduce((sum, r) => {
                const pct = ((r.total_gir ?? 0) / (r.total_gir_possible ?? 18)) * 100;
                return sum + pct;
              }, 0) / girRounds.length
            : 50;

          const fwRounds = validRounds.filter(r => r.total_fairways_hit !== null && r.total_fairways);
          const avgFairwayPct = fwRounds.length > 0
            ? fwRounds.reduce((sum, r) => {
                const pct = ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 14)) * 100;
                return sum + pct;
              }, 0) / fwRounds.length
            : 50;

          teamAvg = { avgScore, avgPutts, avgGirPct, avgFairwayPct };
        }
      }
    }

    return { success: true, playerAvg, teamAvg };
  } catch (error) {
    console.error('Error fetching stat averages:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
