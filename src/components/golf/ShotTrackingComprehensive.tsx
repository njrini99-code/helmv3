'use client';

import React, { useState, useEffect, useCallback } from 'react';

/**
 * GolfHelm Shot Tracking - COMPREHENSIVE STATS VERSION
 * 
 * Premium UI with comprehensive stats capture for 50+ golf statistics:
 * - Dark scorecard with yardages
 * - Shot progress pills
 * - Green hole info header
 * - Mini hole visualization
 * - Detailed shot-by-shot tracking
 * - Penalty strokes
 * - Putt break/slope/miss direction
 * - Lie type (auto from previous shot)
 * - Distance tracking for all shots
 */

// ============================================================================
// TYPES
// ============================================================================

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

export interface ShotRecord {
  shotNumber: number;
  shotType: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
  clubType: 'driver' | 'non_driver' | 'putter';
  lieBefore: 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';
  distanceToHoleBefore: number;
  distanceUnitBefore: 'yards' | 'feet';
  result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';
  distanceToHoleAfter: number;
  distanceUnitAfter: 'yards' | 'feet';
  shotDistance: number;
  missDirection?: string;
  puttBreak?: 'right_to_left' | 'left_to_right' | 'straight';
  puttSlope?: 'uphill' | 'downhill' | 'level' | 'severe';
  isPenalty: boolean;
  penaltyType?: 'ob' | 'water' | 'unplayable' | 'lost';
}

export interface HoleStats {
  holeNumber: number;
  par: number;
  yardage: number;
  score: number;
  putts: number;
  fairwayHit: boolean | null;
  greenInRegulation: boolean;
  drivingDistance: number | null;
  usedDriver: boolean | null;
  driveMissDirection: string | null;
  approachDistance: number | null;
  approachLie: string | null;
  approachProximity: number | null;
  approachMissDirection: string | null;
  scrambleAttempt: boolean;
  scrambleMade: boolean;
  sandSaveAttempt: boolean;
  sandSaveMade: boolean;
  penaltyStrokes: number;
  firstPuttDistance: number | null;
  firstPuttLeave: number | null;
  firstPuttBreak: string | null;
  firstPuttSlope: string | null;
  firstPuttMissDirection: string | null;
  holedOutDistance: number | null;
  holedOutType: string | null;
  shots: ShotRecord[];
}

interface ShotTrackingProps {
  holes: Hole[];
  currentHoleIndex: number;
  onHoleComplete: (holeIndex: number, stats: HoleStats) => void;
  onSaveShot?: (shot: ShotRecord) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShotTrackingComprehensive({
  holes,
  currentHoleIndex,
  onHoleComplete,
  onSaveShot
}: ShotTrackingProps) {
  const currentHole = holes[currentHoleIndex];

  if (!currentHole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-slate-600">Invalid hole data</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STATE
  // ============================================================================
  
  const [currentShot, setCurrentShot] = useState(1);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>([]);
  const [hasBeenOnGreen, setHasBeenOnGreen] = useState(false);
  const [puttCount, setPuttCount] = useState(0);
  
  // Distance tracking
  const [distanceToHole, setDistanceToHole] = useState(currentHole.yardage);
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'feet'>('yards');
  const [measuredDistance, setMeasuredDistance] = useState<string>('');
  
  // Current lie (auto-populated from previous shot result)
  const [currentLie, setCurrentLie] = useState<'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other'>('tee');
  
  // Shot input state
  const [usedDriver, setUsedDriver] = useState<boolean | null>(null);
  const [resultOfShot, setResultOfShot] = useState<string | null>(null);
  const [missDirection, setMissDirection] = useState<string | null>(null);
  const [puttBreak, setPuttBreak] = useState<string | null>(null);
  const [puttSlope, setPuttSlope] = useState<string | null>(null);
  
  // Penalty state
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyType, setPenaltyType] = useState<string | null>(null);
  
  // First putt tracking (for stats)
  const [firstPuttData, setFirstPuttData] = useState<{
    distance: number;
    break: string;
    slope: string;
  } | null>(null);

  // ============================================================================
  // RESET ON HOLE CHANGE
  // ============================================================================
  
  useEffect(() => {
    setCurrentShot(1);
    setShotHistory([]);
    setHasBeenOnGreen(false);
    setPuttCount(0);
    setDistanceToHole(currentHole.yardage);
    setDistanceUnit('yards');
    setMeasuredDistance('');
    setCurrentLie('tee');
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
    setShowPenaltyModal(false);
    setPenaltyType(null);
    setFirstPuttData(null);
  }, [currentHoleIndex, currentHole.yardage]);

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================
  
  const getShotType = useCallback((): 'tee' | 'approach' | 'around_green' | 'putting' => {
    if (hasBeenOnGreen || currentLie === 'green') return 'putting';
    if (currentShot === 1 && currentHole.par === 3) return 'approach';
    if (currentShot === 1 && currentHole.par !== 3) return 'tee';
    
    const dist = measuredDistance ? parseInt(measuredDistance) : distanceToHole;
    if (distanceUnit === 'feet' || dist <= 30) return 'around_green';
    return 'approach';
  }, [hasBeenOnGreen, currentLie, currentShot, currentHole.par, measuredDistance, distanceToHole, distanceUnit]);

  const shotType = getShotType();
  
  const getClubType = (): 'driver' | 'non_driver' | 'putter' => {
    if (shotType === 'putting') return 'putter';
    if (shotType === 'tee' && currentHole.par !== 3 && usedDriver) return 'driver';
    return 'non_driver';
  };

  // ============================================================================
  // VALIDATION
  // ============================================================================
  
  const isReadyForNextShot = (): boolean => {
    // Shot 1 (tee shot)
    if (currentShot === 1) {
      if (!resultOfShot) return false;
      if (currentHole.par !== 3 && usedDriver === null) return false;
      if (['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) return false;
      return true;
    }
    
    // Must have measured distance
    if (!measuredDistance) return false;
    
    // Putting requires break and slope
    if (shotType === 'putting' && (!puttBreak || !puttSlope)) return false;
    
    // Must have result
    if (!resultOfShot) return false;
    
    // Miss direction required for misses
    if (shotType !== 'putting' && ['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) {
      return false;
    }
    if (shotType === 'putting' && resultOfShot !== 'hole' && !missDirection) {
      return false;
    }
    
    return true;
  };

  // ============================================================================
  // PENALTY HANDLING
  // ============================================================================
  
  const handleAddPenalty = () => {
    setShowPenaltyModal(true);
  };

  const confirmPenalty = () => {
    if (!penaltyType) return;
    
    // Create penalty shot record
    const penaltyShot: ShotRecord = {
      shotNumber: currentShot,
      shotType: 'penalty',
      clubType: 'non_driver',
      lieBefore: currentLie,
      distanceToHoleBefore: distanceToHole,
      distanceUnitBefore: distanceUnit,
      result: 'penalty',
      distanceToHoleAfter: distanceToHole, // stays same
      distanceUnitAfter: distanceUnit,
      shotDistance: 0,
      isPenalty: true,
      penaltyType: penaltyType as 'ob' | 'water' | 'unplayable' | 'lost',
    };
    
    setShotHistory(prev => [...prev, penaltyShot]);
    setCurrentShot(prev => prev + 1);
    setShowPenaltyModal(false);
    setPenaltyType(null);
    
    // Save shot if callback provided
    onSaveShot?.(penaltyShot);
  };

  // ============================================================================
  // SHOT RECORDING
  // ============================================================================
  
  const handleNextShot = () => {
    // Calculate distances
    let shotDistance = 0;
    let distanceAfter = distanceToHole;
    let unitAfter = distanceUnit;
    
    if (currentShot === 1) {
      // First shot - no distance measured yet
      distanceAfter = distanceToHole;
    } else {
      const measured = parseInt(measuredDistance);
      distanceAfter = measured;
      
      // Convert for shot distance calculation
      let beforeInYards = distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole;
      let afterInYards = distanceUnit === 'feet' ? measured / 3 : measured;
      shotDistance = Math.round(beforeInYards - afterInYards);
    }
    
    // Update unit if landing on green
    if (resultOfShot === 'green') {
      unitAfter = 'feet';
      if (distanceUnit === 'yards' && currentShot > 1) {
        distanceAfter = parseInt(measuredDistance) * 3; // Convert to feet
      }
    }
    
    // Create shot record
    const shotRecord: ShotRecord = {
      shotNumber: currentShot,
      shotType: shotType,
      clubType: getClubType(),
      lieBefore: currentLie,
      distanceToHoleBefore: distanceToHole,
      distanceUnitBefore: distanceUnit,
      result: resultOfShot as any,
      distanceToHoleAfter: distanceAfter,
      distanceUnitAfter: unitAfter,
      shotDistance: shotDistance,
      missDirection: missDirection || undefined,
      puttBreak: shotType === 'putting' ? puttBreak as any : undefined,
      puttSlope: shotType === 'putting' ? puttSlope as any : undefined,
      isPenalty: false,
    };
    
    const updatedHistory = [...shotHistory, shotRecord];
    setShotHistory(updatedHistory);
    
    // Track first putt data for stats
    if (shotType === 'putting' && puttCount === 0) {
      setFirstPuttData({
        distance: distanceToHole,
        break: puttBreak!,
        slope: puttSlope!,
      });
    }
    
    // Update putt count
    if (shotType === 'putting') {
      setPuttCount(prev => prev + 1);
    }
    
    // Save shot if callback provided
    onSaveShot?.(shotRecord);
    
    // If holed out, complete the hole
    if (resultOfShot === 'hole') {
      completeHole(updatedHistory);
      return;
    }
    
    // Update lie based on result
    const newLie = resultOfShot as 'fairway' | 'rough' | 'sand' | 'green' | 'other';
    setCurrentLie(newLie);
    
    // Update green status
    if (resultOfShot === 'green') {
      setHasBeenOnGreen(true);
    } else if (hasBeenOnGreen && resultOfShot !== 'green') {
      // Putted off green (rare but possible)
      setHasBeenOnGreen(false);
    }
    
    // Set up for next shot
    setCurrentShot(currentShot + 1);
    setDistanceToHole(distanceAfter);
    setDistanceUnit(unitAfter);
    setMeasuredDistance('');
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
  };

  // ============================================================================
  // HOLE COMPLETION
  // ============================================================================
  
  const completeHole = (shots: ShotRecord[]) => {
    const score = shots.filter(s => !s.isPenalty).length + shots.filter(s => s.isPenalty).length;
    const putts = shots.filter(s => s.shotType === 'putting').length;
    const penalties = shots.filter(s => s.isPenalty).length;
    
    // Determine fairway hit (for par 4/5)
    let fairwayHit: boolean | null = null;
    let drivingDistance: number | null = null;
    let driveMissDirection: string | null = null;
    let driverUsed: boolean | null = null;
    
    if (currentHole.par >= 4) {
      const teeShot = shots.find(s => s.shotType === 'tee');
      if (teeShot) {
        fairwayHit = teeShot.result === 'fairway';
        driveMissDirection = teeShot.missDirection || null;
        driverUsed = teeShot.clubType === 'driver';
        
        // Calculate driving distance
        const nextShot = shots.find(s => s.shotNumber === 2 && !s.isPenalty);
        if (nextShot && teeShot.distanceUnitBefore === 'yards') {
          drivingDistance = teeShot.distanceToHoleBefore - (nextShot.distanceToHoleBefore);
        }
      }
    }
    
    // GIR calculation
    const shotsToGreen = currentHole.par - 2;
    const shotsTakenToGreen = shots.findIndex(s => s.result === 'green' || s.result === 'hole');
    const nonPenaltyShotsToGreen = shots
      .slice(0, shotsTakenToGreen + 1)
      .filter(s => !s.isPenalty).length;
    const greenInRegulation = shotsTakenToGreen !== -1 && nonPenaltyShotsToGreen <= shotsToGreen;
    
    // Approach data
    let approachDistance: number | null = null;
    let approachLie: string | null = null;
    let approachProximity: number | null = null;
    let approachMissDirection: string | null = null;
    
    const approachShot = shots.find(s => s.shotType === 'approach' && s.result === 'green');
    if (approachShot) {
      approachDistance = approachShot.distanceToHoleBefore;
      approachLie = approachShot.lieBefore;
      approachProximity = approachShot.distanceToHoleAfter;
      if (approachShot.distanceUnitAfter === 'yards') {
        approachProximity = approachShot.distanceToHoleAfter * 3; // Convert to feet
      }
    } else {
      // Check around the green shots that hit green
      const atgShot = shots.find(s => s.shotType === 'around_green' && s.result === 'green');
      if (atgShot) {
        approachDistance = atgShot.distanceToHoleBefore;
        approachLie = atgShot.lieBefore;
        approachProximity = atgShot.distanceToHoleAfter;
      }
    }
    
    // Miss approach direction
    const missedApproach = shots.find(s => 
      (s.shotType === 'approach' || s.shotType === 'around_green') && 
      s.result !== 'green' && s.result !== 'hole'
    );
    if (missedApproach) {
      approachMissDirection = missedApproach.missDirection || null;
    }
    
    // Scrambling
    const scrambleAttempt = !greenInRegulation;
    const scrambleMade = scrambleAttempt && score <= currentHole.par;
    
    // Sand save
    const hadSandShot = shots.some(s => s.lieBefore === 'sand' && s.shotType === 'around_green');
    const sandSaveAttempt = hadSandShot && !greenInRegulation;
    const sandSaveMade = sandSaveAttempt && score <= currentHole.par;
    
    // First putt data
    const firstPutt = shots.find(s => s.shotType === 'putting');
    let firstPuttDistance: number | null = null;
    let firstPuttLeave: number | null = null;
    let firstPuttBreakVal: string | null = null;
    let firstPuttSlopeVal: string | null = null;
    let firstPuttMissDir: string | null = null;
    
    if (firstPutt) {
      firstPuttDistance = firstPutt.distanceToHoleBefore;
      firstPuttLeave = firstPutt.result === 'hole' ? 0 : firstPutt.distanceToHoleAfter;
      firstPuttBreakVal = firstPutt.puttBreak || null;
      firstPuttSlopeVal = firstPutt.puttSlope || null;
      firstPuttMissDir = firstPutt.result === 'hole' ? null : firstPutt.missDirection || null;
    }
    
    // Hole out from off green
    let holedOutDistance: number | null = null;
    let holedOutType: string | null = null;
    
    const holedFromOffGreen = shots.find(s => 
      s.result === 'hole' && s.shotType !== 'putting'
    );
    if (holedFromOffGreen) {
      holedOutDistance = holedFromOffGreen.distanceToHoleBefore;
      holedOutType = holedFromOffGreen.shotType;
    }
    
    // Build hole stats
    const holeStats: HoleStats = {
      holeNumber: currentHole.number,
      par: currentHole.par,
      yardage: currentHole.yardage,
      score,
      putts,
      fairwayHit,
      greenInRegulation,
      drivingDistance,
      usedDriver: driverUsed,
      driveMissDirection,
      approachDistance,
      approachLie,
      approachProximity,
      approachMissDirection,
      scrambleAttempt,
      scrambleMade,
      sandSaveAttempt,
      sandSaveMade,
      penaltyStrokes: penalties,
      firstPuttDistance,
      firstPuttLeave,
      firstPuttBreak: firstPuttBreakVal,
      firstPuttSlope: firstPuttSlopeVal,
      firstPuttMissDirection: firstPuttMissDir,
      holedOutDistance,
      holedOutType,
      shots,
    };
    
    onHoleComplete(currentHoleIndex, holeStats);
  };

  // ============================================================================
  // UI HELPERS
  // ============================================================================
  
  const handleResultSelect = (result: string) => {
    setResultOfShot(result);
    if (shotType !== 'putting' && !['rough', 'sand', 'other'].includes(result)) {
      setMissDirection(null);
    }
    if (shotType === 'putting' && result === 'hole') {
      setMissDirection(null);
    }
  };

  // Calculate running totals
  const front9Score = holes.slice(0, 9).reduce((sum, h) => sum + (h.score || 0), 0);
  const back9Score = holes.slice(9, 18).reduce((sum, h) => sum + (h.score || 0), 0);
  const front9HasScores = holes.slice(0, 9).some(h => h.score !== null);
  const back9HasScores = holes.slice(9, 18).some(h => h.score !== null);
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);

  // Current distance for visualization
  const currentDistanceDisplay = currentShot === 1 
    ? currentHole.yardage 
    : (measuredDistance ? parseInt(measuredDistance) : distanceToHole);
  const currentUnitDisplay = currentShot === 1 ? 'yards' : distanceUnit;

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="min-h-screen bg-slate-100">
      
      {/* ================================================================== */}
      {/* DARK SCORECARD HEADER */}
      {/* ================================================================== */}
      <div className="w-full bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full">
            
            {/* Front 9 */}
            {holes.slice(0, 9).map((hole, idx) => {
              const isCurrent = idx === currentHoleIndex;
              const hasScore = hole.score !== null;
              const toPar = hasScore ? (hole.score! - hole.par) : 0;
              
              return (
                <div 
                  key={hole.number}
                  className={`min-w-[72px] py-3 px-2 border-r border-slate-700 text-center transition-all
                    ${isCurrent ? 'bg-green-600' : 'hover:bg-slate-700'}`}
                >
                  <div className={`text-xs font-semibold mb-0.5 ${isCurrent ? 'text-green-100' : 'text-slate-400'}`}>
                    Hole {hole.number}
                  </div>
                  <div className={`text-xs mb-0.5 ${isCurrent ? 'text-green-200' : 'text-slate-500'}`}>
                    Par {hole.par}
                  </div>
                  <div className={`text-xs mb-1.5 ${isCurrent ? 'text-green-200' : 'text-slate-500'}`}>
                    {hole.yardage} yds
                  </div>
                  <div className="flex justify-center">
                    {hasScore ? (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
                        ${toPar <= -2 ? 'bg-yellow-400 text-slate-900' : ''}
                        ${toPar === -1 ? 'bg-red-500 text-white' : ''}
                        ${toPar === 0 ? 'bg-slate-600 text-white' : ''}
                        ${toPar === 1 ? 'bg-slate-500 text-white border-2 border-slate-300' : ''}
                        ${toPar >= 2 ? 'bg-slate-500 text-white border-2 border-slate-300' : ''}
                      `}>
                        {hole.score}
                      </div>
                    ) : (
                      <div className={`text-lg font-bold ${isCurrent ? 'text-green-200' : 'text-slate-600'}`}>
                        -
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* OUT */}
            <div className="min-w-[72px] py-3 px-2 border-r-2 border-slate-600 text-center bg-slate-900">
              <div className="text-xs font-bold text-slate-300 mb-0.5">OUT</div>
              <div className="text-xs text-slate-500 mb-0.5">
                Par {holes.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-500 mb-1.5">
                {holes.slice(0, 9).reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-base font-bold text-white">
                {front9HasScores ? front9Score : '-'}
              </div>
            </div>

            {/* Back 9 */}
            {holes.slice(9, 18).map((hole, idx) => {
              const actualIdx = idx + 9;
              const isCurrent = actualIdx === currentHoleIndex;
              const hasScore = hole.score !== null;
              const toPar = hasScore ? (hole.score! - hole.par) : 0;
              
              return (
                <div 
                  key={hole.number}
                  className={`min-w-[72px] py-3 px-2 border-r border-slate-700 text-center transition-all
                    ${isCurrent ? 'bg-green-600' : 'hover:bg-slate-700'}`}
                >
                  <div className={`text-xs font-semibold mb-0.5 ${isCurrent ? 'text-green-100' : 'text-slate-400'}`}>
                    Hole {hole.number}
                  </div>
                  <div className={`text-xs mb-0.5 ${isCurrent ? 'text-green-200' : 'text-slate-500'}`}>
                    Par {hole.par}
                  </div>
                  <div className={`text-xs mb-1.5 ${isCurrent ? 'text-green-200' : 'text-slate-500'}`}>
                    {hole.yardage} yds
                  </div>
                  <div className="flex justify-center">
                    {hasScore ? (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
                        ${toPar <= -2 ? 'bg-yellow-400 text-slate-900' : ''}
                        ${toPar === -1 ? 'bg-red-500 text-white' : ''}
                        ${toPar === 0 ? 'bg-slate-600 text-white' : ''}
                        ${toPar === 1 ? 'bg-slate-500 text-white border-2 border-slate-300' : ''}
                        ${toPar >= 2 ? 'bg-slate-500 text-white border-2 border-slate-300' : ''}
                      `}>
                        {hole.score}
                      </div>
                    ) : (
                      <div className={`text-lg font-bold ${isCurrent ? 'text-green-200' : 'text-slate-600'}`}>
                        -
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* IN */}
            <div className="min-w-[72px] py-3 px-2 border-r-2 border-slate-600 text-center bg-slate-900">
              <div className="text-xs font-bold text-slate-300 mb-0.5">IN</div>
              <div className="text-xs text-slate-500 mb-0.5">
                Par {holes.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-500 mb-1.5">
                {holes.slice(9, 18).reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-base font-bold text-white">
                {back9HasScores ? back9Score : '-'}
              </div>
            </div>

            {/* TOTAL */}
            <div className="min-w-[80px] py-3 px-2 text-center bg-slate-950">
              <div className="text-xs font-bold text-white mb-0.5">TOTAL</div>
              <div className="text-xs text-slate-400 mb-0.5">
                Par {totalPar}
              </div>
              <div className="text-xs text-slate-400 mb-1.5">
                {holes.reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-lg font-bold text-green-400">
                {(front9HasScores || back9HasScores) ? front9Score + back9Score : '-'}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ================================================================== */}
      <div className="flex">
        
        {/* LEFT: Shot Tracking Interface */}
        <div className="flex-1 p-4 max-w-3xl mx-auto space-y-4">
          
          {/* Shot Progress Pills */}
          <div className="flex items-center gap-2 px-2">
            <span className="text-sm font-semibold text-slate-500 mr-2">SHOT</span>
            {[1, 2, 3, 4, 5, 6].map(num => {
              const isActive = num === currentShot;
              const isCompleted = num < currentShot;
              const hasPenalty = shotHistory.some(s => s.shotNumber === num && s.isPenalty);
              
              return (
                <div
                  key={num}
                  className={`w-14 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all
                    ${isActive ? 'bg-green-500 text-white shadow-lg' : ''}
                    ${isCompleted && !hasPenalty ? 'bg-green-200 text-green-800' : ''}
                    ${isCompleted && hasPenalty ? 'bg-red-200 text-red-800' : ''}
                    ${!isActive && !isCompleted ? 'bg-slate-200 text-slate-400' : ''}
                  `}
                >
                  {num}
                </div>
              );
            })}
            {currentShot > 6 && (
              <div className="w-14 h-9 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold shadow-lg">
                {currentShot}
              </div>
            )}
          </div>

          {/* Green Header - Hole Info */}
          <div className="bg-gradient-to-r from-green-600 to-green-500 rounded-2xl p-5 shadow-lg">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">Hole {currentHole.number}</h1>
                  <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold text-white">
                    Par {currentHole.par}
                  </span>
                </div>
                <p className="text-green-100 mt-1">
                  Shot {currentShot} • {shotType.charAt(0).toUpperCase() + shotType.slice(1).replace('_', ' ')}
                  {currentLie !== 'tee' && currentShot > 1 && (
                    <span className="ml-2 text-green-200">• From {currentLie}</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-green-200 uppercase font-semibold">Measure Distance</div>
                <div className="flex items-baseline gap-1 mt-1">
                  <input
                    type="number"
                    value={currentShot === 1 ? currentHole.yardage : measuredDistance}
                    onChange={(e) => currentShot > 1 && setMeasuredDistance(e.target.value)}
                    disabled={currentShot === 1}
                    placeholder="0"
                    className={`w-20 px-2 py-2 rounded-lg text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-white/50
                      ${currentShot === 1 
                        ? 'bg-white/20 text-white cursor-not-allowed' 
                        : 'bg-white text-green-600'
                      }`}
                  />
                  <span className="text-lg font-bold text-white uppercase">
                    {currentShot === 1 ? 'YDS' : distanceUnit === 'yards' ? 'YDS' : 'FEET'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Driver Selection (Shot 1 for Par 4/5) */}
          {currentShot === 1 && currentHole.par !== 3 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-600 uppercase mb-3">Club Off Tee</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setUsedDriver(true)}
                  className={`py-4 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2
                    ${usedDriver === true 
                      ? 'bg-green-500 border-green-500 text-white shadow-md' 
                      : 'border-slate-200 hover:border-green-400 hover:bg-green-50'
                    }`}
                >
                  <span className="text-xl">🏌️</span> Driver
                </button>
                <button
                  onClick={() => setUsedDriver(false)}
                  className={`py-4 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2
                    ${usedDriver === false 
                      ? 'bg-green-500 border-green-500 text-white shadow-md' 
                      : 'border-slate-200 hover:border-green-400 hover:bg-green-50'
                    }`}
                >
                  <span className="text-xl">🏑</span> Non-Driver
                </button>
              </div>
            </div>
          )}

          {/* Putting: Break & Slope */}
          {shotType === 'putting' && currentShot > 1 && measuredDistance && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-600 uppercase mb-3">⛳ Putt Details</div>
              
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Break</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'left_to_right', label: 'L → R' },
                    { value: 'straight', label: 'Straight' },
                    { value: 'right_to_left', label: 'R → L' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPuttBreak(opt.value)}
                      className={`py-3 rounded-xl border-2 font-semibold transition-all
                        ${puttBreak === opt.value 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'border-slate-200 hover:border-green-400'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Slope</label>
                <div className="grid grid-cols-4 gap-2">
                  {['uphill', 'downhill', 'level', 'severe'].map(slope => (
                    <button
                      key={slope}
                      onClick={() => setPuttSlope(slope)}
                      className={`py-3 rounded-xl border-2 font-semibold text-sm transition-all
                        ${puttSlope === slope 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'border-slate-200 hover:border-green-400'
                        }`}
                    >
                      {slope.charAt(0).toUpperCase() + slope.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Shot Result */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-sm font-bold text-slate-500 uppercase mb-3">Shot Result</div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'fairway', label: 'Fairway' },
                { value: 'rough', label: 'Rough' },
                { value: 'sand', label: 'Sand' },
                { value: 'green', label: 'Green' },
                { value: 'hole', label: 'Hole', icon: '🕳️' },
                { value: 'other', label: 'Other' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleResultSelect(option.value)}
                  className={`py-4 rounded-xl border-2 font-bold transition-all
                    ${resultOfShot === option.value 
                      ? option.value === 'hole'
                        ? 'bg-yellow-400 border-yellow-400 text-slate-900 shadow-md'
                        : 'bg-green-500 border-green-500 text-white shadow-md'
                      : 'border-slate-200 hover:border-green-400 hover:bg-green-50'
                    }`}
                >
                  {option.icon && <span className="mr-1">{option.icon}</span>}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Miss Directions */}
          {((shotType === 'tee' && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
            ((shotType === 'approach' || shotType === 'around_green') && resultOfShot && !['green', 'hole', 'fairway'].includes(resultOfShot)) ||
            (shotType === 'putting' && resultOfShot && resultOfShot !== 'hole')) && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-500 uppercase mb-3">Miss Direction</div>
              
              {/* Tee shot: Left/Right only */}
              {shotType === 'tee' && (
                <div className="grid grid-cols-2 gap-3">
                  {['left', 'right'].map(dir => (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-4 rounded-xl border-2 font-bold transition-all
                        ${missDirection === dir 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'border-slate-200 hover:border-green-400'
                        }`}
                    >
                      {dir === 'left' ? '← Left' : 'Right →'}
                    </button>
                  ))}
                </div>
              )}

              {/* Approach/Around green: 9-zone grid */}
              {(shotType === 'approach' || shotType === 'around_green') && (
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {['long_left', 'long', 'long_right', 'left', null, 'right', 'short_left', 'short', 'short_right'].map((dir, idx) => (
                    dir === null ? (
                      <div key={idx} className="flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-green-100 border-2 border-green-300 flex items-center justify-center text-lg">
                          ⛳
                        </div>
                      </div>
                    ) : (
                      <button
                        key={dir}
                        onClick={() => setMissDirection(dir)}
                        className={`py-3 rounded-xl border-2 font-semibold text-sm transition-all
                          ${missDirection === dir 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : 'border-slate-200 hover:border-green-400'
                          }`}
                      >
                        {dir.split('_').map(w => w.charAt(0).toUpperCase()).join('-')}
                      </button>
                    )
                  ))}
                </div>
              )}

              {/* Putting: 9-zone grid */}
              {shotType === 'putting' && (
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {[
                    'long_left', 'long', 'long_right',
                    'left', null, 'right',
                    'short_left', 'short', 'short_right'
                  ].map((dir, idx) => (
                    dir === null ? (
                      <div key={idx} className="flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-green-100 border-2 border-green-300 flex items-center justify-center text-lg">
                          ⛳
                        </div>
                      </div>
                    ) : (
                      <button
                        key={dir}
                        onClick={() => setMissDirection(dir)}
                        className={`py-3 rounded-xl border-2 font-semibold text-sm transition-all
                          ${missDirection === dir 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : 'border-slate-200 hover:border-green-400'
                          }`}
                      >
                        {dir.split('_').map(w => w.charAt(0).toUpperCase()).join('-')}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Next Shot Button */}
          <button
            onClick={handleNextShot}
            disabled={!isReadyForNextShot()}
            className={`w-full py-5 rounded-xl font-bold text-lg transition-all
              ${isReadyForNextShot() 
                ? resultOfShot === 'hole'
                  ? 'bg-yellow-400 text-slate-900 hover:bg-yellow-500 shadow-lg'
                  : 'bg-green-500 text-white hover:bg-green-600 shadow-lg'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
          >
            {resultOfShot === 'hole' 
              ? `✅ Complete Hole - Score: ${currentShot}` 
              : 'Next Shot'}
          </button>

          {/* Shot History */}
          {shotHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-sm font-bold text-slate-500 uppercase mb-3">
                Shot History (Score: {currentShot})
              </div>
              <div className="space-y-2">
                {shotHistory.map((shot, idx) => (
                  <div 
                    key={idx} 
                    className={`flex justify-between items-center py-3 px-3 rounded-lg border
                      ${shot.isPenalty ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${shot.isPenalty ? 'text-red-600' : 'text-green-600'}`}>
                        #{shot.shotNumber}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-700">
                          {shot.isPenalty ? 'Penalty' : shot.shotType.replace('_', ' ').toUpperCase()}
                        </span>
                        {!shot.isPenalty && (
                          <span className="text-slate-500 ml-2">→ {shot.result}</span>
                        )}
                      </div>
                    </div>
                    {!shot.isPenalty && shot.shotDistance > 0 && (
                      <div className="text-right">
                        <span className="font-bold text-slate-700">{shot.shotDistance} yds</span>
                      </div>
                    )}
                    {shot.isPenalty && (
                      <span className="text-xs font-semibold text-red-500 uppercase">
                        {shot.penaltyType}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Penalty Button */}
          <button
            onClick={handleAddPenalty}
            className="w-full py-3 bg-red-50 border-2 border-red-200 rounded-xl text-red-600 font-semibold hover:bg-red-100 transition-all"
          >
            ⚠️ Add Penalty Stroke
          </button>

        </div>

        {/* RIGHT: Mini Hole Visualization */}
        <div className="hidden lg:block w-48 p-4">
          <div className="sticky top-36 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-center mb-3">
              <div className="text-xs font-bold text-slate-500 uppercase">Hole {currentHole.number}</div>
              <div className="text-lg font-bold text-green-600">{currentShot} {currentShot === 1 ? 'shot' : 'shots'}</div>
            </div>
            
            {/* Visual representation */}
            <div className="relative h-64 flex flex-col items-center">
              {/* Flag at top */}
              <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-green-600 mb-1"></div>
              
              {/* Distance bar */}
              <div className="flex-1 w-2 bg-slate-200 rounded-full relative overflow-hidden">
                <div 
                  className="absolute bottom-0 w-full bg-gradient-to-t from-green-500 to-green-400 rounded-full transition-all duration-300"
                  style={{ 
                    height: `${Math.min(100, Math.max(5, (1 - currentDistanceDisplay / currentHole.yardage) * 100))}%` 
                  }}
                ></div>
              </div>
              
              {/* Ball at bottom */}
              <div className="w-3 h-3 bg-white rounded-full border-2 border-slate-400 mt-1"></div>
            </div>
            
            {/* Distance remaining */}
            <div className="text-center mt-3">
              <div className="text-2xl font-bold text-green-600">
                {currentDistanceDisplay}
              </div>
              <div className="text-xs text-slate-500">{currentUnitDisplay} left</div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* PENALTY MODAL */}
      {/* ================================================================== */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-4">⚠️ Add Penalty</h2>
            
            <div className="space-y-2 mb-6">
              {[
                { value: 'ob', label: 'Out of Bounds', emoji: '🚫' },
                { value: 'water', label: 'Water Hazard', emoji: '💧' },
                { value: 'unplayable', label: 'Unplayable Lie', emoji: '🌳' },
                { value: 'lost', label: 'Lost Ball', emoji: '❓' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPenaltyType(opt.value)}
                  className={`w-full py-4 rounded-xl border-2 font-semibold text-left px-4 transition-all flex items-center gap-3
                    ${penaltyType === opt.value 
                      ? 'bg-red-500 border-red-500 text-white' 
                      : 'border-slate-200 hover:border-red-300 hover:bg-red-50'
                    }`}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPenaltyModal(false); setPenaltyType(null); }}
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmPenalty}
                disabled={!penaltyType}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all
                  ${penaltyType 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
              >
                Add +1 Stroke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
