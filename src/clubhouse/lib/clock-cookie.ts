/**
 * The cookie that remembers the clock a device reads times in ("12" or "24"), so the server draws a 24-hour device's
 * first frame in 24 hours and a time never flips after hydration. A plain module for the same reason as
 * phone-cookie.ts: the server reads it in phone-hint.ts and the client writes it in use-clock.tsx, and a constant
 * exported from a 'use client' module is a client reference on the server, not the string.
 */
export const CH_CLOCK_COOKIE = 'ch_clock';

/** How times are written: "3:30 PM" (12) or "15:30" (24). Display only: every stored time is 24-hour, in the team's zone. */
export type ChClock = '12' | '24';

/** The app's voice is 12-hour, so anything that is not exactly "24" reads as it always has. */
export function parseChClock(value: string | null | undefined): ChClock {
  return value === '24' ? '24' : '12';
}
