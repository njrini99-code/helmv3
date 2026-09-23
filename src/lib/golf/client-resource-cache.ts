/**
 * Module-level stale-while-revalidate cache for client-fetched golf surfaces.
 *
 * Messages and Calendar used to refetch from zero on every mount: leave the
 * tab, come back, watch the skeleton again — "it loads separately each tab I
 * click" (2026-09-10). React state dies with the component; this Map lives for
 * the life of the page bundle, so a return visit paints the last known data
 * instantly and the hook refreshes it silently in the background.
 *
 * Deliberately tiny and dependency-free: a keyed Map with a write timestamp.
 * It is NOT a data layer — consumers still own their fetch, realtime and error
 * semantics; they only read a warm value on mount and write back on success.
 *
 * Entries are mirrored into sessionStorage (best-effort, versioned, size-
 * capped) so a hard reload or a Capacitor cold start also paints from the
 * last session instead of a blank rail. sessionStorage is per-tab; every
 * consumer keys its entries by (at minimum) the viewer's user id so one
 * account can never read another's row by key collision, and this module's
 * OWN safety net does not depend on that convention holding everywhere:
 * `clearAllCachedResources()` drops every entry unconditionally and MUST run
 * on every path that ends a golf session on a device that might be shared —
 * sign-out, session-idle timeout, anywhere else `supabase.auth.signOut()` is
 * called for a golf identity.
 *
 * Race: a fetch already in flight when `clearAllCachedResources()` runs can
 * still resolve afterwards and write a stale value back. `getCacheEpoch()` /
 * the epoch guard below closes that window — a caller captures the epoch
 * before starting an async fetch and skips the write if it has since moved.
 */

interface Entry<T> {
  data: T;
  /** `Date.now()` at write. */
  at: number;
}

const STORAGE_PREFIX = 'helm.golf.cache.v1:';
/** Above this a serialized entry is memory-only; sessionStorage quotas are ~5MB. */
const STORAGE_MAX_BYTES = 400_000;

const memory = new Map<string, Entry<unknown>>();

/**
 * Bumped by `clearAllCachedResources()`. A caller that wants to write the
 * result of an async fetch back into the cache should capture
 * `getCacheEpoch()` BEFORE starting the fetch and pass it to
 * `writeCachedResourceIfCurrent`; if a clear happened while the fetch was in
 * flight (sign-out mid-request), the epoch no longer matches and the stale
 * write is dropped instead of resurrecting a signed-out user's data.
 */
let epoch = 0;

export function getCacheEpoch(): number {
  return epoch;
}

function readStorage<T>(key: string): Entry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, entry: Entry<T>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > STORAGE_MAX_BYTES) return;
    window.sessionStorage.setItem(STORAGE_PREFIX + key, raw);
  } catch {
    // Quota / private mode / disabled storage — memory cache still works.
  }
}

/** Last known value for `key`, or `null` when nothing has been cached. */
export function readCachedResource<T>(key: string): { data: T; ageMs: number } | null {
  let entry = memory.get(key) as Entry<T> | undefined;
  if (!entry) {
    const stored = readStorage<T>(key);
    if (stored) {
      memory.set(key, stored);
      entry = stored;
    }
  }
  if (!entry) return null;
  return { data: entry.data, ageMs: Date.now() - entry.at };
}

export function writeCachedResource<T>(key: string, data: T): void {
  const entry: Entry<T> = { data, at: Date.now() };
  memory.set(key, entry);
  writeStorage(key, entry);
}

/**
 * Same as `writeCachedResource`, but no-ops when `asOfEpoch` (captured via
 * `getCacheEpoch()` before the caller's async fetch started) no longer
 * matches the current epoch — i.e. a sign-out cleared the cache while the
 * fetch was in flight. See the module comment.
 */
export function writeCachedResourceIfCurrent<T>(key: string, data: T, asOfEpoch: number): void {
  if (asOfEpoch !== epoch) return;
  writeCachedResource(key, data);
}

export function clearCachedResource(key: string): void {
  memory.delete(key);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Drop every entry — call on sign-out so no rows outlive the session. */
export function clearAllCachedResources(): void {
  epoch += 1;
  memory.clear();
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** Test-only: reset the in-memory map without touching storage. */
export function __resetCachedResourcesForTests(): void {
  memory.clear();
}
