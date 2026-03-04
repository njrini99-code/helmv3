'use client';

import { useState, useCallback } from 'react';
import { useMobileDetection } from '@/hooks/use-mobile-detection';
import { useLocalStorage } from '@/hooks/use-local-storage';
import ShotTrackingComprehensive, { type HoleStats, type ShotRecord } from './ShotTrackingComprehensive';
import MobileScoreEntry from './MobileScoreEntry';

// ============================================================================
// TYPES
// ============================================================================

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

export type EntryMode = 'quick' | 'detailed';

interface RoundEntryModeToggleProps {
  holes: Hole[];
  currentHoleIndex: number;
  completedHoleStats: HoleStats[];
  onHoleComplete: (holeIndex: number, stats: HoleStats) => void;
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats) => void;
  onNavigateToHole: (holeIndex: number) => void;
  onExit: () => void;
  onSaveShot?: (shot: ShotRecord) => void;
  initialShots?: ShotRecord[];
  initialShotNumber?: number;
  defaultMode?: EntryMode;
}

const ENTRY_MODE_KEY = 'helm-golf-entry-mode';

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Wrapper component that allows switching between Quick (mobile) and Detailed (shot-by-shot) entry modes.
 *
 * On mobile devices, defaults to Quick mode.
 * On desktop, defaults to Detailed mode.
 * User preference is persisted.
 */
export default function RoundEntryModeToggle({
  holes,
  currentHoleIndex,
  completedHoleStats,
  onHoleComplete,
  onHoleStatsUpdate,
  onNavigateToHole,
  onExit,
  onSaveShot,
  initialShots = [],
  initialShotNumber = 1,
  defaultMode,
}: RoundEntryModeToggleProps) {
  const { isMobileDevice, preferMobileUI } = useMobileDetection();
  const [storedMode, setStoredMode] = useLocalStorage<EntryMode | null>(ENTRY_MODE_KEY, null);

  // Determine initial mode
  const getInitialMode = useCallback((): EntryMode => {
    // Use explicitly provided default first
    if (defaultMode) return defaultMode;
    // Then use stored preference
    if (storedMode) return storedMode;
    // Then auto-detect based on device
    return isMobileDevice || preferMobileUI ? 'quick' : 'detailed';
  }, [defaultMode, storedMode, isMobileDevice, preferMobileUI]);

  const [mode, setMode] = useState<EntryMode>(getInitialMode);

  // Sync mode preference to storage
  const handleModeChange = useCallback((newMode: EntryMode) => {
    setMode(newMode);
    setStoredMode(newMode);
  }, [setStoredMode]);

  const switchToQuick = useCallback(() => handleModeChange('quick'), [handleModeChange]);
  const switchToDetailed = useCallback(() => handleModeChange('detailed'), [handleModeChange]);

  // For Quick mode, we don't track individual shots
  // When switching from Quick to Detailed, we start fresh on the current hole

  if (mode === 'quick') {
    return (
      <MobileScoreEntry
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        completedHoleStats={completedHoleStats}
        onHoleComplete={onHoleComplete}
        onNavigateToHole={onNavigateToHole}
        onExit={onExit}
        onSwitchToDetailedMode={switchToDetailed}
      />
    );
  }

  // Detailed mode - full shot-by-shot tracking
  return (
    <div className="relative">
      {/* Mode toggle button - shown in detailed mode */}
      <div className="fixed bottom-4 right-4 z-50 lg:hidden">
        <button
          onClick={switchToQuick}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/95 backdrop-blur-sm
                     shadow-lg border border-warm-200 text-warm-700 font-medium text-sm
                     active:scale-95 transition-all"
          aria-label="Switch to quick entry mode"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Quick Mode
        </button>
      </div>

      <ShotTrackingComprehensive
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        onHoleComplete={onHoleComplete}
        onHoleStatsUpdate={onHoleStatsUpdate}
        onSaveShot={onSaveShot}
        onExit={onExit}
        onNavigateToHole={onNavigateToHole}
        initialShots={initialShots}
        initialShotNumber={initialShotNumber}
      />
    </div>
  );
}

// ============================================================================
// ENTRY MODE SELECTOR
// ============================================================================

interface EntryModeSelectorProps {
  currentMode: EntryMode;
  onModeChange: (mode: EntryMode) => void;
  className?: string;
}

/**
 * Standalone mode selector that can be used in round setup.
 */
export function EntryModeSelector({
  currentMode,
  onModeChange,
  className = '',
}: EntryModeSelectorProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
        Entry Mode
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onModeChange('quick')}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
            ${currentMode === 'quick'
              ? 'border-primary-500 bg-primary-50'
              : 'border-warm-200 bg-white hover:border-warm-300'
            }`}
        >
          <svg className={`w-8 h-8 ${currentMode === 'quick' ? 'text-primary-600' : 'text-warm-400'}`}
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div className="text-center">
            <p className={`font-semibold ${currentMode === 'quick' ? 'text-primary-700' : 'text-warm-700'}`}>
              Quick
            </p>
            <p className="text-xs text-warm-500 mt-0.5">
              Score, FW, GIR, Putts
            </p>
          </div>
        </button>

        <button
          onClick={() => onModeChange('detailed')}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
            ${currentMode === 'detailed'
              ? 'border-primary-500 bg-primary-50'
              : 'border-warm-200 bg-white hover:border-warm-300'
            }`}
        >
          <svg className={`w-8 h-8 ${currentMode === 'detailed' ? 'text-primary-600' : 'text-warm-400'}`}
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <div className="text-center">
            <p className={`font-semibold ${currentMode === 'detailed' ? 'text-primary-700' : 'text-warm-700'}`}>
              Detailed
            </p>
            <p className="text-xs text-warm-500 mt-0.5">
              Shot-by-shot tracking
            </p>
          </div>
        </button>
      </div>
      <p className="text-xs text-warm-500">
        {currentMode === 'quick'
          ? 'Perfect for on-course entry. Capture essential stats quickly.'
          : 'Full shot tracking for comprehensive analysis and insights.'}
      </p>
    </div>
  );
}
