'use client';

import React, { useState, useEffect, useCallback } from 'react';

/**
 * GolfHelm Shot Tracking - COMPREHENSIVE STATS VERSION
 * 
 * Captures all data needed for 50+ golf statistics:
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

  const getScoreDisplay = (hole: Hole) => {
    if (hole.score === null) {
      return { display: '-', className: 'text-slate-300' };
    }
    const diff = hole.score - hole.par;
    if (diff <= -2) {
      return {
        display: hole.score,
        className: 'w-7 h-7 rounded-full bg-yellow-400 border border-yellow-500 flex items-center justify-center',
        textColor: 'text-slate-900'
      };
    } else if (diff === -1) {
      return {
        display: hole.score,
        className: 'w-7 h-7 rounded-full bg-red-500 flex items-center justify-center',
        textColor: 'text-white'
      };
    } else if (diff === 0) {
      return { display: hole.score, className: '', textColor: 'text-slate-900' };
    } else if (diff === 1) {
      return {
        display: hole.score,
        className: 'w-7 h-7 border-2 border-slate-900 rounded-sm flex items-center justify-center',
        textColor: 'text-slate-900'
      };
    } else {
      return {
        display: hole.score,
        className: 'w-7 h-7 border-4 border-slate-900 rounded-sm flex items-center justify-center',
        textColor: 'text-slate-900'
      };
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="min-h-screen bg-slate-50">
      
      {/* ================================================================== */}
      {/* HORIZONTAL SCORECARD */}
      {/* ================================================================== */}
      <div className="w-full bg-white border-b border-slate-200 shadow-md sticky top-0 z-50">
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full">
            
            {/* Front 9 */}
            <div className="flex">
              {holes.slice(0, 9).map((hole, idx) => {
                const scoreData = getScoreDisplay(hole);
                const isCurrent = idx === currentHoleIndex;
                return (
                  <div 
                    key={hole.number}
                    className={`min-w-[70px] p-2 border-r border-slate-200 text-center
                      ${isCurrent ? 'bg-green-50 border-l-4 border-l-green-600' : ''}`}
                  >
                    <div className="text-xs font-bold text-slate-600">H{hole.number}</div>
                    <div className="text-xs text-slate-500">P{hole.par}</div>
                    <div className={scoreData.className || 'mt-1'}>
                      <span className={`font-bold text-sm ${scoreData.textColor || 'text-slate-900'}`}>
                        {scoreData.display}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* OUT */}
            <div className="min-w-[70px] p-2 border-r-2 border-slate-400 text-center bg-slate-100">
              <div className="text-xs font-bold text-slate-700">OUT</div>
              <div className="text-xs text-slate-600">
                {holes.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {holes.slice(0, 9).filter(h => h.score !== null).length > 0
                  ? holes.slice(0, 9).reduce((sum, h) => sum + (h.score || 0), 0)
                  : '-'}
              </div>
            </div>

            {/* Back 9 */}
            <div className="flex">
              {holes.slice(9, 18).map((hole, idx) => {
                const scoreData = getScoreDisplay(hole);
                const isCurrent = idx + 9 === currentHoleIndex;
                return (
                  <div 
                    key={hole.number}
                    className={`min-w-[70px] p-2 border-r border-slate-200 text-center
                      ${isCurrent ? 'bg-green-50 border-l-4 border-l-green-600' : ''}`}
                  >
                    <div className="text-xs font-bold text-slate-600">H{hole.number}</div>
                    <div className="text-xs text-slate-500">P{hole.par}</div>
                    <div className={scoreData.className || 'mt-1'}>
                      <span className={`font-bold text-sm ${scoreData.textColor || 'text-slate-900'}`}>
                        {scoreData.display}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* IN + TOTAL */}
            <div className="min-w-[70px] p-2 border-r-2 border-slate-400 text-center bg-slate-100">
              <div className="text-xs font-bold text-slate-700">IN</div>
              <div className="text-xs text-slate-600">
                {holes.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {holes.slice(9, 18).filter(h => h.score !== null).length > 0
                  ? holes.slice(9, 18).reduce((sum, h) => sum + (h.score || 0), 0)
                  : '-'}
              </div>
            </div>
            <div className="min-w-[80px] p-2 text-center bg-slate-200">
              <div className="text-xs font-bold text-slate-800">TOT</div>
              <div className="text-xs text-slate-700">
                {holes.reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-lg font-bold text-green-600 mt-0.5">
                {holes.filter(h => h.score !== null).length > 0
                  ? holes.reduce((sum, h) => sum + (h.score || 0), 0)
                  : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* SHOT TRACKING INTERFACE */}
      {/* ================================================================== */}
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        
        {/* Header */}
        <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-md">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Hole {currentHole.number}</h1>
              <p className="text-sm text-slate-600">
                Shot {currentShot} • {shotType.replace('_', ' ')}
                {currentLie !== 'tee' && ` • From ${currentLie}`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Par</div>
              <div className="text-2xl font-bold text-slate-800">{currentHole.par}</div>
              <div className="text-xs text-slate-500">{currentHole.yardage} yds</div>
            </div>
          </div>
        </div>

        {/* Penalty Button */}
        <button
          onClick={handleAddPenalty}
          className="w-full py-3 bg-red-50 border-2 border-red-200 rounded-xl text-red-600 font-semibold hover:bg-red-100 transition-all"
        >
          ⚠️ Add Penalty Stroke
        </button>

        {/* Shot 1: Distance from setup + Driver selection */}
        {currentShot === 1 && (
          <>
            <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-500 uppercase mb-1">Distance to Hole</div>
                <div className="text-5xl font-bold text-green-600">
                  {distanceToHole}
                  <span className="text-xl ml-2 text-slate-600">yards</span>
                </div>
              </div>
            </div>

            {currentHole.par !== 3 && (
              <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
                <div className="text-sm font-bold text-slate-600 uppercase mb-2">Club Off Tee</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setUsedDriver(true)}
                    className={`py-4 rounded-lg border-2 font-bold transition-all ${
                      usedDriver === true 
                        ? 'bg-green-600 border-green-600 text-white' 
                        : 'border-slate-300 hover:border-green-600'
                    }`}
                  >
                    🏌️ Driver
                  </button>
                  <button
                    onClick={() => setUsedDriver(false)}
                    className={`py-4 rounded-lg border-2 font-bold transition-all ${
                      usedDriver === false 
                        ? 'bg-green-600 border-green-600 text-white' 
                        : 'border-slate-300 hover:border-green-600'
                    }`}
                  >
                    ⛳ Non-Driver
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Shot 2+: Measure distance first */}
        {currentShot > 1 && (
          <>
            <div className="bg-white rounded-xl border-2 border-green-200 p-4 shadow-sm">
              <div className="text-center mb-3">
                <div className="text-sm font-bold text-green-700 uppercase mb-1">
                  📍 Distance to Hole
                </div>
                <p className="text-xs text-slate-600">Use your rangefinder</p>
              </div>
              
              <div className="flex items-center justify-center gap-3">
                <input
                  type="number"
                  value={measuredDistance}
                  onChange={(e) => setMeasuredDistance(e.target.value)}
                  placeholder="0"
                  className="w-28 px-3 py-3 border-2 border-green-300 rounded-lg text-2xl font-bold text-green-600 text-center focus:border-green-600 focus:outline-none"
                />
                <span className="text-lg font-semibold text-slate-600">{distanceUnit}</span>
              </div>
              
              {measuredDistance && (
                <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-200 text-center">
                  <span className="text-xs text-green-700 font-semibold">
                    Shot distance: ~{Math.max(0, distanceToHole - parseInt(measuredDistance))} {distanceUnit}
                  </span>
                </div>
              )}
            </div>

            {/* Putting: Break & Slope */}
            {shotType === 'putting' && measuredDistance && (
              <div className="bg-white rounded-xl border-2 border-blue-200 p-4 shadow-sm">
                <div className="text-sm font-bold text-blue-700 uppercase mb-3">⛳ Putt Details</div>
                
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Break</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'left_to_right', label: 'L→R' },
                      { value: 'straight', label: 'Straight' },
                      { value: 'right_to_left', label: 'R→L' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setPuttBreak(opt.value)}
                        className={`py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                          puttBreak === opt.value 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'border-slate-300 hover:border-blue-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Slope</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['uphill', 'downhill', 'level', 'severe'].map(slope => (
                      <button
                        key={slope}
                        onClick={() => setPuttSlope(slope)}
                        className={`py-2 rounded-lg border-2 font-semibold text-xs transition-all ${
                          puttSlope === slope 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'border-slate-300 hover:border-blue-600'
                        }`}
                      >
                        {slope.charAt(0).toUpperCase() + slope.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Result of Shot */}
        <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
          <div className="text-center text-sm font-bold text-slate-400 uppercase mb-2">
            --- Hit Your Shot ---
          </div>
          <div className="text-sm font-bold text-slate-600 uppercase mb-2">Result</div>
          <div className="grid grid-cols-3 gap-2">
            {['fairway', 'rough', 'sand', 'green', 'hole', 'other'].map(option => (
              <button
                key={option}
                onClick={() => handleResultSelect(option)}
                className={`py-3 rounded-lg border-2 font-bold text-sm transition-all ${
                  resultOfShot === option 
                    ? option === 'hole' 
                      ? 'bg-yellow-500 border-yellow-500 text-white'
                      : 'bg-green-600 border-green-600 text-white' 
                    : 'border-slate-300 hover:border-green-600'
                }`}
              >
                {option === 'hole' ? '🕳️ Hole!' : option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Miss Directions */}
        {((shotType === 'tee' && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
          ((shotType === 'approach' || shotType === 'around_green') && resultOfShot && resultOfShot !== 'green' && resultOfShot !== 'hole' && resultOfShot !== 'fairway') ||
          (shotType === 'putting' && resultOfShot && resultOfShot !== 'hole')) && (
          <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
            <div className="text-sm font-bold text-slate-600 uppercase mb-2">Miss Direction</div>
            
            {/* Tee shot: Left/Right only */}
            {shotType === 'tee' && (
              <div className="grid grid-cols-2 gap-3">
                {['left', 'right'].map(dir => (
                  <button
                    key={dir}
                    onClick={() => setMissDirection(dir)}
                    className={`py-3 rounded-lg border-2 font-bold transition-all ${
                      missDirection === dir 
                        ? 'bg-green-600 border-green-600 text-white' 
                        : 'border-slate-300 hover:border-green-600'
                    }`}
                  >
                    {dir === 'left' ? '← Left' : 'Right →'}
                  </button>
                ))}
              </div>
            )}

            {/* Approach/Around green: 9-zone grid */}
            {(shotType === 'approach' || shotType === 'around_green') && (
              <div className="grid grid-cols-3 gap-2">
                {['long_left', 'long', 'long_right', 'left', null, 'right', 'short_left', 'short', 'short_right'].map((dir, idx) => (
                  dir === null ? (
                    <div key={idx} className="flex items-center justify-center text-2xl">⛳</div>
                  ) : (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-2 rounded-lg border-2 font-semibold text-xs transition-all ${
                        missDirection === dir 
                          ? 'bg-green-600 border-green-600 text-white' 
                          : 'border-slate-300 hover:border-green-600'
                      }`}
                    >
                      {dir.split('_').map(w => w.charAt(0).toUpperCase()).join('-')}
                    </button>
                  )
                ))}
              </div>
            )}

            {/* Putting: 8-zone (including long) */}
            {shotType === 'putting' && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  'long_left', 'long', 'long_right',
                  'left', null, 'right',
                  'short_left', 'short', 'short_right'
                ].map((dir, idx) => (
                  dir === null ? (
                    <div key={idx} className="flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-sm">⛳</div>
                    </div>
                  ) : (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-2 rounded-lg border-2 font-semibold text-xs transition-all ${
                        missDirection === dir 
                          ? 'bg-green-600 border-green-600 text-white' 
                          : 'border-slate-300 hover:border-green-600'
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
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            isReadyForNextShot() 
              ? resultOfShot === 'hole'
                ? 'bg-yellow-500 text-white hover:bg-yellow-600 shadow-lg'
                : 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
          }`}
        >
          {resultOfShot === 'hole' 
            ? `✅ Complete Hole - Score: ${currentShot}` 
            : 'Next Shot →'}
        </button>

        {/* Shot History */}
        {shotHistory.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-slate-200 p-4 shadow-sm">
            <div className="text-sm font-bold text-slate-600 uppercase mb-3">
              Shot History (Score: {currentShot})
            </div>
            <div className="space-y-2">
              {shotHistory.map((shot, idx) => (
                <div key={idx} className={`flex justify-between items-center py-2 border-b border-slate-100 ${shot.isPenalty ? 'bg-red-50 -mx-2 px-2 rounded' : ''}`}>
                  <div>
                    <span className={`font-bold ${shot.isPenalty ? 'text-red-600' : 'text-green-600'}`}>
                      {shot.isPenalty ? '⚠️ Penalty' : `Shot ${shot.shotNumber}`}
                    </span>
                    <span className="text-slate-600 ml-2 text-sm">
                      {shot.isPenalty ? shot.penaltyType : shot.shotType.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-right text-sm">
                    {!shot.isPenalty && (
                      <>
                        <div className="font-semibold">{shot.result}</div>
                        <div className="text-xs text-slate-500">
                          {shot.distanceToHoleAfter} {shot.distanceUnitAfter}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* PENALTY MODAL */}
      {/* ================================================================== */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">⚠️ Penalty Stroke</h2>
            
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
                  className={`w-full py-3 rounded-lg border-2 font-semibold text-left px-4 transition-all ${
                    penaltyType === opt.value 
                      ? 'bg-red-600 border-red-600 text-white' 
                      : 'border-slate-300 hover:border-red-400'
                  }`}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPenaltyModal(false); setPenaltyType(null); }}
                className="flex-1 py-3 border-2 border-slate-300 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmPenalty}
                disabled={!penaltyType}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                  penaltyType 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
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
