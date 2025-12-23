/**
 * Golf Stats Calculator
 * 
 * Comprehensive stats calculation engine for 50+ golf statistics.
 * Calculates all stats from shot-level data stored in the database.
 */

import type { HoleStats } from '@/components/golf/ShotTrackingComprehensive';

// ============================================================================
// TYPES
// ============================================================================

export interface DrivingStats {
  drivingDistanceAvg: number | null;
  drivingDistanceDriverOnly: number | null;
  fairwaysHit: number;
  fairwayOpportunities: number;
  fairwayPercentage: number | null;
  fairwayPctPar4: number | null;
  fairwayPctPar5: number | null;
  fairwayPctDriver: number | null;
  fairwayPctNonDriver: number | null;
  avgFairwaysPerRound: number | null;
  missLeftCount: number;
  missRightCount: number;
  missLeftPct: number | null;
  missRightPct: number | null;
}

export interface GIRStats {
  girTotal: number;
  girOpportunities: number;
  girPercentage: number | null;
  girPerRound: number | null;
  girPctPar3: number | null;
  girPctPar4: number | null;
  girPctPar5: number | null;
}

export interface PuttingStats {
  totalPutts: number;
  puttsPerRound: number | null;
  puttsPerHole: number | null;
  puttsPerGir: number | null;
  threePuttsTotal: number;
  threePuttsPerRound: number | null;
  onePuttsTotal: number;
  
  // Make percentages by distance bucket
  puttMakePct0_3: number | null;
  puttMakePct3_5: number | null;
  puttMakePct5_10: number | null;
  puttMakePct10_15: number | null;
  puttMakePct15_20: number | null;
  puttMakePct20_25: number | null;
  puttMakePct25_30: number | null;
  puttMakePct30_35: number | null;
  puttMakePct35Plus: number | null;
  
  // Proximity (avg leave after first putt)
  puttProximityAvg: number | null;
  puttProximity5_10: number | null;
  puttProximity10_15: number | null;
  puttProximity15_20: number | null;
  puttProximity20Plus: number | null;
  
  // Efficiency (avg putts to hole from distance)
  puttEfficiency0_3: number | null;
  puttEfficiency3_5: number | null;
  puttEfficiency5_10: number | null;
  puttEfficiency10_15: number | null;
  puttEfficiency15_20: number | null;
  puttEfficiency20_25: number | null;
  puttEfficiency25_30: number | null;
  puttEfficiency30Plus: number | null;
  
  // Miss direction percentages
  puttMissLeftPct: number | null;
  puttMissRightPct: number | null;
  puttMissShortPct: number | null;
  puttMissLongPct: number | null;
}

export interface ApproachStats {
  approachProximityAvg: number | null; // feet
  approachProximityPar3: number | null;
  approachProximityPar4: number | null;
  approachProximityPar5: number | null;
  approachProximityFairway: number | null;
  approachProximityRough: number | null;
  approachProximitySand: number | null;
  
  // By distance bucket
  approachProx30_75: number | null;
  approachProx75_100: number | null;
  approachProx100_125: number | null;
  approachProx125_150: number | null;
  approachProx150_175: number | null;
  approachProx175_200: number | null;
  approachProx200_225: number | null;
  approachProx225Plus: number | null;
  
  // Efficiency by distance
  approachEff30_75: number | null;
  approachEff75_100: number | null;
  approachEff100_125: number | null;
  approachEff125_150: number | null;
  approachEff150_175: number | null;
  approachEff175_200: number | null;
  approachEff200_225: number | null;
  approachEff225Plus: number | null;
}

export interface ScramblingStats {
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
}

export interface ScoringStats {
  roundsPlayed: number;
  holesPlayed: number;
  scoringAverage: number | null;
  bestRound: number | null;
  worstRound: number | null;
  
  // Counts
  totalBirdies: number;
  totalEagles: number;
  totalPars: number;
  totalBogeys: number;
  totalDoublePlus: number;
  
  // Per round
  birdiesPerRound: number | null;
  eaglesPerRound: number | null;
  parsPerRound: number | null;
  bogeysPerRound: number | null;
  doublePlusPerRound: number | null;
  
  // By round type
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
  longestHoleOut: number | null; // yards
  
  // Penalties
  totalPenalties: number;
  penaltiesPerRound: number | null;
}

export interface PlayerStats {
  driving: DrivingStats;
  gir: GIRStats;
  putting: PuttingStats;
  approach: ApproachStats;
  scrambling: ScramblingStats;
  scoring: ScoringStats;
  lastCalculatedAt: string;
}

// ============================================================================
// ROUND DATA INTERFACE (from database)
// ============================================================================

export interface RoundData {
  id: string;
  roundDate: string;
  roundType: 'practice' | 'qualifying' | 'tournament';
  courseName: string;
  totalScore: number;
  totalPutts: number;
  totalToPar: number;
  holes: HoleStats[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safePercentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // One decimal place
}

function safeAverage(sum: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((sum / count) * 10) / 10; // One decimal place
}

function getPuttDistanceBucket(feet: number): string {
  if (feet <= 3) return '0-3';
  if (feet <= 5) return '3-5';
  if (feet <= 10) return '5-10';
  if (feet <= 15) return '10-15';
  if (feet <= 20) return '15-20';
  if (feet <= 25) return '20-25';
  if (feet <= 30) return '25-30';
  if (feet <= 35) return '30-35';
  return '35+';
}

function getApproachDistanceBucket(yards: number): string {
  if (yards <= 75) return '30-75';
  if (yards <= 100) return '75-100';
  if (yards <= 125) return '100-125';
  if (yards <= 150) return '125-150';
  if (yards <= 175) return '150-175';
  if (yards <= 200) return '175-200';
  if (yards <= 225) return '200-225';
  return '225+';
}

// ============================================================================
// MAIN CALCULATOR
// ============================================================================

export function calculatePlayerStats(rounds: RoundData[]): PlayerStats {
  const now = new Date().toISOString();
  
  if (rounds.length === 0) {
    return getEmptyStats(now);
  }
  
  // Flatten all holes
  const allHoles = rounds.flatMap(r => r.holes);
  const roundsPlayed = rounds.length;
  const holesPlayed = allHoles.length;
  
  // ============================================================================
  // DRIVING STATS
  // ============================================================================
  
  const drivingHoles = allHoles.filter(h => h.par >= 4);
  const driverHoles = drivingHoles.filter(h => h.usedDriver === true);
  const nonDriverHoles = drivingHoles.filter(h => h.usedDriver === false);
  const par4Holes = drivingHoles.filter(h => h.par === 4);
  const par5Holes = drivingHoles.filter(h => h.par === 5);
  
  const drivingDistances = drivingHoles.filter(h => h.drivingDistance).map(h => h.drivingDistance!);
  const driverDistances = driverHoles.filter(h => h.drivingDistance).map(h => h.drivingDistance!);
  
  const fairwayHits = drivingHoles.filter(h => h.fairwayHit === true).length;
  const driverFairwayHits = driverHoles.filter(h => h.fairwayHit === true).length;
  const nonDriverFairwayHits = nonDriverHoles.filter(h => h.fairwayHit === true).length;
  const par4FairwayHits = par4Holes.filter(h => h.fairwayHit === true).length;
  const par5FairwayHits = par5Holes.filter(h => h.fairwayHit === true).length;
  
  const missLeftCount = drivingHoles.filter(h => h.driveMissDirection === 'left').length;
  const missRightCount = drivingHoles.filter(h => h.driveMissDirection === 'right').length;
  const totalMisses = missLeftCount + missRightCount;
  
  const driving: DrivingStats = {
    drivingDistanceAvg: safeAverage(drivingDistances.reduce((a, b) => a + b, 0), drivingDistances.length),
    drivingDistanceDriverOnly: safeAverage(driverDistances.reduce((a, b) => a + b, 0), driverDistances.length),
    fairwaysHit: fairwayHits,
    fairwayOpportunities: drivingHoles.length,
    fairwayPercentage: safePercentage(fairwayHits, drivingHoles.length),
    fairwayPctPar4: safePercentage(par4FairwayHits, par4Holes.length),
    fairwayPctPar5: safePercentage(par5FairwayHits, par5Holes.length),
    fairwayPctDriver: safePercentage(driverFairwayHits, driverHoles.length),
    fairwayPctNonDriver: safePercentage(nonDriverFairwayHits, nonDriverHoles.length),
    avgFairwaysPerRound: safeAverage(fairwayHits, roundsPlayed),
    missLeftCount,
    missRightCount,
    missLeftPct: safePercentage(missLeftCount, totalMisses),
    missRightPct: safePercentage(missRightCount, totalMisses),
  };
  
  // ============================================================================
  // GIR STATS
  // ============================================================================
  
  const girHoles = allHoles.filter(h => h.greenInRegulation);
  const par3Holes = allHoles.filter(h => h.par === 3);
  const par3Gir = par3Holes.filter(h => h.greenInRegulation).length;
  const allPar4Holes = allHoles.filter(h => h.par === 4);
  const par4Gir = allPar4Holes.filter(h => h.greenInRegulation).length;
  const allPar5Holes = allHoles.filter(h => h.par === 5);
  const par5Gir = allPar5Holes.filter(h => h.greenInRegulation).length;
  
  const gir: GIRStats = {
    girTotal: girHoles.length,
    girOpportunities: holesPlayed,
    girPercentage: safePercentage(girHoles.length, holesPlayed),
    girPerRound: safeAverage(girHoles.length, roundsPlayed),
    girPctPar3: safePercentage(par3Gir, par3Holes.length),
    girPctPar4: safePercentage(par4Gir, allPar4Holes.length),
    girPctPar5: safePercentage(par5Gir, allPar5Holes.length),
  };
  
  // ============================================================================
  // PUTTING STATS
  // ============================================================================
  
  const totalPutts = allHoles.reduce((sum, h) => sum + h.putts, 0);
  const girPutts = girHoles.reduce((sum, h) => sum + h.putts, 0);
  const threePutts = allHoles.filter(h => h.putts >= 3).length;
  const onePutts = allHoles.filter(h => h.putts === 1).length;
  
  // Putt make percentages by distance
  const puttMakeByBucket: Record<string, { made: number; total: number }> = {};
  const puttProximityByBucket: Record<string, { sum: number; count: number }> = {};
  const puttEfficiencyByBucket: Record<string, { sum: number; count: number }> = {};
  
  // Miss direction tracking
  let puttMissLeft = 0, puttMissRight = 0, puttMissShort = 0, puttMissLong = 0;
  let totalPuttMisses = 0;
  
  // First putt proximity tracking
  let totalFirstPuttProximity = 0;
  let firstPuttCount = 0;
  
  allHoles.forEach(hole => {
    if (hole.firstPuttDistance) {
      const bucket = getPuttDistanceBucket(hole.firstPuttDistance);
      
      // Initialize bucket if needed
      if (!puttMakeByBucket[bucket]) {
        puttMakeByBucket[bucket] = { made: 0, total: 0 };
      }
      if (!puttProximityByBucket[bucket]) {
        puttProximityByBucket[bucket] = { sum: 0, count: 0 };
      }
      if (!puttEfficiencyByBucket[bucket]) {
        puttEfficiencyByBucket[bucket] = { sum: 0, count: 0 };
      }
      
      puttMakeByBucket[bucket].total++;
      puttEfficiencyByBucket[bucket].sum += hole.putts;
      puttEfficiencyByBucket[bucket].count++;
      
      if (hole.putts === 1) {
        puttMakeByBucket[bucket].made++;
      }
      
      if (hole.firstPuttLeave !== null && hole.firstPuttLeave > 0) {
        puttProximityByBucket[bucket].sum += hole.firstPuttLeave;
        puttProximityByBucket[bucket].count++;
        totalFirstPuttProximity += hole.firstPuttLeave;
        firstPuttCount++;
      }
      
      // Miss direction
      if (hole.firstPuttMissDirection) {
        totalPuttMisses++;
        const dir = hole.firstPuttMissDirection.toLowerCase();
        if (dir.includes('left')) puttMissLeft++;
        if (dir.includes('right')) puttMissRight++;
        if (dir.includes('short')) puttMissShort++;
        if (dir.includes('long')) puttMissLong++;
      }
    }
  });
  
  const putting: PuttingStats = {
    totalPutts,
    puttsPerRound: safeAverage(totalPutts, roundsPlayed),
    puttsPerHole: safeAverage(totalPutts, holesPlayed),
    puttsPerGir: safeAverage(girPutts, girHoles.length),
    threePuttsTotal: threePutts,
    threePuttsPerRound: safeAverage(threePutts, roundsPlayed),
    onePuttsTotal: onePutts,
    
    puttMakePct0_3: puttMakeByBucket['0-3'] ? safePercentage(puttMakeByBucket['0-3'].made, puttMakeByBucket['0-3'].total) : null,
    puttMakePct3_5: puttMakeByBucket['3-5'] ? safePercentage(puttMakeByBucket['3-5'].made, puttMakeByBucket['3-5'].total) : null,
    puttMakePct5_10: puttMakeByBucket['5-10'] ? safePercentage(puttMakeByBucket['5-10'].made, puttMakeByBucket['5-10'].total) : null,
    puttMakePct10_15: puttMakeByBucket['10-15'] ? safePercentage(puttMakeByBucket['10-15'].made, puttMakeByBucket['10-15'].total) : null,
    puttMakePct15_20: puttMakeByBucket['15-20'] ? safePercentage(puttMakeByBucket['15-20'].made, puttMakeByBucket['15-20'].total) : null,
    puttMakePct20_25: puttMakeByBucket['20-25'] ? safePercentage(puttMakeByBucket['20-25'].made, puttMakeByBucket['20-25'].total) : null,
    puttMakePct25_30: puttMakeByBucket['25-30'] ? safePercentage(puttMakeByBucket['25-30'].made, puttMakeByBucket['25-30'].total) : null,
    puttMakePct30_35: puttMakeByBucket['30-35'] ? safePercentage(puttMakeByBucket['30-35'].made, puttMakeByBucket['30-35'].total) : null,
    puttMakePct35Plus: puttMakeByBucket['35+'] ? safePercentage(puttMakeByBucket['35+'].made, puttMakeByBucket['35+'].total) : null,
    
    puttProximityAvg: safeAverage(totalFirstPuttProximity, firstPuttCount),
    puttProximity5_10: puttProximityByBucket['5-10'] ? safeAverage(puttProximityByBucket['5-10'].sum, puttProximityByBucket['5-10'].count) : null,
    puttProximity10_15: puttProximityByBucket['10-15'] ? safeAverage(puttProximityByBucket['10-15'].sum, puttProximityByBucket['10-15'].count) : null,
    puttProximity15_20: puttProximityByBucket['15-20'] ? safeAverage(puttProximityByBucket['15-20'].sum, puttProximityByBucket['15-20'].count) : null,
    puttProximity20Plus: safeAverage(
      (puttProximityByBucket['20-25']?.sum || 0) + (puttProximityByBucket['25-30']?.sum || 0) + (puttProximityByBucket['30-35']?.sum || 0) + (puttProximityByBucket['35+']?.sum || 0),
      (puttProximityByBucket['20-25']?.count || 0) + (puttProximityByBucket['25-30']?.count || 0) + (puttProximityByBucket['30-35']?.count || 0) + (puttProximityByBucket['35+']?.count || 0)
    ),
    
    puttEfficiency0_3: puttEfficiencyByBucket['0-3'] ? safeAverage(puttEfficiencyByBucket['0-3'].sum, puttEfficiencyByBucket['0-3'].count) : null,
    puttEfficiency3_5: puttEfficiencyByBucket['3-5'] ? safeAverage(puttEfficiencyByBucket['3-5'].sum, puttEfficiencyByBucket['3-5'].count) : null,
    puttEfficiency5_10: puttEfficiencyByBucket['5-10'] ? safeAverage(puttEfficiencyByBucket['5-10'].sum, puttEfficiencyByBucket['5-10'].count) : null,
    puttEfficiency10_15: puttEfficiencyByBucket['10-15'] ? safeAverage(puttEfficiencyByBucket['10-15'].sum, puttEfficiencyByBucket['10-15'].count) : null,
    puttEfficiency15_20: puttEfficiencyByBucket['15-20'] ? safeAverage(puttEfficiencyByBucket['15-20'].sum, puttEfficiencyByBucket['15-20'].count) : null,
    puttEfficiency20_25: puttEfficiencyByBucket['20-25'] ? safeAverage(puttEfficiencyByBucket['20-25'].sum, puttEfficiencyByBucket['20-25'].count) : null,
    puttEfficiency25_30: puttEfficiencyByBucket['25-30'] ? safeAverage(puttEfficiencyByBucket['25-30'].sum, puttEfficiencyByBucket['25-30'].count) : null,
    puttEfficiency30Plus: safeAverage(
      (puttEfficiencyByBucket['30-35']?.sum || 0) + (puttEfficiencyByBucket['35+']?.sum || 0),
      (puttEfficiencyByBucket['30-35']?.count || 0) + (puttEfficiencyByBucket['35+']?.count || 0)
    ),
    
    puttMissLeftPct: safePercentage(puttMissLeft, totalPuttMisses),
    puttMissRightPct: safePercentage(puttMissRight, totalPuttMisses),
    puttMissShortPct: safePercentage(puttMissShort, totalPuttMisses),
    puttMissLongPct: safePercentage(puttMissLong, totalPuttMisses),
  };
  
  // ============================================================================
  // APPROACH STATS
  // ============================================================================
  
  const approachByBucket: Record<string, { sum: number; count: number }> = {};
  const approachByLie: Record<string, { sum: number; count: number }> = {};
  const approachByPar: Record<string, { sum: number; count: number }> = {};
  
  let totalApproachProximity = 0;
  let approachCount = 0;
  
  allHoles.forEach(hole => {
    if (hole.approachProximity && hole.approachDistance) {
      totalApproachProximity += hole.approachProximity;
      approachCount++;
      
      // By distance bucket
      const bucket = getApproachDistanceBucket(hole.approachDistance);
      if (!approachByBucket[bucket]) {
        approachByBucket[bucket] = { sum: 0, count: 0 };
      }
      approachByBucket[bucket].sum += hole.approachProximity;
      approachByBucket[bucket].count++;
      
      // By lie
      if (hole.approachLie) {
        if (!approachByLie[hole.approachLie]) {
          approachByLie[hole.approachLie] = { sum: 0, count: 0 };
        }
        approachByLie[hole.approachLie].sum += hole.approachProximity;
        approachByLie[hole.approachLie].count++;
      }
      
      // By par
      const parKey = `par${hole.par}`;
      if (!approachByPar[parKey]) {
        approachByPar[parKey] = { sum: 0, count: 0 };
      }
      approachByPar[parKey].sum += hole.approachProximity;
      approachByPar[parKey].count++;
    }
  });
  
  const approach: ApproachStats = {
    approachProximityAvg: safeAverage(totalApproachProximity, approachCount),
    approachProximityPar3: approachByPar['par3'] ? safeAverage(approachByPar['par3'].sum, approachByPar['par3'].count) : null,
    approachProximityPar4: approachByPar['par4'] ? safeAverage(approachByPar['par4'].sum, approachByPar['par4'].count) : null,
    approachProximityPar5: approachByPar['par5'] ? safeAverage(approachByPar['par5'].sum, approachByPar['par5'].count) : null,
    approachProximityFairway: approachByLie['fairway'] ? safeAverage(approachByLie['fairway'].sum, approachByLie['fairway'].count) : null,
    approachProximityRough: approachByLie['rough'] ? safeAverage(approachByLie['rough'].sum, approachByLie['rough'].count) : null,
    approachProximitySand: approachByLie['sand'] ? safeAverage(approachByLie['sand'].sum, approachByLie['sand'].count) : null,
    
    approachProx30_75: approachByBucket['30-75'] ? safeAverage(approachByBucket['30-75'].sum, approachByBucket['30-75'].count) : null,
    approachProx75_100: approachByBucket['75-100'] ? safeAverage(approachByBucket['75-100'].sum, approachByBucket['75-100'].count) : null,
    approachProx100_125: approachByBucket['100-125'] ? safeAverage(approachByBucket['100-125'].sum, approachByBucket['100-125'].count) : null,
    approachProx125_150: approachByBucket['125-150'] ? safeAverage(approachByBucket['125-150'].sum, approachByBucket['125-150'].count) : null,
    approachProx150_175: approachByBucket['150-175'] ? safeAverage(approachByBucket['150-175'].sum, approachByBucket['150-175'].count) : null,
    approachProx175_200: approachByBucket['175-200'] ? safeAverage(approachByBucket['175-200'].sum, approachByBucket['175-200'].count) : null,
    approachProx200_225: approachByBucket['200-225'] ? safeAverage(approachByBucket['200-225'].sum, approachByBucket['200-225'].count) : null,
    approachProx225Plus: approachByBucket['225+'] ? safeAverage(approachByBucket['225+'].sum, approachByBucket['225+'].count) : null,
    
    // Efficiency stats would require more shot-level data - placeholder for now
    approachEff30_75: null,
    approachEff75_100: null,
    approachEff100_125: null,
    approachEff125_150: null,
    approachEff150_175: null,
    approachEff175_200: null,
    approachEff200_225: null,
    approachEff225Plus: null,
  };
  
  // ============================================================================
  // SCRAMBLING STATS
  // ============================================================================
  
  const scrambleAttempts = allHoles.filter(h => h.scrambleAttempt).length;
  const scramblesMade = allHoles.filter(h => h.scrambleMade).length;
  
  const sandAttempts = allHoles.filter(h => h.sandSaveAttempt).length;
  const sandMade = allHoles.filter(h => h.sandSaveMade).length;
  
  // By lie type would need more granular data from shots
  
  const scrambling: ScramblingStats = {
    scrambleAttempts,
    scramblesMade,
    scramblingPercentage: safePercentage(scramblesMade, scrambleAttempts),
    scramblingPctFairway: null, // Would need lie data
    scramblingPctRough: null,
    scramblingPctSand: safePercentage(sandMade, sandAttempts),
    scramblingPct0_10: null, // Would need distance data
    scramblingPct10_20: null,
    scramblingPct20_30: null,
    
    atgEfficiencyAvg: null,
    atgEfficiency0_10: null,
    atgEfficiency10_20: null,
    atgEfficiency20_30: null,
    atgEffFairway: null,
    atgEffRough: null,
    atgEffSand: null,
    
    sandSaveAttempts: sandAttempts,
    sandSavesMade: sandMade,
    sandSavePercentage: safePercentage(sandMade, sandAttempts),
  };
  
  // ============================================================================
  // SCORING STATS
  // ============================================================================
  
  const scores = rounds.map(r => r.totalScore);
  const totalScore = scores.reduce((a, b) => a + b, 0);
  
  // Score distribution
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doublePlus = 0;
  
  allHoles.forEach(hole => {
    const diff = hole.score - hole.par;
    if (diff <= -2) eagles++;
    else if (diff === -1) birdies++;
    else if (diff === 0) pars++;
    else if (diff === 1) bogeys++;
    else doublePlus++;
  });
  
  // By round type
  const practiceRounds = rounds.filter(r => r.roundType === 'practice');
  const qualifyingRounds = rounds.filter(r => r.roundType === 'qualifying');
  const tournamentRounds = rounds.filter(r => r.roundType === 'tournament');
  
  // Streaks
  let mostBirdiesRound = 0;
  let mostBirdiesRow = 0;
  let mostParsRow = 0;
  let currentBirdieStreak = 0;
  let currentParStreak = 0;
  
  rounds.forEach(round => {
    let roundBirdies = 0;
    let birdieStreak = 0;
    let parStreak = 0;
    
    round.holes.forEach(hole => {
      const diff = hole.score - hole.par;
      
      // Birdie tracking
      if (diff === -1) {
        roundBirdies++;
        birdieStreak++;
        mostBirdiesRow = Math.max(mostBirdiesRow, birdieStreak);
      } else {
        birdieStreak = 0;
      }
      
      // Par tracking
      if (diff === 0) {
        parStreak++;
        mostParsRow = Math.max(mostParsRow, parStreak);
      } else {
        parStreak = 0;
      }
    });
    
    mostBirdiesRound = Math.max(mostBirdiesRound, roundBirdies);
  });
  
  // 3-putt streak
  let currentNo3Putt = 0;
  let longestNo3Putt = 0;
  
  // Go through all holes chronologically
  allHoles.forEach(hole => {
    if (hole.putts < 3) {
      currentNo3Putt++;
      longestNo3Putt = Math.max(longestNo3Putt, currentNo3Putt);
    } else {
      currentNo3Putt = 0;
    }
  });
  
  // Longest hole out
  const holeOuts = allHoles.filter(h => h.holedOutDistance).map(h => h.holedOutDistance!);
  const longestHoleOut = holeOuts.length > 0 ? Math.max(...holeOuts) : null;
  
  // Penalties
  const totalPenalties = allHoles.reduce((sum, h) => sum + h.penaltyStrokes, 0);
  
  const scoring: ScoringStats = {
    roundsPlayed,
    holesPlayed,
    scoringAverage: safeAverage(totalScore, roundsPlayed),
    bestRound: scores.length > 0 ? Math.min(...scores) : null,
    worstRound: scores.length > 0 ? Math.max(...scores) : null,
    
    totalBirdies: birdies,
    totalEagles: eagles,
    totalPars: pars,
    totalBogeys: bogeys,
    totalDoublePlus: doublePlus,
    
    birdiesPerRound: safeAverage(birdies, roundsPlayed),
    eaglesPerRound: safeAverage(eagles, roundsPlayed),
    parsPerRound: safeAverage(pars, roundsPlayed),
    bogeysPerRound: safeAverage(bogeys, roundsPlayed),
    doublePlusPerRound: safeAverage(doublePlus, roundsPlayed),
    
    practiceScoringAvg: practiceRounds.length > 0 
      ? safeAverage(practiceRounds.reduce((s, r) => s + r.totalScore, 0), practiceRounds.length) 
      : null,
    practiceRounds: practiceRounds.length,
    qualifyingScoringAvg: qualifyingRounds.length > 0 
      ? safeAverage(qualifyingRounds.reduce((s, r) => s + r.totalScore, 0), qualifyingRounds.length) 
      : null,
    qualifyingRounds: qualifyingRounds.length,
    tournamentScoringAvg: tournamentRounds.length > 0 
      ? safeAverage(tournamentRounds.reduce((s, r) => s + r.totalScore, 0), tournamentRounds.length) 
      : null,
    tournamentRounds: tournamentRounds.length,
    
    mostBirdiesRound,
    mostBirdiesRow,
    mostParsRow,
    currentNo3PuttStreak: currentNo3Putt,
    longestNo3PuttStreak: longestNo3Putt,
    longestHoleOut,
    
    totalPenalties,
    penaltiesPerRound: safeAverage(totalPenalties, roundsPlayed),
  };
  
  return {
    driving,
    gir,
    putting,
    approach,
    scrambling,
    scoring,
    lastCalculatedAt: now,
  };
}

// ============================================================================
// EMPTY STATS (for new players)
// ============================================================================

function getEmptyStats(now: string): PlayerStats {
  return {
    driving: {
      drivingDistanceAvg: null,
      drivingDistanceDriverOnly: null,
      fairwaysHit: 0,
      fairwayOpportunities: 0,
      fairwayPercentage: null,
      fairwayPctPar4: null,
      fairwayPctPar5: null,
      fairwayPctDriver: null,
      fairwayPctNonDriver: null,
      avgFairwaysPerRound: null,
      missLeftCount: 0,
      missRightCount: 0,
      missLeftPct: null,
      missRightPct: null,
    },
    gir: {
      girTotal: 0,
      girOpportunities: 0,
      girPercentage: null,
      girPerRound: null,
      girPctPar3: null,
      girPctPar4: null,
      girPctPar5: null,
    },
    putting: {
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
    },
    approach: {
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
    },
    scrambling: {
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
    },
    scoring: {
      roundsPlayed: 0,
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
      totalPenalties: 0,
      penaltiesPerRound: null,
    },
    lastCalculatedAt: now,
  };
}

export { getEmptyStats };
