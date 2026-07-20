/**
 * Pure math for FunnelCard's five outreach-funnel bars
 * (Sent → Delivered → Opened → Clicked → Replied).
 *
 * Kept dependency-free and side-effect-free so it can be unit tested
 * without mounting the component.
 */

/**
 * Bar fill width as a percentage of `sent` (the funnel's top-of-stage
 * denominator), clamped to [0, 100].
 *
 * Clamping matters because Resend's image-proxy prefetch can register a
 * "click" for a recipient whose "open" pixel never fired (or vice versa
 * with tracking blockers), so a downstream stage's raw count can exceed
 * an upstream one — the bar must still read as "at most as full as Sent",
 * never overflow past 100%.
 */
export function widthPct(value: number, sent: number): number {
  if (!sent || sent <= 0) return 0;
  const pct = (value / sent) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

/**
 * Step-over-step conversion: `value` as a percentage of the previous
 * stage's count, rounded to the nearest integer. Returns null when there
 * is no previous stage (the first bar, Sent) or the previous stage's
 * count is 0 (division by zero / nothing to convert from).
 */
export function stepConversion(value: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return Math.round((value / previous) * 100);
}
