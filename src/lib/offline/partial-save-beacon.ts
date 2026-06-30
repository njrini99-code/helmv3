/**
 * Durable, unload-safe partial-round save.
 *
 * The shot-tracking screens call this from their `pagehide` /
 * `visibilitychange: hidden` handlers — the moments the app is backgrounded,
 * the phone is locked, or the tab is closing. A plain `void savePartialRound()`
 * server-action fetch is KILLED by the browser when the page freezes, so the
 * in-progress round silently never reaches the server and the player cannot
 * resume it (prod incident 2026-06-10).
 *
 * `navigator.sendBeacon` is the one transport the browser guarantees to deliver
 * during unload. We fall back to a `keepalive` fetch when sendBeacon is missing
 * or rejects the payload (both share a ~64KB cap; larger rounds are still
 * covered by the synchronous localStorage emergencySave the caller runs first).
 *
 * Returns true if the save was accepted into the browser's background queue.
 */
import type { PartialRoundData } from '@/lib/golf/partial-round.types';

export const PARTIAL_SAVE_BEACON_ENDPOINT = '/api/golf/rounds/partial-save';

export function beaconPartialSave(data: PartialRoundData, roundId?: string): boolean {
  if (typeof navigator === 'undefined') return false;

  let payload: string;
  try {
    payload = JSON.stringify({ data, roundId: roundId ?? null });
  } catch {
    return false;
  }

  // Primary: sendBeacon — guaranteed delivery during page freeze/unload.
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(PARTIAL_SAVE_BEACON_ENDPOINT, blob)) {
        return true;
      }
    }
  } catch {
    // fall through to keepalive fetch (e.g. payload exceeded the beacon cap)
  }

  // Fallback: keepalive fetch — also survives unload, same-origin cookies attach.
  try {
    if (typeof fetch === 'function') {
      void fetch(PARTIAL_SAVE_BEACON_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {
        /* unload-time network failure — localStorage emergencySave is the backstop */
      });
      return true;
    }
  } catch {
    // give up — the caller's synchronous localStorage save still holds the data
  }

  return false;
}
