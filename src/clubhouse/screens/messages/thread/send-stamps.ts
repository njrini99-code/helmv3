/**
 * When each of your messages began its send flight (useSendRise), so the receipt that arrives with the server's answer can
 * count its delay from the send (MOT-SEND-8) and a thread that merely opens, with receipts already there, never rises one.
 * Keyed by message id; a stamp is taken once and a stale one is dropped.
 */
const stamps = new Map<string, number>();

/** A send older than this is not "just sent": the receipt appears without the rise. */
export const SEND_STAMP_TTL_MS = 10_000;

export function stampSend(id: string, at: number = performance.now()): void {
  stamps.set(id, at);
  for (const [key, when] of stamps) if (at - when > SEND_STAMP_TTL_MS) stamps.delete(key);
}

/** The send time of a message sent a moment ago, once; null for any other. */
export function takeSendStamp(id: string, now: number = performance.now()): number | null {
  const at = stamps.get(id);
  if (at === undefined) return null;
  stamps.delete(id);
  return now - at > SEND_STAMP_TTL_MS ? null : at;
}
