'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import { useHapticFeedback } from '@/hooks/use-mobile-detection';
import type { HoleStats } from './ShotTrackingComprehensive';

// ============================================================================
// TYPES
// ============================================================================

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

interface QuickHoleEntry {
  score: number;
  putts: number;
  fairwayHit: boolean | null; // null for par 3s
  greenInRegulation: boolean;
}

interface MobileScoreEntryProps {
  holes: Hole[];
  currentHoleIndex: number;
  completedHoleStats: HoleStats[];
  onHoleComplete: (holeIndex: number, stats: HoleStats) => void;
  onNavigateToHole: (holeIndex: number) => void;
  onExit: () => void;
  onSwitchToDetailedMode?: () => void;
}

// ============================================================================
// SWIPE GESTURE HOOK
// ============================================================================

interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  isSwiping: boolean;
}

function useSwipeGesture(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold = 50
) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    isSwiping: false,
  });
  const { triggerHaptic } = useHapticFeedback();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setSwipeState({
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      isSwiping: true,
    });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeState.isSwiping) return;
    const touch = e.touches[0];
    if (!touch) return;

    // Check if horizontal movement is dominant
    const deltaX = Math.abs(touch.clientX - swipeState.startX);
    const deltaY = Math.abs(touch.clientY - swipeState.startY);

    if (deltaY > deltaX) {
      // Vertical scroll, cancel swipe
      setSwipeState((prev) => ({ ...prev, isSwiping: false }));
      return;
    }

    setSwipeState((prev) => ({ ...prev, currentX: touch.clientX }));
  }, [swipeState.isSwiping, swipeState.startX, swipeState.startY]);

  const handleTouchEnd = useCallback(() => {
    if (!swipeState.isSwiping) return;

    const deltaX = swipeState.currentX - swipeState.startX;

    if (Math.abs(deltaX) > threshold) {
      triggerHaptic('light');
      if (deltaX < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    }

    setSwipeState({
      startX: 0,
      startY: 0,
      currentX: 0,
      isSwiping: false,
    });
  }, [swipeState, threshold, onSwipeLeft, onSwipeRight, triggerHaptic]);

  const swipeOffset = swipeState.isSwiping
    ? swipeState.currentX - swipeState.startX
    : 0;

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    swipeOffset,
    isSwiping: swipeState.isSwiping,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MobileScoreEntry({
  holes,
  currentHoleIndex,
  completedHoleStats,
  onHoleComplete,
  onNavigateToHole,
  onExit,
  onSwitchToDetailedMode,
}: MobileScoreEntryProps) {
  const { hide, show } = useMobileNav();
  const { triggerHaptic } = useHapticFeedback();
  const currentHole = holes[currentHoleIndex];

  // Hide mobile nav when active
  useEffect(() => {
    hide();
    return () => show();
  }, [hide, show]);

  // Existing stats for current hole if editing
  const existingStats = completedHoleStats[currentHoleIndex];

  // Quick entry state
  const [entry, setEntry] = useState<QuickHoleEntry>(() => ({
    score: existingStats?.score ?? currentHole?.par ?? 4,
    putts: existingStats?.putts ?? 2,
    fairwayHit: existingStats?.fairwayHit ?? (currentHole?.par === 3 ? null : null),
    greenInRegulation: existingStats?.greenInRegulation ?? false,
  }));

  // Reset entry when hole changes
  useEffect(() => {
    const stats = completedHoleStats[currentHoleIndex];
    const hole = holes[currentHoleIndex];
    if (!hole) return;

    setEntry({
      score: stats?.score ?? hole.par,
      putts: stats?.putts ?? 2,
      fairwayHit: stats?.fairwayHit ?? (hole.par === 3 ? null : null),
      greenInRegulation: stats?.greenInRegulation ?? false,
    });
  }, [currentHoleIndex, completedHoleStats, holes]);

  // Navigation
  const canGoBack = currentHoleIndex > 0;
  const canGoForward = currentHoleIndex < holes.length - 1;

  const goToPrevHole = useCallback(() => {
    if (canGoBack) {
      triggerHaptic('light');
      onNavigateToHole(currentHoleIndex - 1);
    }
  }, [canGoBack, currentHoleIndex, onNavigateToHole, triggerHaptic]);

  const goToNextHole = useCallback(() => {
    if (canGoForward) {
      triggerHaptic('light');
      onNavigateToHole(currentHoleIndex + 1);
    }
  }, [canGoForward, currentHoleIndex, onNavigateToHole, triggerHaptic]);

  // Swipe navigation
  const { handlers: swipeHandlers, swipeOffset, isSwiping } = useSwipeGesture(
    goToNextHole,
    goToPrevHole,
    80
  );

  // Score adjustment
  const adjustScore = useCallback((delta: number) => {
    triggerHaptic('light');
    setEntry((prev) => ({
      ...prev,
      score: Math.max(1, Math.min(15, prev.score + delta)),
    }));
  }, [triggerHaptic]);

  const setScoreToPar = useCallback(() => {
    if (!currentHole) return;
    triggerHaptic('medium');
    setEntry((prev) => ({ ...prev, score: currentHole.par }));
  }, [currentHole, triggerHaptic]);

  // Stat toggles
  const toggleFairway = useCallback((value: boolean) => {
    triggerHaptic('light');
    setEntry((prev) => ({ ...prev, fairwayHit: value }));
  }, [triggerHaptic]);

  const toggleGIR = useCallback((value: boolean) => {
    triggerHaptic('light');
    setEntry((prev) => ({ ...prev, greenInRegulation: value }));
  }, [triggerHaptic]);

  const setPutts = useCallback((putts: number) => {
    triggerHaptic('light');
    setEntry((prev) => ({ ...prev, putts }));
  }, [triggerHaptic]);

  // Save and advance
  const saveHole = useCallback(() => {
    if (!currentHole) return;
    triggerHaptic('success');

    // Build minimal HoleStats for quick entry
    const holeStats: HoleStats = {
      holeNumber: currentHole.number,
      par: currentHole.par,
      yardage: currentHole.yardage,
      score: entry.score,
      putts: entry.putts,
      fairwayHit: entry.fairwayHit,
      greenInRegulation: entry.greenInRegulation,
      drivingDistance: null,
      usedDriver: null,
      driveMissDirection: null,
      approachDistance: null,
      approachLie: null,
      approachProximity: null,
      approachMissDirection: null,
      scrambleAttempt: !entry.greenInRegulation,
      scrambleMade: !entry.greenInRegulation && entry.score <= currentHole.par,
      sandSaveAttempt: false,
      sandSaveMade: false,
      penaltyStrokes: 0,
      firstPuttDistance: null,
      firstPuttLeave: null,
      firstPuttBreak: null,
      firstPuttSlope: null,
      firstPuttMissDirection: null,
      holedOutDistance: null,
      holedOutType: null,
      shots: [], // Quick entry doesn't track individual shots
    };

    onHoleComplete(currentHoleIndex, holeStats);
  }, [currentHole, currentHoleIndex, entry, onHoleComplete, triggerHaptic]);

  // Progress calculation
  const completedCount = completedHoleStats.filter((s) => s?.score != null).length;
  const progressPercent = (completedCount / holes.length) * 100;

  // Score color
  const getScoreColor = (score: number, par: number) => {
    const diff = score - par;
    if (diff <= -2) return 'text-yellow-500'; // Eagle+
    if (diff === -1) return 'text-emerald-500'; // Birdie
    if (diff === 0) return 'text-slate-800'; // Par
    if (diff === 1) return 'text-amber-500'; // Bogey
    return 'text-red-500'; // Double+
  };

  const getScoreBgColor = (score: number, par: number) => {
    const diff = score - par;
    if (diff <= -2) return 'bg-yellow-50 border-yellow-200'; // Eagle+
    if (diff === -1) return 'bg-emerald-50 border-emerald-200'; // Birdie
    if (diff === 0) return 'bg-slate-50 border-slate-200'; // Par
    if (diff === 1) return 'bg-amber-50 border-amber-200'; // Bogey
    return 'bg-red-50 border-red-200'; // Double+
  };

  if (!currentHole) {
    return (
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <p className="text-lg text-slate-600">No hole data available</p>
      </div>
    );
  }

  const scoreToPar = entry.score - currentHole.par;
  const scoreLabel =
    scoreToPar <= -2
      ? 'Eagle'
      : scoreToPar === -1
        ? 'Birdie'
        : scoreToPar === 0
          ? 'Par'
          : scoreToPar === 1
            ? 'Bogey'
            : scoreToPar === 2
              ? 'Double'
              : `+${scoreToPar}`;

  return (
    <div className="min-h-full bg-transparent flex flex-col select-none">
      {/* Header with progress */}
      <div className="bg-slate-900 text-white px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white active:scale-95 transition-all min-h-[44px] px-2"
            aria-label="Save and exit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Exit
          </button>

          <div className="text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wide">Round Progress</div>
            <div className="text-sm font-semibold">{completedCount} of {holes.length}</div>
          </div>

          {onSwitchToDetailedMode && (
            <button
              onClick={onSwitchToDetailedMode}
              className="text-sm font-medium text-emerald-400 hover:text-emerald-300 active:scale-95 transition-all min-h-[44px] px-2"
              aria-label="Switch to detailed shot tracking"
            >
              Detailed
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main swipeable content */}
      <div
        {...swipeHandlers}
        className="flex-1 flex flex-col touch-pan-y"
        style={{
          transform: isSwiping ? `translateX(${swipeOffset * 0.3}px)` : 'translateX(0)',
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Hole navigation */}
        <div className="flex items-center justify-between px-4 py-4 bg-white/50 backdrop-blur-sm border-b border-slate-200/50">
          <button
            onClick={goToPrevHole}
            disabled={!canGoBack}
            className="flex items-center gap-1 text-slate-600 disabled:opacity-30 active:scale-95 transition-all min-h-[48px] min-w-[48px] justify-center"
            aria-label="Previous hole"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-bold text-slate-900">Hole {currentHole.number}</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-sm font-semibold text-slate-600">
                Par {currentHole.par}
              </span>
            </div>
            <div className="text-sm text-slate-500 mt-0.5">{currentHole.yardage} yards</div>
          </div>

          <button
            onClick={goToNextHole}
            disabled={!canGoForward}
            className="flex items-center gap-1 text-slate-600 disabled:opacity-30 active:scale-95 transition-all min-h-[48px] min-w-[48px] justify-center"
            aria-label="Next hole"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Score display and adjustment */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          {/* Large score display */}
          <div
            className={`relative flex flex-col items-center justify-center w-48 h-48 rounded-full border-4 ${getScoreBgColor(entry.score, currentHole.par)} shadow-lg`}
            onDoubleClick={setScoreToPar}
          >
            <span className={`text-7xl font-bold ${getScoreColor(entry.score, currentHole.par)}`}>
              {entry.score}
            </span>
            <span className={`text-lg font-semibold mt-1 ${getScoreColor(entry.score, currentHole.par)}`}>
              {scoreLabel}
            </span>
            <div className="absolute -bottom-2 text-xs text-slate-400 bg-white px-2 py-0.5 rounded">
              Double-tap for par
            </div>
          </div>

          {/* +/- buttons */}
          <div className="flex items-center gap-8 mt-8">
            <button
              onClick={() => adjustScore(-1)}
              disabled={entry.score <= 1}
              className="w-20 h-20 rounded-full bg-white border-2 border-slate-200 shadow-md
                         flex items-center justify-center text-4xl font-bold text-slate-700
                         active:scale-90 active:bg-slate-50 disabled:opacity-30 transition-all"
              aria-label="Decrease score"
            >
              -
            </button>
            <button
              onClick={() => adjustScore(1)}
              disabled={entry.score >= 15}
              className="w-20 h-20 rounded-full bg-white border-2 border-slate-200 shadow-md
                         flex items-center justify-center text-4xl font-bold text-slate-700
                         active:scale-90 active:bg-slate-50 disabled:opacity-30 transition-all"
              aria-label="Increase score"
            >
              +
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="bg-white border-t border-slate-200 px-4 py-5">
          {/* Fairway (Par 4 & 5 only) */}
          {currentHole.par >= 4 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Fairway Hit?
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => toggleFairway(true)}
                  className={`py-3.5 rounded-xl font-semibold text-base transition-all active:scale-95
                    ${entry.fairwayHit === true
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => toggleFairway(false)}
                  className={`py-3.5 rounded-xl font-semibold text-base transition-all active:scale-95
                    ${entry.fairwayHit === false
                      ? 'bg-red-500 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* GIR */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Green in Regulation?
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleGIR(true)}
                className={`py-3.5 rounded-xl font-semibold text-base transition-all active:scale-95
                  ${entry.greenInRegulation
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Yes
              </button>
              <button
                onClick={() => toggleGIR(false)}
                className={`py-3.5 rounded-xl font-semibold text-base transition-all active:scale-95
                  ${!entry.greenInRegulation
                    ? 'bg-red-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                No
              </button>
            </div>
          </div>

          {/* Putts */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Putts
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 0].map((p) => (
                <button
                  key={p}
                  onClick={() => setPutts(p === 0 ? 4 : p)}
                  className={`py-3.5 rounded-xl font-semibold text-base transition-all active:scale-95
                    ${(p === 0 ? entry.putts >= 4 : entry.putts === p)
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {p === 0 ? '4+' : p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="bg-white border-t border-slate-200 px-4 py-4 safe-area-bottom">
          <div className="grid grid-cols-2 gap-3">
            {canGoBack && (
              <button
                onClick={goToPrevHole}
                className="py-4 rounded-xl bg-slate-100 text-slate-700 font-semibold text-base
                           active:scale-95 active:bg-slate-200 transition-all"
              >
                Previous
              </button>
            )}
            <button
              onClick={saveHole}
              className={`py-4 rounded-xl bg-emerald-500 text-white font-semibold text-base
                          shadow-lg shadow-emerald-500/25 active:scale-95 active:bg-emerald-600 transition-all
                          ${!canGoBack ? 'col-span-2' : ''}`}
            >
              {currentHoleIndex === holes.length - 1 ? 'Finish Round' : 'Save & Next'}
            </button>
          </div>
        </div>
      </div>

      {/* Hole quick navigation dots */}
      <HoleNavigationDots
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        completedHoleStats={completedHoleStats}
        onNavigateToHole={onNavigateToHole}
      />
    </div>
  );
}

// ============================================================================
// HOLE NAVIGATION DOTS
// ============================================================================

interface HoleNavigationDotsProps {
  holes: Hole[];
  currentHoleIndex: number;
  completedHoleStats: HoleStats[];
  onNavigateToHole: (index: number) => void;
}

function HoleNavigationDots({
  holes,
  currentHoleIndex,
  completedHoleStats,
  onNavigateToHole,
}: HoleNavigationDotsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { triggerHaptic } = useHapticFeedback();

  // Auto-scroll to current hole
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeButton = container.querySelector(`[data-hole="${currentHoleIndex}"]`);
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentHoleIndex]);

  const handleHoleClick = (index: number) => {
    triggerHaptic('light');
    onNavigateToHole(index);
  };

  return (
    <div
      ref={containerRef}
      className="pills-scroll px-4 py-3 bg-slate-800"
    >
      {holes.map((hole, index) => {
        const isActive = index === currentHoleIndex;
        const stats = completedHoleStats[index];
        const isCompleted = stats?.score != null;

        let dotColor = 'bg-slate-600';
        if (isActive) {
          dotColor = 'bg-emerald-500 ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-800';
        } else if (isCompleted) {
          const diff = (stats?.score ?? 0) - hole.par;
          if (diff <= -2) dotColor = 'bg-yellow-400';
          else if (diff === -1) dotColor = 'bg-emerald-400';
          else if (diff === 0) dotColor = 'bg-white';
          else if (diff === 1) dotColor = 'bg-amber-400';
          else dotColor = 'bg-red-400';
        }

        return (
          <button
            key={hole.number}
            data-hole={index}
            onClick={() => handleHoleClick(index)}
            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                        text-xs font-bold transition-all active:scale-90 ${dotColor}
                        ${isCompleted || isActive ? 'text-slate-900' : 'text-white'}`}
            aria-label={`Hole ${hole.number}${isCompleted ? `, score ${stats?.score}` : ''}`}
            aria-current={isActive ? 'true' : undefined}
          >
            {isCompleted ? stats?.score : hole.number}
          </button>
        );
      })}
    </div>
  );
}
