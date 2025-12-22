'use client';

import React, { useState, useEffect } from 'react';

/**
 * GolfHelm Shot Tracking - FINAL CORRECT VERSION
 *
 * Integrates with 8-step round setup:
 * - Receives hole data (par, yardage) from round setup
 * - Displays scorecard at top with all 18 holes
 * - Automatically counts shots and calculates score
 * - Updates scorecard when hole is completed
 */

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

interface ShotRecord {
  shotNumber: number;
  shotType: 'tee' | 'approach' | 'around_green' | 'putting';
  distanceToHoleBefore: number;
  distanceToHoleAfter: number;
  shotDistance: number;
  shotDistanceUnit?: 'yards' | 'feet'; // Tracks which unit was used for this shot's distance
  usedDriver?: boolean;
  resultOfShot: string;
  missDirection?: string;
  puttBreak?: 'right_to_left' | 'left_to_right' | 'straight';
  puttSlope?: 'uphill' | 'downhill' | 'level' | 'severe';
}

interface ShotTrackingProps {
  holes: Hole[]; // From round setup (8-step process)
  currentHoleIndex: number; // Which hole we're on (0-17)
  onHoleComplete: (holeIndex: number, score: number, shots: ShotRecord[]) => void;
}

export default function ShotTrackingFinal({
  holes,
  currentHoleIndex,
  onHoleComplete
}: ShotTrackingProps) {
  const currentHole = holes[currentHoleIndex];

  const [currentShot, setCurrentShot] = useState(1);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>([]);
  const [hasBeenOnGreen, setHasBeenOnGreen] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success'|'info'} | null>(null);

  // Distance tracking
  const [distanceToHole, setDistanceToHole] = useState(currentHole.yardage);
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'feet'>('yards');
  const [measuredDistance, setMeasuredDistance] = useState<string>('');

  // Shot input state
  const [usedDriver, setUsedDriver] = useState<boolean | null>(null);
  const [resultOfShot, setResultOfShot] = useState<string | null>(null);
  const [missDirection, setMissDirection] = useState<string | null>(null);
  const [puttBreak, setPuttBreak] = useState<string | null>(null);
  const [puttSlope, setPuttSlope] = useState<string | null>(null);

  // Reset when hole changes
  useEffect(() => {
    setCurrentShot(1);
    setShotHistory([]);
    setHasBeenOnGreen(false);
    setDistanceToHole(currentHole.yardage);
    setDistanceUnit('yards');
    setMeasuredDistance('');
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
  }, [currentHoleIndex, currentHole.yardage]);

  // Determine shot type
  const getShotType = (): 'tee' | 'approach' | 'around_green' | 'putting' => {
    if (hasBeenOnGreen) return 'putting';
    if (currentShot === 1 && currentHole.par === 3) return 'approach';
    if (currentShot === 1 && currentHole.par !== 3) return 'tee';

    const currentDistance = measuredDistance ? parseInt(measuredDistance) : distanceToHole;
    if (distanceUnit === 'feet' || currentDistance <= 30) return 'around_green';
    return 'approach';
  };

  const shotType = getShotType();

  // Validation
  const isReadyForNextShot = (): boolean => {
    if (currentShot === 1) {
      if (!resultOfShot) return false;
      if (currentHole.par !== 3 && usedDriver === null) return false;
      if (['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) return false;
      return true;
    }

    if (!measuredDistance) return false;
    if (shotType === 'putting' && (!puttBreak || !puttSlope)) return false;
    if (!resultOfShot) return false;

    if (shotType !== 'putting' && ['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) {
      return false;
    }
    if (shotType === 'putting' && resultOfShot !== 'hole' && !missDirection) {
      return false;
    }

    return true;
  };

  const handleNextShot = () => {
    let updatedHistory = [...shotHistory];

    // STEP 1: If this is Shot 2+, calculate and UPDATE the previous shot's distance
    if (currentShot > 1 && shotHistory.length > 0) {
      const measured = parseInt(measuredDistance);
      const previousShotIndex = shotHistory.length - 1;
      const previousShot = shotHistory[previousShotIndex];

      // Calculate how far the previous shot actually traveled
      // HANDLE UNIT CONVERSION: distanceToHoleBefore might be in yards, measured might be in feet
      let actualPreviousShotDistance = 0;
      let shotDistanceUnit: 'yards' | 'feet' = 'yards'; // Track the unit for this shot

      // Determine if previous shot's distance was in yards or feet
      // More reliable: Shot 1 is always yards, or if distance > 100
      const previousWasInYards = previousShot.shotNumber === 1 || previousShot.distanceToHoleBefore > 100;

      if (previousWasInYards && distanceUnit === 'feet') {
        // Previous distance was in yards, current measurement is in feet
        // Convert previous to feet first, then calculate
        const previousInFeet = previousShot.distanceToHoleBefore * 3;
        actualPreviousShotDistance = previousInFeet - measured;
        shotDistanceUnit = 'feet';
      } else if (previousWasInYards && distanceUnit === 'yards') {
        // Both in yards
        actualPreviousShotDistance = previousShot.distanceToHoleBefore - measured;
        shotDistanceUnit = 'yards';
      } else if (!previousWasInYards && distanceUnit === 'feet') {
        // Both in feet
        actualPreviousShotDistance = previousShot.distanceToHoleBefore - measured;
        shotDistanceUnit = 'feet';
      } else {
        // Previous was in feet, current is in yards (unlikely edge case)
        const previousInYards = previousShot.distanceToHoleBefore / 3;
        actualPreviousShotDistance = previousInYards - measured;
        shotDistanceUnit = 'yards';
      }

      // Round to whole number
      actualPreviousShotDistance = Math.round(actualPreviousShotDistance);

      // Update the previous shot with actual distance AND unit
      updatedHistory[previousShotIndex] = {
        ...previousShot,
        shotDistance: actualPreviousShotDistance,
        shotDistanceUnit: shotDistanceUnit, // ✅ STORE THE UNIT!
        distanceToHoleAfter: measured
      };

      console.log(`✅ Shot ${previousShot.shotNumber}: ${actualPreviousShotDistance} ${shotDistanceUnit}`);
    }

    // STEP 2: Create the CURRENT shot record (distance will be calculated on next shot)
    let shotDistance = 0; // TBD - will be calculated when next shot starts
    let distanceAfter = distanceToHole;

    if (currentShot === 1) {
      // Shot 1: Distance TBD until Shot 2 starts
      distanceAfter = distanceToHole;
      shotDistance = 0; // TBD
    } else {
      // Shot 2+: Distance TBD until next shot starts
      const measured = parseInt(measuredDistance);
      distanceAfter = measured;
      shotDistance = 0; // TBD
    }

    const shotRecord: ShotRecord = {
      shotNumber: currentShot,
      shotType: shotType,
      distanceToHoleBefore: distanceToHole,
      distanceToHoleAfter: distanceAfter,
      shotDistance: shotDistance, // TBD for now
      shotDistanceUnit: distanceUnit, // ✅ Store current unit
      usedDriver: currentShot === 1 && currentHole.par !== 3 ? usedDriver! : undefined,
      resultOfShot: resultOfShot!,
      missDirection: missDirection || undefined,
      puttBreak: shotType === 'putting' ? puttBreak as any : undefined,
      puttSlope: shotType === 'putting' ? puttSlope as any : undefined
    };

    // Add current shot to updated history
    updatedHistory = [...updatedHistory, shotRecord];

    // STEP 3: If holed out, calculate the FINAL shot's distance
    if (resultOfShot === 'hole') {
      const finalShotIndex = updatedHistory.length - 1;
      const finalShot = updatedHistory[finalShotIndex];

      // The final shot traveled from distanceToHoleBefore to 0 (hole)
      const finalShotDistance = Math.round(finalShot.distanceToHoleBefore);

      updatedHistory[finalShotIndex] = {
        ...finalShot,
        shotDistance: finalShotDistance,
        shotDistanceUnit: distanceUnit, // ✅ Store final shot unit
        distanceToHoleAfter: 0
      };

      console.log(`⛳ Final shot: ${finalShotDistance} ${distanceUnit}`);

      setShotHistory(updatedHistory); // Update state with final distances

      const finalScore = currentShot;
      const scoreToPar = finalScore - currentHole.par;

      // Show achievement toast
      if (scoreToPar <= -2) {
        setToast({ message: 'Eagle! Amazing!', type: 'success' });
      } else if (scoreToPar === -1) {
        setToast({ message: 'Birdie! Great shot!', type: 'success' });
      } else if (scoreToPar === 0) {
        setToast({ message: 'Par! Solid round!', type: 'info' });
      }

      setTimeout(() => setToast(null), 3000);
      onHoleComplete(currentHoleIndex, finalScore, updatedHistory);
      return;
    }

    // Update state with new history
    setShotHistory(updatedHistory);

    // Update green status
    if (resultOfShot === 'green') {
      setHasBeenOnGreen(true);
    } else if (['rough', 'sand', 'fairway', 'other'].includes(resultOfShot!)) {
      if (shotType === 'putting') setHasBeenOnGreen(false);
    }

    // Set up for next shot
    let nextDistance = distanceToHole;
    let nextUnit: 'yards' | 'feet' = 'yards';

    if (currentShot > 1) {
      nextDistance = parseInt(measuredDistance);
      nextUnit = distanceUnit;
    }

    if (resultOfShot === 'green') {
      nextUnit = 'feet';
      if (distanceUnit === 'yards') {
        nextDistance = nextDistance * 3;
      }
    }

    setCurrentShot(currentShot + 1);
    setDistanceToHole(nextDistance);
    setDistanceUnit(nextUnit);
    setMeasuredDistance('');
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
  };

  const handleResultSelect = (result: string) => {
    setResultOfShot(result);
    if (shotType !== 'putting' && !['rough', 'sand', 'other'].includes(result)) {
      setMissDirection(null);
    }
    if (shotType === 'putting' && result === 'hole') {
      setMissDirection(null);
    }
  };

  // Scorecard display helpers
  const getScoreDisplay = (hole: Hole, isCurrent: boolean = false) => {
    if (hole.score === null) {
      return {
        display: '-',
        className: isCurrent ? 'text-white/50' : 'text-slate-500',
        scoreDiff: null
      };
    }
    const diff = hole.score - hole.par;

    // Eagle or better (≤-2): Yellow gradient circle
    if (diff <= -2) {
      return {
        display: hole.score,
        className: 'w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-500 border border-yellow-600 flex items-center justify-center shadow-md',
        textColor: 'text-slate-900 font-black',
        scoreDiff: diff
      };
    }
    // Birdie (-1): Red gradient circle
    else if (diff === -1) {
      return {
        display: hole.score,
        className: 'w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md',
        textColor: 'text-white font-black',
        scoreDiff: diff
      };
    }
    // Par (0): Plain number
    else if (diff === 0) {
      return {
        display: hole.score,
        className: '',
        textColor: isCurrent ? 'text-white font-bold' : 'text-slate-400 font-semibold',
        scoreDiff: diff
      };
    }
    // Bogey (+1): Square border
    else if (diff === 1) {
      return {
        display: hole.score,
        className: 'w-8 h-8 border-2 border-slate-400 rounded-sm flex items-center justify-center',
        textColor: isCurrent ? 'text-white font-bold' : 'text-slate-400 font-semibold',
        scoreDiff: diff
      };
    }
    // Double bogey+ (≥+2): Thick square border
    else {
      return {
        display: hole.score,
        className: 'w-8 h-8 border-[3px] border-slate-400 rounded-sm flex items-center justify-center',
        textColor: isCurrent ? 'text-white font-bold' : 'text-slate-400 font-semibold',
        scoreDiff: diff
      };
    }
  };

  return (
    <>
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out forwards;
          opacity: 0;
        }

        .animate-float {
          animation: float 20s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float 20s ease-in-out infinite;
          animation-delay: -10s;
        }

        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }

        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: translate(-50%, 50%) scale(0);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 50%) scale(1);
          }
        }
      `}</style>

    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50/30 to-emerald-50/30 relative overflow-hidden">

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-green-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-400/15 rounded-full blur-3xl animate-float-delayed" />
      </div>

      {/* HORIZONTAL SCORECARD - Premium Dark Theme */}
      <div className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 shadow-2xl sticky top-0 z-50">
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full">

            {/* Front 9 */}
            <div className="flex">
              {holes.slice(0, 9).map((hole, idx) => {
                const isCurrent = idx === currentHoleIndex;
                const scoreData = getScoreDisplay(hole, isCurrent);
                const scoreDiff = scoreData.scoreDiff;
                return (
                  <div
                    key={hole.number}
                    className={`
                      relative min-w-[75px] p-3 text-center
                      transition-all duration-300
                      ${isCurrent
                        ? 'bg-gradient-to-br from-green-500 to-green-600 scale-110 shadow-2xl shadow-green-500/50 rounded-t-xl -mb-2 z-20'
                        : 'hover:bg-slate-800/50'
                      }
                    `}
                  >
                    {/* Pulsing indicator above current hole */}
                    {isCurrent && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      </div>
                    )}

                    <div className={`text-xs font-bold mb-1 ${isCurrent ? 'text-white' : 'text-slate-400'}`}>
                      Hole {hole.number}
                    </div>
                    <div className={`text-xs mb-1 ${isCurrent ? 'text-white/80' : 'text-slate-500'}`}>
                      Par {hole.par}
                    </div>
                    <div className={`text-xs mb-2 ${isCurrent ? 'text-white/60' : 'text-slate-600'}`}>
                      {hole.yardage} yds
                    </div>
                    <div className="flex items-center justify-center">
                      <div className={scoreData.className || ''}>
                        <span className={`text-lg ${scoreData.textColor || (isCurrent ? 'text-white' : 'text-slate-400')}`}>
                          {scoreData.display}
                        </span>
                      </div>
                    </div>

                    {/* Performance badge on current hole */}
                    {isCurrent && hole.score !== null && scoreDiff !== null && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <div className={`
                          text-[9px] font-bold px-2 py-0.5 rounded-full
                          ${scoreDiff <= -2 ? 'bg-yellow-400 text-slate-900' : ''}
                          ${scoreDiff === -1 ? 'bg-red-500 text-white' : ''}
                          ${scoreDiff === 0 ? 'bg-slate-400 text-white' : ''}
                          ${scoreDiff >= 1 ? 'bg-slate-600 text-white' : ''}
                        `}>
                          {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* OUT Total */}
            <div className="min-w-[90px] p-3 border-r-2 border-slate-600 text-center bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wide">OUT</div>
              <div className="text-xs text-slate-500 mb-1">
                Par {holes.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-600 mb-2">
                {holes.slice(0, 9).reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-lg font-black text-white">
                {holes.slice(0, 9).every(h => h.score !== null)
                  ? holes.slice(0, 9).reduce((sum, h) => sum + (h.score || 0), 0)
                  : '-'}
              </div>
            </div>

            {/* Back 9 */}
            <div className="flex">
              {holes.slice(9, 18).map((hole, idx) => {
                const isCurrent = idx + 9 === currentHoleIndex;
                const scoreData = getScoreDisplay(hole, isCurrent);
                const scoreDiff = scoreData.scoreDiff;
                return (
                  <div
                    key={hole.number}
                    className={`
                      relative min-w-[75px] p-3 text-center
                      transition-all duration-300
                      ${isCurrent
                        ? 'bg-gradient-to-br from-green-500 to-green-600 scale-110 shadow-2xl shadow-green-500/50 rounded-t-xl -mb-2 z-20'
                        : 'hover:bg-slate-800/50'
                      }
                    `}
                  >
                    {/* Pulsing indicator above current hole */}
                    {isCurrent && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      </div>
                    )}

                    <div className={`text-xs font-bold mb-1 ${isCurrent ? 'text-white' : 'text-slate-400'}`}>
                      Hole {hole.number}
                    </div>
                    <div className={`text-xs mb-1 ${isCurrent ? 'text-white/80' : 'text-slate-500'}`}>
                      Par {hole.par}
                    </div>
                    <div className={`text-xs mb-2 ${isCurrent ? 'text-white/60' : 'text-slate-600'}`}>
                      {hole.yardage} yds
                    </div>
                    <div className="flex items-center justify-center">
                      <div className={scoreData.className || ''}>
                        <span className={`text-lg ${scoreData.textColor || (isCurrent ? 'text-white' : 'text-slate-400')}`}>
                          {scoreData.display}
                        </span>
                      </div>
                    </div>

                    {/* Performance badge on current hole */}
                    {isCurrent && hole.score !== null && scoreDiff !== null && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <div className={`
                          text-[9px] font-bold px-2 py-0.5 rounded-full
                          ${scoreDiff <= -2 ? 'bg-yellow-400 text-slate-900' : ''}
                          ${scoreDiff === -1 ? 'bg-red-500 text-white' : ''}
                          ${scoreDiff === 0 ? 'bg-slate-400 text-white' : ''}
                          ${scoreDiff >= 1 ? 'bg-slate-600 text-white' : ''}
                        `}>
                          {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* IN Total */}
            <div className="min-w-[90px] p-3 border-r-2 border-slate-600 text-center bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wide">IN</div>
              <div className="text-xs text-slate-500 mb-1">
                Par {holes.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-600 mb-2">
                {holes.slice(9, 18).reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-lg font-black text-white">
                {holes.slice(9, 18).every(h => h.score !== null)
                  ? holes.slice(9, 18).reduce((sum, h) => sum + (h.score || 0), 0)
                  : '-'}
              </div>
            </div>

            {/* TOTAL */}
            <div className="min-w-[100px] p-3 text-center bg-gradient-to-br from-slate-700 to-slate-800 border-l-2 border-green-500">
              <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wide">TOTAL</div>
              <div className="text-xs text-slate-500 mb-1">
                Par {holes.reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-600 mb-2">
                {holes.reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {holes.every(h => h.score !== null)
                  ? holes.reduce((sum, h) => sum + (h.score || 0), 0)
                  : holes.filter(h => h.score !== null).length > 0
                    ? holes.reduce((sum, h) => sum + (h.score || 0), 0)
                    : '-'}
              </div>
              {/* Total vs Par badge */}
              {holes.filter(h => h.score !== null).length > 0 && (() => {
                const totalScore = holes.reduce((sum, h) => sum + (h.score || 0), 0);
                const totalPar = holes.filter(h => h.score !== null).reduce((sum, h) => sum + h.par, 0);
                const totalDiff = totalScore - totalPar;
                return totalDiff !== 0 ? (
                  <div className={`
                    inline-block px-2 py-0.5 rounded-full text-[10px] font-bold
                    ${totalDiff < 0 ? 'bg-green-500 text-white' : 'bg-slate-600 text-white'}
                  `}>
                    {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                  </div>
                ) : null;
              })()}
            </div>

          </div>
        </div>
      </div>

      {/* SHOT TRACKING INTERFACE */}
      <div className="p-4 max-w-4xl mx-auto space-y-3">

        {/* Compact Shot Progress */}
        <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-slate-200/60 p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
              Shot
            </div>
            <div className="flex-1 flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((shotNum) => {
                const isActive = shotNum === currentShot;
                const isCompleted = shotNum < currentShot;

                return (
                  <div
                    key={shotNum}
                    className={`
                      flex-1 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all
                      ${isActive
                        ? 'bg-green-500 text-white shadow-sm'
                        : isCompleted
                          ? 'bg-green-100 text-green-600'
                          : 'bg-slate-100 text-slate-400'
                      }
                    `}
                  >
                    {shotNum}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SHOT 1: Integrated Header + Distance Banner */}
        {currentShot === 1 && (
          <>
            <div className="bg-gradient-to-r from-green-600 via-green-500 to-green-600 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                {/* Left: Hole Info */}
                <div className="text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl font-bold">Hole {currentHole.number}</h1>
                    <span className="px-2 py-0.5 bg-white/20 text-xs font-bold rounded">
                      Par {currentHole.par}
                    </span>
                  </div>
                  <p className="text-xs text-white/80">
                    Shot {currentShot} • {shotType.charAt(0).toUpperCase() + shotType.slice(1).replace('_', ' ')}
                  </p>
                </div>

                {/* Right: Distance */}
                <div className="text-right text-white">
                  <div className="text-[10px] text-white/70 uppercase tracking-wider mb-1">
                    Distance
                  </div>
                  <div className="text-6xl font-black leading-none tabular-nums">
                    {distanceToHole}
                  </div>
                  <div className="text-sm font-bold text-white/90 uppercase tracking-wider mt-1">
                    {distanceUnit}
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Driver Selection - Inline */}
            {currentHole.par !== 3 && (
              <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-slate-200/60 p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Club
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setUsedDriver(true)}
                      className={`py-2.5 px-3 rounded-lg font-semibold text-sm transition-all duration-150 active:scale-[0.98] ${
                        usedDriver === true
                          ? 'bg-green-100 border-2 border-green-500 text-green-700 shadow-sm'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50/50'
                      }`}
                    >
                      Driver
                    </button>
                    <button
                      onClick={() => setUsedDriver(false)}
                      className={`py-2.5 px-3 rounded-lg font-semibold text-sm transition-all duration-150 active:scale-[0.98] ${
                        usedDriver === false
                          ? 'bg-green-100 border-2 border-green-500 text-green-700 shadow-sm'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50/50'
                      }`}
                    >
                      Non-Driver
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* SHOT 2+: Integrated Header + Distance Input */}
        {currentShot > 1 && (
          <>
            <div className="bg-gradient-to-r from-green-600 via-green-500 to-green-600 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                {/* Left: Hole Info */}
                <div className="text-white flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold">Hole {currentHole.number}</h1>
                    <span className="px-2 py-0.5 bg-white/20 text-xs font-bold rounded">
                      Par {currentHole.par}
                    </span>
                  </div>
                  <p className="text-xs text-white/80">
                    Shot {currentShot} • {shotType.charAt(0).toUpperCase() + shotType.slice(1).replace('_', ' ')}
                  </p>
                </div>

                {/* Right: Distance Input */}
                <div className="text-white flex-1 max-w-xs">
                  <div className="text-[10px] text-white/70 uppercase tracking-wider mb-2 text-center">
                    Measure Distance
                  </div>
                  <div className="flex items-end gap-2 justify-center">
                    <input
                      type="number"
                      value={measuredDistance}
                      onChange={(e) => setMeasuredDistance(e.target.value)}
                      placeholder="0"
                      className="w-32 px-3 py-2 bg-white/95 border border-white/40 rounded-lg text-4xl font-black text-green-600 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-white/40"
                    />
                    <span className="text-xl font-bold text-white mb-1 uppercase">{distanceUnit}</span>
                  </div>

                  {measuredDistance && (
                    <div className="mt-2 text-center text-xs text-white/80">
                      Previous: {distanceToHole - parseInt(measuredDistance)} {distanceUnit}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Putting: Break & Slope */}
            {shotType === 'putting' && measuredDistance && (
              <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-slate-200/60 p-3 shadow-sm space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Putting Details</div>

                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Break
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {['right_to_left', 'left_to_right', 'straight'].map(brk => (
                      <button
                        key={brk}
                        onClick={() => setPuttBreak(brk)}
                        className={`py-2 px-3 rounded-lg font-medium text-xs transition-all duration-150 active:scale-[0.98] ${
                          puttBreak === brk
                            ? 'bg-green-100 border-2 border-green-500 text-green-700 shadow-sm'
                            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50/50'
                        }`}
                      >
                        {brk === 'right_to_left' && 'R→L'}
                        {brk === 'left_to_right' && 'L→R'}
                        {brk === 'straight' && 'Straight'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Slope
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    {['uphill', 'downhill', 'level', 'severe'].map(slope => (
                      <button
                        key={slope}
                        onClick={() => setPuttSlope(slope)}
                        className={`py-2 px-3 rounded-lg font-medium text-xs transition-all duration-150 active:scale-[0.98] ${
                          puttSlope === slope
                            ? 'bg-green-100 border-2 border-green-500 text-green-700 shadow-sm'
                            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50/50'
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
        <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-slate-200/60 p-3 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Shot Result</div>
          <div className="grid grid-cols-3 gap-2">
            {['fairway', 'rough', 'sand', 'green', 'hole', 'other'].map(option => (
              <button
                key={option}
                onClick={() => handleResultSelect(option)}
                className={`py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-150 active:scale-[0.98] ${
                  resultOfShot === option
                    ? 'bg-green-100 border-2 border-green-500 text-green-700 shadow-sm'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50/50'
                }`}
              >
                {option === 'green' ? 'Green' : option === 'hole' ? 'Hole' : option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Miss Directions */}
        {((shotType !== 'putting' && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
          (shotType === 'putting' && resultOfShot && resultOfShot !== 'hole')) && (
          <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-slate-200/60 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Miss Direction</div>

            {shotType === 'tee' && (
              <div className="grid grid-cols-2 gap-2">
                {['left', 'right'].map(dir => (
                  <button
                    key={dir}
                    onClick={() => setMissDirection(dir)}
                    className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all duration-150 active:scale-[0.98] ${
                      missDirection === dir
                        ? 'bg-red-100 border-2 border-red-500 text-red-700 shadow-sm'
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-red-300 hover:bg-red-50/50'
                    }`}
                  >
                    {dir === 'left' ? '← Left' : 'Right →'}
                  </button>
                ))}
              </div>
            )}

            {(shotType === 'approach' || shotType === 'around_green') && (
              <div className="grid grid-cols-3 gap-2">
                {['long_left', 'long', 'long_right', 'left', null, 'right', 'short_left', 'short', 'short_right'].map((dir, idx) => (
                  dir === null ? (
                    <div key={idx} className="flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all duration-150 active:scale-[0.98] ${
                        missDirection === dir
                          ? 'bg-red-100 border-2 border-red-500 text-red-700 shadow-sm'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-red-300 hover:bg-red-50/50'
                      }`}
                    >
                      {dir.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
                    </button>
                  )
                ))}
              </div>
            )}

            {shotType === 'putting' && (
              <div className="grid grid-cols-3 gap-2">
                {['short_left', 'short', 'short_right', 'left', null, 'right'].map((dir, idx) => (
                  dir === null ? (
                    <div key={idx} className="flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-2 px-3 rounded-lg font-medium text-xs transition-all duration-150 active:scale-[0.98] ${
                        missDirection === dir
                          ? 'bg-red-100 border-2 border-red-500 text-red-700 shadow-sm'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-red-300 hover:bg-red-50/50'
                      }`}
                    >
                      {dir.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
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
          className={`w-full py-4 rounded-xl font-bold text-base transition-all duration-150 active:scale-[0.99] ${
            isReadyForNextShot()
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/40'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {resultOfShot === 'hole' ? (
            <span className="flex items-center justify-center gap-2">
              <span>Complete Hole</span>
              <span className="px-2 py-1 bg-white/20 rounded text-sm">
                {currentShot}
              </span>
            </span>
          ) : (
            'Next Shot'
          )}
        </button>

        {/* Shot History */}
        {shotHistory.length > 0 && (
          <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-slate-200/60 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
              Shot History (Score: {currentShot})
            </div>
            <div className="space-y-1.5">
              {shotHistory.map((shot, idx) => {
                // ✅ USE STORED UNIT - NO GUESSING!
                const distanceDisplayUnit = shot.shotDistanceUnit || 'yards';

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 animate-fadeInUp"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-bold text-sm text-slate-900">#{shot.shotNumber}</span>
                      <span className="text-xs text-slate-500 uppercase">{shot.shotType.replace('_', ' ')}</span>
                      <span className="text-xs font-medium text-slate-600 capitalize">{shot.resultOfShot}</span>
                      {shot.missDirection && (
                        <span className="text-xs text-slate-500">{shot.missDirection.replace('_', ' ')}</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {shot.shotDistance > 0
                        ? `${Math.round(shot.shotDistance)} ${distanceDisplayUnit}`
                        : '...'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Compact Shot Tracker - Floating Top Right */}
      <div className="fixed top-1/2 -translate-y-1/2 right-6 w-24 z-40 hidden lg:block">
        <div className="relative">

          {/* Main Tracker Card */}
          <div className="bg-gradient-to-br from-white/95 to-white/80 backdrop-blur-2xl rounded-2xl border border-white/40 shadow-2xl shadow-green-500/10 p-3 overflow-hidden">

            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 rounded-2xl" />

            {/* Mini Hole Label */}
            <div className="relative text-center mb-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Hole {currentHole.number}
              </div>
              <div className="text-xs font-semibold text-green-600">
                {currentShot} shots
              </div>
            </div>

            {/* Shot Visualization - Vertical Mini Track */}
            <div className="relative h-32 mx-auto">

              {/* Background track (fairway/rough) */}
              <div className="absolute inset-x-0 top-0 bottom-0 flex justify-center">
                {/* Narrow fairway strip */}
                <div className="w-10 h-full relative">
                  {/* Rough gradient on sides */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-200/20 via-transparent to-amber-200/20" />
                  {/* Fairway center */}
                  <div className="absolute inset-y-0 left-1/4 right-1/4 bg-gradient-to-b from-green-200/30 via-green-100/20 to-emerald-200/30" />
                </div>
              </div>

              {/* Shot Trail Lines - EMPHASIZED */}
              <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                {shotHistory.map((shot, idx) => {
                  if (idx === shotHistory.length - 1) return null; // Don't draw line from last shot

                  const nextShot = shotHistory[idx + 1];

                  // Calculate Y positions (bottom to top)
                  const currentY = 100 - ((currentHole.yardage - shot.distanceToHoleAfter) / currentHole.yardage * 100);
                  const nextY = 100 - ((currentHole.yardage - nextShot.distanceToHoleAfter) / currentHole.yardage * 100);

                  // Calculate X positions based on miss direction
                  const getX = (shotData: any) => {
                    const center = 50;
                    if (!shotData.missDirection) return center;
                    if (shotData.missDirection.includes('left')) return center - 20;
                    if (shotData.missDirection.includes('right')) return center + 20;
                    return center;
                  };

                  const currentX = getX(shot);
                  const nextX = getX(nextShot);

                  return (
                    <g key={idx}>
                      {/* Glow effect for line */}
                      <line
                        x1={`${currentX}%`}
                        y1={`${currentY}%`}
                        x2={`${nextX}%`}
                        y2={`${nextY}%`}
                        stroke="url(#lineGradient)"
                        strokeWidth="3"
                        opacity="0.3"
                        strokeLinecap="round"
                      />
                      {/* Main line */}
                      <line
                        x1={`${currentX}%`}
                        y1={`${currentY}%`}
                        x2={`${nextX}%`}
                        y2={`${nextY}%`}
                        stroke="url(#lineGradient)"
                        strokeWidth="1.5"
                        opacity="0.8"
                        strokeLinecap="round"
                        className="drop-shadow-lg"
                      />
                    </g>
                  );
                })}

                {/* Gradient definition for lines */}
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Shot Dots - Plot each shot */}
              {shotHistory.map((shot, idx) => {
                const yPosition = ((currentHole.yardage - shot.distanceToHoleAfter) / currentHole.yardage) * 100;

                const getXPosition = () => {
                  const center = 50;
                  if (!shot.missDirection) {
                    if (['fairway', 'green', 'hole'].includes(shot.resultOfShot || '')) return center;
                  }
                  if (shot.missDirection?.includes('left')) {
                    return shot.resultOfShot === 'sand' ? center - 25 : center - 20;
                  }
                  if (shot.missDirection?.includes('right')) {
                    return shot.resultOfShot === 'sand' ? center + 25 : center + 20;
                  }
                  return center;
                };

                const xPosition = getXPosition();

                const getDotStyle = () => {
                  if (shot.resultOfShot === 'hole') return {
                    bg: 'bg-gradient-to-br from-yellow-400 to-amber-500',
                    ring: 'ring-2 ring-yellow-400/50',
                    shadow: 'shadow-lg shadow-yellow-500/50'
                  };
                  if (shot.resultOfShot === 'green') return {
                    bg: 'bg-gradient-to-br from-emerald-400 to-green-500',
                    ring: 'ring-2 ring-green-400/50',
                    shadow: 'shadow-lg shadow-green-500/40'
                  };
                  if (shot.resultOfShot === 'fairway') return {
                    bg: 'bg-gradient-to-br from-blue-400 to-cyan-500',
                    ring: 'ring-2 ring-blue-400/50',
                    shadow: 'shadow-md shadow-blue-500/30'
                  };
                  if (shot.resultOfShot === 'rough') return {
                    bg: 'bg-gradient-to-br from-amber-400 to-orange-500',
                    ring: 'ring-2 ring-amber-400/50',
                    shadow: 'shadow-md shadow-amber-500/30'
                  };
                  if (shot.resultOfShot === 'sand') return {
                    bg: 'bg-gradient-to-br from-orange-400 to-red-500',
                    ring: 'ring-2 ring-orange-400/50',
                    shadow: 'shadow-md shadow-orange-500/30'
                  };
                  return {
                    bg: 'bg-gradient-to-br from-slate-400 to-slate-500',
                    ring: 'ring-2 ring-slate-400/50',
                    shadow: 'shadow-md shadow-slate-500/30'
                  };
                };

                const dotStyle = getDotStyle();
                const isLastShot = idx === shotHistory.length - 1;

                return (
                  <div
                    key={idx}
                    className="absolute transition-all duration-500 ease-out group"
                    style={{
                      bottom: `${yPosition}%`,
                      left: `${xPosition}%`,
                      transform: 'translate(-50%, 50%)',
                      animation: `fadeInScale 0.4s ease-out ${idx * 0.1}s backwards`
                    }}
                  >
                    {/* Pulse effect for last shot */}
                    {isLastShot && (
                      <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-400 animate-ping opacity-75" />
                    )}

                    {/* Shot dot */}
                    <div className={`
                      relative w-3 h-3 rounded-full transition-all duration-200
                      ${dotStyle.bg} ${dotStyle.ring} ${dotStyle.shadow}
                      group-hover:scale-150 group-hover:z-50
                    `}>
                      {/* Shot number on hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="bg-slate-900/95 backdrop-blur-sm text-white text-[8px] px-1.5 py-0.5 rounded whitespace-nowrap font-bold">
                          #{shot.shotNumber}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Hole marker at top */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-600 to-green-700 ring-2 ring-green-500/30 shadow-lg flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              </div>

              {/* Tee marker at bottom */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1">
                <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-slate-400 to-slate-500 shadow-md" />
              </div>

            </div>

            {/* Distance remaining - compact */}
            <div className="relative text-center mt-2 pt-2 border-t border-slate-200/40">
              <div className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {distanceToHole}
              </div>
              <div className="text-[9px] font-medium text-slate-500">
                {distanceUnit} left
              </div>
            </div>

          </div>

          {/* Subtle glow underneath */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10 blur-xl -z-10 scale-95" />

        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-slideInRight">
          <div className={`px-6 py-4 rounded-2xl backdrop-blur-xl border shadow-2xl ${
            toast.type === 'success'
              ? 'bg-green-500/90 border-green-400 text-white'
              : 'bg-blue-500/90 border-blue-400 text-white'
          }`}>
            <div className="font-semibold text-lg">{toast.message}</div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
