/**
 * Emergency localStorage save for golf round data.
 *
 * This module provides SYNCHRONOUS localStorage writes that are guaranteed
 * to complete before the browser freezes the page (e.g. on app switch / phone lock).
 *
 * Used as a safety net in visibilitychange/pagehide handlers, where async
 * server actions (savePartialRound) may be killed by the browser.
 */

import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';

const EMERGENCY_SAVE_PREFIX = 'golf_emergency_save';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const NON_RECOVERABLE_SUBMIT_ERROR_PATTERNS = [
  'already been completed',
  'already been submitted',
  'may have already been completed',
  'cannot submit round: hole',
  'total score appears invalid',
  'zero putts on every hole is not valid',
  'invalid round data',
  'qualifier not found',
  'you are not entered in this qualifier',
  'already submitted round',
  'exceeds the qualifier',
];
const RECOVERABLE_SUBMIT_ERROR_PATTERNS = [
  'data was preserved',
  'failed to submit round',
  'failed to save round',
  'timed out',
  'server error',
  'server action',
  'failed to fetch',
  'network',
  'concurrent save',
];

export interface EmergencySaveData {
  roundId: string | null;
  timestamp: number;
  setupData: {
    courseName: string;
    courseCity: string;
    courseState: string;
    courseRating: string;
    courseSlope: string;
    teesPlayed: string;
    roundType: 'practice' | 'tournament' | 'qualifier';
    roundDate: string;
    qualifierId?: string;
    qualifierRoundNumber?: number;
  };
  holes: RoundHole[];
  completedHoleStats: HoleStats[];
  inProgressShotsByHole: Record<number, ShotRecord[]>;
  currentHoleIndex: number;
  holesPerRound?: 9 | 18;
}

/**
 * Synchronously save round data to localStorage.
 * This is safe to call in visibilitychange/pagehide handlers because
 * localStorage.setItem is synchronous and completes before the page freezes.
 */
export function emergencySave(data: EmergencySaveData): boolean {
  try {
    const key = data.roundId
      ? `${EMERGENCY_SAVE_PREFIX}_${data.roundId}`
      : `${EMERGENCY_SAVE_PREFIX}_new`;
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    // localStorage may be full or unavailable (private browsing) — try compacting
    try {
      // Remove old emergency saves to free space, then retry
      cleanupOldEmergencySaves();
      const key = data.roundId
        ? `${EMERGENCY_SAVE_PREFIX}_${data.roundId}`
        : `${EMERGENCY_SAVE_PREFIX}_new`;
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Load the most recent emergency save for a given round (or new round).
 */
export function loadEmergencySave(roundId?: string | null): EmergencySaveData | null {
  try {
    if (roundId) {
      // When a specific round ID is provided, ONLY check that key.
      // Don't fall through to _new — that could be a different round entirely.
      const data = localStorage.getItem(`${EMERGENCY_SAVE_PREFIX}_${roundId}`);
      if (data) {
        const parsed = JSON.parse(data) as EmergencySaveData;
        if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
          return parsed;
        }
        localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_${roundId}`);
      }
      return null;
    }

    // Only check _new key when no roundId is provided
    const newData = localStorage.getItem(`${EMERGENCY_SAVE_PREFIX}_new`);
    if (newData) {
      const parsed = JSON.parse(newData) as EmergencySaveData;
      if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
        return parsed;
      }
      localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_new`);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Clear emergency save for a given round.
 */
export function clearEmergencySave(roundId?: string | null): void {
  try {
    if (roundId) {
      localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_${roundId}`);
    }
    localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_new`);
  } catch {
    // Ignore
  }
}

/**
 * Heuristic for submit failures where the player's data should be handed off to
 * the recovery flow instead of leaving them on a dead-end error screen.
 */
export function isRecoverableRoundSubmitError(message?: string): boolean {
  if (typeof message !== 'string' || message.trim().length === 0) {
    return true;
  }

  const normalized = message.toLowerCase();
  if (NON_RECOVERABLE_SUBMIT_ERROR_PATTERNS.some(pattern => normalized.includes(pattern))) {
    return false;
  }

  return RECOVERABLE_SUBMIT_ERROR_PATTERNS.some(pattern => normalized.includes(pattern));
}

/**
 * Remove emergency saves older than MAX_AGE_MS.
 */
function cleanupOldEmergencySaves(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(EMERGENCY_SAVE_PREFIX)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.timestamp > MAX_AGE_MS) {
              keysToRemove.push(key);
            }
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}
