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

  // Safety check for invalid hole index
  if (!currentHole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-slate-600">Invalid hole data</p>
        </div>
      </div>
    );
  }

  const [currentShot, setCurrentShot] = useState(1);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>([]);
  const [hasBeenOnGreen, setHasBeenOnGreen] = useState(false);
  
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
    // Calculate distances
    let shotDistance = 0;
    let distanceAfter = 0;
    
    if (currentShot === 1) {
      distanceAfter = distanceToHole;
      shotDistance = 0;
    } else {
      const measured = parseInt(measuredDistance);
      distanceAfter = measured;
      shotDistance = distanceToHole - measured;
    }
    
    // Create shot record
    const shotRecord: ShotRecord = {
      shotNumber: currentShot,
      shotType: shotType,
      distanceToHoleBefore: distanceToHole,
      distanceToHoleAfter: distanceAfter,
      shotDistance: shotDistance,
      usedDriver: currentShot === 1 && currentHole.par !== 3 ? usedDriver! : undefined,
      resultOfShot: resultOfShot!,
      missDirection: missDirection || undefined,
      puttBreak: shotType === 'putting' ? puttBreak as any : undefined,
      puttSlope: shotType === 'putting' ? puttSlope as any : undefined
    };
    
    const updatedHistory = [...shotHistory, shotRecord];
    setShotHistory(updatedHistory);
    
    // If holed out, complete the hole
    if (resultOfShot === 'hole') {
      const finalScore = currentShot; // Score is the number of shots taken
      onHoleComplete(currentHoleIndex, finalScore, updatedHistory);
      return;
    }
    
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
      return {
        display: hole.score,
        className: '',
        textColor: 'text-slate-900'
      };
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

  return (
    <div className="min-h-screen bg-slate-50">
      
      {/* HORIZONTAL SCORECARD - Data from Round Setup */}
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
                    className={`
                      min-w-[80px] p-3 border-r border-slate-200 text-center
                      ${isCurrent ? 'bg-green-50 border-l-4 border-l-green-600' : ''}
                    `}
                  >
                    <div className="text-xs font-bold text-slate-600 mb-1">
                      Hole {hole.number}
                    </div>
                    <div className="text-xs text-slate-500 mb-1">
                      Par {hole.par}
                    </div>
                    <div className="text-xs text-slate-400 mb-2">
                      {hole.yardage} yds
                    </div>
                    <div className={scoreData.className || ''}>
                      <span className={`font-bold ${scoreData.textColor || 'text-slate-900'}`}>
                        {scoreData.display}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* OUT Total */}
            <div className="min-w-[80px] p-3 border-r-2 border-slate-400 text-center bg-slate-100">
              <div className="text-xs font-bold text-slate-700 mb-1">OUT</div>
              <div className="text-xs text-slate-600 mb-1">
                Par {holes.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-500 mb-2">
                {holes.slice(0, 9).reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {holes.slice(0, 9).every(h => h.score !== null) 
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
                    className={`
                      min-w-[80px] p-3 border-r border-slate-200 text-center
                      ${isCurrent ? 'bg-green-50 border-l-4 border-l-green-600' : ''}
                    `}
                  >
                    <div className="text-xs font-bold text-slate-600 mb-1">
                      Hole {hole.number}
                    </div>
                    <div className="text-xs text-slate-500 mb-1">
                      Par {hole.par}
                    </div>
                    <div className="text-xs text-slate-400 mb-2">
                      {hole.yardage} yds
                    </div>
                    <div className={scoreData.className || ''}>
                      <span className={`font-bold ${scoreData.textColor || 'text-slate-900'}`}>
                        {scoreData.display}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* IN Total */}
            <div className="min-w-[80px] p-3 border-r-2 border-slate-400 text-center bg-slate-100">
              <div className="text-xs font-bold text-slate-700 mb-1">IN</div>
              <div className="text-xs text-slate-600 mb-1">
                Par {holes.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-500 mb-2">
                {holes.slice(9, 18).reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {holes.slice(9, 18).every(h => h.score !== null)
                  ? holes.slice(9, 18).reduce((sum, h) => sum + (h.score || 0), 0)
                  : '-'}
              </div>
            </div>

            {/* TOTAL */}
            <div className="min-w-[100px] p-3 text-center bg-slate-200">
              <div className="text-xs font-bold text-slate-800 mb-1">TOTAL</div>
              <div className="text-xs text-slate-700 mb-1">
                Par {holes.reduce((sum, h) => sum + h.par, 0)}
              </div>
              <div className="text-xs text-slate-600 mb-2">
                {holes.reduce((sum, h) => sum + h.yardage, 0)}
              </div>
              <div className="text-lg font-bold text-green-600">
                {holes.every(h => h.score !== null)
                  ? holes.reduce((sum, h) => sum + (h.score || 0), 0)
                  : holes.filter(h => h.score !== null).length > 0
                    ? holes.reduce((sum, h) => sum + (h.score || 0), 0)
                    : '-'}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* SHOT TRACKING INTERFACE */}
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        
        {/* Header - Current Hole Info */}
        <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-md">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Hole {currentHole.number}</h1>
              <p className="text-sm leading-relaxed text-slate-600">
                Shot {currentShot} • {shotType.charAt(0).toUpperCase() + shotType.slice(1).replace('_', ' ')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm leading-relaxed text-slate-500">Par</div>
              <div className="text-3xl font-bold text-slate-800">{currentHole.par}</div>
              <div className="text-sm leading-relaxed text-slate-500">{currentHole.yardage} yards</div>
            </div>
          </div>
        </div>

        {/* SHOT 1: Show distance from round setup */}
        {currentShot === 1 && (
          <>
            <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-500 uppercase mb-2">Distance to Hole</div>
                <div className="text-6xl font-bold text-green-600">
                  {distanceToHole}
                  <span className="text-2xl ml-2 text-slate-600">yards</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">From round setup</p>
              </div>
            </div>

            {/* Driver Selection */}
            {currentHole.par !== 3 && (
              <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
                <div className="text-sm font-bold text-slate-600 uppercase mb-3">Driver or Non-Driver?</div>
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

        {/* SHOT 2+: Measure distance first */}
        {currentShot > 1 && (
          <>
            <div className="bg-white rounded-xl border-2 border-green-200 p-6 shadow-sm">
              <div className="text-center mb-4">
                <div className="text-sm font-bold text-green-700 uppercase mb-2">
                  📍 Measure Distance to Hole
                </div>
                <p className="text-xs text-slate-600">Use your rangefinder</p>
              </div>
              
              <div className="flex items-center justify-center gap-3">
                <input
                  type="number"
                  value={measuredDistance}
                  onChange={(e) => setMeasuredDistance(e.target.value)}
                  placeholder="0"
                  className="w-32 px-4 py-4 border-2 border-green-300 rounded-lg text-3xl font-bold text-green-600 text-center focus:border-green-600 focus:outline-none"
                />
                <span className="text-xl font-semibold text-slate-600">{distanceUnit}</span>
              </div>
              
              {measuredDistance && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-xs text-green-700 font-semibold">
                    Previous shot: {distanceToHole - parseInt(measuredDistance)} {distanceUnit}
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    This shot type: {shotType.replace('_', ' ')}
                  </div>
                </div>
              )}
            </div>

            {/* Putting: Break & Slope */}
            {shotType === 'putting' && measuredDistance && (
              <div className="bg-white rounded-xl border-2 border-green-200 p-6 shadow-sm">
                <div className="text-sm font-bold text-green-700 uppercase mb-4">⛳ Putting Details</div>
                
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Break</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['right_to_left', 'left_to_right', 'straight'].map(brk => (
                      <button
                        key={brk}
                        onClick={() => setPuttBreak(brk)}
                        className={`py-3 rounded-lg border-2 font-semibold transition-all ${
                          puttBreak === brk 
                            ? 'bg-green-600 border-green-600 text-white' 
                            : 'border-slate-300 hover:border-green-600'
                        }`}
                      >
                        {brk === 'right_to_left' && 'R→L'}
                        {brk === 'left_to_right' && 'L→R'}
                        {brk === 'straight' && 'Straight'}
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
                        className={`py-3 rounded-lg border-2 font-semibold text-xs transition-all ${
                          puttSlope === slope 
                            ? 'bg-green-600 border-green-600 text-white' 
                            : 'border-slate-300 hover:border-green-600'
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
        <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
          <div className="text-sm font-bold text-slate-600 uppercase mb-3">--- Hit Your Shot ---</div>
          <div className="text-sm font-bold text-slate-600 uppercase mb-3">Result</div>
          <div className="grid grid-cols-3 gap-3">
            {['fairway', 'rough', 'sand', 'green', 'hole', 'other'].map(option => (
              <button
                key={option}
                onClick={() => handleResultSelect(option)}
                className={`py-4 rounded-lg border-2 font-bold transition-all ${
                  resultOfShot === option 
                    ? 'bg-green-600 border-green-600 text-white' 
                    : 'border-slate-300 hover:border-green-600'
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
          <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
            <div className="text-sm font-bold text-slate-600 uppercase mb-3">Miss Direction</div>
            
            {shotType === 'tee' && (
              <div className="grid grid-cols-2 gap-3">
                {['left', 'right'].map(dir => (
                  <button
                    key={dir}
                    onClick={() => setMissDirection(dir)}
                    className={`py-4 rounded-lg border-2 font-bold transition-all ${
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

            {(shotType === 'approach' || shotType === 'around_green') && (
              <div className="grid grid-cols-3 gap-2">
                {['long_left', 'long', 'long_right', 'left', null, 'right', 'short_left', 'short', 'short_right'].map((dir, idx) => (
                  dir === null ? (
                    <div key={idx} className="flex items-center justify-center text-2xl">⛳</div>
                  ) : (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-3 rounded-lg border-2 font-semibold text-sm transition-all ${
                        missDirection === dir 
                          ? 'bg-green-600 border-green-600 text-white' 
                          : 'border-slate-300 hover:border-green-600'
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
                      <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-xl">⛳</div>
                    </div>
                  ) : (
                    <button
                      key={dir}
                      onClick={() => setMissDirection(dir)}
                      className={`py-3 rounded-lg border-2 font-semibold text-sm transition-all ${
                        missDirection === dir 
                          ? 'bg-green-600 border-green-600 text-white' 
                          : 'border-slate-300 hover:border-green-600'
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
          className={`w-full py-5 rounded-xl font-bold text-lg transition-all ${
            isReadyForNextShot() 
              ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg' 
              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
          }`}
        >
          {resultOfShot === 'hole' ? `Complete Hole - Score: ${currentShot} ✅` : 'Next Shot →'}
        </button>

        {/* Shot History */}
        {shotHistory.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-slate-200 p-6 shadow-sm">
            <div className="text-sm font-bold text-slate-600 uppercase mb-4">
              Shot History (Current Score: {currentShot})
            </div>
            <div className="space-y-2">
              {shotHistory.map((shot, idx) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100">
                  <div>
                    <span className="font-bold text-green-600">Shot {shot.shotNumber}</span>
                    <span className="text-slate-600 ml-2">{shot.shotType.replace('_', ' ')}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{shot.shotDistance > 0 ? `${shot.shotDistance} yds` : 'TBD'}</div>
                    <div className="text-xs text-slate-500">{shot.resultOfShot}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
