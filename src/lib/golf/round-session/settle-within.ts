/**
 * Resolves with `fallback` when `work` has not settled within `ms` (or rejects), instead of waiting on it. The work keeps running and
 * its own effects still apply; only the caller stops waiting. For a step that sits inside the round's single-flight save lock and has
 * no client timeout of its own: a hung read there would hold every later save behind it.
 */
export function settleWithin<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** How long a save that met a conflict waits for the check that tells a self-caused one from a real one, inside the save lock. */
export const CONFLICT_CHECK_TIMEOUT_MS = 8_000;
