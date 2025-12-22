'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight, IconGolf, IconFlag } from '@/components/icons';
import { saveShot } from '@/app/player-golf/actions/rounds';

// ========================================
// TYPES & INTERFACES
// ========================================

type ShotType = 'tee' | 'approach' | 'around_green' | 'putting';
type ShotResult = 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other';
type MissDirection =
  | 'left' | 'right' // Tee shots
  | 'long_left' | 'long' | 'long_right' | 'short_left' | 'short' | 'short_right' // Approach/Around Green
  | null;
type PuttMissDirection = 'short_left' | 'short' | 'short_right' | 'left' | 'right' | null;
type PuttBreak = 'left_to_right' | 'right_to_left' | 'straight' | null;
type PuttSlope = 'uphill' | 'downhill' | 'level' | 'severe' | null;

interface HoleData {
  hole_number: number;
  par: number;
  yardage: number;
}

interface ShotRecord {
  shot_number: number;
  shot_type: ShotType;
  distance_to_hole_before: number; // In inches
  distance_to_hole_after: number; // In inches
  result_of_shot: ShotResult;
  miss_direction: string | null;
  used_driver: boolean | null;
  putt_break: PuttBreak;
  putt_slope: PuttSlope;
}

interface ShotTrackingProps {
  roundId: string;
  holes: HoleData[];
  startingHole?: number;
  courseName: string;
  teesPlayed: string;
  courseRating?: number | null;
  courseSlope?: number | null;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

// Convert yards to inches
const yardsToInches = (yards: number): number => Math.round(yards * 36);

// Convert feet to inches
const feetToInches = (feet: number): number => Math.round(feet * 12);

// Convert inches to yards
const inchesToYards = (inches: number): number => Math.round(inches / 36);

// Convert inches to feet
const inchesToFeet = (inches: number): number => Math.round(inches / 12);

// Determine shot type based on context
const getShotType = (
  shotNumber: number,
  distanceToHole: number, // in inches
  hasBeenOnGreen: boolean,
  par: number
): ShotType => {
  // If ball was on green last shot → PUTTING
  if (hasBeenOnGreen) {
    return 'putting';
  }

  // First shot on Par 4 or 5 → TEE
  if (shotNumber === 1 && par !== 3) {
    return 'tee';
  }

  // First shot on Par 3 → APPROACH (not a tee shot!)
  if (shotNumber === 1 && par === 3) {
    return 'approach';
  }

  const distanceInYards = inchesToYards(distanceToHole);

  // More than 30 yards → APPROACH
  if (distanceInYards > 30) {
    return 'approach';
  }

  // 30 yards or less → AROUND THE GREEN
  return 'around_green';
};

// ========================================
// MAIN COMPONENT
// ========================================

export default function ShotTrackingFinal({
  roundId,
  holes,
  startingHole = 1,
  courseName,
  teesPlayed,
  courseRating,
  courseSlope
}: ShotTrackingProps) {
  // ========================================
  // STATE
  // ========================================

  // Current hole state
  const [currentHoleIndex, setCurrentHoleIndex] = useState(startingHole - 1);
  const currentHole = holes[currentHoleIndex];

  // Shot tracking state
  const [shotNumber, setShotNumber] = useState(1);
  const [distanceToHoleBefore, setDistanceToHoleBefore] = useState(yardsToInches(currentHole.yardage));
  const [hasBeenOnGreen, setHasBeenOnGreen] = useState(false);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>([]);

  // Current shot input state
  const [distanceAfter, setDistanceAfter] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'feet'>('yards');
  const [usedDriver, setUsedDriver] = useState<boolean | null>(null);
  const [result, setResult] = useState<ShotResult | null>(null);
  const [missDirection, setMissDirection] = useState<string | null>(null);
  const [puttBreak, setPuttBreak] = useState<PuttBreak>(null);
  const [puttSlope, setPuttSlope] = useState<PuttSlope>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ========================================
  // COMPUTED VALUES
  // ========================================

  const shotType = getShotType(shotNumber, distanceToHoleBefore, hasBeenOnGreen, currentHole.par);
  const isTeeShot = shotType === 'tee';
  const isPutting = shotType === 'putting';
  const isApproach = shotType === 'approach';
  const isAroundGreen = shotType === 'around_green';

  // Get friendly shot type label
  // First shot is ALWAYS called "Tee Shot" for user display
  const getShotTypeLabel = (shotNum: number, type: ShotType): string => {
    if (shotNum === 1) return 'Tee Shot';

    const labels = {
      'tee': 'Tee Shot',
      'approach': 'Approach',
      'around_green': 'Around the Green',
      'putting': 'Putting'
    };
    return labels[type];
  };

  // Calculate if current shot is valid
  const canSubmitShot = () => {
    if (!distanceAfter) return false;
    if (isTeeShot && usedDriver === null) return false;
    if (isPutting && (!puttBreak || !puttSlope)) return false;
    if (!result) return false;

    // Miss direction required for certain results
    if (result && ['rough', 'sand', 'other'].includes(result) && !missDirection) {
      return false;
    }

    // For putting, miss direction required if not holed
    if (isPutting && result !== 'hole' && !missDirection) {
      return false;
    }

    return true;
  };

  // ========================================
  // MISS DIRECTION OPTIONS
  // ========================================

  const getMissDirectionOptions = (): string[] => {
    if (isTeeShot) {
      return ['left', 'right'];
    }

    if (isApproach || isAroundGreen) {
      return [
        'long_left', 'long', 'long_right',
        'left', 'right',
        'short_left', 'short', 'short_right'
      ];
    }

    if (isPutting) {
      return ['short_left', 'short', 'short_right', 'left', 'right'];
    }

    return [];
  };

  const formatMissDirection = (dir: string): string => {
    return dir.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
  };

  // ========================================
  // SHOT SUBMISSION
  // ========================================

  const handleSubmitShot = async () => {
    if (!canSubmitShot()) return;

    setLoading(true);
    setError(null);

    try {
      // Convert distance after to inches
      const distanceAfterInches = distanceUnit === 'yards'
        ? yardsToInches(parseFloat(distanceAfter))
        : feetToInches(parseFloat(distanceAfter));

      // Create shot record
      const shot: ShotRecord = {
        shot_number: shotNumber,
        shot_type: shotType,
        distance_to_hole_before: distanceToHoleBefore,
        distance_to_hole_after: distanceAfterInches,
        result_of_shot: result!,
        miss_direction: missDirection,
        used_driver: isTeeShot ? usedDriver : null,
        putt_break: isPutting ? puttBreak : null,
        putt_slope: isPutting ? puttSlope : null,
      };

      // Save to database
      await saveShot(roundId, currentHole.hole_number, shot);

      // Add to shot history
      setShotHistory([...shotHistory, shot]);

      // Check if hole is complete
      if (result === 'hole') {
        // Hole complete!
        if (currentHoleIndex < holes.length - 1) {
          // Move to next hole
          setTimeout(() => {
            const nextHoleIndex = currentHoleIndex + 1;
            const nextHole = holes[nextHoleIndex];

            setCurrentHoleIndex(nextHoleIndex);
            setShotNumber(1);
            setDistanceToHoleBefore(yardsToInches(nextHole.yardage));
            setHasBeenOnGreen(false);
            setShotHistory([]);

            // Reset inputs
            resetInputs();
          }, 1000);
        } else {
          // Round complete!
          alert('Round complete! Great job!');
        }
      } else {
        // Prepare for next shot
        setShotNumber(shotNumber + 1);
        setDistanceToHoleBefore(distanceAfterInches);

        // Update hasBeenOnGreen flag
        if (result === 'green') {
          setHasBeenOnGreen(true);
          setDistanceUnit('feet'); // Switch to feet for putting
        }

        // Reset inputs
        resetInputs();
      }
    } catch (err) {
      console.error('Error saving shot:', err);
      setError('Failed to save shot. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetInputs = () => {
    setDistanceAfter('');
    setUsedDriver(null);
    setResult(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="min-h-screen bg-[#FAF6F1] pb-20">
      {/* Course Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{courseName}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{teesPlayed}</p>
            </div>
            <div className="flex items-center gap-6">
              {courseRating && (
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Rating</p>
                  <p className="text-base font-semibold text-slate-900">{courseRating.toFixed(1)}</p>
                </div>
              )}
              {courseSlope && (
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Slope</p>
                  <p className="text-base font-semibold text-slate-900">{courseSlope}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Par</p>
                <p className="text-base font-semibold text-green-600">
                  {holes.reduce((sum, h) => sum + h.par, 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Yardage</p>
                <p className="text-base font-semibold text-slate-900">
                  {holes.reduce((sum, h) => sum + h.yardage, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Scorecard */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto">
        <div className="flex min-w-max px-4 py-3">
          {holes.map((hole, idx) => (
            <button
              key={hole.hole_number}
              onClick={() => {
                if (idx !== currentHoleIndex) {
                  // Allow hole switching (with confirmation if mid-hole)
                  const confirmSwitch = shotNumber > 1
                    ? window.confirm('Switch holes? Current hole progress will be saved.')
                    : true;

                  if (confirmSwitch) {
                    setCurrentHoleIndex(idx);
                    setShotNumber(1);
                    setDistanceToHoleBefore(yardsToInches(hole.yardage));
                    setHasBeenOnGreen(false);
                    setDistanceUnit('yards');
                    setShotHistory([]);
                    resetInputs();
                  }
                }
              }}
              className={`flex flex-col items-center justify-center w-16 h-16 mx-1 rounded-lg transition-all ${
                idx === currentHoleIndex
                  ? 'bg-green-600 text-white shadow-lg'
                  : shotHistory.length > 0 && idx < currentHoleIndex
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="text-xs font-medium">Hole {hole.hole_number}</span>
              <span className="text-lg font-bold">{hole.par}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Tracking Interface */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Hole Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              Hole {currentHole.hole_number}
            </h1>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase">Par</p>
                <p className="text-lg font-bold text-slate-900">{currentHole.par}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase">Yardage</p>
                <p className="text-lg font-bold text-slate-900">{currentHole.yardage}</p>
              </div>
            </div>
          </div>

          {/* Shot Counter */}
          <div className="flex items-center gap-2">
            <IconGolf className="text-green-600" size={20} />
            <span className="text-sm font-medium text-slate-700">
              SHOT {shotNumber} • {getShotTypeLabel(shotNumber, shotType)}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Distance to Hole (Before) */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Distance to Hole</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {distanceUnit === 'yards'
                    ? inchesToYards(distanceToHoleBefore)
                    : inchesToFeet(distanceToHoleBefore)}
                </span>
                <span className="text-lg text-slate-500">{distanceUnit}</span>
              </div>
            </div>

            {/* Driver Selection (Tee Shots Only) */}
            {isTeeShot && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Club Selection</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setUsedDriver(true)}
                    className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                      usedDriver === true
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    Driver
                  </button>
                  <button
                    onClick={() => setUsedDriver(false)}
                    className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                      usedDriver === false
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    Non-Driver
                  </button>
                </div>
              </div>
            )}

            {/* Putting Details (Before Result) */}
            {isPutting && (
              <>
                {/* Break */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    Break <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['right_to_left', 'left_to_right', 'straight'] as PuttBreak[]).map((breakType) => (
                      <button
                        key={breakType}
                        onClick={() => setPuttBreak(breakType)}
                        className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          puttBreak === breakType
                            ? 'border-green-600 bg-green-50 text-green-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        {breakType === 'right_to_left' ? 'R to L' : breakType === 'left_to_right' ? 'L to R' : 'Straight'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slope */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    Slope <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(['uphill', 'downhill', 'level', 'severe'] as PuttSlope[]).map((slopeType) => (
                      <button
                        key={slopeType}
                        onClick={() => setPuttSlope(slopeType)}
                        className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          puttSlope === slopeType
                            ? 'border-green-600 bg-green-50 text-green-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        {slopeType.charAt(0).toUpperCase() + slopeType.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* After Shot Distance */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">
                After Shot Distance <span className="text-red-500">*</span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={distanceAfter}
                  onChange={(e) => setDistanceAfter(e.target.value)}
                  placeholder={`Enter in ${distanceUnit}`}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200
                             focus:border-green-500 focus:ring-2 focus:ring-green-100
                             text-slate-900 text-lg font-medium placeholder:text-slate-400 transition-colors"
                />
                <span className="text-sm font-medium text-slate-500 w-12">{distanceUnit}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">0 = in the hole</p>
            </div>

            {/* Result */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">
                Result <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['fairway', 'rough', 'sand', 'green', 'hole', 'other'] as ShotResult[]).map((resultType) => (
                  <button
                    key={resultType}
                    onClick={() => {
                      setResult(resultType);
                      // Reset miss direction when changing result
                      if (!['rough', 'sand', 'other'].includes(resultType) && resultType !== 'green' && resultType !== 'hole') {
                        setMissDirection(null);
                      }
                    }}
                    className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                      result === resultType
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    {resultType.charAt(0).toUpperCase() + resultType.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Miss Direction (Conditional - only for non-perfect results) */}
            {result && result !== 'green' && result !== 'hole' && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">
                  Miss Direction <span className="text-red-500">*</span>
                </p>

                {/* TEE SHOTS: 2 options (Left/Right) */}
                {isTeeShot && (
                  <div className="grid grid-cols-2 gap-3">
                    {getMissDirectionOptions().map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setMissDirection(dir)}
                        className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                          missDirection === dir
                            ? 'border-green-600 bg-green-50 text-green-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        {formatMissDirection(dir)}
                      </button>
                    ))}
                  </div>
                )}

                {/* APPROACH & AROUND GREEN: 8 compass options with flag in center */}
                {(isApproach || isAroundGreen) && (
                  <div className="grid grid-cols-3 gap-2">
                    {getMissDirectionOptions().map((dir, idx) => {
                      // Center position (index 4) should show flag
                      if (idx === 4) {
                        return (
                          <div key="center" className="flex items-center justify-center text-3xl">
                            ⛳
                          </div>
                        );
                      }
                      return (
                        <button
                          key={dir}
                          onClick={() => setMissDirection(dir)}
                          className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            missDirection === dir
                              ? 'border-green-600 bg-green-50 text-green-700'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {formatMissDirection(dir)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* PUTTING: 5 options with flag in center */}
                {isPutting && (
                  <div className="grid grid-cols-3 gap-2">
                    {getMissDirectionOptions().map((dir, idx) => {
                      // After 3rd item, add flag in center
                      if (idx === 3) {
                        return (
                          <>
                            <div key="center" className="flex items-center justify-center text-3xl">
                              ⛳
                            </div>
                            <button
                              key={dir}
                              onClick={() => setMissDirection(dir)}
                              className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                                missDirection === dir
                                  ? 'border-green-600 bg-green-50 text-green-700'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
                              }`}
                            >
                              {formatMissDirection(dir)}
                            </button>
                          </>
                        );
                      }
                      return (
                        <button
                          key={dir}
                          onClick={() => setMissDirection(dir)}
                          className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            missDirection === dir
                              ? 'border-green-600 bg-green-50 text-green-700'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {formatMissDirection(dir)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shot History */}
        {shotHistory.length > 0 && (
          <Card className="mt-6">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Shot History</h3>
              <div className="space-y-2">
                {shotHistory.map((shot) => {
                  const shotDist = shot.distance_to_hole_before - shot.distance_to_hole_after;
                  const shotDistFormatted = shot.shot_type === 'putting'
                    ? `${inchesToFeet(shotDist)} ft`
                    : `${inchesToYards(shotDist)} yds`;

                  return (
                    <div key={shot.shot_number} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-6">#{shot.shot_number}</span>
                        <span className="text-sm font-medium text-slate-900">{getShotTypeLabel(shot.shot_number, shot.shot_type)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        {shot.used_driver !== null && (
                          <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                            {shot.used_driver ? 'Driver' : 'Non-Driver'}
                          </span>
                        )}
                        <span className="font-medium">{shotDistFormatted}</span>
                        <span>→</span>
                        <span className="capitalize">{shot.result_of_shot.replace('_', ' ')}</span>
                        {shot.miss_direction && (
                          <span className="text-xs text-red-600">({formatMissDirection(shot.miss_direction)})</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next Shot Button */}
        <div className="mt-6">
          <Button
            onClick={handleSubmitShot}
            disabled={!canSubmitShot() || loading}
            className="w-full py-4 text-lg font-semibold"
          >
            {loading ? 'Saving...' : result === 'hole' ? 'Complete Hole' : 'Next Shot'}
            <IconChevronRight size={20} className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
