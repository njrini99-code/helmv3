'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * GolfHelm Complete Shot Tracking System
 * Shot Types: Tee, Approach, Around the Green, Putting
 */

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
  current: boolean;
}

interface ShotRecord {
  shotNumber: number;
  distanceToHoleBefore: number;
  distanceToHoleAfter: number | null;
  shotDistance: number;
  distanceUnit: 'yards' | 'feet';
  usedDriver: boolean | null;
  resultOfShot: string | null;
  missDirection: string | null;
  shotType: 'tee' | 'approach' | 'around_green' | 'putting';
  puttBreak?: 'right_to_left' | 'left_to_right' | 'double_breaker' | null;
  puttSlope?: 'downhill' | 'uphill' | 'flat' | 'multiple_slopes' | null;
}

interface ShotTrackingProps {
  holes: Hole[];
  onHoleComplete?: (hole: Hole, shots: ShotRecord[]) => void;
}

export function ShotTracking({ holes: initialHoles, onHoleComplete }: ShotTrackingProps) {
  const [holes, setHoles] = useState<Hole[]>(initialHoles);
  const currentHole = holes.find(h => h.current) || holes[0];

  const [currentShot, setCurrentShot] = useState(1);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>([]);
  const [hasBeenOnGreen, setHasBeenOnGreen] = useState(false);

  const [distanceToHole, setDistanceToHole] = useState(currentHole.yardage);
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'feet'>('yards');
  const [distanceInput, setDistanceInput] = useState<string>('');
  const [usedDriver, setUsedDriver] = useState<boolean | null>(null);
  const [resultOfShot, setResultOfShot] = useState<string | null>(null);
  const [missDirection, setMissDirection] = useState<string | null>(null);

  const [puttBreak, setPuttBreak] = useState<string | null>(null);
  const [puttSlope, setPuttSlope] = useState<string | null>(null);

  // Determine shot type
  const getShotType = (): 'tee' | 'approach' | 'around_green' | 'putting' => {
    if (hasBeenOnGreen) return 'putting';
    if (currentShot === 1 && currentHole.par === 3) return 'approach';
    if (currentShot === 1 && currentHole.par !== 3) return 'tee';
    if (distanceToHole > 30) return 'approach';
    return 'around_green';
  };

  const shotType = getShotType();

  const getShotTypeLabel = (): string => {
    if (currentShot === 1 && currentHole.par === 3) return 'First Shot (Approach)';
    if (currentShot === 1) return 'First Shot';

    switch (shotType) {
      case 'approach': return `Shot ${currentShot} (Approach)`;
      case 'around_green': return `Shot ${currentShot} (Around the Green)`;
      case 'putting': return `Shot ${currentShot} (Putting)`;
      default: return `Shot ${currentShot}`;
    }
  };

  const isNextShotEnabled = (): boolean => {
    if (!distanceInput || distanceInput.trim() === '') return false;
    if (shotType === 'putting' && (!puttBreak || !puttSlope)) return false;
    if (!resultOfShot) return false;
    if (currentShot === 1 && currentHole.par !== 3 && usedDriver === null) return false;
    if (['rough', 'sand', 'other'].includes(resultOfShot)) {
      if (!missDirection) return false;
    }
    if (shotType === 'putting' && resultOfShot !== 'hole' && !missDirection) return false;

    return true;
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

  const handleNextShot = () => {
    const newDistanceValue = parseInt(distanceInput);

    const shotDistance = distanceUnit === 'yards'
      ? distanceToHole - newDistanceValue
      : Math.round((distanceToHole - newDistanceValue) / 3);

    const shotRecord: ShotRecord = {
      shotNumber: currentShot,
      distanceToHoleBefore: distanceToHole,
      distanceToHoleAfter: newDistanceValue,
      shotDistance: shotDistance,
      distanceUnit: distanceUnit,
      usedDriver: shotType === 'tee' && currentHole.par !== 3 ? usedDriver : null,
      resultOfShot: resultOfShot,
      missDirection: missDirection,
      shotType: shotType,
      puttBreak: shotType === 'putting' ? puttBreak as any : null,
      puttSlope: shotType === 'putting' ? puttSlope as any : null
    };

    const newShotHistory = [...shotHistory, shotRecord];
    setShotHistory(newShotHistory);

    if (resultOfShot === 'hole') {
      const updatedHoles = holes.map(h =>
        h.number === currentHole.number
          ? { ...h, score: currentShot, current: false }
          : h
      );
      setHoles(updatedHoles);

      onHoleComplete?.(currentHole, newShotHistory);

      // Move to next hole
      const currentIndex = holes.findIndex(h => h.number === currentHole.number);
      if (currentIndex < holes.length - 1) {
        const nextHole = holes[currentIndex + 1];
        setHoles(prev => prev.map((h, i) =>
          i === currentIndex + 1 ? { ...h, current: true } : h
        ));

        // Reset for next hole
        setCurrentShot(1);
        setShotHistory([]);
        setHasBeenOnGreen(false);
        setDistanceToHole(nextHole.yardage);
        setDistanceUnit('yards');
      }

      setDistanceInput('');
      setUsedDriver(null);
      setResultOfShot(null);
      setMissDirection(null);
      setPuttBreak(null);
      setPuttSlope(null);
      return;
    }

    if (resultOfShot === 'green') {
      setHasBeenOnGreen(true);
    } else if (['rough', 'sand', 'fairway', 'other'].includes(resultOfShot || '')) {
      if (shotType === 'putting') {
        setHasBeenOnGreen(false);
      }
    }

    let nextUnit: 'yards' | 'feet' = 'yards';
    let nextDistance = newDistanceValue;

    if (resultOfShot === 'green') {
      nextUnit = 'feet';
      if (distanceUnit === 'yards') {
        nextDistance = newDistanceValue * 3;
      }
    } else {
      nextUnit = 'yards';
      if (distanceUnit === 'feet') {
        nextDistance = Math.round(newDistanceValue / 3);
      }
    }

    setCurrentShot(currentShot + 1);
    setDistanceToHole(nextDistance);
    setDistanceUnit(nextUnit);

    setDistanceInput('');
    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
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
        textColor: 'text-slate-900',
        scoreDiff: diff,
        scoreDiffColor: 'text-yellow-600'
      };
    } else if (diff === -1) {
      return {
        display: hole.score,
        className: 'w-7 h-7 rounded-full bg-red-500 flex items-center justify-center',
        textColor: 'text-white',
        scoreDiff: diff,
        scoreDiffColor: 'text-red-600'
      };
    } else if (diff === 0) {
      return {
        display: hole.score,
        className: '',
        textColor: 'text-slate-900',
        scoreDiff: 'E',
        scoreDiffColor: 'text-slate-600'
      };
    } else if (diff === 1) {
      return {
        display: hole.score,
        className: 'w-7 h-7 rounded bg-blue-500 flex items-center justify-center',
        textColor: 'text-white',
        scoreDiff: `+${diff}`,
        scoreDiffColor: 'text-blue-600'
      };
    } else {
      return {
        display: hole.score,
        className: 'w-7 h-7 rounded bg-black flex items-center justify-center',
        textColor: 'text-white',
        scoreDiff: `+${diff}`,
        scoreDiffColor: 'text-slate-900'
      };
    }
  };

  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);
  const totalYardage = holes.reduce((sum, hole) => sum + hole.yardage, 0);
  const completedHoles = holes.filter(h => h.score !== null);
  const totalScore = completedHoles.reduce((sum, hole) => sum + (hole.score || 0), 0);
  const scoreToPar = totalScore - completedHoles.reduce((sum, hole) => sum + hole.par, 0);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">

      {/* SCORECARD HEADER */}
      <div className="w-full bg-white border-b border-slate-200 shadow-md sticky top-0 z-50">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="inline-flex min-w-full">

            {/* Column Labels */}
            <div className="sticky left-0 z-20 bg-gradient-to-r from-white via-white to-white/90 shadow-sm">
              <div className="w-16 border-r-2 border-slate-300">
                <div className="h-8 flex items-center justify-center text-xs font-bold text-slate-500 border-b border-slate-200 bg-slate-50">HOLE</div>
                <div className="h-6 flex items-center justify-center text-xs font-semibold text-slate-600 border-b border-slate-100">PAR</div>
                <div className="h-6 flex items-center justify-center text-xs font-semibold text-slate-600 border-b border-slate-100">YDS</div>
                <div className="h-8 flex items-center justify-center text-xs font-bold text-slate-500 border-b border-slate-100">SCORE</div>
                <div className="h-7 flex items-center justify-center text-xs font-bold text-slate-500">+/-</div>
              </div>
            </div>

            {/* Hole Cards */}
            {holes.map((hole, index) => {
              const scoreDisplay = getScoreDisplay(hole);
              const isFront9End = index === 8;
              const isBack9End = index === 17;

              return (
                <div
                  key={hole.number}
                  className={cn(
                    "snap-center",
                    hole.current ? 'bg-green-50 ring-2 ring-green-600' : 'bg-white',
                    isFront9End || isBack9End ? 'border-r-2 border-slate-400' : 'border-r border-slate-200'
                  )}
                >
                  <div className={cn(
                    "h-8 w-14 flex items-center justify-center border-b border-slate-200",
                    hole.current ? 'bg-green-600 text-white' : 'bg-slate-50 text-slate-700'
                  )}>
                    <span className="text-sm font-bold">{hole.number}</span>
                  </div>
                  <div className="h-6 w-14 flex items-center justify-center border-b border-slate-100">
                    <span className={cn("text-sm font-semibold", hole.current ? 'text-slate-900' : 'text-slate-700')}>{hole.par}</span>
                  </div>
                  <div className="h-6 w-14 flex items-center justify-center border-b border-slate-100">
                    <span className="text-xs text-slate-600">{hole.yardage}</span>
                  </div>
                  <div className="h-8 w-14 flex items-center justify-center border-b border-slate-100">
                    {scoreDisplay.className ? (
                      <div className={scoreDisplay.className}>
                        <span className={cn("text-sm font-bold", scoreDisplay.textColor)}>{scoreDisplay.display}</span>
                      </div>
                    ) : (
                      <span className={cn("text-sm font-bold", scoreDisplay.textColor || scoreDisplay.className)}>{scoreDisplay.display}</span>
                    )}
                  </div>
                  <div className="h-7 w-14 flex items-center justify-center">
                    <span className={cn("text-sm font-bold", scoreDisplay.scoreDiffColor || 'text-slate-300')}>{scoreDisplay.scoreDiff || '-'}</span>
                  </div>
                </div>
              );
            })}

            {/* Total Column */}
            <div className="sticky right-0 z-20 bg-gradient-to-l from-white via-white to-white/90 shadow-sm border-l-2 border-green-600">
              <div className="w-16">
                <div className="h-8 flex items-center justify-center text-xs font-bold text-slate-900 border-b border-slate-200 bg-green-50">TOTAL</div>
                <div className="h-6 flex items-center justify-center text-sm font-bold text-slate-900 border-b border-slate-100">{totalPar}</div>
                <div className="h-6 flex items-center justify-center text-xs text-slate-600 border-b border-slate-100">{totalYardage}</div>
                <div className="h-8 flex items-center justify-center border-b border-slate-100">
                  <span className="text-lg font-bold text-slate-900">{totalScore || '-'}</span>
                </div>
                <div className="h-7 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-900">{scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar === 0 ? 'E' : scoreToPar}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* NEXT SHOT BUTTON */}
        <div className="absolute top-2 right-4">
          <button
            onClick={handleNextShot}
            disabled={!isNextShotEnabled()}
            className={cn(
              "px-6 py-2 rounded-lg font-bold text-sm transition-all",
              isNextShotEnabled()
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-md cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            {resultOfShot === 'hole' ? 'Complete Hole' : 'Next Shot'}
          </button>
        </div>
      </div>

      {/* SHOT TRACKING INTERFACE */}
      <div className="p-6 max-w-7xl mx-auto">

        {/* Shot Label */}
        <div className="text-center mb-4">
          <div className="text-sm font-bold text-slate-600 uppercase tracking-wider">
            {getShotTypeLabel()}
          </div>
        </div>

        {/* Shot Counter */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3, 4, 5, 6].map((shotNum) => {
            const isActive = shotNum === currentShot;
            const isCompleted = shotNum < currentShot;
            const isFuture = shotNum > currentShot;

            return (
              <div
                key={shotNum}
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center transition-all",
                  isActive && 'bg-green-600 shadow-lg ring-2 ring-green-600',
                  isCompleted && 'bg-slate-200 border-2 border-slate-300',
                  isFuture && 'bg-slate-100 border-2 border-slate-200'
                )}
              >
                <span className={cn(
                  "text-xl font-bold",
                  isActive && 'text-white',
                  isCompleted && 'text-slate-500',
                  isFuture && 'text-slate-400'
                )}>
                  {shotNum}
                </span>
              </div>
            );
          })}
        </div>

        {/* Main Input Row */}
        <div className="flex justify-start gap-4 flex-wrap">

          {/* Distance to Hole Input Card */}
          <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              What is the distance to the hole?
            </div>

            {/* PUTTING: Break & Slope BEFORE Distance Input */}
            {shotType === 'putting' && (
              <div className="mb-4 pb-4 border-b border-slate-200">
                {/* Break Selection */}
                <div className="mb-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Break (Required)
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setPuttBreak('right_to_left')}
                      className={cn(
                        "w-full px-3 py-2 rounded-lg border-2 transition-all text-left",
                        puttBreak === 'right_to_left' ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-green-600'
                      )}
                    >
                      <span className="text-xs font-bold">Right to Left</span>
                    </button>
                    <button
                      onClick={() => setPuttBreak('left_to_right')}
                      className={cn(
                        "w-full px-3 py-2 rounded-lg border-2 transition-all text-left",
                        puttBreak === 'left_to_right' ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-green-600'
                      )}
                    >
                      <span className="text-xs font-bold">Left to Right</span>
                    </button>
                    <button
                      onClick={() => setPuttBreak('double_breaker')}
                      className={cn(
                        "w-full px-3 py-2 rounded-lg border-2 transition-all text-left",
                        puttBreak === 'double_breaker' ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-green-600'
                      )}
                    >
                      <span className="text-xs font-bold">Double Breaker</span>
                    </button>
                  </div>
                </div>

                {/* Slope Selection */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Slope (Required)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['downhill', 'uphill', 'flat', 'multiple_slopes'].map((slope) => (
                      <button
                        key={slope}
                        onClick={() => setPuttSlope(slope)}
                        className={cn(
                          "px-3 py-2 rounded-lg border-2 transition-all",
                          puttSlope === slope ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-green-600'
                        )}
                      >
                        <span className="text-xs font-bold">{slope === 'multiple_slopes' ? 'Multiple' : slope.charAt(0).toUpperCase() + slope.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Single Distance Input */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={distanceInput}
                onChange={(e) => setDistanceInput(e.target.value)}
                placeholder="0"
                className="w-28 px-3 py-2 border-2 border-slate-300 rounded-lg text-3xl font-bold text-green-600 focus:border-green-600 focus:outline-none"
              />
              <span className="text-xl font-semibold text-slate-600">{distanceUnit}</span>
            </div>

            {/* Helper text */}
            <div className="text-xs text-slate-400 mt-2">
              {shotType === 'putting' ? 'Current distance in feet' : 'Current distance from hole'}
            </div>
          </div>

          {/* Driver Selection - Shot 1 Only */}
          {currentShot === 1 && (
            <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tee Shot</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setUsedDriver(true)}
                  disabled={currentHole.par === 3}
                  className={cn(
                    "px-6 py-3 rounded-lg border-2 transition-all",
                    currentHole.par === 3 && 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-50',
                    currentHole.par !== 3 && usedDriver === true && 'bg-green-600 border-green-600 shadow-md hover:bg-green-700',
                    currentHole.par !== 3 && usedDriver !== true && 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                  )}
                >
                  <span className={cn(
                    "text-sm font-bold",
                    currentHole.par === 3 && 'text-slate-400',
                    currentHole.par !== 3 && usedDriver === true && 'text-white',
                    currentHole.par !== 3 && usedDriver !== true && 'text-slate-700'
                  )}>Driver</span>
                </button>
                <button
                  onClick={() => setUsedDriver(false)}
                  disabled={currentHole.par === 3}
                  className={cn(
                    "px-6 py-3 rounded-lg border-2 transition-all",
                    currentHole.par === 3 && 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-50',
                    currentHole.par !== 3 && usedDriver === false && 'bg-green-600 border-green-600 shadow-md hover:bg-green-700',
                    currentHole.par !== 3 && usedDriver !== false && 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                  )}
                >
                  <span className={cn(
                    "text-sm font-bold",
                    currentHole.par === 3 && 'text-slate-400',
                    currentHole.par !== 3 && usedDriver === false && 'text-white',
                    currentHole.par !== 3 && usedDriver !== false && 'text-slate-700'
                  )}>Non-Driver</span>
                </button>
              </div>
              {currentHole.par === 3 && (
                <div className="text-xs text-slate-400 mt-2">Not available on par 3's</div>
              )}
            </div>
          )}

          {/* Result of Shot */}
          <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm flex-1 min-w-[400px]">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Result of Shot</div>

            {/* Main Options */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {['fairway', 'rough', 'sand', 'green', 'hole', 'other'].map((option) => (
                <button
                  key={option}
                  onClick={() => handleResultSelect(option)}
                  className={cn(
                    "px-4 py-2 rounded-lg border-2 transition-all",
                    resultOfShot === option ? 'bg-green-600 border-green-600 shadow-sm hover:bg-green-700' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                  )}
                >
                  <span className={cn(
                    "text-xs font-bold",
                    resultOfShot === option ? 'text-white' : 'text-slate-700'
                  )}>
                    {option === 'green' ? 'On Green' : option === 'hole' ? 'In Hole' : option.charAt(0).toUpperCase() + option.slice(1)}
                  </span>
                </button>
              ))}
            </div>

            {/* Miss Directions */}
            {(
              (shotType !== 'putting' && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
              (shotType === 'putting' && resultOfShot && resultOfShot !== 'hole')
            ) && (
              <div className="pt-3 border-t border-slate-200">

                {/* TEE SHOT: Left/Right */}
                {shotType === 'tee' && (
                  <div className="flex gap-2">
                    {['left', 'right'].map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setMissDirection(dir)}
                        className={cn(
                          "flex-1 px-4 py-2 rounded-lg border-2 transition-all",
                          missDirection === dir ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn(
                          "text-xs font-bold",
                          missDirection === dir ? 'text-white' : 'text-slate-700'
                        )}>
                          {dir.charAt(0).toUpperCase() + dir.slice(1)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* APPROACH & AROUND GREEN: 8 Directions */}
                {(shotType === 'approach' || shotType === 'around_green') && (
                  <div className="grid grid-cols-3 gap-2">
                    {/* Left Column */}
                    <div className="space-y-2">
                      {['long_left', 'left', 'short_left'].map((dir) => (
                        <button
                          key={dir}
                          onClick={() => setMissDirection(dir)}
                          className={cn(
                            "w-full px-3 py-2 rounded-lg border-2 transition-all",
                            missDirection === dir ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                          )}
                        >
                          <span className={cn(
                            "text-xs font-bold",
                            missDirection === dir ? 'text-white' : 'text-slate-700'
                          )}>
                            {dir.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* Middle Column */}
                    <div className="space-y-2">
                      <button
                        onClick={() => setMissDirection('long')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'long' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn(
                          "text-xs font-bold",
                          missDirection === 'long' ? 'text-white' : 'text-slate-700'
                        )}>Long</span>
                      </button>
                      <div className="h-[42px]"></div>
                      <button
                        onClick={() => setMissDirection('short')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'short' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn(
                          "text-xs font-bold",
                          missDirection === 'short' ? 'text-white' : 'text-slate-700'
                        )}>Short</span>
                      </button>
                    </div>
                    {/* Right Column */}
                    <div className="space-y-2">
                      {['long_right', 'right', 'short_right'].map((dir) => (
                        <button
                          key={dir}
                          onClick={() => setMissDirection(dir)}
                          className={cn(
                            "w-full px-3 py-2 rounded-lg border-2 transition-all",
                            missDirection === dir ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                          )}
                        >
                          <span className={cn(
                            "text-xs font-bold",
                            missDirection === dir ? 'text-white' : 'text-slate-700'
                          )}>
                            {dir.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* PUTTING: 5 Directions */}
                {shotType === 'putting' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2">
                      <button
                        onClick={() => setMissDirection('short_low')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'short_low' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn("text-xs font-bold", missDirection === 'short_low' ? 'text-white' : 'text-slate-700')}>Short Low</span>
                      </button>
                      <div className="h-[42px]"></div>
                      <button
                        onClick={() => setMissDirection('long_low')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'long_low' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn("text-xs font-bold", missDirection === 'long_low' ? 'text-white' : 'text-slate-700')}>Long Low</span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => setMissDirection('short')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'short' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn("text-xs font-bold", missDirection === 'short' ? 'text-white' : 'text-slate-700')}>Short</span>
                      </button>
                      <div className="h-[42px] flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-slate-400 flex items-center justify-center">
                          <span className="text-xs">⛳</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setMissDirection('long')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'long' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn("text-xs font-bold", missDirection === 'long' ? 'text-white' : 'text-slate-700')}>Long</span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => setMissDirection('short_high')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'short_high' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn("text-xs font-bold", missDirection === 'short_high' ? 'text-white' : 'text-slate-700')}>Short High</span>
                      </button>
                      <div className="h-[42px]"></div>
                      <button
                        onClick={() => setMissDirection('long_high')}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border-2 transition-all",
                          missDirection === 'long_high' ? 'bg-green-600 border-green-600 shadow-sm' : 'bg-white border-slate-300 hover:border-green-600 hover:bg-green-50'
                        )}
                      >
                        <span className={cn("text-xs font-bold", missDirection === 'long_high' ? 'text-white' : 'text-slate-700')}>Long High</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Legend */}
      <div className="fixed bottom-4 right-4 bg-white rounded-xl shadow-xl p-5 border border-slate-200 max-w-xs">
        <div className="text-sm font-bold text-slate-900 mb-3">SHOT TYPES</div>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-700">Tee:</span>
            <span className="text-slate-600">Par 4/5 shot 1</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-700">Approach:</span>
            <span className="text-slate-600">Par 3 shot 1 or &gt;30 yards</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-700">Around Green:</span>
            <span className="text-slate-600">≤30 yards, not on green</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-700">Putting:</span>
            <span className="text-slate-600">On green from previous shot</span>
          </div>
        </div>
      </div>

    </div>
  );
}
