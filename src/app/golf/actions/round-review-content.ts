/**
 * Pure round-review content generation.
 *
 * Extracted from the `'use server'` round-review-system.ts so it can be unit
 * tested directly (#150 recommendation-copy regression) without standing up
 * the Supabase-backed action, and so the server-action observability
 * coverage-contract is not tripped by a pure, I/O-free helper (there is
 * nothing to Bridge-instrument here). All functions below are pure.
 */
import type {
  RoundData,
  ShotRow,
  HoleBreakdown,
  ComparisonAverages,
  ReviewSentiment,
  RoundReviewContent,
  RoundReviewHighlight,
  RoundReviewImprovementArea,
  RoundReviewKeyStat,
  OverallGrade,
  HalfStats,
  PuttingRange,
  StrokesToGainItem,
  StatComparison,
} from './round-review-system';

function missMatches(direction: string | null | undefined, side: 'left' | 'right' | 'short' | 'long'): boolean {
  if (!direction) return false;
  return direction === side || direction.startsWith(`${side}_`) || direction.endsWith(`_${side}`);
}

function determineSentiment(scoreToPar: number): ReviewSentiment {
  if (scoreToPar <= -1) return 'positive';
  if (scoreToPar <= 3) return 'neutral';
  return 'challenging';
}

function determineGrade(
  scoreToPar: number,
  girPct: number | null,
  fairwayPct: number | null,
  putts: number,
  playerAvgs?: ComparisonAverages | null
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
    // Player-relative grading: compare to their own history. Each average can
    // independently be null (no supporting round data) — skip that factor
    // rather than grade against a fabricated benchmark.
    if (playerAvgs.avgScoreToPar !== null) {
      const scoreVal = relativeGrade(scoreToPar, playerAvgs.avgScoreToPar, 'lower');
      score += scoreVal * 2;
      factors += 2;
    }

    if (girPct !== null && playerAvgs.avgGirPct !== null) {
      const girVal = relativeGrade(girPct, playerAvgs.avgGirPct, 'higher');
      score += girVal;
      factors++;
    }

    if (fairwayPct !== null && playerAvgs.avgFairwayPct !== null) {
      const fwVal = relativeGrade(fairwayPct, playerAvgs.avgFairwayPct, 'higher');
      score += fwVal;
      factors++;
    }

    if (playerAvgs.avgPutts !== null) {
      const puttVal = relativeGrade(putts, playerAvgs.avgPutts, 'lower');
      score += puttVal;
      factors++;
    }
  }

  if (factors === 0) {
    // Fallback: fixed benchmarks (college-level). Reached when playerAvgs is
    // null (< 3 comparison rounds) or when every usable average was null.
    const scoreVal = scoreToPar <= -3 ? 5 : scoreToPar <= -1 ? 4 : scoreToPar <= 1 ? 3.5 : scoreToPar <= 3 ? 3 : scoreToPar <= 5 ? 2 : 1;
    score += scoreVal * 2;
    factors += 2;

    if (girPct !== null) {
      const girVal = girPct >= 70 ? 5 : girPct >= 60 ? 4 : girPct >= 50 ? 3 : girPct >= 40 ? 2 : 1;
      score += girVal;
      factors++;
    }

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
 * Generate full review content from round data + shot data.
 */
export function generateReviewContent(
  round: RoundData,
  holes: HoleBreakdown[],
  playerAvgs: ComparisonAverages | null,
  shotRows: ShotRow[] = []
): RoundReviewContent {
  const highlights: RoundReviewHighlight[] = [];
  const areasForImprovement: RoundReviewImprovementArea[] = [];
  const keyStats: RoundReviewKeyStat[] = [];
  const recommendations: string[] = [];

  // Always use round-level totals as ground truth — shot data may be incomplete
  const scoreToPar = round.score_to_par ?? 0;
  const totalScore = round.total_score ?? 72;

  // 18-hole-equivalent factor. The player averages (avgScoreToPar, avgPutts)
  // are 18-normalized, so a 9-hole round's raw counts must be scaled ×18/9
  // before any comparison or grading — otherwise every short round grades as
  // exceptional (e.g. 16 putts over 9 holes vs a 32-putt average). Displayed
  // values stay raw; only comparison inputs use the scaled figures.
  const holesPlayed = round.holes_played ?? 18;
  const to18 = holesPlayed > 0 ? 18 / holesPlayed : 1;

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
  const girPct = girTotal > 0 ? Math.round((girHitsCount / girTotal) * 100) : null;
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
  // The five buckets below are mutually exclusive and exhaustive over every
  // integer scoreToPar (≤-2, -1, 0, 1, ≥2), so any hole with a numeric
  // scoreToPar lands in exactly one bucket. We additionally guard against
  // non-finite values (NaN/null introduced by future data shapes) so the
  // bucket totals always reconcile with `holesPlayed`.
  //
  // `holesPlayed` is the denominator (count of holes that contributed a real
  // score). On incomplete or partially-edited rounds this may be < 18 — UIs
  // should size segments against `holesPlayed` rather than a hard-coded 18.
  const scoredHoles = holes.filter(h => Number.isFinite(h.scoreToPar));
  const scoringDistribution = {
    eagles: scoredHoles.filter(h => h.scoreToPar <= -2).map(h => h.hole),
    birdies: scoredHoles.filter(h => h.scoreToPar === -1).map(h => h.hole),
    pars: scoredHoles.filter(h => h.scoreToPar === 0).map(h => h.hole),
    bogeys: scoredHoles.filter(h => h.scoreToPar === 1).map(h => h.hole),
    doublePlus: scoredHoles.filter(h => h.scoreToPar >= 2).map(h => h.hole),
    holesPlayed: scoredHoles.length,
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
  // Bucket EVERY putt by its own distance (made = holed) so the ranges sum to
  // the total putt count — not one first-putt per hole. The old per-hole
  // first-putt bucketing made the chart attempts add up to 18 (holes) while the
  // header showed 35 (total putts), which read as "missing" putts. Falls back to
  // the per-hole first-putt view only when shot-level putt rows are unavailable.
  const puttShots = shotRows.filter(s => s.shot_type === 'putting');
  const puttingRanges: PuttingRange[] = puttBuckets.map(bucket => {
    if (puttShots.length > 0) {
      const inBucket = puttShots.filter(s => {
        const ft = s.putt_distance_feet != null ? parseFloat(s.putt_distance_feet) : NaN;
        if (Number.isNaN(ft)) return false;
        return ft >= bucket.min && ft < bucket.max;
      });
      const made = inBucket.filter(s => s.putt_made === true || s.result === 'hole').length;
      return {
        label: bucket.label,
        attempts: inBucket.length,
        made,
        pct: inBucket.length > 0 ? Math.round((made / inBucket.length) * 100) : 0,
      };
    }
    // Fallback (hole-level data only): per-hole first putt, made = one-putt.
    const inBucket = holes.filter(h => h.firstPuttFeet !== null && h.firstPuttFeet >= bucket.min && h.firstPuttFeet < bucket.max);
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
  if (girPct !== null && girPct < 50 && girTotal > 0) {
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
  // Grade on 18-hole-equivalent score/putts so 9-hole rounds compare honestly
  // against the 18-normalized averages (and fixed 18-hole benchmarks).
  const overallGrade = determineGrade(scoreToPar * to18, girPct, fairwayPct, totalPutts * to18, playerAvgs);

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
  // Use stat-appropriate thresholds instead of a universal ±1.
  // A null/undefined average means "no honest baseline" — the comparison is
  // skipped by reporting the neutral 'average' (no above/below claim is made).
  const cmp = (val: number, avg: number | null | undefined, better: 'lower' | 'higher', threshold: number = 1): StatComparison => {
    if (avg === null || avg === undefined || avg === 0) return 'average';
    const diff = val - avg;
    if (better === 'lower') return diff < -threshold ? 'above' : diff > threshold ? 'below' : 'average';
    return diff > threshold ? 'above' : diff < -threshold ? 'below' : 'average';
  };

  // Display the raw putt count, but compare the 18-hole equivalent against
  // the 18-normalized avgPutts (see `to18` above).
  keyStats.push({ label: 'Total Putts', value: `${totalPutts}`, comparison: cmp(totalPutts * to18, playerAvgs?.avgPutts, 'lower', 2) });
  if (girPct !== null) {
    keyStats.push({ label: 'Greens in Reg', value: `${girHitsCount}/${girTotal} (${girPct}%)`, comparison: cmp(girPct, playerAvgs?.avgGirPct, 'higher', 5) });
  }
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
    recommendations.push('On the practice green, hit 10 lag putts from 30 feet and get each one to stop within 3 feet of the hole');
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
  if (girPct !== null && girPct < 40) {
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
