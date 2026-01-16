import { useEffect, useRef, useCallback } from 'react';
import type { HoleStats } from '@/components/golf/ShotTrackingComprehensive';

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

interface RoundDraft {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  timestamp: number;
}

const DRAFT_KEY = 'golf_round_draft';
const DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Custom hook for auto-saving golf round drafts to localStorage
 * Prevents data loss when browser closes or refreshes
 */
export function useRoundDraft() {
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  /**
   * Save current round state to localStorage
   */
  const saveDraft = useCallback((draft: Omit<RoundDraft, 'timestamp'>) => {
    try {
      // Don't save if we're in setup step with no data
      if (draft.step === 'setup' && !draft.setupData.courseName) {
        return;
      }

      // Don't save if we're submitting (round is being saved to database)
      if (draft.step === 'submitting') {
        return;
      }

      const draftData: RoundDraft = {
        ...draft,
        timestamp: Date.now(),
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    } catch {
      // Silently fail - localStorage may be unavailable
    }
  }, []);

  /**
   * Save draft with debounce (wait 1 second after last change)
   */
  const saveDraftDebounced = useCallback((draft: Omit<RoundDraft, 'timestamp'>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(draft);
    }, 1000); // 1 second debounce
  }, [saveDraft]);

  /**
   * Clear draft from localStorage
   */
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Silently fail - localStorage may be unavailable
    }
  }, []);

  /**
   * Load draft from localStorage
   */
  const loadDraft = useCallback((): RoundDraft | null => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) return null;

      const draft: RoundDraft = JSON.parse(stored);

      // Check if draft has expired
      if (Date.now() - draft.timestamp > DRAFT_EXPIRY_MS) {
        clearDraft();
        return null;
      }

      return draft;
    } catch {
      // Silently fail - localStorage may be unavailable or data corrupted
      return null;
    }
  }, [clearDraft]);

  /**
   * Check if a draft exists
   */
  const hasDraft = useCallback((): boolean => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) return false;

      const draft: RoundDraft = JSON.parse(stored);

      // Check if expired
      if (Date.now() - draft.timestamp > DRAFT_EXPIRY_MS) {
        clearDraft();
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }, [clearDraft]);

  /**
   * Get draft age in minutes
   */
  const getDraftAge = useCallback((): number | null => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) return null;

      const draft: RoundDraft = JSON.parse(stored);
      const ageMs = Date.now() - draft.timestamp;
      return Math.floor(ageMs / 1000 / 60); // Convert to minutes
    } catch {
      return null;
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveDraft,
    saveDraftDebounced,
    loadDraft,
    clearDraft,
    hasDraft,
    getDraftAge,
  };
}
