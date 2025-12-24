'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

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
        <p className="text-lg text-slate-600">Invalid hole data</p>
      </div>
    );
  }

  // ============================================================================
  // STATE & REFS
  // ============================================================================

  const [currentShot, setCurrentShot] = useState(1);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>([]);

  // Ref for auto-focusing distance input
  const distanceInputRef = useRef<HTMLInputElement>(null);
  
  // Current position state
  const [distanceToHole, setDistanceToHole] = useState(currentHole.yardage);
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'feet'>('yards');
  const [currentLie, setCurrentLie] = useState<'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other'>('tee');
  
  // Shot input state
  const [usedDriver, setUsedDriver] = useState<boolean | null>(null);
  const [resultOfShot, setResultOfShot] = useState<string | null>(null);
  const [missDirection, setMissDirection] = useState<string | null>(null);
  const [puttBreak, setPuttBreak] = useState<string | null>(null);
  const [puttSlope, setPuttSlope] = useState<string | null>(null);
  
  // Distance after shot (key fix: we ask for this after EVERY shot)
  const [distanceAfterShot, setDistanceAfterShot] = useState<string>('');
  const [distanceAfterUnit, setDistanceAfterUnit] = useState<'yards' | 'feet'>('yards');
  
  // Penalty modal
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyType, setPenaltyType] = useState<string | null>(null);

  // ============================================================================
  // RESET ON HOLE CHANGE
  // ============================================================================
  
  useEffect(() => {
    setCurrentShot(1);
    setShotHistory([]);
    setDistanceToHole(currentHole.yardage);
    setDistanceUnit('yards');
    setCurrentLie('tee');
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
    setDistanceAfterShot('');
    setDistanceAfterUnit('yards');
    setShowPenaltyModal(false);
    setPenaltyType(null);
  }, [currentHoleIndex, currentHole.yardage]);

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================
  
  const getShotType = useCallback((): 'tee' | 'approach' | 'around_green' | 'putting' => {
    if (currentLie === 'green') return 'putting';
    if (currentShot === 1 && currentHole.par === 3) return 'approach';
    if (currentShot === 1 && currentHole.par !== 3) return 'tee';
    if (distanceUnit === 'feet' || distanceToHole <= 30) return 'around_green';
    return 'approach';
  }, [currentLie, currentShot, currentHole.par, distanceUnit, distanceToHole]);

  const shotType = getShotType();
  const isPutting = shotType === 'putting';
  const isTeeShot = shotType === 'tee';
  const isApproachOrAroundGreen = shotType === 'approach' || shotType === 'around_green';

  const getClubType = (): 'driver' | 'non_driver' | 'putter' => {
    if (isPutting) return 'putter';
    if (isTeeShot && currentHole.par !== 3 && usedDriver) return 'driver';
    return 'non_driver';
  };

  // Auto-set distance unit based on result
  useEffect(() => {
    if (resultOfShot === 'green') {
      setDistanceAfterUnit('feet');
    } else if (resultOfShot === 'hole') {
      setDistanceAfterShot('0');
      setDistanceAfterUnit('feet');
    } else if (resultOfShot && resultOfShot !== 'hole') {
      // Keep yards for non-green results unless we're already putting
      if (!isPutting) {
        setDistanceAfterUnit('yards');
      }
    }
  }, [resultOfShot, isPutting]);

  // Auto-focus distance input when it appears (only if miss direction not needed or already filled)
  useEffect(() => {
    if (resultOfShot && resultOfShot !== 'hole' && distanceInputRef.current) {
      // Check if miss direction is needed
      const needsMissDirection =
        (isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot)) ||
        (isApproachOrAroundGreen && !['green', 'hole', 'fairway'].includes(resultOfShot)) ||
        (isPutting && resultOfShot !== 'hole');

      // Only auto-focus distance if miss direction not needed OR already filled
      if (!needsMissDirection || missDirection) {
        setTimeout(() => {
          distanceInputRef.current?.focus();
        }, 100);
      }
    }
  }, [resultOfShot, missDirection, isTeeShot, isApproachOrAroundGreen, isPutting]);

  // ============================================================================
  // VALIDATION
  // ============================================================================
  
  const isReadyForNextShot = (): boolean => {
    // Must have a result
    if (!resultOfShot) return false;
    
    // Tee shot on par 4/5 needs driver selection
    if (isTeeShot && currentHole.par !== 3 && usedDriver === null) return false;
    
    // Non-hole results need distance after (unless holed out)
    if (resultOfShot !== 'hole') {
      if (!distanceAfterShot || parseInt(distanceAfterShot) < 0) return false;
    }
    
    // Putting always needs break and slope (filled before result)
    if (isPutting) {
      if (!puttBreak || !puttSlope) return false;
    }
    
    // Miss direction required for misses
    if (isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) return false;
    if (isApproachOrAroundGreen && !['green', 'hole', 'fairway'].includes(resultOfShot) && !missDirection) return false;
    if (isPutting && resultOfShot !== 'hole' && !missDirection) return false;
    
    return true;
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================
  
  const handleAddPenalty = () => setShowPenaltyModal(true);

  const confirmPenalty = () => {
    if (!penaltyType) return;
    
    const penaltyShot: ShotRecord = {
      shotNumber: currentShot,
      shotType: 'penalty',
      clubType: 'non_driver',
      lieBefore: currentLie,
      distanceToHoleBefore: distanceToHole,
      distanceUnitBefore: distanceUnit,
      result: 'penalty',
      distanceToHoleAfter: distanceToHole,
      distanceUnitAfter: distanceUnit,
      shotDistance: 0,
      isPenalty: true,
      penaltyType: penaltyType as 'ob' | 'water' | 'unplayable' | 'lost',
    };
    
    setShotHistory(prev => [...prev, penaltyShot]);
    setCurrentShot(prev => prev + 1);
    setShowPenaltyModal(false);
    setPenaltyType(null);
    onSaveShot?.(penaltyShot);
  };

  const handleNextShot = () => {
    // Calculate distances
    let distanceAfter: number;
    let unitAfter: 'yards' | 'feet';
    
    if (resultOfShot === 'hole') {
      distanceAfter = 0;
      unitAfter = 'feet';
    } else {
      distanceAfter = parseInt(distanceAfterShot) || 0;
      unitAfter = distanceAfterUnit;
    }
    
    // Calculate shot distance (normalize to yards for comparison)
    const beforeInYards = distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole;
    const afterInYards = unitAfter === 'feet' ? distanceAfter / 3 : distanceAfter;
    const shotDistance = Math.max(0, Math.round(beforeInYards - afterInYards));
    
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
      puttBreak: isPutting ? puttBreak as any : undefined,
      puttSlope: isPutting ? puttSlope as any : undefined,
      isPenalty: false,
    };

    const updatedHistory = [...shotHistory, shotRecord];
    setShotHistory(updatedHistory);
    onSaveShot?.(shotRecord);

    // Check if hole complete
    if (resultOfShot === 'hole') {
      completeHole(updatedHistory);
      return;
    }

    // Update state for next shot
    const newLie = resultOfShot as 'fairway' | 'rough' | 'sand' | 'green' | 'other';
    setCurrentLie(newLie);
    setCurrentShot(currentShot + 1);
    setDistanceToHole(distanceAfter);
    setDistanceUnit(unitAfter);

    // Reset input state
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
    setDistanceAfterShot('');
    setDistanceAfterUnit(newLie === 'green' ? 'feet' : 'yards');
  };

  // ============================================================================
  // HOLE COMPLETION - COMPREHENSIVE STATS CALCULATION
  // ============================================================================
  
  const completeHole = (shots: ShotRecord[]) => {
    const nonPenaltyShots = shots.filter(s => !s.isPenalty);
    const score = shots.length;
    const putts = shots.filter(s => s.shotType === 'putting').length;
    const penalties = shots.filter(s => s.isPenalty).length;

    // -------------------------------------------------------------------------
    // DRIVING STATS (Par 4/5 only)
    // -------------------------------------------------------------------------
    let fairwayHit: boolean | null = null;
    let drivingDistance: number | null = null;
    let driveMissDirection: string | null = null;
    let driverUsed: boolean | null = null;

    if (currentHole.par >= 4) {
      const teeShot = shots.find(s => s.shotType === 'tee' && !s.isPenalty);
      if (teeShot) {
        fairwayHit = teeShot.result === 'fairway';
        driveMissDirection = teeShot.missDirection || null;
        driverUsed = teeShot.clubType === 'driver';
        
        // Driving distance = distance before - distance after
        // Normalize to yards
        const beforeYards = teeShot.distanceUnitBefore === 'feet' 
          ? teeShot.distanceToHoleBefore / 3 
          : teeShot.distanceToHoleBefore;
        const afterYards = teeShot.distanceUnitAfter === 'feet' 
          ? teeShot.distanceToHoleAfter / 3 
          : teeShot.distanceToHoleAfter;
        drivingDistance = Math.round(beforeYards - afterYards);
      }
    }

    // -------------------------------------------------------------------------
    // APPROACH STATS (shot that reached the green or closest approach)
    // -------------------------------------------------------------------------
    let approachDistance: number | null = null;
    let approachLie: string | null = null;
    let approachProximity: number | null = null;
    let approachMissDirection: string | null = null;

    // Find the approach shot (the shot that hit the green, or last shot before green)
    const greenShotIndex = nonPenaltyShots.findIndex(s => s.result === 'green' || s.result === 'hole');
    if (greenShotIndex > 0 || (greenShotIndex === 0 && currentHole.par === 3)) {
      const approachShot = nonPenaltyShots[greenShotIndex];
      if (approachShot && approachShot.shotType !== 'putting') {
        // Approach distance (in yards)
        approachDistance = approachShot.distanceUnitBefore === 'feet'
          ? Math.round(approachShot.distanceToHoleBefore / 3)
          : approachShot.distanceToHoleBefore;
        approachLie = approachShot.lieBefore;
        
        // Approach proximity (distance after, in feet)
        if (approachShot.result === 'green') {
          approachProximity = approachShot.distanceUnitAfter === 'yards'
            ? approachShot.distanceToHoleAfter * 3
            : approachShot.distanceToHoleAfter;
        }
        approachMissDirection = approachShot.missDirection || null;
      }
    }

    // -------------------------------------------------------------------------
    // GREEN IN REGULATION
    // -------------------------------------------------------------------------
    const shotsToGreen = currentHole.par - 2; // Par 4 = 2 shots, Par 5 = 3 shots, Par 3 = 1 shot
    const shotsTakenToGreen = nonPenaltyShots.findIndex(s => s.result === 'green' || s.result === 'hole');
    const greenInRegulation = shotsTakenToGreen !== -1 && (shotsTakenToGreen + 1) <= shotsToGreen;

    // -------------------------------------------------------------------------
    // SCRAMBLING (missed GIR but still made par or better)
    // -------------------------------------------------------------------------
    const scrambleAttempt = !greenInRegulation && shotsTakenToGreen !== -1;
    const scrambleMade = scrambleAttempt && score <= currentHole.par;

    // -------------------------------------------------------------------------
    // SAND SAVE (in bunker around green, got up and down)
    // -------------------------------------------------------------------------
    let sandSaveAttempt = false;
    let sandSaveMade = false;
    
    // Find if there was a shot from sand near the green
    const sandShots = nonPenaltyShots.filter(s => 
      s.lieBefore === 'sand' && 
      (s.shotType === 'around_green' || (s.distanceUnitBefore === 'yards' && s.distanceToHoleBefore <= 50))
    );
    
    if (sandShots.length > 0) {
      sandSaveAttempt = true;
      // Sand save made if from that point, finished in par or better
      const sandShotIndex = nonPenaltyShots.findIndex(s => s === sandShots[0]);
      const shotsAfterSand = nonPenaltyShots.length - sandShotIndex;
      // Up and down from sand = 2 shots (chip + putt) or 1 shot (hole out)
      sandSaveMade = shotsAfterSand <= 2 && score <= currentHole.par;
    }

    // -------------------------------------------------------------------------
    // PUTTING STATS
    // -------------------------------------------------------------------------
    let firstPuttDistance: number | null = null;
    let firstPuttLeave: number | null = null;
    let firstPuttBreak: string | null = null;
    let firstPuttSlope: string | null = null;
    let firstPuttMissDirection: string | null = null;

    const puttingShots = nonPenaltyShots.filter(s => s.shotType === 'putting');
    if (puttingShots.length > 0) {
      const firstPutt = puttingShots[0]!;
      
      // First putt distance (in feet)
      firstPuttDistance = firstPutt.distanceUnitBefore === 'yards'
        ? firstPutt.distanceToHoleBefore * 3
        : firstPutt.distanceToHoleBefore;
      
      firstPuttBreak = firstPutt.puttBreak || null;
      firstPuttSlope = firstPutt.puttSlope || null;
      
      // If first putt missed, record leave distance and miss direction
      if (firstPutt.result !== 'hole' && puttingShots.length > 1) {
        firstPuttLeave = firstPutt.distanceUnitAfter === 'yards'
          ? firstPutt.distanceToHoleAfter * 3
          : firstPutt.distanceToHoleAfter;
        firstPuttMissDirection = firstPutt.missDirection || null;
      }
    }

    // -------------------------------------------------------------------------
    // HOLE OUT STATS (holed from off the green)
    // -------------------------------------------------------------------------
    let holedOutDistance: number | null = null;
    let holedOutType: string | null = null;

    const holeOutShot = nonPenaltyShots.find(s => s.result === 'hole' && s.shotType !== 'putting');
    if (holeOutShot) {
      holedOutDistance = holeOutShot.distanceUnitBefore === 'feet'
        ? holeOutShot.distanceToHoleBefore
        : holeOutShot.distanceToHoleBefore * 3; // Convert to feet
      holedOutType = holeOutShot.shotType;
    }

    // -------------------------------------------------------------------------
    // BUILD FINAL STATS OBJECT
    // -------------------------------------------------------------------------
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
      firstPuttBreak,
      firstPuttSlope,
      firstPuttMissDirection,
      holedOutDistance,
      holedOutType,
      shots,
    };

    onHoleComplete(currentHoleIndex, holeStats);
  };

  const handleResultSelect = (result: string) => {
    setResultOfShot(result);
    // Clear miss direction if not needed
    if (!['rough', 'sand', 'other'].includes(result) && !isPutting) {
      setMissDirection(null);
    }
    if (result === 'hole') {
      setMissDirection(null);
    }
  };

  // ============================================================================
  // CALCULATIONS FOR DISPLAY
  // ============================================================================
  
  const front9Score = holes.slice(0, 9).reduce((sum, h) => sum + (h.score || 0), 0);
  const back9Score = holes.slice(9, 18).reduce((sum, h) => sum + (h.score || 0), 0);
  const front9HasScores = holes.slice(0, 9).some(h => h.score !== null);
  const back9HasScores = holes.slice(9, 18).some(h => h.score !== null);
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  
  // For sidebar visualization
  const displayDistance = resultOfShot === 'hole' ? 0 : (parseInt(distanceAfterShot) || distanceToHole);
  const displayUnit = resultOfShot === 'hole' ? 'feet' : (distanceAfterShot ? distanceAfterUnit : distanceUnit);
  
  // Convert to yards for progress calculation
  const totalYards = currentHole.yardage;
  const remainingYards = displayUnit === 'feet' ? displayDistance / 3 : displayDistance;
  const progressPercent = Math.max(0, Math.min(100, ((totalYards - remainingYards) / totalYards) * 100));

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-white">

      {/* SCORECARD - Dark header */}
      <div className="bg-[#1e293b] sticky top-0 z-50">
        {/* Mobile Navigation */}
        <div className="lg:hidden flex justify-between items-center px-4 py-2 border-b border-slate-600">
          <button
            onClick={() => {
              const element = document.getElementById(`hole-${Math.max(1, currentHole.number - 1)}`);
              element?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }}
            disabled={currentHoleIndex === 0}
            className="px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity uppercase tracking-wide">
            ← Prev
          </button>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
            Hole {currentHole.number} of 18
          </span>
          <button
            onClick={() => {
              const element = document.getElementById(`hole-${Math.min(18, currentHole.number + 1)}`);
              element?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }}
            disabled={currentHoleIndex === 17}
            className="px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity uppercase tracking-wide">
            Next →
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full">
            {/* Front 9 */}
            {holes.slice(0, 9).map((hole, idx) => {
              const isCurrent = idx === currentHoleIndex;
              const hasScore = hole.score !== null;
              const scoreToPar = hasScore ? (hole.score || 0) - hole.par : 0;
              const getScoreColor = () => {
                if (isCurrent) return 'text-white';
                if (!hasScore) return 'text-slate-500';
                if (scoreToPar <= -2) return 'text-blue-400'; // Eagle or better
                if (scoreToPar === -1) return 'text-green-400'; // Birdie
                if (scoreToPar === 0) return 'text-white'; // Par
                if (scoreToPar === 1) return 'text-amber-400'; // Bogey
                return 'text-red-400'; // Double+
              };
              return (
                <div key={hole.number} id={`hole-${hole.number}`} className={`min-w-[75px] py-3 px-2 text-center border-r border-slate-600 ${isCurrent ? 'bg-emerald-600' : ''}`}>
                  <div className={`text-xs font-semibold ${isCurrent ? 'text-white' : 'text-slate-300'}`}>Hole {hole.number}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-slate-400'}`}>Par {hole.par}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-slate-500'}`}>{hole.yardage} yds</div>
                  <div className={`mt-1 text-lg font-bold ${getScoreColor()}`}>
                    {hasScore ? hole.score : '-'}
                  </div>
                </div>
              );
            })}
            {/* OUT */}
            <div className="min-w-[75px] py-3 px-2 text-center bg-[#334155] border-r-2 border-slate-500">
              <div className="text-xs font-semibold text-amber-400">OUT</div>
              <div className="text-xs text-slate-400">Par {holes.slice(0, 9).reduce((s, h) => s + h.par, 0)}</div>
              <div className="text-xs text-slate-500">{holes.slice(0, 9).reduce((s, h) => s + h.yardage, 0)}</div>
              <div className="mt-1 text-lg font-bold text-amber-400">{front9HasScores ? front9Score : '-'}</div>
            </div>
            {/* Back 9 */}
            {holes.slice(9, 18).map((hole, idx) => {
              const actualIdx = idx + 9;
              const isCurrent = actualIdx === currentHoleIndex;
              const hasScore = hole.score !== null;
              const scoreToPar = hasScore ? (hole.score || 0) - hole.par : 0;
              const getScoreColor = () => {
                if (isCurrent) return 'text-white';
                if (!hasScore) return 'text-slate-500';
                if (scoreToPar <= -2) return 'text-blue-400'; // Eagle or better
                if (scoreToPar === -1) return 'text-green-400'; // Birdie
                if (scoreToPar === 0) return 'text-white'; // Par
                if (scoreToPar === 1) return 'text-amber-400'; // Bogey
                return 'text-red-400'; // Double+
              };
              return (
                <div key={hole.number} id={`hole-${hole.number}`} className={`min-w-[75px] py-3 px-2 text-center border-r border-slate-600 ${isCurrent ? 'bg-emerald-600' : ''}`}>
                  <div className={`text-xs font-semibold ${isCurrent ? 'text-white' : 'text-slate-300'}`}>Hole {hole.number}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-slate-400'}`}>Par {hole.par}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-slate-500'}`}>{hole.yardage} yds</div>
                  <div className={`mt-1 text-lg font-bold ${getScoreColor()}`}>
                    {hasScore ? hole.score : '-'}
                  </div>
                </div>
              );
            })}
            {/* IN */}
            <div className="min-w-[75px] py-3 px-2 text-center bg-[#334155] border-r-2 border-slate-500">
              <div className="text-xs font-semibold text-amber-400">IN</div>
              <div className="text-xs text-slate-400">Par {holes.slice(9, 18).reduce((s, h) => s + h.par, 0)}</div>
              <div className="text-xs text-slate-500">{holes.slice(9, 18).reduce((s, h) => s + h.yardage, 0)}</div>
              <div className="mt-1 text-lg font-bold text-amber-400">{back9HasScores ? back9Score : '-'}</div>
            </div>
            {/* TOTAL */}
            <div className="min-w-[85px] py-3 px-2 text-center bg-[#0f172a]">
              <div className="text-xs font-semibold text-white">TOTAL</div>
              <div className="text-xs text-slate-400">Par {totalPar}</div>
              <div className="text-xs text-slate-500">{holes.reduce((s, h) => s + h.yardage, 0)}</div>
              <div className="mt-1 text-lg font-bold text-white">{(front9HasScores || back9HasScores) ? front9Score + back9Score : '-'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex">
        <div className="flex-1 max-w-3xl mx-auto p-6 space-y-5">

          {/* Shot Pills - Sticky - Dynamic */}
          <div className="sticky top-[105px] lg:top-[81px] z-40 bg-white py-4 -mt-4 -mx-6 px-6 flex items-center gap-2 shadow-sm shadow-emerald-950/5 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Shot</span>
            {Array.from({ length: Math.max(6, currentShot + 1) }, (_, i) => i + 1).map(num => {
              const isActive = num === currentShot;
              const isCompleted = num < currentShot;
              const isFuture = num > currentShot;
              return (
                <div key={num} className={`flex-1 min-w-[44px] h-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all
                  ${isActive ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-950/5' : ''}
                  ${isCompleted ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : ''}
                  ${isFuture ? 'bg-slate-50 text-slate-400 ring-1 ring-slate-200' : ''}`}>
                  {num}
                </div>
              );
            })}
          </div>

          {/* Hole Header */}
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg p-6 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-950/5">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold">Hole {currentHole.number}</h1>
                  <span className="px-3 py-1 bg-white/15 backdrop-blur-sm rounded-md text-xs font-semibold uppercase tracking-wide">
                    Par {currentHole.par}
                  </span>
                </div>
                <p className="text-emerald-100 text-sm mt-2">
                  Shot {currentShot} • {shotType.charAt(0).toUpperCase() + shotType.slice(1).replace('_', ' ')}
                  {' • '}<span className="capitalize font-medium">{currentLie}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wider">Distance</p>
                <p className="text-4xl font-bold mt-1">
                  {distanceToHole}<span className="text-xl ml-1 font-semibold text-emerald-100">{distanceUnit === 'yards' ? 'YDS' : 'FT'}</span>
                </p>
              </div>
            </div>

            {/* Inline Progress Bar - Mobile Only */}
            <div className="xl:hidden mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-emerald-100 font-semibold uppercase tracking-wide">Progress</span>
                <span className="text-xs text-emerald-100 font-bold">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-xs text-emerald-100">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full border border-white/60"></span>
                  Tee
                </span>
                <span className="font-bold text-sm">{displayDistance} {displayUnit} left</span>
                <span className="flex items-center gap-1.5 font-medium">
                  Hole
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                </span>
              </div>
            </div>
          </div>

          {/* Club Selection (Tee Shot Par 4/5) - Segmented Control */}
          {isTeeShot && currentHole.par !== 3 && (
            <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">Club Off Tee</p>
              <div className="inline-flex bg-slate-100 rounded-lg p-1 w-full">
                <button onClick={() => setUsedDriver(true)}
                  className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                    usedDriver === true
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                      : 'text-slate-600 hover:text-slate-900'}`}>
                  Driver
                </button>
                <button onClick={() => setUsedDriver(false)}
                  className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                    usedDriver === false
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                      : 'text-slate-600 hover:text-slate-900'}`}>
                  Non-Driver
                </button>
              </div>
            </div>
          )}

          {/* Putt Details (FIRST - when putting) */}
          {isPutting && (
            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-6 border-2 border-emerald-200 shadow-lg shadow-emerald-950/5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-emerald-900 uppercase tracking-wide">⛳ Putting Details</p>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">Fill First</span>
              </div>
              <p className="text-xs text-slate-600 mb-4">Describe your putt before selecting the result</p>
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Break</p>
                <div className="inline-flex bg-white rounded-lg p-1 w-full border border-emerald-200">
                  {[{v: 'left_to_right', l: 'L → R'}, {v: 'straight', l: 'Straight'}, {v: 'right_to_left', l: 'R → L'}].map(b => (
                    <button key={b.v} onClick={() => setPuttBreak(b.v)}
                      className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
                        puttBreak === b.v
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                          : 'text-slate-600 hover:text-slate-900'}`}>
                      {b.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Slope</p>
                <div className="grid grid-cols-4 gap-2">
                  {['uphill', 'downhill', 'level', 'severe'].map(s => (
                    <button key={s} onClick={() => setPuttSlope(s)}
                      className={`py-2.5 rounded-lg font-semibold text-xs transition-all ${
                        puttSlope === s
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                          : 'bg-white text-slate-700 ring-1 ring-emerald-200 hover:ring-emerald-300 hover:bg-slate-50'}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Shot Result - Context-Aware */}
          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">
              {isPutting ? 'Putt Result' : 'Shot Result'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(() => {
                // Smart result options based on shot type
                let options: string[];

                if (isTeeShot && currentHole.par !== 3) {
                  // Par 4/5 tee shot - can't hit green from tee
                  options = ['Fairway', 'Rough', 'Sand', 'Other'];
                } else if (isTeeShot && currentHole.par === 3) {
                  // Par 3 tee shot - aiming for green
                  options = ['Green', 'Rough', 'Sand', 'Other'];
                } else {
                  // All other shots (approach, around green, putting) - show all options
                  options = ['Fairway', 'Rough', 'Sand', 'Green', 'Hole', 'Other'];
                }

                return options.map(r => (
                  <button key={r} onClick={() => handleResultSelect(r.toLowerCase())}
                    className={`py-3 rounded-lg font-semibold text-sm transition-all ${
                      resultOfShot === r.toLowerCase()
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                        : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-300 hover:bg-slate-100'}`}>
                    {r}
                  </button>
                ));
              })()}
            </div>
          </div>

          {/* Miss Direction */}
          {((isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
            (isApproachOrAroundGreen && resultOfShot && !['green', 'hole', 'fairway'].includes(resultOfShot)) ||
            (isPutting && resultOfShot && resultOfShot !== 'hole')) && (
            <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">Miss Direction</p>
              {isTeeShot && (
                <div className="inline-flex bg-slate-100 rounded-lg p-1 w-full">
                  {['left', 'right'].map(d => (
                    <button key={d} onClick={() => setMissDirection(d)}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                        missDirection === d
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                          : 'text-slate-600 hover:text-slate-900'}`}>
                      {d === 'left' ? '←' : ''} {d.charAt(0).toUpperCase() + d.slice(1)} {d === 'right' ? '→' : ''}
                    </button>
                  ))}
                </div>
              )}
              {(isApproachOrAroundGreen || isPutting) && (
                <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                  {['long_left', 'long', 'long_right', 'left', null, 'right', 'short_left', 'short', 'short_right'].map((d, i) => (
                    d === null ? (
                      <div key={i} className="flex items-center justify-center">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 ring-2 ring-emerald-200 flex items-center justify-center text-base">⛳</div>
                      </div>
                    ) : (
                      <button key={d} onClick={() => setMissDirection(d)}
                        className={`py-2.5 rounded-lg font-semibold text-xs transition-all ${
                          missDirection === d
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                            : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-300 hover:bg-slate-100'}`}>
                        {d === 'long_left' && '↖'}
                        {d === 'long' && '↑'}
                        {d === 'long_right' && '↗'}
                        {d === 'left' && '←'}
                        {d === 'right' && '→'}
                        {d === 'short_left' && '↙'}
                        {d === 'short' && '↓'}
                        {d === 'short_right' && '↘'}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Distance Remaining - Final Step (if not holed) */}
          {resultOfShot && resultOfShot !== 'hole' && (
            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-6 border-2 border-emerald-200 shadow-lg shadow-emerald-950/5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-emerald-900 uppercase tracking-wide">
                  📏 Final Step: Distance Remaining
                </p>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">Required</span>
              </div>
              <p className="text-xs text-slate-600 mb-4">Enter the distance to the hole after this shot</p>
              <div className="flex items-center gap-3 mb-3">
                <input
                  ref={distanceInputRef}
                  type="number"
                  value={distanceAfterShot}
                  onChange={(e) => setDistanceAfterShot(e.target.value)}
                  placeholder="Enter distance"
                  className="flex-1 h-14 px-5 rounded-xl text-3xl font-bold text-emerald-900 text-center bg-white border-2 border-emerald-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 focus:outline-none transition-all placeholder:text-slate-300"
                />
                <div className="inline-flex bg-white rounded-lg p-1 border-2 border-emerald-300">
                  <button
                    onClick={() => setDistanceAfterUnit('yards')}
                    className={`px-4 py-2.5 rounded-md font-bold text-sm uppercase tracking-wide transition-all ${
                      distanceAfterUnit === 'yards'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Yards
                  </button>
                  <button
                    onClick={() => setDistanceAfterUnit('feet')}
                    className={`px-4 py-2.5 rounded-md font-bold text-sm uppercase tracking-wide transition-all ${
                      distanceAfterUnit === 'feet'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Feet
                  </button>
                </div>
              </div>
              {distanceAfterShot && (
                <div className="flex items-center justify-between bg-white/60 rounded-lg px-4 py-2.5 border border-emerald-200">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Shot Distance</span>
                  <span className="text-lg font-bold text-emerald-700">
                    ~{Math.max(0, Math.round(
                      (distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole) -
                      (distanceAfterUnit === 'feet' ? parseInt(distanceAfterShot) / 3 : parseInt(distanceAfterShot))
                    ))} yards
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Next Shot Button */}
          <button onClick={handleNextShot} disabled={!isReadyForNextShot()}
            className={`w-full py-4 rounded-lg font-bold text-base transition-all ${
              isReadyForNextShot()
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed ring-1 ring-slate-200'}`}>
            {resultOfShot === 'hole' ? `Complete Hole - Score: ${currentShot}` : 'Next Shot →'}
          </button>

          {/* Penalty Button */}
          <button onClick={handleAddPenalty}
            className="w-full py-3 rounded-lg font-semibold text-sm text-red-600 bg-red-50 ring-1 ring-red-200 hover:bg-red-100 hover:ring-red-300 transition-all">
            ⚠️ Add Penalty Stroke
          </button>

          {/* Shot History */}
          {shotHistory.length > 0 && (
            <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Shot History
                </p>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Score: {currentShot}
                </p>
              </div>
              <div className="space-y-2">
                {shotHistory.map((shot, idx) => {
                  // Determine icon and colors based on shot type
                  const getShotIcon = () => {
                    if (shot.isPenalty) return '⚠️';
                    if (shot.shotType === 'tee') return '⛳';
                    if (shot.shotType === 'putting') return '⛳';
                    if (shot.result === 'green') return '🎯';
                    if (shot.result === 'hole') return '🏆';
                    return '🏌️';
                  };

                  const getIconBgColor = () => {
                    if (shot.isPenalty) return 'bg-red-50 ring-red-200';
                    if (shot.shotType === 'tee') return 'bg-blue-50 ring-blue-200';
                    if (shot.shotType === 'putting') return 'bg-emerald-50 ring-emerald-200';
                    if (shot.result === 'green') return 'bg-emerald-50 ring-emerald-200';
                    return 'bg-slate-50 ring-slate-200';
                  };

                  return (
                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg ring-1 ring-slate-200 hover:ring-emerald-300 hover:bg-slate-100 transition-all">
                      <div className="flex items-center gap-3">
                        {/* Shot Icon */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base ring-1 flex-shrink-0 ${getIconBgColor()}`}>
                          {getShotIcon()}
                        </div>

                        {/* Shot Details */}
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${shot.isPenalty ? 'text-red-600' : 'text-emerald-600'}`}>
                              Shot {shot.shotNumber}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-semibold uppercase tracking-wide">
                              {shot.isPenalty ? 'Penalty' : shot.shotType.replace('_', ' ')}
                            </span>
                          </div>
                          {!shot.isPenalty && (
                            <span className="text-xs text-slate-600 capitalize mt-0.5 font-medium">
                              {shot.lieBefore} → {shot.result}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Distance/Result */}
                      <div className="text-right">
                        {shot.result === 'hole' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">🏆</span>
                            <span className="font-bold text-xs text-emerald-600 uppercase tracking-wide">Holed</span>
                          </div>
                        ) : !shot.isPenalty && shot.shotDistance > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-sm text-slate-900">{shot.shotDistance}<span className="text-xs text-slate-500 ml-0.5 font-semibold">yds</span></span>
                            <span className="text-xs text-slate-500 font-medium">{shot.distanceToHoleAfter}{shot.distanceUnitAfter === 'yards' ? 'y' : 'ft'} left</span>
                          </div>
                        ) : shot.isPenalty ? (
                          <div className="px-2 py-0.5 bg-red-100 rounded ring-1 ring-red-200">
                            <span className="text-xs font-bold text-red-700 uppercase tracking-wide">{shot.penaltyType}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Mini Golf Course Visualization */}
        <div className="hidden xl:block w-44 p-4">
          <div className="sticky top-32 bg-white rounded-lg p-5 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
            {/* Header */}
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Hole {currentHole.number}</p>
            <p className="text-2xl font-bold text-emerald-600 text-center mt-1">{currentShot} shot{currentShot > 1 ? 's' : ''}</p>

            {/* Golf Course Visualization */}
            <div className="my-6 flex flex-col items-center h-48 relative">
              {/* The Hole (top) - emerald filled circle */}
              <div className="w-4 h-4 rounded-full bg-emerald-600 z-10 flex-shrink-0 shadow-sm shadow-emerald-950/10"></div>

              {/* Track line container */}
              <div className="flex-1 w-0.5 relative my-1">
                {/* Background gray line */}
                <div className="absolute inset-0 bg-slate-200 rounded-full"></div>

                {/* Emerald progress line (from top = distance covered) */}
                <div
                  className="absolute top-0 left-0 right-0 bg-emerald-600 transition-all duration-500 rounded-full"
                  style={{ height: `${progressPercent}%` }}
                ></div>

                {/* Ball position marker - larger emerald dot */}
                <div
                  className="absolute w-3.5 h-3.5 rounded-full bg-emerald-600 z-10 shadow-sm shadow-emerald-950/10 ring-2 ring-white transition-all duration-500"
                  style={{
                    top: `${Math.min(95, progressPercent)}%`,
                    left: '50%',
                    transform: 'translateX(-50%)'
                  }}
                ></div>
              </div>

              {/* The Tee (bottom) - small outlined circle */}
              <div className="w-3 h-3 rounded-full border-2 border-slate-300 bg-white z-10 flex-shrink-0"></div>
            </div>

            {/* Distance remaining */}
            <p className="text-3xl font-bold text-emerald-600 text-center">{displayDistance}</p>
            <p className="text-xs text-slate-500 font-semibold text-center mt-1 uppercase tracking-wide">{displayUnit} left</p>
          </div>
        </div>
      </div>

      {/* Penalty Modal */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl shadow-slate-950/10 ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Add Penalty Stroke</h2>
            <div className="space-y-2 mb-6">
              {[{v: 'ob', l: 'Out of Bounds'}, {v: 'water', l: 'Water Hazard'}, {v: 'unplayable', l: 'Unplayable Lie'}, {v: 'lost', l: 'Lost Ball'}].map(p => (
                <button key={p.v} onClick={() => setPenaltyType(p.v)}
                  className={`w-full py-3 px-4 rounded-lg font-semibold text-sm text-left transition-all ${
                    penaltyType === p.v
                      ? 'bg-red-600 text-white shadow-sm shadow-red-950/10 ring-1 ring-red-700'
                      : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:ring-red-300 hover:bg-red-50'}`}>
                  {p.l}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowPenaltyModal(false); setPenaltyType(null); }}
                className="flex-1 py-3 rounded-lg font-semibold text-sm text-slate-600 bg-slate-100 ring-1 ring-slate-200 hover:bg-slate-200 hover:ring-slate-300 transition-all">
                Cancel
              </button>
              <button onClick={confirmPenalty} disabled={!penaltyType}
                className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                  penaltyType
                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-950/10 ring-1 ring-red-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed ring-1 ring-slate-200'}`}>
                Add +1 Stroke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
