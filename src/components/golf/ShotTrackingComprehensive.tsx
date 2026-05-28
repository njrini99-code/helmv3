'use client';

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { PuttMissTagSelector } from './putt-miss-tag-selector';
import { ApproachMissSelector } from './approach-miss-selector';
import { calculateShotDistanceWithDirection, calculateHoleStats } from '@/lib/utils/shot-helpers';
import { triggerHaptic } from '@/lib/utils/capacitor';
// Re-export for any existing callers
export { calculateHoleStats } from '@/lib/utils/shot-helpers';

import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';

import { useShotStateMachine, type EditFormData } from '@/hooks/golf/use-shot-state-machine';
import { usePenaltyHandler } from '@/hooks/golf/use-penalty-handler';
import { useUndoManager } from '@/hooks/golf/use-undo-manager';
import { useEditShotModal } from '@/hooks/golf/use-edit-shot-modal';
import { Button, IconButton } from '@/components/ui/button';

// Local alias for the Hole interface used by this component's props
type Hole = RoundHole;

interface ShotTrackingProps {
  holes: Hole[];
  currentHoleIndex: number;
  onHoleComplete: (holeIndex: number, stats: HoleStats) => void;
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats) => void;
  onSaveShot?: (shot: ShotRecord) => void;
  onExit?: () => void;
  onNavigateToHole?: (holeIndex: number) => void;
  initialShots?: ShotRecord[];
  initialShotNumber?: number;
  // Auto-save props
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  autoSaveInterval?: number; // in milliseconds, default 30000 (30s)
  /** When true, suppresses all auto-save scheduling (e.g. after round submission) */
  autoSaveDisabled?: boolean;
}

interface ScorecardHeaderProps {
  holes: Hole[];
  currentHoleIndex: number;
  currentHoleNumber: number;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onExit?: () => void;
  onNavigateToHole?: (holeIndex: number) => void;
}

interface ShotPillsBarProps {
  currentShot: number;
  recordedShotCount: number;
  selectedShotNumber: number | null;
  onSelectShot: (shotNumber: number) => void;
}

function scrollElementIntoView(element: Element | null) {
  element?.scrollIntoView({
    behavior: 'auto',
    block: 'nearest',
    inline: 'center',
  });
}

function scrollHoleIntoView(holeNumber: number) {
  scrollElementIntoView(document.getElementById(`hole-${holeNumber}`));
}

const ScorecardHeader = memo(function ScorecardHeader({
  holes,
  currentHoleIndex,
  currentHoleNumber,
  autoSaveStatus,
  onExit,
  onNavigateToHole,
}: ScorecardHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);

  const updateCSSProperty = useCallback(() => {
    if (headerRef.current) {
      const height = headerRef.current.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--scorecard-height', `${height}px`);
    }
  }, []);

  useEffect(() => {
    updateCSSProperty();
    window.addEventListener('resize', updateCSSProperty);
    return () => window.removeEventListener('resize', updateCSSProperty);
  }, [updateCSSProperty]);

  const is9Hole = holes.length <= 9;
  const front9 = holes.slice(0, 9);
  const back9 = is9Hole ? [] : holes.slice(9);
  const front9Score = front9.reduce((sum, hole) => sum + (hole.score || 0), 0);
  const back9Score = back9.reduce((sum, hole) => sum + (hole.score || 0), 0);
  const front9HasScores = front9.some((hole) => hole.score !== null);
  const back9HasScores = back9.some((hole) => hole.score !== null);
  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);

  const renderHoleButton = (hole: Hole, holeIndex: number) => {
    const isCurrent = holeIndex === currentHoleIndex;
    const hasScore = hole.score !== null;
    const scoreToPar = hasScore ? (hole.score || 0) - hole.par : 0;
    const canNavigate = onNavigateToHole && (hasScore || holeIndex < currentHoleIndex);

    const scoreColor = (() => {
      if (isCurrent) return 'text-white';
      if (!hasScore) return 'text-warm-500';
      if (scoreToPar <= -2) return 'text-blue-400';
      if (scoreToPar === -1) return 'text-primary-400';
      if (scoreToPar === 0) return 'text-white';
      if (scoreToPar === 1) return 'text-amber-400';
      return 'text-red-400';
    })();

    return (
      <Button variant="primary"
        key={hole.number}
        id={`hole-${hole.number}`}
        aria-label={`Hole ${hole.number}, Par ${hole.par}, ${hole.yardage} yards${hasScore ? `, Score: ${hole.score}` : ', not yet played'}${isCurrent ? ' (current hole)' : ''}${canNavigate && !isCurrent ? ', click to edit' : ''}`}
        onClick={() => canNavigate && onNavigateToHole?.(holeIndex)}
        disabled={!canNavigate}
        className={`min-w-[75px] py-3 px-2 text-center border-r border-warm-700 transition-colors ${
          isCurrent
            ? 'bg-primary-600'
            : hasScore
              ? canNavigate ? 'bg-warm-800/50 hover:bg-warm-800 cursor-pointer' : 'bg-warm-800/50 cursor-default'
              : canNavigate
                ? 'hover:bg-warm-800 cursor-pointer'
                : 'cursor-default'
        }`}
      >
        <div className={`text-xs font-medium ${isCurrent ? 'text-white' : 'text-warm-300'}`}>Hole {hole.number}</div>
        <div className={`text-xs ${isCurrent ? 'text-primary-100' : 'text-warm-400'}`}>Par {hole.par}</div>
        <div className={`text-xs ${isCurrent ? 'text-primary-100' : 'text-warm-500'}`}>{hole.yardage} yds</div>
        <div className={`mt-1 text-body-lg font-medium tracking-[-0.005em] ${scoreColor}`}>
          {hasScore ? hole.score : '-'}
        </div>
        {hasScore && !isCurrent && (
          <div className="text-eyebrow text-primary-400 mt-0.5">
            <svg className="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {canNavigate && !isCurrent && !hasScore && (
          <div className="text-xs text-warm-400 mt-0.5">✎ Edit</div>
        )}
      </Button>
    );
  };

  return (
    <div ref={headerRef} className="bg-warm-900 sticky top-0 z-50">
      <div className="lg:hidden flex justify-between items-center px-4 py-2 border-b border-warm-700">
        <div className="flex items-center gap-2">
          <Button variant="ghost"
            onClick={() => scrollHoleIntoView(Math.max(1, currentHoleNumber - 1))}
            disabled={currentHoleIndex === 0}
            className="px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity uppercase tracking-wide"
          >
            ← Prev
          </Button>
          {onExit && (
            <Button variant="ghost"
              onClick={onExit}
              className="px-3 py-1.5 text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white rounded transition-colors uppercase tracking-wide"
            >
              Exit
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {autoSaveStatus !== 'idle' && (
            <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded transition-colors ${
              autoSaveStatus === 'saving' ? 'text-amber-300 bg-amber-900/30' :
              autoSaveStatus === 'saved' ? 'text-primary-300 bg-primary-900/30' :
              'text-red-300 bg-red-900/30'
            }`}>
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {autoSaveStatus === 'error' && '!'}
            </span>
          )}
          <span className="text-eyebrow font-medium text-primary-400 uppercase tracking-wide">
            Hole {currentHoleNumber} of {holes.length}
          </span>
        </div>
        <Button variant="ghost"
          onClick={() => scrollHoleIntoView(Math.min(holes.length, currentHoleNumber + 1))}
          disabled={currentHoleIndex === holes.length - 1}
          className="px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity uppercase tracking-wide"
        >
          Next →
        </Button>
      </div>

      <div className="overflow-x-auto overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)' }}>
        <div className="inline-flex min-w-full">
          {front9.map((hole, index) => renderHoleButton(hole, index))}
          <div className="min-w-[75px] py-3 px-2 text-center bg-warm-800 border-r-2 border-warm-500">
            <div className="text-xs font-medium text-amber-400">{is9Hole ? 'TOTAL' : 'OUT'}</div>
            <div className="text-xs text-warm-400">Par {front9.reduce((sum, hole) => sum + hole.par, 0)}</div>
            <div className="text-xs text-warm-500">{front9.reduce((sum, hole) => sum + hole.yardage, 0)}</div>
            <div className="mt-1 text-body-lg font-medium tracking-[-0.005em] text-amber-400">{front9HasScores ? front9Score : '-'}</div>
          </div>
          {!is9Hole && back9.map((hole, index) => renderHoleButton(hole, index + 9))}
          {!is9Hole && (
            <div className="min-w-[75px] py-3 px-2 text-center bg-warm-800 border-r-2 border-warm-500">
              <div className="text-xs font-medium text-amber-400">IN</div>
              <div className="text-xs text-warm-400">Par {back9.reduce((sum, hole) => sum + hole.par, 0)}</div>
              <div className="text-xs text-warm-500">{back9.reduce((sum, hole) => sum + hole.yardage, 0)}</div>
              <div className="mt-1 text-body-lg font-medium tracking-[-0.005em] text-amber-400">{back9HasScores ? back9Score : '-'}</div>
            </div>
          )}
          {!is9Hole && (
            <div className="min-w-[85px] py-3 px-2 text-center bg-warm-950">
              <div className="text-xs font-medium text-white">TOTAL</div>
              <div className="text-xs text-warm-400">Par {totalPar}</div>
              <div className="text-xs text-warm-500">{holes.reduce((sum, hole) => sum + hole.yardage, 0)}</div>
              <div className="mt-1 text-body-lg font-medium tracking-[-0.005em] text-white">{(front9HasScores || back9HasScores) ? front9Score + back9Score : '-'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const ShotPillsBar = memo(function ShotPillsBar({
  currentShot,
  recordedShotCount,
  selectedShotNumber,
  onSelectShot,
}: ShotPillsBarProps) {
  return (
    <div className="sticky z-40 bg-white py-4 -mt-4 -mx-4 px-4 sm:-mx-6 sm:px-6 shadow-sm shadow-primary-950/5 border-b border-warm-100" style={{ top: 'var(--scorecard-height, 105px)' }}>
      <div className="flex items-center gap-3">
        <span className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 shrink-0">Shot</span>
        <div className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex min-w-max items-center gap-2 pr-1">
            {Array.from({ length: Math.max(6, currentShot + 1) }, (_, i) => i + 1).map((num) => {
              const isActive = num === currentShot;
              const isCompleted = num < currentShot;
              const isFuture = num > currentShot;
              const isRecorded = num <= recordedShotCount;
              const isSelected = selectedShotNumber === num;

              return (
                <Button variant="primary"
                  key={num}
                  type="button"
                  disabled={!isRecorded}
                  onClick={() => isRecorded && onSelectShot(num)}
                  className={`min-w-[44px] h-10 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors
                    ${isActive ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-950/5' : ''}
                    ${isCompleted ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : ''}
                    ${isFuture ? 'bg-warm-50 text-warm-400 ring-1 ring-warm-200' : ''}
                    ${isSelected ? 'ring-2 ring-primary-500' : ''}
                    ${isRecorded ? 'cursor-pointer' : 'cursor-default'}`}
                  aria-label={isRecorded ? `View shot ${num}` : `Shot ${num} not recorded`}
                >
                  {num}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShotTrackingComprehensive({
  holes,
  currentHoleIndex,
  onHoleComplete,
  onHoleStatsUpdate,
  onSaveShot,
  onExit,
  onNavigateToHole,
  initialShots = [],
  initialShotNumber = 1,
  onAutoSave,
  autoSaveInterval = 30000, // 30 seconds default
  autoSaveDisabled = false,
}: ShotTrackingProps) {
  const currentHole = holes[currentHoleIndex];

  // ============================================================================
  // STATE MACHINE HOOK
  // ============================================================================

  const {
    state,
    dispatch,
    isProcessingShotRef,
    distanceInputRef,
    shotType,
    isPutting,
    isTeeShot,
    isApproachOrAroundGreen,
  } = useShotStateMachine({
    initialShots,
    initialShotNumber,
    currentHoleIndex,
    currentHole,
    onAutoSave,
    autoSaveInterval,
    autoSaveDisabled,
  });

  // Destructure state for convenience
  const {
    currentShot, shotHistory, distanceToHole, distanceUnit, currentLie,
    usedDriver, resultOfShot, missDirection, puttBreak, puttSlope, puttMissTags,
    approachMissDirection, approachMissLieType, distanceAfterShot, distanceAfterUnit,
    autoSaveStatus, showPenaltyModal, penaltyType,
    showUndoConfirm, undoSaving,
    editingShot, showEditModal, showDeleteConfirm, editFormData, editSaving, editError,
    selectedShotNumber,
  } = state;

  // Local ref for scroll-to-shot in pills
  const shotHistoryRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // ============================================================================
  // SUB-HOOKS — must be called before any early return (Rules of Hooks)
  // ============================================================================
  // Safe to cast currentHole as RoundHole: if currentHole is undefined, the early
  // return below prevents any handler from ever being called.

  const { handleAddPenalty, confirmPenalty } = usePenaltyHandler({
    state, dispatch, currentHole: currentHole as RoundHole, onSaveShot,
  });

  const { handleEditShot, handleCloseEditModal, handleSaveEditedShot, handleDeleteShot } = useEditShotModal({
    state, dispatch, currentHole: currentHole as RoundHole, currentHoleIndex, onAutoSave, onHoleStatsUpdate, calculateHoleStats,
  });

  const { handleUndoLastShot } = useUndoManager({
    state, dispatch, currentHole: currentHole as RoundHole, currentHoleIndex, onAutoSave, onHoleStatsUpdate, calculateHoleStats,
  });

  // ============================================================================
  // UNSAVED INPUT WARNING (Issue #18)
  // ============================================================================
  const [pendingNavHoleIndex, setPendingNavHoleIndex] = useState<number | null>(null);

  const hasUnsavedInput = useCallback((): boolean => {
    // If a result has been selected but not yet recorded, there's unsaved input
    return !!resultOfShot;
  }, [resultOfShot]);

  const handleNavigateToHole = useCallback((targetIndex: number) => {
    if (hasUnsavedInput()) {
      setPendingNavHoleIndex(targetIndex);
    } else {
      void triggerHaptic('medium');
      onNavigateToHole?.(targetIndex);
    }
  }, [hasUnsavedInput, onNavigateToHole]);

  const confirmDiscardAndNavigate = useCallback(() => {
    if (pendingNavHoleIndex !== null) {
      void triggerHaptic('medium');
      onNavigateToHole?.(pendingNavHoleIndex);
      setPendingNavHoleIndex(null);
    }
  }, [pendingNavHoleIndex, onNavigateToHole]);

  const completeHole = (shots: ShotRecord[]) => {
    if (!currentHole) return;
    const holeStats = calculateHoleStats(shots, currentHole);
    onHoleComplete(currentHoleIndex, holeStats);
  };

  // ============================================================================
  // DERIVED VALUES & VALIDATION
  // ============================================================================

  const getClubType = (): 'driver' | 'non_driver' | 'putter' => {
    if (isPutting) return 'putter';
    if (isTeeShot && currentHole?.par !== 3 && usedDriver) return 'driver';
    return 'non_driver';
  };

  const isReadyForNextShot = (): boolean => {
    // Must have a result
    if (!resultOfShot) return false;

    // Tee shot on par 4/5 needs driver selection
    if (isTeeShot && currentHole?.par !== 3 && usedDriver === null) return false;

    // Non-hole results need valid distance after
    if (resultOfShot !== 'hole') {
      const trimmed = distanceAfterShot.trim();
      if (!trimmed) return false;

      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return false;

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

  const handleResultSelect = (result: string) => {
    dispatch({ type: 'HANDLE_RESULT_SELECT', payload: { result, isTeeShot, isPutting, isApproachOrAroundGreen } });
  };

  const handleNextShot = () => {
    if (!resultOfShot) return;

    // Concurrency guard: prevent double-tap from recording duplicate shots
    if (isProcessingShotRef.current) return;
    isProcessingShotRef.current = true;

    // Prevent adding shots to an already-completed hole
    if (shotHistory.some(s => s.result === 'hole')) {
      isProcessingShotRef.current = false;
      return;
    }

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

      if (distanceAfter === 0) {
        isProcessingShotRef.current = false;
        return;
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

    // Record the shot in the reducer
    const isHoleComplete = resultOfShot === 'hole';
    dispatch({ type: 'RECORD_SHOT', payload: { shot: shotRecord, isHoleComplete } });

    // Haptic feedback — subtle for shot, celebratory for hole-out
    void triggerHaptic(isHoleComplete ? 'success' : 'light');

    // Build updated history for callbacks that need it immediately
    const updatedHistory = [...shotHistory, shotRecord];

    onSaveShot?.(shotRecord);

    // Check if hole complete
    if (isHoleComplete) {
      completeHole(updatedHistory);
    }

    if (!isHoleComplete) {
      // Update state for next shot
      const newLie = resultOfShot as 'fairway' | 'rough' | 'sand' | 'green' | 'other';
      dispatch({ type: 'UPDATE_AFTER_SHOT', payload: { distanceAfter, unitAfter, newLie } });
    }

    // Release concurrency guard after dispatches are batched
    queueMicrotask(() => {
      isProcessingShotRef.current = false;
    });
  };

  const handleSelectShot = useCallback((shotNumber: number) => {
    dispatch({ type: 'SELECT_SHOT', payload: shotNumber });
    scrollElementIntoView(shotHistoryRefs.current[shotNumber] ?? null);

    const shot = shotHistory.find((entry) => entry.shotNumber === shotNumber);
    if (shot) {
      handleEditShot(shot);
    }
  }, [dispatch, shotHistory, handleEditShot]);

  // Early return for invalid hole data - must be after all hooks
  if (!currentHole) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-lg text-warm-600">Invalid hole data</p>
      </div>
    );
  }

  // Helper for edit modal form data updates
  const updateEditForm = (updates: Partial<EditFormData>) => {
    if (editFormData) {
      dispatch({ type: 'SET_EDIT_FORM_DATA', payload: { ...editFormData, ...updates } });
    }
  };

  // ============================================================================
  // CALCULATIONS FOR DISPLAY
  // ============================================================================

  const isHoleComplete = shotHistory.length > 0 && shotHistory[shotHistory.length - 1]?.result === 'hole';
  const nextUnplayedIdx = holes.findIndex(h => h.score === null);
  const showBackToCurrentHole = isHoleComplete && !!onNavigateToHole && nextUnplayedIdx >= 0 && nextUnplayedIdx !== currentHoleIndex;

  // For sidebar visualization
  const parsedAfterDistance = parseFloat(distanceAfterShot);
  const displayDistance = resultOfShot === 'hole' ? 0 : (Number.isFinite(parsedAfterDistance) && parsedAfterDistance >= 0 ? parsedAfterDistance : distanceToHole);
  const displayUnit = resultOfShot === 'hole' ? 'feet' : (distanceAfterShot ? distanceAfterUnit : distanceUnit);

  // Convert to yards for progress calculation
  const totalYards = currentHole.yardage || 1;
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
              <span className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                autoSaveStatus === 'saving' ? 'text-amber-300 bg-amber-900/30' :
                autoSaveStatus === 'saved' ? 'text-primary-300 bg-primary-900/30' :
                'text-red-300 bg-red-900/30'
              }`}>
                {autoSaveStatus === 'saving' && (
                  <>
                    <span className="flex items-center gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                    </span>
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
          <Button variant="ghost"
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium text-sm transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Save & Exit
          </Button>
        </div>
      )}

      <ScorecardHeader
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        currentHoleNumber={currentHole.number}
        autoSaveStatus={autoSaveStatus}
        onExit={onExit}
        onNavigateToHole={onNavigateToHole ? handleNavigateToHole : undefined}
      />

      {/* MAIN CONTENT */}
      <div className="flex">
        <div className="flex-1 max-w-5xl mx-auto p-4 sm:p-6 space-y-5">

          <ShotPillsBar
            currentShot={currentShot}
            recordedShotCount={shotHistory.length}
            selectedShotNumber={selectedShotNumber}
            onSelectShot={handleSelectShot}
          />

          {/* Hole Header */}
          <div className={`rounded-lg p-6 text-white shadow-sm ring-1 ring-primary-950/5 ${
            isHoleComplete
              ? (() => {
                  const toPar = shotHistory.length - currentHole.par;
                  if (toPar <= -2) return 'bg-gradient-to-br from-blue-600 to-blue-700 shadow-blue-950/10';
                  if (toPar === -1) return 'bg-gradient-to-br from-primary-600 to-primary-700 shadow-primary-950/10';
                  if (toPar === 0) return 'bg-gradient-to-br from-warm-600 to-warm-700 shadow-warm-950/10';
                  if (toPar === 1) return 'bg-gradient-to-br from-amber-600 to-amber-700 shadow-amber-950/10';
                  return 'bg-gradient-to-br from-red-600 to-red-700 shadow-red-950/10';
                })()
              : 'bg-gradient-to-br from-primary-600 to-primary-700 shadow-primary-950/10'
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-h1 md:text-display font-light tracking-[-0.025em]">Hole {currentHole.number}</h1>
                  <span className="px-3 py-1 bg-white/15 backdrop-blur-sm rounded-md text-xs font-medium uppercase tracking-wide">
                    Par {currentHole.par}
                  </span>
                </div>
                <p className="text-primary-100 text-sm mt-2">
                  {isHoleComplete
                    ? `${shotHistory.length} shots • ${shotHistory.filter(s => s.shotType === 'putting').length} putts`
                    : <>Shot {currentShot} • {shotType.charAt(0).toUpperCase() + shotType.slice(1).replace('_', ' ')}{' • '}<span className="capitalize font-medium">{currentLie}</span></>
                  }
                </p>
              </div>
              <div className="text-right">
                {isHoleComplete ? (
                  (() => {
                    const holeScore = calculateHoleStats(shotHistory, currentHole).score;
                    const toPar = holeScore - currentHole.par;
                    return (
                      <>
                        <p className="text-primary-200 text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80">Score</p>
                        <p className="text-display font-light tracking-[-0.025em] mt-1">
                          {holeScore}
                          <span className="text-xl ml-1 font-medium text-primary-100">
                            {toPar > 0 ? `+${toPar}` : toPar === 0 ? 'E' : toPar}
                          </span>
                        </p>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <p className="text-primary-200 text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80">Distance</p>
                    <p className="text-display font-light tracking-[-0.025em] mt-1">
                      {distanceToHole}<span className="text-xl ml-1 font-medium text-primary-100">{distanceUnit === 'yards' ? 'YDS' : 'FT'}</span>
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Inline Progress Bar - Mobile Only (hide on completed holes) */}
            {!isHoleComplete && <div className="xl:hidden mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-primary-100 font-medium uppercase tracking-wide">Progress</span>
                <span className="text-xs text-primary-100 font-medium">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-[width] duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-xs text-primary-100">
                <span className="flex items-center gap-2 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full border border-warm-200/55"></span>
                  Tee
                </span>
                <span className="font-medium text-sm">{displayDistance} {displayUnit} left</span>
                <span className="flex items-center gap-2 font-medium">
                  Hole
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                </span>
              </div>
            </div>}
          </div>

          {isHoleComplete ? (
            /* ================================================================
               COMPLETED HOLE REVIEW — tap any shot to edit
               ================================================================ */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-body-sm font-medium text-warm-600 uppercase tracking-wider">Shot Review</p>
                <span className="text-xs font-medium text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md ring-1 ring-primary-200">
                  Score: {shotHistory.length} ({shotHistory.length - currentHole.par > 0 ? '+' : ''}{shotHistory.length - currentHole.par})
                </span>
              </div>
              <p className="text-xs text-warm-500">Tap any shot to edit</p>
              <div className="space-y-2">
                {shotHistory.map((shot) => {
                  const formatResult = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
                  const distLabel = shot.distanceUnitBefore === 'feet'
                    ? `${shot.distanceToHoleBefore}ft`
                    : `${shot.distanceToHoleBefore}y`;
                  const afterLabel = shot.result === 'hole'
                    ? 'Holed'
                    : shot.distanceUnitAfter === 'feet'
                      ? `${shot.distanceToHoleAfter}ft left`
                      : `${shot.distanceToHoleAfter}y left`;
                  return (
                    <Button variant="danger"
                      key={shot.shotNumber}
                      onClick={() => handleEditShot(shot)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                        shot.isPenalty
                          ? 'bg-red-50 ring-1 ring-red-200 hover:bg-red-100'
                          : 'bg-white ring-1 ring-warm-200 hover:ring-primary-300 hover:bg-warm-50 active:bg-warm-100'
                      }`}
                    >
                      {/* Shot number */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-body-sm font-medium flex-shrink-0 ${
                        shot.isPenalty
                          ? 'bg-red-100 text-red-600'
                          : shot.result === 'hole'
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-warm-100 text-warm-600'
                      }`}>
                        {shot.isPenalty ? 'P' : shot.shotNumber}
                      </div>

                      {/* Shot info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-warm-800 capitalize">
                            {shot.isPenalty ? `Penalty (${shot.penaltyType || 'unknown'})` : shot.shotType.replace('_', ' ')}
                          </span>
                          {!shot.isPenalty && (
                            <span className="text-xs text-warm-500">
                              {shot.clubType === 'driver' ? 'Driver' : shot.clubType === 'putter' ? 'Putter' : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-warm-500 mt-0.5">
                          {shot.isPenalty
                            ? `+1 stroke`
                            : `${distLabel} → ${afterLabel}`
                          }
                          {shot.missDirection && !shot.isPenalty && (
                            <span className="ml-1.5 text-warm-400">• Miss {shot.missDirection}</span>
                          )}
                        </div>
                      </div>

                      {/* Shot distance + result badge */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!shot.isPenalty && (
                          <span className="text-body-sm font-medium text-primary-600">{shot.shotDistance}y</span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          shot.result === 'hole' ? 'bg-primary-100 text-primary-700'
                            : shot.result === 'green' ? 'bg-emerald-50 text-emerald-700'
                            : shot.result === 'fairway' ? 'bg-green-50 text-green-700'
                            : shot.result === 'penalty' ? 'bg-red-100 text-red-600'
                            : 'bg-warm-100 text-warm-600'
                        }`}>
                          {formatResult(shot.result)}
                        </span>
                        {/* Edit indicator */}
                        <svg className="w-4 h-4 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                    </Button>
                  );
                })}
              </div>

              {/* Back to current hole button — show when reviewing a past hole and there's an unplayed hole to return to */}
              {showBackToCurrentHole && (
                <Button variant="primary"
                  onClick={() => handleNavigateToHole(nextUnplayedIdx)}
                  className="w-full py-3 rounded-lg font-medium text-sm text-primary-600 bg-primary-50 ring-1 ring-primary-200 hover:bg-primary-100 hover:ring-primary-300 transition-colors"
                >
                  Back to Current Hole →
                </Button>
              )}
            </div>
          ) : (
          <div className="space-y-5">
              {/* Club Selection (Tee Shot Par 4/5) - Segmented Control */}
              {isTeeShot && currentHole.par !== 3 && (
                <div className="relative surface-matte rounded-3xl overflow-clip p-6 transition-colors duration-300">
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                    }}
                  />
                  <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-4">Club Off Tee</p>
                  <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full" role="radiogroup" aria-label="Club off tee">
                    <Button variant="primary" onClick={() => dispatch({ type: 'SET_DRIVER', payload: true })}
                      role="radio"
                      aria-checked={usedDriver === true}
                      className={`flex-1 py-3 rounded-md font-medium text-sm transition-colors ${
                        usedDriver === true
                          ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Driver
                    </Button>
                    <Button variant="primary" onClick={() => dispatch({ type: 'SET_DRIVER', payload: false })}
                      role="radio"
                      aria-checked={usedDriver === false}
                      className={`flex-1 py-3 rounded-md font-medium text-sm transition-colors ${
                        usedDriver === false
                          ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                          : 'text-warm-600 hover:text-warm-900'}`}>
                      Non-Driver
                    </Button>
                  </div>
                </div>
              )}

              {/* Putt Details (FIRST - when putting) */}
              {isPutting && (
                <div className="bg-primary-50/55 rounded-xl p-6 border-2 border-primary-200 shadow-lg shadow-primary-950/5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-body-sm font-medium text-primary-900 uppercase tracking-wide">Putting Details</p>
                    <span className="text-xs font-medium text-primary-700 bg-primary-100 px-2 py-1 rounded-md">Fill First</span>
                  </div>
                  <p className="text-xs text-warm-600 mb-4">Describe your putt before selecting the result</p>
                  <div className="mb-6">
                    <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">Break</p>
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-primary-200" role="radiogroup" aria-label="Putt break direction">
                      {[{v: 'left_to_right', l: 'L → R'}, {v: 'straight', l: 'Straight'}, {v: 'right_to_left', l: 'R → L'}, {v: 'multiple', l: 'Multiple'}].map(b => (
                        <Button variant="primary" key={b.v} onClick={() => dispatch({ type: 'SET_PUTT_BREAK', payload: b.v as ShotRecord['puttBreak'] })}
                          role="radio"
                          aria-checked={puttBreak === b.v}
                          className={`flex-1 py-3 rounded-md font-medium text-sm transition-colors min-h-[44px] ${
                            puttBreak === b.v
                              ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                              : 'text-warm-600 hover:text-warm-900'}`}>
                          {b.l}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-2">
                    <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">Slope</p>
                    <div className="inline-flex bg-white rounded-lg p-1 w-full border border-primary-200" role="radiogroup" aria-label="Putt slope">
                      {[{v: 'uphill', l: 'Uphill'}, {v: 'level', l: 'Level'}, {v: 'downhill', l: 'Downhill'}, {v: 'severe', l: 'Severe'}].map(s => (
                        <Button variant="primary" key={s.v} onClick={() => dispatch({ type: 'SET_PUTT_SLOPE', payload: s.v as ShotRecord['puttSlope'] })}
                          role="radio"
                          aria-checked={puttSlope === s.v}
                          className={`flex-1 py-3 rounded-md font-medium text-sm transition-colors min-h-[44px] ${
                            puttSlope === s.v
                              ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                              : 'text-warm-600 hover:text-warm-900'}`}>
                          {s.l}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Shot Result - Context-Aware */}
              <div className="relative surface-matte rounded-3xl overflow-clip p-6 transition-colors duration-300">
                <div
                  className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                  }}
                />
                <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-4">
                  {isPutting ? 'Putt Result' : 'Shot Result'}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2" role="radiogroup" aria-label={isPutting ? 'Putt result' : 'Shot result'}>
                  {(() => {
                    const formatLieLabel = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
                    // Par 3 first shots are classified as 'approach' (not 'tee') by the state machine,
                    // so check currentShot === 1 && par === 3 separately to exclude 'fairway'.
                    const isFirstShotPar3 = currentShot === 1 && currentHole.par === 3;
                    let options: string[];
                    if (isPutting) {
                      options = ['hole', 'green', 'rough', 'sand'];
                    } else if (isTeeShot && currentHole.par !== 3) {
                      // Par 4/5: fairway is common, but include green (reachable par 4/5) and hole (ace)
                      options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                    } else if (isTeeShot && currentHole.par === 3 || isFirstShotPar3) {
                      // Par 3: green is common, include hole for ace — no fairway
                      options = ['green', 'rough', 'sand', 'hole', 'other'];
                    } else {
                      options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                    }
                    return options.map(r => {
                      // For tee shots: "hole" means ace, "green" on par 4/5 means drive-the-green
                      const isRareTeeResult = (isTeeShot || isFirstShotPar3) && (r === 'hole' || (r === 'green' && currentHole.par !== 3));
                      // For putts: rough/sand are rare (ball rolled off green on severe slopes)
                      const isRarePuttResult = isPutting && (r === 'rough' || r === 'sand');
                      const isSubtle = isRareTeeResult || isRarePuttResult;
                      return (
                      <Button variant="primary" key={r} onClick={() => handleResultSelect(r)}
                        role="radio"
                        aria-checked={resultOfShot === r}
                        className={`py-3 rounded-lg font-medium text-sm transition-colors ${
                          resultOfShot === r
                            ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                            : isSubtle
                              ? 'bg-warm-50/60 text-warm-500 ring-1 ring-warm-200/70 hover:ring-primary-300 hover:bg-warm-100 hover:text-warm-700 active:bg-warm-200'
                              : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300 hover:bg-warm-100 active:bg-warm-200'}`}>
                        {formatLieLabel(r)}
                        {r === 'green' && !isTeeShot && !isPutting && (
                          <span className={`block text-xs font-normal leading-tight ${
                            resultOfShot === r ? 'text-primary-100' : 'text-warm-400'
                          }`}>(putting surface, not fringe)</span>
                        )}
                        {r === 'hole' && (isTeeShot || isFirstShotPar3) && (
                          <span className={`block text-xs font-normal leading-tight ${
                            resultOfShot === r ? 'text-primary-100' : 'text-warm-400'
                          }`}>(ace!)</span>
                        )}
                        {isRarePuttResult && (
                          <span className={`block text-xs font-normal leading-tight ${
                            resultOfShot === r ? 'text-primary-100' : 'text-warm-400'
                          }`}>(rolled off)</span>
                        )}
                      </Button>);
                    });
                  })()}
                </div>
              </div>

              {/* Miss Direction */}
              {((isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
                (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) ||
                (isPutting && resultOfShot && resultOfShot !== 'hole')) && (
                <div className="relative surface-matte rounded-3xl overflow-clip p-6 transition-colors duration-300">
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                    }}
                  />
                  <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-4">Miss Direction</p>
                  {isTeeShot && (
                    <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full" role="radiogroup" aria-label="Miss direction">
                      {['left', 'right'].map(d => (
                        <Button variant="primary" key={d} onClick={() => dispatch({ type: 'SET_MISS_DIRECTION', payload: d })}
                          role="radio"
                          aria-checked={missDirection === d}
                          className={`flex-1 py-3 rounded-md font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                            missDirection === d
                              ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                              : 'text-warm-600 hover:text-warm-900'}`}>
                          {d === 'left' ? '←' : ''} {d.charAt(0).toUpperCase() + d.slice(1)} {d === 'right' ? '→' : ''}
                        </Button>
                      ))}
                    </div>
                  )}
                  {isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot) && (
                    <ApproachMissSelector
                      selectedDirection={approachMissDirection}
                      onDirectionChange={(dir) => dispatch({ type: 'SET_APPROACH_MISS', payload: { direction: dir } })}
                    />
                  )}
                  {isPutting && resultOfShot && resultOfShot !== 'hole' && (
                    <PuttMissTagSelector
                      selectedTags={puttMissTags}
                      onTagsChange={(tags) => dispatch({ type: 'SET_PUTT_MISS_TAGS', payload: tags })}
                    />
                  )}
                </div>
              )}

              {/* Distance Remaining - Final Step (if not holed) */}
              {resultOfShot && resultOfShot !== 'hole' && (
                <div className="bg-primary-50/55 rounded-xl p-6 border-2 border-primary-200 shadow-lg shadow-primary-950/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-body-sm font-medium text-primary-900 uppercase tracking-wide">
                      {isPutting ? 'Leave Distance' : 'Distance Remaining'}
                    </p>
                    <span className="text-xs font-medium text-primary-700 bg-primary-100 px-2 py-1 rounded-md">Required</span>
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
                      pattern="[0-9]*"
                      min="0"
                      aria-label={isPutting ? 'Leave distance in feet or yards' : 'Distance remaining to hole'}
                      value={distanceAfterShot}
                      onChange={(e) => dispatch({ type: 'SET_DISTANCE_AFTER', payload: e.target.value })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder="Enter distance"
                      className={`w-full h-14 px-5 rounded-xl text-h1 md:text-display font-light tracking-[-0.025em] text-primary-900 text-center bg-white border-2 focus:ring-4 focus:outline-none transition-colors placeholder:text-warm-300 ${
                        distanceAfterShot && (!Number.isFinite(parseFloat(distanceAfterShot)) || parseFloat(distanceAfterShot) < 0)
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                          : 'border-primary-300 focus:border-primary-500 focus:ring-primary-100'
                      }`}
                    />
                    {distanceAfterShot && (!Number.isFinite(parseFloat(distanceAfterShot)) || parseFloat(distanceAfterShot) < 0) && (
                      <p className="text-red-500 text-sm mt-1">Please enter a valid distance</p>
                    )}
                    {/* Quick-select buttons for common putting distances */}
                    {isPutting && (
                      <div className="grid grid-cols-6 gap-2">
                        {[5, 10, 15, 20, 30, 40].map((ft) => (
                          <Button variant="primary"
                            key={ft}
                            type="button"
                            onClick={() => {
                              dispatch({ type: 'SET_DISTANCE_AFTER', payload: String(ft) });
                              dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' });
                            }}
                            className={`py-2 rounded-lg text-eyebrow font-medium transition-colors ${
                              distanceAfterShot === String(ft) && distanceAfterUnit === 'feet'
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 active:bg-primary-100'
                            }`}
                          >
                            {ft}ft
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="inline-flex bg-white rounded-lg p-1 border-2 border-primary-300 w-full">
                      <Button variant="primary"
                        onClick={() => dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'yards' })}
                        className={`flex-1 py-2.5 rounded-md font-medium text-sm uppercase tracking-wide transition-colors ${
                          distanceAfterUnit === 'yards'
                            ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                            : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50 active:bg-warm-100'
                        }`}
                      >
                        Yards
                      </Button>
                      <Button variant="primary"
                        onClick={() => dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' })}
                        className={`flex-1 py-2.5 rounded-md font-medium text-sm uppercase tracking-wide transition-colors ${
                          distanceAfterUnit === 'feet'
                            ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                            : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50 active:bg-warm-100'
                        }`}
                      >
                        Feet
                      </Button>
                    </div>
                  </div>
                  {distanceAfterShot && (
                    <div className="flex items-center justify-between bg-cream-100/68 rounded-lg px-4 py-2.5 border border-primary-200">
                      <span className="text-xs font-medium text-warm-600 uppercase tracking-wide">Shot Distance</span>
                      <span className="text-body-lg font-medium tracking-[-0.005em] text-primary-700">
                        ~{Math.round(calculateShotDistanceWithDirection(
                          distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole,
                          distanceAfterUnit === 'feet' ? (parseFloat(distanceAfterShot) || 0) / 3 : (parseFloat(distanceAfterShot) || 0),
                          isApproachOrAroundGreen ? (approachMissDirection || missDirection) : missDirection
                        ))} yards
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Max score warning */}
              {currentShot >= 12 && !isHoleComplete && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-900">
                    {currentShot >= 15
                      ? 'Maximum recordable score (15) reached. Please hole out or pick up.'
                      : `Shot ${currentShot} of 15 max — ${15 - currentShot} shot${15 - currentShot !== 1 ? 's' : ''} remaining before the limit.`}
                  </p>
                </div>
              )}

              {/* Next Shot Button */}
              {(() => {
                const ready = isReadyForNextShot();
                return (
              <Button variant="primary"
                onClick={handleNextShot}
                disabled={!ready}
                aria-label={resultOfShot === 'hole' ? `Complete hole with score ${currentShot}` : 'Record next shot'}
                className={`w-full py-4 rounded-lg font-medium text-base transition-colors ${
                  ready
                    ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                    : 'bg-warm-100 text-warm-400 cursor-not-allowed ring-1 ring-warm-200'}`}>
                {resultOfShot === 'hole' ? `Complete Hole - Score: ${currentShot}` : 'Next Shot →'}
              </Button>
                );
              })()}

              {/* Action Buttons Row */}
              <div className="flex gap-2">
                {/* Penalty Button */}
                <Button variant="danger"
                  onClick={handleAddPenalty}
                  aria-label="Add penalty stroke"
                  className="flex-1 py-3 rounded-xl font-medium text-sm text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors min-h-[44px]">
                  + Penalty
                </Button>

                {/* Undo Last Shot Button */}
                {shotHistory.length > 0 && (
                  <Button variant="ghost"
                    onClick={() => dispatch({ type: 'SHOW_UNDO_CONFIRM' })}
                    disabled={undoSaving}
                    aria-label="Undo last shot"
                    className="flex-1 py-3 rounded-xl font-medium text-sm text-warm-600 bg-warm-50 hover:bg-warm-100 active:bg-warm-200 transition-colors disabled:opacity-50 min-h-[44px]">
                    {undoSaving ? 'Undoing...' : 'Undo Last'}
                  </Button>
                )}
              </div>

              {/* Undo Confirmation */}
              {showUndoConfirm && shotHistory.length > 0 && (
                <div className="p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl">
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    Undo shot {shotHistory.length}?
                    <span className="block text-xs text-amber-700 mt-0.5">
                      {shotHistory[shotHistory.length - 1]!.isPenalty
                        ? `Penalty (${shotHistory[shotHistory.length - 1]!.penaltyType || 'unknown'})`
                        : `${shotHistory[shotHistory.length - 1]!.shotType.replace('_', ' ')} → ${shotHistory[shotHistory.length - 1]!.result}`}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost"
                      onClick={() => dispatch({ type: 'HIDE_UNDO_CONFIRM' })}
                      className="flex-1 py-2.5 rounded-xl font-medium text-xs text-warm-700 bg-white hover:bg-warm-50 active:bg-warm-100 transition-colors min-h-[44px]">
                      Cancel
                    </Button>
                    <Button variant="ghost"
                      onClick={handleUndoLastShot}
                      disabled={undoSaving}
                      className="flex-1 py-2.5 rounded-xl font-medium text-xs text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-sm transition-colors disabled:opacity-50 min-h-[44px]">
                      {undoSaving ? 'Removing...' : 'Confirm'}
                    </Button>
                  </div>
                </div>
              )}
          </div>
          )}
        </div>

        {/* Right Sidebar - Overhead Course View */}
        <div className="hidden xl:block w-44 p-4">
          <div className="relative sticky top-32 surface-matte rounded-3xl overflow-clip p-4 transition-colors duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-eyebrow font-medium text-warm-400 uppercase tracking-wider">Hole {currentHole.number}</p>
                <p className="text-body-lg font-medium tracking-[-0.005em] text-warm-800">Par {currentHole.par}</p>
              </div>
              <div className="text-right">
                <p className="text-eyebrow font-medium text-warm-400 uppercase tracking-wider">{isHoleComplete ? 'Score' : 'Shot'}</p>
                <p className="text-body-lg font-medium tracking-[-0.005em] text-primary-600">{isHoleComplete ? shotHistory.length : currentShot}</p>
              </div>
            </div>

            {/* Overhead Course View - Premium Minimalist Design */}
            <div className="relative rounded-xl h-56 overflow-hidden shadow-inner" aria-hidden="true">
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
                    className="absolute z-30 transition-[left,top] duration-500 ease-out"
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
                <span className="text-eyebrow font-medium text-white/40 tracking-tight">0</span>
                <span className="text-eyebrow font-medium text-white/40 tracking-tight">{Math.round(currentHole.yardage / 2)}</span>
                <span className="text-eyebrow font-medium text-white/40 tracking-tight">{currentHole.yardage}</span>
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
                  <p className="text-eyebrow font-medium text-warm-400 uppercase">Lie</p>
                  <p className="text-body-sm font-medium text-warm-700 capitalize">{currentLie}</p>
                </div>
                <div className="text-right">
                  <p className="text-eyebrow font-medium text-warm-400 uppercase">To Hole</p>
                  <p className="text-body-sm font-medium text-primary-600">{displayDistance} {displayUnit === 'yards' ? 'yds' : 'ft'}</p>
                </div>
              </div>
            </div>

            {/* Shot History */}
            {shotHistory.length > 0 && (
              <div className="mt-3 pt-3 border-t border-warm-200">
                <p className="text-eyebrow font-medium text-warm-400 uppercase tracking-wider mb-2">Shots</p>
                <div
                  className="space-y-1 max-h-24 overflow-y-auto overscroll-contain touch-pan-y"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  data-scroll-container
                >
                  {shotHistory.map((shot, idx) => {
                    const isSelected = selectedShotNumber === shot.shotNumber;
                    return (
                      <Button variant="danger"
                        key={idx}
                        ref={(node) => { shotHistoryRefs.current[shot.shotNumber] = node; }}
                        onClick={() => {
                          dispatch({ type: 'SELECT_SHOT', payload: shot.shotNumber });
                          handleEditShot(shot);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                          isSelected
                            ? 'bg-primary-100 ring-1 ring-primary-400'
                            : shot.isPenalty
                              ? 'bg-red-50 hover:bg-red-100'
                              : 'bg-warm-50 hover:bg-warm-100 active:bg-warm-200'
                        }`}
                      >
                        <span className={`font-medium ${shot.isPenalty ? 'text-red-600' : 'text-warm-600'}`}>
                          {shot.isPenalty ? 'P' : shot.shotNumber}
                        </span>
                        <span className={`font-medium ${shot.isPenalty ? 'text-red-500' : 'text-primary-600'}`}>
                          {shot.isPenalty ? '+1' : `${shot.shotDistance}y`}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unsaved Input Warning Modal (Issue #18) */}
      {pendingNavHoleIndex !== null && (
        <div
          className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setPendingNavHoleIndex(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setPendingNavHoleIndex(null); }}
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved shot data"
        >
          <div className="glass-prominent rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Unsaved Shot Data</h2>
                <p className="text-sm text-warm-500 mt-0.5">You have unrecorded shot data that will be lost.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost"
                onClick={() => setPendingNavHoleIndex(null)}
                className="flex-1 py-3 rounded-xl font-medium text-sm text-warm-700 bg-warm-100 hover:bg-warm-200 active:bg-warm-300 transition-colors min-h-[44px]"
              >
                Stay
              </Button>
              <Button variant="ghost"
                onClick={confirmDiscardAndNavigate}
                className="flex-1 py-3 rounded-xl font-medium text-sm text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-sm shadow-amber-950/10 transition-colors min-h-[44px]"
              >
                Discard & Go
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Penalty Modal */}
      {showPenaltyModal && (
        <div
          className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => dispatch({ type: 'CLOSE_PENALTY_MODAL' })}
          onKeyDown={(e) => { if (e.key === 'Escape') dispatch({ type: 'CLOSE_PENALTY_MODAL' }); }}
          role="dialog"
          aria-modal="true"
          aria-label="Add penalty stroke"
        >
          <div className="glass-prominent rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-6">Add Penalty Stroke</h2>
            <div className="space-y-2 mb-6">
              {[{v: 'ob', l: 'Out of Bounds'}, {v: 'water', l: 'Water Hazard'}, {v: 'unplayable', l: 'Unplayable Lie'}, {v: 'lost', l: 'Lost Ball'}].map(p => (
                <Button variant="danger" key={p.v} onClick={() => dispatch({ type: 'SET_PENALTY_TYPE', payload: p.v })}
                  className={`w-full py-3 px-4 rounded-xl font-medium text-sm text-left transition-colors min-h-[44px] ${
                    penaltyType === p.v
                      ? 'bg-red-600 text-white shadow-sm shadow-red-950/10'
                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-red-300 hover:bg-red-50'}`}>
                  {p.l}
                </Button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => dispatch({ type: 'CLOSE_PENALTY_MODAL' })}
                className="flex-1 py-3 rounded-xl font-medium text-sm text-warm-700 bg-warm-100 hover:bg-warm-200 active:bg-warm-300 transition-colors min-h-[44px]">
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmPenalty} disabled={!penaltyType}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors min-h-[44px] ${
                  penaltyType
                    ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-950/10'
                    : 'bg-warm-100 text-warm-400 cursor-not-allowed'}`}>
                Add +1 Stroke
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Shot Modal */}
      {showEditModal && editingShot && editFormData && (
        <div
          className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleCloseEditModal}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCloseEditModal(); }}
          role="dialog"
          aria-modal="true"
          aria-label={`Edit shot ${editingShot.shotNumber}`}
        >
          <div
            className="glass-prominent rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y shadow-2xl"
            style={{ WebkitOverflowScrolling: 'touch' }}
            data-scroll-container
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-cream-50/92 backdrop-blur-md border-b border-warm-200/60 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
                  Edit Shot {editingShot.shotNumber}
                </h2>
                <IconButton variant="default"
                  onClick={handleCloseEditModal}
                  aria-label="Close"
                  className="p-2 rounded-xl text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>
              {editError && (
                <div className="mt-3 px-3 py-2 bg-red-50/80 border border-red-200/60 rounded-xl">
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 pb-6 space-y-5">
              {/* Delete Confirmation */}
              {showDeleteConfirm ? (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50/80 border border-red-200/60 rounded-xl">
                    <p className="text-sm font-medium text-red-900">Are you sure you want to delete this shot?</p>
                    <p className="text-xs text-red-700 mt-1">This action cannot be undone. Shot numbers will be resequenced.</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="ghost"
                      onClick={() => dispatch({ type: 'HIDE_DELETE_CONFIRM' })}
                      disabled={editSaving}
                      className="flex-1 py-3 rounded-xl font-medium text-sm text-warm-700 bg-warm-100 hover:bg-warm-200 active:bg-warm-300 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      Cancel
                    </Button>
                    <Button variant="danger"
                      onClick={handleDeleteShot}
                      disabled={editSaving}
                      className="flex-1 py-3 rounded-xl font-medium text-sm bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-950/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      {editSaving ? (
                        <>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                          </span>
                          Deleting...
                        </>
                      ) : (
                        'Delete Shot'
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Shot Type Info */}
                  <div className="flex items-center gap-3 p-3 bg-warm-50/80 rounded-xl border border-warm-100">
                    <span className="text-eyebrow font-medium text-warm-500 uppercase tracking-wide">Type:</span>
                    <span className="text-sm font-medium text-warm-700 capitalize">
                      {editingShot.isPenalty ? 'Penalty' : editingShot.shotType.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Penalty Shot Edit */}
                  {editFormData.isPenalty ? (
                    <div>
                      <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Penalty Type</p>
                      <div className="space-y-2">
                        {[{v: 'ob', l: 'Out of Bounds'}, {v: 'water', l: 'Water Hazard'}, {v: 'unplayable', l: 'Unplayable Lie'}, {v: 'lost', l: 'Lost Ball'}].map(p => (
                          <Button variant="danger"
                            key={p.v}
                            onClick={() => updateEditForm({ penaltyType: p.v })}
                            className={`w-full py-3 px-4 rounded-lg font-medium text-sm text-left transition-colors ${
                              editFormData.penaltyType === p.v
                                ? 'bg-red-600 text-white shadow-sm shadow-red-950/10 ring-1 ring-red-700'
                                : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-red-300 hover:bg-red-50'
                            }`}
                          >
                            {p.l}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Club Type (for non-penalty shots) */}
                      {editingShot.shotType === 'tee' && (
                        <div>
                          <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Club</p>
                          <div className="inline-flex bg-warm-100 rounded-lg p-1 w-full">
                            <Button variant="primary"
                              onClick={() => updateEditForm({ clubType: 'driver' })}
                              className={`flex-1 py-3 min-h-[48px] rounded-md font-medium text-sm transition-colors ${
                                editFormData.clubType === 'driver'
                                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                                  : 'text-warm-600 hover:text-warm-900'
                              }`}
                            >
                              Driver
                            </Button>
                            <Button variant="primary"
                              onClick={() => updateEditForm({ clubType: 'non_driver' })}
                              className={`flex-1 py-3 min-h-[48px] rounded-md font-medium text-sm transition-colors ${
                                editFormData.clubType === 'non_driver'
                                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10'
                                  : 'text-warm-600 hover:text-warm-900'
                              }`}
                            >
                              Non-Driver
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Lie Before */}
                      <div>
                        <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Lie Before</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {(['tee', 'fairway', 'rough', 'sand', 'green', 'other'] as const).map(lie => {
                            const lieLabel = lie.charAt(0).toUpperCase() + lie.slice(1);
                            return (
                            <Button variant="primary"
                              key={lie}
                              onClick={() => updateEditForm({ lieBefore: lie })}
                              className={`py-3 min-h-[48px] rounded-lg font-medium text-sm transition-colors ${
                                editFormData.lieBefore === lie
                                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                                  : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                              }`}
                            >
                              {lieLabel}
                              {lie === 'green' && (
                                <span className={`block text-xs font-normal leading-tight ${editFormData.lieBefore === 'green' ? 'text-primary-100' : 'text-warm-400'}`}>(putting surface)</span>
                              )}
                            </Button>);
                          })}
                        </div>
                      </div>

                      {/* Distance Before */}
                      <div>
                        <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Distance Before</p>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            aria-label="Distance to hole before shot"
                            value={editFormData.distanceToHoleBefore}
                            onChange={(e) => updateEditForm({ distanceToHoleBefore: e.target.value })}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="flex-1 h-12 px-4 rounded-lg text-body-lg font-medium text-warm-900 tracking-[-0.012em] text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-colors"
                          />
                          <div className="inline-flex bg-warm-100 rounded-lg p-1">
                            <Button variant="primary"
                              onClick={() => updateEditForm({ distanceUnitBefore: 'yards' })}
                              className={`px-3 py-2.5 min-h-[44px] rounded-md font-medium text-xs uppercase transition-colors ${
                                editFormData.distanceUnitBefore === 'yards'
                                  ? 'bg-primary-600 text-white shadow-sm'
                                  : 'text-warm-600'
                              }`}
                            >
                              Yds
                            </Button>
                            <Button variant="primary"
                              onClick={() => updateEditForm({ distanceUnitBefore: 'feet' })}
                              className={`px-3 py-2.5 min-h-[44px] rounded-md font-medium text-xs uppercase transition-colors ${
                                editFormData.distanceUnitBefore === 'feet'
                                  ? 'bg-primary-600 text-white shadow-sm'
                                  : 'text-warm-600'
                              }`}
                            >
                              Ft
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Result */}
                      <div>
                        <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Result</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {(['fairway', 'rough', 'sand', 'green', 'hole', 'other'] as const).map(r => {
                            const resultLabel = r.charAt(0).toUpperCase() + r.slice(1);
                            return (
                            <Button variant="primary"
                              key={r}
                              onClick={() => {
                                if (!editFormData) return;
                                const updates: Partial<EditFormData> = { result: r };
                                // Auto-switch distance unit when result changes
                                if (r === 'green') {
                                  updates.distanceUnitAfter = 'feet';
                                } else if (r === 'hole') {
                                  updates.distanceToHoleAfter = '0';
                                  updates.distanceUnitAfter = 'feet';
                                } else if (editFormData.result === 'green' || editFormData.result === 'hole') {
                                  // Switching away from green/hole — restore yards
                                  updates.distanceUnitAfter = 'yards';
                                }
                                // Auto-derive approach miss lie type from result
                                if (editingShot.shotType === 'approach' || editingShot.shotType === 'around_green') {
                                  if (r === 'rough' || r === 'other') updates.approachMissLieType = 'rough';
                                  else if (r === 'sand') updates.approachMissLieType = 'bunker';
                                  else if (r === 'fairway') updates.approachMissLieType = 'fairway';
                                  else updates.approachMissLieType = undefined;
                                }
                                // Clear irrelevant miss data when result changes
                                if (r === 'green' || r === 'hole') {
                                  updates.missDirection = null;
                                  updates.approachMissDirection = null;
                                  updates.approachMissLieType = undefined;
                                  updates.puttMissTags = [];
                                }
                                dispatch({ type: 'SET_EDIT_FORM_DATA', payload: { ...editFormData, ...updates } });
                              }}
                              className={`py-3 min-h-[48px] rounded-lg font-medium text-sm transition-colors ${
                                editFormData.result === r
                                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                                  : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                              }`}
                            >
                              {resultLabel}
                              {r === 'green' && (
                                <span className={`block text-xs font-normal leading-tight ${editFormData.result === 'green' ? 'text-primary-100' : 'text-warm-400'}`}>(putting surface, not fringe)</span>
                              )}
                            </Button>);
                          })}
                        </div>
                      </div>

                      {/* Distance After (if not holed) */}
                      {editFormData.result !== 'hole' && (
                        <div>
                          <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Distance After</p>
                          {/* Quick-select distance presets */}
                          {editingShot.shotType === 'putting' ? (
                            <div className="grid grid-cols-6 gap-2 mb-3">
                              {[3, 5, 10, 15, 20, 30].map((ft) => (
                                <Button variant="primary"
                                  key={ft}
                                  type="button"
                                  onClick={() => updateEditForm({ distanceToHoleAfter: String(ft), distanceUnitAfter: 'feet' })}
                                  className={`py-2 rounded-lg text-eyebrow font-medium transition-colors ${
                                    editFormData.distanceToHoleAfter === String(ft) && editFormData.distanceUnitAfter === 'feet'
                                      ? 'bg-primary-600 text-white shadow-sm'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                  }`}
                                >
                                  {ft}ft
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-5 gap-2 mb-3">
                              {[50, 100, 150, 200, 250].map((yds) => (
                                <Button variant="primary"
                                  key={yds}
                                  type="button"
                                  onClick={() => updateEditForm({ distanceToHoleAfter: String(yds), distanceUnitAfter: 'yards' })}
                                  className={`py-2 rounded-lg text-eyebrow font-medium transition-colors ${
                                    editFormData.distanceToHoleAfter === String(yds) && editFormData.distanceUnitAfter === 'yards'
                                      ? 'bg-primary-600 text-white shadow-sm'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                  }`}
                                >
                                  {yds}
                                </Button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              aria-label="Distance to hole after shot"
                              value={editFormData.distanceToHoleAfter}
                              onChange={(e) => updateEditForm({ distanceToHoleAfter: e.target.value })}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="flex-1 h-12 px-4 rounded-lg text-body-lg font-medium text-warm-900 tracking-[-0.012em] text-center bg-white border-2 border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-colors"
                            />
                            <div className="inline-flex bg-warm-100 rounded-lg p-1">
                              <Button variant="primary"
                                onClick={() => updateEditForm({ distanceUnitAfter: 'yards' })}
                                className={`px-3 py-2.5 min-h-[44px] rounded-md font-medium text-xs uppercase transition-colors ${
                                  editFormData.distanceUnitAfter === 'yards'
                                    ? 'bg-primary-600 text-white shadow-sm'
                                    : 'text-warm-600'
                                }`}
                              >
                                Yds
                              </Button>
                              <Button variant="primary"
                                onClick={() => updateEditForm({ distanceUnitAfter: 'feet' })}
                                className={`px-3 py-2.5 min-h-[44px] rounded-md font-medium text-xs uppercase transition-colors ${
                                  editFormData.distanceUnitAfter === 'feet'
                                    ? 'bg-primary-600 text-white shadow-sm'
                                    : 'text-warm-600'
                                }`}
                              >
                                Ft
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Miss Direction (for tee shots only — approach/around_green use ApproachMissSelector below) */}
                      {editingShot.shotType === 'tee' &&
                       editFormData.result !== 'hole' && editFormData.result !== 'green' && (
                        <div>
                          <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Miss Direction</p>
                          <div className="grid grid-cols-2 gap-2">
                            {['left', 'right', 'short', 'long'].map(dir => (
                              <Button variant="primary"
                                key={dir}
                                onClick={() => updateEditForm({ missDirection: editFormData.missDirection === dir ? null : dir })}
                                className={`py-3 min-h-[48px] rounded-lg font-medium text-sm capitalize transition-colors ${
                                  editFormData.missDirection === dir
                                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                                    : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                }`}
                              >
                                {dir}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Approach Miss Details (for approach/around_green misses) */}
                      {(editingShot.shotType === 'approach' || editingShot.shotType === 'around_green') &&
                       editFormData.result !== 'hole' && editFormData.result !== 'green' && (
                        <ApproachMissSelector
                          selectedDirection={editFormData.approachMissDirection}
                          onDirectionChange={(dir) => updateEditForm({ approachMissDirection: dir })}
                        />
                      )}

                      {/* Putt Details (for putting shots) */}
                      {editingShot.shotType === 'putting' && (
                        <>
                          <div>
                            <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Putt Break</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{v: 'left_to_right', l: 'L to R'}, {v: 'straight', l: 'Straight'}, {v: 'right_to_left', l: 'R to L'}, {v: 'multiple', l: 'Multiple'}].map(b => (
                                <Button variant="primary"
                                  key={b.v}
                                  onClick={() => updateEditForm({ puttBreak: b.v as ShotRecord['puttBreak'] })}
                                  className={`py-3 min-h-[48px] rounded-lg font-medium text-sm transition-colors ${
                                    editFormData.puttBreak === b.v
                                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                  }`}
                                >
                                  {b.l}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-eyebrow font-medium text-warm-600 uppercase tracking-wider mb-3">Putt Slope</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{v: 'uphill', l: 'Uphill'}, {v: 'level', l: 'Level'}, {v: 'downhill', l: 'Downhill'}, {v: 'severe', l: 'Severe'}].map(s => (
                                <Button variant="primary"
                                  key={s.v}
                                  onClick={() => updateEditForm({ puttSlope: s.v as ShotRecord['puttSlope'] })}
                                  className={`py-3 min-h-[48px] rounded-lg font-medium text-sm transition-colors ${
                                    editFormData.puttSlope === s.v
                                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                                      : 'bg-warm-50 text-warm-700 ring-1 ring-warm-200 hover:ring-primary-300'
                                  }`}
                                >
                                  {s.l}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {/* Putt Miss Tags (for missed putts) */}
                          {editFormData.result !== 'hole' && (
                            <PuttMissTagSelector
                              selectedTags={editFormData.puttMissTags}
                              onTagsChange={(tags) => updateEditForm({ puttMissTags: tags })}
                            />
                          )}
                        </>
                      )}

                      {/* Calculated Shot Distance */}
                      {editFormData.distanceToHoleBefore && editFormData.distanceToHoleAfter && (
                        <div className="flex items-center justify-between bg-primary-50 rounded-lg px-4 py-3 ring-1 ring-primary-200">
                          <span className="text-xs font-medium text-primary-700 uppercase tracking-wide">Calculated Distance</span>
                          <span className="text-body-lg font-medium tracking-[-0.005em] text-primary-700">
                            ~{Math.round(calculateShotDistanceWithDirection(
                              editFormData.distanceUnitBefore === 'feet' ? parseFloat(editFormData.distanceToHoleBefore) / 3 : parseFloat(editFormData.distanceToHoleBefore),
                              editFormData.distanceUnitAfter === 'feet' ? parseFloat(editFormData.distanceToHoleAfter) / 3 : parseFloat(editFormData.distanceToHoleAfter),
                              (editingShot.shotType === 'approach' || editingShot.shotType === 'around_green')
                                ? (editFormData.approachMissDirection || editFormData.missDirection)
                                : editFormData.missDirection
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
                  <IconButton variant="default"
                    onClick={() => dispatch({ type: 'SHOW_DELETE_CONFIRM' })}
                    disabled={editSaving}
                    className="px-4 py-3 rounded-xl font-medium text-sm text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors disabled:opacity-50 min-h-[44px]"
                    aria-label="Delete shot"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </IconButton>
                  <Button variant="ghost"
                    onClick={handleCloseEditModal}
                    disabled={editSaving}
                    className="flex-1 py-3 rounded-xl font-medium text-sm text-warm-700 bg-warm-100 hover:bg-warm-200 active:bg-warm-300 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    Cancel
                  </Button>
                  <Button variant="primary"
                    onClick={handleSaveEditedShot}
                    disabled={editSaving}
                    className="flex-1 py-3 rounded-xl font-medium text-sm bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm shadow-primary-950/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    {editSaving ? (
                      <>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                        </span>
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
