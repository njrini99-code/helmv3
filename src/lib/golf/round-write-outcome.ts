/**
 * Round writes whose outcome this device could not read.
 *
 * `save_partial_round_atomic` is an optimistic-locked, full-snapshot REPLACE:
 * a caller sends `expectedUpdatedAt` and the RPC rejects the write when the
 * row has moved past it. The client keeps the last `updated_at` it was TOLD
 * as that token. Two kinds of write bump the row without telling the client:
 *
 *   1. A background beacon (`sendBeacon` / keepalive fetch on pagehide or
 *      visibilitychange-hidden). The browser guarantees delivery, not a
 *      response.
 *   2. A foreground server-action fetch the browser killed mid-flight —
 *      iOS reports it as `TypeError: Load failed`, Chrome as `Failed to
 *      fetch`, a freeze as `AbortError`. The request may or may not have
 *      reached the server; when it did, the write landed and the response
 *      is simply gone.
 *
 * Either way the server's `updated_at` moves on, the client's token does
 * not, and the next status poll or save sees a mismatch that is
 * indistinguishable from a second device having written the round. Before
 * this module existed only (1) was tracked, as a boolean consumed by the
 * first apparent conflict — so a killed autosave, or a beacon that landed
 * after that first check, escalated to the permanent "updated on another
 * device — reload" write-block on a single phone (Hampden-Sydney,
 * 2026-09-15: every phone blocked during post-round stat entry, laptops
 * fine, because only phones lock/switch apps mid-entry).
 *
 * A pending unreadable write is a single flag: the next apparent staleness
 * after it was set is this device's own write, and the self-heal adopts the
 * server's CURRENT `updated_at` (re-read, or handed over by the poll) — so
 * it is exact however many unreadable writes landed in between. The beacon
 * deliberately carries no lock token: a beacon has no reader, and a lock
 * rejection would silently drop the last shots before a phone lock (the
 * 2026-06-10 lost-round failure mode) exactly when this device's token is
 * stale from its own earlier unreadable write.
 */

/**
 * Whether a rejected `savePartialRound` call has an UNKNOWN server outcome.
 *
 * A server action that threw on the server reaches the client as an `Error`
 * carrying Next's `digest` — the write rolled back, nothing landed. Only a
 * recognised transport loss counts as unreadable; an unrecognised throw
 * must NOT widen the B2 self-heal, which would forgive one genuine
 * multi-device conflict.
 */
export function isUnreadableWriteFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (typeof (error as { digest?: unknown }).digest === 'string') return false;
  // A page freeze aborts the fetch; a slow course connection times it out.
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  // fetch() rejects transport failures with a TypeError: Safari "Load
  // failed", Chrome "Failed to fetch", Firefox "NetworkError when
  // attempting to fetch resource.".
  if (error instanceof TypeError) return true;
  // Next.js server-action transport wording (a deployment transition mid
  // request, or the response stream cut off).
  return /unexpected response was received|connection closed|network/i.test(error.message);
}
