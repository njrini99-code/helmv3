// =============================================================================
// src/lib/baseball/lifting/live-set-offline-buffer.ts
//
// Offline-safe capture buffer for Live Weight Room set logging — the highest-
// frequency staff entry surface (a strength coach logs hundreds of sets across a
// 20-60 athlete floor, frequently in basements / metal-walled rooms where Wi-Fi
// drops mid-set). GolfHelm ships an IndexedDB + sync-engine so shot/round entry
// survives connectivity loss; this is the baseball analogue, scoped to the one
// surface where a dropped write loses real, hard-to-recreate work.
//
// WHY THIS EXISTS (the defect): LiveWeightRoom's optimistic write rolls the set
// OUT of local state the instant the server action rejects — and a flaky network
// IS a rejection. The coach sees a "did not save" toast, the row reverts, and the
// logged set is gone. There is no durable buffer to replay from on reconnect.
//
// DESIGN (mirrors the golf sync-engine's non-destructive principles):
//   * Durable      — entries live in localStorage, so a tab close / reload / lock
//                    can't lose them (survives the page freeze a fetch can't).
//   * Idempotent   — logSetResult upserts on (session_exercise_id, set_number),
//                    so replaying a buffered set is always safe; a server that
//                    already has it just no-ops.
//   * Non-destructive — a failed flush NEVER drops the entry. We bump a retry
//                    counter for backoff and keep it pending; only an explicit
//                    confirmed success removes it. (No delete-then-reinsert.)
//   * Backoff      — a persistently-failing entry isn't re-POSTed every tick;
//                    shouldRetry gates each attempt, and the budget is bounded.
//
// SSR-SAFE: every storage touch guards `typeof window`. Pure data layer — no
// React, no server imports — so it unit-tests in jsdom and ships in the client
// bundle only.
// =============================================================================

export interface BufferedLiveSet {
  /** Stable client id — also the React key + dedupe key for a queued entry. */
  id: string;
  sessionId: string;
  sessionExerciseId: string;
  setNumber: number;
  actualReps: number | null;
  actualLoad: number | null;
  loadUnit: string | null;
  rpe: number | null;
  /** Epoch ms the coach actually logged the set (preserved through replay). */
  queuedAt: number;
  /** Replay bookkeeping (backoff). */
  retryCount: number;
  /** ISO timestamp of the last failed flush attempt, or null if never tried. */
  lastAttemptAt: string | null;
}

/** Payload the buffer accepts — the durable bookkeeping fields are added here. */
export type LiveSetEntryInput = Omit<
  BufferedLiveSet,
  'id' | 'queuedAt' | 'retryCount' | 'lastAttemptAt'
>;

const STORAGE_KEY = 'baseball.liveWeightRoom.pendingSets.v1';

/** Stop hammering a permanently-failing entry after this many attempts. */
export const MAX_SET_RETRY_COUNT = 6;

/**
 * Exponential backoff (capped) between flush attempts for a single entry, so a
 * row the server keeps rejecting (e.g. a deleted session) can't be re-POSTed on
 * every reconnect/poll tick. Mirrors the golf sync-engine's shouldRetry contract.
 */
export function shouldRetrySet(entry: BufferedLiveSet, now = Date.now()): boolean {
  if (entry.retryCount >= MAX_SET_RETRY_COUNT) return false;
  if (entry.retryCount === 0 || !entry.lastAttemptAt) return true;
  const last = new Date(entry.lastAttemptAt).getTime();
  if (Number.isNaN(last)) return true;
  // 2s, 4s, 8s, 16s, 32s, capped at 60s.
  const delayMs = Math.min(2000 * 2 ** (entry.retryCount - 1), 60_000);
  return now - last >= delayMs;
}

function safeParse(raw: string | null): BufferedLiveSet[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop anything malformed rather than throwing on a corrupt key.
    return parsed.filter(
      (e): e is BufferedLiveSet =>
        Boolean(e) &&
        typeof e.id === 'string' &&
        typeof e.sessionId === 'string' &&
        typeof e.sessionExerciseId === 'string' &&
        typeof e.setNumber === 'number',
    );
  } catch {
    return [];
  }
}

/** Read the durable queue (empty + safe on SSR or a corrupt key). */
export function readPendingSets(): BufferedLiveSet[] {
  if (typeof window === 'undefined') return [];
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writePendingSets(entries: BufferedLiveSet[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Quota / private-mode failure — the in-memory optimistic state still holds
    // the set for THIS session; we just can't persist across a reload. Silent.
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `set_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a logged set durably. Idempotent on (sessionExerciseId, setNumber):
 * re-logging the same set (a correction) REPLACES the pending entry rather than
 * stacking a duplicate — matching the server's upsert key, so the buffer and the
 * server agree on what "this set" is. Returns the stored entry (incl. its id).
 */
export function enqueueSet(input: LiveSetEntryInput): BufferedLiveSet {
  const entries = readPendingSets();
  const existingIdx = entries.findIndex(
    (e) => e.sessionExerciseId === input.sessionExerciseId && e.setNumber === input.setNumber,
  );
  const existing = existingIdx >= 0 ? entries[existingIdx] : undefined;
  const entry: BufferedLiveSet = {
    ...input,
    id: existing ? existing.id : makeId(),
    queuedAt: Date.now(),
    retryCount: 0,
    lastAttemptAt: null,
  };
  if (existing) {
    entries[existingIdx] = entry;
  } else {
    entries.push(entry);
  }
  writePendingSets(entries);
  return entry;
}

/** Remove a single entry by id — the ONLY destructive op, gated on a confirmed
 * server success. Never called on a failed flush (that path is non-destructive). */
export function removeSet(id: string): void {
  const entries = readPendingSets();
  const next = entries.filter((e) => e.id !== id);
  if (next.length !== entries.length) writePendingSets(next);
}

/**
 * Record a failed flush attempt NON-DESTRUCTIVELY: bump the retry counter and
 * stamp the attempt time so backoff applies. The entry stays in the queue (it is
 * never dropped on failure) until either it flushes or the caller decides the
 * retry budget is exhausted (shouldRetrySet → false).
 */
export function recordSetFailure(id: string, now = new Date()): void {
  const entries = readPendingSets();
  let changed = false;
  for (const e of entries) {
    if (e.id === id) {
      e.retryCount += 1;
      e.lastAttemptAt = now.toISOString();
      changed = true;
    }
  }
  if (changed) writePendingSets(entries);
}

/** Count of sets waiting to reach the server (drives the offline indicator). */
export function pendingSetCount(): number {
  return readPendingSets().length;
}
