'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { saveRoundDraft, loadRoundDraft, clearRoundDraft } from '@/app/golf/actions/round-drafts';
import type { HoleStats } from '@/components/golf/ShotTrackingComprehensive';

// Types
interface RoundSetupForm {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

export interface RoundDraftData {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  selectedQualifierId?: string | null;
  selectedRoundNumber?: number | null;
}

export interface SaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'offline';
  lastSaved: Date | null;
  error: string | null;
}

interface UseAutoSaveRoundOptions {
  /** Auto-save interval in milliseconds (default: 30000 = 30 seconds) */
  interval?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
}

const DEFAULT_INTERVAL = 30000; // 30 seconds
const DEBOUNCE_DELAY = 2000; // 2 seconds debounce for rapid changes
// Note: OFFLINE_RETRY_DELAY is reserved for future offline retry logic
void (5000); // 5 seconds retry when offline
const LOCAL_STORAGE_KEY = 'golf_round_draft_backup';

/**
 * Enhanced auto-save hook for golf rounds with database persistence and offline support.
 *
 * Features:
 * - Auto-saves to database every 30 seconds when data changes
 * - Debounces rapid changes
 * - Falls back to localStorage when offline
 * - Provides visual save status indicators
 * - Queues saves for retry when offline
 */
export function useAutoSaveRound(
  roundId: string | null,
  options: UseAutoSaveRoundOptions = {}
) {
  const { interval = DEFAULT_INTERVAL, enabled = true } = options;

  // State
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    status: 'idle',
    lastSaved: null,
    error: null,
  });
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(roundId);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Refs for managing timers and preventing stale closures
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<RoundDraftData | null>(null);
  const pendingSaveRef = useRef<RoundDraftData | null>(null);
  const isMountedRef = useRef(true);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Retry pending save when back online
      if (pendingSaveRef.current) {
        performSave(pendingSaveRef.current);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSaveStatus(prev => ({ ...prev, status: 'offline' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Event listeners set up once on mount; performSave is accessed via pendingSaveRef to avoid re-subscribing
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, []);

  /**
   * Save to localStorage as backup (for offline or as fallback)
   */
  const saveToLocalStorage = useCallback((data: RoundDraftData) => {
    try {
      const backup = {
        data,
        timestamp: Date.now(),
        roundId: currentRoundId,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(backup));
    } catch {
      // localStorage may be unavailable - silently fail
    }
  }, [currentRoundId]);

  /**
   * Load from localStorage backup
   */
  const loadFromLocalStorage = useCallback((): RoundDraftData | null => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!stored) return null;

      const backup = JSON.parse(stored);
      // Check if backup is less than 7 days old
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - backup.timestamp > sevenDays) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return null;
      }

      return backup.data;
    } catch {
      return null;
    }
  }, []);

  /**
   * Clear localStorage backup
   */
  const clearLocalStorage = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Silently fail
    }
  }, []);

  /**
   * Perform the actual save to database
   */
  const performSave = useCallback(async (data: RoundDraftData) => {
    if (!isMountedRef.current) return;

    // Don't save if we're submitting or in initial setup with no data
    if (data.step === 'submitting') return;
    if (data.step === 'setup' && !data.setupData.courseName) return;

    // Always save to localStorage as backup
    saveToLocalStorage(data);

    // If offline, queue for later
    if (!isOnline) {
      pendingSaveRef.current = data;
      setSaveStatus({
        status: 'offline',
        lastSaved: saveStatus.lastSaved,
        error: 'Saving offline - will sync when connected',
      });
      return;
    }

    setSaveStatus(prev => ({ ...prev, status: 'saving', error: null }));

    try {
      const result = await saveRoundDraft(data, currentRoundId ?? undefined);

      if (!isMountedRef.current) return;

      if (result.success) {
        // Update round ID if this was a new draft
        if (result.data.roundId && result.data.roundId !== currentRoundId) {
          setCurrentRoundId(result.data.roundId);
        }

        pendingSaveRef.current = null;
        setSaveStatus({
          status: 'saved',
          lastSaved: new Date(),
          error: null,
        });

        // Reset to idle after 3 seconds
        setTimeout(() => {
          if (isMountedRef.current) {
            setSaveStatus(prev =>
              prev.status === 'saved' ? { ...prev, status: 'idle' } : prev
            );
          }
        }, 3000);
      } else {
        setSaveStatus({
          status: 'error',
          lastSaved: saveStatus.lastSaved,
          error: result.error,
        });
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      setSaveStatus({
        status: 'error',
        lastSaved: saveStatus.lastSaved,
        error: error instanceof Error ? error.message : 'Failed to save draft',
      });
    }
  }, [currentRoundId, isOnline, saveToLocalStorage, saveStatus.lastSaved]);

  /**
   * Schedule a save with debounce
   */
  const scheduleSave = useCallback((data: RoundDraftData) => {
    lastDataRef.current = data;

    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce rapid changes
    debounceRef.current = setTimeout(() => {
      if (lastDataRef.current) {
        performSave(lastDataRef.current);
      }
    }, DEBOUNCE_DELAY);
  }, [performSave]);

  /**
   * Manual save trigger (bypasses debounce)
   */
  const saveNow = useCallback(async (data: RoundDraftData) => {
    // Clear any pending debounced save
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    await performSave(data);
  }, [performSave]);

  /**
   * Set up interval-based auto-save
   */
  useEffect(() => {
    if (!enabled) return;

    // Set up periodic check for changes
    intervalRef.current = setInterval(() => {
      if (lastDataRef.current && isOnline) {
        performSave(lastDataRef.current);
      }
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, isOnline, performSave]);

  /**
   * Load existing draft
   */
  const loadDraft = useCallback(async (): Promise<{
    data: RoundDraftData | null;
    roundId: string | null;
    source: 'database' | 'localStorage' | null;
  }> => {
    // Try database first
    try {
      const result = await loadRoundDraft();
      if (result.success && result.data) {
        setCurrentRoundId(result.data.roundId);
        return {
          data: result.data.draftData,
          roundId: result.data.roundId,
          source: 'database',
        };
      }
    } catch {
      // Fall through to localStorage
    }

    // Fall back to localStorage
    const localData = loadFromLocalStorage();
    if (localData) {
      return {
        data: localData,
        roundId: null,
        source: 'localStorage',
      };
    }

    return { data: null, roundId: null, source: null };
  }, [loadFromLocalStorage]);

  /**
   * Clear draft from both database and localStorage
   */
  const clearDraft = useCallback(async () => {
    clearLocalStorage();
    lastDataRef.current = null;
    pendingSaveRef.current = null;

    if (currentRoundId) {
      try {
        await clearRoundDraft(currentRoundId);
      } catch {
        // Silently fail - draft may already be deleted
      }
    }

    setCurrentRoundId(null);
    setSaveStatus({ status: 'idle', lastSaved: null, error: null });
  }, [currentRoundId, clearLocalStorage]);

  /**
   * Format time since last save for display
   */
  const getTimeSinceLastSave = useCallback((): string | null => {
    if (!saveStatus.lastSaved) return null;

    const seconds = Math.floor(
      (Date.now() - saveStatus.lastSaved.getTime()) / 1000
    );

    if (seconds < 60) return 'just now';
    if (seconds < 120) return '1 minute ago';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 7200) return '1 hour ago';
    return `${Math.floor(seconds / 3600)} hours ago`;
  }, [saveStatus.lastSaved]);

  return {
    // Save functions
    scheduleSave,
    saveNow,
    loadDraft,
    clearDraft,

    // Status
    saveStatus,
    isOnline,
    roundId: currentRoundId,
    getTimeSinceLastSave,

    // Direct status checks
    isSaving: saveStatus.status === 'saving',
    hasSaved: saveStatus.lastSaved !== null,
    hasError: saveStatus.status === 'error',
    isOffline: saveStatus.status === 'offline',
  };
}
