/**
 * Innings-pitched arithmetic (#434).
 *
 * Innings pitched are recorded in baseball's "outs" convention where the
 * fractional digit counts thirds of an inning (outs), NOT a base-10 fraction:
 *   6.0 → 6 innings, 6.1 → 6⅓ innings (19 outs), 6.2 → 6⅔ innings (20 outs).
 *
 * Adding these values with plain `+` is wrong: `6.1 + 6.2` yields `12.3`
 * instead of the correct `13.0` (39 outs). Convert to outs, add, convert back.
 * Rate stats (ERA/WHIP/K9) must divide by TRUE innings (outs / 3), not the
 * notation value, or the denominator is off whenever partial innings exist.
 */

/** Convert innings-pitched notation (6.2) into a whole out count (20). */
export function ipToOuts(ip: number | null | undefined): number {
  if (ip == null || !Number.isFinite(ip)) return 0;
  const whole = Math.trunc(ip);
  // The tenths digit is the out count (0, 1, or 2). Round to guard against
  // floating-point noise (e.g. 6.1 stored as 6.09999999).
  const outs = Math.round((ip - whole) * 10);
  return whole * 3 + outs;
}

/** Convert a whole out count (20) back into innings-pitched notation (6.2). */
export function outsToIp(outs: number): number {
  const innings = Math.floor(outs / 3);
  return innings + (outs % 3) / 10;
}

/** True decimal innings (6.2 → 6.6667), for ERA/WHIP/K9 rate math. */
export function ipToInnings(ip: number | null | undefined): number {
  return ipToOuts(ip) / 3;
}

/**
 * Sum innings-pitched values correctly via outs so partial innings add up in
 * baseball notation (e.g. `[6.1, 6.2]` → `13.0`).
 */
export function sumInningsPitched(ips: Array<number | null | undefined>): number {
  return outsToIp(ips.reduce<number>((acc, ip) => acc + ipToOuts(ip), 0));
}
