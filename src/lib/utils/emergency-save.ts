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
  /**
   * The authenticated golf-player record that created this local backup.
   * Recovery storage is shared by every account that signs in on the same
   * browser profile, so this is required to prevent one player's shots from
   * appearing in another player's recovery flow.
   */
  playerId: string;
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

type RecoverySnapshotOperation =
  | { type: 'save'; data: EmergencySaveData }
  | { type: 'clear'; roundId: string | null | undefined; playerId: string }
  | {
    type: 'clear-through';
    roundId: string | null | undefined;
    playerId: string;
    acknowledgedTimestamp: number;
  };

const queuedRecoverySnapshotOperations: RecoverySnapshotOperation[] = [];
let recoverySnapshotDrain: Promise<void> | null = null;

function recoverySnapshotKey(roundId: string | null | undefined, playerId: string): string {
  return `${roundId ?? 'new'}:${playerId}`;
}

function emergencySaveStorageKey(roundId: string | null | undefined, playerId: string): string {
  // Server round IDs are globally unique. A pre-persistence new-round draft
  // has no such identity, so its key must include the account owner.
  return roundId
    ? `${EMERGENCY_SAVE_PREFIX}_${roundId}`
    : `${EMERGENCY_SAVE_PREFIX}_new_${playerId}`;
}

function startRecoverySnapshotDrain(): Promise<void> {
  if (recoverySnapshotDrain) return recoverySnapshotDrain;

  recoverySnapshotDrain = (async () => {
    while (queuedRecoverySnapshotOperations.length > 0) {
      const operation = queuedRecoverySnapshotOperations.shift();
      if (!operation) continue;

      try {
        if (operation.type === 'save') {
          await saveRoundRecoverySnapshot(operation.data);
        } else if (operation.type === 'clear') {
          await deleteRoundRecoverySnapshot(operation.roundId, operation.playerId);
        } else {
          await clearRoundRecoverySnapshotThrough(
            operation.roundId,
            operation.playerId,
            operation.acknowledgedTimestamp,
          );
        }
      } catch {
        // localStorage is the synchronous primary fallback. IndexedDB failures
        // are intentionally non-fatal and are already rate-limited by the
        // storage layer when a browser backing store is unavailable.
      }
    }
  })().finally(() => {
    recoverySnapshotDrain = null;
    if (queuedRecoverySnapshotOperations.length > 0) {
      void startRecoverySnapshotDrain();
    }
  });

  return recoverySnapshotDrain;
}

/**
 * IndexedDB cannot be awaited from pagehide, but it can still mirror the
 * latest synchronous localStorage snapshot while the page is alive. Coalesce
 * repeated shot edits so a slow browser writes the newest state, not a noisy
 * queue of stale copies.
 */
function queueRecoverySnapshot(data: EmergencySaveData): void {
  const key = recoverySnapshotKey(data.roundId, data.playerId);
  const previous = queuedRecoverySnapshotOperations.at(-1);
  // Consecutive edits of the same round are safely coalesced, but a clear is
  // an ordering barrier: a later write must happen after that clear so a new
  // shot can never be erased by an older submit/delete cleanup.
  if (
    previous?.type === 'save'
    && recoverySnapshotKey(previous.data.roundId, previous.data.playerId) === key
  ) {
    previous.data = data;
  } else {
    queuedRecoverySnapshotOperations.push({ type: 'save', data });
  }
  void startRecoverySnapshotDrain();
}

function clearQueuedRecoverySnapshot(
  roundId: string | null | undefined,
  playerId: string,
): Promise<void> {
  queuedRecoverySnapshotOperations.push({ type: 'clear', roundId, playerId });
  return startRecoverySnapshotDrain().catch(() => {
    // The localStorage clear below is still authoritative when IndexedDB is
    // unavailable. Never surface a cache-cleanup failure to a golfer.
  });
}

function clearQueuedRecoverySnapshotThrough(
  roundId: string | null | undefined,
  playerId: string,
  acknowledgedTimestamp: number,
): void {
  queuedRecoverySnapshotOperations.push({
    type: 'clear-through',
    roundId,
    playerId,
    acknowledgedTimestamp,
  });
  void startRecoverySnapshotDrain();
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
  playerId: string,
  acknowledgedTimestamp: number,
): void {
  const current = loadEmergencySave(roundId, playerId);
  if (!current || current.timestamp <= acknowledgedTimestamp) {
    try {
      localStorage.removeItem(emergencySaveStorageKey(roundId, playerId));
    } catch {
      // A browser storage failure must not prevent the IndexedDB comparison
      // below from preserving any newer recovery copy.
    }
  }
  clearQueuedRecoverySnapshotThrough(roundId, playerId, acknowledgedTimestamp);
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
    const key = emergencySaveStorageKey(data.roundId, data.playerId);
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    // localStorage may be full or unavailable (private browsing) — try compacting
    try {
      // Remove old emergency saves to free space, then retry
      cleanupOldEmergencySaves();
      const key = emergencySaveStorageKey(data.roundId, data.playerId);
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
export function loadEmergencySave(
  roundId: string | null | undefined,
  playerId: string,
  options?: { allowLegacyServerSnapshot?: boolean },
): EmergencySaveData | null {
  try {
    const key = emergencySaveStorageKey(roundId, playerId);
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data) as EmergencySaveData;
    if (Number.isFinite(parsed.timestamp) && parsed.playerId === playerId) {
      return parsed;
    }

    // Backups made before player ownership was recorded can only be restored
    // after the server has verified that the signed-in player owns this exact
    // server round. That keeps pre-upgrade shots recoverable without exposing
    // an unowned shared-device draft in the general recovery flow.
    if (
      options?.allowLegacyServerSnapshot
      && roundId
      && parsed.roundId === roundId
      && Number.isFinite(parsed.timestamp)
      && !parsed.playerId
    ) {
      return { ...parsed, playerId };
    }
    // A shared browser profile may contain a valid recovery snapshot for a
    // different player. It is not this account's data, but it is still that
    // player's only local recovery copy, so never delete it while filtering.
    if (!Number.isFinite(parsed.timestamp)) localStorage.removeItem(key);
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
export function loadLatestEmergencySave(playerId: string): EmergencySaveData | null {
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

        // This browser can be used by more than one golfer. Hide another
        // account's snapshot without making that player's shots unrecoverable.
        if (parsed.playerId !== playerId) continue;

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
export function clearEmergencySave(
  roundId: string | null | undefined,
  playerId: string,
): void {
  void clearQueuedRecoverySnapshot(roundId, playerId);
  try {
    localStorage.removeItem(emergencySaveStorageKey(roundId, playerId));
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
