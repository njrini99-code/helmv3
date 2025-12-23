/**
 * Golf Stats Calculator
 * 
 * Calculates all 50+ stats from shot data stored in the database.
 * Used to compute player career stats and per-round stats.
 */

// HoleStats type - must match the type exported from ShotTrackingComprehensive.tsx
interface HoleStats {
  holeNumber: number;
  par: number;
  score: number;
  putts: number;
  fairwayHit: boolean | null;
  greenInRegulation: boolean;
  usedDriver: boolean | null;
  drivingDistance: number | null;
  driveMissDirection: string | null;
  approachDistance: number | null;
  approachProximity: number | null;
  approachLie: string | null;
  firstPuttDistance: number | null;
  firstPuttLeave: number | null;
  firstPuttMissDirection: string | null;
  scrambleAttempt: boolean;
  scrambleMade: boolean;
  sandSaveAttempt: boolean;
  sandSaveMade: boolean;
  penaltyStrokes: number;
  holedOutDistance: number | null;
  holedOutType: string | null;
  shots: Array<{
    shotNumber: number;
    shotType: string;
    result?: string;
    lieBefore?: string;
    distanceToHoleBefore?: number;
  }>;
}

// ============================================================================
// TYPES
// ============================================================================

export interface GolfStats {
  // General
  roundsPlayed: number;
  holesPlayed: number;
  
  // Scoring
  scoringAverage: number | null;
  bestRound: number | null;
  worstRound: number | null;
  totalBirdies: number;
  totalEagles: number;
  totalPars: number;
  totalBogeys: number;
  totalDoublePlus: number;
  birdiesPerRound: number | null;
  eaglesPerRound: number | null;
  parsPerRound: number | null;
  bogeysPerRound: number | null;
  doublePlusPerRound: number | null;
  
  // Scoring by round type
  practiceScoringAvg: number | null;
  practiceRounds: number;
  qualifyingScoringAvg: number | null;
  qualifyingRounds: number;
  tournamentScoringAvg: number | null;
  tournamentRounds: number;
  
  // Streaks
  mostBirdiesRound: number;
  mostBirdiesRow: number;
  mostParsRow: number;
  currentNo3PuttStreak: number;
  longestNo3PuttStreak: number;
  longestHoleOut: number | null;
  
  // Driving
  drivingDistanceAvg: number | null;
  drivingDistanceDriverOnly: number | null;
  fairwaysHit: number;
  fairwayOpportunities: number;
  fairwayPercentage: number | null;
  fairwayPctPar4: number | null;
  fairwayPctPar5: number | null;
  fairwayPctDriver: number | null;
  fairwayPctNonDriver: number | null;
  missLeftCount: number;
  missRightCount: number;
  missLeftPct: number | null;
  missRightPct: number | null;
  
  // GIR
  girTotal: number;
  girOpportunities: number;
  girPercentage: number | null;
  girPerRound: number | null;
  girPctPar3: number | null;
  girPctPar4: number | null;
  girPctPar5: number | null;
  
  // Putting
  totalPutts: number;
  puttsPerRound: number | null;
  puttsPerHole: number | null;
  puttsPerGir: number | null;
  threePuttsTotal: number;
  threePuttsPerRound: number | null;
  onePuttsTotal: number;
  
  // Putting by distance (make percentages)
  puttMakePct0_3: number | null;
  puttMakePct3_5: number | null;
  puttMakePct5_10: number | null;
  puttMakePct10_15: number | null;
  puttMakePct15_20: number | null;
  puttMakePct20_25: number | null;
  puttMakePct25_30: number | null;
  puttMakePct30_35: number | null;
  puttMakePct35Plus: number | null;
  
  // Putting proximity
  puttProximityAvg: number | null;
  puttProximity5_10: number | null;
  puttProximity10_15: number | null;
  puttProximity15_20: number | null;
  puttProximity20Plus: number | null;
  
  // Putting efficiency
  puttEfficiency0_3: number | null;
  puttEfficiency3_5: number | null;
  puttEfficiency5_10: number | null;
  puttEfficiency10_15: number | null;
  puttEfficiency15_20: number | null;
  puttEfficiency20_25: number | null;
  puttEfficiency25_30: number | null;
  puttEfficiency30Plus: number | null;
  
  // Putt miss direction
  puttMissLeftPct: number | null;
  puttMissRightPct: number | null;
  puttMissShortPct: number | null;
  puttMissLongPct: number | null;
  
  // Approach
  approachProximityAvg: number | null;
  approachProximityPar3: number | null;
  approachProximityPar4: number | null;
  approachProximityPar5: number | null;
  approachProximityFairway: number | null;
  approachProximityRough: number | null;
  approachProximitySand: number | null;
  
  // Approach by distance
  approachProx30_75: number | null;
  approachProx75_100: number | null;
  approachProx100_125: number | null;
  approachProx125_150: number | null;
  approachProx150_175: number | null;
  approachProx175_200: number | null;
  approachProx200_225: number | null;
  approachProx225Plus: number | null;
  
  // Approach efficiency
  approachEff30_75: number | null;
  approachEff75_100: number | null;
  approachEff100_125: number | null;
  approachEff125_150: number | null;
  approachEff150_175: number | null;
  approachEff175_200: number | null;
  approachEff200_225: number | null;
  approachEff225Plus: number | null;
  
  // Scrambling
  scrambleAttempts: number;
  scramblesMade: number;
  scramblingPercentage: number | null;
  scramblingPctFairway: number | null;
  scramblingPctRough: number | null;
  scramblingPctSand: number | null;
  scramblingPct0_10: number | null;
  scramblingPct10_20: number | null;
  scramblingPct20_30: number | null;
  
  // Around the green efficiency
  atgEfficiencyAvg: number | null;
  atgEfficiency0_10: number | null;
  atgEfficiency10_20: number | null;
  atgEfficiency20_30: number | null;
  atgEffFairway: number | null;
  atgEffRough: number | null;
  atgEffSand: number | null;
  
  // Sand saves
  sandSaveAttempts: number;
  sandSavesMade: number;
  sandSavePercentage: number | null;
  
  // Penalties
  totalPenalties: number;
  penaltiesPerRound: number | null;
}

export interface RoundData {
  id: string;
  roundDate: string;
  courseName: string;
  roundType: 'practice' | 'qualifying' | 'tournament';
  totalScore: number;
  totalToPar: number;
  holes: HoleStats[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safePercent(made: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return Math.round((made / attempts) * 1000) / 10; // One decimal place
}

function safeAverage(total: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((total / count) * 100) / 100; // Two decimal places
}

function getPuttDistanceBucket(distance: number): string {
  if (distance <= 3) return '0_3';
  if (distance <= 5) return '3_5';
  if (distance <= 10) return '5_10';
  if (distance <= 15) return '10_15';
  if (distance <= 20) return '15_20';
  if (distance <= 25) return '20_25';
  if (distance <= 30) return '25_30';
  if (distance <= 35) return '30_35';
  return '35_plus';
}

function getApproachDistanceBucket(distance: number): string {
  if (distance <= 75) return '30_75';
  if (distance <= 100) return '75_100';
  if (distance <= 125) return '100_125';
  if (distance <= 150) return '125_150';
  if (distance <= 175) return '150_175';
  if (distance <= 200) return '175_200';
  if (distance <= 225) return '200_225';
  return '225_plus';
}

// ============================================================================
// MAIN CALCULATOR
// ============================================================================

export function calculateStats(rounds: RoundData[]): GolfStats {
  // Initialize accumulators
  const stats: GolfStats = {
    roundsPlayed: rounds.length,
    holesPlayed: 0,
    scoringAverage: null,
    bestRound: null,
    worstRound: null,
    totalBirdies: 0,
    totalEagles: 0,
    totalPars: 0,
    totalBogeys: 0,
    totalDoublePlus: 0,
    birdiesPerRound: null,
    eaglesPerRound: null,
    parsPerRound: null,
    bogeysPerRound: null,
    doublePlusPerRound: null,
    practiceScoringAvg: null,
    practiceRounds: 0,
    qualifyingScoringAvg: null,
    qualifyingRounds: 0,
    tournamentScoringAvg: null,
    tournamentRounds: 0,
    mostBirdiesRound: 0,
    mostBirdiesRow: 0,
    mostParsRow: 0,
    currentNo3PuttStreak: 0,
    longestNo3PuttStreak: 0,
    longestHoleOut: null,
    drivingDistanceAvg: null,
    drivingDistanceDriverOnly: null,
    fairwaysHit: 0,
    fairwayOpportunities: 0,
    fairwayPercentage: null,
    fairwayPctPar4: null,
    fairwayPctPar5: null,
    fairwayPctDriver: null,
    fairwayPctNonDriver: null,
    missLeftCount: 0,
    missRightCount: 0,
    missLeftPct: null,
    missRightPct: null,
    girTotal: 0,
    girOpportunities: 0,
    girPercentage: null,
    girPerRound: null,
    girPctPar3: null,
    girPctPar4: null,
    girPctPar5: null,
    totalPutts: 0,
    puttsPerRound: null,
    puttsPerHole: null,
    puttsPerGir: null,
    threePuttsTotal: 0,
    threePuttsPerRound: null,
    onePuttsTotal: 0,
    puttMakePct0_3: null,
    puttMakePct3_5: null,
    puttMakePct5_10: null,
    puttMakePct10_15: null,
    puttMakePct15_20: null,
    puttMakePct20_25: null,
    puttMakePct25_30: null,
    puttMakePct30_35: null,
    puttMakePct35Plus: null,
    puttProximityAvg: null,
    puttProximity5_10: null,
    puttProximity10_15: null,
    puttProximity15_20: null,
    puttProximity20Plus: null,
    puttEfficiency0_3: null,
    puttEfficiency3_5: null,
    puttEfficiency5_10: null,
    puttEfficiency10_15: null,
    puttEfficiency15_20: null,
    puttEfficiency20_25: null,
    puttEfficiency25_30: null,
    puttEfficiency30Plus: null,
    puttMissLeftPct: null,
    puttMissRightPct: null,
    puttMissShortPct: null,
    puttMissLongPct: null,
    approachProximityAvg: null,
    approachProximityPar3: null,
    approachProximityPar4: null,
    approachProximityPar5: null,
    approachProximityFairway: null,
    approachProximityRough: null,
    approachProximitySand: null,
    approachProx30_75: null,
    approachProx75_100: null,
    approachProx100_125: null,
    approachProx125_150: null,
    approachProx150_175: null,
    approachProx175_200: null,
    approachProx200_225: null,
    approachProx225Plus: null,
    approachEff30_75: null,
    approachEff75_100: null,
    approachEff100_125: null,
    approachEff125_150: null,
    approachEff150_175: null,
    approachEff175_200: null,
    approachEff200_225: null,
    approachEff225Plus: null,
    scrambleAttempts: 0,
    scramblesMade: 0,
    scramblingPercentage: null,
    scramblingPctFairway: null,
    scramblingPctRough: null,
    scramblingPctSand: null,
    scramblingPct0_10: null,
    scramblingPct10_20: null,
    scramblingPct20_30: null,
    atgEfficiencyAvg: null,
    atgEfficiency0_10: null,
    atgEfficiency10_20: null,
    atgEfficiency20_30: null,
    atgEffFairway: null,
    atgEffRough: null,
    atgEffSand: null,
    sandSaveAttempts: 0,
    sandSavesMade: 0,
    sandSavePercentage: null,
    totalPenalties: 0,
    penaltiesPerRound: null,
  };

  if (rounds.length === 0) return stats;

  // Accumulators for calculations
  let totalScore = 0;
  let practiceScore = 0;
  let qualifyingScore = 0;
  let tournamentScore = 0;
  
  // Driving
  let drivingDistances: number[] = [];
  let driverDistances: number[] = [];
  let fairwaysPar4 = { hit: 0, total: 0 };
  let fairwaysPar5 = { hit: 0, total: 0 };
  let fairwaysDriver = { hit: 0, total: 0 };
  let fairwaysNonDriver = { hit: 0, total: 0 };
  let totalMisses = 0;
  
  // GIR
  let girPar3 = { made: 0, total: 0 };
  let girPar4 = { made: 0, total: 0 };
  let girPar5 = { made: 0, total: 0 };
  let puttsOnGir = 0;
  let girHoles = 0;
  
  // Putting
  const puttAttempts: Record<string, { made: number; total: number }> = {
    '0_3': { made: 0, total: 0 },
    '3_5': { made: 0, total: 0 },
    '5_10': { made: 0, total: 0 },
    '10_15': { made: 0, total: 0 },
    '15_20': { made: 0, total: 0 },
    '20_25': { made: 0, total: 0 },
    '25_30': { made: 0, total: 0 },
    '30_35': { made: 0, total: 0 },
    '35_plus': { made: 0, total: 0 },
  };
  const puttLeaves: Record<string, number[]> = {
    '5_10': [],
    '10_15': [],
    '15_20': [],
    '20_plus': [],
  };
  const puttEfficiency: Record<string, { totalPutts: number; count: number }> = {
    '0_3': { totalPutts: 0, count: 0 },
    '3_5': { totalPutts: 0, count: 0 },
    '5_10': { totalPutts: 0, count: 0 },
    '10_15': { totalPutts: 0, count: 0 },
    '15_20': { totalPutts: 0, count: 0 },
    '20_25': { totalPutts: 0, count: 0 },
    '25_30': { totalPutts: 0, count: 0 },
    '30_plus': { totalPutts: 0, count: 0 },
  };
  let puttMisses = { left: 0, right: 0, short: 0, long: 0, total: 0 };
  let allPuttLeaves: number[] = [];
  
  // Approach
  let approachProximities: number[] = [];
  let approachProxPar3: number[] = [];
  let approachProxPar4: number[] = [];
  let approachProxPar5: number[] = [];
  let approachProxFairway: number[] = [];
  let approachProxRough: number[] = [];
  let approachProxSand: number[] = [];
  const approachProxByDistance: Record<string, number[]> = {
    '30_75': [], '75_100': [], '100_125': [], '125_150': [],
    '150_175': [], '175_200': [], '200_225': [], '225_plus': [],
  };
  const approachEffByDistance: Record<string, { totalStrokes: number; count: number }> = {
    '30_75': { totalStrokes: 0, count: 0 },
    '75_100': { totalStrokes: 0, count: 0 },
    '100_125': { totalStrokes: 0, count: 0 },
    '125_150': { totalStrokes: 0, count: 0 },
    '150_175': { totalStrokes: 0, count: 0 },
    '175_200': { totalStrokes: 0, count: 0 },
    '200_225': { totalStrokes: 0, count: 0 },
    '225_plus': { totalStrokes: 0, count: 0 },
  };
  
  // Scrambling
  let scrambleFairway = { made: 0, total: 0 };
  let scrambleRough = { made: 0, total: 0 };
  let scrambleSand = { made: 0, total: 0 };
  let scramble0_10 = { made: 0, total: 0 };
  let scramble10_20 = { made: 0, total: 0 };
  let scramble20_30 = { made: 0, total: 0 };
  
  // Around the green efficiency
  let atgStrokes: number[] = [];
  let atg0_10: { strokes: number; count: number } = { strokes: 0, count: 0 };
  let atg10_20: { strokes: number; count: number } = { strokes: 0, count: 0 };
  let atg20_30: { strokes: number; count: number } = { strokes: 0, count: 0 };
  let atgFairway: { strokes: number; count: number } = { strokes: 0, count: 0 };
  let atgRough: { strokes: number; count: number } = { strokes: 0, count: 0 };
  let atgSand: { strokes: number; count: number } = { strokes: 0, count: 0 };
  
  // Streaks
  let currentBirdieStreak = 0;
  let currentParStreak = 0;
  let current3PuttStreak = 0;
  
  // Process each round
  for (const round of rounds) {
    const roundBirdies = round.holes.filter(h => h.score - h.par === -1).length;
    const roundEagles = round.holes.filter(h => h.score - h.par <= -2).length;
    
    totalScore += round.totalScore;
    stats.holesPlayed += round.holes.length;
    
    // Best/worst round
    if (stats.bestRound === null || round.totalScore < stats.bestRound) {
      stats.bestRound = round.totalScore;
    }
    if (stats.worstRound === null || round.totalScore > stats.worstRound) {
      stats.worstRound = round.totalScore;
    }
    
    // Most birdies in a round
    if (roundBirdies > stats.mostBirdiesRound) {
      stats.mostBirdiesRound = roundBirdies;
    }
    
    // Round type scoring
    if (round.roundType === 'practice') {
      practiceScore += round.totalScore;
      stats.practiceRounds++;
    } else if (round.roundType === 'qualifying') {
      qualifyingScore += round.totalScore;
      stats.qualifyingRounds++;
    } else if (round.roundType === 'tournament') {
      tournamentScore += round.totalScore;
      stats.tournamentRounds++;
    }
    
    // Process each hole
    for (const hole of round.holes) {
      const scoreToPar = hole.score - hole.par;
      
      // Scoring counts
      if (scoreToPar <= -2) stats.totalEagles++;
      else if (scoreToPar === -1) stats.totalBirdies++;
      else if (scoreToPar === 0) stats.totalPars++;
      else if (scoreToPar === 1) stats.totalBogeys++;
      else stats.totalDoublePlus++;
      
      // Birdie streak
      if (scoreToPar === -1) {
        currentBirdieStreak++;
        if (currentBirdieStreak > stats.mostBirdiesRow) {
          stats.mostBirdiesRow = currentBirdieStreak;
        }
      } else {
        currentBirdieStreak = 0;
      }
      
      // Par streak
      if (scoreToPar === 0) {
        currentParStreak++;
        if (currentParStreak > stats.mostParsRow) {
          stats.mostParsRow = currentParStreak;
        }
      } else {
        currentParStreak = 0;
      }
      
      // 3-putt streak
      if (hole.putts < 3) {
        current3PuttStreak++;
        if (current3PuttStreak > stats.longestNo3PuttStreak) {
          stats.longestNo3PuttStreak = current3PuttStreak;
        }
      } else {
        current3PuttStreak = 0;
        stats.threePuttsTotal++;
      }
      
      // Driving (par 4/5 only)
      if (hole.par >= 4) {
        stats.fairwayOpportunities++;
        
        if (hole.fairwayHit !== null) {
          if (hole.fairwayHit) {
            stats.fairwaysHit++;
            if (hole.par === 4) fairwaysPar4.hit++;
            if (hole.par === 5) fairwaysPar5.hit++;
            if (hole.usedDriver) fairwaysDriver.hit++;
            else fairwaysNonDriver.hit++;
          } else {
            totalMisses++;
            if (hole.driveMissDirection === 'left') stats.missLeftCount++;
            if (hole.driveMissDirection === 'right') stats.missRightCount++;
          }
          
          if (hole.par === 4) fairwaysPar4.total++;
          if (hole.par === 5) fairwaysPar5.total++;
          if (hole.usedDriver) fairwaysDriver.total++;
          else fairwaysNonDriver.total++;
        }
        
        if (hole.drivingDistance) {
          drivingDistances.push(hole.drivingDistance);
          if (hole.usedDriver) driverDistances.push(hole.drivingDistance);
        }
      }
      
      // GIR
      stats.girOpportunities++;
      if (hole.greenInRegulation) {
        stats.girTotal++;
        if (hole.par === 3) girPar3.made++;
        if (hole.par === 4) girPar4.made++;
        if (hole.par === 5) girPar5.made++;
        
        puttsOnGir += hole.putts;
        girHoles++;
      }
      if (hole.par === 3) girPar3.total++;
      if (hole.par === 4) girPar4.total++;
      if (hole.par === 5) girPar5.total++;
      
      // Putting
      stats.totalPutts += hole.putts;
      if (hole.putts === 1) stats.onePuttsTotal++;
      
      // First putt analysis
      if (hole.firstPuttDistance) {
        const bucket = getPuttDistanceBucket(hole.firstPuttDistance);
        const puttData = puttAttempts[bucket];
        if (puttData) {
          puttData.total++;
          if (hole.putts === 1) {
            puttData.made++;
          }
        }
        
        // Putt leave (proximity after first putt)
        if (hole.firstPuttLeave !== null && hole.firstPuttLeave !== undefined && hole.firstPuttLeave > 0) {
          allPuttLeaves.push(hole.firstPuttLeave);

          if (hole.firstPuttDistance !== null && hole.firstPuttDistance !== undefined) {
            if (hole.firstPuttDistance >= 5 && hole.firstPuttDistance < 10) {
              puttLeaves['5_10']?.push(hole.firstPuttLeave);
            } else if (hole.firstPuttDistance >= 10 && hole.firstPuttDistance < 15) {
              puttLeaves['10_15']?.push(hole.firstPuttLeave);
            } else if (hole.firstPuttDistance >= 15 && hole.firstPuttDistance < 20) {
              puttLeaves['15_20']?.push(hole.firstPuttLeave);
            } else if (hole.firstPuttDistance >= 20) {
              puttLeaves['20_plus']?.push(hole.firstPuttLeave);
            }
          }
        }
        
        // Putt efficiency
        const effBucket = hole.firstPuttDistance >= 30 ? '30_plus' : bucket;
        const effData = puttEfficiency[effBucket];
        if (effData) {
          effData.totalPutts += hole.putts;
          effData.count++;
        }
        
        // Miss direction
        if (hole.firstPuttMissDirection) {
          puttMisses.total++;
          if (hole.firstPuttMissDirection.includes('left')) puttMisses.left++;
          if (hole.firstPuttMissDirection.includes('right')) puttMisses.right++;
          if (hole.firstPuttMissDirection.includes('short')) puttMisses.short++;
          if (hole.firstPuttMissDirection.includes('long')) puttMisses.long++;
        }
      }
      
      // Approach proximity
      if (hole.approachProximity && hole.approachDistance) {
        approachProximities.push(hole.approachProximity);
        
        if (hole.par === 3) approachProxPar3.push(hole.approachProximity);
        if (hole.par === 4) approachProxPar4.push(hole.approachProximity);
        if (hole.par === 5) approachProxPar5.push(hole.approachProximity);
        
        if (hole.approachLie === 'fairway') approachProxFairway.push(hole.approachProximity);
        if (hole.approachLie === 'rough') approachProxRough.push(hole.approachProximity);
        if (hole.approachLie === 'sand') approachProxSand.push(hole.approachProximity);
        
        const distBucket = getApproachDistanceBucket(hole.approachDistance);
        const approachArr = approachProxByDistance[distBucket];
        if (approachArr) {
          approachArr.push(hole.approachProximity);
        }
        
        // Approach efficiency (strokes to finish from approach)
        const strokesToFinish = hole.score - (hole.shots.findIndex(s => 
          s.shotType === 'approach' && (s.result === 'green' || s.result === 'hole')
        ));
        if (strokesToFinish > 0) {
          const effData = approachEffByDistance[distBucket];
          if (effData) {
            effData.totalStrokes += strokesToFinish;
            effData.count++;
          }
        }
      }
      
      // Scrambling
      if (hole.scrambleAttempt) {
        stats.scrambleAttempts++;
        if (hole.scrambleMade) stats.scramblesMade++;
        
        // By lie - use the lie before the scramble shot
        const scrambleShot = hole.shots.find(s => s.shotType === 'around_green');
        if (scrambleShot) {
          if (scrambleShot.lieBefore === 'fairway') {
            scrambleFairway.total++;
            if (hole.scrambleMade) scrambleFairway.made++;
          } else if (scrambleShot.lieBefore === 'rough') {
            scrambleRough.total++;
            if (hole.scrambleMade) scrambleRough.made++;
          } else if (scrambleShot.lieBefore === 'sand') {
            scrambleSand.total++;
            if (hole.scrambleMade) scrambleSand.made++;
          }
          
          // By distance
          const dist = scrambleShot.distanceToHoleBefore;
          if (dist != null) {
            if (dist <= 10) {
              scramble0_10.total++;
              if (hole.scrambleMade) scramble0_10.made++;
            } else if (dist <= 20) {
              scramble10_20.total++;
              if (hole.scrambleMade) scramble10_20.made++;
            } else if (dist <= 30) {
              scramble20_30.total++;
              if (hole.scrambleMade) scramble20_30.made++;
            }
          }
        }
      }
      
      // Sand saves
      if (hole.sandSaveAttempt) {
        stats.sandSaveAttempts++;
        if (hole.sandSaveMade) stats.sandSavesMade++;
      }
      
      // Around the green efficiency
      const atgShots = hole.shots.filter(s => s.shotType === 'around_green');
      for (const shot of atgShots) {
        const strokesToFinish = hole.score - shot.shotNumber + 1;
        atgStrokes.push(strokesToFinish);
        
        const dist = shot.distanceToHoleBefore;
        if (dist != null) {
          if (dist <= 10) {
            atg0_10.strokes += strokesToFinish;
            atg0_10.count++;
          } else if (dist <= 20) {
            atg10_20.strokes += strokesToFinish;
            atg10_20.count++;
          } else if (dist <= 30) {
            atg20_30.strokes += strokesToFinish;
            atg20_30.count++;
          }
        }
        
        if (shot.lieBefore === 'fairway') {
          atgFairway.strokes += strokesToFinish;
          atgFairway.count++;
        } else if (shot.lieBefore === 'rough') {
          atgRough.strokes += strokesToFinish;
          atgRough.count++;
        } else if (shot.lieBefore === 'sand') {
          atgSand.strokes += strokesToFinish;
          atgSand.count++;
        }
      }
      
      // Penalties
      stats.totalPenalties += hole.penaltyStrokes;
      
      // Longest hole out
      if (hole.holedOutDistance) {
        if (stats.longestHoleOut === null || hole.holedOutDistance > stats.longestHoleOut) {
          stats.longestHoleOut = hole.holedOutDistance;
        }
      }
    }
  }
  
  // Current streak (from most recent round backwards)
  stats.currentNo3PuttStreak = current3PuttStreak;
  
  // ============================================================================
  // CALCULATE FINAL STATS
  // ============================================================================
  
  const numRounds = rounds.length;
  
  // Scoring
  stats.scoringAverage = safeAverage(totalScore, numRounds);
  stats.birdiesPerRound = safeAverage(stats.totalBirdies, numRounds);
  stats.eaglesPerRound = safeAverage(stats.totalEagles, numRounds);
  stats.parsPerRound = safeAverage(stats.totalPars, numRounds);
  stats.bogeysPerRound = safeAverage(stats.totalBogeys, numRounds);
  stats.doublePlusPerRound = safeAverage(stats.totalDoublePlus, numRounds);
  
  stats.practiceScoringAvg = safeAverage(practiceScore, stats.practiceRounds);
  stats.qualifyingScoringAvg = safeAverage(qualifyingScore, stats.qualifyingRounds);
  stats.tournamentScoringAvg = safeAverage(tournamentScore, stats.tournamentRounds);
  
  // Driving
  stats.drivingDistanceAvg = drivingDistances.length > 0 
    ? Math.round(drivingDistances.reduce((a, b) => a + b, 0) / drivingDistances.length)
    : null;
  stats.drivingDistanceDriverOnly = driverDistances.length > 0
    ? Math.round(driverDistances.reduce((a, b) => a + b, 0) / driverDistances.length)
    : null;
  stats.fairwayPercentage = safePercent(stats.fairwaysHit, stats.fairwayOpportunities);
  stats.fairwayPctPar4 = safePercent(fairwaysPar4.hit, fairwaysPar4.total);
  stats.fairwayPctPar5 = safePercent(fairwaysPar5.hit, fairwaysPar5.total);
  stats.fairwayPctDriver = safePercent(fairwaysDriver.hit, fairwaysDriver.total);
  stats.fairwayPctNonDriver = safePercent(fairwaysNonDriver.hit, fairwaysNonDriver.total);
  stats.missLeftPct = safePercent(stats.missLeftCount, totalMisses);
  stats.missRightPct = safePercent(stats.missRightCount, totalMisses);
  
  // GIR
  stats.girPercentage = safePercent(stats.girTotal, stats.girOpportunities);
  stats.girPerRound = safeAverage(stats.girTotal, numRounds);
  stats.girPctPar3 = safePercent(girPar3.made, girPar3.total);
  stats.girPctPar4 = safePercent(girPar4.made, girPar4.total);
  stats.girPctPar5 = safePercent(girPar5.made, girPar5.total);
  
  // Putting
  stats.puttsPerRound = safeAverage(stats.totalPutts, numRounds);
  stats.puttsPerHole = safeAverage(stats.totalPutts, stats.holesPlayed);
  stats.puttsPerGir = safeAverage(puttsOnGir, girHoles);
  stats.threePuttsPerRound = safeAverage(stats.threePuttsTotal, numRounds);
  
  // Putt make percentages
  stats.puttMakePct0_3 = safePercent(puttAttempts['0_3']?.made || 0, puttAttempts['0_3']?.total || 0);
  stats.puttMakePct3_5 = safePercent(puttAttempts['3_5']?.made || 0, puttAttempts['3_5']?.total || 0);
  stats.puttMakePct5_10 = safePercent(puttAttempts['5_10']?.made || 0, puttAttempts['5_10']?.total || 0);
  stats.puttMakePct10_15 = safePercent(puttAttempts['10_15']?.made || 0, puttAttempts['10_15']?.total || 0);
  stats.puttMakePct15_20 = safePercent(puttAttempts['15_20']?.made || 0, puttAttempts['15_20']?.total || 0);
  stats.puttMakePct20_25 = safePercent(puttAttempts['20_25']?.made || 0, puttAttempts['20_25']?.total || 0);
  stats.puttMakePct25_30 = safePercent(puttAttempts['25_30']?.made || 0, puttAttempts['25_30']?.total || 0);
  stats.puttMakePct30_35 = safePercent(puttAttempts['30_35']?.made || 0, puttAttempts['30_35']?.total || 0);
  stats.puttMakePct35Plus = safePercent(puttAttempts['35_plus']?.made || 0, puttAttempts['35_plus']?.total || 0);
  
  // Putt proximity
  stats.puttProximityAvg = allPuttLeaves.length > 0
    ? Math.round(allPuttLeaves.reduce((a, b) => a + b, 0) / allPuttLeaves.length * 10) / 10
    : null;
  const leaves_5_10 = puttLeaves['5_10'];
  stats.puttProximity5_10 = leaves_5_10 && leaves_5_10.length > 0
    ? Math.round(leaves_5_10.reduce((a, b) => a + b, 0) / leaves_5_10.length * 10) / 10
    : null;
  const leaves_10_15 = puttLeaves['10_15'];
  stats.puttProximity10_15 = leaves_10_15 && leaves_10_15.length > 0
    ? Math.round(leaves_10_15.reduce((a, b) => a + b, 0) / leaves_10_15.length * 10) / 10
    : null;
  const leaves_15_20 = puttLeaves['15_20'];
  stats.puttProximity15_20 = leaves_15_20 && leaves_15_20.length > 0
    ? Math.round(leaves_15_20.reduce((a, b) => a + b, 0) / leaves_15_20.length * 10) / 10
    : null;
  const leaves_20_plus = puttLeaves['20_plus'];
  stats.puttProximity20Plus = leaves_20_plus && leaves_20_plus.length > 0
    ? Math.round(leaves_20_plus.reduce((a, b) => a + b, 0) / leaves_20_plus.length * 10) / 10
    : null;
  
  // Putt efficiency
  stats.puttEfficiency0_3 = safeAverage(puttEfficiency['0_3']?.totalPutts || 0, puttEfficiency['0_3']?.count || 0);
  stats.puttEfficiency3_5 = safeAverage(puttEfficiency['3_5']?.totalPutts || 0, puttEfficiency['3_5']?.count || 0);
  stats.puttEfficiency5_10 = safeAverage(puttEfficiency['5_10']?.totalPutts || 0, puttEfficiency['5_10']?.count || 0);
  stats.puttEfficiency10_15 = safeAverage(puttEfficiency['10_15']?.totalPutts || 0, puttEfficiency['10_15']?.count || 0);
  stats.puttEfficiency15_20 = safeAverage(puttEfficiency['15_20']?.totalPutts || 0, puttEfficiency['15_20']?.count || 0);
  stats.puttEfficiency20_25 = safeAverage(puttEfficiency['20_25']?.totalPutts || 0, puttEfficiency['20_25']?.count || 0);
  stats.puttEfficiency25_30 = safeAverage(puttEfficiency['25_30']?.totalPutts || 0, puttEfficiency['25_30']?.count || 0);
  stats.puttEfficiency30Plus = safeAverage(puttEfficiency['30_plus']?.totalPutts || 0, puttEfficiency['30_plus']?.count || 0);
  
  // Putt miss direction
  stats.puttMissLeftPct = safePercent(puttMisses.left, puttMisses.total);
  stats.puttMissRightPct = safePercent(puttMisses.right, puttMisses.total);
  stats.puttMissShortPct = safePercent(puttMisses.short, puttMisses.total);
  stats.puttMissLongPct = safePercent(puttMisses.long, puttMisses.total);
  
  // Approach proximity
  stats.approachProximityAvg = approachProximities.length > 0
    ? Math.round(approachProximities.reduce((a, b) => a + b, 0) / approachProximities.length)
    : null;
  stats.approachProximityPar3 = approachProxPar3.length > 0
    ? Math.round(approachProxPar3.reduce((a, b) => a + b, 0) / approachProxPar3.length)
    : null;
  stats.approachProximityPar4 = approachProxPar4.length > 0
    ? Math.round(approachProxPar4.reduce((a, b) => a + b, 0) / approachProxPar4.length)
    : null;
  stats.approachProximityPar5 = approachProxPar5.length > 0
    ? Math.round(approachProxPar5.reduce((a, b) => a + b, 0) / approachProxPar5.length)
    : null;
  stats.approachProximityFairway = approachProxFairway.length > 0
    ? Math.round(approachProxFairway.reduce((a, b) => a + b, 0) / approachProxFairway.length)
    : null;
  stats.approachProximityRough = approachProxRough.length > 0
    ? Math.round(approachProxRough.reduce((a, b) => a + b, 0) / approachProxRough.length)
    : null;
  stats.approachProximitySand = approachProxSand.length > 0
    ? Math.round(approachProxSand.reduce((a, b) => a + b, 0) / approachProxSand.length)
    : null;
  
  // Approach by distance
  for (const bucket of Object.keys(approachProxByDistance)) {
    const arr = approachProxByDistance[bucket];
    const key = `approachProx${bucket.replace('_', '_')}` as keyof GolfStats;
    if (arr && arr.length > 0) {
      (stats as any)[key] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
  }

  // Approach efficiency
  for (const bucket of Object.keys(approachEffByDistance)) {
    const data = approachEffByDistance[bucket];
    const key = `approachEff${bucket.replace('_', '_')}` as keyof GolfStats;
    if (data) {
      (stats as any)[key] = safeAverage(data.totalStrokes, data.count);
    }
  }
  
  // Scrambling
  stats.scramblingPercentage = safePercent(stats.scramblesMade, stats.scrambleAttempts);
  stats.scramblingPctFairway = safePercent(scrambleFairway.made, scrambleFairway.total);
  stats.scramblingPctRough = safePercent(scrambleRough.made, scrambleRough.total);
  stats.scramblingPctSand = safePercent(scrambleSand.made, scrambleSand.total);
  stats.scramblingPct0_10 = safePercent(scramble0_10.made, scramble0_10.total);
  stats.scramblingPct10_20 = safePercent(scramble10_20.made, scramble10_20.total);
  stats.scramblingPct20_30 = safePercent(scramble20_30.made, scramble20_30.total);
  
  // Around the green efficiency
  stats.atgEfficiencyAvg = atgStrokes.length > 0
    ? Math.round(atgStrokes.reduce((a, b) => a + b, 0) / atgStrokes.length * 100) / 100
    : null;
  stats.atgEfficiency0_10 = safeAverage(atg0_10.strokes, atg0_10.count);
  stats.atgEfficiency10_20 = safeAverage(atg10_20.strokes, atg10_20.count);
  stats.atgEfficiency20_30 = safeAverage(atg20_30.strokes, atg20_30.count);
  stats.atgEffFairway = safeAverage(atgFairway.strokes, atgFairway.count);
  stats.atgEffRough = safeAverage(atgRough.strokes, atgRough.count);
  stats.atgEffSand = safeAverage(atgSand.strokes, atgSand.count);
  
  // Sand saves
  stats.sandSavePercentage = safePercent(stats.sandSavesMade, stats.sandSaveAttempts);
  
  // Penalties
  stats.penaltiesPerRound = safeAverage(stats.totalPenalties, numRounds);
  
  return stats;
}

// ============================================================================
// EXPORT HELPER FOR DISPLAY
// ============================================================================

export function formatStat(value: number | null, suffix: string = '', decimals: number = 1): string {
  if (value === null) return '-';
  if (suffix === '%') return `${value.toFixed(decimals)}%`;
  return `${value.toFixed(decimals)}${suffix}`;
}

export function formatStatInt(value: number | null): string {
  if (value === null) return '-';
  return value.toString();
}
