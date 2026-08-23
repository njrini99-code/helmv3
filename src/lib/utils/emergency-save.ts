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
import {
  clearRoundRecoverySnapshotThrough,
  deleteRoundRecoverySnapshot,
  saveRoundRecoverySnapshot,
} from '@/lib/offline/shot-storage';

const EMERGENCY_SAVE_PREFIX = 'golf_emergency_save';
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
  /** Present only when a completed round could not be submitted. */
  submissionIntent?: 'submit';
}

/**
 * The portion of a round that determines whether a local emergency copy has
 * anything the server does not already have. Deliberately excludes navigation
 * state and timestamps: neither is player-entered progress.
 */
export interface EmergencySaveProgress {
  holes: RoundHole[];
  completedHoleStats: HoleStats[];
  inProgressShotsByHole: Record<number, ShotRecord[]>;
}

const queuedRecoverySnapshots = new Map<string, EmergencySaveData>();
let recoverySnapshotDrain: Promise<void> | null = null;

function recoverySnapshotKey(roundId?: string | null): string {
  return roundId ?? 'new';
}

/**
 * IndexedDB cannot be awaited from pagehide, but it can still mirror the
 * latest synchronous localStorage snapshot while the page is alive. Coalesce
 * repeated shot edits so a slow browser writes the newest state, not a noisy
 * queue of stale copies.
 */
function queueRecoverySnapshot(data: EmergencySaveData): void {
  queuedRecoverySnapshots.set(recoverySnapshotKey(data.roundId), data);
  if (recoverySnapshotDrain) return;

  recoverySnapshotDrain = (async () => {
    while (queuedRecoverySnapshots.size > 0) {
      const next = queuedRecoverySnapshots.entries().next().value as
        | [string, EmergencySaveData]
        | undefined;
      if (!next) break;
      const [key, snapshot] = next;
      queuedRecoverySnapshots.delete(key);
      try {
        await saveRoundRecoverySnapshot(snapshot);
      } catch {
        // localStorage is the synchronous primary fallback. IndexedDB failures
        // are intentionally non-fatal and are already rate-limited by the
        // storage layer when a browser backing store is unavailable.
      }
    }
  })().finally(() => {
    recoverySnapshotDrain = null;
    if (queuedRecoverySnapshots.size > 0) {
      const next = queuedRecoverySnapshots.values().next().value as EmergencySaveData | undefined;
      if (next) queueRecoverySnapshot(next);
    }
  });
}

function clearQueuedRecoverySnapshot(roundId?: string | null): Promise<void> {
  queuedRecoverySnapshots.delete(recoverySnapshotKey(roundId));
  return (recoverySnapshotDrain ?? Promise.resolve()).then(
    () => deleteRoundRecoverySnapshot(roundId),
    () => deleteRoundRecoverySnapshot(roundId),
  ).catch(() => {
    // The localStorage clear below is still authoritative when IndexedDB is
    // unavailable. Never surface a cache-cleanup failure to a golfer.
  });
}

function clearQueuedRecoverySnapshotThrough(
  roundId: string | null | undefined,
  acknowledgedTimestamp: number,
): void {
  void (recoverySnapshotDrain ?? Promise.resolve())
    .then(() => clearRoundRecoverySnapshotThrough(roundId, acknowledgedTimestamp))
    .catch(() => {
      // Same best-effort semantics as the IndexedDB mirror above.
    });
}

/**
 * Compare persisted progress independent of server-generated shot IDs and
 * object key order. This is intentionally strict about every other field:
 * when there is any doubt that local data differs, recovery remains available.
 */
export function isEmergencySaveEquivalentToProgress(
  emergencySaveData: EmergencySaveData,
  serverProgress: EmergencySaveProgress,
): boolean {
  return canonicalizeProgress({
    holes: emergencySaveData.holes,
    completedHoleStats: emergencySaveData.completedHoleStats,
    inProgressShotsByHole: emergencySaveData.inProgressShotsByHole,
  }) === canonicalizeProgress(serverProgress);
}

/**
 * Remove an emergency save only when it is no newer than the snapshot the
 * server has acknowledged. A pagehide or later edit may have written a newer
 * copy while an async save was in flight; that copy must remain recoverable.
 */
export function clearEmergencySaveThrough(
  roundId: string | null | undefined,
  acknowledgedTimestamp: number,
): void {
  const current = loadEmergencySave(roundId);
  if (!current || current.timestamp <= acknowledgedTimestamp) {
    try {
      localStorage.removeItem(
        roundId
          ? `${EMERGENCY_SAVE_PREFIX}_${roundId}`
          : `${EMERGENCY_SAVE_PREFIX}_new`,
      );
    } catch {
      // A browser storage failure must not prevent the IndexedDB comparison
      // below from preserving any newer recovery copy.
    }
  }
  clearQueuedRecoverySnapshotThrough(roundId, acknowledgedTimestamp);
}

/**
 * Synchronously save round data to localStorage.
 * This is safe to call in visibilitychange/pagehide handlers because
 * localStorage.setItem is synchronous and completes before the page freezes.
 */
export function emergencySave(data: EmergencySaveData): boolean {
  // Start the independent browser-database mirror before the local write. The
  // promise is deliberately not awaited: localStorage must remain synchronous
  // for phone lock/app-switch safety, while the mirror protects against quota
  // pressure or a later localStorage eviction.
  queueRecoverySnapshot(data);

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
        if (Number.isFinite(parsed.timestamp)) {
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
      if (Number.isFinite(parsed.timestamp)) {
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
 * Load the freshest emergency save from this browser.
 *
 * A round can receive a server ID after its first successful auto-save. If a
 * later child write fails, the emergency copy is keyed by that ID rather than
 * `_new`; after the server row is unavailable, recovery must still be able to
 * find that local copy. Callers restore it as a fresh round unless they have
 * independently confirmed that the server round still exists.
 */
export function loadLatestEmergencySave(): EmergencySaveData | null {
  try {
    let latest: EmergencySaveData | null = null;
    const keys: string[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${EMERGENCY_SAVE_PREFIX}_`)) keys.push(key);
    }

    // Snapshot keys before removing malformed entries. Mutating localStorage
    // during indexed iteration shifts the following item into the current
    // slot and otherwise skips a valid, recoverable save.
    for (const key of keys) {

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw) as EmergencySaveData;
        if (!Number.isFinite(parsed.timestamp)) {
          localStorage.removeItem(key);
          continue;
        }

        if (!latest || parsed.timestamp > latest.timestamp) {
          latest = parsed;
        }
      } catch {
        // Skip malformed saves. Do not let one corrupt key hide another
        // recoverable round on the same device.
      }
    }

    return latest;
  } catch {
    return null;
  }
}

/**
 * Clear emergency save for a given round.
 */
export function clearEmergencySave(roundId?: string | null): void {
  void clearQueuedRecoverySnapshot(roundId);
  try {
    if (roundId) {
      // Clear ONLY this round's key. Do NOT touch the `_new` draft — that may be
      // a separate in-progress new round, and removing it here would wipe it
      // (cross-draft data loss).
      localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_${roundId}`);
      return;
    }
    // No roundId → we're clearing the new-round draft.
    localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_new`);
  } catch {
    // Ignore
  }
}

function canonicalizeProgress(progress: EmergencySaveProgress): string {
  return JSON.stringify(canonicalize(progress));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        // Database reads attach stable server IDs to shots. IDs do not change
        // the golfer's progress and must not make an otherwise identical
        // fallback look newer than the server.
        .filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }

  return value;
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
 * Remove only malformed emergency saves. Active rounds do not expire: a
 * golfer's unfinished shots remain recoverable until the player completes or
 * deletes the round (or explicitly clears browser storage).
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
            if (!Number.isFinite(parsed.timestamp)) {
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
