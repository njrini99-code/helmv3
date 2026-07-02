/**
 * Helm Bridge flood-collapse throttle (W15 Task 2 — Noise Charter N4).
 *
 * "A repeating error is ONE line with a count, never N rows." Emitters call
 * `shouldEmit(key)` before writing to admin_events; a tight loop hammering
 * the same (action, errorCode) pair collapses to at most one write per
 * `windowMs` (default 60s) per process, with `drainCollapsedCount(key)`
 * exposing how many were suppressed since the last allowed write so the
 * caller can attach `metadata.collapsed_count` to it.
 *
 * Per-process, best-effort — a serverless instance recycling resets the
 * map, which is exactly enough to stop a hot-path loop from flooding
 * admin_events within a single invocation's lifetime. NEVER throws.
 */

interface ThrottleEntry {
  /** Start of the current allow-window for this key. */
  windowStart: number;
  /** Emits suppressed since the last time shouldEmit(key) returned true. */
  collapsed: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const MAX_ENTRIES = 500;

const entries = new Map<string, ThrottleEntry>();

/** Re-inserts `key` so Map's insertion order doubles as LRU order. */
function touch(key: string, entry: ThrottleEntry): void {
  entries.delete(key);
  entries.set(key, entry);
}

function evictOldestIfOverCap(): void {
  while (entries.size > MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
  }
}

/**
 * Returns true iff `key` may emit right now (and opens a new allow-window).
 * Returns false — and increments the collapsed counter — when a prior emit
 * for this key is still inside its collapse window.
 */
export function shouldEmit(key: string, windowMs: number = DEFAULT_WINDOW_MS): boolean {
  try {
    const now = Date.now();
    const existing = entries.get(key);

    if (!existing || now - existing.windowStart >= windowMs) {
      // Open a new window. Preserve any collapsed count accumulated during
      // the PRIOR window — drainCollapsedCount() reads it right after this
      // call so the caller can report how many were suppressed leading up
      // to this allowed emit.
      touch(key, { windowStart: now, collapsed: existing?.collapsed ?? 0 });
      evictOldestIfOverCap();
      return true;
    }

    existing.collapsed += 1;
    touch(key, existing);
    return false;
  } catch {
    // Throttling must never block a real emit.
    return true;
  }
}

/**
 * Drains (reads then resets to 0) the number of emits collapsed leading up
 * to the most recent allowed emit for `key`. Call immediately after a
 * `shouldEmit(key)` that returned true.
 */
export function drainCollapsedCount(key: string): number {
  try {
    const existing = entries.get(key);
    if (!existing) return 0;
    const count = existing.collapsed;
    existing.collapsed = 0;
    return count;
  } catch {
    return 0;
  }
}

/** Test-only: clears all throttle state. */
export function __resetEmitThrottleForTests(): void {
  entries.clear();
}
