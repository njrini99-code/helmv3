'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PuttMissTagSelector } from './putt-miss-tag-selector';
import { ApproachMissSelector } from './approach-miss-selector';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import type { PuttMissTag, ApproachMissDirection } from '@/lib/types/golf';
import { updateShot, deleteShot, type ShotUpdateData } from '@/app/golf/actions/golf';

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
  id?: string; // Database ID (present for saved shots, undefined for new shots)
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
  missDirection?: string; // Legacy field, kept for backward compatibility
  puttBreak?: 'right_to_left' | 'left_to_right' | 'straight' | 'multiple';
  puttSlope?: 'uphill' | 'downhill' | 'level' | 'severe';
  isPenalty: boolean;
  penaltyType?: 'ob' | 'water' | 'unplayable' | 'lost';
  // New putt classification fields
  puttMissTags?: PuttMissTag[];
  puttDistanceFeet?: number;
  // New approach miss classification
  approachMissDirection?: ApproachMissDirection;
  approachMissLieType?: 'fairway' | 'rough' | 'bunker' | 'hazard';
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
  onExit?: () => void;
  onNavigateToHole?: (holeIndex: number) => void;
  initialShots?: ShotRecord[];
  initialShotNumber?: number;
  // Auto-save props
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  autoSaveInterval?: number; // in milliseconds, default 30000 (30s)
}

// ============================================================================
// SHOT DISTANCE CALCULATION HELPER
// ============================================================================

/**
 * Calculates the actual shot distance based on miss direction.
 *
 * The key insight: distanceToHoleAfter tells us how far the ball is from the hole,
 * but the DIRECTION tells us WHERE the ball is relative to the hole:
 *
 * - SHORT: Ball is between you and the hole → shot = before - after
 * - LONG: Ball went past the hole → shot = before + after
 * - LEFT/RIGHT: Ball is lateral to the hole at ~same depth → shot ≈ before
 * - SHORT_LEFT/SHORT_RIGHT: Diagonal short → shot ≈ before - (after * 0.7)
 * - LONG_LEFT/LONG_RIGHT: Diagonal long → shot ≈ before + (after * 0.7)
 *
 * The 0.7 factor approximates a 45-degree diagonal (cos(45°) ≈ 0.707)
 */
function calculateShotDistanceWithDirection(
  distanceBeforeYards: number,
  distanceAfterYards: number,
  missDirection: string | null | undefined
): number {
  // If holed out, shot distance is exactly the before distance
  if (distanceAfterYards === 0) {
    return distanceBeforeYards;
  }

  // Golf distance calculation: "distance to hole" is always measured from ball to hole.
  // Shot distance = how much closer you got to the hole = before - after
  // The only exception is when the ball goes PAST the hole (long miss).

  // For most cases (including left/right misses), the shot distance is simply
  // how much closer you got to the hole.
  if (!missDirection) {
    return Math.max(0, distanceBeforeYards - distanceAfterYards);
  }

  const direction = missDirection.toLowerCase();

  // LONG: Ball went past the hole - you traveled MORE than the before distance
  if (direction === 'long') {
    return distanceBeforeYards + distanceAfterYards;
  }

  // DIAGONAL LONG: Ball went past and to the side
  if (direction === 'long_left' || direction === 'long_right') {
    // Estimate: ball went past, so add the distances, but discount the after distance
    // since some of it is lateral offset
    return distanceBeforeYards + Math.round(distanceAfterYards * 0.7);
  }

  // All other cases: SHORT, LEFT, RIGHT, SHORT_LEFT, SHORT_RIGHT, HIGH, LOW, etc.
  // The ball is closer to the hole than before, so shot distance = before - after
  return Math.max(0, distanceBeforeYards - distanceAfterYards);
}

function deriveLieAfterFromResult(result: ShotRecord['result'] | null | undefined): string | null {
  if (!result) return null;
  switch (result) {
    case 'fairway':
      return 'fairway';
    case 'rough':
      return 'rough';
    case 'sand':
      return 'sand';
    case 'green':
    case 'hole':
      return 'green';
    case 'penalty':
      return 'penalty';
    case 'other':
      return 'rough';
    default:
      return null;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShotTrackingComprehensive({
  holes,
  currentHoleIndex,
  onHoleComplete,
  onSaveShot,
  onExit,
  onNavigateToHole,
  initialShots = [],
  initialShotNumber = 1,
  onAutoSave,
  autoSaveInterval = 30000, // 30 seconds default
}: ShotTrackingProps) {
  const { hide, show } = useMobileNav();
  const currentHole = holes[currentHoleIndex];

  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedShotsRef = useRef<string>('');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hide mobile nav when shot tracking is active
  useEffect(() => {
    hide();
    return () => {
      // Show nav again when component unmounts
      show();
    };
  }, [hide, show]);

  if (!currentHole) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-lg text-warm-600">Invalid hole data</p>
      </div>
    );
  }

  // ============================================================================
  // STATE & REFS
  // ============================================================================

  const [currentShot, setCurrentShot] = useState(initialShotNumber);
  const [shotHistory, setShotHistory] = useState<ShotRecord[]>(initialShots);

  // Ref for auto-focusing distance input
  const distanceInputRef = useRef<HTMLInputElement>(null);
  
  // Current position state - initialize from last shot if available
  const getInitialDistance = (): number => {
    if (initialShots.length > 0) {
      const lastShot = initialShots[initialShots.length - 1];
      if (lastShot?.distanceToHoleAfter) {
        const parsed = typeof lastShot.distanceToHoleAfter === 'string' 
          ? parseFloat(lastShot.distanceToHoleAfter) 
          : lastShot.distanceToHoleAfter;
        return isNaN(parsed) ? currentHole.yardage : parsed;
      }
    }
    return currentHole.yardage;
  };
  
  const getInitialDistanceUnit = (): 'yards' | 'feet' => {
    if (initialShots.length > 0) {
      const lastShot = initialShots[initialShots.length - 1];
      return (lastShot?.distanceUnitAfter || 'yards') as 'yards' | 'feet';
    }
    return 'yards';
  };
  
  const getInitialLie = (): 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other' => {
    if (initialShots.length > 0) {
      const lastShot = initialShots[initialShots.length - 1];
      if (lastShot?.result === 'green') return 'green';
      if (lastShot?.result === 'rough') return 'rough';
      if (lastShot?.result === 'sand') return 'sand';
      if (lastShot?.result === 'fairway') return 'fairway';
    }
    return 'tee';
  };

  const [distanceToHole, setDistanceToHole] = useState(getInitialDistance());
  const [distanceUnit, setDistanceUnit] = useState<'yards' | 'feet'>(getInitialDistanceUnit());
  const [currentLie, setCurrentLie] = useState<'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other'>(getInitialLie());
  
  // Shot input state
  const [usedDriver, setUsedDriver] = useState<boolean | null>(null);
  const [resultOfShot, setResultOfShot] = useState<ShotRecord['result'] | null>(null);
  const [missDirection, setMissDirection] = useState<string | null>(null);
  const [puttBreak, setPuttBreak] = useState<ShotRecord['puttBreak'] | null>(null);
  const [puttSlope, setPuttSlope] = useState<ShotRecord['puttSlope'] | null>(null);
  // New putt classification state
  const [puttMissTags, setPuttMissTags] = useState<PuttMissTag[]>([]);
  // New approach miss classification state
  const [approachMissDirection, setApproachMissDirection] = useState<ApproachMissDirection | null>(null);
  const [approachMissLieType, setApproachMissLieType] = useState<'fairway' | 'rough' | 'bunker' | 'hazard' | undefined>(undefined);
  
  // Distance after shot (key fix: we ask for this after EVERY shot)
  const [distanceAfterShot, setDistanceAfterShot] = useState<string>('');
  const [distanceAfterUnit, setDistanceAfterUnit] = useState<'yards' | 'feet'>('yards');
  
  // Penalty modal
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyType, setPenaltyType] = useState<string | null>(null);

  // Edit shot modal
  const [editingShot, setEditingShot] = useState<ShotRecord | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    clubType: 'driver' | 'non_driver' | 'putter';
    lieBefore: 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';
    result: ShotRecord['result'];
    distanceToHoleBefore: string;
    distanceUnitBefore: 'yards' | 'feet';
    distanceToHoleAfter: string;
    distanceUnitAfter: 'yards' | 'feet';
    missDirection: string | null;
    puttBreak: ShotRecord['puttBreak'] | null;
    puttSlope: ShotRecord['puttSlope'] | null;
    isPenalty: boolean;
    penaltyType: string | null;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ============================================================================
  // RESET ON HOLE CHANGE
  // ============================================================================
  
  const hydratedHoleIndexRef = useRef<number | null>(null);
  const [selectedShotNumber, setSelectedShotNumber] = useState<number | null>(null);
  const shotHistoryRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  
  useEffect(() => {
    if (hydratedHoleIndexRef.current === currentHoleIndex) {
      return;
    }

    hydratedHoleIndexRef.current = currentHoleIndex;

    const hasSavedShots = initialShots.length > 0;
    const initialLie = hasSavedShots ? getInitialLie() : 'tee';
    const initialDistance = hasSavedShots ? getInitialDistance() : currentHole.yardage;
    const initialUnit = hasSavedShots ? getInitialDistanceUnit() : 'yards';
    const nextShotNumber = hasSavedShots ? initialShotNumber : 1;

    setCurrentShot(nextShotNumber);
    setShotHistory(hasSavedShots ? initialShots : []);
    setDistanceToHole(initialDistance);
    setDistanceUnit(initialUnit);
    setCurrentLie(initialLie);

    setUsedDriver(null);
    setResultOfShot(null);
    setMissDirection(null);
    setPuttBreak(null);
    setPuttSlope(null);
    setDistanceAfterShot('');
    setDistanceAfterUnit(initialLie === 'green' ? 'feet' : 'yards');
    setShowPenaltyModal(false);
    setPenaltyType(null);
    setPuttMissTags([]);
    setApproachMissDirection(null);
    setApproachMissLieType(undefined);
    setSelectedShotNumber(null);
  }, [currentHoleIndex, currentHole.yardage, initialShots, initialShotNumber]);

  // ============================================================================
  // AUTO-SAVE EFFECT
  // ============================================================================

  // Debounced auto-save: triggers after shots change, with configurable interval
  useEffect(() => {
    // Don't auto-save if no callback provided or no shots recorded
    if (!onAutoSave || shotHistory.length === 0) {
      return;
    }

    // Create a fingerprint of current shots to detect changes
    const currentShotsFingerprint = JSON.stringify(
      shotHistory.map(s => ({
        n: s.shotNumber,
        t: s.shotType,
        r: s.result,
        d: s.distanceToHoleAfter,
      }))
    );

    // Don't save if nothing changed
    if (currentShotsFingerprint === lastSavedShotsRef.current) {
      return;
    }

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set up debounced save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setAutoSaveStatus('saving');
        await onAutoSave(shotHistory, currentHoleIndex);
        lastSavedShotsRef.current = currentShotsFingerprint;
        setAutoSaveStatus('saved');

        // Reset to idle after 2 seconds
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveStatus('error');

        // Reset to idle after 3 seconds on error
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 3000);
      }
    }, autoSaveInterval);

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [shotHistory, currentHoleIndex, onAutoSave, autoSaveInterval]);

  // Also trigger immediate save on shot entry (debounced by 3 seconds for responsiveness)
  useEffect(() => {
    if (!onAutoSave || shotHistory.length === 0) {
      return;
    }

    // Clear any existing long-interval timeout since we're doing immediate save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Quick debounce for immediate feedback after shot entry
    const quickSaveTimeout = setTimeout(async () => {
      const currentShotsFingerprint = JSON.stringify(
        shotHistory.map(s => ({
          n: s.shotNumber,
          t: s.shotType,
          r: s.result,
          d: s.distanceToHoleAfter,
        }))
      );

      // Don't save if nothing changed
      if (currentShotsFingerprint === lastSavedShotsRef.current) {
        return;
      }

      try {
        setAutoSaveStatus('saving');
        await onAutoSave(shotHistory, currentHoleIndex);
        lastSavedShotsRef.current = currentShotsFingerprint;
        setAutoSaveStatus('saved');

        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveStatus('error');

        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 3000);
      }
    }, 3000); // 3 second debounce after each shot

    return () => {
      clearTimeout(quickSaveTimeout);
    };
  }, [shotHistory.length]); // Only trigger on shot count change

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
    } else if (resultOfShot) {
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
        (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) ||
        (isPutting && resultOfShot !== null);

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

    // Non-hole results need valid distance after
    if (resultOfShot !== 'hole') {
      const trimmed = distanceAfterShot.trim();
      if (!trimmed) return false;

      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return false;

      // Validate distance after is less than distance before (can't be further from hole)
      const beforeInYards = distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole;
      const afterInYards = distanceAfterUnit === 'feet' ? parsed / 3 : parsed;
      if (afterInYards >= beforeInYards) return false;

      // Validate reasonable distance for green shots (proximity should be < 150 feet)
      if (resultOfShot === 'green') {
        const afterInFeet = distanceAfterUnit === 'feet' ? parsed : parsed * 3;
        if (afterInFeet > 150) return false; // Can't be 150+ feet from hole and "on the green"
      }
    }

    // Putting always needs break (filled before result)
    if (isPutting) {
      if (!puttBreak) return false;
    }

    // Miss direction required for tee shot misses (left/right)
    if (isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) return false;

    // Miss direction required for approach/around-green shots that miss the green
    // This ensures we know WHERE they missed for scrambling analysis
    if (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) {
      if (!approachMissDirection) return false;
    }

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

  // Open edit modal for a specific shot
  const handleEditShot = (shot: ShotRecord) => {
    setEditingShot(shot);
    setEditFormData({
      clubType: shot.clubType,
      lieBefore: shot.lieBefore,
      result: shot.result,
      distanceToHoleBefore: String(shot.distanceToHoleBefore),
      distanceUnitBefore: shot.distanceUnitBefore,
      distanceToHoleAfter: String(shot.distanceToHoleAfter),
      distanceUnitAfter: shot.distanceUnitAfter,
      missDirection: shot.missDirection || null,
      puttBreak: shot.puttBreak || null,
      puttSlope: shot.puttSlope || null,
      isPenalty: shot.isPenalty,
      penaltyType: shot.penaltyType || null,
    });
    setEditError(null);
    setShowEditModal(true);
  };

  // Close edit modal
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingShot(null);
    setEditFormData(null);
    setEditError(null);
    setShowDeleteConfirm(false);
  };

  // Save edited shot
  const handleSaveEditedShot = async () => {
    if (!editingShot || !editFormData) return;

    setEditSaving(true);
    setEditError(null);

    try {
      // Calculate new shot distance
      const beforeInYards = editFormData.distanceUnitBefore === 'feet'
        ? parseFloat(editFormData.distanceToHoleBefore) / 3
        : parseFloat(editFormData.distanceToHoleBefore);
      const afterInYards = editFormData.distanceUnitAfter === 'feet'
        ? parseFloat(editFormData.distanceToHoleAfter) / 3
        : parseFloat(editFormData.distanceToHoleAfter);
      const newShotDistance = Math.round(calculateShotDistanceWithDirection(
        beforeInYards,
        afterInYards,
        editFormData.missDirection
      ));
      const isPuttingShot = editingShot.shotType === 'putting';
      const distanceBeforeValue = parseFloat(editFormData.distanceToHoleBefore);
      const puttDistanceFeet = isPuttingShot && Number.isFinite(distanceBeforeValue)
        ? (editFormData.distanceUnitBefore === 'yards' ? distanceBeforeValue * 3 : distanceBeforeValue)
        : undefined;

      // Create the updated shot record (for local state)
      const updatedShot: ShotRecord = {
        ...editingShot,
        clubType: editFormData.clubType,
        lieBefore: editFormData.lieBefore,
        result: editFormData.result,
        distanceToHoleBefore: parseFloat(editFormData.distanceToHoleBefore),
        distanceUnitBefore: editFormData.distanceUnitBefore,
        distanceToHoleAfter: parseFloat(editFormData.distanceToHoleAfter),
        distanceUnitAfter: editFormData.distanceUnitAfter,
        shotDistance: newShotDistance,
        missDirection: editFormData.missDirection || undefined,
        puttBreak: editFormData.puttBreak || undefined,
        puttSlope: editFormData.puttSlope || undefined,
        puttDistanceFeet: isPuttingShot ? puttDistanceFeet : editingShot.puttDistanceFeet,
        isPenalty: editFormData.isPenalty,
        penaltyType: editFormData.isPenalty ? (editFormData.penaltyType as ShotRecord['penaltyType']) : undefined,
      };

      // If shot has an ID, update in database
      if (editingShot.id) {
        const updateData: ShotUpdateData = {
          club_type: editFormData.clubType,
          lie_before: editFormData.lieBefore,
          result: editFormData.result,
          distance_to_hole_before: parseFloat(editFormData.distanceToHoleBefore),
          distance_unit_before: editFormData.distanceUnitBefore,
          distance_to_hole_after: parseFloat(editFormData.distanceToHoleAfter),
          distance_unit_after: editFormData.distanceUnitAfter,
          shot_distance: newShotDistance,
          miss_direction: editFormData.missDirection,
          putt_break: editFormData.puttBreak,
          putt_slope: editFormData.puttSlope,
          putt_distance_feet: isPuttingShot ? puttDistanceFeet ?? null : null,
          putt_made: isPuttingShot ? editFormData.result === 'hole' : null,
          lie_after: deriveLieAfterFromResult(editFormData.result),
          is_penalty: editFormData.isPenalty,
          penalty_type: editFormData.isPenalty ? editFormData.penaltyType : null,
        };

        const result = await updateShot(editingShot.id, updateData);
        if (!result.success) {
          setEditError(result.error || 'Failed to update shot');
          setEditSaving(false);
          return;
        }
      }

      // Update local state
      setShotHistory(prev =>
        prev.map(s => s.shotNumber === editingShot.shotNumber ? updatedShot : s)
      );

      // Trigger auto-save if available
      if (onAutoSave) {
        const updatedHistory = shotHistory.map(s =>
          s.shotNumber === editingShot.shotNumber ? updatedShot : s
        );
        await onAutoSave(updatedHistory, currentHoleIndex);
      }

      handleCloseEditModal();
    } catch (error) {
      console.error('Error updating shot:', error);
      setEditError('An unexpected error occurred');
    } finally {
      setEditSaving(false);
    }
  };

  // Delete a shot
  const handleDeleteShot = async () => {
    if (!editingShot) return;

    setEditSaving(true);
    setEditError(null);

    try {
      // If shot has an ID, delete from database
      if (editingShot.id) {
        const result = await deleteShot(editingShot.id);
        if (!result.success) {
          setEditError(result.error || 'Failed to delete shot');
          setEditSaving(false);
          return;
        }
      }

      // Remove from local state and resequence shot numbers
      const deletedShotNumber = editingShot.shotNumber;
      setShotHistory(prev => {
        const filtered = prev.filter(s => s.shotNumber !== deletedShotNumber);
        // Resequence shot numbers
        return filtered.map((s, idx) => ({
          ...s,
          shotNumber: idx + 1,
        }));
      });

      // Update current shot number if needed
      if (currentShot > shotHistory.length) {
        setCurrentShot(Math.max(1, shotHistory.length));
      }

      // Trigger auto-save if available
      if (onAutoSave) {
        const updatedHistory = shotHistory
          .filter(s => s.shotNumber !== deletedShotNumber)
          .map((s, idx) => ({ ...s, shotNumber: idx + 1 }));
        await onAutoSave(updatedHistory, currentHoleIndex);
      }

      handleCloseEditModal();
    } catch (error) {
      console.error('Error deleting shot:', error);
      setEditError('An unexpected error occurred');
    } finally {
      setEditSaving(false);
    }
  };

  const handleNextShot = () => {
    if (!resultOfShot) return;

    // Calculate distances
    let distanceAfter: number;
    let unitAfter: 'yards' | 'feet';

    if (resultOfShot === 'hole') {
      distanceAfter = 0;
      unitAfter = 'feet';
    } else {
      // Parse the distance, handling potential whitespace and ensuring valid number
      const parsedDistance = parseFloat(distanceAfterShot.trim());
      distanceAfter = Number.isFinite(parsedDistance) && parsedDistance >= 0 ? Math.round(parsedDistance) : 0;
      unitAfter = distanceAfterUnit;

      // Validate: distance after should be less than distance before (can't go further from hole)
      const beforeInYardsForValidation = distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole;
      const afterInYardsForValidation = unitAfter === 'feet' ? distanceAfter / 3 : distanceAfter;

      if (distanceAfter === 0 || afterInYardsForValidation >= beforeInYardsForValidation) {
        console.warn('[ShotTracking] Invalid distance after shot:', {
          entered: distanceAfterShot,
          parsed: distanceAfter,
          distanceBefore: distanceToHole,
          unitBefore: distanceUnit
        });
        // If distance after is 0 or invalid, don't record the shot
        if (distanceAfter === 0) {
          return;
        }
      }
    }
    
    // Calculate shot distance using geometry based on miss direction
    const beforeInYards = distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole;
    const afterInYards = unitAfter === 'feet' ? distanceAfter / 3 : distanceAfter;
    // Use approachMissDirection for approach/around-green shots, fallback to missDirection
    const effectiveMissDirection = isApproachOrAroundGreen ? (approachMissDirection || missDirection) : missDirection;
    const shotDistance = Math.round(calculateShotDistanceWithDirection(
      beforeInYards,
      afterInYards,
      effectiveMissDirection
    ));
    
    // Calculate unified miss direction for database storage
    // This populates the miss_direction column used by spray charts and stats
    let unifiedMissDirection: string | undefined;
    if (isPutting && puttMissTags.length > 0) {
      // For putts: use puttMissTags (e.g., 'low', 'high', 'short')
      unifiedMissDirection = puttMissTags.join('_'); // e.g., 'low_short' or just 'low'
    } else if (isApproachOrAroundGreen && approachMissDirection) {
      // For approach/around-green: use approachMissDirection (e.g., 'long_left', 'short_right')
      unifiedMissDirection = approachMissDirection;
    } else if (missDirection) {
      // For tee shots: use missDirection (e.g., 'left', 'right')
      unifiedMissDirection = missDirection;
    }

    // Create shot record
    const shotRecord: ShotRecord = {
      shotNumber: currentShot,
      shotType: shotType,
      clubType: getClubType(),
      lieBefore: currentLie,
      distanceToHoleBefore: distanceToHole,
      distanceUnitBefore: distanceUnit,
      result: resultOfShot,
      distanceToHoleAfter: distanceAfter,
      distanceUnitAfter: unitAfter,
      shotDistance: shotDistance,
      missDirection: unifiedMissDirection, // Unified miss direction for all shot types
      puttBreak: isPutting ? (puttBreak ?? undefined) : undefined,
      puttSlope: isPutting ? (puttSlope ?? undefined) : undefined,
      isPenalty: false,
      // New classification fields
      puttMissTags: isPutting && puttMissTags.length > 0 ? puttMissTags : undefined,
      puttDistanceFeet: isPutting
        ? (distanceUnit === 'yards' ? distanceToHole * 3 : distanceToHole)
        : undefined,
      approachMissDirection: (isApproachOrAroundGreen && approachMissDirection) ? approachMissDirection : undefined,
      approachMissLieType: (isApproachOrAroundGreen && approachMissLieType) ? approachMissLieType : undefined,
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
    setPuttMissTags([]); // Reset putt miss tags for next shot
    setApproachMissDirection(null); // Reset approach miss direction for next shot
    setApproachMissLieType(undefined); // Reset approach lie type for next shot
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

        // Driving distance is already calculated correctly with geometry in shotDistance
        drivingDistance = teeShot.shotDistance;
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
    const shotsTakenToGreen = shots.findIndex(s => s.result === 'green' || s.result === 'hole');
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
    setResultOfShot(result as ShotRecord['result']);
    // Clear miss direction states if not needed for the selected result
    if (result === 'hole' || result === 'green') {
      // Holing out or hitting the green means no miss to record
      setMissDirection(null);
      setApproachMissDirection(null);
      setApproachMissLieType(undefined);
      setPuttMissTags([]);
    } else if (isTeeShot) {
      // For tee shots, clear approach/putt miss states
      setApproachMissDirection(null);
      setApproachMissLieType(undefined);
      setPuttMissTags([]);
    } else if (isPutting) {
      // For putting, clear tee/approach miss states
      setMissDirection(null);
      setApproachMissDirection(null);
      setApproachMissLieType(undefined);
    } else if (isApproachOrAroundGreen) {
      // For approach shots, clear tee/putt miss states and auto-set lie type from result
      setMissDirection(null);
      setPuttMissTags([]);
      // Auto-derive approach miss lie type from shot result
      if (result === 'rough' || result === 'other') {
        setApproachMissLieType('rough');
      } else if (result === 'sand') {
        setApproachMissLieType('bunker');
      } else if (result === 'fairway') {
        setApproachMissLieType('fairway');
      }
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
    <div className="min-h-full">

      {/* Desktop Header with Exit */}
      {onExit && (
        <div className="hidden lg:flex items-center justify-between px-6 py-3 bg-warm-800 border-b border-warm-700">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-warm-300">
              Round in Progress
            </span>
            <span className="text-xs text-warm-400">
              Hole {currentHole.number} of {holes.length} • {shotHistory.length + 1} shot{shotHistory.length !== 0 ? 's' : ''}
            </span>
            {/* Auto-save indicator */}
            {onAutoSave && autoSaveStatus !== 'idle' && (
              <span className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-md transition-all ${
                autoSaveStatus === 'saving' ? 'text-amber-300 bg-amber-900/30' :
                autoSaveStatus === 'saved' ? 'text-emerald-300 bg-emerald-900/30' :
                'text-red-300 bg-red-900/30'
              }`}>
                {autoSaveStatus === 'saving' && (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                )}
                {autoSaveStatus === 'saved' && (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </>
                )}
                {autoSaveStatus === 'error' && (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Save failed
                  </>
                )}
              </span>
            )}
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium text-sm transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Save & Exit
          </button>
        </div>
      )}

      {/* SCORECARD - Dark header */}
      <div className="bg-[#1e293b] sticky top-0 z-50">
        {/* Mobile Navigation */}
        <div className="lg:hidden flex justify-between items-center px-4 py-2 border-b border-warm-600">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const element = document.getElementById(`hole-${Math.max(1, currentHole.number - 1)}`);
                element?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
              }}
              disabled={currentHoleIndex === 0}
              className="px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity uppercase tracking-wide">
              ← Prev
            </button>
            {onExit && (
              <button
                onClick={onExit}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded transition-colors uppercase tracking-wide">
                Exit
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile auto-save indicator */}
            {onAutoSave && autoSaveStatus !== 'idle' && (
              <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded transition-all ${
                autoSaveStatus === 'saving' ? 'text-amber-300 bg-amber-900/30' :
                autoSaveStatus === 'saved' ? 'text-emerald-300 bg-emerald-900/30' :
                'text-red-300 bg-red-900/30'
              }`}>
                {autoSaveStatus === 'saving' && (
                  <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {autoSaveStatus === 'saved' && (
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {autoSaveStatus === 'error' && '!'}
              </span>
            )}
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
              Hole {currentHole.number} of 18
            </span>
          </div>
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
              const canNavigate = onNavigateToHole && (hasScore || idx < currentHoleIndex);
              const getScoreColor = () => {
                if (isCurrent) return 'text-white';
                if (!hasScore) return 'text-warm-500';
                if (scoreToPar <= -2) return 'text-blue-400'; // Eagle or better
                if (scoreToPar === -1) return 'text-green-400'; // Birdie
                if (scoreToPar === 0) return 'text-white'; // Par
                if (scoreToPar === 1) return 'text-amber-400'; // Bogey
                return 'text-red-400'; // Double+
              };
              return (
                <button
                  key={hole.number}
                  id={`hole-${hole.number}`}
                  onClick={() => canNavigate && onNavigateToHole(idx)}
                  disabled={!canNavigate}
                  className={`min-w-[75px] py-3 px-2 text-center border-r border-warm-600 transition-all ${
                    isCurrent
                      ? 'bg-emerald-600'
                      : canNavigate
                        ? 'hover:bg-warm-700 cursor-pointer'
                        : 'cursor-default'
                  }`}
                >
                  <div className={`text-xs font-semibold ${isCurrent ? 'text-white' : 'text-warm-300'}`}>Hole {hole.number}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-warm-400'}`}>Par {hole.par}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-warm-500'}`}>{hole.yardage} yds</div>
                  <div className={`mt-1 text-lg font-bold ${getScoreColor()}`}>
                    {hasScore ? hole.score : '-'}
                  </div>
                  {canNavigate && !isCurrent && (
                    <div className="text-xs text-warm-400 mt-0.5">✎ Edit</div>
                  )}
                </button>
              );
            })}
            {/* OUT */}
            <div className="min-w-[75px] py-3 px-2 text-center bg-[#334155] border-r-2 border-warm-500">
              <div className="text-xs font-semibold text-amber-400">OUT</div>
              <div className="text-xs text-warm-400">Par {holes.slice(0, 9).reduce((s, h) => s + h.par, 0)}</div>
              <div className="text-xs text-warm-500">{holes.slice(0, 9).reduce((s, h) => s + h.yardage, 0)}</div>
              <div className="mt-1 text-lg font-bold text-amber-400">{front9HasScores ? front9Score : '-'}</div>
            </div>
            {/* Back 9 */}
            {holes.slice(9, 18).map((hole, idx) => {
              const actualIdx = idx + 9;
              const isCurrent = actualIdx === currentHoleIndex;
              const hasScore = hole.score !== null;
              const scoreToPar = hasScore ? (hole.score || 0) - hole.par : 0;
              const canNavigate = onNavigateToHole && (hasScore || actualIdx < currentHoleIndex);
              const getScoreColor = () => {
                if (isCurrent) return 'text-white';
                if (!hasScore) return 'text-warm-500';
                if (scoreToPar <= -2) return 'text-blue-400'; // Eagle or better
                if (scoreToPar === -1) return 'text-green-400'; // Birdie
                if (scoreToPar === 0) return 'text-white'; // Par
                if (scoreToPar === 1) return 'text-amber-400'; // Bogey
                return 'text-red-400'; // Double+
              };
              return (
                <button
                  key={hole.number}
                  id={`hole-${hole.number}`}
                  onClick={() => canNavigate && onNavigateToHole(actualIdx)}
                  disabled={!canNavigate}
                  className={`min-w-[75px] py-3 px-2 text-center border-r border-warm-600 transition-all ${
                    isCurrent
                      ? 'bg-emerald-600'
                      : canNavigate
                        ? 'hover:bg-warm-700 cursor-pointer'
                        : 'cursor-default'
                  }`}
                >
                  <div className={`text-xs font-semibold ${isCurrent ? 'text-white' : 'text-warm-300'}`}>Hole {hole.number}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-warm-400'}`}>Par {hole.par}</div>
                  <div className={`text-xs ${isCurrent ? 'text-emerald-100' : 'text-warm-500'}`}>{hole.yardage} yds</div>
                  <div className={`mt-1 text-lg font-bold ${getScoreColor()}`}>
                    {hasScore ? hole.score : '-'}
                  </div>
                  {canNavigate && !isCurrent && (
                    <div className="text-xs text-warm-400 mt-0.5">✎ Edit</div>
                  )}
                </button>
              );
            })}
            {/* IN */}
            <div className="min-w-[75px] py-3 px-2 text-center bg-[#334155] border-r-2 border-warm-500">
              <div className="text-xs font-semibold text-amber-400">IN</div>
              <div className="text-xs text-warm-400">Par {holes.slice(9, 18).reduce((s, h) => s + h.par, 0)}</div>
              <div className="text-xs text-warm-500">{holes.slice(9, 18).reduce((s, h) => s + h.yardage, 0)}</div>
              <div className="mt-1 text-lg font-bold text-amber-400">{back9HasScores ? back9Score : '-'}</div>
            </div>
            {/* TOTAL */}
            <div className="min-w-[85px] py-3 px-2 text-center bg-[#0f172a]">
              <div className="text-xs font-semibold text-white">TOTAL</div>
              <div className="text-xs text-warm-400">Par {totalPar}</div>
              <div className="text-xs text-warm-500">{holes.reduce((s, h) => s + h.yardage, 0)}</div>
              <div className="mt-1 text-lg font-bold text-white">{(front9HasScores || back9HasScores) ? front9Score + back9Score : '-'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex">
        <div className="flex-1 max-w-5xl mx-auto p-6 space-y-5">

          {/* Shot Pills - Sticky - Dynamic */}
          <div className="sticky top-[105px] lg:top-[81px] z-40 bg-white py-4 -mt-4 -mx-6 px-6 flex items-center gap-2 shadow-sm shadow-emerald-950/5 border-b border-warm-100">
            <span className="text-xs font-semibold text-warm-500 uppercase tracking-wider mr-2">Shot</span>
            {Array.from({ length: Math.max(6, currentShot + 1) }, (_, i) => i + 1).map(num => {
              const isActive = num === currentShot;
              const isCompleted = num < currentShot;
              const isFuture = num > currentShot;
              const isRecorded = num <= shotHistory.length;
              const isSelected = selectedShotNumber === num;

              return (
                <button
                  key={num}
                  type="button"
                  disabled={!isRecorded}
                  onClick={() => {
                    if (!isRecorded) return;
                    setSelectedShotNumber(num);
                    shotHistoryRefs.current[num]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Open the edit modal for the selected shot
                    const shot = shotHistory.find(s => s.shotNumber === num);
                    if (shot) {
                      handleEditShot(shot);
                    }
                  }}
                  className={`flex-1 min-w-[44px] h-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all
                    ${isActive ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-950/5' : ''}
                    ${isCompleted ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : ''}
                    ${isFuture ? 'bg-warm-50 text-warm-400 ring-1 ring-warm-200' : ''}
                    ${isSelected ? 'ring-2 ring-emerald-500' : ''}
                    ${isRecorded ? 'cursor-pointer' : 'cursor-default'}`}
                  aria-label={isRecorded ? `View shot ${num}` : `Shot ${num} not recorded`}
                >
                  {num}
                </button>
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
                <span className="flex items-center gap-2 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full border border-white/60"></span>
                  Tee
                </span>
                <span className="font-bold text-sm">{displayDistance} {displayUnit} left</span>
                <span className="flex items-center gap-2 font-medium">
                  Hole
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
              {/* Club Selection (Tee Shot Par 4/5) - Segmented Control */}
              {isTeeShot && currentHole.par !== 3 && (
                <div className="relative glass-standard rounded-2xl overflow-hidden p-6 transition-all duration-300">
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                    }}
                  />
                  <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-4">Club Off Tee</p>
                  <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full">
                    <button onClick={() => setUsedDriver(true)}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                        usedDriver === true
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Driver
                    </button>
                    <button onClick={() => setUsedDriver(false)}
                      className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all ${
                        usedDriver === false
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Non-Driver
                    </button>
                  </div>
                </div>
              )}

              {/* Putt Details (FIRST - when putting) */}
              {isPutting && (
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-6 border-2 border-emerald-200 shadow-lg shadow-emerald-950/5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-bold text-emerald-900 uppercase tracking-wide">Putting Details</p>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">Fill First</span>
                  </div>
                  <p className="text-xs text-warm-600 mb-4">Describe your putt before selecting the result</p>
                  <div className="mb-6">
                    <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">Break</p>
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-emerald-200">
                      {[{v: 'left_to_right', l: 'L → R'}, {v: 'straight', l: 'Straight'}, {v: 'right_to_left', l: 'R → L'}, {v: 'multiple', l: 'Multiple'}].map(b => (
                        <button key={b.v} onClick={() => setPuttBreak(b.v as ShotRecord['puttBreak'])}
                          className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
                            puttBreak === b.v
                              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                              : 'text-warm-600 hover:text-warm-900'}`}>
                          {b.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">Slope</p>
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-emerald-200">
                      {[{v: 'uphill', l: 'Uphill'}, {v: 'level', l: 'Level'}, {v: 'downhill', l: 'Downhill'}, {v: 'severe', l: 'Severe'}].map(s => (
                        <button key={s.v} onClick={() => setPuttSlope(s.v as ShotRecord['puttSlope'])}
                          className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
                            puttSlope === s.v
                              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                              : 'text-warm-600 hover:text-warm-900'}`}>
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Shot Result - Context-Aware */}
              <div className="relative glass-standard rounded-2xl overflow-hidden p-6 transition-all duration-300">
                <div
                  className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                  }}
                />
                <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-4">
                  {isPutting ? 'Putt Result' : 'Shot Result'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(() => {
                    const formatLieLabel = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
                    let options: string[];
                    if (isPutting) {
                      options = ['hole', 'green'];
                    } else if (isTeeShot && currentHole.par !== 3) {
                      options = ['fairway', 'rough', 'sand', 'other'];
                    } else if (isTeeShot && currentHole.par === 3) {
                      options = ['green', 'rough', 'sand', 'other'];
                    } else {
                      options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                    }
                    return options.map(r => (
                      <button key={r} onClick={() => handleResultSelect(r)}
                        className={`py-3 rounded-lg font-semibold text-sm transition-all ${
                          resultOfShot === r
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                            : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-emerald-300 hover:bg-warm-100'}`}>
                        {formatLieLabel(r)}
                        {r === 'green' && (
                          <span className={`block text-xs font-normal leading-tight ${
                            resultOfShot === r ? 'text-emerald-100' : 'text-warm-400'
                          }`}>(putting surface, not fringe)</span>
                        )}
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {/* Miss Direction */}
              {((isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
                (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) ||
                (isPutting && resultOfShot && resultOfShot !== 'hole')) && (
                <div className="relative glass-standard rounded-2xl overflow-hidden p-6 transition-all duration-300">
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                    }}
                  />
                  <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-4">Miss Direction</p>
                  {isTeeShot && (
                    <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full">
                      {['left', 'right'].map(d => (
                        <button key={d} onClick={() => setMissDirection(d)}
                          className={`flex-1 py-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                            missDirection === d
                              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                              : 'text-warm-600 hover:text-warm-900'}`}>
                          {d === 'left' ? '←' : ''} {d.charAt(0).toUpperCase() + d.slice(1)} {d === 'right' ? '→' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                  {isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot) && (
                    <ApproachMissSelector
                      selectedDirection={approachMissDirection}
                      onDirectionChange={setApproachMissDirection}
                    />
                  )}
                  {isPutting && resultOfShot && resultOfShot !== 'hole' && (
                    <PuttMissTagSelector
                      selectedTags={puttMissTags}
                      onTagsChange={setPuttMissTags}
                    />
                  )}
                </div>
              )}

              {/* Distance Remaining - Final Step (if not holed) */}
              {resultOfShot && resultOfShot !== 'hole' && (
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-6 border-2 border-emerald-200 shadow-lg shadow-emerald-950/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-emerald-900 uppercase tracking-wide">
                      {isPutting ? 'Leave Distance' : 'Distance Remaining'}
                    </p>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">Required</span>
                  </div>
                  <p className="text-xs text-warm-600 mb-4">
                    {isPutting
                      ? 'Enter how many feet were left after the putt'
                      : 'Enter the distance to the hole after this shot'}
                  </p>
                  <div className="space-y-3 mb-3">
                    <input
                      ref={distanceInputRef}
                      type="number"
                      inputMode="numeric"
                      value={distanceAfterShot}
                      onChange={(e) => setDistanceAfterShot(e.target.value)}
                      placeholder="Enter distance"
                      className="w-full h-14 px-5 rounded-xl text-3xl font-bold text-emerald-900 text-center bg-white border-2 border-emerald-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 focus:outline-none transition-all placeholder:text-warm-300"
                    />
                    {/* Quick-select buttons for common putting distances */}
                    {isPutting && (
                      <div className="grid grid-cols-6 gap-2">
                        {[5, 10, 15, 20, 30, 40].map((ft) => (
                          <button
                            key={ft}
                            type="button"
                            onClick={() => {
                              setDistanceAfterShot(String(ft));
                              setDistanceAfterUnit('feet');
                            }}
                            className={`py-2 rounded-lg text-xs font-bold transition-all ${
                              distanceAfterShot === String(ft) && distanceAfterUnit === 'feet'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                            }`}
                          >
                            {ft}ft
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="inline-flex bg-white rounded-lg p-1 border-2 border-emerald-300 w-full">
                      <button
                        onClick={() => setDistanceAfterUnit('yards')}
                        className={`flex-1 py-2.5 rounded-md font-bold text-sm uppercase tracking-wide transition-all ${
                          distanceAfterUnit === 'yards'
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                            : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50'
                        }`}
                      >
                        Yards
                      </button>
                      <button
                        onClick={() => setDistanceAfterUnit('feet')}
                        className={`flex-1 py-2.5 rounded-md font-bold text-sm uppercase tracking-wide transition-all ${
                          distanceAfterUnit === 'feet'
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                            : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50'
                        }`}
                      >
                        Feet
                      </button>
                    </div>
                  </div>
                  {distanceAfterShot && (
                    <div className="flex items-center justify-between bg-white/60 rounded-lg px-4 py-2.5 border border-emerald-200">
                      <span className="text-xs font-semibold text-warm-600 uppercase tracking-wide">Shot Distance</span>
                      <span className="text-lg font-bold text-emerald-700">
                        ~{Math.round(calculateShotDistanceWithDirection(
                          distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole,
                          distanceAfterUnit === 'feet' ? parseInt(distanceAfterShot) / 3 : parseInt(distanceAfterShot),
                          isApproachOrAroundGreen ? (approachMissDirection || missDirection) : missDirection
                        ))} yards
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Next Shot Button */}
              <button
                onClick={handleNextShot}
                disabled={!isReadyForNextShot()}
                aria-label={resultOfShot === 'hole' ? `Complete hole with score ${currentShot}` : 'Record next shot'}
                className={`w-full py-4 rounded-lg font-bold text-base transition-all ${
                  isReadyForNextShot()
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                    : 'bg-warm-100 text-warm-400 cursor-not-allowed ring-1 ring-warm-200'}`}>
                {resultOfShot === 'hole' ? `Complete Hole - Score: ${currentShot}` : 'Next Shot →'}
              </button>

              {/* Penalty Button */}
              <button
                onClick={handleAddPenalty}
                aria-label="Add penalty stroke"
                className="w-full py-3 rounded-lg font-semibold text-sm text-red-600 bg-red-50 ring-1 ring-red-200 hover:bg-red-100 hover:ring-red-300 transition-all">
                Add Penalty Stroke
              </button>
          </div>
        </div>

        {/* Right Sidebar - Overhead Course View */}
        <div className="hidden xl:block w-44 p-4">
          <div className="relative sticky top-32 glass-standard rounded-2xl overflow-hidden p-4 transition-all duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-warm-400 uppercase tracking-wider">Hole {currentHole.number}</p>
                <p className="text-lg font-bold text-warm-800">Par {currentHole.par}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-warm-400 uppercase tracking-wider">Shot</p>
                <p className="text-lg font-bold text-emerald-600">{currentShot}</p>
              </div>
            </div>

            {/* Overhead Course View - Premium Minimalist Design */}
            <div className="relative rounded-xl h-56 overflow-hidden shadow-inner">
              {/* Base gradient - deep forest tones */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(180deg, #1a3a2f 0%, #234338 50%, #1e3a30 100%)',
                }}
              />

              {/* Subtle texture overlay */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.03) 0%, transparent 50%),
                                    radial-gradient(circle at 80% 70%, rgba(255,255,255,0.02) 0%, transparent 40%)`,
                }}
              />

              {/* Fairway - refined center strip with gradient */}
              <div
                className="absolute top-10 bottom-10 left-1/2 -translate-x-1/2 w-10 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #2d5a48 0%, #3d7a60 50%, #2d5a48 100%)',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)',
                }}
              />

              {/* Green at top - subtle gradient with fringe */}
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-9 rounded-[50%]"
                style={{
                  background: 'radial-gradient(ellipse at center, #4a9970 0%, #3d7a60 70%, #2d5a48 100%)',
                  boxShadow: '0 0 8px rgba(74,153,112,0.3)',
                }}
              />

              {/* Hole/Pin - minimalist premium style */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
                {/* Flag pole - thin elegant line */}
                <div
                  className="w-px h-5 rounded-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.5) 100%)',
                  }}
                />
                {/* Flag - small triangle */}
                <div
                  className="absolute top-0 left-0.5 w-0 h-0"
                  style={{
                    borderTop: '3px solid transparent',
                    borderBottom: '3px solid transparent',
                    borderLeft: '5px solid rgba(220,38,38,0.9)',
                  }}
                />
                {/* Hole - subtle dark circle */}
                <div
                  className="w-1.5 h-1.5 rounded-full -mt-0.5"
                  style={{
                    background: 'radial-gradient(circle at 30% 30%, #1a1a1a 0%, #000 100%)',
                  }}
                />
              </div>

              {/* Tee box - subtle marker */}
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-6 h-2.5 rounded-sm"
                style={{
                  background: 'linear-gradient(180deg, #8b7355 0%, #6b5a45 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              />

              {/* Ball Position */}
              {(() => {
                const yPercent = 100 - progressPercent;
                const visualY = 14 + (yPercent * 0.72);

                let xOffset = 0;
                const lastMiss = missDirection?.toLowerCase();
                const isOffFairway = ['rough', 'sand', 'other'].includes(currentLie);

                if (isOffFairway && lastMiss) {
                  if (lastMiss.includes('left')) xOffset = -18;
                  else if (lastMiss.includes('right')) xOffset = 18;
                }

                // Premium subtle lie indicators
                const defaultStyle = { ring: 'rgba(74,153,112,0.8)', glow: 'rgba(74,153,112,0.4)' };
                const lieStyles: Record<string, { ring: string; glow: string }> = {
                  tee: { ring: 'rgba(139,115,85,0.8)', glow: 'rgba(139,115,85,0.3)' },
                  fairway: defaultStyle,
                  rough: { ring: 'rgba(45,90,72,0.8)', glow: 'rgba(45,90,72,0.3)' },
                  sand: { ring: 'rgba(194,178,128,0.9)', glow: 'rgba(194,178,128,0.4)' },
                  green: { ring: 'rgba(74,153,112,0.9)', glow: 'rgba(74,153,112,0.5)' },
                  other: { ring: 'rgba(120,113,108,0.8)', glow: 'rgba(120,113,108,0.3)' },
                };
                const style = lieStyles[currentLie] ?? defaultStyle;

                return (
                  <div
                    className="absolute z-30 transition-all duration-500 ease-out"
                    style={{
                      top: `${visualY}%`,
                      left: `calc(50% + ${xOffset}px)`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {/* Outer glow */}
                    <div
                      className="absolute -inset-1 rounded-full blur-sm"
                      style={{ background: style.glow }}
                    />
                    {/* Ball */}
                    <div
                      className="relative w-3 h-3 rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #e8e8e8 50%, #d0d0d0 100%)',
                        boxShadow: `0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 1.5px ${style.ring}`,
                      }}
                    />
                  </div>
                );
              })()}

              {/* Distance markers - refined typography */}
              <div className="absolute right-1.5 top-14 bottom-14 flex flex-col justify-between">
                <span className="text-[7px] font-medium text-white/40 tracking-tight">0</span>
                <span className="text-[7px] font-medium text-white/40 tracking-tight">{Math.round(currentHole.yardage / 2)}</span>
                <span className="text-[7px] font-medium text-white/40 tracking-tight">{currentHole.yardage}</span>
              </div>

              {/* Subtle vignette effect */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.15) 100%)',
                }}
              />
            </div>

            {/* Current Status */}
            <div className="mt-3 p-3 bg-warm-100 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-warm-400 uppercase">Lie</p>
                  <p className="text-sm font-bold text-warm-700 capitalize">{currentLie}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-warm-400 uppercase">To Hole</p>
                  <p className="text-sm font-bold text-emerald-600">{displayDistance} {displayUnit === 'yards' ? 'yds' : 'ft'}</p>
                </div>
              </div>
            </div>

            {/* Shot History */}
            {shotHistory.length > 0 && (
              <div className="mt-3 pt-3 border-t border-warm-200">
                <p className="text-[9px] font-bold text-warm-400 uppercase tracking-wider mb-2">Shots</p>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {shotHistory.map((shot, idx) => {
                    const isSelected = selectedShotNumber === shot.shotNumber;
                    return (
                      <button
                        key={idx}
                        ref={(node) => { shotHistoryRefs.current[shot.shotNumber] = node; }}
                        onClick={() => {
                          setSelectedShotNumber(shot.shotNumber);
                          handleEditShot(shot);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-all ${
                          isSelected
                            ? 'bg-emerald-100 ring-1 ring-emerald-400'
                            : shot.isPenalty
                              ? 'bg-red-50 hover:bg-red-100'
                              : 'bg-warm-50 hover:bg-warm-100'
                        }`}
                      >
                        <span className={`font-bold ${shot.isPenalty ? 'text-red-600' : 'text-warm-600'}`}>
                          {shot.isPenalty ? 'P' : shot.shotNumber}
                        </span>
                        <span className={`font-bold ${shot.isPenalty ? 'text-red-500' : 'text-emerald-600'}`}>
                          {shot.isPenalty ? '+1' : `${shot.shotDistance}y`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Penalty Modal */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl shadow-warm-950/10 ring-1 ring-warm-200">
            <h2 className="text-lg font-bold text-warm-900 mb-6">Add Penalty Stroke</h2>
            <div className="space-y-2 mb-6">
              {[{v: 'ob', l: 'Out of Bounds'}, {v: 'water', l: 'Water Hazard'}, {v: 'unplayable', l: 'Unplayable Lie'}, {v: 'lost', l: 'Lost Ball'}].map(p => (
                <button key={p.v} onClick={() => setPenaltyType(p.v)}
                  className={`w-full py-3 px-4 rounded-lg font-semibold text-sm text-left transition-all ${
                    penaltyType === p.v
                      ? 'bg-red-600 text-white shadow-sm shadow-red-950/10 ring-1 ring-red-700'
                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-red-300 hover:bg-red-50'}`}>
                  {p.l}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowPenaltyModal(false); setPenaltyType(null); }}
                className="flex-1 py-3 rounded-lg font-semibold text-sm text-warm-600 bg-warm-100 ring-1 ring-warm-200 hover:bg-warm-200 hover:ring-warm-300 transition-all">
                Cancel
              </button>
              <button onClick={confirmPenalty} disabled={!penaltyType}
                className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                  penaltyType
                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-950/10 ring-1 ring-red-700'
                    : 'bg-warm-100 text-warm-400 cursor-not-allowed ring-1 ring-warm-200'}`}>
                Add +1 Stroke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Shot Modal */}
      {showEditModal && editingShot && editFormData && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl shadow-warm-950/10 ring-1 ring-warm-200">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-warm-200 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-warm-900">
                  Edit Shot {editingShot.shotNumber}
                </h2>
                <button
                  onClick={handleCloseEditModal}
                  className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {editError && (
                <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-5">
              {/* Delete Confirmation */}
              {showDeleteConfirm ? (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-900">Are you sure you want to delete this shot?</p>
                    <p className="text-xs text-red-700 mt-1">This action cannot be undone. Shot numbers will be resequenced.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={editSaving}
                      className="flex-1 py-3 rounded-lg font-semibold text-sm text-warm-600 bg-warm-100 ring-1 ring-warm-200 hover:bg-warm-200 hover:ring-warm-300 transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteShot}
                      disabled={editSaving}
                      className="flex-1 py-3 rounded-lg font-semibold text-sm bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-950/10 ring-1 ring-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {editSaving ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Deleting...
                        </>
                      ) : (
                        'Delete Shot'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Shot Type Info */}
                  <div className="flex items-center gap-3 p-3 bg-warm-50 rounded-lg ring-1 ring-warm-200">
                    <span className="text-xs font-bold text-warm-500 uppercase tracking-wide">Type:</span>
                    <span className="text-sm font-semibold text-warm-700 capitalize">
                      {editingShot.isPenalty ? 'Penalty' : editingShot.shotType.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Penalty Shot Edit */}
                  {editFormData.isPenalty ? (
                    <div>
                      <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Penalty Type</p>
                      <div className="space-y-2">
                        {[{v: 'ob', l: 'Out of Bounds'}, {v: 'water', l: 'Water Hazard'}, {v: 'unplayable', l: 'Unplayable Lie'}, {v: 'lost', l: 'Lost Ball'}].map(p => (
                          <button
                            key={p.v}
                            onClick={() => setEditFormData(prev => prev ? {...prev, penaltyType: p.v} : null)}
                            className={`w-full py-3 px-4 rounded-lg font-semibold text-sm text-left transition-all ${
                              editFormData.penaltyType === p.v
                                ? 'bg-red-600 text-white shadow-sm shadow-red-950/10 ring-1 ring-red-700'
                                : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-red-300 hover:bg-red-50'
                            }`}
                          >
                            {p.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Club Type (for non-penalty shots) */}
                      {editingShot.shotType === 'tee' && (
                        <div>
                          <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Club</p>
                          <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full">
                            <button
                              onClick={() => setEditFormData(prev => prev ? {...prev, clubType: 'driver'} : null)}
                              className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
                                editFormData.clubType === 'driver'
                                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                                  : 'text-warm-600 hover:text-warm-900'
                              }`}
                            >
                              Driver
                            </button>
                            <button
                              onClick={() => setEditFormData(prev => prev ? {...prev, clubType: 'non_driver'} : null)}
                              className={`flex-1 py-2.5 rounded-md font-semibold text-sm transition-all ${
                                editFormData.clubType === 'non_driver'
                                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                                  : 'text-warm-600 hover:text-warm-900'
                              }`}
                            >
                              Non-Driver
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Lie Before */}
                      <div>
                        <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Lie Before</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(['tee', 'fairway', 'rough', 'sand', 'green', 'other'] as const).map(lie => {
                            const lieLabel = lie.charAt(0).toUpperCase() + lie.slice(1);
                            return (
                            <button
                              key={lie}
                              onClick={() => setEditFormData(prev => prev ? {...prev, lieBefore: lie} : null)}
                              className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                                editFormData.lieBefore === lie
                                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                                  : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-emerald-300'
                              }`}
                            >
                              {lieLabel}
                              {lie === 'green' && (
                                <span className={`block text-xs font-normal leading-tight ${editFormData.lieBefore === 'green' ? 'text-emerald-100' : 'text-warm-400'}`}>(putting surface)</span>
                              )}
                            </button>);
                          })}
                        </div>
                      </div>

                      {/* Distance Before */}
                      <div>
                        <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Distance Before</p>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={editFormData.distanceToHoleBefore}
                            onChange={(e) => setEditFormData(prev => prev ? {...prev, distanceToHoleBefore: e.target.value} : null)}
                            className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition-all"
                          />
                          <div className="inline-flex bg-warm-100 rounded-lg p-1">
                            <button
                              onClick={() => setEditFormData(prev => prev ? {...prev, distanceUnitBefore: 'yards'} : null)}
                              className={`px-3 py-2 rounded-md font-semibold text-xs uppercase transition-all ${
                                editFormData.distanceUnitBefore === 'yards'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-warm-600'
                              }`}
                            >
                              Yds
                            </button>
                            <button
                              onClick={() => setEditFormData(prev => prev ? {...prev, distanceUnitBefore: 'feet'} : null)}
                              className={`px-3 py-2 rounded-md font-semibold text-xs uppercase transition-all ${
                                editFormData.distanceUnitBefore === 'feet'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-warm-600'
                              }`}
                            >
                              Ft
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Result */}
                      <div>
                        <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Result</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(['fairway', 'rough', 'sand', 'green', 'hole', 'other'] as const).map(r => {
                            const resultLabel = r.charAt(0).toUpperCase() + r.slice(1);
                            return (
                            <button
                              key={r}
                              onClick={() => setEditFormData(prev => prev ? {...prev, result: r} : null)}
                              className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                                editFormData.result === r
                                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                                  : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-emerald-300'
                              }`}
                            >
                              {resultLabel}
                              {r === 'green' && (
                                <span className={`block text-xs font-normal leading-tight ${editFormData.result === 'green' ? 'text-emerald-100' : 'text-warm-400'}`}>(putting surface, not fringe)</span>
                              )}
                            </button>);
                          })}
                        </div>
                      </div>

                      {/* Distance After (if not holed) */}
                      {editFormData.result !== 'hole' && (
                        <div>
                          <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Distance After</p>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={editFormData.distanceToHoleAfter}
                              onChange={(e) => setEditFormData(prev => prev ? {...prev, distanceToHoleAfter: e.target.value} : null)}
                              className="flex-1 h-12 px-4 rounded-lg text-lg font-semibold text-warm-900 text-center bg-white border-2 border-warm-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition-all"
                            />
                            <div className="inline-flex bg-warm-100 rounded-lg p-1">
                              <button
                                onClick={() => setEditFormData(prev => prev ? {...prev, distanceUnitAfter: 'yards'} : null)}
                                className={`px-3 py-2 rounded-md font-semibold text-xs uppercase transition-all ${
                                  editFormData.distanceUnitAfter === 'yards'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-warm-600'
                                }`}
                              >
                                Yds
                              </button>
                              <button
                                onClick={() => setEditFormData(prev => prev ? {...prev, distanceUnitAfter: 'feet'} : null)}
                                className={`px-3 py-2 rounded-md font-semibold text-xs uppercase transition-all ${
                                  editFormData.distanceUnitAfter === 'feet'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-warm-600'
                                }`}
                              >
                                Ft
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Miss Direction (for tee shots and approach misses) */}
                      {(editingShot.shotType === 'tee' || editingShot.shotType === 'approach' || editingShot.shotType === 'around_green') &&
                       editFormData.result !== 'hole' && editFormData.result !== 'green' && (
                        <div>
                          <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Miss Direction</p>
                          <div className="grid grid-cols-2 gap-2">
                            {['left', 'right', 'short', 'long'].map(dir => (
                              <button
                                key={dir}
                                onClick={() => setEditFormData(prev => prev ? {...prev, missDirection: prev.missDirection === dir ? null : dir} : null)}
                                className={`py-2.5 rounded-lg font-semibold text-sm capitalize transition-all ${
                                  editFormData.missDirection === dir
                                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                                    : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-emerald-300'
                                }`}
                              >
                                {dir}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Putt Details (for putting shots) */}
                      {editingShot.shotType === 'putting' && (
                        <>
                          <div>
                            <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Putt Break</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{v: 'left_to_right', l: 'L to R'}, {v: 'straight', l: 'Straight'}, {v: 'right_to_left', l: 'R to L'}, {v: 'multiple', l: 'Multiple'}].map(b => (
                                <button
                                  key={b.v}
                                  onClick={() => setEditFormData(prev => prev ? {...prev, puttBreak: b.v as ShotRecord['puttBreak']} : null)}
                                  className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                                    editFormData.puttBreak === b.v
                                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-emerald-300'
                                  }`}
                                >
                                  {b.l}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-warm-600 uppercase tracking-wider mb-3">Putt Slope</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{v: 'uphill', l: 'Uphill'}, {v: 'level', l: 'Level'}, {v: 'downhill', l: 'Downhill'}, {v: 'severe', l: 'Severe'}].map(s => (
                                <button
                                  key={s.v}
                                  onClick={() => setEditFormData(prev => prev ? {...prev, puttSlope: s.v as ShotRecord['puttSlope']} : null)}
                                  className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                                    editFormData.puttSlope === s.v
                                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-emerald-300'
                                  }`}
                                >
                                  {s.l}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Calculated Shot Distance */}
                      {editFormData.distanceToHoleBefore && editFormData.distanceToHoleAfter && (
                        <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-4 py-3 ring-1 ring-emerald-200">
                          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Calculated Distance</span>
                          <span className="text-lg font-bold text-emerald-700">
                            ~{Math.round(calculateShotDistanceWithDirection(
                              editFormData.distanceUnitBefore === 'feet' ? parseFloat(editFormData.distanceToHoleBefore) / 3 : parseFloat(editFormData.distanceToHoleBefore),
                              editFormData.distanceUnitAfter === 'feet' ? parseFloat(editFormData.distanceToHoleAfter) / 3 : parseFloat(editFormData.distanceToHoleAfter),
                              editFormData.missDirection
                            ))} yds
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            {!showDeleteConfirm && (
              <div className="sticky bottom-0 bg-white border-t border-warm-200 px-6 py-4 rounded-b-2xl">
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={editSaving}
                    className="px-4 py-3 rounded-lg font-semibold text-sm text-red-600 bg-red-50 ring-1 ring-red-200 hover:bg-red-100 hover:ring-red-300 transition-all disabled:opacity-50"
                    aria-label="Delete shot"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <button
                    onClick={handleCloseEditModal}
                    disabled={editSaving}
                    className="flex-1 py-3 rounded-lg font-semibold text-sm text-warm-600 bg-warm-100 ring-1 ring-warm-200 hover:bg-warm-200 hover:ring-warm-300 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEditedShot}
                    disabled={editSaving}
                    className="flex-1 py-3 rounded-lg font-semibold text-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {editSaving ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
