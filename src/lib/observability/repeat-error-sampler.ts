/**
 * Client-side sampling for repeated errors (production audit 2026-11-15, MAC-12: the Sentry tunnel answered 429 on
 * Drills). A page that throws the same error on every render, poll or retry sent one event each time, and Sentry rate
 * limited the whole tunnel, so the reports that mattered were dropped with the noise.
 *
 * Within one page load (one document: a client navigation keeps the count), the first `perKey` events of an error are
 * sent and the rest are dropped; past `total` error events nothing more is sent until the next load. Sentry's own
 * dedupe drops only an event identical to the one just before it, so an error that alternates with another, or repeats
 * with a different count in its text, still went through every time.
 *
 * The key is the error's type and text with every run of digits made one `#` ("Row 12 failed" and "Row 13 failed" are
 * one error), or the message of a message event. It never sends anything: the caller drops what `keep` refuses.
 */

/** How many events of one error a page load sends. */
export const REPEAT_ERROR_PER_KEY = 3;
/** How many error events a page load sends in all. */
export const REPEAT_ERROR_TOTAL = 30;

export interface RepeatSampledEvent {
  message?: string | undefined;
  exception?: { values?: Array<{ type?: string | undefined; value?: string | undefined }> | undefined } | undefined;
}

/** The error an event reports, with the digits that vary between repeats folded away; null when it names none. */
export function repeatErrorKey(event: RepeatSampledEvent): string | null {
  const ex = event.exception?.values?.[0];
  const raw = ex ? `${ex.type ?? 'Error'}: ${ex.value ?? ''}` : (event.message ?? '');
  const key = raw.replace(/\d+/g, '#').trim();
  return key ? key.slice(0, 300) : null;
}

export interface RepeatErrorSampler {
  /** Whether this event should be sent; counts it when it is. */
  keep(event: RepeatSampledEvent): boolean;
}

export function createRepeatErrorSampler({ perKey = REPEAT_ERROR_PER_KEY, total = REPEAT_ERROR_TOTAL } = {}): RepeatErrorSampler {
  const seen = new Map<string, number>();
  let sent = 0;
  return {
    keep(event) {
      if (sent >= total) return false;
      const key = repeatErrorKey(event);
      if (key !== null) {
        const n = seen.get(key) ?? 0;
        if (n >= perKey) return false;
        seen.set(key, n + 1);
      }
      sent += 1;
      return true;
    },
  };
}
