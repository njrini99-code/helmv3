/**
 * Single source of truth for admin dashboard metrics.
 *
 * Every place that computes activation rate, D7 retention, WoW growth, or
 * median time-to-first-value must import from this module — otherwise the
 * Intelligence tab ends up showing two different numbers for the same metric
 * (header vs card, etc.). All callers in `admin-data.ts` and `admin-bi-data.ts`
 * route through these functions; future call sites should do the same.
 *
 * Conventions:
 * - Activation, retention, stickiness, etc. are returned as a *ratio* in [0, 1].
 *   Callers can multiply by 100 (or use Intl.NumberFormat) for display. Keeping
 *   them as ratios eliminates a class of "is this 0..1 or 0..100?" bugs.
 * - WoW growth is also returned as a ratio (0 means flat, 1 means +100%, -0.5
 *   means -50%). The ratio form is NaN-safe via guards on the denominator.
 * - TTFV is returned in days (Number, not rounded — callers round for display).
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export interface ComputeActivationArgs {
  /** Total signups in the population (denominator). */
  signups: number;
  /** Subset who completed activation criteria (numerator). */
  activated: number;
}

/**
 * Activation rate — fraction of signups who reached the activation milestone.
 * Returns a number in [0, 1]. Returns 0 (not NaN) if `signups` is 0.
 */
export function computeActivation(args: ComputeActivationArgs): number {
  const { signups, activated } = args;
  if (!Number.isFinite(signups) || signups <= 0) return 0;
  if (!Number.isFinite(activated) || activated <= 0) return 0;
  const ratio = activated / signups;
  if (!Number.isFinite(ratio)) return 0;
  // Clamp to [0, 1] — a higher ratio implies bad data (more activated than
  // signups, e.g. due to deleted-user race conditions); never report >100%.
  return Math.max(0, Math.min(1, ratio));
}

// ---------------------------------------------------------------------------
// D7 retention
// ---------------------------------------------------------------------------

export interface RoundForRetention {
  /** Stable id per user (player_id, user_id — caller's choice, must be consistent
   *  with the keys in `signupAt`). */
  player_id: string;
  /** ISO timestamp of the round. */
  created_at: string;
}

/**
 * D7 retention — fraction of users whose first round happened within the
 * first 7 days of signup AND who came back to record another round in the
 * 7–14 day window after signup.
 *
 * Returns a number in [0, 1]. Returns 0 if no eligible users (need at least
 * 14 days of history past signup).
 */
export function computeD7Retention(
  rounds: ReadonlyArray<RoundForRetention>,
  signupAt: ReadonlyMap<string, string>
): number {
  if (signupAt.size === 0) return 0;

  // Bucket round timestamps by player.
  const roundsByUser = new Map<string, number[]>();
  for (const r of rounds) {
    if (!r.player_id || !r.created_at) continue;
    const t = new Date(r.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const bucket = roundsByUser.get(r.player_id);
    if (bucket) bucket.push(t);
    else roundsByUser.set(r.player_id, [t]);
  }

  const now = Date.now();
  let eligible = 0;
  let retained = 0;

  for (const [playerId, signupIso] of signupAt) {
    const signupTs = new Date(signupIso).getTime();
    if (!Number.isFinite(signupTs)) continue;
    // Need at least 14 days of post-signup history to evaluate D7.
    if (now - signupTs < 14 * MS_PER_DAY) continue;

    const userRounds = roundsByUser.get(playerId);
    if (!userRounds || userRounds.length === 0) {
      eligible += 1;
      continue;
    }

    eligible += 1;
    let hasDay0to7 = false;
    let hasDay7to14 = false;
    for (const t of userRounds) {
      const delta = t - signupTs;
      if (delta < 0) continue;
      if (delta < 7 * MS_PER_DAY) hasDay0to7 = true;
      else if (delta < 14 * MS_PER_DAY) hasDay7to14 = true;
      if (hasDay0to7 && hasDay7to14) break;
    }
    if (hasDay0to7 && hasDay7to14) retained += 1;
  }

  if (eligible === 0) return 0;
  const ratio = retained / eligible;
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

// ---------------------------------------------------------------------------
// Week-over-week growth
// ---------------------------------------------------------------------------

/**
 * Week-over-week growth — `(thisWeek - lastWeek) / lastWeek`, returned as a
 * ratio. Returns 0 if both weeks are 0 (flat), 1 (+100%) if last week was 0
 * and this week is positive, and 0 if either input is non-finite.
 *
 * NaN-safe: never returns NaN or Infinity.
 */
export function computeWoWGrowth(thisWeek: number, lastWeek: number): number {
  if (!Number.isFinite(thisWeek) || !Number.isFinite(lastWeek)) return 0;
  if (lastWeek <= 0) {
    // From-zero growth: report +100% (1.0) if there was movement, else flat.
    return thisWeek > 0 ? 1 : 0;
  }
  const ratio = (thisWeek - lastWeek) / lastWeek;
  if (!Number.isFinite(ratio)) return 0;
  return ratio;
}

// ---------------------------------------------------------------------------
// Median time-to-first-value
// ---------------------------------------------------------------------------

export interface TTFVRecord {
  /** ISO timestamp the user signed up. */
  signupAt: string;
  /** ISO timestamp of the user's first value-bearing action (typically first
   *  completed round), or null if they never reached it. */
  firstValueAt: string | null;
}

/**
 * Median time-to-first-value, in days. Skips users who never reached first
 * value (firstValueAt === null) and users with bad timestamps.
 *
 * Returns 0 (not NaN) if the input has no usable rows.
 */
export function computeMedianTTFV(records: ReadonlyArray<TTFVRecord>): number {
  const days: number[] = [];
  for (const r of records) {
    if (!r.signupAt || !r.firstValueAt) continue;
    const signup = new Date(r.signupAt).getTime();
    const firstValue = new Date(r.firstValueAt).getTime();
    if (!Number.isFinite(signup) || !Number.isFinite(firstValue)) continue;
    if (firstValue < signup) continue;
    const delta = (firstValue - signup) / MS_PER_DAY;
    // Sanity guard: signups older than a year are likely backfilled / wrong.
    if (delta < 0 || delta > 365) continue;
    days.push(delta);
  }
  if (days.length === 0) return 0;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  if (days.length % 2 === 0) {
    const a = days[mid - 1] ?? 0;
    const b = days[mid] ?? 0;
    return (a + b) / 2;
  }
  return days[mid] ?? 0;
}
