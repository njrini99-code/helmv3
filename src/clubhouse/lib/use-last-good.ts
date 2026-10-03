'use client';

import { useState } from 'react';

/**
 * Keeps the last good value of one thing (`key` names it: a qualifier, a round) while a refresh of it fails. A server render that
 * could not read what the screen already shows hands back a failed value; drawing it would replace good figures with an error, so the
 * screen draws the last good one instead and says it may be out of date (`stale`), with the failure's own retry beside it.
 *
 * Nothing is kept across keys, and a value that was never good is returned as it came: a first load that fails is an error, not an
 * old figure. `ok` says whether a value is good (its reads all landed). It must be a pure function of the value.
 */
export function useLastGood<T>(key: string, value: T, ok: (v: T) => boolean): { value: T; stale: boolean } {
  const good = ok(value);
  const [kept, setKept] = useState<{ key: string; value: T } | null>(good ? { key, value } : null);
  // Derived state, set during render (React re-renders at once): the newest good value of this key.
  if (good && (kept?.key !== key || kept.value !== value)) setKept({ key, value });
  if (good) return { value, stale: false };
  if (kept && kept.key === key) return { value: kept.value, stale: true };
  return { value, stale: false };
}
